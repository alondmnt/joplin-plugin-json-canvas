// CanvasView wraps hesprs/json-canvas-viewer with a markdown-it parser and our
// own narrower API. It's the rendering surface; the canonical canvas data lives
// elsewhere (host-side note body).
//
// Commit 4 (here): construct + load + dispose.
// Commit 5: drag-to-move gestures emit change callbacks.

import { JSONCanvasViewer } from 'json-canvas-viewer';
import type { JSONCanvasViewerInterface } from 'json-canvas-viewer';
import MarkdownIt from 'markdown-it';
import type { JSONCanvas } from './types';

export interface CanvasViewOptions {
	container: HTMLElement;
}

export class CanvasView {
	private viewer: JSONCanvasViewerInterface;

	constructor(options: CanvasViewOptions) {
		const md = new MarkdownIt({ html: false, breaks: true, linkify: true });
		this.viewer = new JSONCanvasViewer({
			container: options.container,
			parser: (text: string) => md.render(text),
		});
	}

	load(canvas: JSONCanvas): void {
		// hesprs's JSONCanvasEdge type requires fromSide/toSide; the spec marks
		// them optional. Default-fill missing sides so hesprs renders cleanly.
		// Long-term we'd compute geometry-aware best sides; for the tracer the
		// fixture's edges have explicit sides so this rarely fires.
		const filled = filledForHesprs(canvas);
		this.viewer.load({ canvas: filled });
	}

	destroy(): void {
		this.viewer.dispose();
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
