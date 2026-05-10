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
	const container = document.createElement('div');
	document.body.appendChild(container);

	const currentText = { value: initial };
	const rendered = { calls: [] as string[] };
	const commits = { calls: [] as string[] };

	const mounted = mountTextNode(container, {
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

	it('Esc closes the editor without firing onCommit', () => {
		dispatchDblClick(h.container);
		const ta = h.textareaEl()!;
		ta.value = 'hello world';
		dispatchKeyDown(ta, 'Escape');
		expect(h.commits.calls).toEqual([]);
		expect(h.textareaEl()).toBeNull();
		// View re-rendered. Per design, Esc shows last canonical text — which
		// in this test was never updated, so it shows the initial 'hello'.
		expect(h.rendered.calls.at(-1)).toBe('hello');
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
	it('clears pending debounce so commits do not fire after destroy', () => {
		vi.useFakeTimers();
		const h = setup();
		try {
			dispatchDblClick(h.container);
			const ta = h.textareaEl()!;
			ta.value = 'abc';
			dispatchInput(ta);
			h.mounted.destroy();
			vi.advanceTimersByTime(1000);
			expect(h.commits.calls).toEqual([]);
		} finally {
			vi.useRealTimers();
			document.body.innerHTML = '';
		}
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
				onCancel: () => {},
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
