# MathLog / CalcInk

A browser drawing workspace for the Inter IIT 15.0 BootCamp software project. The current frontend provides smooth freehand ink, path erasing, undo/redo, and optional ruled paper.

## Run locally

Use Node.js 22.12+ (or a supported newer Node.js release) and npm.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite, usually http://localhost:5173.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Type-check the app and create the production bundle in `dist/` |
| `npm run preview` | Serve the built bundle locally |
| `npm test` | Run the Vitest regression suite |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | Check source and tests with Oxlint |

## Drawing controls

- **Pen:** drag with a mouse, touch, or pen to draw. Press **P** to select it.
- **Eraser:** press **E** and drag to erase only the area under the round cursor. Each completed erasing gesture is one undoable action; paper lines remain visible.
- **Width:** use the slider (1-10) for pen size or eraser radius. The eraser cursor shows the resulting diameter.
- **Undo:** **Ctrl+Z** on Windows/Linux or **Cmd+Z** on macOS.
- **Redo:** **Ctrl+Shift+Z**, **Cmd+Shift+Z**, or **Ctrl/Cmd+Y**.
- **Clear canvas:** remove the current drawing; Undo can restore it.
- **Toggle Lines:** show or hide the ruled-paper background.

A gesture keeps the tool, color, and width selected at pointer-down. Changes apply to the next gesture. Only one primary pointer draws at a time. Cancellation or loss of pointer capture discards the unfinished gesture. The toolbar moves to the bottom on narrow screens.

## How the frontend is organized

React and TypeScript provide the UI, Vite builds it, Zustand stores drawing state, and `perfect-freehand` generates pen outlines. CSS Modules style the canvas and toolbar; Lucide supplies the icons.

| Location | Responsibility |
| --- | --- |
| `src/components/Canvas/Canvas.tsx` | Compose the paper, committed-ink, and active-preview layers |
| `src/components/Canvas/useCanvasSetup.ts` | Resize canvas bitmaps and apply device-pixel-ratio scaling |
| `src/components/Canvas/drawingController.ts` | Own a pointer gesture, render its preview, and commit or cancel it |
| `src/components/Canvas/useDrawing.ts` | Attach and clean up native pointer event listeners |
| `src/components/Canvas/strokeRenderer.ts` | Render ink, erasure paths, and ruled paper |
| `src/components/Toolbar/` | Tool buttons, width slider, and keyboard shortcuts |
| `src/store/useAppStore.ts` | Stroke data and snapshot-based undo/redo, capped at 50 undo entries |
| `src/types/` | Shared point, stroke, and tool types |
| `src/utils/geometry.ts` | Geometry helpers retained from whole-stroke erasing |
| `tests/` | Store, geometry, canvas-command, and gesture regression tests |

Completed ink and erasure gestures are stored in order. Replaying them reconstructs the ink layer. Erasers use destination-out compositing on that layer, leaving the separate paper layer intact. Logical CSS-pixel coordinates are independent of the higher-resolution canvas bitmap.

The renderer tests use canvas API doubles to check drawing commands and compositing order. They do not replace visual checks in a real browser.

## Current limitations

- Drawings and history live in memory only. Reloading or closing the page loses them.
- Saving/loading documents, image/PDF export, and backend storage are not implemented.
- Math recognition, expression evaluation, and ML integration are future work.
- The store supports ink color, but the toolbar does not yet expose a color picker.
- Pen width currently uses simulated pressure; sampled stylus pressure is retained in stroke data.

## Manual smoke check

Draw several lines, erase part of one while keeping the pointer held, and verify unaffected ink stays visible. Release, undo, and redo the erasure. Toggle paper lines and repeat with a different width. Resize the window, try pen and touch input, and confirm Ctrl/Cmd+P still opens the browser print dialog.
See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.

## Math engine (Phase 2)

`src/math/` is a deterministic arithmetic engine written from scratch. It does not use `eval()`, `Function()` or any math library, and it has no runtime dependencies.

```ts
import { evaluateString } from './src/math';

evaluateString('18+4×3=');  // { kind: 'ok', display: '30', ... }
evaluateString('5÷0=');     // { kind: 'undefined', display: 'Undefined', ... }
evaluateString('3+×4=');    // { kind: 'error', code: 'UNEXPECTED_OPERATOR', ... }
evaluateString('3+');       // { kind: 'pending', ... }  (no "=" yet, so errors stay hidden)
```

