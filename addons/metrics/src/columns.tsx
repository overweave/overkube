import { kinds } from '@overkube/kube-types';
import { type CellValue, type ColumnContext, column, type KubeContributor, type Label } from '@overkube/sdk';
import { Usage } from '@overkube/uikit';
import type { Metrics } from './index.tsx';
import { F } from './kinds.ts';
import { T } from './texts.ts';
import { inScale, type Resource, said, scaleOf } from './units.ts';

/*
 * A pod's CPU and memory, a node's, in their tables (before their age):
 * what is used now (metrics-server's, joined: the tables sort by it; none,
 * the last of its history), the last hour's line before it where history
 * is kept — near its limit (a node's: what it has allocatable) a warning,
 * over it an error; what it requests and may take in its tip. As wide as
 * what it draws: a line and a number, or a number alone.
 */

const { Pod, Node } = kinds.core.v1;

const EMPTY = '—';
const WIDE = 150;
const NARROW = 90;

const num = (v: CellValue | undefined) => (typeof v === 'number' && v > 0 ? v : undefined);
/** What is used now, as metrics-server says it (0 too); none said: none. */
const now = (v: CellValue | undefined) => (typeof v === 'number' ? v : undefined);

/** A use drawn: its number in its scale (its limit in the same), its line, its tip. */
function used(
  resource: Exclude<Resource, 'rate'>,
  now: number | undefined,
  line: readonly number[] | undefined,
  { say }: ColumnContext,
  marks: [Label, number | undefined][],
  limit: number | undefined,
) {
  const value = now ?? line?.at(-1);
  if (value === undefined) return EMPTY;
  const scale = scaleOf(resource, value);
  const tip = [say(T.columns.used, { value: said(resource, value) }), ...marks.flatMap(([l, v]) => (v ? [say(l, { value: said(resource, v) })] : []))].join(' · ');
  return <Usage value={inScale(value, scale)} unit={scale.unit} {...(limit ? { limit: inScale(limit, scale) } : {})} {...(line ? { history: line } : {})} title={tip} />;
}

export function addColumns(c: KubeContributor, metrics: Metrics, wide: boolean) {
  const width = wide ? WIDE : NARROW;
  const pod = (resource: 'cpu' | 'memory') => (values: readonly CellValue[], context: ColumnContext) => {
    const key = `${values[0]}/${values[1]}`;
    const line = metrics.lines.line({ kind: 'pods', key, metric: resource });
    const [requests, limit] = [num(values[3]), num(values[4])];
    return used(
      resource,
      now(values[2]),
      line,
      context,
      [
        [T.columns.requests, requests],
        [T.columns.limit, limit],
      ],
      limit,
    );
  };
  const node = (resource: 'cpu' | 'memory') => (values: readonly CellValue[], context: ColumnContext) => {
    const key = String(values[0]);
    const line = metrics.lines.line({ kind: 'nodes', key, metric: resource });
    const allocatable = num(values[2]);
    return used(resource, now(values[1]), line, context, [[T.columns.allocatable, allocatable]], allocatable);
  };
  const of = (resource: 'cpu' | 'memory') => (resource === 'cpu' ? T.columns.cpu : T.columns.memory);
  // A node's beside its capacity's (CPU, Memory: the core's), said apart.
  const ofNode = (resource: 'cpu' | 'memory') => (resource === 'cpu' ? T.columns.cpuUsage : T.columns.memoryUsage);
  for (const [i, resource] of (['cpu', 'memory'] as const).entries()) {
    c.add(
      'Column',
      `metrics.pods.${resource}`,
      column({
        kinds: [Pod],
        header: of(resource),
        sort: resource === 'cpu' ? F.podCpu : F.podMemory,
        values: ['core.namespace', 'core.name', resource === 'cpu' ? F.podCpu : F.podMemory, `pods.v1.${resource}-requests`, `pods.v1.${resource}-limits`],
        format: pod(resource),
        width,
        order: 850 + i,
      }),
    );
    c.add(
      'Column',
      `metrics.nodes.${resource}`,
      column({
        kinds: [Node],
        header: ofNode(resource),
        sort: resource === 'cpu' ? F.nodeCpu : F.nodeMemory,
        values: ['core.name', resource === 'cpu' ? F.nodeCpu : F.nodeMemory, `nodes.v1.${resource}-allocatable`],
        format: node(resource),
        width,
        order: 850 + i,
      }),
    );
  }
}
