import joplin from 'api';
import { parseFromBody, serializeToBody } from '../core/format';
import { createSaveScheduler, type SaveScheduler } from '../core/saveScheduler';
import type { ViewHandle } from 'api/types';
import type { BlockSpan, JSONCanvas } from '../core/types';
import { parseNoteRef } from './joplinRef';

interface EditorState {
	noteId: string | null;
	currentBody: string;
	blockSpan: BlockSpan | null;
	webviewReady: boolean;
	saveScheduler: SaveScheduler;
}

const editorState = new Map<ViewHandle, EditorState>();

joplin.plugins.register({
	onStart: async () => {
		await joplin.views.editors.register('canvasEditor', {
			onSetup: async (handle) => {
				const state: EditorState = {
					noteId: null,
					currentBody: '',
					blockSpan: null,
					webviewReady: false,
					saveScheduler: null!, // populated below; needs `state` in scope
				};
				state.saveScheduler = createSaveScheduler({
					getContext: () => {
						if (!state.noteId || !state.blockSpan) return null;
						return { noteId: state.noteId, body: state.currentBody };
					},
					serialise: (currentBody, canvas) =>
						serializeToBody(currentBody, state.blockSpan!, canvas),
					save: (ctx, newBody) =>
						joplin.views.editors.saveNote(handle, {
							noteId: ctx.noteId,
							body: newBody,
						}),
					onSaved: (savedBody) => {
						// JSON length changed → recompute blockSpan from the saved
						// body so the next change writes the right slice.
						state.currentBody = savedBody;
						const reparsed = parseFromBody(savedBody);
						if (reparsed) state.blockSpan = reparsed.blockSpan;
					},
				});
				editorState.set(handle, state);

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
	const titles = await fetchItemTitles(parsed.canvas);
	await joplin.views.editors.postMessage(handle, {
		type: 'load',
		canvas: parsed.canvas,
		titles,
	});
}

async function fetchItemTitles(canvas: JSONCanvas): Promise<Record<string, string>> {
	// Joplin uses `:/<32-hex>` for both notes and resources. Try notes first
	// (the common case), fall back to resources. Anything that 404s on both
	// is silently dropped — the webview falls back to the bare id for display.
	// Click routing is independent: openItem on the host handles both.
	const lookups: Array<Promise<[string, string] | null>> = [];
	for (const node of canvas.nodes) {
		if (node.type !== 'file') continue;
		const refId = parseNoteRef(node.file);
		if (!refId) continue;
		lookups.push(
			resolveItemTitle(refId).then((title) =>
				title ? ([node.id, title] as [string, string]) : null,
			),
		);
	}
	const results = await Promise.all(lookups);
	const titles: Record<string, string> = {};
	for (const result of results) {
		if (result) titles[result[0]] = result[1];
	}
	return titles;
}

async function resolveItemTitle(id: string): Promise<string | null> {
	// itemType returns null for unknown ids (no throw), so one call discriminates
	// notes vs resources without probe-and-catch. ModelType: Note=1, Resource=4.
	const type = (await joplin.data.itemType(id)) as number | null;
	if (type === 1) {
		const note = (await joplin.data.get(['notes', id], { fields: ['title'] })) as {
			title?: string;
		};
		return note?.title || null;
	}
	if (type === 4) {
		// Resources have both `title` and `filename`. Joplin populates `title`
		// from the original filename on attach, but programmatically created
		// resources often leave it empty — fall back to `filename` so the
		// overlay shows something user-recognisable instead of the bare id.
		const resource = (await joplin.data.get(['resources', id], {
			fields: ['title', 'filename'],
		})) as { title?: string; filename?: string };
		return resource?.title || resource?.filename || null;
	}
	return null;
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
		state.saveScheduler.schedule(m.canvas);
		return;
	}

	const link = (m as { link?: unknown }).link;
	if (m.type === 'openItem' && typeof link === 'string') {
		// Joplin's openItem routes notes (`:/<id>`), resources (`:/<id>`),
		// and external URLs (`http(s)://...`) through one entry point; the
		// webview validates the shape so we don't surface Joplin's error
		// dialog for canvas-author typos.
		void joplin.commands.execute('openItem', link);
		return;
	}
}

function isJSONCanvas(value: unknown): value is JSONCanvas {
	if (typeof value !== 'object' || value === null) return false;
	const obj = value as Record<string, unknown>;
	return Array.isArray(obj.nodes);
}
