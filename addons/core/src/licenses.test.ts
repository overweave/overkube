// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { LIBRARIES, OVERKUBE } from './licenses.generated.ts';

/* The libraries the About lists are those installed now: written again (npm run licenses -w addons/core) when they change. */

describe('the libraries overkube runs', () => {
  it('are listed as installed, each with its license', async () => {
    const { collect, own } = (await import(/* @vite-ignore */ new URL('../scripts/licenses.mjs', import.meta.url).href)) as { collect: () => unknown[]; own: () => unknown };
    expect([OVERKUBE, LIBRARIES]).toEqual([own(), collect()]);
    expect(LIBRARIES.every((l) => l.license && l.license !== 'UNKNOWN')).toBe(true);
  });
});
