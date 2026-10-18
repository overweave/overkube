import { type Answer, defineAddon, type Found, forKinds, slots } from '@overkube/sdk';
import { fill } from '@overkube/sdk/preact';
import { computed, type ReadonlySignal, signal, untracked } from '@preact/signals';
import { addColumns } from './columns.tsx';
import { type Keeper, type Lines, lines } from './history.ts';
import { FIELDS } from './kinds.ts';
import { addOverview } from './overview.tsx';
import { MetricsTab, TABBED } from './tab.tsx';
import { T } from './texts.ts';

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

/** What its parts share: whether metrics-server answers (metrics.k8s.io served: undefined till known), where history is kept (none: nowhere found), the lines of it. */
export interface Metrics {
  now(): boolean | undefined;
  readonly keeper: ReadonlySignal<Keeper | null>;
  readonly lines: Lines;
}

/** How long its columns wait for where history is (not known yet) before they are drawn without it. */
const SETTLE_MS = 3000;

/** Where history is kept, as it is looked for — the first found, the one asked. */
const KEEPERS: [string, Found][] = [
  ['VictoriaMetrics', { service: ['vmsingle-*', '*-victoria-metrics-single-server'] }],
  ['Prometheus', { service: ['prometheus', 'prometheus-operated', 'prometheus-server', '*-prometheus', '*-prometheus-server'], port: 9090 }],
];

const answers: Answer[] = [{ title: 'metrics-server', when: { available: 'v1beta1.metrics.k8s.io' } }, ...KEEPERS.map(([title, found]) => ({ title, when: { found } }))];

export default defineAddon({
  id: 'metrics',
  title: 'Metrics',
  description: 'What pods and nodes use: now (metrics-server), and over time where VictoriaMetrics or Prometheus keeps it.',
  answers,
  setup({ contributor: c, cluster, effect, onDispose, using }) {
    const fallback = { fallback: true };
    for (const [name, spec] of Object.entries(FIELDS)) c.add('Field', name, spec);
    c.add('Messages', 'en:metrics', { messages: {} }, fallback);

    // Where history is kept: the first found (none: none) — the way there made once for each.
    let made: Keeper | null = null;
    const keeper = computed<Keeper | null>(() => {
      for (const [title, spec] of KEEPERS) {
        const target = cluster.found(spec);
        if (!target) continue;
        if (made?.title !== title || JSON.stringify(made.target) !== JSON.stringify(target)) made = { title, target, reach: cluster.proxy(target) };
        return made;
      }
      return null;
    });
    const history = lines(keeper);
    onDispose(() => history.stop());
    const metrics: Metrics = { now: () => cluster.served('metrics.k8s.io'), keeper, lines: history };

    // Its columns as wide as they draw: a line beside the number where history is kept — added once that is known (or not soon), not drawn narrow first.
    const settled = signal(false);
    const settling = setTimeout(() => {
      settled.value = true;
    }, SETTLE_MS);
    onDispose(() => clearTimeout(settling));
    effect(() => {
      const wide = keeper.value !== null;
      const known = wide || settled.value || KEEPERS.every(([, spec]) => cluster.found(spec) !== undefined);
      if (known) untracked(() => addColumns(c, metrics, wide));
    });
    addOverview(c, metrics);
    c.add('ResourceTab', 'metrics', { target: forKinds(...TABBED), title: T.tab.title, icon: 'activity', order: 850 });
    c.add('Fill', 'metrics.resource.view.metrics', fill(slots.resource.view.tab('metrics'), { render: (p) => <MetricsTab {...p} metrics={metrics} /> }));
    c.add('Slot', slots.resource.view.tab('metrics').name, {}, fallback);

    // What it uses, said in Settings (by name: terms).
    effect(() => {
      const k = keeper.value;
      const said = [k && `${k.title} over time`, metrics.now() && 'metrics-server now'].filter(Boolean).join(', ');
      using(said || undefined);
    });
  },
});
