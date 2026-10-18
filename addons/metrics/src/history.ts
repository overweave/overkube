import type { Reach, ReachTarget } from '@overkube/sdk';
import { type ReadonlySignal, signal } from '@preact/signals';

/*
 * What the cluster kept over time, asked of where it keeps it — a
 * VictoriaMetrics or a Prometheus found in it, reached through the API
 * server's service proxy as the one signed in: their query API (the same
 * of both), PromQL of the kubelet's cAdvisor series. Of a container's:
 * those of cAdvisor alone (an image; the kubelet's resource metrics, if
 * kept too, say the same again), a pod's sandbox not among them (its
 * container POD, or none) — its network the sandbox's own. A node's: its
 * root cgroup, by its node label (or, scraped with the node's labels
 * instead, its kubernetes_io_hostname).
 *
 * Lines: the last hour of what tables show, asked together — a cell asks
 * for its pod's as it is drawn; those not had yet, fetched within a moment
 * (one query a namespace, so many pods at most each); those had, again
 * each minute — of those drawn since (one no longer drawn, let go of).
 */

/** Where history is kept: its name (VictoriaMetrics), where, the way there. */
export interface Keeper {
  title: string;
  target: ReachTarget;
  reach: Reach;
}

/** A series as the query API gives it: its labels, its points ([seconds, "value"]). */
interface Series {
  metric: Record<string, string>;
  values?: [number, string][];
  value?: [number, string];
}

interface Answer {
  status: 'success' | 'error';
  data?: { resultType: string; result: Series[] };
  error?: string;
}

/** A label's value matched exactly, in a regex (a name's dots and the like as themselves). */
const exact = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A label's value in a selector, quoted. */
const quoted = (v: string) => `"${v.replace(/["\\]/g, '\\$&')}"`;

/** cAdvisor's series of a container (not a pod's sandbox: POD, or none; not the kubelet's resource metrics: no image). */
const CONTAINERS = 'container!~"|POD",image!=""';

/** What is drawn over time. */
export type Metric = 'cpu' | 'memory' | 'throttled' | 'received' | 'sent';

/** What a pod's or a node's series is said by. */
export type Of = { pod: { namespace: string; name: string } } | { node: string };

/** The rate's window for a step: four scrapes of 30s at the least (2m), two steps past that. */
const windowOf = (step: number) => `${Math.max(120, step * 2)}s`;

/** Nodes' series summed by node: by their node label, or (none) by kubernetes_io_hostname as node; match: the names' test (="x", =~"x|y"). */
const byNode = (series: (at: string) => string, match: string) =>
  `sum by (node) (${series(`id="/",node${match}`)}) or sum by (node) (label_replace(${series(`id="/",kubernetes_io_hostname${match}`)}, "node", "$1", "kubernetes_io_hostname", "(.+)"))`;

/** A node's CPU or memory series of a match. */
const nodeSeries = (metric: 'cpu' | 'memory', w: string) => (at: string) =>
  metric === 'cpu' ? `rate(container_cpu_usage_seconds_total{${at}}[${w}])` : `container_memory_working_set_bytes{${at}}`;

/** PromQL of a metric, summed for a pod or a node (none: a node's throttling, not said). */
export function promql(metric: Metric, of: Of, step: number): string | undefined {
  const w = windowOf(step);
  if ('node' in of) return metric === 'cpu' || metric === 'memory' ? byNode(nodeSeries(metric, w), `=${quoted(of.node)}`) : undefined;
  const at = `namespace=${quoted(of.pod.namespace)},pod=${quoted(of.pod.name)}`;
  switch (metric) {
    case 'cpu':
      return `sum(rate(container_cpu_usage_seconds_total{${at},${CONTAINERS}}[${w}]))`;
    case 'memory':
      return `sum(container_memory_working_set_bytes{${at},${CONTAINERS}})`;
    case 'throttled':
      return `100 * sum(rate(container_cpu_cfs_throttled_periods_total{${at},${CONTAINERS}}[${w}])) / sum(rate(container_cpu_cfs_periods_total{${at},${CONTAINERS}}[${w}]))`;
    case 'received':
      return `sum(rate(container_network_receive_bytes_total{${at}}[${w}]))`;
    case 'sent':
      return `sum(rate(container_network_transmit_bytes_total{${at}}[${w}]))`;
  }
}

/** A range asked: its points, every step from start to end (seconds); a point none kept for, none (null). */
export async function range(keeper: Keeper, query: string, start: number, end: number, step: number, signal?: AbortSignal): Promise<Map<string, (number | null)[]>> {
  const answer = await keeper.reach.get<Answer>('/api/v1/query_range', { query, start: String(start), end: String(end), step: String(step) }, signal);
  if (answer?.status !== 'success' || !answer.data) throw new Error(answer?.error ?? (answer as { message?: string } | undefined)?.message ?? 'no answer');
  const count = Math.floor((end - start) / step) + 1;
  const out = new Map<string, (number | null)[]>();
  for (const s of answer.data.result) {
    const points: (number | null)[] = Array(count).fill(null);
    for (const [at, v] of s.values ?? []) {
      const i = Math.round((at - start) / step);
      const n = Number(v);
      if (i >= 0 && i < count && Number.isFinite(n)) points[i] = n;
    }
    out.set(keyOf(s.metric), points);
  }
  return out;
}

/** A series' key: its pod's (namespace/name), its node's, or none of them (a sum: ''). */
const keyOf = (m: Record<string, string>) => (m.pod ? `${m.namespace}/${m.pod}` : (m.node ?? ''));

