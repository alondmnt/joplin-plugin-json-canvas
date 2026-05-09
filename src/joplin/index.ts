import joplin from 'api';
import { parseFromBody, serializeToBody } from '../core/format';
import type { ViewHandle } from 'api/types';
import type { BlockSpan, JSONCanvas } from '../core/types';
import { parseNoteRef } from './joplinRef';

interface EditorState {
	noteId: string | null;
	currentBody: string;
	blockSpan: BlockSpan | null;
	webviewReady: boolean;
}

const editorState = new Map<ViewHandle, EditorState>();

joplin.plugins.register({
	onStart: async () => {
		await joplin.views.editors.register('canvasEditor', {
			onSetup: async (handle) => {
				editorState.set(handle, {
					noteId: null,
					currentBody: '',
					blockSpan: null,
					webviewReady: false,
				});

				await joplin.views.editors.setHtml(handle, '<div id="root"></div>');
				await joplin.views.editors.addScript(handle, './joplin/webview.js');
				await joplin.views.editors.addScript(handle, './joplin/webview.css');

				await joplin.views.editors.onMessage(handle, (message: unknown) => {
					handleMessage(handle, message);
				});

				await joplin.views.editors.onUpdate(handle, async () => {
					await loadFromCurrentNote(handle);
				});
			},
			onActivationCheck: async ({ noteId }) => {
				if (!noteId) return false;
				const note = await joplin.data.get(['notes', noteId], { fields: ['body'] });
				// Strict activation per Q13: parse + schema check so the editor
				// toggle only appears when the canvas is actually loadable.
				// parseFromBody returns null cheaply if no fence is present.
				return parseFromBody(note.body) !== null;
			},
		});
	},
});

async function loadFromCurrentNote(handle: ViewHandle): Promise<void> {
	const state = editorState.get(handle);
	if (!state) return;

	const note = await joplin.workspace.selectedNote();
	if (!note) return;

	const noteRecord = await joplin.data.get(['notes', note.id], { fields: ['id', 'body'] });
	const parsed = parseFromBody(noteRecord.body);
	if (!parsed) return;

	state.noteId = noteRecord.id;
	state.currentBody = noteRecord.body;
	state.blockSpan = parsed.blockSpan;

	if (!state.webviewReady) return;
	const titles = await fetchNoteTitles(parsed.canvas);
	await joplin.views.editors.postMessage(handle, {
		type: 'load',
		canvas: parsed.canvas,
		titles,
	});
}

async function fetchNoteTitles(canvas: JSONCanvas): Promise<Record<string, string>> {
	// Joplin uses the same `:/<32-hex>` shape for both notes and resources.
	// We probe via `data.get(['notes', id])` and only keep entries that resolve;
	// a resource id throws a 404 and is silently dropped, leaving the webview
	// to render a placeholder and short-circuit clicks.
	const lookups: Array<Promise<[string, string] | null>> = [];
	for (const node of canvas.nodes) {
		if (node.type !== 'file') continue;
		const refId = parseNoteRef(node.file);
		if (!refId) continue;
		lookups.push(
			joplin.data
				.get(['notes', refId], { fields: ['title'] })
				.then((note: { title?: string }) =>
					note?.title ? ([node.id, note.title] as [string, string]) : null,
				)
				.catch(() => null),
		);
	}
	const results = await Promise.all(lookups);
	const titles: Record<string, string> = {};
	for (const result of results) {
		if (result) titles[result[0]] = result[1];
	}
	return titles;
}

function handleMessage(handle: ViewHandle, message: unknown): void {
	const state = editorState.get(handle);
	if (!state) return;
	if (typeof message !== 'object' || message === null) return;
	const m = message as { type?: unknown; canvas?: unknown };

	if (m.type === 'ready') {
		// Re-fetch and post on every ready, not just the first one. Joplin can
		// destroy and recreate the webview iframe on Canvas/Markdown editor
		// toggles — a fresh iframe sends `ready` again and needs the current
		// canvas posted to its new onMessage handler. Idempotent in the
		// iframe-stays-alive case (a redundant data.get).
		state.webviewReady = true;
		void loadFromCurrentNote(handle);
		return;
	}

	if (m.type === 'change' && isJSONCanvas(m.canvas)) {
		void persistChange(handle, m.canvas);
		return;
	}

	if (m.type === 'requestOpen' && typeof (m as { noteId?: unknown }).noteId === 'string') {
		void joplin.commands.execute('openNote', (m as { noteId: string }).noteId);
		return;
	}
}

async function persistChange(handle: ViewHandle, canvas: JSONCanvas): Promise<void> {
	const state = editorState.get(handle);
	if (!state || !state.noteId || !state.blockSpan) return;

	const newBody = serializeToBody(state.currentBody, state.blockSpan, canvas);
	await joplin.views.editors.saveNote(handle, {
		noteId: state.noteId,
		body: newBody,
	});

	// JSON length changed → recompute blockSpan from the saved body so the
	// next change writes the right slice.
	state.currentBody = newBody;
	const reparsed = parseFromBody(newBody);
	if (reparsed) state.blockSpan = reparsed.blockSpan;
}

function isJSONCanvas(value: unknown): value is JSONCanvas {
	if (typeof value !== 'object' || value === null) return false;
	const obj = value as Record<string, unknown>;
	return Array.isArray(obj.nodes);
}
