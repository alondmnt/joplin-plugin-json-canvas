// Webview entry. Runs inside the Joplin editor webview iframe.
// Communicates with the plugin host via the global `webviewApi` object.

import { CanvasView } from '../core/CanvasView';
import type { CanvasFileNode, JSONCanvas } from '../core/types';
import { parseNoteRef } from './joplinRef';

declare const webviewApi: {
	postMessage(message: unknown): Promise<unknown>;
	onMessage(handler: (event: { message: unknown }) => void): void;
};

interface LoadMessage {
	type: 'load';
	canvas: JSONCanvas;
	titles?: Record<string, string>;
}

const root = document.getElementById('root');
if (!root) throw new Error('canvas webview: missing #root container');

let view: CanvasView | null = null;
// Resolved note titles keyed by node id. Populated from each load message;
// closed over by the file-renderer below so render() and onClick() always
// see the freshest map.
let titles: Record<string, string> = {};

webviewApi.onMessage(({ message }) => {
	if (!isLoadMessage(message)) return;
	titles = message.titles ?? {};
	if (!view) {
		view = new CanvasView({
			container: root,
			onChange: (canvas) => {
				void webviewApi.postMessage({ type: 'change', canvas });
			},
			fileRenderer: {
				matches: (file) => parseNoteRef(file) !== null,
				render: renderJoplinNote,
				onClick: handleJoplinNoteClick,
			},
		});
	}
	view.load(message.canvas);
});

webviewApi.postMessage({ type: 'ready' });

function renderJoplinNote(container: HTMLElement, node: CanvasFileNode): void {
	container.classList.add('JCV-joplin-note');
	const label = document.createElement('div');
	label.classList.add('JCV-joplin-note-label');
	// Fall back to the bare id if the host couldn't resolve a title (e.g.,
	// the ref is a resource, not a note). Click handler will short-circuit.
	label.textContent = titles[node.id] ?? parseNoteRef(node.file) ?? node.file;
	container.appendChild(label);
}

function handleJoplinNoteClick(node: CanvasFileNode): void {
	const noteId = parseNoteRef(node.file);
	if (!noteId) return;
	if (!titles[node.id]) {
		// No resolved title => the ref isn't a note we know about (likely a
		// resource id). Resource handling is a separate slice; ignore here.
		console.debug('Canvas: clicked file ref without resolved title', node.file);
		return;
	}
	void webviewApi.postMessage({ type: 'requestOpen', noteId });
}

function isLoadMessage(value: unknown): value is LoadMessage {
	if (typeof value !== 'object' || value === null) return false;
	const m = value as { type?: unknown };
	return m.type === 'load';
}
