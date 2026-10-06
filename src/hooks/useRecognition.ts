import { useEffect } from 'react';
import { RECOGNITION_CONFIG } from '../recognition/config';
import type { InitMessage } from '../recognition/protocol';
import { RecognitionClient, type WorkerLike } from '../recognition/RecognitionClient';
import { RecognitionScheduler } from '../recognition/RecognitionScheduler';
import { useAppStore } from '../store/useAppStore';
import { useRecognitionStore } from '../store/useRecognitionStore';

/** Builds the worker init message, resolving model paths against the app's base URL. */
export function buildInitMessage(): InitMessage {
  const base = new URL(import.meta.env.BASE_URL, window.location.href);
  const url = (path: string) => new URL(path, base).href;
  const lowEnd = (navigator.hardwareConcurrency || 4) <= RECOGNITION_CONFIG.lowEndCores;
  const webgpu = RECOGNITION_CONFIG.preferWebGPU && 'gpu' in navigator;
  return {
    type: 'init',
    encoderUrl: url(RECOGNITION_CONFIG.encoderPath),
    decoderUrl: url(RECOGNITION_CONFIG.decoderPath),
    vocabUrl: url(RECOGNITION_CONFIG.vocabPath),
    ortWasmPath: url(RECOGNITION_CONFIG.ortWasmPath),
    beamWidth: lowEnd ? RECOGNITION_CONFIG.lowEndBeamWidth : RECOGNITION_CONFIG.beamWidth,
    maxDecodeSteps: RECOGNITION_CONFIG.maxDecodeSteps,
    executionProvider: webgpu ? 'webgpu' : 'wasm',
    mode: RECOGNITION_CONFIG.mode,
  };
}

/**
 * Starts on-device recognition once, after the first paint:
 * worker + client + scheduler, subscribed to the stroke store.
 * Results land in `useRecognitionStore`.
 */
export function useRecognition(): void {
  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;

    const start = () => {
      if (disposed) return;
      const recognition = useRecognitionStore.getState();

      // Assigned right after the client; client events only fire after start().
      let scheduler!: RecognitionScheduler;
      const client = new RecognitionClient(
        () =>
          new Worker(new URL('../recognition/recognition.worker.ts', import.meta.url), {
            type: 'module',
          }) as unknown as WorkerLike,
        buildInitMessage(),
        {
          onModelState: (state, progress, info) => {
            recognition.setModel(state, progress, info);
            if (state === 'ready') scheduler.onModelReady();
            else scheduler.onModelLost();
          },
          onResult: (key, latex, result, totalMs) => scheduler.onResult(key, latex, result, totalMs),
          onFailed: (key, code) => scheduler.onFailed(key, code),
        },
      );
      scheduler = new RecognitionScheduler({
        client,
        publish: (lines) => useRecognitionStore.getState().setLines(lines),
      });

      scheduler.onStrokesChanged(useAppStore.getState().strokes);
      const unsubscribe = useAppStore.subscribe((state, prev) => {
        if (state.strokes !== prev.strokes) scheduler.onStrokesChanged(state.strokes);
      });

      // Only pointer-downs on the canvas count as "writing".
      const onDown = (e: PointerEvent) => {
        if (e.target instanceof HTMLCanvasElement) scheduler.onPointerDown();
      };
      const onUp = () => scheduler.onPointerUp();
      document.addEventListener('pointerdown', onDown, true);
      document.addEventListener('pointerup', onUp, true);
      document.addEventListener('pointercancel', onUp, true);

      client.start();

      cleanup = () => {
        unsubscribe();
        document.removeEventListener('pointerdown', onDown, true);
        document.removeEventListener('pointerup', onUp, true);
        document.removeEventListener('pointercancel', onUp, true);
        scheduler.dispose();
        client.dispose();
      };
    };

    // Start after first paint so model loading never delays the canvas.
    const idle = window.requestIdleCallback
      ? window.requestIdleCallback(start, { timeout: 2000 })
      : window.setTimeout(start, 200);

    return () => {
      disposed = true;
      if (window.cancelIdleCallback) window.cancelIdleCallback(idle);
      window.clearTimeout(idle);
      cleanup?.();
    };
  }, []);
}
