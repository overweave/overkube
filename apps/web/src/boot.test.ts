import { defineAddon } from '@overkube/sdk';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { boot } from './boot.ts';

/*
 * The page booted as a host boots it (a platform's plugin: its gateway, no
 * /auth), with addons of its own: a built-in one runs, never turned on by
 * the user; one whose id is the page's own is refused, said so, and the
 * page drawn all the same. Its gateway's answers: discovery, empty.
 */

// The gateway's answers for the whole file: what the page asks after a test (its discovery again) answered too, never the network.
beforeAll(() => {
  vi.stubGlobal('fetch', (async () => Response.json({ kind: 'APIGroupDiscoveryList', items: [] })) as typeof globalThis.fetch);
});

const closing: (() => void)[] = [];
afterEach(() => {
  for (const close of closing.splice(0)) close();
  vi.restoreAllMocks();
});

async function booted(addons: Parameters<typeof boot>[0]['addons']) {
  const element = document.createElement('div');
  document.body.append(element);
  const page = await boot({ element, asked: new URLSearchParams(), gateway: '/host/kube', signIn: false, addons });
  if (!page) throw new Error('not booted');
  closing.push(() => {
    page.host.close();
    page.cluster.close();
    element.remove();
  });
  return { element, ...page };
}

describe('boot', () => {
  it('runs a host’s built-in addon, always on', async () => {
    const seen: string[] = [];
    const host = defineAddon({
      id: 'host-own',
      title: 'The host’s',
      layer: 'builtin',
      setup() {
        seen.push('setup');
      },
    });
    const page = await booted([host]);
    await expect.poll(() => page.host.status('host-own')?.state).toBe('running');
    expect(page.host.status('host-own')?.enabled).toBe(true);
    expect(seen).toEqual(['setup']);
  });

  it('refuses a host’s addon whose id is taken, and draws the page all the same', async () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const taken = defineAddon({ id: 'core', title: 'Not the core', layer: 'builtin', setup() {} });
    const page = await booted([taken]);
    expect(warned.mock.calls.some(([m]) => String(m).includes("the host's addon core refused"))).toBe(true);
    expect(page.host.status('core')?.title).not.toBe('Not the core');
    await expect.poll(() => page.element.childElementCount).toBeGreaterThan(0);
  });
});
