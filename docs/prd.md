# js-canvas — Product Requirements Document

**Status:** Draft v0.6 — substrate decision resolved (hesprs/json-canvas-viewer with wrap-and-extend, see [ADR 0001](adr/0001-substrate.md)). Plugin-first framing from v0.5 stands. Open questions tracked at the end.

## Purpose

js-canvas is a Joplin plugin that adds an interactive [JSON Canvas](https://jsoncanvas.org/) editor for `.canvas`-style notes. It exists because no open-source interactive JSON Canvas implementation currently exists outside Obsidian itself — every published library is a parser, static renderer, or viewer ([apps & libraries directory](https://jsoncanvas.org/docs/apps/)). Joplin's maintainer has flagged a Visual Workspace as high-priority ([issue #15193](https://github.com/laurent22/joplin/issues/15193)); this plugin is the response.

The plugin's internal canvas core is structured to be extractable as a host-agnostic library when (and only when) a second host commits. Until then, we don't pay the cost of designing for unknown consumers.

## Why plugin-first, library later

The temptation is to design a host-agnostic library from day 1 and consume it from a Joplin plugin. The cleaner cost-aware path is the reverse:

- We have one concrete consumer (Joplin). The resolver/host-binding pattern abstracts from a single example, which is the textbook way to produce wrong abstractions.
- The substrate is undecided. Designing host-agnostic seams before knowing the substrate's shape is double speculation.
- v1 scope is large for one person. Plugin-first lets us cut more aggressively because we can lean on Joplin specifics (markdown rendering, data API, command bus, theming context).
- Library extraction at the end is a well-known pattern. [js-draw](https://github.com/personalizedrefrigerator/js-draw) co-publishes its core and its Joplin freehand-drawing plugin; we can follow that outcome by induction once the seams have been validated by real plugin use.

The discipline that makes extraction cheap later: **the canvas core has no Joplin imports.** Joplin host glue (data fetching, command execution, webview message bus, settings) lives in a thin adapter module outside the core. We pay the module-boundary cost on day 1 because it's small; we don't pay the package-publication cost until there's a reason to.

## Goals

- Read and write JSON Canvas 1.0 losslessly, including unknown-key forward compatibility
- Provide an interactive editing surface inside a Joplin webview, replacing Joplin's editor for canvas-flavoured notes (via `joplin.views.editor.register`)
- Keep a clean internal seam between canvas core (no Joplin imports) and Joplin adapter
- First-class pointer input — mouse, touch, and pen treated equally
- Small webview bundle so plugin load is fast
- TypeScript-native with full types within the plugin

## Non-goals

- Not a knowledge-graph or semantic-relationship engine
- Not a full whiteboard tool — freehand drawing belongs in an optional ink layer, not core
- Not a published library in v1 — extraction deferred until a second host commits
- Not a Markdown editor for *other* notes — Joplin's editor handles those; we only edit text-node content inside the canvas
- Not a real-time collaboration engine in v1
- Not a multi-canvas workspace manager — one plugin instance edits one canvas note at a time
- Not a fork of Obsidian's canvas — different code, same open spec

## Target users

Primary v1 users: Joplin desktop and mobile users who want a spatial canvas inside their note workspace. Secondary anticipated: anyone who currently uses Obsidian Canvas and wants the same affordance in Joplin.

## Architectural principles

- **Plugin-first, library-extractable.** Canvas core has no Joplin imports; Joplin glue lives in a thin adapter outside.
- **Resolver pattern at the core boundary.** Canvas core asks its adapter to resolve file/link references; the core does not know what Joplin is.
- **Event-driven core boundary.** Core emits events; adapter subscribes and translates to Joplin commands.
- **Lossless round-trip.** Loading and saving an unmodified canvas note produces a byte-identical JSON Canvas document, modulo property ordering.
- **No global state.** Multiple canvas notes open in different windows must work independently.
- **CSS-variable theming.** No hardcoded colours, borders, or spacing; canvas inherits Joplin's theme tokens by default.

## Scope ranking

- **POC** — proof of concept. Throwaway demos to de-risk the substrate. Not for users.
- **MVP** — simplest version useful to a real user. Shippable as v0.x. A Joplin user with this version can create text-and-edge canvases; nodes can reference other Joplin notes by ID.
- **v1** — production-stable first release. What we'd want before submitting to Joplin's plugin repository for general users.
- **v2** — post-v1 extensions and refinements.

| Capability | POC | MVP | v1 | v2 |
|---|:-:|:-:|:-:|:-:|
| Pan/zoom canvas | ✓ | ✓ | ✓ | ✓ |
| Drag-to-move single node | ✓ | ✓ | ✓ | ✓ |
| JSON Canvas 1.0 parser/serialiser | | ✓ | ✓ | ✓ |
| Lossless round-trip incl. unknown keys | | ✓ | ✓ | ✓ |
| Create text node (double-click) | | ✓ | ✓ | ✓ |
| Inline edit text node (textarea + markdown-it preview) | | ✓ | ✓ | ✓ |
| Create edge (drag-from-handle) | | ✓ | ✓ | ✓ |
| Delete node/edge | | ✓ | ✓ | ✓ |
| Single-select | | ✓ | ✓ | ✓ |
| File-node click → `joplin.commands.execute('openNote', id)` | | ✓ | ✓ | ✓ |
| Link-node click → open URL | | ✓ | ✓ | ✓ |
| Editor activation via `joplin.views.editor.register` | | ✓ | ✓ | ✓ |
| Read-only mode | | | ✓ | ✓ |
| Undo/redo (linear) | | | ✓ | ✓ |
| CSS-variable theming inherits Joplin theme | | | ✓ | ✓ |
| Accessibility baseline (ARIA/focus/motion) | | | ✓ | ✓ |
| Mobile touch input fully working | | | ✓ | ✓ |
| Multi-select + marquee | | | | ✓ |
| Resize handles | | | | ✓ |
| Edge labels (create/edit) | | | | ✓ |
| Edge directionality 3-state UX | | | | ✓ |
| Group nodes (visual containment) | | | | ✓ |
| Keyboard graph navigation | | | | ✓ |
| Z-order commands | | | | ✓ |
| Inline editing of file-node content (writer hook) | | | | ✓ |
| Optional CodeMirror editor | | | | ✓ |
| Optional minimap | | | | ✓ |
| Optional ink overlay | | | | ✓ |
| Custom node-type registry | | | | ✓ |
| Image export (PNG/SVG) | | | | ✓ |
| Real-time collaboration adapter | | | | ✓ |
| **Library extraction (publish canvas core as package)** | | | | ✓ |

## Functional requirements

### Data model (MVP)

- Full coverage of JSON Canvas 1.0 node types: `text`, `file`, `link`, `group`
- Full coverage of edges: `fromNode`, `toNode`, optional `fromSide`/`toSide` (`top|right|bottom|left`), optional `fromEnd`/`toEnd` (`none|arrow`), optional `label`, optional `color`
- Both preset colour values (`"1"`–`"6"`) and hex (`"#RRGGBB"`) per spec
- Z-order maintained via array position in `nodes` array, per spec semantics
- Unknown top-level keys preserved on round-trip per the spec's forward-compatibility clause
- Document validation on load; malformed input rejected with structured errors

### Joplin integration (MVP)

- Register as an editor plugin via `joplin.views.editor.register`
- `onActivationCheck` returns true for notes containing JSON Canvas data (detection by JSON sniffing or a marker)
- `onUpdate` reloads the canvas when Joplin reports the underlying note has changed
- `saveNote` persists the canvas back to the note body as JSON Canvas
- Reference YesYouKan plugin as the editor-replacement pattern reference
- Run inside a Joplin webview; communicate with the plugin host via `postMessage`
- Bundle markdown-it inside the webview for text-node view-mode rendering (Joplin does not expose its renderer to plugins)

### Viewport & rendering

- Effectively infinite canvas — pan and zoom without arbitrary content bounds (POC)
- Zoom range at least 10%–1000% (MVP)
- 60fps pan/zoom up to 500 nodes on midrange hardware (v1); degrade gracefully beyond
- Off-viewport culling for nodes outside the visible area (v1)
- Fit-to-content and fit-to-selection commands (v1)

### Modes (v1)

The canvas operates in one of two modes, toggled at runtime:

- **Edit mode** (default): editing affordances visible (edge-creation handles on hover, selection rings); drag-to-move, create-node, create-edge, and delete enabled; double-click on a text node enters source-editing state for that node.
- **Read-only mode**: affordances hidden; pan and zoom remain available; double-click does not enter source-editing; activating a file/link node still triggers an open action.

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
| Activate file/link node | Single click → open note in Joplin / open URL | MVP |
| Undo / redo | Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z | v1 |
| Toggle read-only | Programmatic / runtime | v1 |

### Text-node editing (MVP)

Text nodes are edited inline with a textarea inside the canvas webview. View-mode rendering uses bundled `markdown-it` (CommonMark + GFM). The plugin does **not** try to embed Joplin's note editor inside a node — Joplin's plugin API does not expose the editor for embedding, and reaching for it would be the wrong abstraction. For richer editing of an embedded note, see the next section.

The internal canvas core exposes a `setEditor(editorImpl)` seam so the textarea can be swapped for CodeMirror or another editor in v2 without touching core. Same seam is what would later let a different host plug its own editor in if the core is extracted.

### Embedded-note interaction (MVP)

When the user clicks a file node referencing another Joplin note, the canvas posts a message to the plugin host, which calls `joplin.commands.execute('openNote', noteId)`. Joplin switches to that note. This is the "spatial workspace" interaction model: the canvas is a *map* of notes, not a workspace that edits them in place.

Inline editing of an embedded note's *content* inside the canvas is a v2 hypothesis, gated on demonstrated user demand.

### Node behaviour

- **Text** (MVP): inline textarea editing in edit mode; markdown-it preview in view mode
- **File** (MVP): rendered placeholder (note title fetched via `joplin.data.get`); click triggers `openNote`
- **Link** (MVP): placeholder showing the URL; click opens the URL externally
- **Group** (v2): visual container with label; selectable as a unit

### Edges

- Smooth Bezier curves between attached node sides (MVP)
- Selectable; selected edges expose label edit (v2)
- Endpoint markers per spec (`none`, `arrow`); 3-state UX toggle (v2)
- Advanced routing (orthogonal, A*, obstacle-avoidance) — v2

### Canvas core internal API (MVP)

This is the boundary between the canvas core and the Joplin adapter. It is not a published library API in v1; it is the seam we'd extract along later.

```ts
interface CanvasCore {
  loadDocument(doc: JSONCanvasDocument): void
  getDocument(): JSONCanvasDocument

  setReadOnly(readonly: boolean): void

  setAdapter(adapter: HostAdapter): void
  setEditor(editor: EditorImpl): void

  on(event: 'change', handler: (patch: DocumentPatch) => void): void
  on(event: 'select', handler: (sel: Selection) => void): void
  on(event: 'viewport', handler: (vp: Viewport) => void): void
  on(event: 'requestOpen', handler: (node: Node) => void): void
  on(event: 'error', handler: (err: Error) => void): void

  destroy(): void
}
```

`change` emits a patch, not the whole document, so the adapter can save incrementally. Granular mutation methods (`insertNode`, `updateEdge`, etc.) are deferred until needed.

### Host adapter interface (MVP, internal)

The Joplin adapter implements:

- `resolveFileNode(ref: string) → { renderer?: () => DOMElement, label?: string }` — for `:/noteid` refs, fetches via `joplin.data` and returns title/preview
- `resolveLinkNode(url: string) → { renderer?: () => DOMElement, label?: string }` — returns URL preview
- `requestOpen(node: Node)` — calls `joplin.commands.execute('openNote', id)` for file nodes; opens external URL for link nodes
- `writeFileNode(ref, content)` — v2; absent in v1

In v2, if the adapter interface stabilises and a second host appears, the canvas core can be extracted as `js-canvas` (or similar) without changing the adapter shape. Until then, this lives inside the plugin as internal types.

## Non-functional requirements

- **Webview bundle size:** under ~250 KB minified+gzipped including markdown-it
- **Browser support:** Joplin's webview environment (recent Electron Chromium on desktop; iOS WebView and Android WebView on mobile)
- **Mobile:** working on Joplin iOS and Android; touch and pen first-class (v1)
- **Accessibility (v1):** ARIA labels, focus indicators, `prefers-reduced-motion` respected
- **TypeScript:** strict mode clean throughout
- **Tests:** 100% spec round-trip on the JSON Canvas spec fixtures (MVP); interaction tests via headless browser (v1)
- **No network from the canvas core.** All network goes through the Joplin adapter or Joplin itself.
- **Licence:** MIT, with attribution to JSON Canvas spec contributors

## UX principles

- **Direct manipulation.** Click a thing, drag a thing. No hidden menus for primary actions.
- **Visible selection.** What is selected is unambiguous at a glance.
- **Convention over invention.** Where Figma, Miro, and Obsidian Canvas agree on a gesture, follow them.
- **No modals from the canvas itself.** The plugin may use Joplin dialogs for secondary flows, but the canvas surface stays uncluttered.
- **Theming inherits Joplin.** Every visual decision uses a CSS variable that defaults to Joplin's theme tokens.

## Success criteria

The plugin is ready to be called v1 when:

- The plugin is accepted into Joplin's plugin repository (or merged if the route is upstream)
- 100% round-trip on the JSON Canvas spec fixtures
- Interaction tests cover the MVP gesture matrix on desktop and mobile touch
- Canvas core has zero `joplin` / `webviewApi` / Joplin-API imports — verified by import-boundary lint rule
- The Joplin Visual Workspace issue ([#15193](https://github.com/laurent22/joplin/issues/15193)) is closed or its acceptance criteria are met

Library extraction is **not** a v1 success criterion. It becomes a goal only if a second host (e.g. an Obsidian-compatible tool) commits to consuming the canvas core.

## Open questions

1. **Substrate.** ✅ **Resolved**: [hesprs/json-canvas-viewer](https://github.com/hesprs/json-canvas-viewer) with the wrap-and-extend pattern. Pinned dep version, capture-phase pointer listeners + `stopPropagation()` to claim gestures from `pointeract`, private-API touchpoints wrapped in helpers with regression tests. Fork stays available as a v2 fallback. See [ADR 0001](adr/0001-substrate.md) for the full rationale and the rejected alternatives.
2. **Undo/redo location.** In-core (cleaner UX) vs. delegated to Joplin's undo. Lean: in-core, simple linear history scoped to the canvas note.
3. **Markdown renderer contract.** Tight (specific HAST/MDAST shape) vs. loose (any DOM). Lean: loose.
4. **Partial-load behaviour.** Lean: strict reject on validation failure in v1; user gets a clear error and a way to view the raw JSON.
5. **Internationalisation.** Plugin has minimal UI strings — match Joplin's i18n approach (`_()` helper) for strings exposed to the user.

## References

- [JSON Canvas spec 1.0](https://jsoncanvas.org/spec/1.0)
- [JSON Canvas apps & libraries directory](https://jsoncanvas.org/docs/apps/)
- [Obsidian Canvas help](https://help.obsidian.md/plugins/canvas)
- [Joplin plugin API](https://joplinapp.org/api/references/plugin_api/)
- [Joplin Visual Workspace issue #15193](https://github.com/laurent22/joplin/issues/15193)
- [YesYouKan plugin — editor-replacement pattern reference](https://github.com/joplin/plugin-yesyoukan)
- [Joplin Excalidraw plugin — modal-popup pattern (not what we want, but useful contrast)](https://github.com/artikell/joplin-excalidraw)
- [js-draw — substrate candidate, library-extraction precedent](https://github.com/personalizedrefrigerator/js-draw)
- [hesprs/json-canvas-viewer — chosen substrate (ADR 0001)](https://github.com/hesprs/json-canvas-viewer)
- [pointeract — gesture library bundled by hesprs](https://github.com/hesprs/pointeract)
- [weave.js — substrate candidate, rejected (ADR 0001)](https://github.com/InditexTech/weavejs)
- [Advanced Canvas — feature reference, GPL-3.0, not reusable as code](https://github.com/Developer-Mike/obsidian-advanced-canvas)
- [ADR 0001 — substrate decision](adr/0001-substrate.md)
- [Phase 0 spike notes](phase0-notes.md), [hesprs architecture investigation](phase0b-hesprs-architecture.md), [drag spike findings](phase0b-drag-spike.md)
