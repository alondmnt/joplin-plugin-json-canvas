# ADR 0001 — Substrate: hesprs/json-canvas-viewer with wrap-and-extend

**Status:** Accepted
**Date:** 2026-05-09
**Deciders:** Alon (with claude as scribe / technical eval)

## Context

The PRD's open question #1 was the substrate for the canvas core: which library (or no library) we render on. The choice gates rendering, interaction, bundle, performance, mobile feasibility, and how easily markdown content fits inside nodes. Picking wrong wastes weeks.

Four candidates were on the table at the start of the phase 0 spike:

- [js-draw](https://github.com/personalizedrefrigerator/js-draw)
- [hesprs/json-canvas-viewer](https://github.com/hesprs/json-canvas-viewer)
- [weave.js](https://github.com/InditexTech/weavejs) (Inditex)
- From-scratch (SVG + pointer events)

The spike was time-boxed at ≤10 working days. It came in much faster — closer to 1 day — because hesprs dominated.

## Decision

**Substrate: `json-canvas-viewer` (hesprs).** **Pattern: wrap-and-extend** — use it as a pinned dependency and add editing on top via capture-phase pointer listeners and a custom text-node component. **Pin the dep version** (no caret) and bump deliberately. **Keep fork as a v2 fallback.**

## Rationale

| Candidate | Verdict | Why |
|---|---|---|
| js-draw | killed (research) | Exclusively a freehand drawing/inking tool. npm keywords are `ink, drawing, pen, freehand, svg`; the README confirms. No concept of arbitrary HTML-bearing nodes. Fighting the substrate the entire way. |
| weave.js | killed (bundle + data-model) | Smallest viable init = 190 KB gzipped, eats 95% of the 200 KB core budget. Yjs is non-optional even in "standalone" mode. Data-model translation cost (weave-state ↔ JSON Canvas) on every change. The pan/zoom/select features it gives us are 1-2 weeks of from-scratch work — trade isn't favourable. |
| from-scratch | fallback | Works (SVG hello-world: 0.62 KB gzipped, full flexibility). Costs ~1500-2500 lines of rendering, hit-testing, and overlay management we'd rewrite. |
| **hesprs** | **chosen** | Bundle 16 KB → 61 KB gzipped (with markdown-it). Native JSON Canvas — no translation layer. Hybrid rendering: canvas for edges/groups, **DOM overlay for text/markdown/image/link** — passes the markdown-in-node killer test. Per-type overlay components are publicly replaceable. Pan/zoom is one CSS transform on the overlay layer. Active maintenance, MIT licence, clean modern TypeScript code. |

The drag-to-move spike validated the wrap-and-extend pattern empirically: claiming pointer gestures via capture-phase + `stopPropagation()` works cleanly against pointeract, and `viewer.load()` on drag-end (6-12 ms at 3 nodes) is acceptable for v1.

## Consequences

**Positive**

- ~1500-2500 lines of clean, readable rendering code we don't have to write
- Native JSON Canvas in/out: no translation layer, lossless round-trip is straightforward
- 16-61 KB gzipped baseline leaves headroom under the PRD's 200 KB core budget
- DOM-overlay rendering for text content makes inline editing a per-component swap, not an architectural problem
- `nodeComponents` option is the exact seam for editing affordances
- Active upstream maintenance gives us security/dep-bump signal for free

**Negative**

- **No public mutation API.** We own canonical canvas data; viewer holds a snapshot. Sync via `viewer.load({ canvas })` for structural changes; mutate overlay style directly during drag.
- **Edges-during-drag requires private API access.** `Renderer` reads from `DM.data.nodeMap[id].box`, which is computed at `load()` time. To make edges follow during drag (not just snap on release), we'll mutate that box privately + call `refresh()`. Pin the dep version; add a regression test on the touchpoint. Acceptable for v1 by user verdict; required by the PRD's 500-node target.
- **No automated tests upstream.** `test/` contains a 12-line manual visual harness, no unit tests. We don't inherit regression safety; we write our own tests at every seam we depend on.
- **Single-maintainer bus factor** (`hesprs` also maintains `pointeract`). Mitigated by MIT licence + small repo size: forking is a 1-day operation if maintenance lapses.

**Operational rules from this decision**

- Pin both `json-canvas-viewer` and `pointeract` at exact versions, not caret
- Bind pointer listeners in capture phase on document; `stopPropagation()` when claiming a gesture
- For drag-during-move with edge-follow: mutate `DM.data.nodeMap[id].box` (private) + `data.canvasData.nodes[i].x/y` + `refresh()` rather than full reload
- Wrap private-API touchpoints in helper functions with their own tests, so an upstream refactor surfaces in test failures rather than runtime
- Keep fork option visible: clone the upstream repo locally so we always have a clean fork-ready snapshot

## Alternatives considered

- **Fork hesprs from day 1.** Would have given us full control over the renderer and let us add a public mutation API and edges-during-drag natively. Costs: lose upstream maintenance, double the code surface we own, prematurely commit to architecture decisions before we know which ones matter. Wrap-and-extend is the YAGNI-respecting choice; fork is available as v2 if upstream stops working for us.
- **Build a thin shim around weave.js's standalone mode.** Even with tree-shaking, the bundle floor is set by yjs + Konva + the SDK's manager scaffolding. ~200 KB gzipped before our code is too tight a constraint for v1.
- **Wait for a JSON Canvas editor library to materialise.** None on the horizon and the PRD has a Joplin issue with a "high priority" label opened by laurent22 himself two weeks ago. Time-to-something-shippable matters.

## Status & follow-ups

- **Phase 0c (Joplin webview integration check) still outstanding.** Wrap the prototype in a Joplin plugin shell using `joplin.views.editor.register`; confirm webview loads, no CSP violations, basic interactions work. Do this before declaring the substrate fully committed.
- The PRD bumps to v0.6 to mark open question #1 as resolved and cite this ADR.
- Spike branch `spike/substrate` is preserved for reference but never merged.

## References

- [phase 0a notes](../phase0-notes.md) — research, bundle measurements, kill decisions
- [phase 0b hesprs architecture](../phase0b-hesprs-architecture.md) — source read, markdown-in-node verdict
- [phase 0b drag spike](../phase0b-drag-spike.md) — wrap-and-extend validation
- [phase 0 spike scope](../phase0-spike.md) — the original plan this ADR concludes
- [JSON Canvas spec 1.0](https://jsoncanvas.org/spec/1.0)
- [json-canvas-viewer on GitHub](https://github.com/hesprs/json-canvas-viewer)
- [pointeract on GitHub](https://github.com/hesprs/pointeract)
