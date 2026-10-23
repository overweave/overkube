import core from '@overkube/addon-core';
import helm from '@overkube/addon-helm';
import { kinds } from '@overkube/kube-types';
import { loadOf } from '@overkube/sdk';
import { assertNothingRefused, cleanup, fakeCluster, kubeWorld } from '@overkube/testkit';
import { renderPage } from '@overkube/testkit/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fluxCluster } from './cluster.fixture.ts';
import flux from './index.tsx';
import { FLUX } from './kinds.ts';

/*
 * The Flux addon, as its user sees it over a cluster: its kinds' tables
 * (a source's URL and ref, its artifact — stale while its fetch fails —
 * what uses it; a Kustomization's source, the revision applied → attempted,
 * its state in Flux's words); one opened (its source as it is, what uses a
 * source, a Kustomization's inventory); Reconcile, Suspend, Resume as the
 * flux CLI does them; the start's panel; what Flux applied marked — its
 * pods and replica sets too — and Managed By in its view.
 */

// Its setup's module loaded first (its own chunk, as the page loads it before it starts it): set up at once, as it is drawn.
await loadOf(flux)?.();

afterEach(cleanup);

function world() {
  const w = kubeWorld({ cluster: fakeCluster({ kinds: FLUX }) });
  fluxCluster(w.cluster);
  w.addon(core);
  w.addon(flux);
  return w;
}

const table = (root: ParentNode = document) => ({
  header: [...root.querySelectorAll('[role="columnheader"]')].map((c) => c.textContent),
  rows: [...root.querySelectorAll('[role="rowgroup"] [role="row"]')].map((r) => [...r.querySelectorAll('[role="cell"]')].map((c) => c.textContent)),
});
const column = (name: string, root: ParentNode = document) => {
  const { header, rows } = table(root);
  return rows.map((r) => r[header.indexOf(name)]);
};
const part = (name: string) => document.querySelector(`[data-part="${name}"]`) as HTMLElement | null;
const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('.uk-modal button')].find((b) => b.textContent === text);
const KUSTOMIZATIONS = '/k/kustomizations.v1.kustomize.toolkit.fluxcd.io';
const GIT = '/k/gitrepositories.v1.source.toolkit.fluxcd.io';
const open = (path: string, ref: string, namespace: string, name: string, tab?: string) => `${path}?open=${ref}/${namespace}/${name}${tab ? `&open-tab=${tab}` : ''}`;
const marks = () => [...document.querySelectorAll('.uk-mark-link')].map((m) => m.getAttribute('aria-label'));

describe('beside the others', () => {
  it('runs with Helm, nothing it adds refused (Delivery: the core’s, not one of theirs twice)', () => {
    const w = world();
    w.addon(helm);
    assertNothingRefused(w);
    expect(w.registry.get('Category', 'delivery')?.definedBy).toBe('core');
  });
});

