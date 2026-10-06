import type { EvalResult } from '../math';
import type { Bounds } from '../math/symbols';
import type { RecognitionMode } from './config';

/** Messages between the main thread and `recognition.worker.ts`. */

export type ExecutionProvider = 'wasm' | 'webgpu';

export type RecognitionErrorCode =
  | 'MODEL_LOAD_FAILED'
  | 'WEBGPU_FAILED'
  | 'NO_SHARED_MEMORY'
  | 'INFERENCE_FAILED'
  | 'INFERENCE_TIMEOUT'
  | 'WORKER_CRASHED';

export interface InitMessage {
  type: 'init';
  encoderUrl: string;
  decoderUrl: string;
  vocabUrl: string;
  ortWasmPath: string;
  beamWidth: 1 | 2 | 3;
  maxDecodeSteps: number;
  executionProvider: ExecutionProvider;
  mode: RecognitionMode;
}

export interface RecognizeMessage {
  type: 'recognize';
  requestId: number;
  lineKey: string;
  /** x, y pairs for every point of every stroke, line-relative CSS px. Transferred, not copied. */
  points: Float32Array;
  /** Number of points in each stroke, in order. */
  strokeLengths: number[];
  lineWidths: number[];
  bounds: Bounds;
}

export interface DropMessage {
  type: 'drop';
  lineKeys: string[];
}

export type ToWorker = InitMessage | RecognizeMessage | DropMessage;

export interface Timings {
  encoderMs: number;
  decoderMs: number;
  totalMs: number;
}

export type FromWorker =
  | { type: 'progress'; loadedBytes: number; totalBytes: number }
  | { type: 'ready'; executionProvider: ExecutionProvider; threads: number; warmupMs: number }
  | {
      type: 'result';
      requestId: number;
      lineKey: string;
      latex: string;
      result: EvalResult;
      timings: Timings;
    }
  | {
      type: 'failed';
      requestId?: number;
      lineKey?: string;
      code: RecognitionErrorCode;
      message: string;
    };
