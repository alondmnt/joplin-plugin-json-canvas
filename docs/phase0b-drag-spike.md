# Phase 0b — drag-to-move spike on hesprs

Branch: `spike/substrate`. Run with `npm run dev`, open http://localhost:5174/src/hesprs/.

## What this validates

Whether the wrap-and-extend pattern can support node editing on top of `json-canvas-viewer` without reaching into private internals beyond what's tolerable.

## What's in the prototype

- 3 text nodes (A, B, C) with markdown content rendered via `markdown-it`
- 2 edges (A→B, B→C)
- Document-level `pointerdown`/`pointermove`/`pointerup` listeners that detect drag-on-overlay via `target.closest('.JCV-overlay-container')`
- During drag: mutate `overlay.style.left` / `overlay.style.top` directly (canvas-space coords, scale-aware)
- On drag end: write back to canonical `doc.nodes[i].x/y` and call `viewer.load({ canvas: doc })` to rebuild — this is the only public path that propagates the change to the canvas-side edge renderer
- Reload button that calls `viewer.load({ canvas: doc })` on demand
- Status overlay showing live node positions and last `load()` timing

Bundle (with markdown-it + drag logic): **148.58 KB raw / 61.48 KB gzipped.** Up from 15.76 KB at the bare hello-world; markdown-it is the bulk of the delta.

## What to verify by hand

Open the page, use the browser DevTools console open. Check:

1. **Visual render:** three nodes visible with rendered markdown (heading, list). Two edges connect them. Pan and wheel-zoom work.
2. **Drag during pointermove is smooth:** click-and-drag node A. The node body moves under the cursor at 60fps. **Edges remain stuck at the original positions** during the drag — this is expected and called out below.
3. **On pointer-up, edges snap to new positions:** edges should redraw connecting to the dragged node's new location. Look for visual continuity (the snap should feel acceptable, not jarring).
4. **Console output:** each drag end logs `[spike] viewer.load() at 3 nodes: <X> ms`. Record the number — for 3 nodes I expect single-digit ms; if it's > 50 ms something is off.
5. **Reload button:** click "reload from canonical data". The view should rebuild and nodes should be at their post-drag positions. Confirms the canonical data wins.
6. **Markdown rendering:** Node C has a bulleted list. List items should render as `<li>`, not raw markdown.
7. **Click still selects:** click without dragging. Node should get the active state (blue border per hesprs's CSS).
8. **No console errors** during any of the above.

## Known limitation in this approach

`viewer.refresh()` redraws the canvas-side layer (edges, group containers) using `DataManager.data.nodeMap[id].box`, which is computed once at `load()` time from `canvasData.nodes[i].x/y`. So mutating overlay style + calling refresh leaves edges stuck at old positions.

Three options to make edges follow during drag (not just on drag-end):

1. **Full reload on each frame.** Way too slow, ruled out.
2. **Mutate `DM.data.nodeMap[id].box` privately.** `box` is `{left, right, top, bottom}` derived from `x/y/width/height`. Mutate it before calling `refresh()`. Fragile — relies on private structure that could change in upstream releases. Workable for v1 with a pinned dep version; pair with regression tests on overlay layout.
3. **Move edge rendering to overlay.** Keep canvas for grid/file thumbnails, render edges as SVG in the overlay layer. Bigger architectural change; basically a fork.

For v1, **option 2 is the right escape hatch** — pinned dep, tests on the private touchpoint, fork option open if upstream breaks the contract.

## Findings (manual run, 2026-05-09)

| Check | Result |
|---|---|
| 3 nodes render with markdown | pass |
| Drag visibly moves the node body | pass *(after capture-phase fix — first run had pointeract claiming the gesture)* |
| Edges snap to new position on pointer-up | pass — observed snap, not follow-during-drag |
| `load()` time at 3 nodes | 6-12 ms |
| User verdict on edges-snap-on-release | acceptable for v1 |

The first run failed: dragging a node panned the whole canvas because pointeract listens for pointerdown on the container during bubble. Fix: capture-phase listeners on document plus `e.stopPropagation()` to claim the gesture before pointeract sees it. After the fix, drag worked as intended.

## Conclusions

**Wrap-and-extend on hesprs is validated.** Capture-phase + stopPropagation cleanly claims gestures from pointeract; CSS transform on the overlay layer makes node movement during drag a one-line DOM mutation; `viewer.load()` on drag-end is the public path to propagate to the canvas-side edge renderer.

**Snap-on-release is acceptable for v1.** Peer tools (Figma, Obsidian Canvas, Excalidraw, tldraw) all do edges-follow-during-drag, but hesprs with `viewer.load()` on drag-end is "not flashy, not broken." Confirmed by user.

**Performance ceiling for snap-on-release:** linear extrapolation from 3 nodes (6-12 ms) suggests ≈150 ms at 50 nodes and ≈1.5 s at 500 nodes. The PRD's 500-node target will need option 2 (mutate `DM.data.nodeMap[id].box` privately + `refresh()`) before then. That's a v1 implementation refinement, not a spike blocker.

## What this concludes

- Substrate decision: hesprs with wrap-and-extend (recorded in [ADR 0001](adr/0001-substrate.md))
- Phase 0c (Joplin webview integration check) is *still outstanding* — should run before the substrate is fully committed, but not before the ADR captures the position
- Phase 0d (decision + ADR + PRD bump) happens now

The spike came in well under the 10-day budget — the dominant questions resolved on day 1 because hesprs validated cleanly. The full 5-day vertical slice on each finalist isn't needed: from-scratch was always the fallback, hesprs dominated, and the pattern (wrap-and-extend + capture-phase gestures + load-on-drag-end) is validated.
