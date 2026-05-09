// CanvasView wraps hesprs/json-canvas-viewer with a markdown-it parser and our
// own narrower API. It owns the canvas data reference at the rendering layer
// and emits a change event when the user mutates it (currently only drag).
//
// Custom file overlays
// --------------------
// hesprs dispatches file-typed nodes to its `markdown`/`image`/`audio`/`video`
// component slots by file-extension regex. Joplin link refs (`:/<id>`) have
// no extension and would never match, so they would render as empty space
// without us intervening. The `fileRenderer` option lets a host (the Joplin
// webview) take over rendering for any file ref it claims; CanvasView fakes
// a synthetic `.md` extension on the ref so hesprs's regex routes it to our
// markdown override, which then delegates to the host's renderer. The synth
// extension is applied to a *viewer-side* copy of the canvas so the
// canonical canvas (the one we save) stays clean.

import { JSONCanvasViewer, internal } from 'json-canvas-viewer';
import type { JSONCanvasViewerInterface } from 'json-canvas-viewer';
import MarkdownIt from 'markdown-it';
import { attachDragHandler } from './interaction/drag';
import type { CanvasFileNode, CanvasNode, JSONCanvas } from './types';

const SYNTH_EXT = '.md';

export interface FileRenderer {
	/** Predicate over the original (un-synthesised) file ref. */
	matches: (file: string) => boolean;
	/** Render into the overlay's content container; receives the canonical node. */
	render: (container: HTMLElement, node: CanvasFileNode) => void;
	/** Click on a matching file node's overlay (no drag movement). */
	onClick?: (node: CanvasFileNode) => void;
}

export interface CanvasViewOptions {
	container: HTMLElement;
	/** Called on drag-end with the mutated canvas. */
	onChange?: (canvas: JSONCanvas) => void;
	fileRenderer?: FileRenderer;
}

export class CanvasView {
	private viewer: JSONCanvasViewerInterface;
	private canvas: JSONCanvas | null = null;
	// Mirror of `canvas` with synthetic extensions applied to file refs claimed
	// by `fileRenderer`. Drag mutations are written to both copies so hesprs's
	// edge-redraw (reading viewerCanvas.nodes[i].x/y) and our save path
	// (reading canvas.nodes[i].x/y) stay in sync.
	private viewerCanvas: JSONCanvas | null = null;
	private rafId: number | null = null;
	private readonly detachDrag: () => void;
	private readonly onChange: (canvas: JSONCanvas) => void;
	private readonly fileRenderer?: FileRenderer;

	constructor(options: CanvasViewOptions) {
		this.fileRenderer = options.fileRenderer;
		const md = new MarkdownIt({ html: false, breaks: true, linkify: true });
		this.viewer = new JSONCanvasViewer({
			container: options.container,
			parser: (text: string) => md.render(text),
			// Joplin file refs (`:/<id>`) aren't filesystem paths, so we suppress
			// hesprs's default `./<basename>` prefixing. Without this, hesprs
			// would mutate `node.file` on load — a write to our canonical state.
			noAttachmentRelocation: true,
			...(this.fileRenderer
				? {
						nodeComponents: {
							markdown: this.markdownComponent,
						},
					}
				: {}),
		} as never);
		this.onChange = options.onChange ?? ((): void => {});
		this.detachDrag = attachDragHandler({
			getNode: (id) => this.getNode(id),
			onMove: (id, x, y) => this.handleNodeMoveLive(id, x, y),
			onCommit: () => this.handleNodeCommit(),
			onClick: (id) => this.handleNodeClick(id),
		});
	}

	load(canvas: JSONCanvas): void {
		this.canvas = canvas;
		this.viewerCanvas = this.buildViewerCanvas(canvas);
		this.viewer.load({ canvas: filledForHesprs(this.viewerCanvas) });
		this.clearMatchedFileLabels();
	}

	destroy(): void {
		this.detachDrag();
		if (this.rafId !== null) cancelAnimationFrame(this.rafId);
		this.viewer.dispose();
	}

	private getNode(id: string): CanvasNode | null {
		if (!this.canvas) return null;
		return this.canvas.nodes.find((n) => n.id === id) ?? null;
	}

