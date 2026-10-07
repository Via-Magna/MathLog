import { create } from 'zustand';
import type { EvalResult } from '../math';
import type { Bounds } from '../math/symbols';
import type { EqualsSign } from '../recognition/findEquals';
import type { ModelInfo, ModelState } from '../recognition/RecognitionClient';

/** Recognition results, one per equation line. Phase 4 reads this to draw answers. */

export type LineStatus = 'queued' | 'recognizing' | 'done' | 'failed';

export interface LineResult {
  key: string;
  /** Where the line's ink is (canvas CSS px); Phase 4 draws the answer next to it. */
  bounds: Bounds;
  /** Typical character height of the line, CSS px; sizes the answer. */
  lineHeight: number;
  /** Where the "=" is drawn, if found; the answer goes just right of it. */
  equals: EqualsSign | null;
  status: LineStatus;
  /** What ink-on read, e.g. "1 8 + 4 \\times 3 =". */
  latex?: string;
  /** The Phase 2 result for this line. */
  result?: EvalResult;
  totalMs?: number;
}

interface RecognitionState {
  model: ModelState;
  /** 0..1 while the model downloads. */
  loadProgress: number;
  modelInfo: ModelInfo;
  lines: Record<string, LineResult>;

  setModel: (model: ModelState, loadProgress: number, info: ModelInfo) => void;
  setLines: (lines: Record<string, LineResult>) => void;
}

export const useRecognitionStore = create<RecognitionState>((set) => ({
  model: 'idle',
  loadProgress: 0,
  modelInfo: {},
  lines: {},

  setModel: (model, loadProgress, info) =>
    set((state) => ({ model, loadProgress, modelInfo: { ...state.modelInfo, ...info } })),
  setLines: (lines) => set({ lines }),
}));
