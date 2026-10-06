import type { Point, Stroke } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { clearCanvasLayer, renderActiveStroke, renderAllStrokes } from './strokeRenderer';

interface DrawingLayers {
  foreground: HTMLCanvasElement;
  background: HTMLCanvasElement;
  foregroundContext: CanvasRenderingContext2D;
  backgroundContext: CanvasRenderingContext2D;
}

/** Owns one captured pointer and snapshots tool settings for the whole gesture. */
export function createDrawingController(layers: DrawingLayers) {
  const { foreground, background, foregroundContext, backgroundContext } = layers;
  let active: { pointerId: number; stroke: Stroke } | null = null;
  let frame: number | null = null;

  function pointFromEvent(event: PointerEvent): Point {
    const rect = foreground.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      pressure: event.pointerType === 'mouse' ? 0.5 : event.pressure,
    };
  }

  function render() {
    frame = null;
    if (!active) return;
    renderActiveStroke(foregroundContext, foreground, active.stroke, background);
    background.style.opacity = active.stroke.isEraser ? '0' : '1';
    // Also refresh after a resize or a history change while the pointer is held.
    frame = requestAnimationFrame(render);
  }

  function reset() {
    const pointerId = active?.pointerId;
    active = null;
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    clearCanvasLayer(foregroundContext, foreground);
    background.style.opacity = '1';
    if (pointerId !== undefined && foreground.hasPointerCapture(pointerId)) {
      foreground.releasePointerCapture(pointerId);
    }
  }

  function pointerdown(event: PointerEvent) {
    if (active || !event.isPrimary || event.button !== 0) return;
    const { selectedTool, strokeColor, strokeWidth } = useAppStore.getState();
    foreground.setPointerCapture(event.pointerId);
    active = {
      pointerId: event.pointerId,
      stroke: {
        id: crypto.randomUUID(),
        points: [pointFromEvent(event)],
        color: strokeColor,
        width: strokeWidth,
        createdAt: Date.now(),
        isEraser: selectedTool === 'eraser',
      },
    };
    render();
  }

  function pointermove(event: PointerEvent) {
    if (!active || event.pointerId !== active.pointerId) return;
    active.stroke.points.push(pointFromEvent(event));
  }

  function pointerup(event: PointerEvent) {
    if (!active || event.pointerId !== active.pointerId) return;
    const endpoint = pointFromEvent(event);
    const previous = active.stroke.points[active.stroke.points.length - 1];
    if (endpoint.x !== previous.x || endpoint.y !== previous.y) {
      // Pointer-up pressure is often zero; preserve the last drawing pressure.
      active.stroke.points.push({ ...endpoint, pressure: previous.pressure });
    }
    active.stroke.createdAt = Date.now();
    useAppStore.getState().addStroke(active.stroke);
    // Commit the bitmap before revealing it to avoid a frame of stale ink.
    renderAllStrokes(backgroundContext, background, useAppStore.getState().strokes);
    reset();
  }

  function pointercancel(event: PointerEvent) {
    if (event.pointerId === active?.pointerId) reset();
  }

  return { pointerdown, pointermove, pointerup, pointercancel, lostpointercapture: pointercancel, dispose: reset };
}
