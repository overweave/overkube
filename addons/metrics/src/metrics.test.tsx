import core from '@overkube/addon-core';
import { loadOf } from '@overkube/sdk';
import { cleanup, fakeCluster, kubeWorld } from '@overkube/testkit';
import { renderPage } from '@overkube/testkit/preact';
import { waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { METRICS_KINDS, metricsCluster } from './cluster.fixture.ts';
import { promql, queriesOf } from './history.ts';
import metrics from './index.tsx';

/*
 * The metrics addon, as its user sees it over a cluster: CPU and memory in
 * the pods' and nodes' tables (now, and the last hour beside it where
 * history is kept), what is used of what the nodes have, the pods using the
 * most, a pod's and a node's Metrics tab — and what it asks of where
 * history is kept.
 */

// Its setup's module loaded first (its own chunk, as the page loads it before it starts it): set up at once, as it is drawn.
await loadOf(metrics)?.();

afterEach(cleanup);

function world(history = true, now = true) {
  const w = kubeWorld({ cluster: fakeCluster({ kinds: METRICS_KINDS }) });
  metricsCluster(w.cluster, { history, now });
  w.addon(core);
  w.addon(metrics);
  return w;
}

/** A table's header and its rows: each its cells' words. */
const table = (root: ParentNode = document) => ({
  header: [...root.querySelectorAll('[role="columnheader"]')].map((c) => c.textContent),
  rows: [...root.querySelectorAll('[role="rowgroup"] [role="row"]')].map((r) => [...r.querySelectorAll('[role="cell"]')].map((c) => c.textContent)),
});
const column = (name: string, root: ParentNode = document) => {
  const { header, rows } = table(root);
  return rows.map((r) => r[header.indexOf(name)]);
};
const panel = (title: string) => [...document.querySelectorAll('.uk-panel')].find((p) => p.querySelector('.uk-panel-title h2')?.textContent === title) as HTMLElement;

describe('the tables', () => {
  it('say each pod’s CPU and memory now, as kubectl top does — near its limit a warning, what it requests and may take in its tip', async () => {
    renderPage(world(false), '/k/pods.v1');
    await waitFor(() => expect(column('CPU')).toEqual(['412m', '4m', '38m', '96m']));
    expect(column('Memory')).toEqual(['460Mi', '21Mi', '1.21Gi', '182Mi']);
    const api = document.querySelector('[role="rowgroup"] [role="row"] .uk-usage') as HTMLElement;
    expect(api.title).toBe('412m used · requests 250m · limit 500m');
    // Over 85% of its limit: its memory (460 of 512Mi), not its CPU (412 of 500m).
    expect([...document.querySelectorAll('[role="rowgroup"] [role="row"]')[0].querySelectorAll('.uk-usage-value[data-level="warn"]')].map((v) => v.textContent)).toEqual(['460Mi']);
    // No history kept: no line.
    expect(document.querySelector('.uk-spark')).toBeNull();
  });

  it('say the last of its history where metrics-server says nothing', async () => {
    renderPage(world(true, false), '/k/pods.v1');
    await waitFor(() => expect(column('CPU')[0]).toBe('412m'));
    expect(column('CPU')).not.toContain('—');
  });

  it('sort by what is used now, as its header is clicked', async () => {
    const page = renderPage(world(false), '/k/pods.v1');
    await waitFor(() => expect(column('CPU')).toContain('412m'));
    const header = (name: string) => [...document.querySelectorAll<HTMLButtonElement>('[role="columnheader"] button')].find((b) => b.textContent === name) as HTMLButtonElement;
    page.act(() => header('CPU').click());
    await waitFor(() => expect(column('CPU')).toEqual(['4m', '38m', '96m', '412m']));
    page.act(() => header('Memory').click());
    await waitFor(() => expect(column('Memory')).toEqual(['21Mi', '182Mi', '460Mi', '1.21Gi']));
  });

  it('draw each one’s last hour before it where history is kept, asked of it together — a query a namespace', async () => {
    const w = world();
    renderPage(w, '/k/pods.v1');
    await waitFor(() => expect(document.querySelectorAll('[role="rowgroup"] .uk-spark')).toHaveLength(8));
  });

  it('say a node’s use beside its capacity (CPU Usage, Memory Usage), of what it has allocatable', async () => {
    renderPage(world(false), '/k/nodes.v1');
    await waitFor(() => expect(column('CPU Usage')).toEqual(['2.14 cores']));
    expect(column('Memory Usage')).toEqual(['9.57Gi']);
  });
});

describe('the start', () => {
  it('says what is used of what the nodes have allocatable, under capacity', async () => {
    renderPage(world(false), '/');
    await waitFor(() =>
      expect([...panel('Capacity').querySelectorAll('.uk-gauge')].slice(-2).map((g) => g.textContent)).toEqual(['CPU used27% of 8 cores', 'Memory used30% of 32Gi']),
    );
  });

  it('has the pods using the most: by CPU, then by memory as its header is clicked (the most first) — kept as the user’s', async () => {
    const w = world(false);
    const page = renderPage(w, '/');
    await waitFor(() => expect(column('Name', panel('Top pods'))).toEqual(['api-7f9c-x2kqp', 'web-7d4b9-q7m4z', 'db-0', 'coredns-75c7b7f4-b9mgn']));
    const memory = [...panel('Top pods').querySelectorAll<HTMLButtonElement>('[role="columnheader"] button')].find((b) => b.textContent?.startsWith('Memory')) as HTMLButtonElement;
    page.act(() => memory.click());
    await waitFor(() => expect(column('Name', panel('Top pods'))[0]).toBe('db-0'));
    expect(w.user.saved().patches).toEqual([{ kind: 'TableView', name: 'metrics.overview.top', fields: { sort: { column: 'memory', descending: true } } }]);
  });
});

describe('a resource’s Metrics tab', () => {
  const open = (w: ReturnType<typeof world>, path: string) => {
    const page = renderPage(w, path);
    page.act(() => ([...document.querySelectorAll('[role="tab"]')].find((t) => t.textContent === 'Metrics') as HTMLButtonElement).click());
    return page;
  };
  const tab = () => document.querySelector('[role="tabpanel"]') as HTMLElement;

  it('says a pod’s containers now, then charts of the range asked of where history is kept — its requests and limit marked', async () => {
    const w = world();
    open(w, `/?open=pods.v1/shop/api-7f9c-x2kqp`);
    await waitFor(() => expect(column('Container', tab())).toEqual(['app']));
    expect(column('CPU', tab())).toEqual(['412m']);
    await waitFor(() =>
      expect([...document.querySelectorAll('.uk-chart-head > span')].map((s) => s.textContent)).toEqual(['CPU', 'Memory', 'CPU throttled', 'Network received', 'Network sent']),
    );
    expect(document.querySelector('.uk-charts-bar')?.textContent).toContain('VictoriaMetrics · monitoring/vmsingle-main:8428');
    expect(document.querySelector('.uk-chart-axis')?.textContent).toContain('requests 250m · limit 500m');
  });

  it('says where the hours would be, and what would draw them, with no history kept', async () => {
    open(world(false), `/?open=pods.v1/shop/api-7f9c-x2kqp`);
    await waitFor(() => expect(document.querySelector('.uk-notice-title')?.textContent).toBe('No history: no VictoriaMetrics or Prometheus found'));
  });

  it('says a node’s use of what it has allocatable', async () => {
    open(world(false), `/?open=nodes.v1/kube-1`);
    await waitFor(() => expect([...tab().querySelectorAll('.uk-gauge')].map((g) => g.textContent)).toEqual(['CPU2.14 cores · 27% of 8 cores', 'Memory9.57Gi · 30% of 32Gi']));
  });
});

describe('where history is kept', () => {
  it('is found by itself and said in Settings, with what it uses', async () => {
    const w = world();
    await waitFor(() => expect(w.using('metrics')).toBe('VictoriaMetrics over time, metrics-server now'));
  });

  it('is asked a query a namespace (so many pods at most each), of cAdvisor’s containers alone', () => {
    const asked = queriesOf([
      { kind: 'pods', key: 'shop/api-1', metric: 'cpu' },
      { kind: 'pods', key: 'shop/db.0', metric: 'cpu' },
      { kind: 'pods', key: 'ops/x', metric: 'cpu' },
      { kind: 'nodes', key: 'kube-1', metric: 'memory' },
    ]);
    expect(asked.map(([of, q]) => [of.keys, q])).toEqual([
      [['shop/api-1', 'shop/db.0'], 'sum by (namespace,pod) (rate(container_cpu_usage_seconds_total{namespace="shop",pod=~"api-1|db\\\\.0",container!~"|POD",image!=""}[120s]))'],
      [['ops/x'], 'sum by (namespace,pod) (rate(container_cpu_usage_seconds_total{namespace="ops",pod=~"x",container!~"|POD",image!=""}[120s]))'],
      [
        ['kube-1'],
        'sum by (node) (container_memory_working_set_bytes{id="/",node=~"kube-1"}) or sum by (node) (label_replace(container_memory_working_set_bytes{id="/",kubernetes_io_hostname=~"kube-1"}, "node", "$1", "kubernetes_io_hostname", "(.+)"))',
      ],
    ]);
    expect(promql('throttled', { pod: { namespace: 'shop', name: 'api-1' } }, 30)).toBe(
      '100 * sum(rate(container_cpu_cfs_throttled_periods_total{namespace="shop",pod="api-1",container!~"|POD",image!=""}[120s])) / sum(rate(container_cpu_cfs_periods_total{namespace="shop",pod="api-1",container!~"|POD",image!=""}[120s]))',
    );
    expect(promql('throttled', { node: 'kube-1' }, 30)).toBeUndefined();
  });
});
