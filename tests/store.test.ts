import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../src/store/useAppStore';
import type { Stroke } from '../src/types';

function makeStroke(id: string): Stroke {
  return {
    id,
    points: [{ x: 0, y: 0, pressure: 0.5 }],
    color: '#000000',
    width: 3,
    createdAt: Date.now(),
  };
}

describe('useAppStore', () => {
  // Reset the store before each test
  beforeEach(() => {
    useAppStore.setState({
      selectedTool: 'pen',
      strokeWidth: 3,
      strokeColor: '#1a1a2e',
      strokes: [],
      undoStack: [],
      redoStack: [],
    });
  });

  describe('setTool', () => {
    it('changes the selected tool', () => {
      useAppStore.getState().setTool('eraser');
      expect(useAppStore.getState().selectedTool).toBe('eraser');
    });
  });

  describe('setStrokeWidth', () => {
    it('changes the stroke width', () => {
      useAppStore.getState().setStrokeWidth(7);
      expect(useAppStore.getState().strokeWidth).toBe(7);
    });

    it('clamps to minimum of 1', () => {
      useAppStore.getState().setStrokeWidth(0);
      expect(useAppStore.getState().strokeWidth).toBe(1);
    });

    it('clamps to maximum of 10', () => {
      useAppStore.getState().setStrokeWidth(99);
      expect(useAppStore.getState().strokeWidth).toBe(10);
    });
  });

  describe('addStroke', () => {
    it('adds a stroke to the strokes array', () => {
      const stroke = makeStroke('s1');
      useAppStore.getState().addStroke(stroke);
      expect(useAppStore.getState().strokes).toHaveLength(1);
      expect(useAppStore.getState().strokes[0].id).toBe('s1');
    });

    it('pushes previous state to undoStack', () => {
      useAppStore.getState().addStroke(makeStroke('s1'));
      expect(useAppStore.getState().undoStack).toHaveLength(1);
      expect(useAppStore.getState().undoStack[0]).toEqual([]); // was empty before
    });

    it('clears the redoStack', () => {
      // Set up: add a stroke then undo (populates redoStack)
      useAppStore.getState().addStroke(makeStroke('s1'));
      useAppStore.getState().undo();
      expect(useAppStore.getState().redoStack).toHaveLength(1);

      // Adding a new stroke clears redo
      useAppStore.getState().addStroke(makeStroke('s2'));
      expect(useAppStore.getState().redoStack).toHaveLength(0);
    });

    it('caps undoStack at 50 entries', () => {
      for (let i = 0; i < 55; i++) {
        useAppStore.getState().addStroke(makeStroke(`s${i}`));
      }
      expect(useAppStore.getState().undoStack.length).toBeLessThanOrEqual(50);
    });
  });

  describe('removeStroke', () => {
    it('removes a stroke by id', () => {
      useAppStore.getState().addStroke(makeStroke('s1'));
      useAppStore.getState().addStroke(makeStroke('s2'));
      useAppStore.getState().removeStroke('s1');
      const ids = useAppStore.getState().strokes.map((s) => s.id);
      expect(ids).toEqual(['s2']);
    });

    it('pushes previous state to undoStack', () => {
      useAppStore.getState().addStroke(makeStroke('s1'));
      const undoLenBefore = useAppStore.getState().undoStack.length;
      useAppStore.getState().removeStroke('s1');
      expect(useAppStore.getState().undoStack.length).toBe(undoLenBefore + 1);
    });
  });

  describe('undo / redo', () => {
    it('undo restores previous strokes', () => {
      useAppStore.getState().addStroke(makeStroke('s1'));
      useAppStore.getState().addStroke(makeStroke('s2'));
      expect(useAppStore.getState().strokes).toHaveLength(2);

      useAppStore.getState().undo();
      expect(useAppStore.getState().strokes).toHaveLength(1);
      expect(useAppStore.getState().strokes[0].id).toBe('s1');
    });

    it('redo restores undone strokes', () => {
      useAppStore.getState().addStroke(makeStroke('s1'));
      useAppStore.getState().undo();
      expect(useAppStore.getState().strokes).toHaveLength(0);

      useAppStore.getState().redo();
      expect(useAppStore.getState().strokes).toHaveLength(1);
      expect(useAppStore.getState().strokes[0].id).toBe('s1');
    });

    it('undo is a no-op when undoStack is empty', () => {
      const stateBefore = useAppStore.getState().strokes;
      useAppStore.getState().undo();
      expect(useAppStore.getState().strokes).toBe(stateBefore);
    });

    it('redo is a no-op when redoStack is empty', () => {
      useAppStore.getState().addStroke(makeStroke('s1'));
      const stateBefore = useAppStore.getState().strokes;
      useAppStore.getState().redo();
      expect(useAppStore.getState().strokes).toBe(stateBefore);
    });

    it('redo is cleared after a new stroke', () => {
      useAppStore.getState().addStroke(makeStroke('s1'));
      useAppStore.getState().undo();
      useAppStore.getState().addStroke(makeStroke('s2'));
      expect(useAppStore.getState().redoStack).toHaveLength(0);
    });

    it('supports multiple undo/redo cycles', () => {
      useAppStore.getState().addStroke(makeStroke('s1'));
      useAppStore.getState().addStroke(makeStroke('s2'));
      useAppStore.getState().addStroke(makeStroke('s3'));

      useAppStore.getState().undo(); // back to [s1, s2]
      useAppStore.getState().undo(); // back to [s1]
      useAppStore.getState().redo(); // forward to [s1, s2]
      useAppStore.getState().redo(); // forward to [s1, s2, s3]

      expect(useAppStore.getState().strokes.map((s) => s.id)).toEqual([
        's1',
        's2',
        's3',
      ]);
    });
  });

  describe('clearCanvas', () => {
    it('removes all strokes', () => {
      useAppStore.getState().addStroke(makeStroke('s1'));
      useAppStore.getState().addStroke(makeStroke('s2'));
      useAppStore.getState().clearCanvas();
      expect(useAppStore.getState().strokes).toHaveLength(0);
    });

    it('is undoable', () => {
      useAppStore.getState().addStroke(makeStroke('s1'));
      useAppStore.getState().clearCanvas();
      expect(useAppStore.getState().strokes).toHaveLength(0);

      useAppStore.getState().undo();
      expect(useAppStore.getState().strokes).toHaveLength(1);
      expect(useAppStore.getState().strokes[0].id).toBe('s1');
    });

    it('is a no-op when strokes is already empty', () => {
      const undoLenBefore = useAppStore.getState().undoStack.length;
      useAppStore.getState().clearCanvas();
      expect(useAppStore.getState().undoStack.length).toBe(undoLenBefore);
    });
  });
});
