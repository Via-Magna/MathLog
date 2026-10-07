import { useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { sizeLayer, watchDevicePixelRatio } from './canvasLayer';

interface CanvasRefs {
  containerRef: React.RefObject<HTMLDivElement | null>;
  linesCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  bgCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  answerCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  fgCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  linesCtxRef: React.MutableRefObject<CanvasRenderingContext2D | null>;
  bgCtxRef: React.MutableRefObject<CanvasRenderingContext2D | null>;
  answerCtxRef: React.MutableRefObject<CanvasRenderingContext2D | null>;
  fgCtxRef: React.MutableRefObject<CanvasRenderingContext2D | null>;
}

/**
 * Hook that sets up the four canvas layers (lines, ink, answers, active stroke)
 * with HiDPI scaling, a ResizeObserver and a devicePixelRatio watcher.
 *
 * @param onResize - Callback fired after canvas resize (to trigger a full redraw).
 *                   Stored in a ref so callers don't need to memoize it.
 */
export function useCanvasSetup(onResize: (refs: CanvasRefs) => void): CanvasRefs {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const linesCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const answerCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const linesCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const bgCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const answerCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const fgCtxRef = useRef<CanvasRenderingContext2D | null>(null);

  // Store onResize in a ref so it's always current without causing re-effects
  const onResizeRef = useRef(onResize);
  useLayoutEffect(() => {
    onResizeRef.current = onResize;
  }, [onResize]);

  const applyDpiScaling = useCallback(() => {
    const container = containerRef.current;
    const layers = [
      [linesCanvasRef, linesCtxRef],
      [bgCanvasRef, bgCtxRef],
      [answerCanvasRef, answerCtxRef],
      [fgCanvasRef, fgCtxRef],
    ] as const;
    if (!container || layers.some(([canvasRef]) => !canvasRef.current)) return;

    const dpr = window.devicePixelRatio || 1;
    const { width, height } = container.getBoundingClientRect();
    for (const [canvasRef, ctxRef] of layers) {
      const ctx = sizeLayer(canvasRef.current!, width, height, dpr);
      if (ctx) ctxRef.current = ctx;
    }

    onResizeRef.current({
      containerRef,
      linesCanvasRef,
      bgCanvasRef,
      answerCanvasRef,
      fgCanvasRef,
      linesCtxRef,
      bgCtxRef,
      answerCtxRef,
      fgCtxRef,
    });
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Initial setup
    applyDpiScaling();

    // Watch for container size changes and for zoom / monitor changes
    const resizeObserver = new ResizeObserver(() => {
      applyDpiScaling();
    });
    resizeObserver.observe(container);
    const unwatchDpr = watchDevicePixelRatio(applyDpiScaling);

    return () => {
      resizeObserver.disconnect();
      unwatchDpr();
    };
  }, [applyDpiScaling]);

  return {
    containerRef,
    linesCanvasRef,
    bgCanvasRef,
    answerCanvasRef,
    fgCanvasRef,
    linesCtxRef,
    bgCtxRef,
    answerCtxRef,
    fgCtxRef,
  };
}
