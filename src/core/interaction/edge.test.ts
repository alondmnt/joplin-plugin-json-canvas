// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { attachEdgeGesture } from './edge';
import type { CanvasEdge, EdgeSide } from '../types';

interface Harness {
	root: HTMLElement;
	overlays: Record<string, HTMLElement>;
	commits: CanvasEdge[];
	detach: () => void;
}

function setup(ids: string[] = ['n1', 'n2']): Harness {
	const root = document.createElement('div');
	document.body.appendChild(root);

	const overlays: Record<string, HTMLElement> = {};
	for (const id of ids) {
		const overlay = document.createElement('div');
		overlay.classList.add('JCV-overlay-container');
		overlay.id = id;
		root.appendChild(overlay);
		overlays[id] = overlay;
	}

	const commits: CanvasEdge[] = [];
	const detach = attachEdgeGesture({
		root,
		onCommit: (edge) => commits.push(edge),
	});

	return { root, overlays, commits, detach };
}

function dispatchPointer(target: EventTarget, type: string, clientX = 0, clientY = 0): void {
	const event = new MouseEvent(type, {
		bubbles: true,
		cancelable: true,
		clientX,
		clientY,
	});
	target.dispatchEvent(event);
}

function dispatchKeyDown(target: EventTarget, key: string): void {
	target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

function getHandle(overlay: HTMLElement, side: EdgeSide): HTMLElement {
	const h = overlay.querySelector<HTMLElement>(`.JCV-edge-handle-${side}`);
	if (!h) throw new Error(`handle ${side} not mounted on ${overlay.id}`);
	return h;
}

function stubRect(el: HTMLElement, rect: { left: number; top: number; width: number; height: number }): void {
	const full = {
		...rect,
		right: rect.left + rect.width,
		bottom: rect.top + rect.height,
		x: rect.left,
		y: rect.top,
		toJSON: () => ({}),
	} as DOMRect;
	Object.defineProperty(el, 'getBoundingClientRect', {
		configurable: true,
		value: () => full,
	});
}

function mockElementFromPoint(el: HTMLElement | null): () => void {
	const original = document.elementFromPoint;
	document.elementFromPoint = (): Element | null => el;
	return () => {
		document.elementFromPoint = original;
	};
}

describe('attachEdgeGesture — handle mounting', () => {
	let h: Harness;

	beforeEach(() => {
		h = setup();
	});

	afterEach(() => {
		h.detach();
		document.body.innerHTML = '';
	});

	it('mounts four handles per overlay-container[id]', () => {
		for (const overlay of Object.values(h.overlays)) {
			expect(overlay.querySelectorAll('.JCV-edge-handle')).toHaveLength(4);
			for (const side of ['top', 'right', 'bottom', 'left'] as EdgeSide[]) {
				expect(overlay.querySelector(`.JCV-edge-handle-${side}`)).not.toBeNull();
			}
		}
	});

	it('skips containers without an id (group/decoration overlays would lack one)', () => {
		const decoration = document.createElement('div');
		decoration.classList.add('JCV-overlay-container');
		// No id set.
		h.root.appendChild(decoration);
		// Re-attach to pick up the new container.
		h.detach();
		const detach2 = attachEdgeGesture({ root: h.root, onCommit: () => {} });
		try {
			expect(decoration.querySelectorAll('.JCV-edge-handle')).toHaveLength(0);
		} finally {
			detach2();
		}
	});

	it('teardown removes all handles', () => {
		h.detach();
		expect(document.querySelectorAll('.JCV-edge-handle')).toHaveLength(0);
		// Re-attach a no-op detach so afterEach's detach() is harmless.
		h.detach = () => {};
	});
});

describe('attachEdgeGesture — gesture lifecycle', () => {
	let h: Harness;
	let restoreEFP: () => void = () => {};

	beforeEach(() => {
		h = setup();
		// Source at (0,0)-(100,100). Target at (200,0)-(300,100).
		stubRect(h.overlays.n1, { left: 0, top: 0, width: 100, height: 100 });
		stubRect(h.overlays.n2, { left: 200, top: 0, width: 100, height: 100 });
		// Stub the right handle of n1 at the source's right midpoint.
		stubRect(getHandle(h.overlays.n1, 'right'), { left: 94, top: 44, width: 12, height: 12 });
	});

	afterEach(() => {
		restoreEFP();
		h.detach();
		document.body.innerHTML = '';
	});

	it('mounts an SVG preview on pointerdown over a handle', () => {
		const handle = getHandle(h.overlays.n1, 'right');
		dispatchPointer(handle, 'pointerdown', 100, 50);
		const preview = document.querySelector('.JCV-edge-preview');
		expect(preview).not.toBeNull();
		expect(preview!.querySelector('line')).not.toBeNull();
	});

	it('does not start a gesture when pointerdown is not on a handle', () => {
		dispatchPointer(h.overlays.n1, 'pointerdown', 50, 50);
		expect(document.querySelector('.JCV-edge-preview')).toBeNull();
	});

	it('updates the preview line endpoint on pointermove', () => {
		const handle = getHandle(h.overlays.n1, 'right');
		dispatchPointer(handle, 'pointerdown', 100, 50);
		dispatchPointer(handle, 'pointermove', 150, 75);
		const line = document.querySelector('.JCV-edge-preview line')!;
		expect(line.getAttribute('x2')).toBe('150');
		expect(line.getAttribute('y2')).toBe('75');
	});

	it('commits a new edge when dropped on another overlay', () => {
		restoreEFP = mockElementFromPoint(h.overlays.n2);
		const handle = getHandle(h.overlays.n1, 'right');
		dispatchPointer(handle, 'pointerdown', 100, 50);
		// Drop near the left side of n2 (clientX=210, n2.left=200 → localX=10).
		dispatchPointer(handle, 'pointermove', 210, 50);
		dispatchPointer(handle, 'pointerup', 210, 50);

		expect(h.commits).toHaveLength(1);
		const edge = h.commits[0];
		expect(edge.fromNode).toBe('n1');
		expect(edge.fromSide).toBe('right');
		expect(edge.toNode).toBe('n2');
		expect(edge.toSide).toBe('left');
		expect(edge.id).toMatch(/^[0-9a-f]{16}$/);
	});

	it('removes the preview after commit', () => {
		restoreEFP = mockElementFromPoint(h.overlays.n2);
		const handle = getHandle(h.overlays.n1, 'right');
		dispatchPointer(handle, 'pointerdown', 100, 50);
		dispatchPointer(handle, 'pointerup', 210, 50);
		expect(document.querySelector('.JCV-edge-preview')).toBeNull();
	});

	it('does not commit when dropped on empty canvas', () => {
		restoreEFP = mockElementFromPoint(null);
		const handle = getHandle(h.overlays.n1, 'right');
		dispatchPointer(handle, 'pointerdown', 100, 50);
		dispatchPointer(handle, 'pointerup', 500, 500);
		expect(h.commits).toHaveLength(0);
		expect(document.querySelector('.JCV-edge-preview')).toBeNull();
	});

	it('allows a self-loop (drop on the source node)', () => {
		restoreEFP = mockElementFromPoint(h.overlays.n1);
		const handle = getHandle(h.overlays.n1, 'right');
		dispatchPointer(handle, 'pointerdown', 100, 50);
		dispatchPointer(handle, 'pointerup', 50, 50);
		expect(h.commits).toHaveLength(1);
		expect(h.commits[0].fromNode).toBe('n1');
		expect(h.commits[0].toNode).toBe('n1');
	});

	it('Esc cancels the in-flight gesture (no commit, preview removed)', () => {
		restoreEFP = mockElementFromPoint(h.overlays.n2);
		const handle = getHandle(h.overlays.n1, 'right');
		dispatchPointer(handle, 'pointerdown', 100, 50);
		dispatchPointer(handle, 'pointermove', 150, 50);
		dispatchKeyDown(document, 'Escape');
		expect(document.querySelector('.JCV-edge-preview')).toBeNull();
		// pointerup after Esc should be a no-op.
		dispatchPointer(handle, 'pointerup', 210, 50);
		expect(h.commits).toHaveLength(0);
	});

	it('pointercancel tears down the preview without committing', () => {
		const handle = getHandle(h.overlays.n1, 'right');
		dispatchPointer(handle, 'pointerdown', 100, 50);
		dispatchPointer(handle, 'pointermove', 150, 50);
		dispatchPointer(handle, 'pointercancel');
		expect(document.querySelector('.JCV-edge-preview')).toBeNull();
		expect(h.commits).toHaveLength(0);
	});

	it('Esc with no active gesture is a no-op (does not swallow Escape elsewhere)', () => {
		const ke = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
		document.dispatchEvent(ke);
		expect(ke.defaultPrevented).toBe(false);
	});
});

describe('attachEdgeGesture — toSide selection', () => {
	let h: Harness;
	let restoreEFP: () => void = () => {};

	beforeEach(() => {
		h = setup(['src', 'tgt']);
		stubRect(h.overlays.src, { left: 0, top: 0, width: 100, height: 100 });
		stubRect(h.overlays.tgt, { left: 200, top: 200, width: 100, height: 100 });
		stubRect(getHandle(h.overlays.src, 'right'), { left: 94, top: 44, width: 12, height: 12 });
		restoreEFP = mockElementFromPoint(h.overlays.tgt);
	});

	afterEach(() => {
		restoreEFP();
		h.detach();
		document.body.innerHTML = '';
	});

	const cases: Array<{ drop: [number, number]; expected: EdgeSide; label: string }> = [
		{ drop: [250, 205], expected: 'top', label: 'near top edge' },
		{ drop: [295, 250], expected: 'right', label: 'near right edge' },
		{ drop: [250, 295], expected: 'bottom', label: 'near bottom edge' },
		{ drop: [205, 250], expected: 'left', label: 'near left edge' },
	];

	for (const { drop, expected, label } of cases) {
		it(`picks ${expected} when drop is ${label}`, () => {
			const handle = getHandle(h.overlays.src, 'right');
			dispatchPointer(handle, 'pointerdown', 100, 50);
			dispatchPointer(handle, 'pointerup', drop[0], drop[1]);
			expect(h.commits).toHaveLength(1);
			expect(h.commits[0].toSide).toBe(expected);
		});
	}
});

describe('attachEdgeGesture — listener teardown', () => {
	it('does not fire commits after detach()', () => {
		const h = setup();
		stubRect(h.overlays.n1, { left: 0, top: 0, width: 100, height: 100 });
		stubRect(h.overlays.n2, { left: 200, top: 0, width: 100, height: 100 });
		const handle = getHandle(h.overlays.n1, 'right');
		stubRect(handle, { left: 94, top: 44, width: 12, height: 12 });

		h.detach();
		const restore = mockElementFromPoint(h.overlays.n2);
		try {
			// After detach, document listeners are gone: pointerdown shouldn't
			// even open a gesture.
			dispatchPointer(handle, 'pointerdown', 100, 50);
			dispatchPointer(handle, 'pointerup', 210, 50);
			expect(h.commits).toHaveLength(0);
			expect(document.querySelector('.JCV-edge-preview')).toBeNull();
		} finally {
			restore();
			document.body.innerHTML = '';
		}
	});
});
