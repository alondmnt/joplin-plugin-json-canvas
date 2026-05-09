# Phase 0b — hesprs/json-canvas-viewer architecture investigation

Date: 2026-05-09. Branch: `spike/substrate`. Source read: `node_modules/json-canvas-viewer/dist/` (v4.2.1).

## Question

Phase 0a flagged hesprs as the strong finalist on bundle (15.76 KB gzipped) but left two open questions before we commit to it:

1. Does it render text-node markdown via DOM overlay (good) or canvas rasterisation (kill)?
2. Is it extensible enough to add editing on top, or do we need to fork?

This document answers both.

## How it renders: hybrid canvas + DOM overlay

Two cooperating layers:

**Canvas layer** (`Renderer.ts`) draws: edges, edge labels and arrowheads, group containers, file-node thumbnails, node backgrounds, group label bars, grid dots. **There is no `drawText` method.** Text content is not rasterised.

**DOM overlay layer** (`OverlayManager.ts`) is a single `<div class="JCV-overlays">` that lives next to the canvas inside `data.container`. Each node gets one absolutely-positioned child div with three sublayers:

```
<div class="JCV-overlay-container" id="<nodeId>">
  <div class="JCV-content">          <!-- node-type-specific content -->
  <div class="JCV-click-layer">      <!-- hit testing -->
  <div class="JCV-overlay-border">   <!-- selection ring (CSS) -->
</div>
```

Pan/zoom is a single CSS transform on the layer:

```js
this.overlaysLayer.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
```

GPU-composited; all nodes pan together for free; no per-node DOM mutation per frame.

## Text-node component (the killer test)

```js
text: ({container, content}) => {
  container.classList.add('JCV-markdown-content');
  const n = document.createElement('div');
  n.innerHTML = content;
  n.classList.add('JCV-parsed-content-wrapper');
  container.appendChild(n);
}
```

`content` is markdown already parsed to HTML (via the user-supplied `parser` option). It's set as `innerHTML` on a real div. **Text content is real DOM**: selectable, scrollable, theme-aware via inherited CSS, hit-testable. This is exactly what we need.

Markdown-in-node test: **passes.**

## Extensibility surface

The library is structured as a kernel + pluggable modules:

- **Kernel modules** (always present): Controller, DataManager, InteractionHandler, OverlayManager, Renderer, StyleManager
- **Optional modules** (opt-in via constructor): Controls, Minimap, MistouchPreventer, DebugPanel
- **Custom modules** can extend `BaseModule` and be passed to the constructor

What's exposed to extensions and to the public API:

| Surface | Purpose | Mutable? |
|---|---|:-:|
| `nodeComponents: Partial<ComponentDict>` | Replace per-type overlay component (text, markdown, image, audio, video, link) | yes |
| `parser: (md) => string\|Promise<string>` | Markdown parser injection | yes |
| `onNodeActive(node)` / `onNodeLosesActive(node)` hooks | Selection events | read |
| `onClick(nodeId)` hook (via InteractionHandler) | Single-click | read |
| `pan(x,y)`, `zoom(factor, origin)`, `panToCoords`, `zoomToScale` | Programmatic viewport | yes |
| `resetView()`, `toggleFullscreen()` | Viewport convenience | yes |
| `DataManager.data` | Read-only view of canvas, node positions, viewport state | **read** |

What's *not* exposed:

- **No mutation API.** No `setNodePosition`, no `addNode`, no `removeEdge`. To change data, call `viewer.load({ canvas: newDoc })` which clears all overlays and re-creates them.
- **No drag, double-click, or edge-creation gestures.** Only single-click is reported.
- **No `change` event.** The viewer doesn't write data, so it has nothing to emit.

## Implications for editing

The architecture is **editing-friendly**, even though editing isn't built in:

- **Drag-to-move** is straightforward: listen to `pointerdown` on the overlay div, mutate `style.left` / `style.top` during drag, sync back to our canonical data on drag-end. No canvas redraw needed for the node body. Edges (canvas-drawn) need a redraw — `viewer.load` does this but is heavy; cheaper alternatives are inspecting `Renderer.redraw` or moving edges to overlay too.
- **Double-click to edit** is a standard DOM event on the overlay container.
- **Custom text component** can render an editable surface (textarea or contenteditable) on focus and revert to rendered HTML on blur.
- **Edge-creation handles** are four small absolutely-positioned divs around the overlay border, with their own pointer listeners.

What we'd build on top:

1. A `JsCanvasEditor` wrapper that owns a `JSONCanvasViewer` instance and our canonical canvas data.
2. A custom `BaseModule` extension that adds drag/double-click/edge-handle interactions and emits our own `change` events.
3. A replacement `text` component that supports edit/view toggle.
4. A reload strategy: cheap path (mutate overlay style directly) for drags, full path (`viewer.load`) for structural changes.

## Wrap-and-extend vs fork

**Recommendation: wrap-and-extend, with fork as a v2 option.**

Wrap-and-extend pros:
- Get upstream bugfixes for free; project is actively maintained (v4.2.1, 4 days ago)
- Smaller code surface we own
- MIT licence, our changes stay in our codebase
- Public API gives us most of what we need

Wrap-and-extend cons:
- Limited to public extension points; if we need to change *core* rendering or interaction, we're stuck
- Coupled to upstream's API decisions
- Single-maintainer bus factor (`hesprs`) is a real risk; we should plan for the fork path being available

Fork is the fallback if we hit walls (e.g. needing to mutate `DataManager.data`, or the renderer needs structural changes for editing affordances). Architecturally there's no reason that should happen in v1, but we keep the option open.

## What to test in the rest of phase 0b

The 50-node vertical slice on hesprs becomes:

1. Load 50 text nodes + 20 edges via `viewer.load`, with `markdown-it` wired as `parser`
2. Confirm pan/zoom remains smooth (60 fps) at 50 nodes
3. Add a thin `BaseModule` extension that listens for `pointerdown` on overlays and implements drag-to-move (cheap path: direct style mutation; sync back on `pointerup`)
4. Replace the `text` component with one that toggles to a textarea on double-click, returns to rendered HTML on blur
5. Add a programmatic edge-creation gesture (drag from a fixed handle position) — emit a `change` event with the new edge

If steps 1-3 work cleanly and step 4 doesn't fight the library, the wrap-and-extend approach is validated. From-scratch becomes the fallback rather than a parallel track, and the spike can wrap up early.

## Open questions to resolve in 0b

- How expensive is `viewer.load()` at 50 nodes? Profile.
- Can we avoid full `load` by writing our own incremental update path that mutates `DataManager.data` directly? (Probably yes via TypeScript escape hatch; long-term maintainability concern.)
- Does the canvas-drawn edge layer redraw when we move a node via overlay style mutation? If not, we have to trigger the redraw ourselves.
- Is the `pointeract` library's gesture coverage sufficient for our needs (multitouch pinch-zoom on mobile, pen pressure, etc.) or do we wrap it?