	// IMPORTANT: any future mutator on a node (resize, label edit, color, etc.)
	// must mutate BOTH `this.canvas` and `this.viewerCanvas`. Matched file
	// nodes hold distinct objects in the two arrays (buildViewerCanvas spreads
	// them to apply the synth ext); writing to only one will silently desync
	// the rendered view from saved state. If a second mutator lands, extract
	// a `mutateNode(id, fn)` helper that handles both — don't keep duplicating
	// the find-and-write pattern.
	private handleNodeMoveLive(id: string, newX: number, newY: number): void {
		// Hesprs's renderer reads positions from `nodeMap[id].ref.x/y`, where
		// `ref` points into viewerCanvas.nodes; canonical canvas.nodes is what
		// we ship back to the host on commit. viewer.refresh() — not load() —
		// redraws only the canvas-side layer (edges, file/group nodes) without
		// the resetView/overlay-rebuild that load() would do.
		//
		// The overlay div for the dragged node is moved by the drag handler's
		// style.left/top mutation; we don't touch it here.
		if (!this.canvas || !this.viewerCanvas) return;
		const node = this.canvas.nodes.find((n) => n.id === id);
		const vnode = this.viewerCanvas.nodes.find((n) => n.id === id);
		if (!node) return;
		node.x = newX;
		node.y = newY;
		if (vnode) {
			vnode.x = newX;
			vnode.y = newY;
		}
		this.scheduleRefresh();
	}

	private handleNodeCommit(): void {
		// Position was already mutated by handleNodeMoveLive on the final
		// pointermove. Drag-end's job is to fire the change callback so the
		// host saves; canonical state is already correct.
		if (!this.canvas) return;
		this.onChange(this.canvas);
	}

	private handleNodeClick(id: string): void {
		if (!this.canvas) return;
		const node = this.canvas.nodes.find((n) => n.id === id);
		if (!node || node.type !== 'file') return;
		const renderer = this.fileRenderer;
		if (!renderer) return;
		if (!renderer.matches(node.file)) {
			console.debug('Canvas: clicked file node with unrecognised ref:', node.file);
			return;
		}
		renderer.onClick?.(node);
	}

	private scheduleRefresh(): void {
		if (this.rafId !== null) return;
		this.rafId = requestAnimationFrame(() => {
			this.rafId = null;
			this.viewer.refresh();
		});
	}

	// Hesprs renders `nodeMap[id].fileName` as a small label above each file
	// node on the canvas layer. fileName is computed from `node.file` at load
	// time, so our synthetic `.md` ext leaks into the visible label. Clear
	// fileName for nodes our renderer claims; the title is already shown
	// inside the overlay box, so a duplicate label above is just noise.
	//
	// Reaches into hesprs's internals via the DI container (per ADR 0001's
	// "private-API touchpoints in helpers" rule). Wrapped in a try so a
	// future hesprs version that reshapes the container fails soft.
	private clearMatchedFileLabels(): void {
		const renderer = this.fileRenderer;
		if (!renderer || !this.viewerCanvas) return;
		try {
			const container = (
				this.viewer as unknown as { container: { get: <T>(cls: T) => unknown } }
			).container;
			const dataManager = container.get(internal.DataManager) as {
				data: { nodeMap: Record<string, { fileName?: string }> };
			};
			const nodeMap = dataManager.data.nodeMap;
			let mutated = false;
			for (const node of this.viewerCanvas.nodes) {
				if (node.type !== 'file') continue;
				const original = node.file.endsWith(SYNTH_EXT)
					? node.file.slice(0, -SYNTH_EXT.length)
					: node.file;
				if (!renderer.matches(original)) continue;
				const entry = nodeMap[node.id];
				if (entry) {
					entry.fileName = '';
					mutated = true;
				}
			}
			if (mutated) this.viewer.refresh();
		} catch (err) {
			console.debug('Canvas: could not suppress file label (hesprs internals shifted?)', err);
		}
	}

	private buildViewerCanvas(canvas: JSONCanvas): JSONCanvas {
		const renderer = this.fileRenderer;
		if (!renderer) return canvas;
		const nodes = canvas.nodes.map((node) => {
			if (node.type === 'file' && renderer.matches(node.file)) {
				return { ...node, file: node.file + SYNTH_EXT };
			}
			return node;
		});
		return { ...canvas, nodes };
	}

	private markdownComponent = ({
		container,
		content,
		node,
	}: {
		container: HTMLElement;
		content: string;
		node: { id: string };
	}): void => {
		const renderer = this.fileRenderer;
		if (!renderer) return;
		const original = content.endsWith(SYNTH_EXT)
			? content.slice(0, -SYNTH_EXT.length)
			: content;
		if (!renderer.matches(original)) {
			// A genuine `.md` filesystem ref slipped through. Joplin canvases
			// shouldn't contain these, but render the raw path as a fallback
			// instead of leaving the overlay empty.
			container.classList.add('JCV-markdown-content');
			const inner = document.createElement('div');
			inner.classList.add('JCV-parsed-content-wrapper');
			inner.textContent = content;
			container.appendChild(inner);
			return;
		}
		const canon = this.canvas?.nodes.find((n) => n.id === node.id);
		if (!canon || canon.type !== 'file') return;
		renderer.render(container, canon);
	};
}

function filledForHesprs(canvas: JSONCanvas): never {
	const edges = (canvas.edges ?? []).map((edge) => ({
		...edge,
		fromSide: edge.fromSide ?? 'right',
		toSide: edge.toSide ?? 'left',
	}));
	return { nodes: canvas.nodes, edges } as never;
}
