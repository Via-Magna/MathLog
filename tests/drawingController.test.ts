import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDrawingController } from '../src/components/Canvas/drawingController';
import { useAppStore } from '../src/store/useAppStore';
import { canvasHarness, pointer } from './canvasHarness';

let foreground: ReturnType<typeof canvasHarness>;
let background: ReturnType<typeof canvasHarness>;
let controller: ReturnType<typeof createDrawingController>;
let frames: Map<number, FrameRequestCallback>;

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState(), true);
  frames = new Map();
  let nextFrame = 0;
  vi.stubGlobal('Path2D', class {});
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => frames.delete(id)));
  foreground = canvasHarness();
  background = canvasHarness();
  controller = createDrawingController({
    foreground: foreground.canvas, foregroundContext: foreground.ctx,
    background: background.canvas, backgroundContext: background.ctx,
  });
});

afterEach(() => {
  controller.dispose();
  vi.unstubAllGlobals();
});

describe('pointer gesture regressions', () => {
  it('stores logical coordinates and includes the release point', () => {
    controller.pointerdown(pointer());
    controller.pointermove(pointer({ clientX: 90, clientY: 50 }));
    controller.pointerup(pointer({ clientX: 100, clientY: 60, pressure: 0 }));
    expect(useAppStore.getState().strokes[0].points).toEqual([
      { x: 20, y: 30, pressure: 0.5 }, { x: 30, y: 40, pressure: 0.5 }, { x: 40, y: 50, pressure: 0.5 },
    ]);
    expect(frames.size).toBe(0);
    expect(foreground.captured.size).toBe(0);
  });

  it('keeps a tap as a single point rather than adding a duplicate release', () => {
    controller.pointerdown(pointer());
    controller.pointerup(pointer());
    expect(useAppStore.getState().strokes[0].points).toHaveLength(1);
  });

  it('captures pen settings until release even when settings change mid-gesture', () => {
    controller.pointerdown(pointer());
    useAppStore.setState({ selectedTool: 'eraser', strokeWidth: 9, strokeColor: '#f00' });
    controller.pointerup(pointer());
    expect(useAppStore.getState().strokes[0]).toMatchObject({ isEraser: false, width: 3, color: '#1a1a2e' });
  });

  it('finishes an eraser gesture after switching to pen and restores the background', () => {
    useAppStore.getState().setTool('eraser');
    controller.pointerdown(pointer());
    expect(background.element.style.opacity).toBe('0');
    useAppStore.getState().setTool('pen');
    const [frameId, callback] = [...frames.entries()][0];
    frames.delete(frameId);
    callback(0);
    expect(background.element.style.opacity).toBe('0');
    controller.pointerup(pointer());
    expect(useAppStore.getState().strokes[0].isEraser).toBe(true);
    expect(background.element.style.opacity).toBe('1');
  });

  it('ignores a second pointer across down, move, up, cancel, and capture loss', () => {
    controller.pointerdown(pointer());
    const other = pointer({ pointerId: 2, clientX: 300 });
    controller.pointerdown(other);
    controller.pointermove(other);
    controller.pointerup(other);
    controller.pointercancel(other);
    controller.lostpointercapture(other);
    expect(useAppStore.getState().strokes).toHaveLength(0);
    expect(foreground.element.setPointerCapture).toHaveBeenCalledTimes(1);
    controller.pointerup(pointer());
    expect(useAppStore.getState().strokes[0].points).toEqual([{ x: 20, y: 30, pressure: 0.5 }]);
  });

  it.each([{ button: 1 }, { button: 2 }, { isPrimary: false }])('ignores unsupported starts: %j', (event) => {
    controller.pointerdown(pointer(event));
    expect(foreground.element.setPointerCapture).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
  });

  it.each(['pointercancel', 'lostpointercapture', 'dispose'] as const)('%s discards active erasure and cleans up', (action) => {
    useAppStore.getState().setTool('eraser');
    controller.pointerdown(pointer());
    controller[action](pointer());
    expect(background.element.style.opacity).toBe('1');
    expect(frames.size).toBe(0);
    expect(foreground.captured.size).toBe(0);
    expect(useAppStore.getState().strokes).toHaveLength(0);
    expect(useAppStore.getState().undoStack).toHaveLength(0);
    useAppStore.getState().setTool('pen');
    controller.pointerdown(pointer({ pointerId: 3 }));
    controller.pointerup(pointer({ pointerId: 3 }));
    expect(useAppStore.getState().strokes).toHaveLength(1);
  });

  it('commits once even when release is followed by lost capture and another release', () => {
    controller.pointerdown(pointer());
    controller.pointerup(pointer());
    controller.lostpointercapture(pointer());
    controller.pointerup(pointer());
    expect(useAppStore.getState().strokes).toHaveLength(1);
    expect(useAppStore.getState().undoStack).toHaveLength(1);
  });

  it('preserves actual pen pressure, including zero', () => {
    controller.pointerdown(pointer({ pointerType: 'pen', pressure: 0 }));
    controller.pointermove(pointer({ pointerType: 'pen', pressure: 0.8, clientX: 90 }));
    controller.pointerup(pointer({ pointerType: 'pen', pressure: 0, clientX: 100 }));
    expect(useAppStore.getState().strokes[0].points.map((point) => point.pressure)).toEqual([0, 0.8, 0.8]);
  });

  it('records a whole erase gesture as one undoable action', () => {
    controller.pointerdown(pointer());
    controller.pointerup(pointer());
    const ink = useAppStore.getState().strokes[0];
    useAppStore.getState().setTool('eraser');
    controller.pointerdown(pointer());
    controller.pointermove(pointer({ clientX: 100 }));
    controller.pointerup(pointer({ clientX: 110 }));
    expect(useAppStore.getState().undoStack).toHaveLength(2);
    useAppStore.getState().undo();
    expect(useAppStore.getState().strokes).toEqual([ink]);
    useAppStore.getState().redo();
    expect(useAppStore.getState().strokes[1].isEraser).toBe(true);
  });
});
