import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCanvasLayer, renderActiveStroke, renderAllStrokes, renderGridLines, renderStroke } from '../src/components/Canvas/strokeRenderer';
import type { Stroke } from '../src/types';
import { canvasHarness } from './canvasHarness';

const ink: Stroke = {
  id: 'ink', points: [{ x: 20, y: 30, pressure: 0.5 }], color: '#123456', width: 3, createdAt: 0,
};

beforeEach(() => vi.stubGlobal('Path2D', class {}));
afterEach(() => vi.unstubAllGlobals());

describe('canvas rendering regressions', () => {
  it('clears the physical bitmap once before copying ink and erasing the preview', () => {
    const foreground = canvasHarness();
    const background = canvasHarness();
    renderActiveStroke(foreground.ctx, foreground.canvas, { ...ink, isEraser: true }, background.canvas);
    expect(foreground.calls.map((call) => call.name)).toEqual(['clear', 'copy', 'fill']);
    expect(foreground.calls[0].scale).toEqual([1, 1]);
    expect(foreground.calls[1].scale).toEqual([1, 1]);
    expect(foreground.calls[2]).toMatchObject({ composite: 'destination-out', scale: [2, 2] });
    expect(foreground.context.globalCompositeOperation).toBe('source-over');
  });

  it('keeps active pen ink on a transparent foreground without copying the background', () => {
    const layer = canvasHarness();
    renderActiveStroke(layer.ctx, layer.canvas, ink, canvasHarness().canvas);
    expect(layer.calls.map((call) => call.name)).toEqual(['clear', 'fill']);
    expect(layer.calls[1].composite).toBe('source-over');
  });

  it.each([1, 3, 10])('uses the width-%i eraser radius for a tap and diameter for a path', (width) => {
    const layer = canvasHarness();
    renderStroke(layer.ctx, { ...ink, width, isEraser: true });
    expect(layer.context.arc).toHaveBeenCalledWith(20, 30, width, 0, Math.PI * 2);
    renderStroke(layer.ctx, { ...ink, width, isEraser: true, points: [...ink.points, { x: 40, y: 50, pressure: 0.9 }] });
    expect(layer.context.lineWidth).toBe(width * 2);
    expect(layer.context.lineCap).toBe('round');
    expect(layer.context.lineJoin).toBe('round');
    expect(layer.calls.at(-1)?.composite).toBe('destination-out');
  });

  it('replays ink, erasure, then new ink in order without erasing paper', () => {
    const layer = canvasHarness();
    renderAllStrokes(layer.ctx, layer.canvas, [ink, { ...ink, isEraser: true }, ink]);
    expect(layer.calls.map((call) => call.composite)).toEqual([
      'source-over', 'source-over', 'destination-out', 'source-over',
    ]);
    expect(layer.context.fillRect).not.toHaveBeenCalled();
  });

  it('restores HiDPI scaling after clearing', () => {
    const layer = canvasHarness();
    clearCanvasLayer(layer.ctx, layer.canvas);
    expect(layer.context.clearRect).toHaveBeenCalledWith(0, 0, 800, 600);
    expect(layer.context.getTransform()).toEqual({ a: 2, d: 2 });
  });

  it('draws ruled lines across actual logical dimensions, including beyond 4000px', () => {
    const layer = canvasHarness();
    layer.canvas.width = 10000;
    layer.canvas.height = 9000;
    renderGridLines(layer.ctx, layer.canvas, '#fff', true);
    expect(layer.context.lineTo).toHaveBeenLastCalledWith(5000, 4470);
    expect(layer.context.lineTo).toHaveBeenCalledTimes(149);
  });

  it('renders plain paper without ruled lines when disabled', () => {
    const layer = canvasHarness();
    renderGridLines(layer.ctx, layer.canvas, '#fff', false);
    expect(layer.calls.map((call) => call.name)).toEqual(['clear', 'background']);
    expect(layer.context.stroke).not.toHaveBeenCalled();
  });
});
