import { useRef, useCallback, useEffect } from 'react';
import type { Point, Stroke } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { clearCanvasLayer, renderActiveStroke, renderAllStrokes } from './strokeRenderer';

interface UseDrawingProps {
  fgCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  fgCtxRef: React.RefObject<CanvasRenderingContext2D | null>;
  bgCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  bgCtxRef: React.RefObject<CanvasRenderingContext2D | null>;
}

export function useDrawing({ fgCanvasRef, fgCtxRef, bgCanvasRef, bgCtxRef }: UseDrawingProps) {
  const isDrawingRef = useRef(false);
  const currentPointsRef = useRef<Point[]>([]);
  const rafIdRef = useRef<number | null>(null);

  const scheduleRender = useCallback(function scheduleRender() {
    const foreground = fgCanvasRef.current;
    const background = bgCanvasRef.current;
    const context = fgCtxRef.current;
    if (!foreground || !background || !context) return;
    const { selectedTool, strokeColor, strokeWidth } = useAppStore.getState();
    const stroke: Stroke = {
      id: 'active', points: currentPointsRef.current, color: strokeColor,
      width: strokeWidth, createdAt: 0, isEraser: selectedTool === 'eraser',
    };
    renderActiveStroke(context, foreground, stroke, background);
    background.style.opacity = stroke.isEraser ? '0' : '1';
    if (isDrawingRef.current) rafIdRef.current = requestAnimationFrame(scheduleRender);
  }, [fgCanvasRef, fgCtxRef, bgCanvasRef]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = fgCanvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    isDrawingRef.current = true;
    currentPointsRef.current = [{ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, pressure: e.pressure || 0.5 }];
    scheduleRender();
  }, [fgCanvasRef, scheduleRender]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    currentPointsRef.current.push({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, pressure: e.pressure || 0.5 });
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = null;
    const { selectedTool, strokeColor, strokeWidth, addStroke } = useAppStore.getState();
    if (currentPointsRef.current.length > 0) {
      addStroke({
        id: crypto.randomUUID(), points: currentPointsRef.current, color: strokeColor,
        width: strokeWidth, createdAt: Date.now(), isEraser: selectedTool === 'eraser',
      });
    }
    currentPointsRef.current = [];
    const background = bgCanvasRef.current;
    if (background && bgCtxRef.current) {
      renderAllStrokes(bgCtxRef.current, background, useAppStore.getState().strokes);
      background.style.opacity = '1';
    }
    if (fgCtxRef.current && fgCanvasRef.current) clearCanvasLayer(fgCtxRef.current, fgCanvasRef.current);
    if (fgCanvasRef.current?.hasPointerCapture(e.pointerId)) fgCanvasRef.current.releasePointerCapture(e.pointerId);
  }, [fgCanvasRef, fgCtxRef, bgCanvasRef, bgCtxRef]);

  useEffect(() => () => {
    if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
  }, []);

  return { handlePointerDown, handlePointerMove, handlePointerUp };
}
