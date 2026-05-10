import { describe, it, expect } from 'vitest';
import { parseFromBody, serializeToBody } from './format';
import type { JSONCanvas } from './types';

const FENCE_OPEN = '````canvas';
const FENCE_CLOSE = '````';

function wrap(json: string, preamble = '', postscript = ''): string {
	return `${preamble}${FENCE_OPEN}\n${json}\n${FENCE_CLOSE}${postscript}`;
}

describe('parseFromBody', () => {
	it('returns null when there is no canvas fence', () => {
		expect(parseFromBody('# just a note\n\nno canvas here.')).toBeNull();
	});

	it('returns null when JSON inside the fence is malformed', () => {
		expect(parseFromBody(wrap('{ not valid json'))).toBeNull();
	});

	it('returns null when nodes is missing', () => {
		expect(parseFromBody(wrap('{"edges":[]}'))).toBeNull();
	});

	it('returns null when nodes is not an array', () => {
		expect(parseFromBody(wrap('{"nodes":"oops","edges":[]}'))).toBeNull();
	});

	it('returns null when edges is present but not an array', () => {
		expect(parseFromBody(wrap('{"nodes":[],"edges":"oops"}'))).toBeNull();
	});

	it('parses an empty canvas', () => {
		const result = parseFromBody(wrap('{"nodes":[]}'));
		expect(result).not.toBeNull();
		expect(result!.canvas.nodes).toEqual([]);
	});

	it('parses a canvas with nodes and edges', () => {
		const json =
			'{"nodes":[{"id":"n1","type":"text","text":"hi","x":0,"y":0,"width":100,"height":40}],"edges":[]}';
		const result = parseFromBody(wrap(json));
		expect(result).not.toBeNull();
		expect(result!.canvas.nodes).toHaveLength(1);
		expect(result!.canvas.nodes[0].id).toBe('n1');
	});
});

describe('round-trip', () => {
	it('preserves the canvas across parse → serialise → parse', () => {
		const canvas: JSONCanvas = {
			nodes: [
				{ id: 'n1', type: 'text', text: 'hello', x: 0, y: 0, width: 100, height: 40 },
				{
					id: 'n2',
					type: 'link',
					url: 'https://example.com',
					x: 200,
					y: 0,
					width: 150,
					height: 40,
				},
			],
			edges: [{ id: 'e1', fromNode: 'n1', toNode: 'n2' }],
		};
		const body = wrap(JSON.stringify(canvas));
		const first = parseFromBody(body);
		expect(first).not.toBeNull();
		const newBody = serializeToBody(body, first!.blockSpan, first!.canvas);
		const second = parseFromBody(newBody);
		expect(second).not.toBeNull();
		expect(second!.canvas).toEqual(first!.canvas);
	});

	it('keeps the surrounding markdown byte-identical', () => {
		const preamble = '# notes\n\nsome prose before.\n\n';
		const postscript = '\n\nsome prose after.\n';
		const body = wrap('{"nodes":[],"edges":[]}', preamble, postscript);
		const parsed = parseFromBody(body);
		expect(parsed).not.toBeNull();
		const out = serializeToBody(body, parsed!.blockSpan, parsed!.canvas);
		expect(out.startsWith(preamble)).toBe(true);
		expect(out.endsWith(postscript)).toBe(true);
	});

	it('preserves unknown top-level keys', () => {
		// Spec forward-compatibility: tools should keep unknown keys on round-trip.
		const json = '{"nodes":[],"edges":[],"custom":"value","meta":{"version":2}}';
		const body = wrap(json);
		const parsed = parseFromBody(body);
		expect(parsed).not.toBeNull();
		expect(parsed!.canvas.custom).toBe('value');
		const out = serializeToBody(body, parsed!.blockSpan, parsed!.canvas);
		const reparsed = parseFromBody(out);
		expect(reparsed!.canvas.custom).toBe('value');
		expect(reparsed!.canvas.meta).toEqual({ version: 2 });
	});
});

describe('edge cases', () => {
	it('handles CRLF line endings', () => {
		const body = `# notes\r\n\r\n${FENCE_OPEN}\r\n{"nodes":[],"edges":[]}\r\n${FENCE_CLOSE}\r\n`;
		const parsed = parseFromBody(body);
		expect(parsed).not.toBeNull();
		expect(parsed!.canvas.nodes).toEqual([]);
	});

	it('first canvas fence wins when multiple are present', () => {
		const first =
			'{"nodes":[{"id":"first","type":"text","text":"a","x":0,"y":0,"width":1,"height":1}],"edges":[]}';
		const second =
			'{"nodes":[{"id":"second","type":"text","text":"b","x":0,"y":0,"width":1,"height":1}],"edges":[]}';
		const body = `${wrap(first)}\n\n${wrap(second)}`;
		const parsed = parseFromBody(body);
		expect(parsed).not.toBeNull();
		expect(parsed!.canvas.nodes[0].id).toBe('first');
	});

	it('survives triple-backtick content inside a JSON text node', () => {
		// The whole point of the 4-backtick fence: a text node whose markdown
		// contains a fenced code sample (3 backticks) must not truncate parsing.
		const text = 'here is code:\\n```js\\nconsole.log(1)\\n```\\n';
		const json = `{"nodes":[{"id":"n1","type":"text","text":"${text}","x":0,"y":0,"width":100,"height":40}],"edges":[]}`;
		const parsed = parseFromBody(wrap(json));
		expect(parsed).not.toBeNull();
		expect(parsed!.canvas.nodes).toHaveLength(1);
		const node = parsed!.canvas.nodes[0];
		if (node.type !== 'text') throw new Error('expected text node');
		expect(node.text).toContain('```js');
	});
});
