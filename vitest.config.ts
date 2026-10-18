import { readdirSync } from 'node:fs';
import { defaultClientConditions, defaultServerConditions } from 'vite';
import { defineConfig } from 'vitest/config';

// One run for every workspace (packages/*, apps/*, addons/*): each a project of its own, read from its
// sources (the overkube-source condition), every cache in the root's node_modules/.vite.
const workspaces = ['packages', 'apps', 'addons'].flatMap((dir) => {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => `${dir}/${d.name}`);
  } catch {
    return [];
  }
});

/** What a workspace needs of its own: those drawn with Preact, a DOM. */
const own: Record<string, { environment?: string }> = {
  'packages/uikit': { environment: 'happy-dom' },
  'packages/sdk': { environment: 'happy-dom' },
  'packages/shell': { environment: 'happy-dom' },
  'packages/storybook': { environment: 'happy-dom' },
  'apps/web': { environment: 'happy-dom' },
  'packages/testkit': { environment: 'happy-dom' },
  'addons/core': { environment: 'happy-dom' },
  'addons/metrics': { environment: 'happy-dom' },
  'addons/cert-manager': { environment: 'happy-dom' },
};

// overweave from its sources (../overweave, linked): its imports resolved where it is linked, here — one Preact, one of each.
const conditions = ['overkube-source', 'overweave-source'];
const project = (root: string) => ({
  cacheDir: `node_modules/.vite/${root}`,
  // JSX as Preact's everywhere: a workspace package seen through node_modules (symlinks preserved) has no tsconfig read for it.
  oxc: { jsx: { runtime: 'automatic' as const, importSource: 'preact' } },
  resolve: { conditions: [...conditions, ...defaultClientConditions], preserveSymlinks: true, dedupe: ['preact', '@preact/signals'] },
  ssr: { resolve: { conditions: [...conditions, ...defaultServerConditions] } },
  // One Preact (and one signals): the testing library through Vite too, not loaded beside it by Node.
  test: { name: root, root, ...own[root], server: { deps: { inline: ['@testing-library/preact', '@preact/signals'] } } },
});

export default defineConfig({
  test: {
    // No workspace yet: nothing to run (vitest takes no empty list of projects).
    ...(workspaces.length ? { projects: workspaces.map(project) } : {}),
    coverage: {
      provider: 'v8',
      include: ['{packages,apps,addons}/*/src/**/*.{ts,tsx}'],
      exclude: ['**/*.test.{ts,tsx}', '**/*.stories.tsx', '**/*.d.ts'],
      // json-summary: what CI shows of it (scripts/coverage-summary.mjs).
      reporter: ['text-summary', 'text', 'json-summary'],
    },
  },
});
