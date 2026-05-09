// Webview entry. Runs inside the Joplin editor webview iframe.
// Communicates with the plugin host via the global `webviewApi` object.

import { CanvasView } from '../core/CanvasView';
import type { JSONCanvas } from '../core/types';

declare const webviewApi: {
	postMessage(message: unknown): Promise<unknown>;
	onMessage(handler: (event: { message: unknown }) => void): void;
};

interface LoadMessage {
	type: 'load';
	canvas: JSONCanvas;
}

const root = document.getElementById('root');
if (!root) throw new Error('canvas webview: missing #root container');

let view: CanvasView | null = null;

webviewApi.onMessage(({ message }) => {
	if (!isLoadMessage(message)) return;
	if (!view) view = new CanvasView({ container: root });
	view.load(message.canvas);
});

webviewApi.postMessage({ type: 'ready' });

function isLoadMessage(value: unknown): value is LoadMessage {
	if (typeof value !== 'object' || value === null) return false;
	const m = value as { type?: unknown };
	return m.type === 'load';
}
