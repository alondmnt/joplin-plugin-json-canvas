import joplin from 'api';
import { bodyHasCanvasFence, parseFromBody } from '../core/format';

joplin.plugins.register({
	onStart: async () => {
		await joplin.views.editors.register('canvasEditor', {
			onSetup: async (handle) => {
				await joplin.views.editors.setHtml(handle, '<div id="root"></div>');
				await joplin.views.editors.addScript(handle, './joplin/webview.js');
				await joplin.views.editors.addScript(handle, './joplin/webview.css');
			},
			onActivationCheck: async ({ noteId }) => {
				if (!noteId) return false;
				const note = await joplin.data.get(['notes', noteId], { fields: ['body'] });
				if (!bodyHasCanvasFence(note.body)) return false;
				// Strict activation per Q13: parse + schema check now so the
				// editor toggle only appears when the canvas is actually loadable.
				return parseFromBody(note.body) !== null;
			},
		});
	},
});
