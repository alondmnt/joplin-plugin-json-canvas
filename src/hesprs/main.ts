// Drag-to-move spike for hesprs/json-canvas-viewer.
//
// Goal: validate that wrap-and-extend supports editing.
// Approach:
//   1. Render multiple text nodes connected by an edge.
//   2. On pointerdown on a node overlay, start tracking.
//   3. On pointermove, mutate overlay style.left/top directly (canvas-space coords).
//   4. On pointerup, write back to canonical data and call viewer.refresh() to redraw the
//      canvas-side edges.
// Open question: do edges follow when we mutate overlay style + refresh, or do they snap
// back to the loaded snapshot?

import { JSONCanvasViewer } from 'json-canvas-viewer';
import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({ html: false, breaks: true, linkify: true });

const root = document.getElementById('root')!;

// Canonical data — we own this, the viewer renders snapshots of it.
const doc = {
  nodes: [
    {
      id: 'a',
      type: 'text' as const,
      x: -300,
      y: -100,
      width: 240,
      height: 120,
      text: '## node A\n\ndrag me',
    },
    {
      id: 'b',
      type: 'text' as const,
      x: 100,
      y: -100,
      width: 240,
      height: 120,
      text: '## node B\n\nedge to A',
    },
    {
      id: 'c',
      type: 'text' as const,
      x: -100,
      y: 100,
      width: 240,
      height: 120,
      text: '## node C\n\n- markdown\n- works\n- here',
    },
  ],
  edges: [
    { id: 'e1', fromNode: 'a', toNode: 'b' },
    { id: 'e2', fromNode: 'b', toNode: 'c' },
  ],
};

const viewer = new JSONCanvasViewer({
  container: root,
  parser: (text: string) => md.render(text),
});
viewer.load({ canvas: doc });

// Reach into the viewer to find overlay elements after load. They're appended to
// data.container with class JCV-overlay-container and id = node id.
// We bind one pointer listener at the overlays-layer level (event delegation) so
// late-arriving overlays still work.

interface DragState {
  nodeId: string;
  overlay: HTMLElement;
  startClientX: number;
  startClientY: number;
  startNodeX: number;
  startNodeY: number;
  moved: boolean;
}

let drag: DragState | null = null;

const findOverlay = (target: EventTarget | null): HTMLElement | null => {
  let el = target as HTMLElement | null;
  while (el && el !== document.body) {
    if (el.classList?.contains('JCV-overlay-container')) return el;
    el = el.parentElement;
  }
  return null;
};

// Bind on the document so we catch overlays even after viewer.load() rebuilds them.
// In a real implementation we'd register a BaseModule and bind on the overlays layer.
document.addEventListener('pointerdown', (e) => {
  const overlay = findOverlay(e.target);
  if (!overlay) return;
  const id = overlay.id;
  const node = doc.nodes.find((n) => n.id === id);
  if (!node) return;

  drag = {
    nodeId: id,
    overlay,
    startClientX: e.clientX,
    startClientY: e.clientY,
    startNodeX: node.x,
    startNodeY: node.y,
    moved: false,
  };
  // We don't preventDefault — let hesprs's selection still fire on click.
});

document.addEventListener('pointermove', (e) => {
  if (!drag) return;
  // Reach into viewer for current scale (private API, fine for spike).
  const scale = readScale(viewer);
  const dx = (e.clientX - drag.startClientX) / scale;
  const dy = (e.clientY - drag.startClientY) / scale;
  if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
  const newX = drag.startNodeX + dx;
  const newY = drag.startNodeY + dy;
  drag.overlay.style.left = `${newX}px`;
  drag.overlay.style.top = `${newY}px`;
});

document.addEventListener('pointerup', () => {
  if (!drag) return;
  if (drag.moved) {
    const node = doc.nodes.find((n) => n.id === drag!.nodeId);
    if (node) {
      node.x = parseFloat(drag.overlay.style.left);
      node.y = parseFloat(drag.overlay.style.top);
    }
    // Full reload so canvas-side edges follow. refresh() alone would redraw
    // edges from the loaded snapshot's box positions — wrong. load() rebuilds
    // overlays + recomputes node bounds, so edges connect correctly to the
    // post-drag positions.
    const t0 = performance.now();
    viewer.load({ canvas: doc });
    const dt = performance.now() - t0;
    lastLoadMs = dt;
    console.log(`[spike] viewer.load() at ${doc.nodes.length} nodes: ${dt.toFixed(1)} ms`);
  }
  drag = null;
});

let lastLoadMs = 0;

function readScale(v: unknown): number {
  // The DataManager is registered in the DI container; data.scale lives there.
  // We poke at known internal shape — fragile, but acceptable for a spike.
  type DM = { data?: { scale?: number } };
  const candidate = (v as { container?: { get?: (...a: unknown[]) => DM } }).container?.get?.(
    // We don't have a handle to the DataManager class here, so try a pragmatic fallback:
    // read the transform from the overlays-layer DOM and derive the scale.
  );
  const dmScale = candidate?.data?.scale;
  if (typeof dmScale === 'number') return dmScale;
  const layer = document.querySelector('.JCV-overlays') as HTMLElement | null;
  if (!layer) return 1;
  const m = /scale\(([0-9.]+)\)/.exec(layer.style.transform);
  return m ? parseFloat(m[1]) : 1;
}

// Add a button to test viewer.load() with the mutated canonical data —
// does the viewer honour our drag positions, or snap back to original?
const btn = document.createElement('button');
btn.textContent = 'reload from canonical data';
btn.style.cssText = 'position:fixed;top:8px;left:8px;z-index:10;padding:6px 10px;font:13px system-ui;';
btn.onclick = () => viewer.load({ canvas: doc });
document.body.appendChild(btn);

// Indicator of state, useful when manually testing.
const status = document.createElement('div');
status.style.cssText = 'position:fixed;top:8px;right:8px;z-index:10;padding:6px 10px;background:#fff;border:1px solid #ccc;font:12px ui-monospace,monospace;max-width:340px;white-space:pre;';
const updateStatus = () => {
  const positions = doc.nodes
    .map((n) => `${n.id}: x=${Math.round(n.x)} y=${Math.round(n.y)}`)
    .join('\n');
  status.textContent = `${positions}\n\nlast load(): ${lastLoadMs.toFixed(1)} ms`;
};
updateStatus();
document.body.appendChild(status);
document.addEventListener('pointerup', updateStatus);
