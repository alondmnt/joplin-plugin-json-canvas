import { describe, it, expect, vi } from 'vitest';
import { createSaveScheduler } from './saveScheduler';
import type { JSONCanvas } from './types';

const mkCanvas = (id: string): JSONCanvas => ({
	nodes: [{ id, type: 'text', text: id, x: 0, y: 0, width: 1, height: 1 }],
	edges: [],
});

interface Harness {
	scheduler: ReturnType<typeof createSaveScheduler>;
	saved: string[];
}

function makeHarness(): Harness {
	const saved: string[] = [];
	const scheduler = createSaveScheduler({
		getContext: () => ({ noteId: 'n', body: 'BODY' }),
		serialise: (_body, canvas) => `s:${canvas.nodes[0].id}`,
		save: async (_ctx, body) => {
			saved.push(body);
		},
		onSaved: () => {},
	});
	return { scheduler, saved };
}

describe('createSaveScheduler', () => {
	it('saves a single scheduled canvas', async () => {
		const { scheduler, saved } = makeHarness();
		scheduler.schedule(mkCanvas('a'));
		await scheduler.drain();
		expect(saved).toEqual(['s:a']);
	});

	it('coalesces a burst of schedules into the latest only', async () => {
		// Acceptance criterion: 10+ rapid changes produce a final saved body
		// that matches the LAST change, with intermediates dropped.
		const recorder: { saved: string[] } = { saved: [] };
		let saveCount = 0;
		let releaseFirst!: () => void;
		const firstGate = new Promise<void>((r) => {
			releaseFirst = r;
		});

		const scheduler = createSaveScheduler({
			getContext: () => ({ noteId: 'n', body: 'BODY' }),
			serialise: (_b, c) => `s:${c.nodes[0].id}`,
			save: async (_ctx, body) => {
				saveCount++;
				if (saveCount === 1) await firstGate;
				recorder.saved.push(body);
			},
			onSaved: () => {},
		});

		scheduler.schedule(mkCanvas('first'));
		for (let i = 1; i <= 9; i++) scheduler.schedule(mkCanvas(`mid${i}`));
		scheduler.schedule(mkCanvas('last'));
		releaseFirst();
		await scheduler.drain();

		// First save was already in flight when the rest arrived; intermediates
		// coalesce away; only `last` is persisted as the second save.
		expect(recorder.saved).toEqual(['s:first', 's:last']);
	});

	it('drain resolves immediately when no save is pending', async () => {
		const { scheduler } = makeHarness();
		await expect(scheduler.drain()).resolves.toBeUndefined();
	});

	it('a fresh schedule after the chain drains starts a new save', async () => {
		const { scheduler, saved } = makeHarness();
		scheduler.schedule(mkCanvas('a'));
		await scheduler.drain();
		scheduler.schedule(mkCanvas('b'));
		await scheduler.drain();
		expect(saved).toEqual(['s:a', 's:b']);
	});

	it('a save error does not stall the chain', async () => {
		const saved: string[] = [];
		let saveCount = 0;
		let releaseFirst!: () => void;
		const firstGate = new Promise<void>((r) => {
			releaseFirst = r;
		});

		const scheduler = createSaveScheduler({
			getContext: () => ({ noteId: 'n', body: 'BODY' }),
			serialise: (_b, c) => `s:${c.nodes[0].id}`,
			save: async (_ctx, body) => {
				saveCount++;
				if (saveCount === 1) {
					await firstGate;
					throw new Error('boom');
				}
				saved.push(body);
			},
			onSaved: () => {},
		});

		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			scheduler.schedule(mkCanvas('first'));
			scheduler.schedule(mkCanvas('second'));
			releaseFirst();
			await scheduler.drain();
		} finally {
			errSpy.mockRestore();
		}
		// First save threw; second still runs against latest canvas.
		expect(saved).toEqual(['s:second']);
	});

	it('passes the latest body through onSaved for blockSpan recompute', async () => {
		const seenSavedBodies: string[] = [];
		const scheduler = createSaveScheduler({
			getContext: () => ({ noteId: 'n', body: 'BODY' }),
			serialise: (_b, c) => `s:${c.nodes[0].id}`,
			save: async () => {},
			onSaved: (body) => seenSavedBodies.push(body),
		});
		scheduler.schedule(mkCanvas('only'));
		await scheduler.drain();
		expect(seenSavedBodies).toEqual(['s:only']);
	});
});
