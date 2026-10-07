/**
 * Sizes one canvas layer for HiDPI: CSS size in logical px, bitmap in device px,
 * and a context scaled by `dpr` so callers draw in CSS px. Resizing a canvas
 * clears it and resets its transform, so the caller must redraw afterwards.
 */
export function sizeLayer(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  dpr: number
): CanvasRenderingContext2D | null {
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  // Integer bitmap sizes: a fractional size is truncated and would blur the last row.
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

/**
 * Calls `onChange` whenever `devicePixelRatio` changes (browser zoom, or the
 * window moving to another monitor). ResizeObserver misses these when the CSS
 * size stays the same. Returns an unsubscribe function.
 */
export function watchDevicePixelRatio(onChange: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  let query: MediaQueryList | null = null;
  const listen = () => {
    query = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    query.addEventListener('change', handle, { once: true });
  };
  const handle = () => {
    listen();
    onChange();
  };
  listen();
  return () => query?.removeEventListener('change', handle);
}
