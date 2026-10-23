import { parseQuantity } from '@overkube/cel';
import { type KindInfo, type KubeObject, kinds } from '@overkube/kube-types';
import { type Label, type ResourceProps, whereOf } from '@overkube/sdk';
import { useGet, useList, useSay } from '@overkube/sdk/preact';
import { Gauge, Notice, Section, Segmented, Skeleton, Table, TimeChart, type TimeChartMark, Usage } from '@overkube/uikit';
import { useEffect, useState } from 'preact/hooks';
import { type Keeper, type Metric, type Of, promql, range } from './history.ts';
import { NODE_METRICS, POD_METRICS } from './kinds.ts';
import type { Metrics } from './setup.tsx';
import { T } from './texts.ts';
import { inScale, percent, type Resource, said, scaleOf } from './units.ts';

/*
 * A pod's Metrics tab, a node's: what it uses now (metrics-server: a pod's
 * each container, beside what it requests and may take; a node's of what
 * it has allocatable), then over a range where history is kept — CPU,
 * memory (its requests and limit marked), a pod's CPU throttled and
 * network, each a chart to point along. Asked again each minute while
 * drawn. No history kept: said where it would be, and what would draw it.
 */

const { Pod, Node } = kinds.core.v1;

/** The ranges, in seconds: each its points about 120. */
const RANGES: [string, number][] = [
  ['15m', 900],
  ['1h', 3600],
  ['6h', 21600],
  ['24h', 86400],
  ['7d', 604800],
];
const POINTS = 120;
/** What a range's end is a whole number of (seconds): about a scrape. */
const GRAIN = 15;
const AGAIN_MS = 60_000;

/** A quantity as a number (cores, bytes; none: undefined). */
const amount = (q: unknown) => (typeof q === 'string' || typeof q === 'number' ? parseQuantity(String(q))?.approximate() : undefined);

type Resources = { requests?: Record<string, unknown>; limits?: Record<string, unknown> };
type Container = { name: string; resources?: Resources };

/** A pod's containers' requests and limits, by name. */
const containersOf = (pod: KubeObject) => ((pod as { spec?: { containers?: Container[] } }).spec?.containers ?? []).map((c) => [c.name, c.resources ?? {}] as const);

/** A pod's requests and limits, a node's allocatable — as their kinds' fields say them (kubectl describe's sums); none said: none. */
function useMarked(kind: KindInfo, object: KubeObject): (field: string) => number | undefined {
  const ref = kind.id === Pod.id ? 'pods.v1' : 'nodes.v1';
  const fields =
    ref === 'pods.v1'
      ? ['pods.v1.cpu-requests', 'pods.v1.cpu-limits', 'pods.v1.memory-requests', 'pods.v1.memory-limits']
      : ['nodes.v1.cpu-allocatable', 'nodes.v1.memory-allocatable'];
  const namespace = object.metadata?.namespace;
  const got = useList({
    kind: ref,
    ...(namespace ? { scope: { namespaces: [namespace] } } : {}),
    where: { field: 'core.name', op: 'eq', value: object.metadata?.name ?? '' },
    page: { limit: 1 },
    select: fields,
  });
  return (field) => {
    const v = got.items[0]?.values?.[field];
    return typeof v === 'number' && v > 0 ? v : undefined;
  };
}

/** A use drawn as the tables draw it: its limit marked, what it requests and may take in its tip. */
function UsageOf({ resource, value, resources }: { resource: 'cpu' | 'memory'; value: number; resources: Resources }) {
  const say = useSay();
  const scale = scaleOf(resource, value);
  const [requests, limit] = [amount(resources.requests?.[resource]), amount(resources.limits?.[resource])];
  const tip = [
    say(T.columns.used, { value: said(resource, value) }),
    ...(requests ? [say(T.columns.requests, { value: said(resource, requests) })] : []),
    ...(limit ? [say(T.columns.limit, { value: said(resource, limit) })] : []),
  ].join(' · ');
  return <Usage value={inScale(value, scale)} unit={scale.unit} {...(limit ? { limit: inScale(limit, scale) } : {})} title={tip} />;
}

type ContainerUse = { name: string; usage?: { cpu?: string; memory?: string } };
type ContainerRow = { name: string; cpu: number; memory: number; resources: Resources };

