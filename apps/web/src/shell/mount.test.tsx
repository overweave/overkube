import { createClient } from '@overkube/client';
import { FakeGateway } from '@overkube/client/testing';
import { kinds } from '@overkube/kube-types';
import { column, defineAddon, kubeKinds } from '@overkube/sdk';
import { createRegistry } from '@overweave/core';
import { afterEach, describe, expect, it } from 'vitest';
import { AddonHost } from '../host/addons.ts';
import { clusterAccess } from '../host/cluster.ts';
import { mount } from './mount.tsx';
import { FIRST, hashOf, parsePlace } from './place.ts';

/*
 * The page as it is mounted: where it is (the hash, read whatever it says),
 * the kind it shows held while shown and let go of when another is, what
 * the cluster serves asked first — and said when it cannot be had.
 */

const { Pod, Namespace } = kinds.core.v1;
const closing: (() => void)[] = [];
afterEach(() => {
  for (const close of closing.splice(0)) close();
  window.location.hash = '';
});

describe('place', () => {
  it('reads a hash: a kind’s id, escaped or not; one it cannot read, or none, is the first place', () => {
    expect(parsePlace('#/kind/apps/v1/Deployment')).toEqual({ kind: 'apps/v1/Deployment' });
    expect(parsePlace('#/kind/example.com/v1/My%20Thing')).toEqual({ kind: 'example.com/v1/My Thing' });
    expect(parsePlace('#/kind/%E0%A4')).toEqual(FIRST);
    expect(parsePlace('#/kind/%')).toEqual(FIRST);
    expect(parsePlace('')).toEqual(FIRST);
  });

  it('writes a place as a hash it reads back', () => {
    for (const kind of ['apps/v1/Deployment', 'example.com/v1/My Thing', 'x/v1/100%']) expect(parsePlace(hashOf({ kind }))).toEqual({ kind });
    expect(hashOf({ kind: 'apps/v1/Deployment' })).toBe('#/kind/apps/v1/Deployment');
  });
});

function page(fake = new FakeGateway([Pod, Namespace])) {
  const client = createClient({ api: { fetch: fake.fetch }, stream: { debounceMs: 5 }, store: { lingerMs: 0 } });
  const registry = createRegistry({ kinds: kubeKinds });
  const cluster = clusterAccess(client);
  const host = new AddonHost({ registry, cluster, log: () => {} });
  host.register(
    defineAddon({
      id: 'core',
      title: 'Core',
      layer: 'core',
      setup: ({ contributor }) => void contributor.add('Column', 'core.name', column({ header: 'Name', value: (o) => o.metadata?.name })),
    }),
  );
  const element = document.createElement('div');
  document.body.append(element);
  const unmount = mount(element, { client, registry, host, cluster });
  closing.push(() => {
    unmount();
    host.close();
    client.close();
    element.remove();
  });
  return { fake, client, element };
}

describe('mount', () => {
  it('holds the kind shown, and lets it go when another is shown', async () => {
    window.location.hash = '#/kind/v1/Pod';
    const { client } = page();
    await expect.poll(() => client.store.kinds).toContain(Pod.id);
    window.location.hash = '#/kind/v1/Namespace';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await expect.poll(() => client.store.kinds).toContain(Namespace.id);
    await expect.poll(() => client.store.kinds.includes(Pod.id)).toBe(false);
  });

  it('draws a page whose hash cannot be read: the first place', async () => {
    window.location.hash = '#/kind/%E0%A4';
    const { client } = page();
    await expect.poll(() => client.store.kinds).toContain(FIRST.kind);
  });

  it('says when what the cluster serves cannot be had, rather than asking for ever', async () => {
    const fake = new FakeGateway([Pod]);
    for (const path of ['/api', '/apis']) fake.answer(`GET ${path}`, { status: 403, body: { kind: 'Status', code: 403, reason: 'Forbidden', message: 'no' } });
    window.location.hash = '#/kind/example.com/v1/Thing';
    const { element } = page(fake);
    await expect.poll(() => element.textContent).toContain('What the cluster serves cannot be had: Forbidden');
    expect(element.textContent).toContain('Try again');
  });
});