/** The points kept (none: gaps closed — a line of what there is). */
const kept = (points: readonly (number | null)[]): number[] => points.filter((p): p is number => p !== null);

// ── Lines of what tables show ─────────────────────────────────────────────

/** What a line is of: a pod's (namespace/name) or a node's (its name), its CPU or memory. */
export type LineOf = { kind: 'pods' | 'nodes'; key: string; metric: 'cpu' | 'memory' };

export interface Lines {
  /** A line's last hour, asked for (as it is drawn): none yet, or none kept. Followed where read. */
  line(of: LineOf): readonly number[] | undefined;
  stop(): void;
}

const HOUR = 3600;
const STEP = 60;
/** How many a query asks for at most (its URL's length, the answer's size). */
const BATCH = 40;
/** How soon lines not had yet are fetched; how often those had, again. */
const SOON_MS = 50;
const AGAIN_MS = 60_000;

const lineKey = ({ kind, key, metric }: LineOf) => `${kind}|${metric}|${key}`;

/** Lines of what tables show, of a keeper (its way there: followed; none, none). */
export function lines(keeper: ReadonlySignal<Keeper | null>): Lines {
  const had = signal<ReadonlyMap<string, readonly number[]>>(new Map());
  // Drawn since: not had yet (fetched soon), had (fetched again in a minute) — each its timer.
  const soon = { asked: new Map<string, LineOf>(), timer: undefined as ReturnType<typeof setTimeout> | undefined, ms: SOON_MS };
  const again = { asked: new Map<string, LineOf>(), timer: undefined as ReturnType<typeof setTimeout> | undefined, ms: AGAIN_MS };
  let stopped = false;
  const controller = new AbortController();

  const ask = (to: typeof soon, key: string, of: LineOf) => {
    to.asked.set(key, of);
    to.timer ??= setTimeout(() => {
      to.timer = undefined;
      const asked = to.asked;
      to.asked = new Map();
      void fetch(asked, to === again);
    }, to.ms);
  };

  /** Lines asked, fetched: had, kept; a query that failed, its lines asked again in a minute; again (each minute), those not drawn since let go of. */
  async function fetch(asked: Map<string, LineOf>, all: boolean) {
    const k = keeper.peek();
    // None to ask (gone meanwhile): asked again once there is (drawn again then).
    if (stopped || !k || !asked.size) return;
    const end = Math.floor(Date.now() / 1000 / STEP) * STEP;
    const start = end - HOUR;
    const queries = queriesOf([...asked.values()]);
    const got = await Promise.allSettled(queries.map(([, query]) => range(k, query, start, end, STEP, controller.signal)));
    if (stopped) return;
    const next = new Map(had.peek());
    if (all) for (const key of next.keys()) if (!asked.has(key) && !soon.asked.has(key)) next.delete(key);
    for (const [i, [of]] of queries.entries()) {
      const answer = got[i];
      for (const key of of.keys) {
        const line = { kind: of.kind, metric: of.metric, key };
        if (answer.status === 'fulfilled') next.set(lineKey(line), kept(answer.value.get(key) ?? []));
        else {
          // Failed: none for now (not asked again at once as one not had), asked again in a minute.
          if (!next.has(lineKey(line))) next.set(lineKey(line), []);
          ask(again, lineKey(line), line);
        }
      }
    }
    had.value = next;
  }

  return {
    line(of) {
      const key = lineKey(of);
      const line = had.value.get(key);
      if (keeper.value && !stopped) ask(line ? again : soon, key, of);
      return line && line.length > 1 ? line : undefined;
    },
    stop() {
      stopped = true;
      clearTimeout(soon.timer);
      clearTimeout(again.timer);
      controller.abort();
    },
  };
}

/** The queries of lines asked: of a kind and metric, a namespace's pods (or the nodes) so many at a time. */
export function queriesOf(asked: readonly LineOf[]): [{ kind: 'pods' | 'nodes'; metric: 'cpu' | 'memory'; keys: string[] }, string][] {
  const groups = new Map<string, { kind: 'pods' | 'nodes'; metric: 'cpu' | 'memory'; namespace: string; keys: string[] }>();
  for (const a of asked) {
    const namespace = a.kind === 'pods' ? a.key.split('/')[0] : '';
    const g = `${a.kind}|${a.metric}|${namespace}`;
    const group = groups.get(g) ?? { kind: a.kind, metric: a.metric, namespace, keys: [] };
    group.keys.push(a.key);
    groups.set(g, group);
  }
  const out: [{ kind: 'pods' | 'nodes'; metric: 'cpu' | 'memory'; keys: string[] }, string][] = [];
  for (const { kind, metric, namespace, keys } of groups.values()) {
    for (let i = 0; i < keys.length; i += BATCH) {
      const some = keys.slice(i, i + BATCH);
      const names = some.map((k) => exact(kind === 'pods' ? k.slice(namespace.length + 1) : k)).join('|');
      const at = `namespace=${quoted(namespace)},pod=~${quoted(names)},${CONTAINERS}`;
      const query =
        kind === 'nodes'
          ? byNode(nodeSeries(metric, windowOf(STEP)), `=~${quoted(names)}`)
          : metric === 'cpu'
            ? `sum by (namespace,pod) (rate(container_cpu_usage_seconds_total{${at}}[${windowOf(STEP)}]))`
            : `sum by (namespace,pod) (container_memory_working_set_bytes{${at}})`;
      out.push([{ kind, metric, keys: some }, query]);
    }
  }
  return out;
}
