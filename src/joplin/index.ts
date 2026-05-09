import joplin from 'api';

joplin.plugins.register({
	onStart: async () => {
		// Editor registration lands in commit 3.
	},
});
