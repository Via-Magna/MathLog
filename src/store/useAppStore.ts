import { create } from 'zustand';
import type { Stroke, Tool } from '../types';
import {
  DEFAULT_STROKE_COLOR,
  DEFAULT_STROKE_WIDTH,
  MAX_UNDO_STACK_SIZE,
} from '../utils/constants';

interface AppState {
  // Tool state
  selectedTool: Tool;
  strokeWidth: number;
  strokeColor: string;
  showLines: boolean;

  // Stroke data (single source of truth)
  strokes: Stroke[];

  // Undo/Redo stacks (snapshots of strokes array)
  undoStack: Stroke[][];
  redoStack: Stroke[][];

  // Actions
  setTool: (tool: Tool) => void;
  setStrokeWidth: (width: number) => void;
  setStrokeColor: (color: string) => void;
  addStroke: (stroke: Stroke) => void;
  removeStroke: (strokeId: string) => void;
  undo: () => void;
  redo: () => void;
  clearCanvas: () => void;
  toggleLines: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Initial state
  selectedTool: 'pen',
  strokeWidth: DEFAULT_STROKE_WIDTH,
  strokeColor: DEFAULT_STROKE_COLOR,
  showLines: false,
  strokes: [],
  undoStack: [],
  redoStack: [],

  toggleLines: () => set((state) => ({ showLines: !state.showLines })),

  setTool: (tool) => set({ selectedTool: tool }),

  setStrokeWidth: (width) =>
    set({ strokeWidth: Math.max(1, Math.min(10, width)) }),

  setStrokeColor: (color) => set({ strokeColor: color }),

  addStroke: (stroke) =>
    set((state) => {
      const newUndoStack = [...state.undoStack, state.strokes];
      // Cap the undo stack at MAX_UNDO_STACK_SIZE
      if (newUndoStack.length > MAX_UNDO_STACK_SIZE) {
        newUndoStack.shift();
      }
      return {
        strokes: [...state.strokes, stroke],
        undoStack: newUndoStack,
        redoStack: [], // Clear redo on new action
      };
    }),

  removeStroke: (strokeId) =>
    set((state) => {
      const newUndoStack = [...state.undoStack, state.strokes];
      if (newUndoStack.length > MAX_UNDO_STACK_SIZE) {
        newUndoStack.shift();
      }
      return {
        strokes: state.strokes.filter((s) => s.id !== strokeId),
        undoStack: newUndoStack,
        redoStack: [],
      };
    }),

  undo: () =>
    set((state) => {
      if (state.undoStack.length === 0) return state;
      const previousStrokes = state.undoStack[state.undoStack.length - 1];
      return {
        strokes: previousStrokes,
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, state.strokes],
      };
    }),

  redo: () =>
    set((state) => {
      if (state.redoStack.length === 0) return state;
      const nextStrokes = state.redoStack[state.redoStack.length - 1];
      return {
        strokes: nextStrokes,
        undoStack: [...state.undoStack, state.strokes],
        redoStack: state.redoStack.slice(0, -1),
      };
    }),

  clearCanvas: () =>
    set((state) => {
      if (state.strokes.length === 0) return state;
      const newUndoStack = [...state.undoStack, state.strokes];
      if (newUndoStack.length > MAX_UNDO_STACK_SIZE) {
        newUndoStack.shift();
      }
      return {
        strokes: [],
        undoStack: newUndoStack,
        redoStack: [],
      };
    }),
}));
