import type { CreatedEngine, EngineConfig, EngineResult, RecognitionEngine } from './engine';
import type { RecognitionMode } from './config';
import type { PreprocessResult } from './preprocess';

/**
 * Creates ink-on's InferenceEngine inside the worker.
 * - points onnxruntime-web at our self-hosted .wasm files (no CDN)
 * - picks the thread count from `crossOriginIsolated` (SharedArrayBuffer)
 * - pre-fetches the model files with an `ok` check and progress events,
 *   then hands them to ink-on's IndexedDB cache (ink-on's own fetch does not
 *   check `response.ok`, so a 404 page could otherwise be cached as a model)
 */

interface InkOnModule {
  InferenceEngine: new (options: {
    encoderUrl: string;
    decoderUrl: string;
    maxDecodeSteps?: number;
    beamWidth?: number;
    executionProvider?: 'wasm' | 'webgpu';
  }) => {
    init(): Promise<void>;
    recognize(input: PreprocessResult, vocab: unknown, mode?: RecognitionMode): Promise<EngineResult>;
    dispose(): void;
  };
  getCachedModel(url: string): Promise<ArrayBuffer | null>;
  cacheModel(url: string, data: ArrayBuffer): Promise<void>;
}

async function downloadWithProgress(url: string, onChunk: (bytes: number) => void): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  if (!res.body) {
    const buf = await res.arrayBuffer();
    onChunk(buf.byteLength);
    return buf;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
    onChunk(value.byteLength);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out.buffer;
}

async function prefetchModels(ink: InkOnModule, urls: string[], onProgress?: EngineConfig['onProgress']) {
  const missing: string[] = [];
  for (const url of urls) {
    if (!(await ink.getCachedModel(url))) missing.push(url);
  }
  if (missing.length === 0) return;

  // Content-Length totals for the progress bar (0 when unknown).
  const sizes = await Promise.all(
    missing.map(async (url) => {
      try {
        const head = await fetch(url, { method: 'HEAD' });
        return Number(head.headers.get('content-length') ?? 0);
      } catch {
        return 0;
      }
    }),
  );
  const total = sizes.reduce((a, b) => a + b, 0);
  let loaded = 0;
  for (const url of missing) {
    const buf = await downloadWithProgress(url, (n) => {
      loaded += n;
      onProgress?.(loaded, total);
    });
    if (buf.byteLength < 100_000) {
      throw new Error(`${url} is only ${buf.byteLength} bytes; run "npm run models" to download the model files`);
    }
    await ink.cacheModel(url, buf);
  }
}

export async function createInkOnEngine(config: EngineConfig): Promise<CreatedEngine> {
  const ort = await import('onnxruntime-web');
  ort.env.wasm.wasmPaths = config.ortWasmPath;

  // Importing ink-on sets numThreads to hardwareConcurrency; override it afterwards.
  const ink = (await import('ink-on/core')) as unknown as InkOnModule;
  const isolated = (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated === true;
  const cores = (globalThis.navigator as Navigator | undefined)?.hardwareConcurrency ?? 4;
  const threads = isolated ? Math.max(1, Math.min(cores, 4)) : 1;
  ort.env.wasm.numThreads = threads;
  if (!isolated) {
    console.info('[calcink] crossOriginIsolated is false: ONNX Runtime will run single-threaded (NO_SHARED_MEMORY).');
  }

  await prefetchModels(ink, [config.encoderUrl, config.decoderUrl], config.onProgress);

  const inner = new ink.InferenceEngine({
    encoderUrl: config.encoderUrl,
    decoderUrl: config.decoderUrl,
    beamWidth: config.beamWidth,
    maxDecodeSteps: config.maxDecodeSteps,
    executionProvider: config.executionProvider,
  });
  await inner.init();

  const engine: RecognitionEngine = {
    recognize: (input, vocab, mode) => inner.recognize(input, vocab, mode),
    dispose: () => inner.dispose(),
  };
  return { engine, executionProvider: config.executionProvider, threads };
}
