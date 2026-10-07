# Performance and offline verification

The brief requires drawing to stay at 60 FPS while recognition runs, and the whole app to work in airplane mode. This page records how both were checked, the results, and how to reproduce them, including the DevTools screenshot for the submission.

## Results

Measured on 7 October 2026 in headless Chromium (Playwright) on a 2-core Linux VM with software rendering, against a production build served with COOP/COEP headers. ONNX Runtime ran multi-threaded WASM on 2 threads.

**Frame rate while the model runs.** We wrote `1+1=`, waited until its recognition started, then scribbled continuously for 4 seconds on another line while the worker was inferring. Frame times came from `requestAnimationFrame` deltas; long tasks from a `PerformanceObserver('longtask')`. The control run is the same scribble with no recognition at all.
![60 FPS during inference](images/devtools-60fps.jpeg)

| Run | CPU | Avg FPS | Median frame | 95th pct frame | Main-thread long tasks (>50 ms) |
| --- | --- | --- | --- | --- | --- |
| **During inference** | 1× | **57.8** | **16.7 ms** | **16.7 ms** | **0** |
| Control: no inference | 1× | 58.0 | 16.7 ms | 16.7 ms | 0 |
| During inference | 4× slowdown | 49.6 | 16.7 ms | 33.3 ms | 7 (max 83 ms) |
| Control: no inference | 4× slowdown | 39.1 | 16.7 ms | 50 ms | 6 (max 58 ms) |

- At normal speed the main thread holds 60 FPS (16.7 ms median and 95th percentile) with zero long tasks while the model infers. That matches the control run: the worker isolates inference from drawing.
- With the CPU slowed 4×, frames drop by the same amount whether or not recognition is running, so the cost there is redrawing a very long single stroke on a slow machine, not the model. (On this 2-core VM the worker also competes for the only other core.)
- Inference time per line was about 0.4–1.5 s; model warm-up about 1.6–2.7 s, off the critical path.

**Offline.**

| Check | Result |
| --- | --- |
| First online visit precaches the app | 16 files, 36.8 MB in `logmath-precache-<version>`; "Available offline" shown |
| Reload with the **server stopped** (`fetch` to the origin fails) | App loads, model loads from cache, `1-1=` → `0` |
| Reload with the browser **offline** | App loads, `1+1=` → `2`, no failed requests |
| Host without COOP/COEP headers (GitHub Pages) | Not isolated on first paint → service worker installs → one automatic reload → `crossOriginIsolated = true`, 2 WASM threads |
| Served from a sub-folder (`/MathLog/`) | Same results as above |

## Reproduce the DevTools 60 FPS screenshot

Use Chrome or Edge on a normal laptop.

1. Build and serve the production bundle:

   ```bash
   npm run build
   npm run preview
   ```

   Open the printed URL (usually http://localhost:4173) and wait until the "Loading handwriting model" badge disappears.
2. Open DevTools (F12) → **Performance** tab. Tick **Screenshots**. Leave CPU at "No throttling".
3. Click **Record** (●).
4. On the canvas, write `18+4×3=` and lift the pen. As soon as the thinking dots appear, keep writing a second equation below for 3–4 seconds while the first one is recognized.
5. Stop recording when the answer `30` has appeared.
6. In the recording:
   - The **Frames** track should be green (60 FPS) through the whole recording.
   - The **Main** track should show only short tasks, no red-cornered long tasks.
   - A separate **Worker** track (`recognition.worker`) shows the inference work: the encoder and decoder runs, hundreds of milliseconds long. They are not on the main thread.
7. Take a screenshot that shows the Frames track, the Main track and the Worker track together, and save it as `docs/images/devtools-60fps.png`. The README links to it.

To check frame rate continuously, you can also open the command menu (Ctrl+Shift+P) → **Show frame rendering stats**, or use the **Rendering** tab → **Frame Rendering Stats**.

## Reproduce the airplane-mode check

1. `npm run build` then `npm run preview`, and open the app once while online.
2. Wait for the "Available offline" badge. It appears when the service worker has cached everything (about 37 MB).
3. Either turn on airplane mode, or in DevTools → **Network** pick **Offline**, or stop the `preview` server.
4. Reload. The app should load, the model should load ("Loading handwriting model" disappears), and `1+1=` should show `2`.
5. DevTools → **Application** → **Cache storage** shows `logmath-precache-<version>` with the model and runtime files.

## Main-thread budget

Design targets for each piece of work (the measured end-to-end result is above).

| Work | Thread | Target |
| --- | --- | --- |
| Drawing the active stroke (`perfect-freehand` + fill) | Main | under 2 ms per frame for normal strokes |
| Grouping lines, diffing the cache | Main | under 1 ms for 200 strokes |
| Packing points (transferred, not copied) | Main | under 0.5 ms |
| Drawing answers, fades, thinking dots | Main | well under 1 ms per frame; no frames when idle |
| Preprocessing + CoMER encoder/decoder | **Worker** | 0.4–2 s per line |
| Adapter + evaluation | **Worker** | under 1 ms |
