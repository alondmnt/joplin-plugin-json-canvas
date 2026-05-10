// Per-handle save chain with coalescing.
//
// Two rapid `change` messages from the webview would otherwise produce two
// concurrent persist calls that each read the same pre-save body and race —
// the loser stomps the winner, possibly corrupting the note. The scheduler
// serialises saves so the second one reads the body that the first one
// wrote, and coalesces bursts (only the latest queued canvas is persisted
// once the in-flight save completes; intermediates are dropped because
// they're already obsolete by the time we'd save them).

import type { JSONCanvas } from './types';

export interface SaveContext {
	noteId: string;
	body: string;
}

export interface SaveSchedulerOptions {
	/** Read current persisted body + identity. Called once per save. */
	getContext: () => SaveContext | null;
	/** Splice canvas into the body, returning the body to persist. */
	serialise: (currentBody: string, canvas: JSONCanvas) => string;
	/** Persist the new body for a note. Resolves on success. */
	save: (ctx: SaveContext, newBody: string) => Promise<void>;
	/** Called after each successful save with the saved body. */
	onSaved: (savedBody: string) => void;
}

export interface SaveScheduler {
	/** Queue a canvas to be saved. Coalesces rapid successive calls. */
	schedule: (canvas: JSONCanvas) => void;
	/** Resolves when all queued saves have settled. Primarily for tests. */
	drain: () => Promise<void>;
}

export function createSaveScheduler(opts: SaveSchedulerOptions): SaveScheduler {
	let inflight: Promise<void> | null = null;
	let pending: JSONCanvas | null = null;

	const runOnce = async (canvas: JSONCanvas): Promise<void> => {
		const ctx = opts.getContext();
		if (!ctx) return;
		const newBody = opts.serialise(ctx.body, canvas);
		await opts.save(ctx, newBody);
		opts.onSaved(newBody);
	};

	const runLoop = async (firstCanvas: JSONCanvas): Promise<void> => {
		let next: JSONCanvas | null = firstCanvas;
		try {
			while (next !== null) {
				const current = next;
				next = null;
				try {
					await runOnce(current);
				} catch (err) {
					// A save failure shouldn't stall the chain — log and keep
					// draining so the latest queued canvas still gets a shot.
					console.error('Canvas: save failed', err);
				}
				if (pending !== null) {
					next = pending;
					pending = null;
				}
			}
		} finally {
			inflight = null;
		}
	};

	return {
		schedule(canvas: JSONCanvas): void {
			if (inflight) {
				// A save is in flight — stash the latest canvas; the running
				// loop picks it up when the current save settles. Replacing
				// rather than queuing is the coalescing.
				pending = canvas;
				return;
			}
			inflight = runLoop(canvas);
		},
		drain(): Promise<void> {
			return inflight ?? Promise.resolve();
		},
	};
}
