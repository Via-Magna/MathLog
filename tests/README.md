# Canvas regression checks

Run the automated suite from the repository root:

```sh
npm test
```

The renderer and pointer-controller tests use the production implementation with deterministic canvas API doubles and a controlled animation-frame queue. They cover composition order, coordinate scaling, eraser dimensions, pointer ownership, gesture settings, release positions, cancellation, cleanup, and undo/redo.

These doubles verify canvas commands rather than rendered pixels. They do not emulate browser event routing, React mounting, real pointer capture, or device input hardware.

## Browser verification

Run `npm run dev` and check the following in a real browser:

1. Draw two lines, erase across them, and hold the pointer down. Unaffected ink should remain visible throughout the gesture.
2. Release the eraser. Its committed result should match the preview. Undo should restore the entire erasure, and redo should reapply it.
3. Repeat at the smallest and largest widths. The cursor should match the area removed, including a single click or tap.
4. Toggle ruled paper. Erasing should preserve the paper and its lines.
5. Resize the window and repeat on a high-DPI display. Pointer position, ink, and cursor should remain aligned.
6. While drawing, use P or E to change the selected tool. The current gesture should keep its starting tool, and the next gesture should use the new one.
7. Try mouse, pen, and multiple touches where available. Unrelated pointers should not modify the active gesture. After an interrupted gesture, drawing should still work.
8. Confirm Ctrl/Cmd+P opens the browser print dialog and inspect the browser console for errors.

Visual results and device-specific input behavior require these browser checks; passing the automated suite alone does not establish them.