describe('the tables', () => {
  it('a source’s: its state, its URL and ref, its artifact (stale while its fetch fails), what uses it (another namespace’s too)', async () => {
    renderPage(world(), GIT);
    // seed: hello, broken, its HelmChart — and net, of seed-net.
    await vi.waitFor(() => expect(column('Used By')).toEqual(['1', '4']));
    expect(column('Name')).toEqual(['infra', 'seed']);
    expect(column('Status')).toEqual(['GitOperationFailed', 'Ready']);
    expect(column('URL')).toEqual(['ssh://git@github.com/acme/infrabranch main', 'ssh://git@git.seed-flux.svc.cluster.local/srv/git/seed.gitbranch main']);
    expect(column('Artifact')).toEqual(['main@sha1:1a2b3c4d5e', 'main@sha1:5bec00da24']);
    expect(document.querySelector('[role="rowgroup"] .uk-status[data-tone="warn"]')?.textContent).toBe('main@sha1:1a2b3c4d5e');
    // Its CRD's columns: URL in its place, its Ready and Status said by the state alone.
    expect(table().header).toEqual(['Name', 'Namespace', 'Status', 'URL', 'Artifact', 'Used By', 'Age']);
  });

  it('a Kustomization’s: its source and path, the revision applied → attempted, Reconciling, failed, Suspended', async () => {
    renderPage(world(), KUSTOMIZATIONS);
    await vi.waitFor(() => expect(column('Revision')).toHaveLength(5));
    expect(column('Name')).toEqual(['apps', 'broken', 'hello', 'legacy', 'net']);
    expect(column('Source')).toEqual([
      'OCIRepository/apps./',
      'GitRepository/seed./not-there',
      'GitRepository/seed./hello',
      'GitRepository/infra./legacy',
      'GitRepository/seed./net',
    ]);
    expect(column('Revision').slice(0, 4)).toEqual(['1.4.1@sha256:0c8e1aa→1.4.2@sha256:9f1c2e7', '—→main@sha1:5bec00da24', 'main@sha1:5bec00da24', 'main@sha1:1a2b3c4d5e']);
    expect(column('Status')[0]).toMatch(/^Reconciling · \d+s$/);
    expect(column('Status').slice(1)).toEqual(['ArtifactFailed', 'Ready', 'Suspended', 'Ready']);
  });

  it('a HelmRelease’s: the revision deployed → the one attempted (its history’s latest a failed upgrade)', async () => {
    renderPage(world(), '/k/helmreleases.v2.helm.toolkit.fluxcd.io');
    await vi.waitFor(() => expect(column('Revision')).toHaveLength(3));
    expect(column('Name')).toEqual(['hello-chart', 'ingress', 'podinfo']);
    expect(column('Revision')).toEqual(['0.1.0', '11.6.3', '6.9.1→6.9.2']);
    expect(column('Source')).toEqual(['HelmChart/seed-flux-hello-chart./charts/hello', 'HelmChart/seed-net-ingressnginx-ingress-controller', 'HelmChart/flux-system-podinfo']);
  });

  it('a HelmChart used by a HelmRelease (its chart template’s, or its chartRef)', async () => {
    renderPage(world(), '/k/helmcharts.v1.source.toolkit.fluxcd.io');
    // seed-net-ingress: of seed-net's HelmRelease, made in its HelmRepository's namespace.
    await vi.waitFor(() => expect(column('Used By')).toEqual(['1', '1', '1']));
    expect(column('Name')).toEqual(['flux-system-podinfo', 'seed-flux-hello-chart', 'seed-net-ingress']);
  });

  it('a Bucket’s, an ExternalArtifact’s: in the places of their CRDs’ Endpoint, Source', async () => {
    renderPage(world(), '/k/buckets.v1.source.toolkit.fluxcd.io');
    await vi.waitFor(() => expect(column('Endpoint')).toEqual(['generic minio.storage:9000bucket manifests']));
    expect(column('Status')).toEqual(['BucketOperationFailed']);
    cleanup();
    renderPage(world(), '/k/externalartifacts.v1.source.toolkit.fluxcd.io');
    await vi.waitFor(() => expect(column('Source')).toEqual(['ArtifactGenerator/bundle']));
    expect(column('Artifact')).toEqual(['sha256:77ad410']);
  });
});

