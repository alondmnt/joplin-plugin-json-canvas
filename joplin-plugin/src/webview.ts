// Webview-side spike. Adapted from the vite drag prototype.
// Loads the current note's JSON Canvas content (provided via webviewApi.postMessage),
// renders via hesprs/json-canvas-viewer, supports drag-to-move with capture-phase
// pointer listeners.

import { JSONCanvasViewer } from 'json-canvas-viewer';
import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({ html: false, breaks: true, linkify: true });

const root = document.getElementById('root')!;

// Spike fixture — three nodes + two edges. In the real plugin we'd load this
// from the note body (postMessage / onUpdate), but for phase 0c we just want
// to confirm the canvas renders inside the Joplin webview.
const doc = {
  nodes: [
    { id: 'a', type: 'text' as const, x: -300, y: -100, width: 240, height: 120, text: '## node A\n\ndrag me' },
    { id: 'b', type: 'text' as const, x: 100, y: -100, width: 240, height: 120, text: '## node B\n\nedge to A' },
    { id: 'c', type: 'text' as const, x: -100, y: 100, width: 240, height: 120, text: '## node C\n\n- markdown\n- works\n- here' },
  ],
  edges: [
    { id: 'e1', fromNode: 'a', toNode: 'b', fromSide: 'right' as const, toSide: 'left' as const },
    { id: 'e2', fromNode: 'b', toNode: 'c', fromSide: 'bottom' as const, toSide: 'right' as const },
  ],
};

const viewer = new JSONCanvasViewer({
  container: root,
  parser: (text: string) => md.render(text),
});
viewer.load({ canvas: doc });

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

document.addEventListener(
  'pointerdown',
  (e) => {
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
    e.stopPropagation();
  },
  { capture: true },
);

document.addEventListener(
  'pointermove',
  (e) => {
    if (!drag) return;
    const scale = readScale();
    const dx = (e.clientX - drag.startClientX) / scale;
    const dy = (e.clientY - drag.startClientY) / scale;
    if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
    drag.overlay.style.left = `${drag.startNodeX + dx}px`;
    drag.overlay.style.top = `${drag.startNodeY + dy}px`;
    e.stopPropagation();
  },
  { capture: true },
);

document.addEventListener(
  'pointerup',
  () => {
    if (!drag) return;
    if (drag.moved) {
      const node = doc.nodes.find((n) => n.id === drag!.nodeId);
      if (node) {
        node.x = parseFloat(drag.overlay.style.left);
        node.y = parseFloat(drag.overlay.style.top);
      }
      viewer.load({ canvas: doc });
    }
    drag = null;
  },
  { capture: true },
);

function readScale(): number {
  const layer = document.querySelector('.JCV-overlays') as HTMLElement | null;
  if (!layer) return 1;
  const m = /scale\(([0-9.]+)\)/.exec(layer.style.transform);
  return m ? parseFloat(m[1]) : 1;
}

// Marker so we can verify in DevTools that the webview actually ran.
console.log('[js-canvas spike] webview booted at', new Date().toISOString());
