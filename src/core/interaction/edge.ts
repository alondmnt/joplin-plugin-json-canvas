// Edge-creation gesture: drag from a side handle on one node to another.
//
// Lifecycle:
//   pointerdown on .JCV-edge-handle ── mount preview SVG, capture fromNode/fromSide
//   pointermove                       ── update SVG endpoint to cursor
//   pointerup on overlay              ── commit edge (toNode = hit, toSide = closest side)
//   pointerup on empty / Esc / cancel ── tear down preview, no commit
//
// We mount four handles per overlay-container[id] within the given root, and
// install document-level capture-phase pointer listeners that filter on the
// JCV-edge-handle class. The preview SVG is screen-space (position: fixed)
// so we work in clientX/clientY without scale-math; panning is suppressed
// because our pointerdown stopPropagation prevents pointeract from claiming
// the gesture.
//
// Coordination with drag.ts: drag.ts has its own classList early-exit on
// JCV-edge-handle so a handle pointerdown doesn't kick off a node-move drag
// in parallel.
//
// ID format is 16-char hex via crypto.getRandomValues — matches Obsidian
// Canvas's convention so cross-tool round-trips look native. Inlined here
// rather than factored into a helper module: one current caller, no real
// caller pressure to share yet (create-node will, when it lands).

import type { CanvasEdge, EdgeSide } from '../types';

const SIDES: readonly EdgeSide[] = ['top', 'right', 'bottom', 'left'] as const;
const HANDLE_CLASS = 'JCV-edge-handle';
const PREVIEW_CLASS = 'JCV-edge-preview';
const OVERLAY_SELECTOR = '.JCV-overlay-container[id]';

export interface EdgeGestureOptions {
	/** Container scope. Handles mount on every JCV-overlay-container[id] beneath. */
	root: HTMLElement;
	/** Commit a new edge. Host appends to canvas.edges + reloads viewer. */
	onCommit: (edge: CanvasEdge) => void;
}

interface GestureState {
	fromNode: string;
	fromSide: EdgeSide;
	startX: number;
	startY: number;
	svg: SVGSVGElement;
	line: SVGLineElement;
}

