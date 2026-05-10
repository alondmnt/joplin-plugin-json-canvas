// Delete-node gesture: read hesprs's existing selection (the JCV-active
// class on the selected overlay) and remove the node + its incident edges
// when Delete or Backspace is pressed.
//
// We lean on hesprs's selection rather than building our own: hesprs already
// adds JCV-active to the clicked overlay and removes it when the user clicks
// another overlay or empty space. Reading from the DOM is the same DOM-
// contract trade-off we accept in drag.ts and edge.ts (overlay-container,
// click-layer); the CSS class is the seam, not a hesprs API import.
//
// Edge selection isn't covered here — hesprs draws edges on its canvas
// layer with no DOM hit-target, so a separate hit-test is needed for that.
// Issue #15 (delete edge) is the HITL design discussion.

const ACTIVE_OVERLAY_SELECTOR = '.JCV-overlay-container.JCV-active[id]';

export interface DeleteHandlerOptions {
	/** Container scope; the selected overlay is queried beneath this root. */
	root: HTMLElement;
	/** Fires when Delete/Backspace is pressed with a node selected. */
	onDelete: (nodeId: string) => void;
}

export function attachDeleteHandler(options: DeleteHandlerOptions): () => void {
	const onKeyDown = (event: Event): void => {
		const ke = event as KeyboardEvent;
		if (ke.key !== 'Delete' && ke.key !== 'Backspace') return;
		const target = ke.target as HTMLElement | null;
		// Form controls own these keys for their own editing semantics —
		// Backspace deletes a character in the textarea, not the node.
		if (target && isFormControl(target)) return;
		const active = options.root.querySelector<HTMLElement>(ACTIVE_OVERLAY_SELECTOR);
		if (!active) return;
		// preventDefault only when we're actually going to act, so a stray
		// Backspace in a non-canvas context isn't suppressed needlessly.
		ke.preventDefault();
		options.onDelete(active.id);
	};

	document.addEventListener('keydown', onKeyDown);
	return (): void => document.removeEventListener('keydown', onKeyDown);
}

function isFormControl(el: HTMLElement): boolean {
	return el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.isContentEditable;
}
