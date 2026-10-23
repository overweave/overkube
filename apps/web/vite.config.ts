import preact from '@preact/preset-vite';
import { defaultClientConditions, defineConfig } from 'vite';
import { chunkName } from './chunks.ts';

/*
 * The page, built (dist/: what overkube's server serves, OVERKUBE_UI) or
 * served while it is worked on: the gateway at /kube and signing in at
 * /auth passed to overkube's server (OVERKUBE_SERVER, else
 * http://127.0.0.1:8080). The workspace's packages and overweave from
 * their sources, one Preact.
 */
export default defineConfig({
  plugins: [preact({ reactAliasesEnabled: false })],
  resolve: {
    conditions: ['overkube-source', 'overweave-source', ...defaultClientConditions],
    preserveSymlinks: true,
    dedupe: ['preact', '@preact/signals'],
  },
  // Ours are sources, not dependencies to pre-bundle: seen through node_modules (symlinks preserved), they would be — with React's JSX.
  optimizeDeps: {
    exclude: [
      '@overkube/addon-cert-manager',
      '@overkube/addon-core',
      '@overkube/addon-edit',
      '@overkube/addon-flux',
      '@overkube/addon-helm',
      '@overkube/addon-metrics',
      '@overkube/addon-trivy',
      '@overkube/cel',
      '@overkube/connector',
      '@overkube/gateway',
      '@overkube/kube-fields',
      '@overkube/kube-types',
      '@overkube/query',
      '@overkube/sdk',
      '@overkube/shell',
      '@overkube/source',
      '@overkube/uikit',
      '@overweave/core',
      '@overweave/ui',
    ],
    // Theirs a source of ours imports only when it is needed (the kit's map: ELK, a CommonJS module): pre-bundled all the same.
    include: ['elkjs/lib/elk.bundled.js'],
  },
  // JSX as Preact's everywhere: a workspace package seen through node_modules has no tsconfig read for it.
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  server: {
    // The page's own Host kept: the server checks it (OVERKUBE_HOSTS), and an Origin against it.
    proxy: Object.fromEntries(['/kube', '/auth'].map((path) => [path, { target: process.env.OVERKUBE_SERVER ?? 'http://127.0.0.1:8080', changeOrigin: false }])),
    // Polled (no file events cross a container's mount); ours watched too, though seen through node_modules.
    watch: { usePolling: true, interval: 300, ignored: ['**/node_modules/**', '!**/node_modules/@overkube/**', '!**/node_modules/@overweave/**', '**/dist/**'] },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Fonts as files of their own, however small: the page's CSP takes no data: font.
    assetsInlineLimit: (file) => (file.endsWith('.woff2') ? false : undefined),
    rolldownOptions: { output: { chunkFileNames: chunkName('assets/') } },
  },
});
