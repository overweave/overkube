import { type Answer, defineAddon, lazySetup } from '@overkube/sdk';
import { KEEPERS } from './keepers.ts';

/*
 * Metrics: what pods and nodes use — now, as metrics-server says it (the
 * metrics.k8s.io API: what kubectl top says), and over time where the
 * cluster keeps it (a VictoriaMetrics or a Prometheus found in it, asked
 * through the API server's service proxy as the one signed in). Either is
 * enough; what only history gives (a line, a chart) is there with it.
 *
 *   columns   CPU and memory in the pods' and nodes' tables (columns.tsx)
 *   overview  what is used of what the nodes have allocatable (under capacity); the pods using the most (overview.tsx)
 *   tab       a pod's and a node's Metrics: now, then over a range (tab.tsx)
 *
 * Off until turned on (an addon): suggested where what it answers to is found.
 */

const answers: Answer[] = [{ title: 'metrics-server', when: { available: 'v1beta1.metrics.k8s.io' } }, ...KEEPERS.map(([title, found]) => ({ title, when: { found } }))];

export default defineAddon({
  id: 'metrics',
  title: 'Metrics',
  description: 'What pods and nodes use: now (metrics-server), and over time where VictoriaMetrics or Prometheus keeps it.',
  answers,
  setup: lazySetup(() => import('./setup.tsx')),
});
