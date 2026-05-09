# js-canvas — Product Requirements Document

**Status:** Draft v0.4 — drops translucence from v1, adds weave.js as a substrate candidate, clarifies the parallel library + plugin development model. Open questions tracked at the end.

## Purpose

js-canvas is an MIT-licensed library for embedding an interactive [JSON Canvas](https://jsoncanvas.org/) editor into web applications. It exists because no open-source interactive JSON Canvas implementation currently exists outside Obsidian itself — every published library is a parser, static renderer, or viewer ([apps & libraries directory](https://jsoncanvas.org/docs/apps/)).

The library is host-agnostic: a single implementation should serve Joplin, Obsidian-compatible tooling, vanilla web apps, and future consumers without baking in any one host's assumptions.

## Why a library, not a Joplin-only plugin

Primary v1 consumer is a Joplin plugin (per [Joplin Visual Workspace issue #15193](https://github.com/laurent22/joplin/issues/15193)). The temptation is to build only the plugin and skip the library framing.

We follow the [js-draw](https://github.com/personalizedrefrigerator/js-draw) precedent instead: js-draw was developed in parallel with its Joplin freehand-drawing plugin, so a general-purpose library was established alongside the host-specific application. That model produced a reusable component and a working host integration with a clean seam between the two — without the cost of a later library extraction.

Same approach here: the plugin and the library co-evolve. The plugin is the first real host and validates every library decision. Other hosts (Obsidian-compatible tooling, vanilla web) come later, but the library boundary is in place from day 1.

## Goals

- Read and write JSON Canvas 1.0 losslessly, including unknown-key forward compatibility
- Provide an interactive editing surface usable by hosts that supply rendering and storage hooks
- Remain host-agnostic — no assumptions about a particular note system, file system, or Markdown flavour
- Embeddable in any modern web context: vanilla JS, React, Vue, Preact, plugin webviews
- First-class pointer input — mouse, touch, and pen treated equally
- Small core bundle so embedding cost is acceptable for plugin use
- TypeScript-native with full types exported

## Non-goals

- Not a knowledge-graph or semantic-relationship engine
- Not a full whiteboard tool — freehand drawing belongs in an optional ink layer, not core
- Not opinionated about persistence — emits/consumes JSON Canvas documents, host handles storage
- Not opinionated about Markdown dialect — host injects renderer and editor; library defaults are minimal
- Not a multi-canvas workspace manager — one library instance edits one document
- Not a real-time collaboration engine in v1
- Not a Markdown editor in core — provided as an optional companion package
- Not a fork of Obsidian's canvas — different code, same open spec

## Target consumers

Primary v1 consumer: a Joplin plugin (see [issue #15193](https://github.com/laurent22/joplin/issues/15193)). Secondary consumers anticipated: Obsidian-compatible tooling, lightweight whiteboard apps, anyone needing to author `.canvas` files outside Obsidian.

## Architectural principles

- **Host-agnostic core.** No `fetch`, no storage, no fixed Markdown flavour, no fixed icon set baked in.
- **Resolver pattern for external resources.** File content, link previews, internal references — all resolved through host-provided callbacks.
- **Event-driven interface.** Library emits events; host subscribes and responds.
- **Lossless round-trip.** Loading and saving an unmodified document produces a byte-identical JSON Canvas document, modulo property ordering.
- **No global state.** Multiple instances on a page must work independently.
- **CSS-variable theming.** No hardcoded colours, borders, or spacing.

## Scope ranking

- **POC** — proof of concept. Throwaway demos to de-risk the substrate. Not for users.
- **MVP** — simplest version useful to a real user. Shippable as v0.x. A user with this version can create text-and-edge canvases; nodes can reference notes by ID.
- **v1** — production-stable first release. What we'd want before announcing publicly and before Joplin would ship the plugin to general users.
- **v2** — post-v1 extensions and refinements.

| Capability | POC | MVP | v1 | v2 |
|---|:-:|:-:|:-:|:-:|
| Pan/zoom canvas | ✓ | ✓ | ✓ | ✓ |
| Drag-to-move single node | ✓ | ✓ | ✓ | ✓ |
| JSON Canvas 1.0 parser/serialiser | | ✓ | ✓ | ✓ |
| Lossless round-trip incl. unknown keys | | ✓ | ✓ | ✓ |
| Create text node (double-click) | | ✓ | ✓ | ✓ |
| Inline edit text node (host-supplied editor) | | ✓ | ✓ | ✓ |
| Create edge (drag-from-handle) | | ✓ | ✓ | ✓ |
| Delete node/edge | | ✓ | ✓ | ✓ |
| Single-select | | ✓ | ✓ | ✓ |
| Resolver hook: file node (read) | | ✓ | ✓ | ✓ |
| Resolver hook: link node (read) | | ✓ | ✓ | ✓ |
| `change` / `requestOpen` events | | ✓ | ✓ | ✓ |
| `loadDocument` / `getDocument` | | ✓ | ✓ | ✓ |
| Read-only mode | | | ✓ | ✓ |
| Undo/redo (linear) | | | ✓ | ✓ |
| CSS-variable theming complete | | | ✓ | ✓ |
| Accessibility baseline (ARIA/focus/motion) | | | ✓ | ✓ |
| Mobile touch input fully working | | | ✓ | ✓ |
| Optional `js-canvas-editor-default` companion (textarea + markdown-it) | | | ✓ | ✓ |
| Multi-select + marquee | | | | ✓ |
| Resize handles | | | | ✓ |
| Edge labels (create/edit) | | | | ✓ |
| Edge directionality 3-state UX | | | | ✓ |
| Group nodes (visual containment) | | | | ✓ |
| Keyboard graph navigation | | | | ✓ |
| Z-order commands | | | | ✓ |
| Inline editing of file-node content (writer hook) | | | | ✓ |
| Optional CodeMirror editor module | | | | ✓ |
| Optional minimap module | | | | ✓ |
| Optional ink overlay (if js-draw substrate) | | | | ✓ |
| Custom node-type registry | | | | ✓ |
| Image export (PNG/SVG) | | | | ✓ |
| Real-time collaboration adapter | | | | ✓ |

## Functional requirements

### Data model (MVP)

- Full coverage of JSON Canvas 1.0 node types: `text`, `file`, `link`, `group`
- Full coverage of edges: `fromNode`, `toNode`, optional `fromSide`/`toSide` (`top|right|bottom|left`), optional `fromEnd`/`toEnd` (`none|arrow`), optional `label`, optional `color`
- Both preset colour values (`"1"`–`"6"`) and hex (`"#RRGGBB"`) per spec
- Z-order maintained via array position in `nodes` array, per spec semantics
- Unknown top-level keys preserved on round-trip per the spec's forward-compatibility clause
- Document validation on load; malformed input rejected with structured errors

### Viewport & rendering

- Effectively infinite canvas — pan and zoom without arbitrary content bounds (POC)
- Zoom range at least 10%–1000% (MVP)
- 60fps pan/zoom up to 500 nodes on midrange hardware (v1); degrade gracefully beyond
- Off-viewport culling for nodes outside the visible area (v1)
- Fit-to-content and fit-to-selection commands (v1)

### Modes (v1)

The canvas operates in one of two modes, toggled at runtime via `setReadOnly(boolean)`:

- **Edit mode** (default): editing affordances visible (edge-creation handles on hover, selection rings); drag-to-move, create-node, create-edge, and delete enabled; double-click on a text node enters source-editing state for that node.
- **Read-only mode**: affordances hidden; pan and zoom remain available; double-click does not enter source-editing; activating a file/link node still emits `requestOpen`.

A separate orthogonal axis: text-node *content presentation* (rendered Markdown vs raw Markdown source) is a per-node state, not a canvas-wide mode. Read-only mode disables entry into source-editing for all nodes.

### Interaction model

| Action | Input | Phase |
|---|---|---|
| Pan | Middle-click drag, space+drag, two-finger touch | MVP |
| Zoom | Mouse wheel, pinch, `+`/`-` keys | MVP |
| Select node/edge | Click | MVP |
| Move selection | Drag | MVP |
| Create text node | Double-click empty space | MVP |
| Edit text node | Double-click node, or Enter on selection | MVP |
| Create edge | Drag from edge handle on hovered node | MVP |
| Delete | Backspace / Delete | MVP |
| Activate file/link node | Single click → `requestOpen` event | MVP |
| Undo / redo | Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z | v1 |
| Toggle read-only | Programmatic / runtime | v1 |

### Markdown editor — optional companion (v1)

The library does **not** bundle a Markdown editor in core. Hosts that already have one (Joplin, Obsidian) wire their own via `setEditor(editorImpl)`. For hosts that don't, we publish an optional companion package `js-canvas-editor-default` (plain textarea for editing + `markdown-it` for view-mode rendering) that can be opted in. This keeps the core bundle small and avoids duplicating editor code that hosts already ship.

### Node behaviour

- **Text** (MVP): inline editing in edit mode (host-supplied editor); rendered preview in view mode (host-supplied renderer)
- **File** (MVP): read-only render via host resolver showing content (image, document title, custom thumbnail) and click handler via `requestOpen`
- **Link** (MVP): placeholder showing the URL; host can inject preview metadata (title, favicon, OG image)
- **Group** (v2): visual container with label; selectable as a unit

Inline editing of file-node *content* (live editing of an embedded note inside the canvas) is a v2 hypothesis, gated on a host providing a `writeFileNode` hook. Validate demand from real users before designing it; the simpler path (click a file node → host opens that note in its own editor via `requestOpen`) covers the spatial-workspace use case.

### Edges

- Smooth Bezier curves between attached node sides (MVP)
- Selectable; selected edges expose label edit (v2)
- Endpoint markers per spec (`none`, `arrow`); 3-state UX toggle (v2)
- Advanced routing (orthogonal, A*, obstacle-avoidance) — v2

### Persistence & API surface (MVP)

```ts
interface JsCanvas {
  // Document I/O
  loadDocument(doc: JSONCanvasDocument): void
  getDocument(): JSONCanvasDocument

  // Mode
  setReadOnly(readonly: boolean): void

  // Host bindings
  setHost(host: HostBindings): void
  setEditor(editor: EditorImpl): void

  // Events
  on(event: 'change', handler: (patch: DocumentPatch) => void): void
  on(event: 'select', handler: (sel: Selection) => void): void
  on(event: 'viewport', handler: (vp: Viewport) => void): void
  on(event: 'requestOpen', handler: (node: Node) => void): void
  on(event: 'error', handler: (err: Error) => void): void

  // Lifecycle
  destroy(): void
}
```

`change` emits a patch, not the whole document, so hosts can apply changes incrementally and keep `getDocument` cheap. Granular mutation methods (`insertNode`, `updateEdge`, etc.) are deferred until a host actually needs them.

### Resolver hooks (host-injected)

- `resolveFileNode(ref: string) → { renderer?: () => DOMElement, label?: string }` — host returns how to render and label this file reference (MVP)
- `resolveLinkNode(url: string) → { renderer?: () => DOMElement, label?: string }` — host returns preview/label (MVP)
- `writeFileNode(ref: string, content: string) → Promise<void>` — host accepts content updates; presence enables inline file-node editing (v2)
- All resolvers may return Promises; library handles loading state
- All resolvers are optional — defaults are sensible placeholders

In Joplin, `resolveFileNode` interprets `:/noteid` and fetches via the data API. In Obsidian-compat mode, vault-relative paths. In a vanilla web demo, an HTTP fetch.

## Non-functional requirements

- **Bundle size:** core under ~200 KB minified+gzipped, excluding host-injected renderers. Optional `js-canvas-editor-default` adds ~50 KB.
- **Browser support:** evergreen (last 2 stable Chrome/Firefox/Safari/Edge); ES2020 minimum
- **Mobile:** working on iOS Safari and Android Chrome; touch and pen first-class (v1)
- **Accessibility (v1):** ARIA labels, focus indicators, `prefers-reduced-motion` respected
- **TypeScript:** full types exported, strict mode clean
- **Tests:** 100% spec round-trip on the spec's own fixtures (MVP); interaction tests via headless browser (v1)
- **No network from core.** No telemetry, no analytics, no auto-update, no remote font loading
- **Licence:** MIT, with attribution to JSON Canvas spec contributors

## UX principles

- **Direct manipulation.** Click a thing, drag a thing. No hidden menus for primary actions.
- **Visible selection.** What is selected is unambiguous at a glance.
- **Convention over invention.** Where Figma, Miro, and Obsidian Canvas agree on a gesture, follow them.
- **No modals in core.** Library puts no dialogs on the page; host wraps the canvas with whatever chrome it wants.
- **Theming via CSS variables.** Every visual decision has a token; no hardcoded colour anywhere in core.

## Success criteria

The library is ready to be called v1 when:

- The Joplin plugin built on this library is merged or accepted by laurent22 (closes [#15193](https://github.com/laurent22/joplin/issues/15193) or its plugin equivalent)
- 100% round-trip on the JSON Canvas spec fixtures
- A second host has consumed the library (vanilla web demo at minimum; ideally Obsidian-compatible tooling)
- Interaction tests cover the MVP gesture matrix on desktop and mobile touch

## Open questions

1. **Substrate.** [js-draw](https://github.com/personalizedrefrigerator/js-draw) / [hesprs/json-canvas-viewer](https://github.com/hesprs/json-canvas-viewer) / [weave.js](https://github.com/InditexTech/weave-js) (Inditex, Jan 2026) / from-scratch. **Resolved by a 1–2 week phase-0 spike before further PRD commitment.** weave.js is the newest candidate and gives pan/zoom/selection/drag for free, at the cost of writing a JSON Canvas ↔ weave-state adapter and pulling in collaboration code we may not need yet.
2. **Default Markdown library** for the optional editor companion. Lean: `markdown-it` (more extensible than `marked`, similar size).
3. **Undo/redo location.** In-core (cleaner UX) vs. host responsibility. Lean: in-core, simple linear history, with a hook for hosts that want to integrate with their own undo stack.
4. **Markdown renderer contract.** Tight (specific HAST/MDAST shape) vs. loose (host returns any DOM). Lean: loose.
5. **Partial-load behaviour.** Lean: strict reject on validation failure in v1.
6. **Internationalisation.** Library has minimal UI strings — likely a `strings` option on construction.

## References

- [JSON Canvas spec 1.0](https://jsoncanvas.org/spec/1.0)
- [JSON Canvas apps & libraries directory](https://jsoncanvas.org/docs/apps/)
- [Obsidian Canvas help](https://help.obsidian.md/plugins/canvas)
- [js-draw — substrate candidate and parallel-development precedent](https://github.com/personalizedrefrigerator/js-draw)
- [hesprs/json-canvas-viewer — substrate candidate](https://github.com/hesprs/json-canvas-viewer)
- [weave.js — substrate candidate](https://github.com/InditexTech/weave-js)
- [Advanced Canvas — feature reference, GPL-3.0, not reusable as code](https://github.com/Developer-Mike/obsidian-advanced-canvas)
- [Joplin plugin API](https://joplinapp.org/api/references/plugin_api/)
- [Joplin Visual Workspace issue #15193](https://github.com/laurent22/joplin/issues/15193)
- [YesYouKan plugin — editor-replacement pattern reference](https://github.com/joplin/plugin-yesyoukan)
