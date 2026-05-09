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
			onMove: (id, x, y) => this.handleNodeMove(id, x, y),
		});
	}

	load(canvas: JSONCanvas): void {
		this.canvas = canvas;
		this.viewer.load({ canvas: filledForHesprs(canvas) });
	}

	destroy(): void {
		this.detachDrag();
		this.viewer.dispose();
	}

	private getNode(id: string): CanvasNode | null {
		if (!this.canvas) return null;
		return this.canvas.nodes.find((n) => n.id === id) ?? null;
	}

	private handleNodeMove(id: string, newX: number, newY: number): void {
		if (!this.canvas) return;
		const node = this.canvas.nodes.find((n) => n.id === id);
		if (!node) return;
		node.x = newX;
		node.y = newY;
		// Don't re-load the viewer here. viewer.load triggers hesprs's start()
		// which calls resetView() — that clobbers the user's pan/zoom state and
		// races the async markdown re-rendering of all overlays, sometimes
		// leaving the canvas visually blank. Edges therefore stay anchored to
		// their pre-drag positions until the next external load (note switch
		// or restart). Edges-during-drag will be a follow-up slice using the
		// private DM.data.nodeMap[id].box mutation + refresh() path documented
		// in ADR 0001 and phase0b-drag-spike.md.
		this.onChange(this.canvas);
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
