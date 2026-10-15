import { kinds, type ObjectOf } from '@overkube/kube-types';
import { forKinds, type KubeContributor, kindRef, type ResourceProps, section, slots } from '@overkube/sdk';
import { KindTable, useCount, useList, useSay } from '@overkube/sdk/preact';
import { KeyValue, Meter, Nothing, Notice, Section, Table } from '@overkube/uikit';
import { fill } from '@overweave/ui/preact';
import type { ComponentChildren } from 'preact';
import { useMemo } from 'preact/hooks';
import { relatedField } from '../details.tsx';
import { bytes, cores, quantity } from '../format.ts';
import { Refused, RefusedQuietly, refused } from '../refused.tsx';
import { T } from '../texts.ts';

/*
 * A node's own, in its view: what is allocated of it (what its pods ask for
 * of CPU and memory, how many pods, of what it can give — cordoned, said
 * so), what it has and gives (each resource, how much it keeps back), its
 * pods, its addresses, its taints (each
 * its key, value, effect), its system (OS, kernel, runtime, kubelet); how
 * many pods it runs among what it is tied to.
 */

const { Node, Pod } = kinds.core.v1;
type NodeObject = ObjectOf<typeof Node>;
type PodObject = ObjectOf<typeof Pod>;

/** The pods on a node (those not done: Succeeded, Failed). */
const onNode = (name: string) => ({
  op: 'and' as const,
  args: [
    { field: 'pods.v1.node', op: 'eq' as const, value: name },
    { field: 'pods.v1.phase', op: 'in' as const, values: ['Pending', 'Running', 'Unknown'] },
  ],
});

/**
 * What a pod asks for of a resource, as the scheduler counts it: its own
 * request where it says one (pod-level resources) — else its containers'
 * and its sidecars' (init containers that keep running) together, or, where
 * more, what it asks while one of its init containers runs (that one's,
 * and the sidecars started before it); and its overhead (its runtime
 * class's) on top.
 */
export function asks(pod: PodObject, resource: 'cpu' | 'memory'): number {
  const of = (c: { resources?: { requests?: Record<string, unknown> } } | undefined) => quantity(c?.resources?.requests?.[resource] as string) || 0;
  const overhead = quantity(pod.spec?.overhead?.[resource] as string) || 0;
  const own = (pod.spec as { resources?: { requests?: Record<string, unknown> } } | undefined)?.resources;
  if (own?.requests?.[resource] !== undefined) return of(pod.spec as { resources?: { requests?: Record<string, unknown> } }) + overhead;
  let sidecars = 0;
  let starting = 0;
  for (const c of pod.spec?.initContainers ?? []) {
    if (c.restartPolicy === 'Always') sidecars += of(c);
    starting = Math.max(starting, sidecars + (c.restartPolicy === 'Always' ? 0 : of(c)));
  }
  const running = (pod.spec?.containers ?? []).reduce((sum, c) => sum + of(c), 0) + sidecars;
  return Math.max(running, starting) + overhead;
}

