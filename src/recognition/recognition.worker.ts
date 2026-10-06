import type { InkOnVocabFile } from './engine';
import { createInkOnEngine } from './inkOnEngine';
import { preprocessStrokes } from './preprocessCanvas';
import type { FromWorker, ToWorker } from './protocol';
import { RecognitionWorkerCore } from './workerCore';

/** Web Worker entry: all recognition work runs here, off the main thread. */

const scope = self as unknown as {
  postMessage(message: FromWorker): void;
  onmessage: ((event: MessageEvent<ToWorker>) => void) | null;
};

const core = new RecognitionWorkerCore({
  createEngine: createInkOnEngine,
  loadVocab: async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    return (await res.json()) as InkOnVocabFile;
  },
  preprocess: preprocessStrokes,
  post: (message) => scope.postMessage(message),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => performance.now(),
});

scope.onmessage = (event) => {
  void core.handle(event.data);
};
