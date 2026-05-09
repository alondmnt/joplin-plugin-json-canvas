# Phase 0a — Research and hello-world findings

Spike branch: `spike/substrate`. Date: 2026-05-09.

## Bundle measurements (hello-world tier)

Built with vite 5, target ES2020, default minification.

| Candidate | Raw | Gzipped | What it does at this size |
|---|---:|---:|---|
| from-scratch (SVG + pointer events) | 1.48 KB | 0.62 KB | One rectangle, pan, wheel-zoom around cursor |
| hesprs/json-canvas-viewer | 54.31 KB | **15.76 KB** | Full library; loads a JSON Canvas with a text node |
| weave.js | 618.28 KB | **190.05 KB** | Weave + standalone store + konva renderer + zoom/pan plugins + rectangle node |
| js-draw | not built | — | Disqualified in research; not prototyped |

## Decisions

### js-draw — killed (paradigm fit)

Confirmed via npm metadata (keywords: `ink, drawing, pen, freehand, svg`) and the GitHub README: js-draw is exclusively a freehand drawing/inking tool. It models strokes, not nodes. There's no concept of arbitrary HTML-bearing rectangular containers participating in pan/zoom. Building a JSON Canvas editor on top would be fighting the substrate the entire way.

The Joplin-ecosystem precedent (js-draw co-published with its Joplin freehand-drawing plugin) doesn't carry over because the domain is different.

No prototype built — research alone was sufficient to disqualify.

### weave.js — killed (bundle + data-model)

Two independent strikes:

**Bundle.** Smallest viable init is 190 KB gzipped. The PRD targets ≤200 KB for the canvas core (excluding markdown-it). That leaves ~10 KB headroom for everything we'd write on top — JSON Canvas adapter, edge drawing, custom node behaviour, mode toggling. Not workable.

The bundle floor is structural, not incidental:
- `WeaveStoreStandalone` imports `Doc` from `yjs` directly. Yjs is part of the core, not a collab add-on, even in single-user mode.
- `@inditextech/weave-renderer-konva-base` pulls Konva (~140 KB min+gz on its own).
- `@inditextech/weave-sdk` adds pino/pino-pretty for logging plus the manager scaffolding.

Tree-shaking helped some but the floor is set by the architecture.

**Data-model translation cost.** Weave's state is its own (managed via SyncedStore over Yjs). JSON Canvas is the source of truth for our hosts. Every change requires bidirectional translation. Every load requires constructing weave state from JSON Canvas. Every save requires the inverse. Not a deal-breaker on its own, but combined with bundle bloat it's two reasons against.

What weave gives us in exchange — pan/zoom, selection, drag, snapping plugins — is 1-2 weeks of from-scratch work. The trade isn't favourable.

### hesprs/json-canvas-viewer — finalist (provisional)

Strong showing. 15.76 KB gzipped for a working library that already speaks JSON Canvas. MIT-licensed. Active maintenance (v4.2.1, 2026-05-05; 4 days before this spike). 7 maintainers? — actually one maintainer (`hesprs`), real bus-factor risk to flag.

What's good:
- Native JSON Canvas — no translation layer
- Aggressive tree-shaking (`sideEffects: false`)
- Modular architecture (Controller, DataManager, InteractionHandler, OverlayManager, Renderer, StyleManager) suggests a clean seam to add editing
- Optional modules already exist (Controls, Minimap, MistouchPreventer, DebugPanel) showing the extension pattern
- Deps include `marked` + `dompurify` — strongly suggests text content is rendered as sanitised HTML rather than rasterised onto canvas

**Open risk for phase 0b:** how exactly does it render text-node markdown? The Canvas2D backend means it has to either (a) overlay DOM elements positioned over the canvas, or (b) rasterise HTML to canvas (which kills interactivity inside nodes). Phase 0b's first task is to verify this — if it's (a), hesprs is a strong contender for a fork-and-extend; if it's (b), hesprs becomes a viewer-only data-model reference and we go from-scratch.

**Open risk for v1:** it's viewer-only by design. We'd have to either fork or wrap-and-extend with an editing layer. Phase 0b's second task is sketching what that looks like.

### from-scratch — finalist (always)

0.62 KB gzipped for one rectangle with pan and zoom. Floor is essentially zero. Maximum flexibility, maximum work. Always a finalist by default.

## Phase 0b plan

Two finalists advance: **hesprs** and **from-scratch**. The same vertical slice on each:

1. Load 50 text nodes + 20 edges from a fixture
2. Render text content through `markdown-it` into nodes that pan/zoom correctly
3. Drag a node to reposition; emit a `change` event
4. Click a node; show a selection ring
5. Draw a static Bezier edge between two specific nodes

For hesprs specifically, the first deliverable is the markdown-rendering investigation: read its renderer source, determine overlay-vs-rasterise, and report. If overlay, proceed with the full slice. If rasterise, kill hesprs and run the slice on from-scratch only.

Time budget for 0b: 5 working days, allocated as ~1 day hesprs investigation + ~2 days hesprs slice + ~2 days from-scratch slice. If hesprs falls early, that's ~3 days from-scratch only and we're ahead of schedule.

## Notes on the spike itself

- Node 14 was the system default (Joplin's older toolchain); switched to Node 20 via nvm and pinned `.nvmrc`.
- `npm run measure` produces sorted bundle and gzip sizes for each candidate's chunk; reproducible.
- The hesprs hello-world used `JSONCanvasViewer({ container })` then `viewer.load({ canvas })` — API verified against `dist/index.d.ts`.
- The weave.js hello-world's runtime correctness was not visually verified; the bundle measurement is independent of whether the demo actually paints, since rollup pulls in everything imported regardless of execution path.