describe('one opened', () => {
  it('a Kustomization: its source as it is — failing, its last artifact still served', async () => {
    renderPage(world(), open(KUSTOMIZATIONS, 'kustomizations.v1.kustomize.toolkit.fluxcd.io', 'flux-system', 'legacy'));
    await vi.waitFor(() => expect(part('source')?.textContent).toContain('GitOperationFailed'));
    expect(part('source')?.textContent).toContain('still served');
  });

  it('its source’s own actions in its Source: Reconcile it — fetched now, what uses it applied anew', async () => {
    const w = world();
    const page = renderPage(w, open(KUSTOMIZATIONS, 'kustomizations.v1.kustomize.toolkit.fluxcd.io', 'seed-flux', 'hello'));
    const reconcile = () => [...(part('source')?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find((b) => b.textContent === 'Reconcile');
    await vi.waitFor(() => expect(reconcile()).toBeDefined());
    page.act(() => reconcile()?.click());
    await vi.waitFor(() => expect(w.cluster.writes).toHaveLength(1));
    expect([w.cluster.writes[0]?.kind, w.cluster.writes[0]?.name]).toEqual(['source.toolkit.fluxcd.io/v1/GitRepository', 'seed']);
  });

  it('its inventory: each object it applied as it is now (one gone, NotFound)', async () => {
    renderPage(world(), open(KUSTOMIZATIONS, 'kustomizations.v1.kustomize.toolkit.fluxcd.io', 'seed-flux', 'apps', 'flux.inventory'));
    await vi.waitFor(() => expect(column('Status', part('inventory') as HTMLElement)).toEqual(['Current', '—', 'NotFound']));
    expect(column('Name', part('inventory') as HTMLElement)).toEqual(['web', 'web', 'gone']);
  });

  it('its inventory: a kind of the whole cluster’s entry, a core one’s', async () => {
    renderPage(world(), open(KUSTOMIZATIONS, 'kustomizations.v1.kustomize.toolkit.fluxcd.io', 'seed-flux', 'hello', 'flux.inventory'));
    await vi.waitFor(() => expect(column('Name', part('inventory') as HTMLElement)).toEqual(['hello-git', 'hello-git', 'db', 'seed-flux']));
    expect(column('Namespace', part('inventory') as HTMLElement)).toEqual(['seed-flux', 'seed-flux', 'seed-flux', '—']);
    await vi.waitFor(() => expect(column('Status', part('inventory') as HTMLElement).filter((s) => s === 'NotFound')).toEqual([]));
  });

  it('a source: what uses it, their own tables', async () => {
    renderPage(world(), open(GIT, 'gitrepositories.v1.source.toolkit.fluxcd.io', 'seed-flux', 'seed'));
    await vi.waitFor(() => expect(part('used-by')?.querySelectorAll('[role="grid"], .uk-table')).toHaveLength(2));
    expect(part('used-by')?.textContent).toContain('broken');
    expect(part('used-by')?.textContent).toContain('seed-flux-hello-chart');
  });
});

describe('its actions, as the flux CLI does them', () => {
  it('Reconcile: requestedAt; with source, its source’s first; Suspend: spec.suspend', async () => {
    const w = world();
    const page = renderPage(w, open(KUSTOMIZATIONS, 'kustomizations.v1.kustomize.toolkit.fluxcd.io', 'seed-flux', 'hello'));
    await vi.waitFor(() => expect(button('Reconcile with source')).toBeDefined());
    page.act(() => button('Reconcile with source')?.click());
    await vi.waitFor(() => expect(w.cluster.writes).toHaveLength(2));
    expect(w.cluster.writes.map((x) => [x.kind, x.name, Object.keys((x.change as { patch: { metadata: { annotations: object } } }).patch.metadata.annotations)])).toEqual([
      ['source.toolkit.fluxcd.io/v1/GitRepository', 'seed', ['reconcile.fluxcd.io/requestedAt']],
      ['kustomize.toolkit.fluxcd.io/v1/Kustomization', 'hello', ['reconcile.fluxcd.io/requestedAt']],
    ]);
    page.act(() => button('Suspend')?.click());
    await vi.waitFor(() => expect(w.cluster.writes).toHaveLength(3));
    expect(w.cluster.writes[2]?.change).toMatchObject({ type: 'merge', patch: { spec: { suspend: true } } });
    await vi.waitFor(() => expect(button('Resume')).toBeDefined());
  });

  it('a HelmRelease of a chart template, with source: the HelmChart Flux makes of it (<namespace>-<name>) first', async () => {
    const w = world();
    const page = renderPage(w, open('/k/helmreleases.v2.helm.toolkit.fluxcd.io', 'helmreleases.v2.helm.toolkit.fluxcd.io', 'seed-net', 'ingress'));
    await vi.waitFor(() => expect(button('Reconcile with source')).toBeDefined());
    page.act(() => button('Reconcile with source')?.click());
    await vi.waitFor(() => expect(w.cluster.writes).toHaveLength(2));
    expect(w.cluster.writes.map((x) => [x.kind, x.namespace, x.name])).toEqual([
      ['source.toolkit.fluxcd.io/v1/HelmChart', 'flux-system', 'seed-net-ingress'],
      ['helm.toolkit.fluxcd.io/v2/HelmRelease', 'seed-net', 'ingress'],
    ]);
    // Its Source: its chart's (the HelmRepository), not the HelmChart.
    await vi.waitFor(() => expect(part('source')?.textContent).toContain('bitnami'));
  });

  it('shown only to one who may patch it', async () => {
    const w = world();
    w.cluster.rules({ cluster: [{ verbs: ['get', 'list', 'watch'], apiGroups: ['*'], resources: ['*'] }] });
    renderPage(w, open(KUSTOMIZATIONS, 'kustomizations.v1.kustomize.toolkit.fluxcd.io', 'seed-flux', 'hello'));
    await vi.waitFor(() => expect(part('source')).not.toBeNull());
    expect(button('Reconcile')).toBeUndefined();
  });
});

describe('the start', () => {
  it('has what is not Ready: failing first, then on its way; how many are Ready and Suspended', async () => {
    renderPage(world(), '/');
    await vi.waitFor(() => expect(document.querySelector('.uk-panel')?.parentElement?.textContent).toContain('Suspended'));
    const panel = [...document.querySelectorAll('.uk-panel')].find((p) => p.querySelector('.uk-panel-head')?.textContent?.startsWith('Flux')) as HTMLElement;
    await vi.waitFor(() => expect(column('Name', panel)).toHaveLength(5));
    expect(column('Name', panel)).toEqual(['backupsBucket', 'brokenKustomization', 'infraGitRepository', 'podinfoHelmRelease', 'appsKustomization']);
    expect(panel.querySelector('.uk-panel-head')?.textContent).toContain('1 Suspended');
  });
});

describe('what Flux applied', () => {
  it('is marked beside its name — a deployment’s pods and replica sets too, by their deployment', async () => {
    renderPage(world(), '/k/pods.v1');
    await vi.waitFor(() => expect(marks()).toHaveLength(4));
    // db-0: its stateful set's (no hash: its owner itself).
    expect(marks()).toEqual([
      'Flux Kustomization seed-flux/hello',
      'Flux HelmRelease seed-flux/hello-chart',
      'Flux Kustomization seed-flux/hello',
      'Flux Kustomization seed-flux/apps',
    ]);
    cleanup();
    renderPage(world(), '/k/replicasets.v1.apps');
    await vi.waitFor(() => expect(marks()).toHaveLength(3));
  });

  it('its view: the mark after its title; Managed By — what applied it as it is, the revision, the source', async () => {
    renderPage(world(), '/k/pods.v1?open=pods.v1/seed-flux/web-5f9c6549b7-rzrtz');
    await vi.waitFor(() => expect(part('managed-by')?.textContent).toContain('1.4.1@sha256:0c8e1aa→1.4.2@sha256:9f1c2e7'));
    expect(part('managed-by')?.textContent).toContain('apps');
    expect(part('managed-by')?.textContent).toContain('OCIRepository');
    expect(document.querySelector('.uk-modal-head .uk-mark-link, .uk-modal .uk-mark-link')?.getAttribute('aria-label')).toBe('Flux Kustomization seed-flux/apps');
  });
});

describe('its maps', () => {
  const cards = () => [...document.querySelectorAll<HTMLElement>('[data-part="map"] [data-card]')];
  const titles = () =>
    cards()
      .map((c) => `${c.querySelector('.uk-map-card-kind')?.textContent} ${c.querySelector('.uk-map-card-title')?.textContent}`)
      .sort();
  const card = (id: string) => document.querySelector<HTMLElement>(`[data-card="${id}"]`);
  const K = 'kustomizations.v1.kustomize.toolkit.fluxcd.io';

  it('a source’s: what uses it (its chart, of another namespace too), what each applied, as it is now', async () => {
    renderPage(world(), open(GIT, 'gitrepositories.v1.source.toolkit.fluxcd.io', 'seed-flux', 'seed', 'core.map'));
    await vi.waitFor(() => expect(titles()).toContain('Deployment hello-git'));
    expect(titles()).toEqual([
      'ConfigMap hello-git',
      'Deployment hello-git',
      'GitRepository seed',
      'HelmChart seed-flux-hello-chart',
      'HelmRelease hello-chart',
      'Kustomization broken',
      'Kustomization hello',
      'Kustomization net',
      'Namespace seed-flux',
      'StatefulSet db',
    ]);
    expect(card('gitrepositories.v1.source.toolkit.fluxcd.io|seed-flux|seed')?.classList.contains('is-main')).toBe(true);
    expect(card(`${K}|seed-flux|broken`)?.querySelector('.uk-status[data-tone="error"]')).not.toBeNull();
  });

  it('a Kustomization’s: its source, it, what it applied — one gone, dashed', async () => {
    renderPage(world(), open(KUSTOMIZATIONS, K, 'seed-flux', 'apps', 'core.map'));
    await vi.waitFor(() => expect(titles()).toContain('Service web'));
    expect(titles()).toEqual(['ConfigMap gone', 'Deployment web', 'Kustomization apps', 'OCIRepository apps', 'Service web']);
    expect(card('configmaps.v1|seed-flux|gone')?.classList.contains('is-missing')).toBe(true);
    expect(card(`${K}|seed-flux|apps`)?.querySelector('.uk-status[data-tone="progress"]')).not.toBeNull();
  });

  it('a HelmRelease’s: its chart’s source, its chart (of its source’s namespace), it', async () => {
    renderPage(world(), open('/k/helmreleases.v2.helm.toolkit.fluxcd.io', 'helmreleases.v2.helm.toolkit.fluxcd.io', 'seed-net', 'ingress', 'core.map'));
    await vi.waitFor(() => expect(titles()).toContain('HelmRepository bitnami'));
    expect(titles()).toEqual(['HelmChart seed-net-ingress', 'HelmRelease ingress', 'HelmRepository bitnami']);
  });

  it('what was applied where the one signed in may not look: not known, not drawn as gone', async () => {
    const w = world();
    // ConfigMaps denied them: apps' gone one is not known gone.
    w.cluster.state(kinds.core.v1.ConfigMap, 'denied', { status: 403, code: 'Forbidden' });
    renderPage(w, open(KUSTOMIZATIONS, K, 'seed-flux', 'apps', 'core.map'));
    await vi.waitFor(() => expect(titles()).toContain('Service web'));
    expect(card('configmaps.v1|seed-flux|gone')?.classList.contains('is-missing')).toBe(false);
  });
});
