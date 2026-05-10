# joplin-plugin-json-canvas

a canvas editor for joplin. notes, files and links sit on a 2d board, connected by edges; the board is stored as a [json canvas 1.0](https://jsoncanvas.org) fenced block inside the note body, so it round-trips with other json canvas tools and never needs a separate file format.

a short weekend poc, built mostly to kick the tyres on [hesprs/json-canvas-viewer](https://github.com/hesprs/json-canvas-viewer) as a substrate. the wrap-and-extend strategy held: drag-to-move, inline text edit, edge creation, modifier-click selection and delete all sit on top of the public api with only a couple of small private-api touchpoints (documented in `docs/adr/0001-substrate.md`).

the core (`src/core/`) is deliberately decoupled from the joplin host (`src/joplin/`) so the same code could ship as an independent package later (browser, electron, web app), with joplin as one of several possible hosts.

## status

- the official joplin team has [a built-in whiteboard editor in flight (PR #15305)](https://github.com/laurent22/joplin/pull/15305) covering the same json canvas activation. once that lands, this plugin's value collapses to a stopgap for older joplin versions.
- treat this repo as a finished poc rather than a roadmap. the core may be useful as a starting point if anyone wants a json-canvas editor outside joplin.

## install (dev)

```
npm install
npm run dist     # builds publish/joplin.plugin.alondmnt.canvas.jpl
npm test
```

drop the `.jpl` into joplin's plugin directory or sideload via settings → plugins.

## interaction summary

- pan / zoom: native (hesprs).
- drag: pointerdown on a node body, drag, release.
- inline edit: double-click a text node.
- create edge: hover a node, drag from one of the four side handles to another node.
- select: cmd-click (mac) / ctrl-click (win/linux) any node. selection styling reuses hesprs's `JCV-active`.
- delete selected: backspace or delete key.

## licence

mit.
