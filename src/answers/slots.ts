import type { Bounds } from '../math/symbols';
import type { LineResult } from '../store/useRecognitionStore';
import { answerText, hasEquals, type AnswerText } from './answerText';

/**
 * One answer slot per written equation. Line keys change on every edit, so a
 * slot follows its line by key first and by position second; that is what
 * keeps an answer on screen while the edited line is re-read.
 *
 *   hidden ──(= written, reading)──▶ thinking ──(result)──▶ shown
 *     ▲                                                     │  ▲
 *     └────(no answer any more / line gone)◀── stale ◀─(edit)┘  │
 *                                               └──(result)─────┘
 *
 * - hidden:   nothing drawn (also the fade-out target)
 * - thinking: "=" is written and the line is being read; no answer yet
 * - shown:    the answer for the current strokes
 * - stale:    the line changed; the previous answer stays up, dimmed,
 *             until the new one arrives (never blinks off)
 *
 * Editing grace: erasing a digit and rewriting it takes a few seconds, and
 * the half-edited line ("7+=") is read in between. If a line that had an
 * answer reads as "?" (or loses its answer while its "=" is still there),
 * the old answer stays up, stale, until `editGraceMs` after the last edit.
 * Rewrite in time and it swaps straight to the new answer; otherwise "?"
 * shows. Erasing the "=" itself still hides the answer at once.
 *
 * Pure: `now` is passed in, and the renderer turns phase changes into fades.
 */

/** How long an edited line may read as "?" before its old answer gives way. */
export const EDIT_GRACE_MS = 3000;

export type SlotPhase = 'hidden' | 'thinking' | 'shown' | 'stale';

export interface Slot {
  id: string;
  /** Key of the line this slot currently follows. */
  lineKey: string;
  phase: SlotPhase;
  /** When `phase` last changed (ms, same clock as `now`). */
  since: number;
  /** What is (or was last) drawn; kept through stale and hidden for fades. */
  answer: AnswerText | null;
  /** The answer this one replaced, for a crossfade; null when nothing to fade from. */
  previous: AnswerText | null;
  /** True when the text on screen was dimmed (stale) as this phase began: fades start from there. */
  fromStale: boolean;
  /** When the slot's line last changed (new key: a stroke, an erase, undo, redo). */
  editedAt: number;
  /** The line as last seen. */
  line: LineResult;
}

export interface ReconcileOptions {
  /** Model can't run: never show "thinking". */
  modelUnavailable?: boolean;
  /** Share of the smaller box two line boxes must overlap to be the same equation. */
  minOverlap?: number;
  /** See EDIT_GRACE_MS. */
  editGraceMs?: number;
}

/**
 * When a slot held through the editing grace must be looked at again, or null.
 * The renderer re-reconciles at that time so "?" eventually shows.
 */
export function graceDeadline(slots: ReadonlyMap<string, Slot>, graceMs = EDIT_GRACE_MS): number | null {
  let deadline: number | null = null;
  for (const s of slots.values()) {
    const settled = s.line.status === 'done' || s.line.status === 'failed';
    if (s.phase === 'stale' && settled) deadline = Math.min(deadline ?? Infinity, s.editedAt + graceMs);
  }
  return deadline;
}

function overlapShare(a: Bounds, b: Bounds): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  const smaller = Math.max(1, Math.min(a.w * a.h, b.w * b.h));
  return (w * h) / smaller;
}

const sameAnswer = (a: AnswerText | null, b: AnswerText | null) => a?.text === b?.text && a?.kind === b?.kind;

let nextId = 1;

/** Matches lines to existing slots: exact key, then the best-overlapping unclaimed slot. */
function match(prev: ReadonlyMap<string, Slot>, lines: readonly LineResult[], minOverlap: number): Map<LineResult, Slot | undefined> {
  const claimed = new Set<string>();
  const out = new Map<LineResult, Slot | undefined>();
  const byKey = new Map([...prev.values()].map((s) => [s.lineKey, s]));
  for (const line of lines) {
    const slot = byKey.get(line.key);
    if (slot && !claimed.has(slot.id)) {
      claimed.add(slot.id);
      out.set(line, slot);
    }
  }
  for (const line of lines) {
    if (out.has(line)) continue;
    let best: Slot | undefined;
    let bestShare = minOverlap;
    for (const slot of prev.values()) {
      if (claimed.has(slot.id)) continue;
      const share = overlapShare(slot.line.bounds, line.bounds);
      if (share >= bestShare) {
        bestShare = share;
        best = slot;
      }
    }
    if (best) claimed.add(best.id);
    out.set(line, best);
  }
  return out;
}

