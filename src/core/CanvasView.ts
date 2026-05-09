// CanvasView wraps hesprs/json-canvas-viewer with a markdown-it parser and our
// own narrower API. It owns the canvas data reference at the rendering layer
// and emits a change event when the user mutates it (currently only drag).

import { JSONCanvasViewer } from 'json-canvas-viewer';
import type { JSONCanvasViewerInterface } from 'json-canvas-viewer';
import MarkdownIt from 'markdown-it';
import { attachDragHandler } from './interaction/drag';
import type { CanvasNode, JSONCanvas } from './types';

export interface CanvasViewOptions {
	container: HTMLElement;
	/** Called on drag-end with the mutated canvas. */
	onChange?: (canvas: JSONCanvas) => void;
}

export class CanvasView {
	private viewer: JSONCanvasViewerInterface;
	private canvas: JSONCanvas | null = null;
	private rafId: number | null = null;
	private readonly detachDrag: () => void;
	private readonly onChange: (canvas: JSONCanvas) => void;

	constructor(options: CanvasViewOptions) {
		const md = new MarkdownIt({ html: false, breaks: true, linkify: true });
		this.viewer = new JSONCanvasViewer({
			container: options.container,
			parser: (text: string) => md.render(text),
		});
		this.onChange = options.onChange ?? ((): void => {});
		this.detachDrag = attachDragHandler({
			getNode: (id) => this.getNode(id),
			onMove: (id, x, y) => this.handleNodeMoveLive(id, x, y),
			onCommit: () => this.handleNodeCommit(),
		});
	}

	load(canvas: JSONCanvas): void {
		this.canvas = canvas;
		this.viewer.load({ canvas: filledForHesprs(canvas) });
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

	private handleNodeMoveLive(id: string, newX: number, newY: number): void {
		// Mutate the canonical node ref. Hesprs's renderer reads node positions
		// directly from `nodeMap[id].ref.x/y` (the same object reference as
		// our canvas.nodes[i]), so this update is immediately visible to
		// drawEdge. Triggering viewer.refresh() — not viewer.load() — redraws
		// only the canvas-side layer (edges, file/group nodes) without the
		// resetView/overlay-rebuild that load() would do.
		//
		// The overlay div for the dragged node is moved by the drag handler's
		// style.left/top mutation; we don't touch it here.
		if (!this.canvas) return;
		const node = this.canvas.nodes.find((n) => n.id === id);
		if (!node) return;
		node.x = newX;
		node.y = newY;
		this.scheduleRefresh();
	}

	private handleNodeCommit(): void {
		// Position was already mutated by handleNodeMoveLive on the final
		// pointermove. Drag-end's job is to fire the change callback so the
		// host saves; canonical state is already correct.
		if (!this.canvas) return;
		this.onChange(this.canvas);
	}

	private scheduleRefresh(): void {
		if (this.rafId !== null) return;
		this.rafId = requestAnimationFrame(() => {
			this.rafId = null;
			this.viewer.refresh();
		});
	}
}

function filledForHesprs(canvas: JSONCanvas): never {
	const edges = (canvas.edges ?? []).map((edge) => ({
		...edge,
		fromSide: edge.fromSide ?? 'right',
		toSide: edge.toSide ?? 'left',
	}));
	return { nodes: canvas.nodes, edges } as never;
}
