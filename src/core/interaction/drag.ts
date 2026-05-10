// Drag-to-move gesture handler for hesprs's overlay layer.
//
// Why capture-phase: hesprs uses pointeract to listen for pointerdown on the
// canvas container during the bubble phase. If we listen on document with the
// default bubble phase, pointeract sees the event first and starts a stage pan.
// Capturing on document runs us before pointeract; stopPropagation prevents
// pointeract from claiming the gesture.
//
// During drag we mutate overlay.style.left/top directly (canvas-space coords,
// scale-aware via the overlay layer's CSS transform). On drag-end we hand the
// new position back to the caller, which writes to canonical canvas data and
// reloads the viewer so canvas-side edges follow.

import type { CanvasNode } from '../types';

export interface DragHandlerOptions {
	/** Look up the current canonical node for the hit-tested overlay id. */
	getNode: (id: string) => CanvasNode | null;
	/** Fires on every pointermove during a drag. Use for visual sync. */
	onMove: (id: string, newX: number, newY: number) => void;
	/** Fires once on drag-end. Use for committing canonical state (save). */
	onCommit: (id: string, newX: number, newY: number) => void;
	/**
	 * Fires when the OS interrupts the gesture mid-drag (touch interruption,
	 * modal, focus loss). Caller must revert canonical state to (originalX,
	 * originalY) and trigger a refresh — no onChange fires for the cancel.
	 * Required, not optional: without it, the overlay is reverted by us but
	 * canonical state stays at the moved position, leaving worse drift than
	 * not handling cancel at all.
	 */
	onCancel: (id: string, originalX: number, originalY: number) => void;
	/** Fires on pointerup when the gesture stayed below the move threshold. */
	onClick?: (id: string) => void;
}

interface DragState {
	nodeId: string;
	overlay: HTMLElement;
	startClientX: number;
	startClientY: number;
	startNodeX: number;
	startNodeY: number;
	moved: boolean;
}

export function attachDragHandler(options: DragHandlerOptions): () => void {
	let drag: DragState | null = null;

	const onPointerDown = (event: Event): void => {
		const e = event as PointerEvent;
		const target = e.target as HTMLElement | null;
		// Form controls (textarea/input) and contenteditable surfaces own the
		// gesture for cursor positioning and text selection. Don't start drag
		// tracking, but still stopPropagation so hesprs's pointeract doesn't
		// claim the event as a stage pan. The browser's native action (focus,
		// caret, selection) isn't blocked by stopPropagation.
		if (target && isFormControl(target)) {
			e.stopPropagation();
			return;
		}
		// Edge-creation handles own pointerdown for the connector gesture.
		// Step aside without stopPropagation so edge.ts's capture-phase
		// listener still sees the event. The CSS class is the contract;
		// importing a predicate from edge.ts would couple the two modules
		// for one line of logic.
		if (target && target.classList.contains('JCV-edge-handle')) {
			return;
		}
		const overlay = findOverlay(e.target);
		if (!overlay) return;
		const node = options.getNode(overlay.id);
		if (!node) return;
		drag = {
			nodeId: overlay.id,
			overlay,
			startClientX: e.clientX,
			startClientY: e.clientY,
			startNodeX: node.x,
			startNodeY: node.y,
			moved: false,
		};
		e.stopPropagation();
	};

	const onPointerMove = (event: Event): void => {
		if (!drag) return;
		const e = event as PointerEvent;
		const scale = readScale();
		const dx = (e.clientX - drag.startClientX) / scale;
		const dy = (e.clientY - drag.startClientY) / scale;
		if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
		const newX = drag.startNodeX + dx;
		const newY = drag.startNodeY + dy;
		drag.overlay.style.left = `${newX}px`;
		drag.overlay.style.top = `${newY}px`;
		options.onMove(drag.nodeId, newX, newY);
		e.stopPropagation();
	};

	const onPointerUp = (): void => {
		if (!drag) return;
		if (drag.moved) {
			const newX = parseFloat(drag.overlay.style.left);
			const newY = parseFloat(drag.overlay.style.top);
			options.onCommit(drag.nodeId, newX, newY);
		} else {
			options.onClick?.(drag.nodeId);
		}
		drag = null;
	};

	const onPointerCancel = (): void => {
		if (!drag) return;
		// Revert the overlay we'd been mutating directly, then ask the host
		// to revert canonical x/y. Skipping onCommit means no save fires for
		// the discarded gesture.
		drag.overlay.style.left = `${drag.startNodeX}px`;
		drag.overlay.style.top = `${drag.startNodeY}px`;
		options.onCancel(drag.nodeId, drag.startNodeX, drag.startNodeY);
		drag = null;
	};

	const opts = { capture: true };
	document.addEventListener('pointerdown', onPointerDown, opts);
	document.addEventListener('pointermove', onPointerMove, opts);
	document.addEventListener('pointerup', onPointerUp, opts);
	document.addEventListener('pointercancel', onPointerCancel, opts);

	return (): void => {
		document.removeEventListener('pointerdown', onPointerDown, opts);
		document.removeEventListener('pointermove', onPointerMove, opts);
		document.removeEventListener('pointerup', onPointerUp, opts);
		document.removeEventListener('pointercancel', onPointerCancel, opts);
	};
}

function findOverlay(target: EventTarget | null): HTMLElement | null {
	let el = target as HTMLElement | null;
	while (el && el !== document.body) {
		if (el.classList?.contains('JCV-overlay-container')) return el;
		el = el.parentElement;
	}
	return null;
}

function isFormControl(el: HTMLElement): boolean {
	return el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.isContentEditable;
}

function readScale(): number {
	const layer = document.querySelector('.JCV-overlays') as HTMLElement | null;
	if (!layer) return 1;
	const m = /scale\(([0-9.]+)\)/.exec(layer.style.transform);
	return m ? parseFloat(m[1]) : 1;
}
