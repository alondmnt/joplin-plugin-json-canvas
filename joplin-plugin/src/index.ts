import joplin from 'api';

joplin.plugins.register({
  onStart: async () => {
    // Register the canvas editor view. onActivationCheck returns true for notes
    // whose body parses as JSON with a `nodes` array — sufficient sniff for the
    // spike. Real plugin would use a more disciplined detection (e.g. resource
    // mime type or explicit marker).
    await joplin.views.editors.register('jsCanvasEditor', {
      onSetup: async (handle) => {
        await joplin.views.editors.addScript(handle, './webview.js');
        await joplin.views.editors.addScript(handle, './webview.css');
        await joplin.views.editors.setHtml(handle, '<div id="root"></div>');
      },
      onActivationCheck: async ({ noteId }) => {
        if (!noteId) return false;
        const note = await joplin.data.get(['notes', noteId], { fields: ['body'] });
        return looksLikeJsonCanvas(note.body);
      },
    });
  },
});

function looksLikeJsonCanvas(body: string): boolean {
  if (!body) return false;
  const trimmed = body.trim();
  if (!trimmed.startsWith('{')) return false;
  try {
    const doc = JSON.parse(trimmed);
    return Array.isArray(doc.nodes);
  } catch {
    return false;
  }
}
