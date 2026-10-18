import { kinds } from '@overkube/kube-types';
import type { Result } from '@overkube/query';
import { type KubeContributor, openIn, TableView, tile } from '@overkube/sdk';
import { useCount, useList, usePage, useSay, useUser } from '@overkube/sdk/preact';
import { Gauge, Nothing, Panel, PanelBody, PanelHead, Table, type TableColumn, type TableSort, Usage } from '@overkube/uikit';
import { useDefinition } from '@overweave/ui/preact';
import type { Metrics } from './index.tsx';
import { F, NODE_METRICS, POD_METRICS } from './kinds.ts';
import { T } from './texts.ts';
import { inScale, percent, said, scaleOf } from './units.ts';

/*
 * The start's: under capacity (what the pods request of what the nodes
 * have allocatable), what they use of it now; among the main panels, the
 * pods using the most — by CPU or by memory, as the user sorts it (kept,
 * its TableView's), each with its last hour where history is kept. The
 * whole cluster's (metrics-server's, as it says them now).
 */

const { Pod } = kinds.core.v1;

const TOP_VIEW = 'metrics.overview.top';
const SHOWN = 8;

/** An answer read (live, or as it was): anything else — on its way, refused, not served — said of nothing. */
const read = (r: Result) => r.state === 'live' || r.state === 'stale';

/** CPU and memory used now, of what the nodes have allocatable. */
export function Used() {
  const say = useSay();
  const used = useCount({ kind: NODE_METRICS, sum: [F.nodeMetricsCpu, F.nodeMetricsMemory] });
  const room = useCount({ kind: 'nodes.v1', sum: ['nodes.v1.cpu-allocatable', 'nodes.v1.memory-allocatable'] });
  if (!read(used) || !read(room) || !used.total?.count) return null;
  const gauge = (label: string, resource: 'cpu' | 'memory', part: number, whole: number) => (
    <Gauge label={label} value={part} of={whole} said={say(T.overview.of, { part: percent(part, whole), whole: said(resource, whole) })} />
  );
  const sum = (r: typeof used, f: string) => r.sums?.[f] ?? 0;
  return (
    <div class="uk-gauges">
      {gauge(say(T.overview.cpuUsed), 'cpu', sum(used, F.nodeMetricsCpu), sum(room, 'nodes.v1.cpu-allocatable'))}
      {gauge(say(T.overview.memoryUsed), 'memory', sum(used, F.nodeMetricsMemory), sum(room, 'nodes.v1.memory-allocatable'))}
    </div>
  );
}

type Row = { key: string; namespace: string; name: string; cpu: number; memory: number };

/** The pods using the most now: by CPU, or memory — as sorted (the user's, kept). */
export function Top({ metrics }: { metrics: Metrics }) {
  const say = useSay();
  const page = usePage();
  const user = useUser();
  const t = T.overview.top;
  const view = useDefinition(TableView, TOP_VIEW)?.spec ?? {};
  const sort: TableSort = view.sort ? { id: view.sort.column, desc: view.sort.descending ?? false } : { id: 'cpu', desc: true };
  const list = useList({
    kind: POD_METRICS,
    sort: [{ field: sort.id === 'memory' ? F.podMetricsMemory : F.podMetricsCpu, desc: sort.desc ?? false }],
    page: { limit: SHOWN },
    select: ['core.namespace', 'core.name', F.podMetricsCpu, F.podMetricsMemory],
  });
  // Not served (no metrics-server), refused: nothing said.
  if (list.state !== 'loading' && !read(list)) return null;
  const rows: Row[] = list.items.map((i) => {
    const v = i.values ?? {};
    const [namespace, name] = [String(v['core.namespace'] ?? ''), String(v['core.name'] ?? '')];
    return { key: `${namespace}/${name}`, namespace, name, cpu: Number(v[F.podMetricsCpu] ?? 0), memory: Number(v[F.podMetricsMemory] ?? 0) };
  });
  const use = (resource: 'cpu' | 'memory') => (r: Row) => {
    const scale = scaleOf(resource, r[resource]);
    const line = metrics.lines.line({ kind: 'pods', key: r.key, metric: resource });
    return <Usage value={inScale(r[resource], scale)} unit={scale.unit} {...(line ? { history: line } : {})} />;
  };
  const columns: TableColumn<Row>[] = [
    {
      id: 'name',
      header: say(t.name),
      width: 'minmax(160px, 2fr)',
      cell: (r) => (
        <a class="uk-board-name" href={page.href(openIn('/', Pod, { metadata: { name: r.name, namespace: r.namespace } }))}>
          {r.name}
        </a>
      ),
    },
    { id: 'namespace', header: say(t.namespace), width: 'minmax(90px, 1fr)', cell: (r) => r.namespace },
    { id: 'cpu', header: say(T.columns.cpu), width: '150px', sortable: true, cell: use('cpu') },
    { id: 'memory', header: say(T.columns.memory), width: '150px', sortable: true, cell: use('memory') },
  ];
  return (
    <Panel header={<PanelHead title={say(t.title)} />}>
      {list.state !== 'loading' && rows.length === 0 ? (
        <PanelBody>
          <Nothing icon="activity">{say(t.none)}</Nothing>
        </PanelBody>
      ) : (
        <Table
          height="none"
          rows={rows}
          rowKey={(r) => r.key}
          columns={columns}
          sort={sort}
          loading={list.state === 'loading'}
          // Another column: the most first (what this panel is for); the same again, as the table turns it.
          onSort={(s) => user.patch('TableView', TOP_VIEW, { sort: { column: s.id, descending: s.id === sort.id ? (s.desc ?? false) : true } })}
          onRowClick={(r) => page.navigate(openIn('/', Pod, { metadata: { name: r.name, namespace: r.namespace } }))}
        />
      )}
    </Panel>
  );
}

export function addOverview(c: KubeContributor, metrics: Metrics) {
  c.add('TableView', TOP_VIEW, {}, { fallback: true });
  c.add('Fill', 'metrics.page.overview.used', tile('overview', 'capacity', { title: 'CPU and memory used', render: Used }));
  c.add('Fill', 'metrics.page.overview.top', tile('overview', 'main', { title: 'Top pods', order: 150, render: () => <Top metrics={metrics} /> }));
}
