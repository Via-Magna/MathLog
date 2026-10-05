import { useRef, useEffect, useCallback } from 'react';

interface CanvasRefs {
  containerRef: React.RefObject<HTMLDivElement | null>;
  bgCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  fgCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  bgCtxRef: React.MutableRefObject<CanvasRenderingContext2D | null>;
  fgCtxRef: React.MutableRefObject<CanvasRenderingContext2D | null>;
}

/**
 * Hook that sets up the double-buffered canvas with HiDPI scaling
 * and a ResizeObserver for responsive resizing.
 *
 * @param onResize - Callback fired after canvas resize (to trigger a full redraw).
 *                   Stored in a ref so callers don't need to memoize it.
 */
export function useCanvasSetup(onResize: () => void): CanvasRefs {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bgCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const fgCtxRef = useRef<CanvasRenderingContext2D | null>(null);

  // Store onResize in a ref so it's always current without causing re-effects
  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;

  const applyDpiScaling = useCallback(() => {
    const container = containerRef.current;
    const bgCanvas = bgCanvasRef.current;
    const fgCanvas = fgCanvasRef.current;
    if (!container || !bgCanvas || !fgCanvas) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    // Set CSS display size
    bgCanvas.style.width = `${width}px`;
    bgCanvas.style.height = `${height}px`;
    fgCanvas.style.width = `${width}px`;
    fgCanvas.style.height = `${height}px`;

    // Set internal bitmap size (scaled for HiDPI)
    bgCanvas.width = width * dpr;
    bgCanvas.height = height * dpr;
    fgCanvas.width = width * dpr;
    fgCanvas.height = height * dpr;

    // Get contexts and apply DPR scaling
    const bgCtx = bgCanvas.getContext('2d');
    const fgCtx = fgCanvas.getContext('2d');

    if (bgCtx) {
      bgCtx.scale(dpr, dpr);
      bgCtxRef.current = bgCtx;
    }

    if (fgCtx) {
      fgCtx.scale(dpr, dpr);
      fgCtxRef.current = fgCtx;
    }

    onResizeRef.current();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Initial setup
    applyDpiScaling();

    // Watch for container size changes
    const resizeObserver = new ResizeObserver(() => {
      applyDpiScaling();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [applyDpiScaling]);

  return {
    containerRef,
    bgCanvasRef,
    fgCanvasRef,
    bgCtxRef,
    fgCtxRef,
  };
}
