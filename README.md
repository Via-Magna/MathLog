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