/** A pod's containers now, each its use (its requests and limits in its tip). */
function PodNow({ pod }: { pod: KubeObject }) {
  const say = useSay();
  const got = useGet<{ containers?: ContainerUse[] }>({ kind: POD_METRICS, namespace: pod.metadata?.namespace ?? '', name: pod.metadata?.name ?? '' });
  if (got.state === 'loading') return <Skeleton width="60%" />;
  const used = got.object?.containers ?? [];
  if (!used.length) return <p class="uk-quiet">{say(T.tab.noNow, { kind: 'pod' })}</p>;
  const resources = new Map(containersOf(pod));
  const rows: ContainerRow[] = used.map((c) => ({ name: c.name, cpu: amount(c.usage?.cpu) ?? 0, memory: amount(c.usage?.memory) ?? 0, resources: resources.get(c.name) ?? {} }));
  const use = (resource: 'cpu' | 'memory') => (r: ContainerRow) => <UsageOf resource={resource} value={r[resource]} resources={r.resources} />;
  return (
    <Table
      plain
      height="none"
      rows={rows}
      rowKey={(r) => r.name}
      columns={[
        { id: 'name', header: say(T.tab.container), width: 'minmax(96px, 1fr)', cell: (r) => r.name },
        { id: 'cpu', header: say(T.columns.cpu), width: '120px', cell: use('cpu') },
        { id: 'memory', header: say(T.columns.memory), width: '120px', cell: use('memory') },
      ]}
    />
  );
}

/** A node now: what it uses of what it has allocatable. */
function NodeNow({ node }: { node: KubeObject }) {
  const say = useSay();
  const got = useGet<{ usage?: { cpu?: string; memory?: string } }>({ kind: NODE_METRICS, name: node.metadata?.name ?? '' });
  if (got.state === 'loading') return <Skeleton width="60%" />;
  const usage = got.object?.usage;
  if (!usage) return <p class="uk-quiet">{say(T.tab.noNow, { kind: 'node' })}</p>;
  const allocatable = (node as { status?: { allocatable?: Record<string, string> } }).status?.allocatable ?? {};
  return (
    <div class="uk-gauges">
      {(['cpu', 'memory'] as const).map((resource) => {
        const [part, whole] = [amount(usage[resource]) ?? 0, amount(allocatable[resource]) ?? 0];
        return (
          <Gauge
            key={resource}
            label={say(resource === 'cpu' ? T.columns.cpu : T.columns.memory)}
            value={part}
            of={whole}
            said={`${said(resource, part)} · ${say(T.overview.of, { part: percent(part, whole), whole: said(resource, whole) })}`}
          />
        );
      })}
    </div>
  );
}

