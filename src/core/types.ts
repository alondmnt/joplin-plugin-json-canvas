// JSON Canvas 1.0 spec types.
// Reference: https://jsoncanvas.org/spec/1.0
//
// We hold our own types rather than re-exporting hesprs's so the spec is the
// canonical contract; if upstream evolves theirs we don't follow silently.

export type CanvasColor = string;

export interface CanvasNodeBase {
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
	color?: CanvasColor;
}

export interface CanvasTextNode extends CanvasNodeBase {
	type: 'text';
	text: string;
}

export interface CanvasFileNode extends CanvasNodeBase {
	type: 'file';
	file: string;
	subpath?: string;
}

export interface CanvasLinkNode extends CanvasNodeBase {
	type: 'link';
	url: string;
}

export interface CanvasGroupNode extends CanvasNodeBase {
	type: 'group';
	label?: string;
	background?: string;
	backgroundStyle?: 'cover' | 'ratio' | 'repeat';
}

export type CanvasNode = CanvasTextNode | CanvasFileNode | CanvasLinkNode | CanvasGroupNode;

export type EdgeSide = 'top' | 'right' | 'bottom' | 'left';
export type EdgeEnd = 'none' | 'arrow';

export interface CanvasEdge {
	id: string;
	fromNode: string;
	toNode: string;
	fromSide?: EdgeSide;
	toSide?: EdgeSide;
	fromEnd?: EdgeEnd;
	toEnd?: EdgeEnd;
	color?: CanvasColor;
	label?: string;
}

export interface JSONCanvas {
	nodes: CanvasNode[];
	edges: CanvasEdge[];
	// Unknown top-level keys are preserved on round-trip per the spec's
	// forward-compatibility clause.
	[key: string]: unknown;
}

export interface BlockSpan {
	/** Character index in the body string of the first byte of JSON content (after the opening fence's newline). */
	start: number;
	/** Character index of the first byte after the JSON content (the newline preceding the closing fence). */
	end: number;
}

export interface ParsedBody {
	canvas: JSONCanvas;
	blockSpan: BlockSpan;
}
