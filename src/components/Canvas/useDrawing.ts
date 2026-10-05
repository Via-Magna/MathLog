import { useEffect } from 'react';
import type { RefObject } from 'react';
import { createDrawingController } from './drawingController';

interface UseDrawingProps {
  fgCanvasRef: RefObject<HTMLCanvasElement | null>;
  fgCtxRef: RefObject<CanvasRenderingContext2D | null>;
  bgCanvasRef: RefObject<HTMLCanvasElement | null>;
  bgCtxRef: RefObject<CanvasRenderingContext2D | null>;
}

export function useDrawing({ fgCanvasRef, fgCtxRef, bgCanvasRef, bgCtxRef }: UseDrawingProps) {
  useEffect(() => {
    const foreground = fgCanvasRef.current;
    const background = bgCanvasRef.current;
    const foregroundContext = fgCtxRef.current;
    const backgroundContext = bgCtxRef.current;
    if (!foreground || !background || !foregroundContext || !backgroundContext) return;

    const controller = createDrawingController({ foreground, background, foregroundContext, backgroundContext });
    const events = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture'] as const;
    for (const event of events) foreground.addEventListener(event, controller[event]);
    return () => {
      for (const event of events) foreground.removeEventListener(event, controller[event]);
      controller.dispose();
    };
  }, [fgCanvasRef, fgCtxRef, bgCanvasRef, bgCtxRef]);
}
