import core from '@overkube/addon-core';
import { Discovery, Http } from '@overkube/connector';
import type { KubeObject } from '@overkube/kube-types';
import { defineAddon, kubeKinds } from '@overkube/sdk';
import { memorySource } from '@overkube/source';
import { createRegistry } from '@overweave/core';
import { signal } from '@preact/signals';
import { afterEach, describe, expect, it } from 'vitest';
import { AddonHost } from '../host/addons.ts';
import { clusterAccess } from '../host/cluster.ts';
import { mount } from './mount.tsx';

/*
 * The page as it is mounted, over discovery (a gateway's answers) and a
 * source of objects in memory, the core addon run in it: the kind at the
 * hash drawn, another when the hash changes; the core, not running, said so.
 */

const closing: (() => void)[] = [];
afterEach(() => {
  for (const close of closing.splice(0)) close();
  window.location.hash = '';
});

/** The aggregated discovery of the core group's pods and namespaces. */
const DISCOVERY = {
  kind: 'APIGroupDiscoveryList',
  items: [
    {
      metadata: {},
      versions: [
        {
          version: 'v1',
          resources: [
            { resource: 'pods', responseKind: { kind: 'Pod' }, scope: 'Namespaced', verbs: ['list', 'watch'] },
            { resource: 'namespaces', responseKind: { kind: 'Namespace' }, scope: 'Cluster', verbs: ['list', 'watch'] },
          ],
        },
      ],
    },
  ],
};

function page(addons = [core]) {
  const fetch = (async (url: string) =>
    Response.json(new URL(url, 'http://page').pathname.endsWith('/api') ? DISCOVERY : { kind: 'APIGroupDiscoveryList', items: [] })) as typeof globalThis.fetch;
  const http = new Http({ fetch });
  const discovery = new Discovery(http);
  void discovery.load();
  const objects = signal<Record<string, KubeObject[]>>({
    'pods.v1': [{ metadata: { name: 'web', namespace: 'shop', uid: 'p1' } }],
    'namespaces.v1': [{ metadata: { name: 'shop', uid: 'n1' } }],
  });
  const registry = createRegistry({ kinds: kubeKinds });
  const cluster = clusterAccess({ http, discovery }, memorySource(objects));
  const host = new AddonHost({ registry, cluster, log: () => {}, maxCrashes: 1 });
  for (const a of addons) host.register(a);
  const element = document.createElement('div');
  document.body.append(element);
  const unmount = mount(element, { registry, host, cluster });
  closing.push(() => {
    unmount();
    host.close();
    discovery.close();
    element.remove();
  });
  return { element, host };
}

describe('mount', () => {
  it('draws the kind at the hash, and another when it changes', async () => {
    window.location.hash = '#/k/pods.v1';
    const { element } = page();
    await expect.poll(() => element.querySelector('[role="table"] a')?.textContent).toBe('web');
    window.location.hash = '#/k/namespaces.v1';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await expect.poll(() => element.querySelector('[role="table"] a')?.getAttribute('href')).toContain('open=namespaces.v1/shop');
  });

  it('starts at the start: its page, staying there', async () => {
    window.location.hash = '';
    const { element } = page();
    await expect.poll(() => element.querySelector('main')?.textContent).toBe('Welcome to overkube.');
    expect(window.location.hash).toBe('');
  });

  it('says so when the core is not running: all the page shows is its', async () => {
    const broken = defineAddon({
      id: 'core',
      title: 'Core',
      layer: 'core',
      setup() {
        throw new Error('no luck');
      },
    });
    const { element } = page([broken]);
    await expect.poll(() => element.textContent).toContain('The core addon is not running');
    expect(element.textContent).toContain('no luck');
    expect(element.textContent).toContain('No addon draws a page');
  });
});
