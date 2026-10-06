import type { RecognitionMode } from './config';
import type { PreprocessResult } from './preprocess';
import type { ExecutionProvider } from './protocol';

/**
 * The slice of ink-on's `InferenceEngine` the worker depends on.
 * The real implementation is in `inkOnEngine.ts`; tests use a fake.
 */

export interface EngineResult {
  latex: string;
  tokenIds: number[];
  encoderMs: number;
  decoderMs: number;
  totalMs: number;
}

export interface RecognitionEngine {
  recognize(input: PreprocessResult, vocab: InkOnVocabFile, mode: RecognitionMode): Promise<EngineResult>;
  dispose(): void;
}

export interface EngineConfig {
  encoderUrl: string;
  decoderUrl: string;
  ortWasmPath: string;
  beamWidth: number;
  maxDecodeSteps: number;
  executionProvider: ExecutionProvider;
  onProgress?: (loadedBytes: number, totalBytes: number) => void;
}

export interface CreatedEngine {
  engine: RecognitionEngine;
  executionProvider: ExecutionProvider;
  threads: number;
}

export type EngineFactory = (config: EngineConfig) => Promise<CreatedEngine>;

/** ink-on's vocab.json shape. */
export interface InkOnVocabFile {
  word2idx: Record<string, number>;
  idx2word: Record<string, string>;
  special_tokens: { pad: number; sos: number; eos: number };
  vocab_size: number;
}
