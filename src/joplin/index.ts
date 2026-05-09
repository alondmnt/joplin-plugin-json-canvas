import joplin from 'api';
import { bodyHasCanvasFence, parseFromBody } from '../core/format';
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
	const { type } = message as { type?: unknown };

	if (type === 'ready') {
		state.webviewReady = true;
		if (state.pendingCanvas) {
			void joplin.views.editors.postMessage(handle, {
				type: 'load',
				canvas: state.pendingCanvas,
			});
			state.pendingCanvas = null;
		}
	}
}