export function attachEdgeGesture(options: EdgeGestureOptions): () => void {
	const handles: HTMLElement[] = [];

	const mountHandlesFor = (overlay: HTMLElement): void => {
		// Idempotent: hesprs may re-emit a mutation for an overlay that we've
		// already decorated (e.g., during a pan that re-orders children).
		if (overlay.dataset.edgeHandlesMounted === '1') return;
		overlay.dataset.edgeHandlesMounted = '1';
		for (const side of SIDES) {
			const handle = document.createElement('div');
			handle.classList.add(HANDLE_CLASS, `${HANDLE_CLASS}-${side}`);
			handle.dataset.side = side;
			overlay.appendChild(handle);
			handles.push(handle);
		}
	};

	// Mount on any overlays already in the DOM at attach-time.
	for (const overlay of options.root.querySelectorAll<HTMLElement>(OVERLAY_SELECTOR)) {
		mountHandlesFor(overlay);
	}

	// hesprs's renderOverlays creates text-node overlays asynchronously: each
	// node iteration is wrapped in `async t => { await e(t.ref) }`, and the
	// text branch awaits `this.parse(text)` before calling createOverlay. The
	// `await` schedules a microtask boundary even when the parser is sync,
	// so by the time viewer.load returns the file/link overlays are mounted
	// but text overlays are not — they appear one microtask later. A sync
	// querySelectorAll at attach-time would miss them entirely. MutationObserver
	// catches them when they actually land, without coupling us to hesprs's
	// internal timing or having to guess at deferral via setTimeout/rAF.
	const observer = new MutationObserver((mutations) => {
		for (const m of mutations) {
			for (const added of m.addedNodes) {
				if (!(added instanceof HTMLElement)) continue;
				if (added.matches(OVERLAY_SELECTOR)) mountHandlesFor(added);
				for (const nested of added.querySelectorAll<HTMLElement>(OVERLAY_SELECTOR)) {
					mountHandlesFor(nested);
				}
			}
		}
	});
	observer.observe(options.root, { childList: true, subtree: true });

	let gesture: GestureState | null = null;

	const teardownPreview = (): void => {
		if (!gesture) return;
		gesture.svg.remove();
		gesture = null;
	};

	const onPointerDown = (event: Event): void => {
		const e = event as PointerEvent;
		const target = e.target as HTMLElement | null;
		if (!target || !target.classList.contains(HANDLE_CLASS)) return;
		const overlay = target.closest<HTMLElement>(OVERLAY_SELECTOR);
		if (!overlay) return;
		const side = target.dataset.side as EdgeSide | undefined;
		if (!side) return;
		const rect = target.getBoundingClientRect();
		const startX = rect.left + rect.width / 2;
		const startY = rect.top + rect.height / 2;
		const { svg, line } = createPreview(startX, startY);
		document.body.appendChild(svg);
		gesture = {
			fromNode: overlay.id,
			fromSide: side,
			startX,
			startY,
			svg,
			line,
		};
		// Prevent hesprs's pointeract from claiming this as a stage pan.
		e.stopPropagation();
	};

	const onPointerMove = (event: Event): void => {
		if (!gesture) return;
		const e = event as PointerEvent;
		gesture.line.setAttribute('x2', String(e.clientX));
		gesture.line.setAttribute('y2', String(e.clientY));
		e.stopPropagation();
	};

	const onPointerUp = (event: Event): void => {
		if (!gesture) return;
		const e = event as PointerEvent;
		// elementFromPoint requires the SVG preview to NOT capture pointer
		// events (CSS sets pointer-events: none); otherwise the cursor lands
		// on the SVG and we'd resolve that as the drop target.
		const dropTarget = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
		const overlay = dropTarget?.closest<HTMLElement>(OVERLAY_SELECTOR) ?? null;
		if (overlay) {
			const toSide = closestSide(overlay, e.clientX, e.clientY);
			const edge: CanvasEdge = {
				id: newCanvasId(),
				fromNode: gesture.fromNode,
				fromSide: gesture.fromSide,
				toNode: overlay.id,
				toSide,
			};
			options.onCommit(edge);
		}
		teardownPreview();
		e.stopPropagation();
	};

	const onPointerCancel = (): void => {
		teardownPreview();
	};

	const onKeyDown = (event: Event): void => {
		if (!gesture) return;
		const ke = event as KeyboardEvent;
		if (ke.key !== 'Escape') return;
		ke.preventDefault();
		ke.stopPropagation();
		teardownPreview();
	};

	const opts = { capture: true };
	document.addEventListener('pointerdown', onPointerDown, opts);
	document.addEventListener('pointermove', onPointerMove, opts);
	document.addEventListener('pointerup', onPointerUp, opts);
	document.addEventListener('pointercancel', onPointerCancel, opts);
	document.addEventListener('keydown', onKeyDown, opts);

	return (): void => {
		observer.disconnect();
		document.removeEventListener('pointerdown', onPointerDown, opts);
		document.removeEventListener('pointermove', onPointerMove, opts);
		document.removeEventListener('pointerup', onPointerUp, opts);
		document.removeEventListener('pointercancel', onPointerCancel, opts);
		document.removeEventListener('keydown', onKeyDown, opts);
		teardownPreview();
		for (const h of handles) h.remove();
	};
}

function closestSide(overlay: HTMLElement, clientX: number, clientY: number): EdgeSide {
	const r = overlay.getBoundingClientRect();
	const localX = clientX - r.left;
	const localY = clientY - r.top;
	const distances: Record<EdgeSide, number> = {
		top: localY,
		right: r.width - localX,
		bottom: r.height - localY,
		left: localX,
	};
	let best: EdgeSide = 'top';
	let bestDist = distances.top;
	for (const side of SIDES) {
		if (distances[side] < bestDist) {
			best = side;
			bestDist = distances[side];
		}
	}
	return best;
}

function createPreview(
	startX: number,
	startY: number,
): { svg: SVGSVGElement; line: SVGLineElement } {
	const svgNS = 'http://www.w3.org/2000/svg';
	const svg = document.createElementNS(svgNS, 'svg') as SVGSVGElement;
	svg.classList.add(PREVIEW_CLASS);
	const line = document.createElementNS(svgNS, 'line') as SVGLineElement;
	line.setAttribute('x1', String(startX));
	line.setAttribute('y1', String(startY));
	line.setAttribute('x2', String(startX));
	line.setAttribute('y2', String(startY));
	svg.appendChild(line);
	return { svg, line };
}

function newCanvasId(): string {
	const bytes = new Uint8Array(8);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
