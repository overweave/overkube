import { cleanup, kubeWorld } from '@overkube/testkit';
import { renderPage } from '@overkube/testkit/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import core from '../index.tsx';
import { mapCluster } from './cluster.fixture.ts';

/*
 * An object's map, its view's Map tab, over a namespace in memory: a
 * Deployment's what comes in to it (an Ingress, its Service, an autoscaler),
 * what it reads (a ConfigMap, a Secret), where its pods run — its pods its
 * dots; a pod's, its workload and its node; a node's, its pods (a frame a
 * namespace) and theirs; a namespace's, its objects but pods and nodes;
 * what is named but not there; the tab only of a kind a scope takes; a card
 * chosen, its object in short and a way to its own map.
 */

afterEach(cleanup);

function world() {
  const w = kubeWorld();
  mapCluster(w.cluster);
  w.addon(core);
  return w;
}

const cards = () => [...document.querySelectorAll<HTMLElement>('[data-part="map"] [data-card]')];
const titles = () =>
  cards()
    .map((c) => `${c.querySelector('.uk-map-card-kind')?.textContent} ${c.querySelector('.uk-map-card-title')?.textContent}`)
    .sort();
const card = (id: string) => document.querySelector<HTMLElement>(`[data-card="${id}"]`);
const D = 'deployments.v1.apps';
const opened = (ref: string, ns: string | undefined, name: string, tab = 'core.map') => `/k/${ref}?open=${ref}/${ns ? `${ns}/` : ''}${name}&open-tab=${tab}`;

describe('a Deployment’s map', () => {
  it('has what comes in to it, what scales it, what it reads (and what else reads it), where it runs — its pods its dots', async () => {
    renderPage(world(), opened(D, 'shop', 'api'));
    await vi.waitFor(() => expect(cards().length).toBeGreaterThan(0));
    expect(titles()).toEqual([
      'ConfigMap api-config',
      'CronJob nightly',
      'Deployment api',
      'HorizontalPodAutoscaler api',
      'Ingress shop',
      'Node node-a',
      'Secret api-env',
      'Service api',
    ]);
    const api = card(`${D}|shop|api`) as HTMLElement;
    expect(api.classList.contains('is-main')).toBe(true);
    expect(api.querySelectorAll('.uk-map-dot')).toHaveLength(2);
    expect(api.querySelector('.uk-map-dot[data-tone="error"]')).not.toBeNull();
    expect([...api.querySelectorAll('.uk-map-chip-label')].map((x) => x.textContent)).toEqual(['/etc/api', 'envFrom']);
  });

  it('a card chosen: its object in short; its own map, its view on its Map tab', async () => {
    const page = renderPage(world(), opened(D, 'shop', 'api'));
    await vi.waitFor(() => expect(card('services.v1|shop|api')).not.toBeNull());
    page.act(() => card('services.v1|shop|api')?.click());
    await vi.waitFor(() => expect(document.querySelector('.uk-map-pv [data-part="summary"]')).not.toBeNull());
    page.act(() => [...document.querySelectorAll<HTMLButtonElement>('.uk-map-pv button')].find((b) => b.textContent === 'Center on map')?.click());
    await vi.waitFor(() => expect(page.path).toContain('open=services.v1/shop/api&open-tab=core.map'));
  });
});

