import { afterEach, describe, expect, it, vi } from 'vitest';
import { sizeLayer, watchDevicePixelRatio } from '../src/components/Canvas/canvasLayer';

function fakeCanvas(withContext = true) {
  const ctx = { setTransform: vi.fn() };
  const canvas = {
    width: 300,
    height: 150,
    style: { width: '', height: '' },
    getContext: vi.fn(() => (withContext ? ctx : null)),
  };
  return { canvas, ctx, el: canvas as unknown as HTMLCanvasElement };
}

describe('sizeLayer', () => {
  it('sets CSS size, a device-pixel bitmap and a dpr transform', () => {
    const { canvas, ctx, el } = fakeCanvas();
    expect(sizeLayer(el, 400, 300, 2)).toBe(ctx);
    expect(canvas.style).toEqual({ width: '400px', height: '300px' });
    expect([canvas.width, canvas.height]).toEqual([800, 600]);
    expect(ctx.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
  });

  it('rounds fractional bitmap sizes and never goes below 1 px', () => {
    const { canvas, el } = fakeCanvas();
    sizeLayer(el, 100.4, 0, 1.5);
    expect([canvas.width, canvas.height]).toEqual([151, 1]);
  });

  it('returns null when no 2D context is available', () => {
    expect(sizeLayer(fakeCanvas(false).el, 10, 10, 1)).toBeNull();
  });
});

describe('watchDevicePixelRatio', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubWindow(dpr: number) {
    const queries: { media: string; fire: () => void; removed: boolean }[] = [];
    const win = {
      devicePixelRatio: dpr,
      matchMedia: (media: string) => {
        let listener: (() => void) | null = null;
        const q = {
          media,
          removed: false,
          fire: () => listener?.(),
        };
        queries.push(q);
        return {
          addEventListener: (_: string, fn: () => void) => { listener = fn; },
          removeEventListener: () => { q.removed = true; listener = null; },
        };
      },
    };
    vi.stubGlobal('window', win);
    return { win, queries };
  }

  it('fires on a resolution change and re-arms for the new ratio', () => {
    const { win, queries } = stubWindow(1);
    const onChange = vi.fn();
    const stop = watchDevicePixelRatio(onChange);
    expect(queries[0].media).toBe('(resolution: 1dppx)');

    win.devicePixelRatio = 2;
    queries[0].fire();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(queries[1].media).toBe('(resolution: 2dppx)');

    stop();
    expect(queries[1].removed).toBe(true);
  });

  it('is a no-op without matchMedia', () => {
    vi.stubGlobal('window', {});
    expect(() => watchDevicePixelRatio(vi.fn())()).not.toThrow();
  });
});