/** Next phase and answer for a slot given its line now. */
function step(
  slot: Slot | undefined,
  line: LineResult,
  opts: ReconcileOptions,
  graceLeft: boolean,
): Pick<Slot, 'phase' | 'answer'> {
  const reading = line.status === 'queued' || line.status === 'recognizing';
  const visible = slot && (slot.phase === 'shown' || slot.phase === 'stale') ? slot.answer : null;

  if (!reading) {
    const answer = answerText(line);
    // Mid-edit: hold a real answer rather than flash "?" or blank while the "=" is still there.
    const unsure = answer?.kind === 'unknown' || (answer === null && hasEquals(line));
    if (unsure && graceLeft && visible && visible.kind !== 'unknown') return { phase: 'stale', answer: visible };
    if (answer) return { phase: 'shown', answer };
    return { phase: 'hidden', answer: visible ?? slot?.answer ?? null };
  }
  // Reading. Keep the old answer up until the new one is ready.
  if (visible) {
    const unchanged = slot!.lineKey === line.key && slot!.phase === 'shown';
    return { phase: unchanged ? 'shown' : 'stale', answer: visible };
  }
  if (hasEquals(line) && !opts.modelUnavailable) return { phase: 'thinking', answer: null };
  return { phase: 'hidden', answer: slot?.answer ?? null };
}

/**
 * Returns the next set of slots. Slots whose line vanished are kept as
 * `hidden` (so they can fade out) until the renderer prunes them.
 */
export function reconcileSlots(
  prev: ReadonlyMap<string, Slot>,
  lines: readonly LineResult[],
  now: number,
  opts: ReconcileOptions = {},
): Map<string, Slot> {
  const next = new Map<string, Slot>();
  const matched = match(prev, lines, opts.minOverlap ?? 0.3);
  const graceMs = opts.editGraceMs ?? EDIT_GRACE_MS;

  for (const line of lines) {
    const slot = matched.get(line);
    const editedAt = !slot || slot.lineKey !== line.key ? now : slot.editedAt;
    const { phase, answer } = step(slot, line, opts, now - editedAt < graceMs);
    if (!slot) {
      if (phase === 'hidden') continue; // nothing to show, nothing to fade
      const id = `slot-${nextId++}`;
      next.set(id, { id, lineKey: line.key, phase, since: now, answer, previous: null, fromStale: false, editedAt, line });
      continue;
    }
    const changedPhase = phase !== slot.phase;
    const changedAnswer = !sameAnswer(answer, slot.answer);
    const wasOnScreen = slot.phase === 'shown' || slot.phase === 'stale';
    // Crossfade only from an answer that was actually on screen.
    const previous = changedAnswer ? (wasOnScreen ? slot.answer : null) : changedPhase ? null : slot.previous;
    next.set(slot.id, {
      ...slot,
      lineKey: line.key,
      phase,
      answer,
      previous,
      fromStale: changedPhase || changedAnswer ? slot.phase === 'stale' : slot.fromStale,
      since: changedPhase || changedAnswer ? now : slot.since,
      editedAt,
      line,
    });
  }

  const used = new Set([...matched.values()].filter(Boolean).map((s) => s!.id));
  for (const slot of prev.values()) {
    if (used.has(slot.id)) continue;
    next.set(slot.id, slot.phase === 'hidden' ? slot : { ...slot, phase: 'hidden', since: now, fromStale: slot.phase === 'stale' });
  }
  return next;
}

/** Drops hidden slots whose fade-out has finished. */
export function pruneSlots(slots: ReadonlyMap<string, Slot>, now: number, fadeMs: number): Map<string, Slot> {
  const out = new Map<string, Slot>();
  for (const [id, s] of slots) {
    if (s.phase === 'hidden' && now - s.since >= fadeMs) continue;
    out.set(id, s);
  }
  return out;
}
