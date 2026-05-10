// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { attachDragHandler } from './drag';
import type { CanvasNode } from '../types';

const NODE_ID = 'n1';
const START_X = 100;
const START_Y = 200;

interface Harness {
	overlay: HTMLElement;
	node: CanvasNode;
	onMove: ReturnType<typeof vi.fn>;
	onCommit: ReturnType<typeof vi.fn>;
	onCancel: ReturnType<typeof vi.fn>;
	onClick: ReturnType<typeof vi.fn>;
	detach: () => void;
}

function setup(): Harness {
	// Build the minimum DOM the drag handler reaches into:
	//   .JCV-overlays (used to read scale via transform regex)
	//   .JCV-overlay-container (clicked element; id is the node id)
	const overlaysLayer = document.createElement('div');
	overlaysLayer.className = 'JCV-overlays';
	// scale(1) keeps client-px == canvas-px in the conversion math.
	overlaysLayer.style.transform = 'translate(0px, 0px) scale(1)';
	document.body.appendChild(overlaysLayer);

	const overlay = document.createElement('div');
	overlay.classList.add('JCV-overlay-container');
	overlay.id = NODE_ID;
	overlay.style.left = `${START_X}px`;
	overlay.style.top = `${START_Y}px`;
	overlaysLayer.appendChild(overlay);

	const node: CanvasNode = {
		id: NODE_ID,
		type: 'text',
		text: 'hi',
		x: START_X,
		y: START_Y,
		width: 50,
		height: 30,
	};

	const onMove = vi.fn();
	const onCommit = vi.fn();
	const onCancel = vi.fn();
	const onClick = vi.fn();

	const detach = attachDragHandler({
		getNode: (id) => (id === NODE_ID ? node : null),
		onMove,
		onCommit,
		onCancel,
		onClick,
	});

	return { overlay, node, onMove, onCommit, onCancel, onClick, detach };
}

function dispatchPointer(target: EventTarget, type: string, clientX = 0, clientY = 0): void {
	// happy-dom doesn't ship a PointerEvent constructor, but a MouseEvent
	// with the right type-string passes cleanly through addEventListener.
	const event = new MouseEvent(type, {
		bubbles: true,
		cancelable: true,
		clientX,
		clientY,
	});
	target.dispatchEvent(event);
}

describe('attachDragHandler — pointercancel', () => {
	let h: Harness;

	beforeEach(() => {
		h = setup();
	});

	afterEach(() => {
		h.detach();
		document.body.innerHTML = '';
	});

	it('reverts the overlay position when cancelled mid-drag', () => {
		dispatchPointer(h.overlay, 'pointerdown', 0, 0);
		dispatchPointer(h.overlay, 'pointermove', 50, 75);
		// Sanity: overlay moved.
		expect(h.overlay.style.left).toBe(`${START_X + 50}px`);
		expect(h.overlay.style.top).toBe(`${START_Y + 75}px`);

		dispatchPointer(h.overlay, 'pointercancel');

		expect(h.overlay.style.left).toBe(`${START_X}px`);
		expect(h.overlay.style.top).toBe(`${START_Y}px`);
	});

	it('fires onCancel with the pre-drag node coords', () => {
		dispatchPointer(h.overlay, 'pointerdown', 0, 0);
		dispatchPointer(h.overlay, 'pointermove', 50, 75);
		dispatchPointer(h.overlay, 'pointercancel');

		expect(h.onCancel).toHaveBeenCalledTimes(1);
		expect(h.onCancel).toHaveBeenCalledWith(NODE_ID, START_X, START_Y);
	});

	it('does not fire onCommit for a cancelled drag', () => {
		dispatchPointer(h.overlay, 'pointerdown', 0, 0);
		dispatchPointer(h.overlay, 'pointermove', 50, 75);
		dispatchPointer(h.overlay, 'pointercancel');

		expect(h.onCommit).not.toHaveBeenCalled();
		expect(h.onClick).not.toHaveBeenCalled();
	});

	it('clears drag state so a subsequent gesture works normally', () => {
		// Cancelled drag.
		dispatchPointer(h.overlay, 'pointerdown', 0, 0);
		dispatchPointer(h.overlay, 'pointermove', 50, 75);
		dispatchPointer(h.overlay, 'pointercancel');

		// A pointermove with no active drag must not fire onMove (otherwise
		// stale state was leaking through).
		h.onMove.mockClear();
		dispatchPointer(h.overlay, 'pointermove', 999, 999);
		expect(h.onMove).not.toHaveBeenCalled();

		// Restore canonical position before the second gesture (the cancel
		// callback would do this in CanvasView; emulate here).
		h.node.x = START_X;
		h.node.y = START_Y;

		// Fresh gesture lands cleanly.
		dispatchPointer(h.overlay, 'pointerdown', 0, 0);
		dispatchPointer(h.overlay, 'pointermove', 10, 20);
		dispatchPointer(h.overlay, 'pointerup');

		expect(h.onCommit).toHaveBeenCalledTimes(1);
		expect(h.onCommit).toHaveBeenCalledWith(NODE_ID, START_X + 10, START_Y + 20);
	});

	it('is a no-op when cancel arrives without an active drag', () => {
		dispatchPointer(h.overlay, 'pointercancel');
		expect(h.onCancel).not.toHaveBeenCalled();
	});
});

describe('attachDragHandler — form-control filter', () => {
	let h: Harness;
	let textarea: HTMLTextAreaElement;

	beforeEach(() => {
		h = setup();
		textarea = document.createElement('textarea');
		h.overlay.appendChild(textarea);
	});

	afterEach(() => {
		h.detach();
		document.body.innerHTML = '';
	});

	it('does not start drag when pointerdown originates on a textarea', () => {
		dispatchPointer(textarea, 'pointerdown', 0, 0);
		dispatchPointer(textarea, 'pointermove', 50, 50);
		dispatchPointer(textarea, 'pointerup');
		// No drag tracking → no onMove, no onCommit (and no onClick fallback,
		// because no drag was even started for this gesture).
		expect(h.onMove).not.toHaveBeenCalled();
		expect(h.onCommit).not.toHaveBeenCalled();
		expect(h.onClick).not.toHaveBeenCalled();
	});

	it('still starts drag when pointerdown originates outside the form control', () => {
		dispatchPointer(h.overlay, 'pointerdown', 0, 0);
		dispatchPointer(h.overlay, 'pointermove', 30, 40);
		dispatchPointer(h.overlay, 'pointerup');
		expect(h.onCommit).toHaveBeenCalledTimes(1);
	});
});