/** What is allocated of it (the core's section): its pods' requests of CPU and memory, how many pods — each of what it can give. */
export function Allocated({ object }: ResourceProps) {
  const say = useSay();
  const t = T.resource.view.node;
  const node = object as NodeObject;
  const answer = useList<PodObject>({ kind: kindRef(Pod), where: onNode(node.metadata?.name ?? ''), page: { offset: 0, limit: 1000 } });
  const pods = useMemo(() => answer.items.flatMap((i) => (i.object ? [i.object] : [])), [answer.items]);
  const can = node.status?.allocatable ?? {};
  const [cpu, memory] = [quantity(can.cpu as string), quantity(can.memory as string)];
  const asked = useMemo(() => ({ cpu: pods.reduce((a, p) => a + asks(p, 'cpu'), 0), memory: pods.reduce((a, p) => a + asks(p, 'memory'), 0) }), [pods]);
  const most = quantity(can.pods as string);
  // Its pods not to be had (or some of them): said so, not counted as none.
  if (refused(answer))
    return (
      <Section title={say(t.allocated)} part="allocated">
        <Refused kind={Pod} error={answer.error} />
      </Section>
    );
  return (
    <Section title={say(t.allocated)} part="allocated">
      {node.spec?.unschedulable && (
        <Notice level="warn" icon="ban">
          {say(t.cordoned)}
        </Notice>
      )}
      {answer.state === 'partial' && (
        <Notice level="warn" icon="shield">
          {say(T.kind.table.partial, { namespaces: answer.coverage.denied.join(', ') })}
        </Notice>
      )}
      <dl class="uk-fields">
        <Meter label={say(t.cpu)} value={asked.cpu} of={cpu}>
          {say(t.of, { value: cores(asked.cpu), all: Number.isNaN(cpu) ? '—' : cores(cpu) })}
        </Meter>
        <Meter label={say(t.memory)} value={asked.memory} of={memory}>
          {say(t.of, { value: bytes(asked.memory), all: Number.isNaN(memory) ? '—' : bytes(memory) })}
        </Meter>
        <Meter label={say(t.pods)} value={pods.length} of={most}>
          {say(t.of, { value: String(pods.length), all: Number.isNaN(most) ? '—' : String(most) })}
        </Meter>
      </dl>
    </Section>
  );
}

/** The resources a node says first, as kubectl's describe has them; the rest by name after. */
const FIRST = ['cpu', 'memory', 'pods', 'ephemeral-storage'];

/** How much of a resource a node keeps back (for its system, for eviction): what it has less what it gives — CPU in cores, sizes in bytes, the rest a count. */
export function keptBack(resource: string, capacity: unknown, allocatable: unknown): string {
  const [has, gives] = [quantity(capacity as string), quantity(allocatable as string)];
  if (Number.isNaN(has) || Number.isNaN(gives)) return '—';
  const kept = has - gives;
  return resource === 'cpu' ? cores(kept) : resource === 'memory' || resource === 'ephemeral-storage' || resource.startsWith('hugepages-') ? bytes(kept) : String(kept);
}

/** What it has and what it gives pods (the core's section, where it says): each resource, how much it keeps back. */
export function Capacity({ object }: ResourceProps) {
  const say = useSay();
  const t = T.resource.view.node;
  const { capacity = {}, allocatable = {} } = (object as NodeObject).status ?? {};
  const rank = (r: string) => (FIRST.includes(r) ? FIRST.indexOf(r) : FIRST.length);
  const resources = [...new Set([...Object.keys(capacity), ...Object.keys(allocatable)])].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const mono = (v: unknown) => <span class="uk-mono">{v === undefined ? '—' : String(v)}</span>;
  return (
    <Section title={say(t.capacity)} part="capacity">
      <Table
        plain
        rows={resources}
        rowKey={(r) => r}
        columns={[
          { id: 'resource', header: say(t.resource), width: 'minmax(140px, 2fr)', cell: (r) => <span class="uk-mono">{r}</span> },
          { id: 'capacity', header: say(t.capacity), width: 'minmax(72px, 1fr)', cell: (r) => mono(capacity[r]) },
          { id: 'allocatable', header: say(t.allocatable), width: 'minmax(72px, 1fr)', cell: (r) => mono(allocatable[r]) },
          { id: 'kept', header: say(t.keptBack), width: 'minmax(72px, 1fr)', cell: (r) => mono(keptBack(r, capacity[r], allocatable[r])) },
        ]}
      />
    </Section>
  );
}

/** The pods on it (the core's section): a table of them, as the pods' own — in every namespace. */
export function Pods({ object }: ResourceProps) {
  const say = useSay();
  return (
    <Section title={say(T.resource.view.node.pods)} part="pods">
      <KindTable kind={Pod} where={onNode(object.metadata?.name ?? '')} scope="all" plain />
    </Section>
  );
}

/** Its addresses (the core's section, where it has them): each its type, its address. */
export function Addresses({ object }: ResourceProps) {
  const say = useSay();
  const addresses = (object as NodeObject).status?.addresses ?? [];
  return (
    <Section title={say(T.resource.view.node.addresses)} part="addresses">
      <KeyValue rows={addresses.map((a): [string, ComponentChildren] => [a.type, <span class="uk-mono">{a.address}</span>])} />
    </Section>
  );
}

