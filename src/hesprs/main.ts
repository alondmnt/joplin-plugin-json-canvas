// Hello-world: load a 1-node JSON Canvas into json-canvas-viewer and confirm pan/zoom works.

import { JSONCanvasViewer } from 'json-canvas-viewer';

const root = document.getElementById('root')!;

const doc = {
  nodes: [
    {
      id: 'a',
      type: 'text' as const,
      x: 0,
      y: 0,
      width: 240,
      height: 120,
      text: '# hesprs\n\nhello-world',
    },
  ],
  edges: [],
};

const viewer = new JSONCanvasViewer({ container: root });
viewer.load({ canvas: doc });
