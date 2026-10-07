import type { Bounds } from '../math/symbols';
import type { LineResult } from '../store/useRecognitionStore';
import { answerText, hintDetail, readingText, spokenText, type AnswerKind, type AnswerText } from './answerText';
import { placeAnswer, type Placement } from './placeAnswer';
import { graceDeadline, pruneSlots, reconcileSlots, type Slot } from './slots';

/**
 * Draws answers (and reading hints) on the answer canvas layer.
 *
 * - Frames are requested on demand and stop as soon as nothing animates:
 *   an idle page costs zero frames. Each frame is a clear plus a few
 *   fillText calls, far inside the 16 ms budget.
 * - Fade in, crossfade on change, dim while re-reading, fade out, and
 *   three "thinking" dots while the first answer for a line is computed.
 * - Respects prefers-reduced-motion: no fades, static dots.
 */

export const FONT_FAMILY = "Caveat, 'Segoe Print', 'Comic Sans MS', cursive";
const FONT_WEIGHT = 500;
const HINT_FONT = "13px system-ui, -apple-system, 'Segoe UI', sans-serif";
const HINT_LINE = 17;

export const TIMING = {
  fadeInMs: 220,
  crossfadeMs: 260,
  fadeOutMs: 180,
  dimMs: 150,
  /** Don't flash dots for reads that finish quickly (e.g. cache hits). */
  thinkingDelayMs: 250,
  dotPeriodMs: 1200,
};

/** Opacity of an answer whose line is being re-read. */
export const STALE_ALPHA = 0.4;

const COLORS: Record<AnswerKind | 'hint' | 'dots', string> = {
  value: '#2b4cb3',
  undefined: '#b4442f',
  unknown: '#b97a12',
  hint: '#5f6272',
  dots: '#2b4cb3',
};