Pipeline: `tokenize` → `toRPN` (Dijkstra's shunting-yard) → `evaluateRPN` (stack machine) → `formatNumber` (12 significant digits, so `0.1+0.2` shows `0.3`).

| File | Role |
| --- | --- |
| `src/math/symbols.ts` | The 18 canonical symbols and `RecognizedExpression` |
| `src/math/tokenizer.ts` | Merges digits into numbers, handles unary minus and implicit `2(3)` |
| `src/math/parser.ts` | Shunting-yard to RPN, plus syntax validation |
| `src/math/evaluator.ts` | RPN evaluation; `÷0` gives `Undefined`, overflow is detected |
| `src/math/format.ts` | Display formatting |
| `src/math/index.ts` | `evaluate()` / `evaluateString()`; never throws |
| `src/recognition/inkOnAdapter.ts` | Maps [ink-on](https://github.com/kimseungdae/ink-on) LaTeX tokens (`\times`, `\div`, …) to canonical symbols |

Every stage returns a typed `Result` instead of throwing. Before `=` is written, a valid expression returns a provisional value (`pending: true`) and an invalid one returns `{ kind: 'pending' }`, so half-written equations never show errors.

### Tests

```bash
npm test               # all suites
npm run test:coverage  # coverage report; first run: npm i -D @vitest/coverage-v8@^5
```

`tests/math/` covers the tokenizer, parser, evaluator, formatter and adapter. It also includes a 50-row golden table, seeded property tests (2,000 random expressions checked against a separate reference evaluator, and 2,000 random symbol sequences that must never throw), and a safety test that scans `src/` for `eval`/`Function`.

## Handwriting recognition (Phase 3)

Recognition runs entirely in the browser using [ink-on](https://github.com/kimseungdae/ink-on) (CoMER, ECCV 2022, Apache-2.0) on ONNX Runtime Web, inside a dedicated Web Worker, so drawing stays at 60 FPS.

### One-time setup

```bash
npm install         # adds ink-on + onnxruntime-web
npm run models      # downloads encoder_int8.onnx, decoder_int8.onnx, vocab.json into public/models/comer/ (7.4 MB)
npm run dev         # also copies the ONNX Runtime .wasm files into public/ort/
```

Commit `public/models/comer/` so the deployed app works offline. `public/ort/` is generated, so it's git-ignored.

Open `http://localhost:5173/?debug` to see a box around each equation line, with what the model read, the Phase 2 result, the inference time, and an **Export strokes** button for recording test fixtures.

### How it works

1. `lineGrouping.ts` splits strokes into equation lines by vertical overlap. Dots, `−` and `=` bars stay on their line, and side-by-side equations are split. Each line gets a stable key made from its stroke ids.
2. `RecognitionScheduler` re-groups lines on every add, erase, undo, redo or clear. It sends only changed lines, 400 ms after the pen stops. Undo and redo hit a result cache instantly.
3. `RecognitionClient` posts each line to the worker as a transferred `Float32Array`. It tracks request ids, so stale or out-of-order answers are dropped, times out after 10 s, and restarts the worker once if it crashes.
4. In the worker: strokes go through preprocessing (ink-on's algorithm, ported to `OffscreenCanvas` because ink-on's version needs `document`), then ink-on's `InferenceEngine` in `number` mode, then `adaptInkOn`, then `evaluate`.
5. Results land in `useRecognitionStore` (one `EvalResult` per line), which Phase 4 will draw.

`vite.config.ts` sets COOP/COEP headers so ONNX Runtime can use multi-threaded WASM. Without them it still works, on one thread.

| Setting | Where | Default |
| --- | --- | --- |
| Decoding mode, beam width, idle delay, timeout | `src/recognition/config.ts` | `number`, 3 (1 on ≤4 cores or when slow), 400 ms, 10 s |
| Line grouping thresholds | `DEFAULT_GROUPING` in `src/recognition/lineGrouping.ts` | see file |

Model credit: CoMER handwritten math recognition via ink-on by kimseungdae, Apache License 2.0.
