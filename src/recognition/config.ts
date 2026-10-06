/** Tunable settings for on-device recognition (Phase 3). */

/** ink-on decoding mode. 'number' masks the decoder to digits, + − × ÷ . ( ) = and a few structural tokens. */
export type RecognitionMode = 'auto' | 'number' | 'expression';

export const RECOGNITION_CONFIG = {
  /** Paths are resolved against the app's base URL at runtime. */
  encoderPath: 'models/comer/encoder_int8.onnx',
  decoderPath: 'models/comer/decoder_int8.onnx',
  vocabPath: 'models/comer/vocab.json',
  /** Folder holding onnxruntime-web's .wasm/.mjs files (copied by scripts/copy-ort.mjs). */
  ortWasmPath: 'ort/',

  mode: 'number' as RecognitionMode,
  maxDecodeSteps: 50,
  /** Beam width 3 normally, 1 on low-core devices or when inference is slow. */
  beamWidth: 3 as 1 | 2 | 3,
  lowEndBeamWidth: 1 as 1 | 2 | 3,
  lowEndCores: 4,
  /** If the rolling average of the last N runs exceeds this, drop to beam width 1. */
  slowRunMs: 2000,
  slowRunWindow: 3,
  /** WebGPU is tried only when this is true and `navigator.gpu` exists; INT8 models are usually faster on WASM. */
  preferWebGPU: false,

  /** Recognize this long after the pen stops. */
  idleMs: 400,
  /** Give up on a single request after this long. */
  requestTimeoutMs: 10_000,
  /** Retry a failed model load once after this delay. */
  modelRetryDelayMs: 3_000,
  /** Results kept for undo/redo. */
  cacheSize: 200,
} as const;
