// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { mountTextNode, textareaEditor } from './edit';

interface Harness {
	container: HTMLElement;
	rendered: { calls: string[] };
	commits: { calls: string[] };
	textareaEl: () => HTMLTextAreaElement | null;
	mounted: ReturnType<typeof mountTextNode>;
	currentText: { value: string };
}

function setup(initial = 'hello'): Harness {
	// Mimic hesprs's layout: overlay-container > content (sibling of click-layer
	// in production). dblclick fires on the click-layer in real use, so the
	// listener must live on the overlay-container ancestor.
	const overlayContainer = document.createElement('div');
	overlayContainer.classList.add('JCV-overlay-container');
	const container = document.createElement('div');
	overlayContainer.appendChild(container);
	document.body.appendChild(overlayContainer);

	const currentText = { value: initial };
	const rendered = { calls: [] as string[] };
	const commits = { calls: [] as string[] };

	const mounted = mountTextNode(container, {
		eventRoot: overlayContainer,
		getText: () => currentText.value,
		renderView: (c, text) => {
			rendered.calls.push(text);
			const inner = document.createElement('div');
			inner.className = 'rendered';
			inner.textContent = text;
			c.appendChild(inner);
		},
		onCommit: (text) => {
			commits.calls.push(text);
			currentText.value = text;
		},
		debounceMs: 50, // shorter than default for fast tests
	});

	return {
		container,
		rendered,
		commits,
		textareaEl: () => container.querySelector('textarea'),
		mounted,
		currentText,
	};
}

function dispatchDblClick(el: HTMLElement): void {
	el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
}

function dispatchInput(el: HTMLElement): void {
	el.dispatchEvent(new Event('input', { bubbles: true }));
}

