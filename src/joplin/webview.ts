// Webview entry. Runs inside the Joplin editor webview iframe.
// Communicates with the plugin host via the global `webviewApi` object.
//
// Commit 3 (here): post a `ready` message so the host knows the script booted.
// Commit 4: receive `load` messages and render via hesprs.
// Commit 5: register drag-to-move gesture handlers.
// Commit 6: emit `change` messages on drag-end.

declare const webviewApi: {
	postMessage(message: unknown): Promise<unknown>;
	onMessage(handler: (event: { message: unknown }) => void): void;
};

webviewApi.postMessage({ type: 'ready' });
