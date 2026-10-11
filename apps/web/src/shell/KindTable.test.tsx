import type { CollectionView } from '@overkube/client';
import { type KindInfo, type KubeObject, kinds } from '@overkube/kube-types';
import { type Cluster, column, defineAddon, type KubeContributor, kindMatcher, kubeKinds } from '@overkube/sdk';
import { KubeProvider } from '@overkube/sdk/preact';
import { createRegistry } from '@overweave/core';
import { OverweaveProvider } from '@overweave/ui/preact';
import { signal } from '@preact/signals';
import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { AddonHost } from '../host/addons.ts';
import { HostContext } from './context.ts';
import { KindTable } from './KindTable.tsx';

/*
 * A kind's table, all of it from the definitions: the columns that take the
 * kind, in its TableView's order, hidden ones left out; the collection's
 * state; a column's value that throws is its owner's failure.
 */

afterEach(cleanup);

const { Pod } = kinds.core.v1;
const pod = (name: string, namespace = 'web'): KubeObject => ({ apiVersion: 'v1', kind: 'Pod', metadata: { name, namespace, uid: name } });

function page(state: 'live' | 'loading' | 'error' | 'stale' = 'live', items: KubeObject[] = []) {
  const registry = createRegistry({ kinds: kubeKinds });
  const view = {
    kind: Pod,
    items: signal(new Map(items.map((o) => [`${o.metadata?.namespace}/${o.metadata?.name}`, o]))),
    state: signal(state),
    error: signal(state === 'error' ? { status: 403, code: 'Forbidden', message: 'no' } : null),
    retry() {},
  } as unknown as CollectionView;
  const cluster = { peek: () => view, hold: () => () => {} } as unknown as Cluster;
  const host = new AddonHost({ registry, cluster: { facts: { served: () => true, available: () => true }, open: () => cluster, components: () => cluster }, log: () => {} });
  const draw = (kind: KindInfo = Pod) =>
    render(
      <OverweaveProvider registry={registry} matcher={kindMatcher} onError={(f) => host.fail(f)}>
        <HostContext.Provider value={host}>
          <KubeProvider cluster={cluster}>
            <KindTable kind={kind} />
          </KubeProvider>
        </HostContext.Provider>
      </OverweaveProvider>,
    );
  const keyed = (list: KubeObject[]) => new Map(list.map((o) => [`${o.metadata?.namespace}/${o.metadata?.name}`, o]));
  /** The collection's objects now (a watch's events). */
  const set = (list: KubeObject[]) => {
    (view.items as unknown as { value: unknown }).value = keyed(list);
  };
  return { registry, host, draw, view, set };
}

/** The core's addon with these columns (and a TableView, if any). */
const columns = (add: (c: KubeContributor) => void, id = 'core') =>
  defineAddon({ id, title: id, layer: id === 'core' ? 'core' : 'addon', setup: ({ contributor }) => void add(contributor) });

const headers = (container: Element) => [...container.querySelectorAll('[role="columnheader"]')].map((h) => h.textContent?.trim()).filter(Boolean);

