# Phase 0c — Joplin webview integration check

Date: 2026-05-09. Branch: `spike/substrate` (plugin scaffold), findings landed on `main`.

## What this validated

The drag-to-move spike worked in a standalone Vite page. Phase 0c was the last gate before declaring the substrate fully committed: confirm hesprs and the wrap-and-extend pattern actually run inside Joplin's editor webview, not just in a friendly browser tab.

## Plugin shape

- `src/index.ts` registers an editor view via `joplin.views.editors.register('jsCanvasEditor', { onSetup, onActivationCheck })`
- `onActivationCheck` sniffs the note body for a JSON object containing a `nodes` array — minimal but sufficient gate for the spike
- `onSetup` calls `setHtml(handle, '<div id="root"></div>')` and adds `webview.js` + `webview.css` via `addScript`
- `webview.ts` is the same drag-to-move prototype from the Vite spike, adapted to run as an `extraScripts` build target
- Output: 263 KB `.jpl`, with webview.js at 90.7 KB gzipped (hesprs + markdown-it + drag logic, webpack production)

## Findings (manual run in Joplin desktop)

| Check | Result |
|---|---|
| Plugin installs from `.jpl` | pass |
| Editor toggle becomes available on notes matching the activation sniff | pass |
| Webview loads without CSP errors | pass |
| 3 nodes render with markdown content | pass |
| Pan / zoom / drag work in the Joplin webview environment | pass |
| Light / dark theme inheritance | **fail (deferred)** — Joplin's `--joplin-*` CSS variables don't flow into editor webviews by default; canvas stays at the spike's hardcoded background regardless of theme |

The webview also revealed one real bug fixed during the spike:

- **Initial layout grew unbounded.** The standalone Vite page used `height: 100vh` to bound the canvas to the viewport; in Joplin's editor pane the same `height: 100%` doesn't constrain because the parent has height-by-content layout. The hesprs overlays pushed the body taller every render. Fix: `overflow: hidden` on `html`, `body`, and `#root`, plus `position: absolute; inset: 0` on root, so the infinite canvas clips to the pane.

## Implications for v1

**The substrate decision is fully committed.** Hesprs + wrap-and-extend works inside Joplin. No CSP friction, the editor-replacement pattern via `joplin.views.editors.register` matches our mental model, and the layout fix is one CSS rule.

**Theme inheritance is the first real-implementation puzzle.** Joplin exposes `--joplin-*` CSS variables in panels and dialogs; whether those reach editor webviews and how they map to hesprs's CSS hooks needs investigation. Two viable paths:

1. **Pass theme tokens through `setHtml` or a postMessage handshake.** Plugin host reads Joplin's current theme (light/dark + colour values) and injects them into the webview's stylesheet on setup and on theme change.
2. **Inherit `--joplin-*` directly if available.** If Joplin exposes them in the editor webview context, just point hesprs's CSS variables at them.

This is implementation work, not a substrate concern.

**Webpack config delta we own.** The generator's webpack config defaults `target: 'node'` for all builds. Extra scripts run in the webview (browser context) and need `target: 'web'` plus `resolve.conditionNames` including `'import'` so ESM-only packages like `json-canvas-viewer` resolve. We've patched the spike's config; the v1 plugin will keep this delta and document it.

## Phase 0 conclusion

All four phases done:

- 0a (research and narrow): js-draw and weave.js killed; hesprs and from-scratch advanced
- 0b (architecture + drag-to-move spike): hesprs's DOM-overlay rendering + wrap-and-extend validated
- 0c (Joplin webview integration): plugin loads, gestures work, only theme inheritance deferred

Total elapsed: ~1 working day, well under the 10-day budget. Spike branch `spike/substrate` retained as a record but never merged.

## Next steps

- Bump ADR 0001 status to remove the "phase 0c outstanding" caveat
- Decide v1 implementation cadence: break PRD into issues (`/to-issues`), or start scaffolding the production plugin directly on `main`
