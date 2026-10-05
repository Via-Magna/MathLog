import { useRef, useCallback, useEffect } from 'react';
import type { Point, Stroke } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { renderActiveStroke } from './strokeRenderer';
import { hitTestStroke } from '../../utils/geometry';

interface UseDrawingProps {
  fgCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  fgCtxRef: React.MutableRefObject<CanvasRenderingContext2D | null>;
}

/**
 * Hook that manages the drawing/erasing interaction on the foreground canvas.
 * Handles pointer events, the requestAnimationFrame loop, and stroke finalization.
 */
export function useDrawing({ fgCanvasRef, fgCtxRef }: UseDrawingProps) {
  // Refs for tracking the current drawing state (no re-renders needed)
  const isDrawingRef = useRef(false);
  const currentPointsRef = useRef<Point[]>([]);
  const rafIdRef = useRef<number | null>(null);

  // Render the active stroke on the foreground canvas via rAF
  const scheduleRender = useCallback(function scheduleRender() {
    rafIdRef.current = requestAnimationFrame(() => {
      const fgCtx = fgCtxRef.current;
      const fgCanvas = fgCanvasRef.current;
      if (!fgCtx || !fgCanvas) return;

      const { strokeColor, strokeWidth } = useAppStore.getState();
      const inputPoints = currentPointsRef.current.map((p) => [
        p.x,
        p.y,
        p.pressure,
      ] as [number, number, number]);

      renderActiveStroke(fgCtx, fgCanvas, inputPoints, strokeColor, strokeWidth);

      if (isDrawingRef.current) {
        scheduleRender();
      }
    });
  }, [fgCanvasRef, fgCtxRef]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const { selectedTool } = useAppStore.getState();
      const canvas = fgCanvasRef.current;
      if (!canvas) return;

      // Capture the pointer so events are delivered even outside the canvas
      canvas.setPointerCapture(e.pointerId);

      if (selectedTool === 'pen') {
        isDrawingRef.current = true;
        currentPointsRef.current = [
          {
            x: e.nativeEvent.offsetX,
            y: e.nativeEvent.offsetY,
            pressure: e.pressure || 0.5,
          },
        ];
        scheduleRender();
      } else if (selectedTool === 'eraser') {
        isDrawingRef.current = true;
        // Try to erase at the initial touch point
        const { strokes, removeStroke } = useAppStore.getState();
        const px = e.nativeEvent.offsetX;
        const py = e.nativeEvent.offsetY;
        for (const stroke of strokes) {
          if (hitTestStroke(px, py, stroke)) {
            removeStroke(stroke.id);
            break;
          }
        }
      }
    },
    [fgCanvasRef, scheduleRender]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawingRef.current) return;

      const { selectedTool } = useAppStore.getState();

      if (selectedTool === 'pen') {
        // Just collect the point — rendering happens in rAF
        currentPointsRef.current.push({
          x: e.nativeEvent.offsetX,
          y: e.nativeEvent.offsetY,
          pressure: e.pressure || 0.5,
        });
      } else if (selectedTool === 'eraser') {
        // Check for stroke hits while the eraser is moving
        const { strokes, removeStroke } = useAppStore.getState();
        const px = e.nativeEvent.offsetX;
        const py = e.nativeEvent.offsetY;
        for (const stroke of strokes) {
          if (hitTestStroke(px, py, stroke)) {
            removeStroke(stroke.id);
            break;
          }
        }
      }
    },
    []
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawingRef.current) return;
      isDrawingRef.current = false;

      const { selectedTool } = useAppStore.getState();

      if (selectedTool === 'pen' && currentPointsRef.current.length > 0) {
        // Cancel the rAF loop
        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }

        // Clear the foreground canvas
        const fgCtx = fgCtxRef.current;
        const fgCanvas = fgCanvasRef.current;
        if (fgCtx && fgCanvas) {
          fgCtx.clearRect(0, 0, fgCanvas.width, fgCanvas.height);
        }

        // Create and commit the Stroke object
        const { strokeColor, strokeWidth, addStroke } = useAppStore.getState();
        const newStroke: Stroke = {
          id: crypto.randomUUID(),
          points: currentPointsRef.current,
          color: strokeColor,
          width: strokeWidth,
          createdAt: Date.now(),
        };
        addStroke(newStroke);

        // Reset
        currentPointsRef.current = [];
      }

      // Release pointer capture
      const canvas = fgCanvasRef.current;
      if (canvas) {
        canvas.releasePointerCapture(e.pointerId);
      }
    },
    [fgCanvasRef, fgCtxRef]
  );

  // Cleanup rAF on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  };
}
