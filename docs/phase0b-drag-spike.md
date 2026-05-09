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

## Findings (to be filled in after manual run)

| Check | Pass / fail / note |
|---|---|
| 3 nodes render with markdown | _todo_ |
| 2 edges render | _todo_ |
| Pan / wheel-zoom work | _todo_ |
| Drag visibly moves the node body | _todo_ |
| Edges snap to new position on pointer-up | _todo_ |
| `load()` time at 3 nodes | _todo_ ms |
| Reload button preserves dragged positions | _todo_ |
| Markdown list renders correctly | _todo_ |
| Click still selects | _todo_ |
| No console errors | _todo_ |

## Decision criteria

- **All checks pass:** wrap-and-extend is validated on the basics. Proceed to a 50-node version of the same spike to measure scaling behaviour.
- **Edges-on-pointer-up is jarring or load() > 30ms at 3 nodes:** option 2 (private-box mutation) becomes mandatory rather than optional. Spike a tiny extension to verify that path.
- **Anything else fails or feels structurally wrong:** stop, reassess, possibly fall back to from-scratch.
