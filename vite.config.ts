import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        hesprs: resolve(__dirname, 'src/hesprs/index.html'),
        weave: resolve(__dirname, 'src/weave/index.html'),
        scratch: resolve(__dirname, 'src/scratch/index.html'),
      },
    },
  },
});
