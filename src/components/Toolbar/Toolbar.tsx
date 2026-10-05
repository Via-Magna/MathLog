import { useEffect, useCallback } from 'react';
import {
  Pen,
  Eraser,
  Undo2,
  Redo2,
  Trash2,
  AlignJustify,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { ToolButton } from './ToolButton';
import { StrokeWidthSlider } from './StrokeWidthSlider';
import styles from './Toolbar.module.css';

export function Toolbar() {
  const selectedTool = useAppStore((s) => s.selectedTool);
  const setTool = useAppStore((s) => s.setTool);
  const undo = useAppStore((s) => s.undo);
  const redo = useAppStore((s) => s.redo);
  const clearCanvas = useAppStore((s) => s.clearCanvas);
  const undoStack = useAppStore((s) => s.undoStack);
  const redoStack = useAppStore((s) => s.redoStack);
  const showLines = useAppStore((s) => s.showLines);
  const toggleLines = useAppStore((s) => s.toggleLines);

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't capture shortcuts when an input is focused
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        setTool('pen');
      } else if (e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        setTool('eraser');
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        redo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        redo();
      }
    },
    [setTool, undo, redo]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className={styles.toolbar}>
      <div className={styles.toolGroup}>
        <ToolButton
          icon={<Pen size={20} />}
          label="Pen"
          shortcut="P"
          isActive={selectedTool === 'pen'}
          onClick={() => setTool('pen')}
        />
        <ToolButton
          icon={<Eraser size={20} />}
          label="Eraser"
          shortcut="E"
          isActive={selectedTool === 'eraser'}
          onClick={() => setTool('eraser')}
        />
      </div>

      <div className={styles.divider} />

      <div className={styles.toolGroup}>
        <ToolButton
          icon={<Undo2 size={20} />}
          label="Undo"
          shortcut="Ctrl+Z"
          isDisabled={undoStack.length === 0}
          onClick={undo}
        />
        <ToolButton
          icon={<Redo2 size={20} />}
          label="Redo"
          shortcut="Ctrl+Shift+Z"
          isDisabled={redoStack.length === 0}
          onClick={redo}
        />
      </div>

      <div className={styles.divider} />

      <div className={styles.toolGroup}>
        <ToolButton
          icon={<Trash2 size={20} />}
          label="Clear canvas"
          onClick={clearCanvas}
        />
        <ToolButton
          icon={<AlignJustify size={20} />}
          label="Toggle Lines"
          isActive={showLines}
          onClick={toggleLines}
        />
      </div>

      <div className={styles.divider} />

      <StrokeWidthSlider />
    </div>
  );
}
