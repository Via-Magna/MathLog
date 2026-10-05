import { vi } from 'vitest';

export function canvasHarness() {
  const calls: { name: string; composite: string; scale: number[] }[] = [];
  let scale = [2, 2];
  const stack: { scale: number[]; composite: string }[] = [];
  const record = (name: string) => calls.push({ name, composite: context.globalCompositeOperation, scale: [...scale] });
  const context = {
    globalCompositeOperation: 'source-over',
    fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter',
    save: vi.fn(() => stack.push({ scale: [...scale], composite: context.globalCompositeOperation })),
    restore: vi.fn(() => {
      const previous = stack.pop();
      if (previous) {
        scale = previous.scale;
        context.globalCompositeOperation = previous.composite;
      }
    }),
    setTransform: vi.fn((a: number, _b: number, _c: number, d: number) => { scale = [a, d]; }),
    getTransform: vi.fn(() => ({ a: scale[0], d: scale[1] })),
    clearRect: vi.fn(() => record('clear')),
    drawImage: vi.fn(() => record('copy')),
    fillRect: vi.fn(() => record('background')),
    fill: vi.fn(() => record('fill')),
    stroke: vi.fn(() => record('stroke')),
    beginPath: vi.fn(), arc: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), setLineDash: vi.fn(),
  };
  const captured = new Set<number>();
  const element = {
    width: 800, height: 600, style: { opacity: '1' },
    getBoundingClientRect: () => ({ left: 60, top: 10, width: 400, height: 300 }),
    setPointerCapture: vi.fn((id: number) => captured.add(id)),
    hasPointerCapture: (id: number) => captured.has(id),
    releasePointerCapture: vi.fn((id: number) => captured.delete(id)),
  };
  return {
    context, element, calls, captured,
    ctx: context as unknown as CanvasRenderingContext2D,
    canvas: element as unknown as HTMLCanvasElement,
  };
}

export function pointer(overrides: Partial<PointerEvent> = {}): PointerEvent {
  return {
    pointerId: 1, isPrimary: true, button: 0, pointerType: 'mouse',
    clientX: 80, clientY: 40, pressure: 0.5, ...overrides,
  } as PointerEvent;
}
