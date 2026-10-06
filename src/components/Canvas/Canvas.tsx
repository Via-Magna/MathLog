import { useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useCanvasSetup } from './useCanvasSetup';
import { useDrawing } from './useDrawing';
import { renderAllStrokes, renderGridLines } from './strokeRenderer';
import { CANVAS_BG_COLOR } from '../../utils/constants';
import styles from './Canvas.module.css';

export function Canvas() {
  const strokes = useAppStore((s) => s.strokes);
  const selectedTool = useAppStore((s) => s.selectedTool);
  const strokeWidth = useAppStore((s) => s.strokeWidth);
  const showLines = useAppStore((s) => s.showLines);

  const eraserCursorRef = useRef<HTMLDivElement | null>(null);

  const { containerRef, linesCanvasRef, bgCanvasRef, fgCanvasRef, linesCtxRef, bgCtxRef, fgCtxRef } =
    useCanvasSetup(({ bgCtxRef, bgCanvasRef, linesCtxRef, linesCanvasRef }) => {
      if (!bgCtxRef.current || !bgCanvasRef.current || !linesCtxRef.current || !linesCanvasRef.current) return;
      const state = useAppStore.getState();
      renderAllStrokes(bgCtxRef.current, bgCanvasRef.current, state.strokes);
      renderGridLines(linesCtxRef.current, linesCanvasRef.current, CANVAS_BG_COLOR, state.showLines);
    });

  const { handlePointerDown, handlePointerMove, handlePointerUp } = useDrawing({
    fgCanvasRef,
    fgCtxRef,
    bgCanvasRef,
    bgCtxRef,
  });

  useEffect(() => {
    const bgCtx = bgCtxRef.current;
    const bgCanvas = bgCanvasRef.current;
    if (!bgCtx || !bgCanvas) return;
    renderAllStrokes(bgCtx, bgCanvas, strokes);
  }, [strokes, bgCtxRef, bgCanvasRef]);

  useEffect(() => {
    const linesCtx = linesCtxRef.current;
    const linesCanvas = linesCanvasRef.current;
    if (!linesCtx || !linesCanvas) return;
    renderGridLines(linesCtx, linesCanvas, CANVAS_BG_COLOR, showLines);
  }, [showLines, linesCtxRef, linesCanvasRef]);

  const handlePointerMoveWithCursor = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (eraserCursorRef.current) {
        eraserCursorRef.current.style.left = `${e.nativeEvent.offsetX}px`;
        eraserCursorRef.current.style.top = `${e.nativeEvent.offsetY}px`;
      }
      handlePointerMove(e);
    },
    [handlePointerMove]
  );

  const cursorClass = selectedTool === 'eraser' ? styles.eraserCursor : styles.penCursor;
  const eraserSize = strokeWidth * 2;

  return (
    <div ref={containerRef} className={styles.canvasContainer}>
      <canvas ref={linesCanvasRef} className={`${styles.canvas} ${styles.linesLayer}`} />
      <canvas ref={bgCanvasRef} className={`${styles.canvas} ${styles.backgroundLayer}`} />
      <canvas
        ref={fgCanvasRef}
        className={`${styles.canvas} ${styles.foregroundLayer} ${cursorClass}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMoveWithCursor}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{ touchAction: 'none' }}
      />
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