/** Its taints (the core's section): each its key, value (none: said so), effect — one line each; none, said so. */
export function Taints({ object }: ResourceProps) {
  const say = useSay();
  const t = T.resource.view.node;
  const taints = (object as NodeObject).spec?.taints ?? [];
  return (
    <Section title={say(t.taints)} part="taints">
      {taints.length === 0 && <Nothing icon="shield">{say(t.noTaints)}</Nothing>}
      {taints.length > 0 && (
        <Table
          plain
          rows={taints}
          rowKey={(x) => `${x.key}:${x.effect}`}
          columns={[
            { id: 'key', header: say(t.key), width: 'minmax(160px, 2fr)', cell: (x) => <span class="uk-mono">{x.key}</span> },
            {
              id: 'value',
              header: say(t.value),
              width: 'minmax(72px, 1fr)',
              cell: (x) => (x.value ? <span class="uk-mono">{x.value}</span> : <span class="uk-quiet">{say(t.noValue)}</span>),
            },
            { id: 'effect', header: say(t.effect), width: 'minmax(96px, 1fr)', cell: (x) => x.effect },
          ]}
        />
      )}
    </Section>
  );
}

/** Its system (the core's section): its OS (and architecture, image), kernel, container runtime, kubelet. */
export function System({ object }: ResourceProps) {
  const say = useSay();
  const t = T.resource.view.node;
  const info = (object as NodeObject).status?.nodeInfo;
  const mono = (text: string | undefined) => (text ? <span class="uk-mono">{text}</span> : undefined);
  return (
    <Section title={say(t.system)} part="system">
      <KeyValue
        rows={[
          [
            say(t.os),
            [info?.operatingSystem && info.architecture ? `${info.operatingSystem}/${info.architecture}` : undefined, info?.osImage].filter(Boolean).join(', ') || undefined,
          ],
          [say(t.kernel), mono(info?.kernelVersion)],
          [say(t.runtime), mono(info?.containerRuntimeVersion)],
          [say(t.kubelet), mono(info?.kubeletVersion)],
        ]}
      />
    </Section>
  );
}

/** How many pods it runs (the core's related field). */
function Runs({ name }: { name: string }) {
  const say = useSay();
  const count = useCount({ kind: kindRef(Pod), where: onNode(name) });
  if (refused(count)) return <RefusedQuietly kind={Pod} error={count.error} />;
  return <>{count.total ? say(T.resource.view.node.podCount, { count: count.total.count }) : '—'}</>;
}

/** A node's in the core's view: what is allocated of it, its taints, its system; how many pods it runs among what it is tied to. */
export function addNode(c: KubeContributor): void {
  c.add('Fill', 'core.resource.view.node.allocated', section({ kinds: [Node], order: 10, render: Allocated }));
  c.add('Fill', 'core.resource.view.node.capacity', section({ kinds: [Node], order: 12, when: ({ object }) => object.status?.capacity !== undefined, render: Capacity }));
  c.add('Fill', 'core.resource.view.node.pods', section({ kinds: [Node], order: 15, render: Pods }));
  c.add('Fill', 'core.resource.view.node.addresses', section({ kinds: [Node], order: 18, when: ({ object }) => (object.status?.addresses?.length ?? 0) > 0, render: Addresses }));
  c.add('Fill', 'core.resource.view.node.taints', section({ kinds: [Node], order: 20, render: Taints }));
  c.add('Fill', 'core.resource.view.node.system', section({ kinds: [Node], order: 30, when: ({ object }) => object.status?.nodeInfo !== undefined, render: System }));
  c.add(
    'Fill',
    'core.resource.view.related.node.runs',
    fill(slots.resource.view.related, {
      order: 200,
      target: forKinds(Node),
      render: relatedField<NodeObject>('runs', T.resource.view.node.runs, (n) => [<Runs name={n.metadata?.name ?? ''} />, '']),
    }),
  );
}