function dispatchKeyDown(el: HTMLElement, key: string): void {
	el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

function dispatchBlur(el: HTMLElement): void {
	el.dispatchEvent(new FocusEvent('blur', { bubbles: false }));
}

describe('mountTextNode — view ↔ edit lifecycle', () => {
	let h: Harness;

	beforeEach(() => {
		h = setup();
	});

	afterEach(() => {
		h.mounted.destroy();
		document.body.innerHTML = '';
	});

	it('renders view mode with the canonical text on mount', () => {
		expect(h.rendered.calls).toEqual(['hello']);
		expect(h.textareaEl()).toBeNull();
	});

	it('double-click opens a textarea with the raw markdown', () => {
		dispatchDblClick(h.container);
		const ta = h.textareaEl();
		expect(ta).not.toBeNull();
		expect(ta!.value).toBe('hello');
	});

	it('catches dblclick on a sibling of content (e.g., hesprs click-layer)', () => {
		// In production, hesprs lays out a click-layer DIV as a sibling of
		// content inside overlay-container. Pointer events fire on the
		// click-layer, not content. The listener on overlay-container must
		// catch the dblclick via bubble.
		const clickLayer = document.createElement('div');
		clickLayer.className = 'JCV-click-layer';
		h.container.parentElement!.appendChild(clickLayer);
		dispatchDblClick(clickLayer);
		expect(h.textareaEl()).not.toBeNull();
	});

	it('blur commits the current value and returns to view mode', () => {
		dispatchDblClick(h.container);
		const ta = h.textareaEl()!;
		ta.value = 'hello world';
		dispatchBlur(ta);
		expect(h.commits.calls).toEqual(['hello world']);
		expect(h.textareaEl()).toBeNull();
		// View re-rendered with the latest committed text.
		expect(h.rendered.calls.at(-1)).toBe('hello world');
	});

	it('Esc collapses to blur — commits and closes', () => {
		dispatchDblClick(h.container);
		const ta = h.textareaEl()!;
		ta.value = 'hello world';
		dispatchKeyDown(ta, 'Escape');
		// Esc fires ta.blur() → blur listener → onCommit. Same as click-out.
		expect(h.commits.calls).toEqual(['hello world']);
		expect(h.textareaEl()).toBeNull();
		expect(h.rendered.calls.at(-1)).toBe('hello world');
	});
});

describe('mountTextNode — debounced auto-save during typing', () => {
	let h: Harness;

	beforeEach(() => {
		vi.useFakeTimers();
		h = setup();
	});

	afterEach(() => {
		h.mounted.destroy();
		vi.useRealTimers();
		document.body.innerHTML = '';
	});

	it('does not commit per keystroke', () => {
		dispatchDblClick(h.container);
		const ta = h.textareaEl()!;
		ta.value = 'a';
		dispatchInput(ta);
		ta.value = 'ab';
		dispatchInput(ta);
		ta.value = 'abc';
		dispatchInput(ta);
		expect(h.commits.calls).toEqual([]);
	});

	it('commits once after the debounce window elapses', () => {
		dispatchDblClick(h.container);
		const ta = h.textareaEl()!;
		ta.value = 'abc';
		dispatchInput(ta);
		vi.advanceTimersByTime(60);
		expect(h.commits.calls).toEqual(['abc']);
	});

	it('debounces resets on subsequent keystrokes', () => {
		dispatchDblClick(h.container);
		const ta = h.textareaEl()!;
		ta.value = 'a';
		dispatchInput(ta);
		vi.advanceTimersByTime(40);
		ta.value = 'ab';
		dispatchInput(ta);
		vi.advanceTimersByTime(40);
		// Still inside the debounce window; no commit yet.
		expect(h.commits.calls).toEqual([]);
		vi.advanceTimersByTime(20);
		expect(h.commits.calls).toEqual(['ab']);
	});

	it('blur flushes pending debounce as a final commit', () => {
		dispatchDblClick(h.container);
		const ta = h.textareaEl()!;
		ta.value = 'abc';
		dispatchInput(ta);
		// Blur before debounce fires.
		dispatchBlur(ta);
		expect(h.commits.calls).toEqual(['abc']);
	});
});

describe('mountTextNode — destroy', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		document.body.innerHTML = '';
	});

	it('flushes pending debounced typing as a final commit on destroy', () => {
		// The host can tear down the editor for structural reasons (edge
		// creation reload, canvas→canvas switch, future delete-node) while
		// the user is mid-debounce. Without flush, those keystrokes are
		// lost.
		const h = setup();
		dispatchDblClick(h.container);
		const ta = h.textareaEl()!;
		ta.value = 'abc';
		dispatchInput(ta);
		// Pending debounce has not fired yet.
		expect(h.commits.calls).toEqual([]);

		h.mounted.destroy();
		expect(h.commits.calls).toEqual(['abc']);

		// And the queued timer must not fire a duplicate commit afterwards.
		vi.advanceTimersByTime(1000);
		expect(h.commits.calls).toEqual(['abc']);
	});

	it('does not fire a spurious commit when destroyed with no pending debounce', () => {
		const h = setup();
		// Never opened the editor — view mode only.
		h.mounted.destroy();
		expect(h.commits.calls).toEqual([]);
	});

	it('does not double-commit when destroy follows a blur', () => {
		// blur path commits and clears the debounce, then destroy on top of
		// that closes the dblclick listener — destroy should see no pending
		// timer and skip the flush.
		const h = setup();
		dispatchDblClick(h.container);
		const ta = h.textareaEl()!;
		ta.value = 'abc';
		dispatchInput(ta);
		dispatchBlur(ta);
		expect(h.commits.calls).toEqual(['abc']);

		h.mounted.destroy();
		expect(h.commits.calls).toEqual(['abc']);
	});
});

describe('textareaEditor — caret placement', () => {
	it('places the caret at the end of the text on focus', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		try {
			const editor = textareaEditor(container, 'hello world', {
				onInput: () => {},
				onCommit: () => {},
			});
			editor.focus();
			const ta = container.querySelector('textarea')!;
			expect(ta.selectionStart).toBe('hello world'.length);
			expect(ta.selectionEnd).toBe('hello world'.length);
			editor.destroy();
		} finally {
			document.body.innerHTML = '';
		}
	});
});