export interface RendererDeps {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** Screen-reader text for newly shown answers. */
  onAnnounce?: (message: string) => void;
  now?: () => number;
  requestFrame?: (cb: () => void) => number;
  cancelFrame?: (id: number) => void;
  reducedMotion?: () => boolean;
  setTimer?: (cb: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface UpdateOptions {
  modelUnavailable?: boolean;
  /** Show "What I read" under every finished line (unreadable lines always get one). */
  showReadings?: boolean;
}

const ease = (t: number) => 1 - (1 - t) * (1 - t);
const progress = (elapsed: number, ms: number) => (ms <= 0 ? 1 : Math.min(1, Math.max(0, elapsed / ms)));

export class AnswerRenderer {
  private slots = new Map<string, Slot>();
  private lines: LineResult[] = [];
  private options: UpdateOptions = {};
  /** slot id → placement, and the inputs it was computed from. */
  private placements = new Map<string, { sig: string; placement: Placement }>();
  /** slot id → where the outgoing answer sits during a crossfade. */
  private outgoing = new Map<string, Placement>();
  private widths = new Map<string, number>();
  private frame: number | null = null;
  private graceTimer: unknown = null;
  private disposed = false;
  private readonly d: Required<RendererDeps>;

  constructor(deps: RendererDeps) {
    this.d = {
      onAnnounce: () => {},
      now: () => performance.now(),
      requestFrame: (cb) => requestAnimationFrame(cb),
      cancelFrame: (id) => cancelAnimationFrame(id),
      reducedMotion: () => false,
      setTimer: (cb, ms) => setTimeout(cb, ms),
      clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
      ...deps,
    };
  }

  /** New recognition results (or a toggle changed). */
  update(lines: readonly LineResult[], options: UpdateOptions = {}): void {
    if (this.disposed) return;
    const now = this.d.now();
    const prev = this.slots;
    this.lines = [...lines].sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x);
    this.options = options;
    this.slots = reconcileSlots(prev, this.lines, now, { modelUnavailable: options.modelUnavailable });
    this.announce(prev);
    this.scheduleGraceCheck(now);
    this.requestDraw();
  }

  /** An answer held through an edit gives way to "?" once the grace runs out, even with no new results. */
  private scheduleGraceCheck(now: number) {
    if (this.graceTimer !== null) this.d.clearTimer(this.graceTimer);
    this.graceTimer = null;
    const deadline = graceDeadline(this.slots);
    if (deadline === null) return;
    this.graceTimer = this.d.setTimer(() => {
      this.graceTimer = null;
      this.update(this.lines, this.options);
    }, Math.max(0, deadline - now));
  }

  /** The canvas was resized (bitmap cleared) or the font finished loading. */
  invalidate(): void {
    this.placements.clear();
    this.outgoing.clear();
    this.widths.clear();
    this.requestDraw();
  }

  dispose(): void {
    this.disposed = true;
    if (this.frame !== null) this.d.cancelFrame(this.frame);
    this.frame = null;
    if (this.graceTimer !== null) this.d.clearTimer(this.graceTimer);
    this.graceTimer = null;
  }

  /** For tests and debugging. */
  get slotList(): Slot[] {
    return [...this.slots.values()];
  }

  get animating(): boolean {
    return this.frame !== null;
  }

  private requestDraw() {
    if (this.frame === null && !this.disposed) this.frame = this.d.requestFrame(() => this.draw());
  }

  private announce(prev: ReadonlyMap<string, Slot>) {
    const messages: string[] = [];
    for (const slot of this.slots.values()) {
      if (slot.phase !== 'shown' || !slot.answer) continue;
      const before = prev.get(slot.id);
      if (before?.phase === 'shown' && before.answer?.text === slot.answer.text) continue;
      messages.push(spokenText(slot.line.result?.rawTokens ?? [], slot.answer));
    }
    if (messages.length > 0) this.d.onAnnounce(messages.join('. '));
  }

  private logicalSize() {
    const t = this.d.ctx.getTransform();
    return { width: this.d.canvas.width / (t.a || 1), height: this.d.canvas.height / (t.d || 1) };
  }

  private measure = (text: string, fontPx: number): number => {
    const key = `${fontPx}|${text}`;
    let w = this.widths.get(key);
    if (w === undefined) {
      this.d.ctx.font = `${FONT_WEIGHT} ${fontPx}px ${FONT_FAMILY}`;
      w = this.d.ctx.measureText(text).width;
      this.widths.set(key, w);
    }
    return w;
  };

  /** Placements for every visible slot, top to bottom, each avoiding ink and earlier answers. */
  private layout(): Map<string, Placement> {
    const canvas = this.logicalSize();
    const ink = this.lines.map((l) => ({ key: l.key, bounds: l.bounds }));
    const placed: Bounds[] = [];
    const out = new Map<string, Placement>();
    const ordered = [...this.slots.values()].sort((a, b) => a.line.bounds.y - b.line.bounds.y);
    for (const slot of ordered) {
      const text = slot.answer?.text ?? '···';
      // Stale and fading answers keep their spot; only fresh answers move.
      const cached = this.placements.get(slot.id);
      const { bounds, lineHeight, equals } = slot.line;
      const sig = `${text}|${bounds.x},${bounds.y},${bounds.w},${bounds.h}|${lineHeight}|${equals?.bounds.x ?? ''},${equals?.bounds.y ?? ''}`;
      let placement: Placement;
      if (cached && (cached.sig === sig || slot.phase === 'stale' || slot.phase === 'hidden')) {
        placement = cached.placement;
      } else {
        // A new answer replaces one on screen: the old one fades out where it was.
        if (cached && slot.previous && !this.outgoing.has(slot.id)) this.outgoing.set(slot.id, cached.placement);
        const obstacles = [...ink.filter((l) => l.key !== slot.lineKey).map((l) => l.bounds), ...placed];
        placement = placeAnswer({ line: slot.line, text, measure: this.measure, canvas, obstacles });
        this.placements.set(slot.id, { sig, placement });
      }
      if (!slot.previous) this.outgoing.delete(slot.id);
      placed.push(placement.box);
      out.set(slot.id, placement);
    }
    for (const id of this.placements.keys()) if (!this.slots.has(id)) this.placements.delete(id);
    for (const id of this.outgoing.keys()) if (!this.slots.has(id)) this.outgoing.delete(id);
    return out;
  }

  private draw() {
    this.frame = null;
    if (this.disposed) return;
    const now = this.d.now();
    const reduced = this.d.reducedMotion();
    const ctx = this.d.ctx;
    const { width, height } = this.logicalSize();

    this.slots = pruneSlots(this.slots, now, reduced ? 0 : TIMING.fadeOutMs);
    const placements = this.layout();

    ctx.save();
    ctx.clearRect(0, 0, width, height);
    let busy = false;
    for (const slot of this.slots.values()) {
      const p = placements.get(slot.id);
      if (p) busy = this.drawSlot(slot, p, now, reduced) || busy;
    }
    this.drawHints(placements);
    ctx.restore();

    if (busy) this.requestDraw();
  }

  /** Draws one slot; returns true while it is still animating. */
  private drawSlot(slot: Slot, p: Placement, now: number, reduced: boolean): boolean {
    const elapsed = now - slot.since;
    const t = (ms: number) => (reduced ? 1 : ease(progress(elapsed, ms)));
    switch (slot.phase) {
      case 'shown': {
        if (!slot.answer) return false;
        if (slot.previous) {
          const k = t(TIMING.crossfadeMs);
          // Fade out from wherever the old answer was: dimmed if it was being re-read.
          const from = slot.fromStale ? STALE_ALPHA : 1;
          this.text(slot.previous, this.outgoing.get(slot.id) ?? p, (1 - k) * from);
          this.text(slot.answer, p, k);
          return k < 1;
        }
        // Fresh answers fade in from 0; a re-read that confirmed the answer brightens from dim.
        const k = t(TIMING.fadeInMs);
        const from = slot.fromStale ? STALE_ALPHA : 0;
        this.text(slot.answer, p, from + (1 - from) * k);
        return k < 1;
      }
      case 'stale': {
        if (!slot.answer) return false;
        const k = t(TIMING.dimMs);
        this.text(slot.answer, p, 1 - (1 - STALE_ALPHA) * k);
        return k < 1;
      }
      case 'thinking': {
        if (!reduced && elapsed < TIMING.thinkingDelayMs) return true;
        this.dots(p, reduced ? 0 : now - slot.since - TIMING.thinkingDelayMs, reduced);
        return !reduced;
      }
      case 'hidden': {
        if (!slot.answer) return false;
        const k = t(TIMING.fadeOutMs);
        this.text(slot.answer, p, (1 - k) * (slot.fromStale ? STALE_ALPHA : 1));
        return k < 1;
      }
    }
  }

  private text(answer: AnswerText, p: Placement, alpha: number) {
    if (alpha <= 0.01) return;
    const ctx = this.d.ctx;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = COLORS[answer.kind];
    ctx.font = `${FONT_WEIGHT} ${p.fontPx}px ${FONT_FAMILY}`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(answer.text, p.x, p.baseline);
    ctx.globalAlpha = 1;
  }

  /** Three dots that brighten in turn; static at half opacity with reduced motion. */
  private dots(p: Placement, elapsed: number, reduced: boolean) {
    const ctx = this.d.ctx;
    const r = Math.max(2, p.fontPx * 0.06);
    const cy = p.box.y + p.box.h / 2;
    const fadeIn = reduced ? 1 : progress(elapsed, TIMING.fadeInMs);
    ctx.fillStyle = COLORS.dots;
    for (let i = 0; i < 3; i++) {
      const phase = ((elapsed / TIMING.dotPeriodMs) * 2 * Math.PI) - i * 0.9;
      const pulse = reduced ? 0.5 : 0.35 + 0.5 * (0.5 + 0.5 * Math.sin(phase));
      ctx.globalAlpha = pulse * fadeIn;
      ctx.beginPath();
      ctx.arc(p.x + r + i * r * 3.2, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** "What I read" under finished lines: always for "?" answers, for all lines when toggled on. */
  private drawHints(placements: Map<string, Placement>) {
    const ctx = this.d.ctx;
    const bySlotLine = new Map([...this.slots.values()].map((s) => [s.lineKey, s]));
    ctx.font = HINT_FONT;
    ctx.textBaseline = 'top';
    ctx.fillStyle = COLORS.hint;
    for (const line of this.lines) {
      if (line.status !== 'done' || !line.result) continue;
      const slot = bySlotLine.get(line.key);
      // Mid-edit the old answer is held (stale), so don't complain about the half-written line yet.
      const held = slot?.phase === 'stale';
      const answer = answerText(line);
      const unreadable = answer?.kind === 'unknown' && !held;
      if (!unreadable && !this.options.showReadings) continue;
      const tokens = line.result.rawTokens;
      const read = tokens.length > 0 ? `I read “${readingText(tokens)}”` : 'I couldn’t read this line';
      const detail = unreadable || answer?.kind === 'undefined' ? hintDetail(line.result) : null;

      let top = line.bounds.y + line.bounds.h + 6;
      const p = slot && placements.get(slot.id);
      if (p?.where === 'below') top = Math.max(top, p.box.y + p.box.h + 4);
      ctx.globalAlpha = 0.85;
      ctx.fillText(read, line.bounds.x, top);
      if (detail) {
        ctx.globalAlpha = 0.65;
        ctx.fillText(detail, line.bounds.x, top + HINT_LINE);
      }
    }
    ctx.globalAlpha = 1;
  }
}
