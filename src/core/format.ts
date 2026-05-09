// JSON Canvas block extraction and re-insertion.
//
// A canvas note's body is markdown. The canvas data lives inside a single
// fenced code block whose language tag is `canvas`:
//
//     Optional preamble in markdown.
//
//     ```canvas
//     { "nodes": [], "edges": [] }
//     ```
//
//     Optional postscript.
//
// `parseFromBody` finds that block and returns the parsed JSON Canvas plus the
// character span of the JSON content. `serializeToBody` splices new JSON into
// the same span, leaving everything outside the block byte-identical.
//
// First-block-wins if a body somehow has multiple canvas fences.

import type { BlockSpan, JSONCanvas, ParsedBody } from './types';

const OPEN_FENCE_RE = /^```canvas\s*\r?\n/m;
const CLOSE_FENCE_RE = /\r?\n```\s*(?:\r?\n|$)/;

/**
 * Locate and parse the first ```canvas ... ``` block in the body. Returns null
 * if no block is found, the JSON inside doesn't parse, or it isn't shaped like
 * a JSON Canvas (missing or non-array `nodes`).
 */
export function parseFromBody(body: string): ParsedBody | null {
	const span = findBlockSpan(body);
	if (!span) return null;
	const jsonStr = body.slice(span.start, span.end);
	let parsed: unknown;
	try {
		parsed = JSON.parse(jsonStr);
	} catch {
		return null;
	}
	if (!isJSONCanvas(parsed)) return null;
	return { canvas: parsed, blockSpan: span };
}

/**
 * Replace the JSON inside the canvas block with `canvas`, re-serialised.
 * Everything outside `blockSpan` is preserved byte-identical.
 */
export function serializeToBody(
	originalBody: string,
	blockSpan: BlockSpan,
	canvas: JSONCanvas,
): string {
	const json = JSON.stringify(canvas, null, '\t');
	return originalBody.slice(0, blockSpan.start) + json + originalBody.slice(blockSpan.end);
}

/**
 * Cheap activation gate: does the body contain a ```canvas opening fence?
 * Doesn't validate JSON inside; use parseFromBody for the strict check.
 */
export function bodyHasCanvasFence(body: string): boolean {
	return OPEN_FENCE_RE.test(body);
}

function findBlockSpan(body: string): BlockSpan | null {
	const open = OPEN_FENCE_RE.exec(body);
	if (!open || open.index === undefined) return null;
	const start = open.index + open[0].length;
	const tail = body.slice(start);
	const close = CLOSE_FENCE_RE.exec(tail);
	if (!close || close.index === undefined) return null;
	return { start, end: start + close.index };
}

function isJSONCanvas(value: unknown): value is JSONCanvas {
	if (typeof value !== 'object' || value === null) return false;
	const obj = value as Record<string, unknown>;
	if (!Array.isArray(obj.nodes)) return false;
	// `edges` is optional in the spec; tolerate missing.
	if (obj.edges !== undefined && !Array.isArray(obj.edges)) return false;
	return true;
}
