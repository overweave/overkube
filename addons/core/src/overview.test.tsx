import { kinds } from '@overkube/kube-types';
import { defineAddon, slots } from '@overkube/sdk';
import { fill } from '@overkube/sdk/preact';
import { cleanup, kubeWorld, make } from '@overkube/testkit';
import { renderPage } from '@overkube/testkit/preact';
import { fireEvent, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import core from './index.tsx';
import { distroOf } from './overview.tsx';

/*
 * The start, as its user sees it over a cluster: the tiles (as they should
 * be of how many, the rest by kubectl's words), what is unhealthy, what is
 * rolling out, events (Warning at first; all; filtered; paused), the
 * control plane, capacity (requests and limits summed of the pods not done,
 * of what the nodes have allocatable), the nodes, the namespaces — and
 * others' parts in its regions.
 */

afterEach(cleanup);

const { Pod, Node, Event, Namespace } = kinds.core.v1;
const { Deployment } = kinds.apps.v1;
const { Job } = kinds.batch.v1;

/** A node: ready or not, what it has allocatable. */
const node = (name: string, ready: boolean, taints: { key: string; effect: 'NoExecute' | 'NoSchedule' }[] = []) =>
  make(Node, {
    metadata: { name, labels: { [`node-role.kubernetes.io/${ready ? 'control-plane' : 'worker'}`]: '' } },
    spec: { taints },
    status: {
      conditions: [{ type: 'Ready', status: ready ? 'True' : 'Unknown', message: ready ? '' : 'Kubelet stopped posting node status.' }],
      allocatable: { cpu: '4', memory: '8Gi', pods: '110' },
      nodeInfo: { kubeletVersion: 'v1.33.1' } as never,
    },
  });

/** A pod on a node: its phase, its container's state, its requests and limits. */
const pod = (name: string, namespace: string, phase: 'Running' | 'Succeeded', waiting?: { reason: string; message: string }, resources = {}) =>
  make(Pod, {
    metadata: { name, namespace, creationTimestamp: '2026-10-16T10:00:00Z' },
    spec: { nodeName: 'n1', containers: [{ name: 'c', resources }] },
    status: {
      phase,
      containerStatuses: [
        {
          name: 'c',
          image: 'x',
          imageID: '',
          ready: !waiting,
          restartCount: 0,
          state: waiting ? { waiting } : phase === 'Running' ? { running: {} } : { terminated: { exitCode: 0, reason: 'Completed' } },
        },
      ],
    },
  });

function world() {
  const w = kubeWorld();
  for (const name of ['shop', 'kube-system']) w.cluster.add(Namespace, make(Namespace, { metadata: { name, creationTimestamp: '2026-01-01T00:00:00Z' } }));
  w.cluster.add(Node, node('n1', true));
  w.cluster.add(Node, node('n2', false, [{ key: 'node.kubernetes.io/unreachable', effect: 'NoExecute' }]));
  w.cluster.add(Pod, pod('web-1', 'shop', 'Running', undefined, { requests: { cpu: '500m', memory: '1Gi' }, limits: { cpu: '1' } }));
  w.cluster.add(Pod, pod('api-1', 'shop', 'Running', { reason: 'CrashLoopBackOff', message: 'back-off 5m0s restarting failed container=c' }, { requests: { cpu: '1500m' } }));
  // Done: not taking room.
  w.cluster.add(Pod, pod('job-1', 'kube-system', 'Succeeded', undefined, { requests: { cpu: '2' } }));
  w.cluster.add(
    Deployment,
    make(Deployment, {
      metadata: { name: 'web', namespace: 'shop', generation: 2 },
      spec: { replicas: 2 },
      status: {
        observedGeneration: 2,
        replicas: 2,
        updatedReplicas: 1,
        readyReplicas: 1,
        availableReplicas: 1,
        conditions: [{ type: 'Progressing', status: 'True', reason: 'ReplicaSetUpdated', message: 'ReplicaSet "web-2" is progressing.' }],
      },
    }),
  );
  const event = (name: string, type: string, reason: string, kind: string, of: string, count: number) =>
    make(Event, {
      metadata: { name, namespace: 'shop' },
      type,
      reason,
      message: `${reason} of ${of}`,
      count,
      involvedObject: { kind, name: of, namespace: 'shop' },
      lastTimestamp: '2026-10-16T10:00:00Z',
    });
  w.cluster.add(Event, event('e1', 'Warning', 'BackOff', 'Pod', 'api-1', 5));
  w.cluster.add(Event, event('e2', 'Normal', 'Scheduled', 'Pod', 'web-1', 1));
  w.cluster.add(Event, event('e3', 'Warning', 'FailedScheduling', 'Pod', 'web-1', 2));
  w.addon(core);
  return w;
}

const panel = (title: string) => [...document.querySelectorAll('.uk-panel')].find((p) => p.querySelector('.uk-panel-title h2')?.textContent === title) as HTMLElement;
const lines = (title: string) =>
  [...(panel(title)?.querySelectorAll('.uk-row') ?? [])].map((r) => [r.querySelector('.uk-row-lead')?.textContent, r.querySelector('.uk-row-under')?.textContent ?? '']);
/** A panel's table's rows: each its cells' words. */
const table = (title: string) =>
  [...(panel(title)?.querySelectorAll('[role="rowgroup"] [role="row"]') ?? [])].map((r) => [...r.querySelectorAll('[role="cell"]')].map((c) => c.textContent));
const tiles = () =>
  [...document.querySelectorAll('.uk-tile')].map((t) => [
    t.querySelector('.uk-tile-title')?.textContent,
    t.querySelector('.uk-tile-value')?.textContent,
    t.querySelector('.uk-tile-note')?.textContent,
  ]);

describe('the start', () => {
  it('has a tile for each usual kind: as they should be of how many, the rest by kubectl’s words (a service’s, its types)', () => {
    renderPage(world(), '/');
    expect(tiles().slice(0, 3)).toEqual([
      ['Nodes', '1/ 2', '1 Unknown'],
      ['Pods', '2/ 3', '1 CrashLoopBackOff'],
      // A rollout going: as it should be (not a trouble), said.
      ['Deployments', '1/ 1', '1 Progressing'],
    ]);
  });

  it('says what is unhealthy, the worst first, why under each; what is rolling out', () => {
    renderPage(world(), '/');
    // Failing first, then not known (a node lost).
    // Its error a column of its own; its age the last.
    expect(table('Unhealthy').map((r) => r.slice(0, 5))).toEqual([
      ['api-1', 'Pod', 'shop', 'CrashLoopBackOff', 'back-off 5m0s restarting failed container=c'],
      ['n2', 'Node', '—', 'Unknown', 'Kubelet stopped posting node status.'],
    ]);
    expect(lines('Rolling out')).toEqual([['webDeploymentshop', 'ReplicaSet "web-2" is progressing.']]);
  });

  it('sorts what is unhealthy as asked by a column’s header (the worst first till then), its columns its own to resize and move — kept as the user’s', () => {
    const w = world();
    const page = renderPage(w, '/');
    const header = [...panel('Unhealthy').querySelectorAll<HTMLButtonElement>('[role="columnheader"] button')].find((b) => b.textContent === 'Name') as HTMLButtonElement;
    page.act(() => header.click());
    expect(table('Unhealthy').map((r) => r[0])).toEqual(['api-1', 'n2']);
    page.act(() => header.click());
    expect(table('Unhealthy').map((r) => r[0])).toEqual(['n2', 'api-1']);
    expect(panel('Unhealthy').querySelectorAll('.uk-table-resize').length).toBeGreaterThan(0);
    // The user's (its own TableView), there again once drawn anew (gone to another page and back).
    expect(w.user.saved().patches).toEqual([{ kind: 'TableView', name: 'core.overview.unhealthy', fields: { sort: { column: 'name', descending: true } } }]);
    page.navigate('/k/pods.v1');
    page.navigate('/');
    expect(table('Unhealthy').map((r) => r[0])).toEqual(['n2', 'api-1']);
  });

  it('shows Warning events at first, all of them when asked; filtered by a reason (said, taken back)', () => {
    const page = renderPage(world(), '/');
    const reasons = () => lines('Events').map(([lead]) => lead);
    expect(reasons()).toEqual(['BackOffPod shop/api-1', 'FailedSchedulingPod shop/web-1']);
    const button = (text: string) => [...panel('Events').querySelectorAll('button')].find((b) => b.textContent === text) as HTMLButtonElement;
    page.act(() => button('All').click());
    expect(reasons()).toHaveLength(3);
    page.act(() => button('Filter').click());
    const item = [...document.querySelectorAll<HTMLButtonElement>('.uk-checklist-item')].find((i) => i.textContent?.startsWith('Scheduled')) as HTMLButtonElement;
    page.act(() => item.click());
    expect([reasons(), panel('Events').querySelector('.uk-tokens')?.textContent]).toEqual([['ScheduledPod shop/web-1'], 'Reason Scheduled×']);
    page.act(() => (panel('Events').querySelector('.uk-token button') as HTMLButtonElement).click());
    expect(reasons()).toHaveLength(3);
  });

  it('keeps events as they were while paused, how many came since in its button’s name; live again once resumed', () => {
    const w = world();
    const page = renderPage(w, '/');
    const reasons = () => lines('Events').map(([lead]) => lead);
    const pause = () => panel('Events').querySelector('.uk-panel-tools > button[aria-pressed]') as HTMLButtonElement;
    page.act(() => pause().click());
    page.act(
      () =>
        void w.cluster.add(
          Event,
          make(Event, {
            metadata: { name: 'e4', namespace: 'shop' },
            type: 'Warning',
            reason: 'Unhealthy',
            involvedObject: { kind: 'Pod', name: 'web-1', namespace: 'shop' },
            lastTimestamp: '2026-10-16T11:00:00Z',
          }),
        ),
    );
    expect([reasons(), pause().getAttribute('aria-label')]).toEqual([['BackOffPod shop/api-1', 'FailedSchedulingPod shop/web-1'], 'Resume (1 new)']);
    page.act(() => pause().click());
    expect(reasons()[0]).toBe('UnhealthyPod shop/web-1');
    // Paused, then asked another way (all of them): live again, of what is asked now.
    page.act(() => pause().click());
    page.act(() => ([...panel('Events').querySelectorAll('button')].find((b) => b.textContent === 'All') as HTMLButtonElement).click());
    expect([reasons().length, pause().getAttribute('aria-pressed')]).toEqual([4, 'false']);
  });

  it('sums capacity of the pods not done, of what the nodes have allocatable; each node’s pods and requests (not Ready: its taints)', () => {
    renderPage(world(), '/');
    const gauges = [...panel('Capacity').querySelectorAll('.uk-gauge')].map((g) => g.textContent);
    expect(gauges).toEqual(['CPU requests25% of 8', 'CPU limits13% of 8', 'Memory requests6% of 16Gi', 'Memory limits0% of 16Gi', 'Pods2 of 220']);
    expect(lines('Nodes')).toEqual([
      ['n1control-plane', 'CPU 50% · Memory 13% requested · v1.33.1'],
      ['n2worker', 'node.kubernetes.io/unreachable:NoExecute'],
    ]);
    const ns = [...panel('Namespaces').querySelectorAll('.uk-board-td')].map((c) => c.textContent);
    expect(ns).toEqual(['shop', '2', '1', 'kube-system', '1', '—']);
  });

  it('shows of the namespaces chosen only (capacity and the nodes, the cluster’s still)', () => {
    const page = renderPage(world(), '/');
    page.act(() => {
      const picker = [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes('All namespaces')) as HTMLButtonElement;
      picker.click();
    });
    const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((o) => o.textContent?.includes('kube-system')) as HTMLElement;
    page.act(() => option.click());
    expect([tiles()[1], table('Unhealthy').map((r) => r[0]), [...panel('Capacity').querySelectorAll('.uk-gauge')][0].textContent]).toEqual([
      ['Pods', '1/ 1', '1 Completed'],
      ['n2'],
      'CPU requests25% of 8',
    ]);
  });

  it('has others’ parts in its regions: in the cluster’s head, among the panels, under the cluster and capacity', () => {
    const w = world();
    w.addon(
      defineAddon({
        id: 'more',
        title: 'more',
        setup: ({ contributor }) => {
          for (const [where, said] of [
            ['header', 'in sync'],
            ['main', 'certs'],
            ['health', 'no alerts'],
            ['capacity', 'usage'],
          ])
            contributor.add('Fill', `more.${where}`, fill(slots.page('overview', where), { render: () => <i>{said}</i> }));
        },
      }),
    );
    renderPage(w, '/');
    expect([
      panel('Cluster').querySelector('.uk-panel-tools')?.textContent,
      panel('Cluster').textContent?.endsWith('no alerts'),
      panel('Capacity').textContent?.endsWith('usage'),
      [...document.querySelectorAll('.uk-board-col')][0].lastElementChild?.textContent,
    ]).toEqual(['in sync', true, true, 'certs']);
  });

  it('finds what fails behind many on their way (a rollout’s pods being made, newer): asked of the cluster so, not left out after', () => {
    const w = world();
    for (let i = 0; i < 25; i++)
      w.cluster.add(
        Pod,
        make(Pod, {
          metadata: { name: `new-${i}`, namespace: 'shop', creationTimestamp: '2026-10-16T12:00:00Z' },
          spec: { nodeName: 'n1', containers: [{ name: 'c' }] },
          status: {
            phase: 'Pending',
            containerStatuses: [{ name: 'c', image: 'x', imageID: '', ready: false, restartCount: 0, state: { waiting: { reason: 'ContainerCreating' } } }],
          },
        }),
      );
    renderPage(w, '/');
    expect(table('Unhealthy').map((r) => r[0])).toEqual(['api-1', 'n2']);
    // Nor are they unhealthy in their namespace.
    const ns = [...panel('Namespaces').querySelectorAll('.uk-board-td')].map((c) => c.textContent);
    expect(ns.slice(0, 3)).toEqual(['shop', '27', '1']);
  });

  it('says what it could not read, never all well for it: pods refused — no all-clear, no capacity of none', () => {
    const w = world();
    w.cluster.state(Pod, 'denied', { status: 403, code: 'Forbidden', message: 'pods is forbidden' });
    renderPage(w, '/');
    expect([
      panel('Unhealthy').querySelector('.uk-board-refusals')?.textContent,
      panel('Unhealthy').textContent?.includes('Every Node is Ready'),
      panel('Capacity').querySelectorAll('.uk-gauge').length,
      panel('Capacity').querySelector('.uk-board-refusals')?.textContent,
    ]).toEqual(['pods cannot be had: Forbidden', false, 0, 'pods cannot be had: Forbidden']);
  });

  it('has nothing of a kind the cluster does not serve (no batch API): no tile, no refusal, the rest as ever', () => {
    const w = world();
    for (const group of ['', 'apps']) w.cluster.serve(group);
    renderPage(w, '/');
    expect([tiles().some(([t]) => t === 'Jobs'), panel('Unhealthy').querySelector('.uk-board-refusals'), table('Unhealthy').map((r) => r[0])]).toEqual([
      false,
      null,
      ['api-1', 'n2'],
    ]);
  });

  it('takes a job running as it should be (not a trouble)', () => {
    const w = world();
    w.cluster.add(Job, make(Job, { metadata: { name: 'backup', namespace: 'shop' }, status: { active: 1 } }));
    renderPage(w, '/');
    expect(tiles().find(([t]) => t === 'Jobs')).toEqual(['Jobs', '1/ 1', '1 Running']);
  });

  it('keeps a column made wider as the user’s, a width in pixels', () => {
    const w = world();
    const page = renderPage(w, '/');
    const edge = [...panel('Unhealthy').querySelectorAll('[role="columnheader"]')].find((h) => h.textContent === 'Name')?.querySelector('.uk-table-resize') as HTMLElement;
    page.act(() => void fireEvent.keyDown(edge, { key: 'ArrowRight' }));
    const widths = w.user.saved().patches.find((p) => p.name === 'core.overview.unhealthy')?.fields.widths as Record<string, number>;
    expect(typeof widths?.name).toBe('number');
  });

  it('says the cluster: the API server reachable, its version, its distribution, its nodes, its age', async () => {
    renderPage(world(), '/');
    // The gateway's status, once it answers.
    const facts = () => [...panel('Cluster').querySelectorAll('.uk-board-facts dd')].map((d) => d.textContent);
    await waitFor(() => expect(facts().slice(0, 4)).toEqual(['Reachable', 'v1.35.7', '—', '2']));
  });

  it('says the API server unreachable when the gateway cannot be asked — why, under the pointer — not a placeholder for ever', async () => {
    const w = world();
    (w.cluster as unknown as { status: () => Promise<never> }).status = () => Promise.reject(new Error('Failed to fetch'));
    renderPage(w, '/');
    const facts = () => [...panel('Cluster').querySelectorAll('.uk-board-facts dd')].map((d) => d.textContent);
    await waitFor(() => expect(facts().slice(0, 2)).toEqual(['Unreachable', '—']));
  });

  it('says a version’s distribution', () => {
    expect(['v1.33.1+k3s1', 'v1.35.7+kubesolo-v1.2.1', 'v1.31.4-eks-2d5f260', 'v1.30.5-gke.1014001', 'v1.33.1'].map(distroOf)).toEqual([
      'k3s',
      'KubeSolo v1.2.1',
      'EKS',
      'GKE',
      undefined,
    ]);
  });
});
