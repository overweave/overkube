import core from '@overkube/addon-core';
import { createClient } from '@overkube/client';
import { FakeGateway } from '@overkube/client/testing';
import { kinds } from '@overkube/kube-types';
import { defineAddon, kubeKinds } from '@overkube/sdk';
import { createRegistry } from '@overweave/core';
import { afterEach, describe, expect, it } from 'vitest';
import { AddonHost } from '../host/addons.ts';
import { clusterAccess } from '../host/cluster.ts';
import { mount } from './mount.tsx';

/*
 * The page as it is mounted, over a client and a fake gateway, the core
 * addon run in it: the kind at the hash held while shown and let go of when
 * another is; addons' notifications shown; the core, not running, said so.
 */

const { Pod, Namespace } = kinds.core.v1;
const closing: (() => void)[] = [];
afterEach(() => {
  for (const close of closing.splice(0)) close();
  window.location.hash = '';
});

function page(addons = [core]) {
  const fake = new FakeGateway([Pod, Namespace]);
  const client = createClient({ api: { fetch: fake.fetch }, stream: { debounceMs: 5 }, store: { lingerMs: 0 } });
  const registry = createRegistry({ kinds: kubeKinds });
  const cluster = clusterAccess(client);
  const host = new AddonHost({ registry, cluster, log: () => {}, maxCrashes: 1 });
  for (const a of addons) host.register(a);
  const element = document.createElement('div');
  document.body.append(element);
  const unmount = mount(element, { registry, host, cluster });
  closing.push(() => {
    unmount();
    host.close();
    client.close();
    element.remove();
  });
  return { fake, client, element, host };
}

describe('mount', () => {
  it('holds the kind shown, and lets it go when another is shown', async () => {
    window.location.hash = '#/k/pods.v1';
    const { client } = page();
    await expect.poll(() => client.store.kinds).toContain(Pod.id);
    window.location.hash = '#/k/namespaces.v1';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await expect.poll(() => client.store.kinds).toContain(Namespace.id);
    await expect.poll(() => client.store.kinds.includes(Pod.id)).toBe(false);
  });

  it('starts at the first pinned kind', async () => {
    window.location.hash = '';
    page();
    await expect.poll(() => window.location.hash).toBe('#/k/pods.v1');
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