/** How long ago, said short: 45s, 23m, 2h 10m, 3d. */
function shortAgo(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`;
  return `${Math.round(m / 1440)}d`;
}

/** What a chart draws: its title, its resource (its unit), its marks. */
type Chart = { metric: Metric; title: Label; resource: Resource | 'percent'; marks: [Label, number | undefined, TimeChartMark['tone']][] };

/** A series as a chart has it: the points from the first kept on (a pod younger than the range: from its start), a gap the point before it. */
function trimmed(points: readonly (number | null)[]): { from: number; points: number[] } {
  const from = points.findIndex((p) => p !== null);
  if (from < 0) return { from: 0, points: [] };
  let last = 0;
  return {
    from,
    points: points.slice(from).map((p) => {
      if (p !== null) last = p;
      return last;
    }),
  };
}

type Got = { at: number; series: Partial<Record<Metric, (number | null)[]>> };

/** The range's charts, asked of the keeper (again each minute while drawn). */
function OverTime({ keeper, of, charts }: { keeper: Keeper; of: Of; charts: Chart[] }) {
  const say = useSay();
  const [shown, setShown] = useState('1h');
  const [got, setGot] = useState<Got | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const seconds = RANGES.find(([r]) => r === shown)?.[1] ?? 3600;
  const step = Math.max(15, Math.round(seconds / POINTS));
  const ofKey = JSON.stringify(of);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ask = async () => {
      // Up to now (a grain of a scrape: not a step behind on a long range).
      const end = Math.floor(Date.now() / 1000 / GRAIN) * GRAIN;
      const start = end - seconds;
      try {
        const series: Got['series'] = {};
        await Promise.all(
          charts.map(async (c) => {
            const query = promql(c.metric, of, step);
            if (!query) return;
            const answer = await range(keeper, query, start, end, step, controller.signal);
            const first = [...answer.values()][0];
            if (first) series[c.metric] = first;
          }),
        );
        setGot({ at: start, series });
        setFailed(null);
      } catch (error) {
        if (controller.signal.aborted) return;
        setFailed(error instanceof Error ? error.message : String(error));
      }
      timer = setTimeout(ask, AGAIN_MS);
    };
    setGot(null);
    void ask();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [keeper.target, ofKey, seconds, step]);

  const drawn = got
    ? charts.flatMap((c) => {
        const { from, points } = trimmed(got.series[c.metric] ?? []);
        if (points.length < 2) return [];
        // Scaled to what was used: a mark within twice of it drawn too (its line in the plot); one far over it, only said.
        const most = Math.max(...points);
        const near = c.marks.flatMap(([, v]) => (v && v <= most * 2 ? [v] : []));
        const top = Math.max(most, ...near);
        const scale = c.resource === 'percent' ? { by: 1, unit: '%', decimals: 1 } : scaleOf(c.resource, top);
        const at = (i: number) => got.at + (from + i) * step;
        const ago = (i: number) => {
          const s = Date.now() / 1000 - at(i);
          return s < GRAIN * 2 ? say(T.tab.at) : say(T.tab.ago, { time: shortAgo(s) });
        };
        const marks = c.marks.flatMap(([label, v, tone]) => (v ? [{ label: say(label), value: inScale(v, scale), tone }] : []));
        return [
          <TimeChart
            key={c.metric}
            title={say(c.title)}
            unit={scale.unit}
            points={points.map((p) => p / scale.by)}
            max={c.resource === 'percent' ? Math.max(100, most) : (top * 1.1) / scale.by || 1}
            marks={marks}
            start={ago(0)}
            end={ago(points.length - 1)}
            when={ago}
            format={(v) => String(inScale(v * scale.by, scale))}
          />,
        ];
      })
    : [];

  return (
    <>
      <div class="uk-charts-bar">
        <Segmented label={say(T.tab.range)} value={shown} onChange={setShown} options={RANGES.map(([r]) => ({ value: r, label: r }))} />
        <span class="uk-quiet">
          {keeper.title} · {whereOf(keeper.target)}
        </span>
      </div>
      {failed ? (
        <Notice icon="warning" title={say(T.tab.failed, { keeper: keeper.title, message: failed })} />
      ) : !got ? (
        <div class="uk-charts">
          <Skeleton width="100%" />
          <Skeleton width="100%" />
        </div>
      ) : drawn.length ? (
        <div class="uk-charts">{drawn}</div>
      ) : (
        <p class="uk-quiet">{say(T.tab.nothingKept)}</p>
      )}
    </>
  );
}

/** The tab: now, then over time (or what would draw it). */
export function MetricsTab({ kind, object, metrics }: ResourceProps & { metrics: Metrics }) {
  const say = useSay();
  const keeper = metrics.keeper.value;
  const isPod = kind.id === Pod.id;
  const of: Of = isPod ? { pod: { namespace: object.metadata?.namespace ?? '', name: object.metadata?.name ?? '' } } : { node: object.metadata?.name ?? '' };
  const marked = useMarked(kind, object);
  const marks = (r: 'cpu' | 'memory'): Chart['marks'] =>
    isPod
      ? [
          [T.tab.marks.requests, marked(`pods.v1.${r}-requests`), 'info'],
          [T.tab.marks.limit, marked(`pods.v1.${r}-limits`), 'warn'],
        ]
      : [[T.tab.marks.allocatable, marked(`nodes.v1.${r}-allocatable`), 'warn']];
  const charts: Chart[] = [
    { metric: 'cpu', title: T.tab.charts.cpu, resource: 'cpu', marks: marks('cpu') },
    { metric: 'memory', title: T.tab.charts.memory, resource: 'memory', marks: marks('memory') },
    ...(isPod
      ? ([
          { metric: 'throttled', title: T.tab.charts.throttled, resource: 'percent', marks: [] },
          { metric: 'received', title: T.tab.charts.received, resource: 'rate', marks: [] },
          { metric: 'sent', title: T.tab.charts.sent, resource: 'rate', marks: [] },
        ] as Chart[])
      : []),
  ];
  return (
    <>
      {metrics.now() && (
        <Section title={say(T.tab.now)} part="metrics-now">
          {isPod ? <PodNow pod={object} /> : <NodeNow node={object} />}
        </Section>
      )}
      {keeper ? (
        <Section title={say(T.tab.overTime)} part="metrics-history">
          <OverTime keeper={keeper} of={of} charts={charts} />
        </Section>
      ) : (
        <Notice icon="activity" title={say(T.tab.noHistory.title)}>
          {say(T.tab.noHistory.text)}
        </Notice>
      )}
    </>
  );
}

/** The kinds it is a tab of. */
export const TABBED: readonly KindInfo[] = [Pod, Node];
