import { defineConfig } from 'vite';

// Builds server/index.ts, Ambiently's own web server for self-hosting, into one file in dist-server/
// with every dependency included, so it runs with plain `node` and no node_modules.
export default defineConfig({
  publicDir: false,
  build: {
    ssr: 'server/index.ts',
    outDir: 'dist-server',
    emptyOutDir: true,
    target: 'node20',
    rolldownOptions: {
      output: { entryFileNames: 'index.mjs' },
    },
  },
  ssr: {
    noExternal: true,
  },
});
