import { defineConfig } from 'vite';

// Bundles the standalone self-hosted Node server + all /functions/api/* handlers
// into a single zero-dependency ESM bundle (dist-server/index.mjs) for Docker & Raspberry Pi.
export default defineConfig({
  ssr: {
    noExternal: true,
    target: 'node',
  },
  build: {
    ssr: 'server/index.ts',
    outDir: 'dist-server',
    emptyOutDir: true,
    target: 'node20',
    minify: false,
    rolldownOptions: {
      output: {
        entryFileNames: 'index.mjs',
        format: 'esm',
      },
    },
  },
});
