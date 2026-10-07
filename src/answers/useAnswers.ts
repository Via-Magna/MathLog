import { useEffect, type RefObject } from 'react';
import { create } from 'zustand';
import { useAppStore } from '../store/useAppStore';
import { useRecognitionStore } from '../store/useRecognitionStore';
import { AnswerRenderer, FONT_FAMILY } from './AnswerRenderer';

/** Latest screen-reader announcement; `id` changes even when the text repeats. */
interface AnnouncementState {
  text: string;
  id: number;
  announce: (text: string) => void;
}

export const useAnnouncementStore = create<AnnouncementState>((set) => ({
  text: '',
  id: 0,
  announce: (text) => set((s) => ({ text, id: s.id + 1 })),
}));

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/**
 * Runs the AnswerRenderer on the answer canvas layer, fed by the recognition
 * store and the "Show readings" toggle. The renderer is published in
 * `rendererRef` so the canvas can call `invalidate()` after a resize.
 */
export function useAnswers(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  ctxRef: RefObject<CanvasRenderingContext2D | null>,
  rendererRef: RefObject<AnswerRenderer | null>,
): void {
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;

    const motion = typeof window.matchMedia === 'function' ? window.matchMedia(REDUCED_MOTION) : null;
    const renderer = new AnswerRenderer({
      canvas,
      ctx,
      onAnnounce: (text) => useAnnouncementStore.getState().announce(text),
      reducedMotion: () => motion?.matches ?? false,
    });
    rendererRef.current = renderer;

    const push = () => {
      const { lines, model } = useRecognitionStore.getState();
      renderer.update(Object.values(lines), {
        modelUnavailable: model === 'unavailable',
        showReadings: useAppStore.getState().showReadings,
      });
    };
    push();
    const unsubRecognition = useRecognitionStore.subscribe((s, prev) => {
      if (s.lines !== prev.lines || s.model !== prev.model) push();
    });
    const unsubApp = useAppStore.subscribe((s, prev) => {
      if (s.showReadings !== prev.showReadings) push();
    });

    // The bundled Caveat font loads lazily: re-measure once it is there.
    let cancelled = false;
    document.fonts?.load(`500 48px ${FONT_FAMILY}`).then(
      () => !cancelled && renderer.invalidate(),
      () => {},
    );
    const onMotionChange = () => renderer.invalidate();
    motion?.addEventListener('change', onMotionChange);

    return () => {
      cancelled = true;
      unsubRecognition();
      unsubApp();
      motion?.removeEventListener('change', onMotionChange);
      renderer.dispose();
      rendererRef.current = null;
    };
  }, [canvasRef, ctxRef, rendererRef]);
}
