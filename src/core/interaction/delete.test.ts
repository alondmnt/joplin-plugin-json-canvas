// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { attachDeleteHandler } from './delete';

interface Harness {
	root: HTMLElement;
	overlay: HTMLElement;
	onDelete: ReturnType<typeof vi.fn>;
	detach: () => void;
}

function setup(active = true): Harness {
	const root = document.createElement('div');
	document.body.appendChild(root);

	const overlay = document.createElement('div');
	overlay.classList.add('JCV-overlay-container');
	overlay.id = 'n1';
	if (active) overlay.classList.add('JCV-active');
	root.appendChild(overlay);

	const onDelete = vi.fn();
	const detach = attachDeleteHandler({ root, onDelete });

	return { root, overlay, onDelete, detach };
}

function dispatchKeyDown(target: EventTarget, key: string): KeyboardEvent {
	const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
	target.dispatchEvent(event);
	return event;
}

describe('attachDeleteHandler', () => {
	let h: Harness;

	beforeEach(() => {
		h = setup();
	});

	afterEach(() => {
		h.detach();
		document.body.innerHTML = '';
	});

	it('fires onDelete with the active overlay id when Delete is pressed', () => {
		dispatchKeyDown(document.body, 'Delete');
		expect(h.onDelete).toHaveBeenCalledTimes(1);
		expect(h.onDelete).toHaveBeenCalledWith('n1');
	});

	it('also fires on Backspace', () => {
		dispatchKeyDown(document.body, 'Backspace');
		expect(h.onDelete).toHaveBeenCalledTimes(1);
		expect(h.onDelete).toHaveBeenCalledWith('n1');
	});

	it('preventsDefault when it acts (so Backspace does not trigger browser-back)', () => {
		const e = dispatchKeyDown(document.body, 'Backspace');
		expect(e.defaultPrevented).toBe(true);
	});

	it('does not fire (or preventDefault) when no overlay is selected', () => {
		h.overlay.classList.remove('JCV-active');
		const e = dispatchKeyDown(document.body, 'Delete');
		expect(h.onDelete).not.toHaveBeenCalled();
		expect(e.defaultPrevented).toBe(false);
	});

	it('ignores keys other than Delete/Backspace', () => {
		dispatchKeyDown(document.body, 'a');
		dispatchKeyDown(document.body, 'Enter');
		dispatchKeyDown(document.body, 'Escape');
		expect(h.onDelete).not.toHaveBeenCalled();
	});
});

describe('attachDeleteHandler — form-control filter', () => {
	let h: Harness;

	beforeEach(() => {
		h = setup();
	});

	afterEach(() => {
		h.detach();
		document.body.innerHTML = '';
	});

	it('does not delete the node when Backspace is pressed in a textarea', () => {
		const ta = document.createElement('textarea');
		ta.value = 'hello';
		h.overlay.appendChild(ta);
		dispatchKeyDown(ta, 'Backspace');
		expect(h.onDelete).not.toHaveBeenCalled();
	});

	it('does not delete the node when Delete is pressed in an input', () => {
		const input = document.createElement('input');
		document.body.appendChild(input);
		dispatchKeyDown(input, 'Delete');
		expect(h.onDelete).not.toHaveBeenCalled();
	});

	it('does not delete the node when target is contentEditable', () => {
		const div = document.createElement('div');
		div.setAttribute('contenteditable', 'true');
		document.body.appendChild(div);
		dispatchKeyDown(div, 'Backspace');
		expect(h.onDelete).not.toHaveBeenCalled();
	});
});

describe('attachDeleteHandler — detach', () => {
	it('removes the keydown listener', () => {
		const h = setup();
		h.detach();
		dispatchKeyDown(document.body, 'Delete');
		expect(h.onDelete).not.toHaveBeenCalled();
		document.body.innerHTML = '';
	});
});
