import joplin from 'api';
import { bodyHasCanvasFence, parseFromBody, serializeToBody } from '../core/format';
import type { ViewHandle } from 'api/types';
import type { BlockSpan, JSONCanvas } from '../core/types';

interface EditorState {
	noteId: string | null;
	currentBody: string;
	blockSpan: BlockSpan | null;
	webviewReady: boolean;
	pendingCanvas: JSONCanvas | null;
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
					pendingCanvas: null,
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
				if (!bodyHasCanvasFence(note.body)) return false;
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

	if (state.webviewReady) {
		await joplin.views.editors.postMessage(handle, {
			type: 'load',
			canvas: parsed.canvas,
		});
	} else {
		state.pendingCanvas = parsed.canvas;
	}
}

function handleMessage(handle: ViewHandle, message: unknown): void {
	const state = editorState.get(handle);
	if (!state) return;
	if (typeof message !== 'object' || message === null) return;
	const m = message as { type?: unknown; canvas?: unknown };

	if (m.type === 'ready') {
		state.webviewReady = true;
		if (state.pendingCanvas) {
			void joplin.views.editors.postMessage(handle, {
				type: 'load',
				canvas: state.pendingCanvas,
			});
			state.pendingCanvas = null;
		}
		return;
	}

	if (m.type === 'change' && isJSONCanvas(m.canvas)) {
		void persistChange(handle, m.canvas);
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