describe('KindTable', () => {
  it('draws the columns that take the kind, in order, its TableView’s order first, the hidden left out', () => {
    const { host, draw } = page('live', [pod('a'), pod('b')]);
    host.register(
      defineAddon({
        id: 'core',
        title: 'Core',
        layer: 'core',
        setup({ contributor }) {
          contributor.add('Column', 'core.name', column({ header: 'Name', order: 0, value: (o) => o.metadata?.name }));
          contributor.add('Column', 'core.ns', column({ header: 'Namespace', order: 10, value: (o) => o.metadata?.namespace }));
          contributor.add('Column', 'deploy.replicas', column({ kinds: [kinds.apps.v1.Deployment], header: 'Replicas', value: (d) => d.spec?.replicas }));
          contributor.add('Column', 'core.age', column({ header: 'Age', order: 900, value: () => 1 }));
          contributor.add('TableView', Pod.id, { columns: ['core.age'], hidden: { 'core.ns': true } });
        },
      }),
    );
    const { container } = draw();
    expect(headers(container)).toEqual(['Age', 'Name']);
    expect(container.textContent).toContain('a');
    expect(container.textContent).toContain('b');
  });

  it('says what the collection is: loading, failed (with a way to try again), no columns', () => {
    const loading = page('loading');
    loading.host.register(
      defineAddon({
        id: 'core',
        title: 'Core',
        layer: 'core',
        setup: ({ contributor }) => void contributor.add('Column', 'core.name', column({ header: 'Name', value: () => 1 })),
      }),
    );
    expect(loading.draw().container.textContent).toContain('Loading pods');
    cleanup();
    const failed = page('error');
    failed.host.register(
      defineAddon({
        id: 'core',
        title: 'Core',
        layer: 'core',
        setup: ({ contributor }) => void contributor.add('Column', 'core.name', column({ header: 'Name', value: () => 1 })),
      }),
    );
    const { container } = failed.draw();
    expect(container.textContent).toContain('pods cannot be had: Forbidden');
    expect(container.textContent).toContain('Try again');
    cleanup();
    expect(page('live').draw().container.textContent).toContain('No columns for v1/Pod');
  });

  it('tells a column’s value that throws as its owner’s failure, and draws the rest', async () => {
    const { host, draw } = page('live', [pod('a')]);
    host.register(
      defineAddon({
        id: 'core',
        title: 'Core',
        layer: 'core',
        setup: ({ contributor }) => void contributor.add('Column', 'core.name', column({ header: 'Name', value: (o) => o.metadata?.name })),
      }),
    );
    host.register(
      defineAddon({
        id: 'broken',
        title: 'Broken',
        setup: ({ contributor }) =>
          void contributor.add(
            'Column',
            'broken.c',
            column({
              header: 'Broken',
              value: () => {
                throw new Error('bad value');
              },
            }),
          ),
      }),
    );
    const { container } = draw();
    expect(container.textContent).toContain('a');
    // Told once the drawing is done.
    await expect.poll(() => host.status('broken')).toMatchObject({ state: 'degraded', error: 'bad value' });
    expect(host.status('core')?.state).toBe('running');
  });

  it('keeps stale objects shown, saying they are not current; a loading collection says what holds it up', () => {
    const stale = page('stale', [pod('a')]);
    stale.host.register(columns((c) => c.add('Column', 'core.name', column({ header: 'Name', value: (o) => o.metadata?.name }))));
    const { container } = stale.draw();
    expect(container.textContent).toContain('Not current');
    expect(container.textContent).toContain('a');
    cleanup();
    const waiting = page('loading');
    (waiting.view.error as unknown as { value: unknown }).value = { status: 0, code: 'network', message: 'waiting for room on a watch stream' };
    waiting.host.register(columns((c) => c.add('Column', 'core.name', column({ header: 'Name', value: () => 1 }))));
    expect(waiting.draw().container.textContent).toContain('waiting for room on a watch stream');
  });

  it('tells a value JSON cannot say as its column’s failure, once a drawing however many cells, and draws the rest', async () => {
    const { host, draw } = page('live', [pod('a'), pod('b'), pod('c')]);
    host.register(columns((c) => c.add('Column', 'core.name', column({ header: 'Name', value: (o) => o.metadata?.name }))));
    host.register(columns((c) => c.add('Column', 'big.n', column({ header: 'Big', value: () => ({ n: 1n }) })), 'big'));
    const { container } = draw();
    expect(container.textContent).toContain('c');
    await expect.poll(() => host.status('big')).toMatchObject({ state: 'degraded', errors: 1 });
    expect(host.status('core')?.state).toBe('running');
  });

  it('draws a render that failed again once its object changes', async () => {
    const { host, draw, set } = page('live', [pod('a')]);
    host.register(
      columns((c) =>
        c.add(
          'Column',
          'core.image',
          column({
            header: 'Image',
            value: (o) => (o as { spec?: { image?: string } }).spec?.image,
            render: ({ value }) => {
              if (!value) throw new Error('no image yet');
              return <b>{String(value)}</b>;
            },
          }),
        ),
      ),
    );
    const { container, findByText } = draw();
    await expect.poll(() => host.status('core')?.state).toBe('degraded');
    expect(container.querySelector('b')).toBeNull();
    set([{ ...pod('a'), metadata: { ...pod('a').metadata, resourceVersion: '2' }, spec: { image: 'nginx' } } as KubeObject]);
    expect(await findByText('nginx')).toBeTruthy();
  });

  it('places a column named twice in the TableView once', () => {
    const { host, draw } = page('live', [pod('a')]);
    host.register(
      columns((c) => {
        c.add('Column', 'core.name', column({ header: 'Name', value: (o) => o.metadata?.name }));
        c.add('TableView', Pod.id, { columns: ['core.name', 'core.name'] });
      }),
    );
    expect(headers(draw().container)).toEqual(['Name']);
  });
});
