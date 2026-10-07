import type { EvalResult } from '../../math';
import { useAppStore } from '../../store/useAppStore';
import { useRecognitionStore, type LineResult } from '../../store/useRecognitionStore';
import styles from './Recognition.module.css';

/**
 * Developer overlay, shown only with `?debug` in the URL: a box around each
 * equation line with what ink-on read, the Phase 2 result and the timing,
 * plus an "Export strokes" button for recording test fixtures.
 * The user-facing answers are drawn by `src/answers/AnswerRenderer.ts`;
 * this stays as a developer tool.
 */

const isDebugMode = (): boolean =>
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug');

function describe(result: EvalResult | undefined): string {
  if (!result) return '';
  switch (result.kind) {
    case 'ok':
      return result.pending ? `(${result.display}, no =)` : result.display;
    case 'undefined':
      return 'Undefined';
    case 'error':
      return `? ${result.code}`;
    case 'pending':
      return '…';
  }
}

function exportStrokes() {
  const { strokes } = useAppStore.getState();
  const { lines } = useRecognitionStore.getState();
  const data = {
    exportedAt: new Date().toISOString(),
    expected: '',
    strokes,
    lines: Object.values(lines).map((l) => ({ key: l.key, bounds: l.bounds, latex: l.latex })),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `strokes-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function LineBox({ line }: { line: LineResult }) {
  const { x, y, w, h } = line.bounds;
  return (
    <div className={styles.lineBox} data-status={line.status} style={{ left: x - 6, top: y - 6, width: w + 12, height: h + 12 }}>
      <span className={styles.lineLabel}>
        {line.status === 'done'
          ? `${line.latex || '∅'} → ${describe(line.result)} · ${line.totalMs ?? 0} ms`
          : line.status}
      </span>
    </div>
  );
}

export function RecognitionDebugOverlay() {
  const lines = useRecognitionStore((s) => s.lines);
  const info = useRecognitionStore((s) => s.modelInfo);
  if (!isDebugMode()) return null;
  return (
    <div className={styles.overlay}>
      {Object.values(lines).map((line) => (
        <LineBox key={line.key} line={line} />
      ))}
      <div className={styles.debugBar}>
        <span>
          {info.executionProvider ?? '—'} · {info.threads ?? '?'} thread(s)
          {info.warmupMs !== undefined ? ` · warm-up ${info.warmupMs} ms` : ''}
        </span>
        <button type="button" onClick={exportStrokes}>
          Export strokes
        </button>
      </div>
    </div>
  );
}
