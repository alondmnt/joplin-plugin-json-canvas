# Phase 0 — Substrate Spike

**Status:** Scoped, not yet executed. Target duration: ≤10 working days.

## Goal

Resolve [PRD open question #1](prd.md#open-questions): which substrate we build js-canvas on. Output is a defensible decision backed by working code and measurements, not vibes.

## Non-goals

- Not building MVP. Anything not load-bearing for the substrate decision is out of scope.
- Not polishing. Throwaway code is fine.
- Not picking bundle/perf budgets. Those live in the PRD; the spike measures against them.

## Candidates

| Candidate | Prior |
|---|---|
| [js-draw](https://github.com/personalizedrefrigerator/js-draw) | Likely wrong paradigm (freehand drawing, not node graph). Quick paradigm-fit check; kill or keep within ~0.5 day. |
| [hesprs/json-canvas-viewer](https://github.com/hesprs/json-canvas-viewer) | Viewer-only fork that already speaks JSON Canvas. Question is whether to extend it or copy concepts. |
| [weave.js](https://github.com/InditexTech/weave-js) | Pan/zoom/selection/drag built in. Risk: bundle bloat from collab/yjs, unproven in Joplin webview. |
| From-scratch (SVG + pointer events) | Always a finalist; fallback if everything else disqualifies. |

## Method

### 0a. Research and narrow (~1.5 days)

For each candidate, in ≤1 day each:
- Read docs and a sample of source.
- Get a "hello world" page running: import, init, render one shape, pan/zoom.
- Measure bundle size (min+gzip) of the smallest viable import.
- Note licence, last commit, issue activity, bus factor.
- Kill candidates that are clearly disqualified.

**Decision point:** narrow to ≤2 finalists plus from-scratch.

### 0b. Vertical-slice prototype (~5 days, ~2.5 per finalist)

Build the *same* minimal slice on each finalist so we compare like-for-like:

- Pan and zoom an effectively-infinite canvas (mouse wheel + drag).
- Load a fixture JSON Canvas with 50 text nodes and 20 edges.
- Render text nodes with markdown content (use bundled `markdown-it`; same renderer across all candidates).
- Drag a node to reposition; emit a `change` event.
- Click a node; show a selection ring.
- Draw a static Bezier edge between two specific nodes.

Skip: undo, edge-create handles, text editing, persistence, multi-select, groups, touch optimisation.

**Per-substrate output:** runnable prototype, bundle-size measurement, 500-node stress test (FPS via DevTools on a generated fixture), one-page notes on what was hard.

### 0c. Joplin webview integration check (~1.5 days, leading candidate only)

- Wrap the prototype in a Joplin plugin shell using `joplin.views.editor.register`.
- Load it as the editor for a sample `.canvas` note.
- Verify: webview loads, no CSP violations, pan/zoom/drag/select work.
- Test on Joplin desktop (macOS) and Android (`adb` for fastest path; iOS deferred to v1).

**Decision point:** does the leading candidate actually work in the target environment? If not, fall back to the second-place finalist or from-scratch.

### 0d. Decision and ADR (~0.5 day)

- Score finalists against the rubric below (prose, not stars — stars introduce false precision).
- Write `docs/adr/0001-substrate.md` with the decision and rejected alternatives.
- Bump PRD to v0.6 with open question #1 marked resolved, citing the ADR.

## Scoring rubric

| Criterion | Weight | What it measures |
|---|---|---|
| Paradigm fit | High | Substrate's mental model vs. node-graph editor with HTML-rich nodes |
| Bundle cost in webview | High | Min+gzip KB for the slice; target core ≤200 KB excluding markdown-it |
| Markdown-in-node feasibility | High | Does rendered HTML inside a node behave correctly under pan/zoom/select? |
| Performance at 500 nodes | Medium | FPS during pan/zoom; target 60fps on midrange hardware |
| Touch and pen on Android webview | Medium | Pan/select work in Joplin Android |
| Theming hooks | Medium | CSS variables can drive colours; inherits Joplin theme |
| Build complexity to MVP | Medium | Rough glue-line estimate from prototype to MVP |
| Maintenance risk | Low | Activity, bus factor, age, dependency surface |

**Auto-disqualifiers:** incompatible licence (AGPL/GPL), bundle >300 KB at minimum, won't run in Joplin webview.

## Time budget

| Phase | Days | Cumulative |
|---|---:|---:|
| 0a Research and narrow | 1.5 | 1.5 |
| 0b Vertical-slice prototypes | 5.0 | 6.5 |
| 0c Webview integration check | 1.5 | 8.0 |
| 0d Decision and ADR | 0.5 | 8.5 |
| Buffer (one slip absorbed) | 1.5 | 10.0 |

If we hit the buffer, we make the call with whatever data we have. No expanding the spike.

## Deliverables

1. `spike/substrate` branch holding finalist prototypes (kept for reference, never merged to `main`)
2. `docs/phase0-measurements.md` — raw bundle and FPS numbers per substrate
3. `docs/adr/0001-substrate.md` — the decision
4. PRD bump to v0.6 marking open question #1 resolved

## Commit plan

| # | Commit message | Contents |
|---|---|---|
| 1 | `docs: add phase-0 substrate spike scope` | this document |
| 2 | `chore: scaffold spike/substrate branch with shared fixtures` | fixture JSON, markdown-it baseline harness |
| 3 | `spike: js-draw paradigm-fit check` | hello-world + kill/keep note |
| 4 | `spike: hesprs/json-canvas-viewer evaluation` | hello-world + kill/keep note |
| 5 | `spike: weave.js vertical slice` | the 50-node prototype (if a finalist) |
| 6 | `spike: from-scratch vertical slice` | the 50-node prototype |
| 7 | `docs: add phase-0 measurements` | bundle and FPS data |
| 8 | `docs: add ADR 0001 substrate decision` | the ADR |
| 9 | `docs: bump PRD to v0.6, resolve open question #1` | PRD update citing the ADR |

Some commits will be skipped if a candidate dies in 0a. Spike commits land on `spike/substrate`; only commits 1, 7, 8, 9 reach `main`.
