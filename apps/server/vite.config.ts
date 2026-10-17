import { defineConfig } from 'vite';

/*
 * The server, built for its image (npm run build: dist/overkube.mjs): one
 * file run by Node — the workspace's packages from their sources, and
 * every dependency, in it.
 */
export default defineConfig({
  resolve: { conditions: ['overkube-source'] },
  ssr: { noExternal: true, resolve: { conditions: ['overkube-source'], externalConditions: ['overkube-source'] } },
  build: {
    ssr: 'src/cli.ts',
    outDir: 'dist',
    emptyOutDir: true,
    minify: true,
    sourcemap: true,
    rollupOptions: { output: { entryFileNames: 'overkube.mjs' } },
  },
});
