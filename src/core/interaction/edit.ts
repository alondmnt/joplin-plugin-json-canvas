// Inline text-node editing.
//
// Lifecycle:
//   view ── dblclick ──▶ edit ── blur ──▶ commit + view
//                          └── Esc ─────▶ blur (same path)
//
// Esc collapses to blur — both close the editor and commit the current
// value. We considered Esc-as-revert, but rolling back debounced auto-saves
// from a single keystroke is a footgun: muscle-memory Esc presses would
// silently discard work. Explicit revert belongs to a future Undo command
// (PRD post-MVP); within the textarea, native Cmd/Ctrl+Z already lets the
// user undo their typing before blur.
//
// The TextEditor seam is intentionally thin: the editor owns its DOM and
// raw input, the policy (dblclick-to-enter, blur-to-commit, debounce) lives
// in mountTextNode. Swapping textarea → CodeMirror later is a different
// `editorFactory` — no rewire of the policy layer.

const DEFAULT_DEBOUNCE_MS = 500;

export interface TextEditorCallbacks {
	/** Fires on every input event. mountTextNode debounces save. */
	onInput: () => void;
	/** Fires when the editor signals close (e.g., blur, Esc). */
	onCommit: () => void;
}

export interface TextEditor {
	/** Currently buffered value. */
	getValue: () => string;
	/** Focus the editor and place the caret. */
	focus: () => void;
	/** Tear down listeners and remove DOM. */
	destroy: () => void;
}

export type TextEditorFactory = (
	container: HTMLElement,
	initialText: string,
	callbacks: TextEditorCallbacks,
) => TextEditor;

export interface MountTextNodeOptions {
	/** Pull current canonical markdown text. Re-read on every view render. */
	getText: () => string;
	/** Render parsed markdown HTML into the container for view mode. */
	renderView: (container: HTMLElement, text: string) => void;
	/** Commit text change. Host updates canonical state and schedules save. */
	onCommit: (newText: string) => void;
	/**
	 * Element that receives the dblclick listener. Defaults to `container`.
	 * Pass an ancestor when the container has sibling overlays (e.g.,
	 * hesprs's click-layer) that intercept events before they reach the
	 * content node.
	 */
	eventRoot?: HTMLElement;
	/** Editor implementation. Defaults to textareaEditor. */
	editorFactory?: TextEditorFactory;
	/** Idle ms between input and auto-save. Defaults to 500. */
	debounceMs?: number;
}

export interface MountedTextNode {
	/** Tear down listeners + clear pending timers. Call on viewer dispose. */
	destroy: () => void;
}

export function mountTextNode(
	container: HTMLElement,
	options: MountTextNodeOptions,
): MountedTextNode {
	const editorFactory = options.editorFactory ?? textareaEditor;
	const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
	const eventRoot = options.eventRoot ?? container;

	let mode: 'view' | 'edit' = 'view';
	let editor: TextEditor | null = null;
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let destroyed = false;

	const renderView = (): void => {
		container.innerHTML = '';
		options.renderView(container, options.getText());
	};

	const clearDebounce = (): void => {
		if (debounceTimer !== null) {
			clearTimeout(debounceTimer);
			debounceTimer = null;
		}
	};

	const enterEdit = (): void => {
		if (mode === 'edit' || destroyed) return;
		mode = 'edit';
		container.innerHTML = '';
		editor = editorFactory(container, options.getText(), {
			onInput: () => {
				clearDebounce();
				debounceTimer = setTimeout(() => {
					debounceTimer = null;
					if (editor && !destroyed) options.onCommit(editor.getValue());
				}, debounceMs);
			},
			onCommit: () => {
				// Fires on blur (and on Esc, which the editor maps to blur).
				// Flush any pending debounce as a final commit so we don't
				// lose the last keystrokes between the debounce window and
				// the close.
				const value = editor?.getValue() ?? '';
				clearDebounce();
				if (editor && !destroyed) options.onCommit(value);
				exitEdit();
			},
		});
		editor.focus();
	};

	const exitEdit = (): void => {
		if (mode === 'view') return;
		clearDebounce();
		if (editor) {
			editor.destroy();
			editor = null;
		}
		mode = 'view';
		renderView();
	};

	const onDblClick = (e: Event): void => {
		e.stopPropagation();
		enterEdit();
	};

	eventRoot.addEventListener('dblclick', onDblClick);
	renderView();

	return {
		destroy(): void {
			if (destroyed) return;
			destroyed = true;
			eventRoot.removeEventListener('dblclick', onDblClick);
			clearDebounce();
			if (editor) {
				editor.destroy();
				editor = null;
			}
		},
	};
}

/**
 * Default editor: a `<textarea>` showing the raw markdown source. Inherits
 * the overlay's CSS variables for colour/background via JCV-text-editor.
 */
export const textareaEditor: TextEditorFactory = (container, initialText, callbacks) => {
	container.classList.add('JCV-text-editing');
	const ta = document.createElement('textarea');
	ta.classList.add('JCV-text-editor');
	ta.value = initialText;
	container.appendChild(ta);

	const onInput = (): void => callbacks.onInput();
	const onBlur = (): void => callbacks.onCommit();
	const onKeyDown = (e: Event): void => {
		const ke = e as KeyboardEvent;
		if (ke.key === 'Escape') {
			ke.preventDefault();
			ke.stopPropagation();
			// Map Esc to blur — same path as click-outside, fires onCommit
			// via the blur listener.
			ta.blur();
		}
	};

	ta.addEventListener('input', onInput);
	ta.addEventListener('blur', onBlur);
	ta.addEventListener('keydown', onKeyDown);

	return {
		getValue: () => ta.value,
		focus: () => {
			ta.focus();
			// Caret at end so re-entering an existing node feels like
			// "continue typing" rather than "select all" (destructive) or
			// "caret at start" (unfamiliar).
			const len = ta.value.length;
			ta.setSelectionRange(len, len);
		},
		destroy: () => {
			ta.removeEventListener('input', onInput);
			ta.removeEventListener('blur', onBlur);
			ta.removeEventListener('keydown', onKeyDown);
			ta.remove();
			container.classList.remove('JCV-text-editing');
		},
	};
};