describe('other scopes', () => {
  it('a pod’s: it, its workload, its node', async () => {
    renderPage(world(), opened('pods.v1', 'shop', 'api-7d4b9-b'));
    await vi.waitFor(() => expect(titles()).toContain('Pod api-7d4b9-b'));
    expect(titles()).toEqual(expect.arrayContaining(['Deployment api', 'Node node-a', 'Pod api-7d4b9-b']));
    expect(titles()).not.toContain('Pod api-7d4b9-a');
  });

  it('a node’s: what runs on it (of every namespace), a workload its pods here its dots, a pod of none its own card', async () => {
    renderPage(world(), opened('nodes.v1', undefined, 'node-a'));
    await vi.waitFor(() => expect(cards()).toHaveLength(4));
    expect(titles()).toEqual(['Deployment api', 'Job nightly-29', 'Node node-a', 'Pod db-0']);
    expect(card(`${D}|shop|api`)?.querySelectorAll('.uk-map-dot')).toHaveLength(2);
  });

  it('a CronJob’s: its jobs, what they read (its template’s)', async () => {
    renderPage(world(), opened('cronjobs.v1.batch', 'shop', 'nightly'));
    await vi.waitFor(() => expect(titles()).toContain('Job nightly-29'));
    expect(titles()).toEqual(expect.arrayContaining(['CronJob nightly', 'Job nightly-29', 'Secret api-env']));
    expect(card('jobs.v1.batch|shop|nightly-29')?.querySelector('.uk-status[data-tone="done"]')).not.toBeNull();
  });

  it('a namespace’s: its objects, not its workloads’ pods nor nodes (a pod of none: its own); what is named but not there, dashed; a Service selecting nothing, warned', async () => {
    renderPage(world(), opened('namespaces.v1', undefined, 'shop'));
    await vi.waitFor(() => expect(cards().length).toBeGreaterThan(0));
    expect(titles()).toEqual([
      'ConfigMap api-config',
      'CronJob nightly',
      'Deployment api',
      'HorizontalPodAutoscaler api',
      'Ingress shop',
      'Job nightly-29',
      'Pod debug',
      'Secret api-env',
      'Service api',
      'Service debug',
      'Service legacy',
      'Service reports',
    ]);
    expect(card('services.v1|shop|debug')?.classList.contains('is-missing')).toBe(false);
    expect(card('services.v1|shop|legacy')?.classList.contains('is-missing')).toBe(true);
    expect(card('services.v1|shop|reports')?.querySelector('.uk-status[data-tone="warn"]')).not.toBeNull();
  });

  it('one nothing references and that references nothing (a ConfigMap no workload reads): said so, not an empty map', async () => {
    renderPage(world(), opened('configmaps.v1', 'shop', 'spare'));
    await vi.waitFor(() => expect(document.querySelector('.uk-modal')?.textContent).toContain('No object here references ConfigMap spare'));
    expect(document.querySelector('[data-part="map"]')).toBeNull();
  });

  it('a kind no scope takes: no Map tab', async () => {
    renderPage(world(), opened('clusterroles.v1.rbac.authorization.k8s.io', undefined, 'view', 'core.overview'));
    await vi.waitFor(() => expect(document.querySelector('.uk-modal [role="tab"]')).not.toBeNull());
    expect([...document.querySelectorAll('.uk-modal [role="tab"]')].map((t) => t.textContent)).not.toContain('Map');
  });
});

describe('the cluster’s map (its page)', () => {
  it('each namespace a card (its workloads its dots), each node one — no pod asked', async () => {
    renderPage(world(), '/map');
    await vi.waitFor(() => expect(titles()).toEqual(['Namespace data', 'Namespace shop', 'Node node-a']));
    const shop = card('namespaces.v1||shop') as HTMLElement;
    expect(shop.querySelectorAll('.uk-map-dot')).toHaveLength(1); // its one Deployment (its Job, CronJob: not a replicated workload's health)
    expect(shop.textContent).toContain('1 workloads');
  });

  it('a namespace zoomed into: its own map; the way back, the cluster’s', async () => {
    const page = renderPage(world(), '/map');
    await vi.waitFor(() => expect(card('namespaces.v1||shop')).not.toBeNull());
    page.act(() => card('namespaces.v1||shop')?.click());
    await vi.waitFor(() => expect([...document.querySelectorAll<HTMLButtonElement>('.uk-map-pv button')].some((b) => b.textContent === 'Zoom in')).toBe(true));
    page.act(() => [...document.querySelectorAll<HTMLButtonElement>('.uk-map-pv button')].find((b) => b.textContent === 'Zoom in')?.click());
    await vi.waitFor(() => expect(page.path).toBe('/map/shop'));
    await vi.waitFor(() => expect(titles()).toContain('Ingress shop'));
    expect(document.querySelector('[data-part="crumbs"]')?.textContent).toBe('Cluster›shop');
  });
});
