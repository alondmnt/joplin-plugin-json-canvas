// Hello-world: weave.js. Smallest viable init: Weave + standalone store + konva-base renderer.
// Goal is a bundle-size measurement, not a feature-complete demo.

import { Weave, WeaveStageZoomPlugin, WeaveStagePanningPlugin, WeaveRectangleNode } from '@inditextech/weave-sdk';
import { WeaveStoreStandalone } from '@inditextech/weave-store-standalone/client';
import { WeaveKonvaBaseRenderer } from '@inditextech/weave-renderer-konva-base';

const root = document.getElementById('root')!;

const renderer = new WeaveKonvaBaseRenderer();
const store = new WeaveStoreStandalone(
  { roomData: undefined },
  { getUser: () => ({ id: 'local', name: 'local' }) } as never,
);

const weave = new Weave(
  { store, renderer },
  { container: root, width: window.innerWidth, height: window.innerHeight },
);

weave.registerPlugin(new WeaveStageZoomPlugin());
weave.registerPlugin(new WeaveStagePanningPlugin());
weave.registerNodeHandler(new WeaveRectangleNode());

void weave.start();
