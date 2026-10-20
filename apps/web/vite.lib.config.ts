import preact from '@preact/preset-vite';
import { defaultClientConditions, defineConfig } from 'vite';

/*
 * The page as a library (lib/: @overkube/web, for a host's bundle): its
 * own packages (the addons, the shell, the runtime, the source, the
 * connector) bundled in from their sources; those a host's addons are
 * written with — the SDK, the kit, the kinds' types, queries, the
 * gateway's protocol, overweave, Preact — left as imports, so the host has
 * one of each (two SDKs: two clusters' contexts, its addons seeing none).
 */
const SHARED = /^(preact|@preact\/signals|@overweave\/[^/]+|@overkube\/(sdk|uikit|kube-types|query|gateway))(\/.*)?$/;

export default defineConfig({
  plugins: [preact({ reactAliasesEnabled: false })],
  resolve: {
    conditions: ['overkube-source', ...defaultClientConditions],
    preserveSymlinks: true,
  },
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  build: {
    outDir: 'lib',
    emptyOutDir: true,
    copyPublicDir: false,
    sourcemap: true,
    lib: { entry: 'src/index.ts', formats: ['es'], fileName: 'index' },
    rolldownOptions: { external: (id) => SHARED.test(id) },
  },
});
