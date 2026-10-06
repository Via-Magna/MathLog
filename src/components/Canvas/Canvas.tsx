import { useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useCanvasSetup } from './useCanvasSetup';
import { useDrawing } from './useDrawing';
import { renderAllStrokes } from './strokeRenderer';
import { CANVAS_BG_COLOR, ERASER_HIT_THRESHOLD } from '../../utils/constants';
import styles from './Canvas.module.css';

export function Canvas() {
  const strokes = useAppStore((s) => s.strokes);
  const selectedTool = useAppStore((s) => s.selectedTool);

  // Ref for the custom eraser cursor element
  const eraserCursorRef = useRef<HTMLDivElement | null>(null);

  // Set up canvases with DPI scaling and resize observer.
  const { containerRef, bgCanvasRef, fgCanvasRef, bgCtxRef, fgCtxRef } =
    useCanvasSetup(({ bgCtxRef, bgCanvasRef }) => {
      if (!bgCtxRef.current || !bgCanvasRef.current) return;
      const state = useAppStore.getState();
      renderAllStrokes(
        bgCtxRef.current,
        bgCanvasRef.current,
        state.strokes,
        CANVAS_BG_COLOR,
        state.showLines
      );
    });

  // Set up pointer event handlers
  const { handlePointerDown, handlePointerMove, handlePointerUp } = useDrawing({
    fgCanvasRef,
    fgCtxRef,
  });

  const showLines = useAppStore((s) => s.showLines);

  // Redraw background canvas whenever strokes or showLines change
  useEffect(() => {
    const bgCtx = bgCtxRef.current;
    const bgCanvas = bgCanvasRef.current;
    if (!bgCtx || !bgCanvas) return;
    renderAllStrokes(bgCtx, bgCanvas, strokes, CANVAS_BG_COLOR, showLines);
  }, [strokes, showLines, bgCtxRef, bgCanvasRef]);

  // Track pointer position to move the eraser indicator
  const handlePointerMoveWithCursor = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      // Update the eraser cursor position
      if (eraserCursorRef.current) {
        eraserCursorRef.current.style.left = `${e.nativeEvent.offsetX}px`;
        eraserCursorRef.current.style.top = `${e.nativeEvent.offsetY}px`;
      }
      // Forward to the original drawing handler
      handlePointerMove(e);
    },
    [handlePointerMove]
  );

  const cursorClass =
    selectedTool === 'eraser' ? styles.eraserCursor : styles.penCursor;

  // Eraser indicator diameter matches the hit-test threshold
  const eraserSize = ERASER_HIT_THRESHOLD * 2;

  return (
    <div ref={containerRef} className={styles.canvasContainer}>
      <canvas ref={bgCanvasRef} className={styles.canvas} />
      <canvas
        ref={fgCanvasRef}
        className={`${styles.canvas} ${styles.foreground} ${cursorClass}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMoveWithCursor}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{ touchAction: 'none' }}
      />
      {/* Custom eraser cursor — only visible when eraser tool is selected */}
      {selectedTool === 'eraser' && (
        <div
          ref={eraserCursorRef}
          className={styles.eraserIndicator}
          style={{ width: eraserSize, height: eraserSize }}
        />
      )}
    </div>
  );
}
