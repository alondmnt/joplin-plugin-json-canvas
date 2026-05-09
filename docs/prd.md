# js-canvas — Product Requirements Document

**Status:** Draft v0.3 — adds a Modes section clarifying view/edit/read-only semantics, plus a note on js-draw's SVG export as a v2 image-export starting point. Open questions tracked at the end.

## Purpose

js-canvas is an MIT-licensed library for embedding an interactive [JSON Canvas](https://jsoncanvas.org/) editor into web applications. It exists because no open-source interactive JSON Canvas implementation currently exists outside Obsidian itself — every published library is either a parser, a static renderer, or a viewer-only tool ([apps & libraries directory](https://jsoncanvas.org/docs/apps/)).

The library is intended to be host-agnostic: a single implementation should serve Joplin, Obsidian-compatible tooling, vanilla web apps, and future consumers without baking in any one host's assumptions.

## Goals

- Read and write JSON Canvas 1.0 losslessly, including unknown-key forward compatibility
- Provide an interactive editing surface with a **built-in Markdown editor** for text content — usable end-to-end without any host editor
- Support **translucence** (inline editing of embedded notes) when the host provides read+write hooks, without requiring the host to embed its own editor
- Remain host-agnostic — no assumptions about a particular note system, file system, or Markdown flavour
- Embeddable in any modern web context: vanilla JS, React, Vue, Preact, plugin webviews
- First-class pointer input — mouse, touch, and pen treated equally
- Small core bundle so embedding cost is acceptable for plugin use
- TypeScript-native with full types exported

## Non-goals

- Not a knowledge-graph or semantic-relationship engine
- Not a full whiteboard tool — freehand drawing belongs in an optional ink layer, not core
- Not opinionated about persistence — emits/consumes JSON Canvas documents, host handles storage
- Not opinionated about which Markdown dialect to support — defaults to CommonMark + GFM, host can extend or replace
- Not a multi-canvas workspace manager — one library instance edits one document
- Not a real-time collaboration engine in v1 (deferred to optional v2 module)
- Not a CLI or build-time tool — runtime library only
- Not a search engine — host indexes the JSON Canvas document body
- Not a fork of Obsidian's canvas — different code, same open spec

## Target consumers

Primary v1 consumer: a Joplin plugin (see [Joplin Visual Workspace issue #15193](https://github.com/laurent22/joplin/issues/15193)). Secondary consumers anticipated: Obsidian-compatible tooling, lightweight whiteboard apps, learning/teaching tools, anyone needing to author `.canvas` files outside Obsidian.

## Architectural principles

- **Host-agnostic core.** No `fetch`, no storage, no fixed Markdown flavour, no fixed icon set baked in.
- **Editor included.** Library ships a working Markdown editor for text nodes; host can swap it.
- **Resolver pattern for external resources.** File content, link previews, internal references — all resolved through host-provided callbacks. Hosts that supply both reader and writer get translucence.
- **Event-driven interface.** Library emits events; host subscribes and responds.
- **Lossless round-trip.** Loading and saving an unmodified document produces a byte-identical JSON Canvas document, modulo property ordering.
- **No global state.** Multiple instances on a page must work independently.
- **CSS-variable theming.** No hardcoded colours, borders, or spacing.

## Scope ranking

Every functional requirement is tagged with one of:

- **POC** — proof of concept. "Is this even feasible?" Throwaway demos to de-risk the approach. Not for users.
- **MVP** — simplest version useful to a real user. Shippable as v0.x. A user with this version can create text-and-edge canvases and have notes referenced by ID.
- **v1** — production-stable first release. What we'd want before announcing publicly and before Joplin would ship the plugin to general users.
- **v2** — post-v1 extensions and refinements.

| Capability | POC | MVP | v1 | v2 |
|---|:-:|:-:|:-:|:-:|
| Pan/zoom canvas | ✓ | ✓ | ✓ | ✓ |
| Hardcoded nodes render (no spec parser) | ✓ | | | |
| Drag-to-move single node | ✓ | ✓ | ✓ | ✓ |
| JSON Canvas 1.0 parser/serialiser | | ✓ | ✓ | ✓ |
| Lossless round-trip incl. unknown keys | | ✓ | ✓ | ✓ |
| Built-in Markdown editor for text nodes | | ✓ | ✓ | ✓ |
| Create text node (double-click) | | ✓ | ✓ | ✓ |
| Inline edit text node | | ✓ | ✓ | ✓ |
| Create edge (drag-from-handle) | | ✓ | ✓ | ✓ |
| Delete node/edge | | ✓ | ✓ | ✓ |
| Single-select | | ✓ | ✓ | ✓ |
| Resolver hook: file node (read) | | ✓ | ✓ | ✓ |
| Resolver hook: link node (read) | | ✓ | ✓ | ✓ |
| `change` / `requestOpen` events | | ✓ | ✓ | ✓ |
| `insertNode` / `updateNode` / `removeNode` | | ✓ | ✓ | ✓ |
| `loadDocument` / `getDocument` | | ✓ | ✓ | ✓ |
| Multi-select + marquee | | | ✓ | ✓ |
| Resize handles | | | ✓ | ✓ |
| Edge labels (create/edit) | | | ✓ | ✓ |
| Edge directionality 3-state UX | | | ✓ | ✓ |
| Group nodes (visual containment) | | | ✓ | ✓ |
| Read-only mode | | | ✓ | ✓ |
| Undo/redo (linear) | | | ✓ | ✓ |
| Keyboard graph navigation | | | ✓ | ✓ |
| Z-order commands | | | ✓ | ✓ |
| CSS-variable theming complete | | | ✓ | ✓ |
| Accessibility baseline (ARIA/focus/motion) | | | ✓ | ✓ |
| Mobile touch input fully working | | | ✓ | ✓ |
| **Translucence** (editable file nodes via writer hook) | | | | ✓ |
| Optional CodeMirror editor module | | | | ✓ |
| Optional minimap module | | | | ✓ |
| Optional ink overlay (if js-draw substrate) | | | | ✓ |
| Custom node-type registry | | | | ✓ |
| Advanced edge routing (orthogonal, A*) | | | | ✓ |
| Custom node shapes (flowchart) | | | | ✓ |
| Spatial keyboard navigation | | | | ✓ |
| Image export (PNG/SVG) | | | | ✓ |
| Presentation mode | | | | ✓ |
| Focus mode (dim non-selected) | | | | ✓ |
| Find-in-canvas | | | | ✓ |
| i18n string injection | | | | ✓ |
| Persistent viewport per document | | | | ✓ |
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
- Zoom range at least 10%–1000%; wider preferred (MVP)
- 60fps pan/zoom up to 500 nodes on midrange hardware (v1); degrade gracefully beyond
- Off-viewport culling for nodes outside the visible area (v1)
- Fit-to-content and fit-to-selection commands (v1)
- Default initial viewport: persist last position per document; fallback to fit-to-content with a max zoom-out cap (v2)

### Modes (v1)

The canvas operates in one of two modes, toggled at runtime via `setReadOnly(boolean)`:

- **Edit mode** (default): editing affordances visible (edge-creation handles on hover, resize handles on selection, selection rings); drag-to-move, create-node, create-edge, and delete enabled; double-click on a text node enters source-editing state for that node.
- **Read-only mode**: affordances hidden; pan and zoom remain available; selection is configurable (default off); double-click does not enter source-editing; activating a file/link node still emits `requestOpen`.

Both modes share the same canvas chrome (positions, edges, viewport) and the same document — the difference is *affordance visibility* and *whether nodes can enter source-editing*, not a structural change to the document.

A separate orthogonal axis: text-node *content presentation* (rendered Markdown vs raw Markdown source) is a per-node state, not a canvas-wide mode. A node in source-editing state shows raw Markdown; a node not in source-editing shows rendered output. Read-only mode disables entry into source-editing for all nodes, so the canvas always shows rendered content.

Image export (v2) is a third path, neither edit nor read-only — a static snapshot of the document with no affordances.

### Interaction model

| Action | Input | Phase |
|---|---|---|
| Pan | Middle-click drag, space+drag, two-finger touch | MVP |
| Zoom | Mouse wheel, pinch, `+`/`-` keys | MVP |
| Select node/edge | Click | MVP |
| Add to selection | Shift+click | v1 |
| Marquee select | Drag empty space | v1 |
| Move selection | Drag | MVP |
| Resize node | Handles on selection | v1 |
| Create text node | Double-click empty space | MVP |
| Edit text node | Double-click node, or Enter on selection | MVP |
| Create edge | Drag from edge handle on hovered node | MVP |
| Delete | Backspace / Delete | MVP |
| Undo / redo | Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z | v1 |
| Activate file/link node | Single click → `requestOpen` event | MVP |
| Edit edge label | Double-click edge | v1 |
| Toggle edge directionality | 3-state context menu (none / uni / bi) | v1 |
| Keyboard graph navigation | Arrow keys, follows edges | v1 |
| Bring to front / send to back | Context menu / shortcut | v1 |
| Toggle read-only | Programmatic / runtime | v1 |
| Inline-edit file node (translucence) | Double-click, if writer hook present | v2 |

### Built-in Markdown editor (MVP)

The library ships with a working Markdown editor used for all text nodes by default. This is what makes the library usable end-to-end without host integration.

- **Default implementation:** plain textarea for editing + `markdown-it` (CommonMark + GFM) for view-mode rendering, toggled by edit/view state. Lightweight; targets the smallest reasonable bundle delta.
- **Mode toggle:** double-click enters edit mode; blur or Esc exits to view mode (matches Obsidian's affordance).
- **Replaceable:** host can swap the editor via `setEditor(editorImpl)` for richer experiences (CodeMirror, ProseMirror, host's own editor).
- **Optional v2 module:** an opt-in CodeMirror 6 editor shipped alongside core for hosts that want a richer experience without writing one.

### Translucence — inline editing of embedded notes (v2)

When a host provides both `resolveFileNode(ref)` (reader) and `writeFileNode(ref, content)` (writer) for a given file type, the library renders that file node as inline-editable using the same Markdown editor used for text nodes.

- Library reads content via the resolver, edits in the canvas, writes back via the writer
- Host owns the underlying note; library never touches host storage directly
- For non-Markdown file types (images, PDFs), translucence does not apply — they remain rendered-only via the resolver's renderer
- Hosts without a native embedded editor (e.g. Joplin) get translucence essentially for free, just by wiring a writer hook

This pattern is the core architectural insight of v0.2: translucence is a *library* capability that hosts opt into, not a *host* capability that the library passively reflects.

### Node behaviour

- **Text** (MVP): inline Markdown editor in edit mode; rendered preview in view mode using the library's default renderer (host can swap)
- **File** (MVP): read-only render via host resolver showing content (image, document title, custom thumbnail) and click handler via `requestOpen`. (v2): editable inline if host provides writer hook
- **Link** (MVP): placeholder showing the URL; host can inject preview metadata (title, favicon, OG image)
- **Group** (v1): visual container with label; selectable as a unit; click-through to interact with children. v1 does not enforce containment when children move out

### Edges

- Smooth Bezier curves between attached node sides (MVP)
- Selectable; selected edges expose label edit (v1)
- Endpoint markers per spec (`none`, `arrow`); 3-state UX toggle in context menu (v1)
- v1 routing: Bezier with side-aware tangents
- Advanced routing (orthogonal, A*, obstacle-avoidance) — v2

### Persistence & API surface (MVP)

```ts
interface JsCanvas {
  // Document I/O
  loadDocument(doc: JSONCanvasDocument): void
  getDocument(): JSONCanvasDocument

  // Granular operations (used by hosts wiring drag-and-drop, paste-URL, etc.)
  insertNode(node: PartialNode, position: { x: number; y: number }): NodeId
  updateNode(id: NodeId, patch: Partial<Node>): void
  removeNode(id: NodeId): void
  insertEdge(edge: PartialEdge): EdgeId
  updateEdge(id: EdgeId, patch: Partial<Edge>): void
  removeEdge(id: EdgeId): void

  // Mode
  setReadOnly(readonly: boolean): void

  // Host bindings
  setHost(host: HostBindings): void
  setEditor(editor: EditorImpl): void

  // Events
  on(event: 'change', handler: (doc: JSONCanvasDocument) => void): void
  on(event: 'select', handler: (sel: Selection) => void): void
  on(event: 'viewport', handler: (vp: Viewport) => void): void
  on(event: 'requestOpen', handler: (node: Node) => void): void
  on(event: 'error', handler: (err: Error) => void): void

  // Lifecycle
  destroy(): void
}
```

### Resolver hooks (host-injected)

- `resolveFileNode(ref: string) → { renderer?: () => DOMElement, label?: string }` — host returns how to render and label this file reference (MVP)
- `writeFileNode(ref: string, content: string) → Promise<void>` — host accepts content updates; presence enables translucence for that file type (v2)
- `resolveLinkNode(url: string) → { renderer?: () => DOMElement, label?: string }` — host returns preview/label (MVP)
- All resolvers may return Promises; library handles loading state
- All resolvers are optional — defaults are sensible placeholders

The resolver pattern is what makes the library host-agnostic. In Joplin, `resolveFileNode` interprets `:/noteid` and fetches via the data API; `writeFileNode` writes back via the same API. In a vanilla web demo, it might fetch a Markdown file over HTTP. In Obsidian-compat mode, vault-relative paths.

## Non-functional requirements

- **Bundle size:** core + default editor under ~150 KB minified+gzipped, excluding host-injected renderers (revisit after substrate decision)
- **Browser support:** evergreen (last 2 stable Chrome/Firefox/Safari/Edge); ES2020 minimum
- **Mobile:** working on iOS Safari and Android Chrome; touch and pen first-class (v1)
- **Accessibility (v1):** keyboard graph navigation across nodes, ARIA labels, focus indicators, `prefers-reduced-motion` respected
- **TypeScript:** full types exported, strict mode clean
- **Tests:** 100% spec round-trip on the spec's own fixtures (MVP); interaction tests via headless browser (v1)
- **No network from core.** No telemetry, no analytics, no auto-update, no remote font loading
- **Licence:** MIT, with attribution to JSON Canvas spec contributors

## UX principles

- **Direct manipulation.** Click a thing, drag a thing. No hidden menus for primary actions.
- **Visible selection.** What is selected is unambiguous at a glance.
- **Helpful empty state.** An empty canvas hints at the first action.
- **Convention over invention.** Where Figma, Miro, and Obsidian Canvas agree on a gesture, follow them.
- **No modals in core.** Library puts no dialogs on the page; host wraps the canvas with whatever chrome it wants.
- **Theming via CSS variables.** Every visual decision has a token; no hardcoded colour anywhere in core.

## Extensibility (v2+)

- **Custom node types** registered as unknown keys for spec-strict interop preservation
- **Optional modules** (each opt-in, tree-shakeable): CodeMirror editor, minimap, ink overlay (if [js-draw](https://github.com/personalizedrefrigerator/js-draw)), collaboration adapter, custom edge routers, image export to PNG/SVG, presentation mode, focus mode, find-in-canvas
- **Image export note:** if js-draw is chosen as substrate, its native SVG output gives a head start, but the actual work is a JSON-Canvas-tree-to-SVG translation layer that walks nodes, edges, and labels. Either way, image export is a separate render path from interactive view mode — no affordances, no selection rings, no edit handles.
- **Theme presets:** default light/dark plus minimal
- **Inspirational features from [Advanced Canvas](https://github.com/Developer-Mike/obsidian-advanced-canvas)** (GPL-3.0, used as feature reference only — not as code we can lift): floating edges (auto-attach side), edge highlighting on selection, encapsulate selection, portals (canvas-in-canvas), collapsible groups, custom node shapes, variable breakpoints, custom colours via CSS

## Open questions

1. **Substrate.** [js-draw](https://github.com/personalizedrefrigerator/js-draw) / fork [hesprs/json-canvas-viewer](https://github.com/hesprs/json-canvas-viewer) / from-scratch. Phase 0 spike to resolve.
2. **Default Markdown flavour.** CommonMark only vs. CommonMark + GFM. Lean: GFM by default (tables and task lists are heavily expected).
3. **Default Markdown library.** `marked` vs `markdown-it`. Both small; `markdown-it` is more extensible. Lean: `markdown-it`.
4. **Editor swap mechanism.** Per-instance via `setEditor()` vs. per-node-type. Lean: per-instance for v1; per-node-type as v2 if anyone asks.
5. **Undo/redo location.** In-core (cleaner UX) vs. host responsibility. Lean: in-core, simple linear history, with a hook for hosts that want to integrate with their own undo stack.
6. **Markdown renderer contract for view-mode.** Tight (specific HAST/MDAST shape) vs. loose (host returns any DOM). Lean: loose.
7. **Z-order commands.** Expose `bringToFront` / `sendToBack` in core, or leave to host? Lean: core.
8. **Edge label positioning.** Midpoint only vs. user-draggable. v1: midpoint only.
9. **Partial-load behaviour.** Strict reject on validation failure vs. load-with-warnings. Lean: strict in v1.
10. **Internationalisation.** Library has minimal UI strings — likely a `strings` option on construction.

## References

- JSON Canvas spec 1.0 — https://jsoncanvas.org/spec/1.0
- JSON Canvas apps & libraries directory — https://jsoncanvas.org/docs/apps/
- jsoncanvas repository (Obsidian) — https://github.com/obsidianmd/jsoncanvas
- Obsidian Canvas — https://obsidian.md/canvas
- Obsidian Canvas help — https://help.obsidian.md/plugins/canvas
- Advanced Canvas (feature reference, GPL-3.0, not reusable as code) — https://github.com/Developer-Mike/obsidian-advanced-canvas
- js-draw (substrate candidate) — https://github.com/personalizedrefrigerator/js-draw
- hesprs/json-canvas-viewer (fork-or-learn-from candidate) — https://github.com/hesprs/json-canvas-viewer
- Digital-Tvilling/react-jsoncanvas (reference) — https://github.com/Digital-Tvilling/react-jsoncanvas
- @trbn/jsoncanvas (TS data-model reference) — https://github.com/t128n/jsoncanvas
- Joplin plugin API (primary host reference) — https://joplinapp.org/api/references/plugin_api/
- Joplin Visual Workspace issue #15193 — https://github.com/laurent22/joplin/issues/15193
