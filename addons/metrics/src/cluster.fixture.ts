import { kinds } from '@overkube/kube-types';
import { type FakeCluster, make } from '@overkube/testkit';
import { NodeMetrics, PodMetrics } from './kinds.ts';

/*
 * A cluster the metrics addon's tests and stories draw: a node, a few pods
 * (their requests and limits), what metrics-server says of them now — and,
 * with history, a VictoriaMetrics in monitoring that answers the query API:
 * an hour of each pod's and node's CPU and memory (its shape steady, a
 * leak, a spike), its throttling and network.
 */

const { Pod, Node, Namespace, Service } = kinds.core.v1;

export const METRICS_KINDS = [PodMetrics, NodeMetrics];

type Shape = 'flat' | 'rise' | 'spike' | 'wave';

/** A pod: its CPU (cores) and memory (bytes) now, its requests and limits (as written), how its hour went. */
type PodOf = [name: string, namespace: string, cpu: number, memory: number, resources: { requests?: Record<string, string>; limits?: Record<string, string> }, shape: Shape];

const MI = 1024 ** 2;

export const PODS: PodOf[] = [
  ['api-7f9c-x2kqp', 'shop', 0.412, 460 * MI, { requests: { cpu: '250m', memory: '256Mi' }, limits: { cpu: '500m', memory: '512Mi' } }, 'rise'],
  ['web-7d4b9-q7m4z', 'shop', 0.096, 182 * MI, { requests: { cpu: '100m', memory: '128Mi' }, limits: { cpu: '200m', memory: '256Mi' } }, 'wave'],
  ['db-0', 'shop', 0.038, 1240 * MI, { requests: { cpu: '500m', memory: '1Gi' } }, 'flat'],
  ['coredns-75c7b7f4-b9mgn', 'kube-system', 0.004, 21 * MI, { requests: { cpu: '100m', memory: '70Mi' }, limits: { memory: '170Mi' } }, 'spike'],
];

/** A range as it went (so many points, ending at now's value): steady, a leak, a spike, waves. */
export function hour(now: number, shape: Shape, points = 61): number[] {
  return Array.from({ length: points }, (_, n) => {
    const t = n / (points - 1);
    const i = t * 60;
    const by: Record<Shape, number> = {
      flat: 1 + 0.03 * Math.sin(i / 3),
      rise: 0.55 + 0.45 * t,
      spike: 1 + (Math.abs(i - 38) < 4 ? 1.4 * (1 - Math.abs(i - 38) / 4) : 0),
      wave: 1 + 0.25 * Math.sin(i / 6),
    };
    return Math.max(0, now * by[shape]);
  });
}

export const VM = { kind: 'service', namespace: 'monitoring', name: 'vmsingle-main', port: 8428 } as const;

/** What the query API answers of a query: each pod's (or node's) series it names, of what it asks for, every step of the range. */
function answerOf(query: string, start: number, end: number, step: number) {
  const count = Math.floor((end - start) / step) + 1;
  const pods = /pod=~?"([^"]+)"/.exec(query)?.[1]?.split('|') ?? [];
  const node = /node=~?"([^"]+)"/.exec(query)?.[1];
  const memory = query.includes('memory');
  const result = [
    ...PODS.filter(([name]) => pods.includes(name.replaceAll('.', '\\.'))).map(([name, namespace, cpu, mem, , shape]) => {
      const now = query.includes('throttled') ? 12 : query.includes('network') ? 22 * 1024 : memory ? mem : cpu;
      return { metric: query.includes('by (') ? { namespace, pod: name } : {}, values: hour(now, shape, count) };
    }),
    ...(node ? [{ metric: query.includes('by (') ? { node } : {}, values: hour(memory ? 9.8 * 1024 ** 3 : 2.14, 'wave', count) }] : []),
  ];
  return {
    status: 'success',
    data: { resultType: 'matrix', result: result.map((s) => ({ metric: s.metric, values: s.values.map((v, i) => [start + i * step, String(v)]) })) },
  };
}

/** The cluster: its node and pods, metrics-server's of them (now: none, metrics-server says nothing); with history, VictoriaMetrics answering. */
export function metricsCluster(c: FakeCluster, { history = true, now = true }: { history?: boolean; now?: boolean } = {}) {
  c.add(Node, make(Node, { metadata: { name: 'kube-1' }, status: { allocatable: { cpu: '8', memory: '32Gi', pods: '110' }, capacity: { cpu: '8', memory: '32Gi' } } }));
  if (now) c.add(NodeMetrics, { apiVersion: 'metrics.k8s.io/v1beta1', kind: 'NodeMetrics', metadata: { name: 'kube-1' }, usage: { cpu: '2140m', memory: '9800Mi' } } as never);
  for (const ns of ['shop', 'kube-system']) c.add(Namespace, make(Namespace, { metadata: { name: ns } }));
  for (const [name, namespace, cpu, memory, resources] of PODS) {
    c.add(
      Pod,
      make(Pod, {
        metadata: { name, namespace },
        spec: { nodeName: 'kube-1', containers: [{ name: 'app', image: 'nginx:1.27', resources }] },
        status: { phase: 'Running' },
      }),
    );
    if (now)
      c.add(PodMetrics, {
        apiVersion: 'metrics.k8s.io/v1beta1',
        kind: 'PodMetrics',
        metadata: { name, namespace },
        containers: [{ name: 'app', usage: { cpu: `${Math.round(cpu * 1e9)}n`, memory: `${Math.round(memory / 1024)}Ki` } }],
      } as never);
  }
  if (!history) return;
  c.add(Namespace, make(Namespace, { metadata: { name: 'monitoring' } }));
  c.add(Service, make(Service, { metadata: { name: VM.name, namespace: VM.namespace }, spec: { ports: [{ name: 'http', port: VM.port }] } }));
  c.answer(VM, ({ path, query }) => {
    if (path !== '/api/v1/query_range') return { status: 'error', error: `no ${path}` };
    return answerOf(query.query ?? '', Number(query.start), Number(query.end), Number(query.step));
  });
}
