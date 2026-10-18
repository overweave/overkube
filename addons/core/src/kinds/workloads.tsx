import { type KubeObject, kinds, type ObjectOf } from '@overkube/kube-types';
import type { Where } from '@overkube/query';
import { type KubeContributor, kindRef, type ResourceProps, section } from '@overkube/sdk';
import { KindTable, ObjectRef, useCount, useList, useSay } from '@overkube/sdk/preact';
import { KeyValue, Nothing, Section, Table } from '@overkube/uikit';
import type { ComponentChildren } from 'preact';
import { useMemo } from 'preact/hooks';
import { Refused, refused } from '../refused.tsx';
import { T } from '../texts.ts';
import { Containers, specOf } from './pod.tsx';
import { addRelated, pickingLink, type Selector } from './shared.tsx';

/*
 * A workload's own, in its view: its pods (a table of them, as the pods'
 * own: those its selector picks, its labels and expressions — a replica
 * set's and a job's, those it owns), its pod template (each container: its image, what it asks for),
 * a deployment's rollout (its replica sets), a stateful set's volume claim
 * templates, a cron job's jobs; its selector (its labels, its expressions)
 * among what it is tied to.
 */

const { Pod, Node } = kinds.core.v1;
const { Deployment, StatefulSet, DaemonSet, ReplicaSet } = kinds.apps.v1;
const { Job, CronJob } = kinds.batch.v1;

type PodTemplate = NonNullable<ObjectOf<typeof Deployment>['spec']>['template'];
type Workload = KubeObject & { spec?: { replicas?: number; selector?: Selector; template?: PodTemplate } };

/**
 * The objects a label selector picks, as a query's where: each of its
 * labels (key=value), each of its expressions (In, NotIn: of key=value;
 * Exists, DoesNotExist: of its keys) — all of them holding. None of either:
 * none (it picks every object, as no workload's selector may).
 */
export function pickedBy(selector: Selector | undefined): Where | undefined {
  const label = (k: string, v: string) => `${k}=${v}`;
  const has = (key: string): Where => ({ field: 'core.label.keys', op: 'eq', value: key });
  const args: Where[] = [
    ...Object.entries(selector?.matchLabels ?? {}).map(([k, v]): Where => ({ field: 'core.labels', op: 'eq', value: label(k, v) })),
    ...(selector?.matchExpressions ?? []).map(({ key, operator, values = [] }): Where => {
      const any: Where = { field: 'core.labels', op: 'in', values: values.map((v) => label(key, v)) };
      if (operator === 'In') return any;
      if (operator === 'NotIn') return { op: 'not', arg: any };
      if (operator === 'Exists') return has(key);
      if (operator === 'DoesNotExist') return { op: 'not', arg: has(key) };
      // An operator not known: nothing picked, rather than more than it means.
      return { op: 'or', args: [] };
    }),
  ];
  return args.length ? { op: 'and', args } : undefined;
}

/** The objects an object owns (its uid among their owners'). */
export const ownedBy = (object: KubeObject): Where => ({ field: 'core.owner.uid', op: 'eq', value: object.metadata?.uid ?? '' });

/** Some objects of a kind, in its namespace: a table of them as their kind's own, framed by the section. */
function Of({ kind, where, object }: { kind: typeof Pod | typeof ReplicaSet | typeof Job; where: Where; object: KubeObject }) {
  const namespace = object.metadata?.namespace;
  return <KindTable kind={kind} where={where} {...(namespace ? { scope: { namespaces: [namespace] } } : {})} plain />;
}

/** Its pods (the core's section): those its selector picks — a replica set's, a job's (or one with no selector): those it owns; none wanted (scaled to zero), said so, those still there under it. */
export function Pods({ kind, object }: ResourceProps) {
  const say = useSay();
  const owns = kind.id === ReplicaSet.id || kind.id === Job.id;
  const where = (owns ? undefined : pickedBy((object as Workload).spec?.selector)) ?? ownedBy(object);
  // None wanted (scaled to zero): said so — those still there (going, held by a finalizer) shown under it.
  const none = (object as Workload).spec?.replicas === 0;
  return (
    <Section title={say(T.resource.view.workload.pods)} part="pods">
      {none ? <Left where={where} object={object} /> : <Of kind={Pod} where={where} object={object} />}
    </Section>
  );
}

/** None wanted (scaled to zero): said so — the pods still there (going, held by a finalizer) under it. */
function Left({ where, object }: { where: Where; object: KubeObject }) {
  const say = useSay();
  const namespace = object.metadata?.namespace;
  const left = useCount({ kind: kindRef(Pod), ...(namespace ? { scope: { namespaces: [namespace] } } : {}), where }).total?.count ?? 0;
  return (
    <>
      <Nothing icon="sleep">{say(T.resource.view.workload.noneWanted)}</Nothing>
      {left > 0 && <Of kind={Pod} where={where} object={object} />}
    </>
  );
}

/** Its pod template (the core's sections): its containers as a pod's are drawn (resource.view.pod.container's), with no state — what each would run. */
export const Template = Containers;

/** A deployment's rollout (the core's section): its replica sets, as theirs — the one rolled out and those before it. */
export function Rollout({ object }: ResourceProps) {
  const say = useSay();
  return (
    <Section title={say(T.resource.view.workload.rollout)} part="rollout">
      <Of kind={ReplicaSet} where={ownedBy(object)} object={object} />
    </Section>
  );
}

/** A stateful set's volume claim templates (the core's section, where it has them): each pod's own claim — its name, size, class, access. */
export function Claims({ object }: ResourceProps) {
  const say = useSay();
  const t = T.resource.view.workload;
  const claims = (object as ObjectOf<typeof StatefulSet>).spec?.volumeClaimTemplates ?? [];
  return (
    <Section title={say(t.claims)} part="claims">
      <Table
        plain
        rows={claims}
        rowKey={(c) => c.metadata?.name ?? ''}
        columns={[
          { id: 'name', header: say(t.claim), width: 'minmax(120px, 2fr)', cell: (c) => c.metadata?.name },
          { id: 'size', header: say(t.size), width: 'minmax(72px, 1fr)', cell: (c) => <span class="uk-mono">{String(c.spec?.resources?.requests?.storage ?? '—')}</span> },
          { id: 'class', header: say(t.class), width: 'minmax(72px, 1fr)', cell: (c) => c.spec?.storageClassName ?? '—' },
          { id: 'access', header: say(t.access), width: 'minmax(72px, 1fr)', cell: (c) => (c.spec?.accessModes ?? []).join(', ') || '—' },
        ]}
      />
    </Section>
  );
}

type DeploymentSpec = NonNullable<ObjectOf<typeof Deployment>['spec']>;

/** A count of pods a rollout may take (a number, or a percent of its replicas: rounded up for more, down for fewer). */
export function podsOf(value: number | string, replicas: number, up: boolean): number {
  if (typeof value === 'number') return value;
  const share = (Number.parseFloat(value) / 100) * replicas;
  return up ? Math.ceil(share) : Math.floor(share);
}

/** A deployment's rollout strategy (the core's section): rolling, how many over and how few kept up (what each comes to); recreate, said so — how long a pod must be ready, how long it waits, how many revisions it keeps. */
export function Strategy({ object }: ResourceProps) {
  const say = useSay();
  const t = T.resource.view.workload;
  const spec: Partial<DeploymentSpec> = (object as ObjectOf<typeof Deployment>).spec ?? {};
  const replicas = spec.replicas ?? 1;
  const rolling = spec.strategy?.rollingUpdate;
  const surge = rolling?.maxSurge ?? '25%';
  const unavailable = rolling?.maxUnavailable ?? '25%';
  const line = (value: string, quiet: string) => (
    <span class="uk-line">
      <span>{value}</span>
      <span class="uk-quiet">{quiet}</span>
    </span>
  );
  const rows: [string, ComponentChildren][] = [
    ...(spec.strategy?.type === 'Recreate'
      ? [[say(t.strategy), line(say(t.recreate), say(t.recreateMeans))] as [string, ComponentChildren]]
      : [
          [say(t.maxSurge), line(String(surge), say(t.surgeMeans, { count: String(podsOf(surge, replicas, true)), replicas: String(replicas) }))] as [string, ComponentChildren],
          [say(t.maxUnavailable), line(String(unavailable), say(t.keptMeans, { kept: String(replicas - podsOf(unavailable, replicas, false)), replicas: String(replicas) }))] as [
            string,
            ComponentChildren,
          ],
        ]),
    [say(t.readyAfter), `${spec.minReadySeconds ?? 0}s`],
    [say(t.givesUpAfter), `${spec.progressDeadlineSeconds ?? 600}s`],
    [say(t.revisionsKept), String(spec.revisionHistoryLimit ?? 10)],
  ];
  return (
    <Section title={say(t.strategy)} part="strategy">
      <KeyValue rows={rows} />
    </Section>
  );
}

/** A stateful set's or a daemon set's update strategy (the core's section): rolling — a stateful set's partition, how many may be unavailable (a daemon set's surge too) — or on delete, said so; how its pods are managed, how long one must be ready, how many revisions it keeps, what becomes of its claims. */
export function UpdateStrategy({ kind, object }: ResourceProps) {
  const say = useSay();
  const t = T.resource.view.workload;
  const set = kind.id === StatefulSet.id;
  const spec = (object as ObjectOf<typeof StatefulSet> | ObjectOf<typeof DaemonSet>).spec;
  const strategy = spec?.updateStrategy;
  const rolling = strategy?.rollingUpdate as { partition?: number; maxUnavailable?: number | string; maxSurge?: number | string } | undefined;
  const line = (value: string, quiet: string) => (
    <span class="uk-line">
      <span>{value}</span>
      <span class="uk-quiet">{quiet}</span>
    </span>
  );
  const sts = spec as ObjectOf<typeof StatefulSet>['spec'];
  const retention = set ? sts?.persistentVolumeClaimRetentionPolicy : undefined;
  const rows: [string, ComponentChildren][] = [
    ...(strategy?.type === 'OnDelete'
      ? [[say(t.strategy), line('OnDelete', say(t.onDeleteMeans))] as [string, ComponentChildren]]
      : [
          ...(set ? [[say(t.partition), line(String(rolling?.partition ?? 0), say(t.partitionMeans, { n: String(rolling?.partition ?? 0) }))] as [string, ComponentChildren]] : []),
          [say(t.maxUnavailable), String(rolling?.maxUnavailable ?? 1)] as [string, ComponentChildren],
          ...(set ? [] : [[say(t.maxSurge), String(rolling?.maxSurge ?? 0)] as [string, ComponentChildren]]),
        ]),
    ...(set ? [[say(t.podManagement), sts?.podManagementPolicy ?? 'OrderedReady'] as [string, ComponentChildren]] : []),
    [say(t.readyAfter), `${spec?.minReadySeconds ?? 0}s`],
    [say(t.revisionsKept), String(spec?.revisionHistoryLimit ?? 10)],
    ...(retention
      ? [
          [say(t.retention), <span class="uk-mono">{`whenDeleted: ${retention.whenDeleted ?? 'Retain'} · whenScaled: ${retention.whenScaled ?? 'Retain'}`}</span>] as [
            string,
            ComponentChildren,
          ],
        ]
      : []),
  ];
  return (
    <Section title={say(t.strategy)} part="strategy">
      <KeyValue rows={rows} />
    </Section>
  );
}

type FailureRule = NonNullable<NonNullable<NonNullable<ObjectOf<typeof Job>['spec']>['podFailurePolicy']>['rules']>[number];

/** A pod failure policy rule's condition, as the API names it: its exit codes (of a container, or any), or its pod conditions. */
export const failureRuleOf = (r: FailureRule) =>
  r.onExitCodes
    ? `onExitCodes: ${r.onExitCodes.containerName ? `${r.onExitCodes.containerName} ` : ''}${r.onExitCodes.operator} (${r.onExitCodes.values.join(', ')})`
    : `onPodConditions: ${(r.onPodConditions ?? []).map((c) => `${c.type}=${c.status ?? 'True'}`).join(', ')}`;

/** A job's pod failure policy (the core's section, where it has one): each rule, its action and condition, in order. */
export function PodFailurePolicy({ object }: ResourceProps) {
  const say = useSay();
  const t = T.resource.view.workload;
  const rules = (object as ObjectOf<typeof Job>).spec?.podFailurePolicy?.rules ?? [];
  return (
    <Section title={say(t.podFailurePolicy)} part="failure-policy">
      <Table
        plain
        rows={rules.map((rule, i) => ({ i, rule }))}
        rowKey={(r) => String(r.i)}
        columns={[
          { id: 'action', header: say(t.action), width: 'minmax(96px, 1fr)', cell: (r) => r.rule.action },
          { id: 'rule', header: say(t.rule), width: 'minmax(200px, 3fr)', cell: (r) => <span class="uk-mono">{failureRuleOf(r.rule)}</span> },
        ]}
      />
    </Section>
  );
}

type NodeObject = ObjectOf<typeof Node>;
type PodSpec = NonNullable<ObjectOf<typeof Pod>['spec']>;
type Taint = NonNullable<NonNullable<NodeObject['spec']>['taints']>[number];
type Term = NonNullable<NonNullable<NonNullable<PodSpec['affinity']>['nodeAffinity']>['requiredDuringSchedulingIgnoredDuringExecution']>['nodeSelectorTerms'][number];

/** The tolerations a daemon set's controller gives its pods (each key, its effect): a node not ready, unreachable (NoExecute); short of disk, memory, pids, cordoned (NoSchedule) — the network not up, to those on the host's network only. */
export function daemonTolerations(spec: Partial<PodSpec> | undefined): NonNullable<PodSpec['tolerations']> {
  const of = (key: string, effect: 'NoExecute' | 'NoSchedule') => ({ key: `node.kubernetes.io/${key}`, operator: 'Exists' as const, effect });
  return [
    of('not-ready', 'NoExecute'),
    of('unreachable', 'NoExecute'),
    ...['disk-pressure', 'memory-pressure', 'pid-pressure', 'unschedulable'].map((k) => of(k, 'NoSchedule')),
    ...(spec?.hostNetwork ? [of('network-unavailable', 'NoSchedule')] : []),
  ];
}

/** Whether pods may be on a node despite a taint: a preference only, or tolerated (a toleration of its key — any, with Exists and no key — its value, its effect or any). */
export function tolerates(tolerations: PodSpec['tolerations'], taint: Taint): boolean {
  if (taint.effect === 'PreferNoSchedule') return true;
  return (tolerations ?? []).some(
    (x) => (!x.effect || x.effect === taint.effect) && (x.operator === 'Exists' ? !x.key || x.key === taint.key : x.key === taint.key && (x.value ?? '') === (taint.value ?? '')),
  );
}

type Requirement = NonNullable<Term['matchExpressions']>[number];

/** Whether a value holds to a requirement (In, NotIn, Exists, DoesNotExist, Gt, Lt). */
function meets({ operator, values = [] }: Requirement, v: string | undefined): boolean {
  if (operator === 'In') return v !== undefined && values.includes(v);
  if (operator === 'NotIn') return v === undefined || !values.includes(v);
  if (operator === 'Exists') return v !== undefined;
  if (operator === 'DoesNotExist') return v === undefined;
  if (operator === 'Gt' || operator === 'Lt') return v !== undefined && (operator === 'Gt' ? Number(v) > Number(values[0]) : Number(v) < Number(values[0]));
  return false;
}

/** Whether a node holds to a node selector term: each of its expressions (of its labels), each of its fields (its name, the one field there is); an empty term picks none. */
function holds(term: Term, node: NodeObject): boolean {
  const labels = node.metadata?.labels ?? {};
  const fields: Record<string, string | undefined> = { 'metadata.name': node.metadata?.name };
  if (!term.matchExpressions?.length && !term.matchFields?.length) return false;
  return (term.matchExpressions ?? []).every((r) => meets(r, labels[r.key])) && (term.matchFields ?? []).every((r) => meets(r, fields[r.key]));
}

/** Why a daemon set's pod is not on a node: its node selector or its affinity does not pick it, or a taint keeps it off; none of these (a pod still to come): undefined. */
export function whyNot(spec: Partial<PodSpec> | undefined, node: NodeObject): { reason: 'selector' | 'affinity' } | { reason: 'taint'; taint: string } | undefined {
  const labels = node.metadata?.labels ?? {};
  if (Object.entries(spec?.nodeSelector ?? {}).some(([k, v]) => labels[k] !== v)) return { reason: 'selector' };
  const terms = spec?.affinity?.nodeAffinity?.requiredDuringSchedulingIgnoredDuringExecution?.nodeSelectorTerms;
  if (terms?.length && !terms.some((term) => holds(term, node))) return { reason: 'affinity' };
  const given = [...(spec?.tolerations ?? []), ...daemonTolerations(spec)];
  const taint = (node.spec?.taints ?? []).find((x) => !tolerates(given, x));
  if (taint) return { reason: 'taint', taint: `${taint.key}${taint.value ? `=${taint.value}` : ''}:${taint.effect}` };
  return undefined;
}

/** The nodes a daemon set is not on (the core's section, where there are any): each, why — its selector, its affinity, a taint; or a pod still to come. Its nodes or pods not to be had: nothing said. */
export function NotOn({ object }: ResourceProps) {
  const say = useSay();
  const t = T.resource.view.workload;
  const namespace = object.metadata?.namespace;
  const nodes = useList<NodeObject>({ kind: kindRef(Node), page: { offset: 0, limit: 500 } });
  const pods = useList<ObjectOf<typeof Pod>>({
    kind: kindRef(Pod),
    where: ownedBy(object),
    ...(namespace ? { scope: { namespaces: [namespace] } } : {}),
    page: { offset: 0, limit: 1000 },
  });
  const spec = (object as ObjectOf<typeof DaemonSet>).spec?.template?.spec;
  const rows = useMemo(() => {
    const on = new Set(pods.items.map((i) => i.object?.spec?.nodeName));
    return nodes.items.flatMap((i) => (i.object && !on.has(i.object.metadata?.name) ? [{ node: i.object, why: whyNot(spec, i.object) }] : []));
  }, [nodes.items, pods.items, spec]);
  // Its nodes or pods not to be had: said so, never taken for none.
  const denied = [refused(nodes) && ([Node, nodes.error] as const), refused(pods) && ([Pod, pods.error] as const)].find(Boolean);
  if (denied)
    return (
      <Section title={say(t.notOn)} part="nodes">
        <Refused kind={denied[0]} error={denied[1]} />
      </Section>
    );
  if (nodes.state === 'loading' || pods.state === 'loading' || !rows.length) return null;
  return (
    <Section title={say(t.notOn)} part="nodes">
      <Table
        plain
        rows={rows}
        rowKey={(r) => r.node.metadata?.name ?? ''}
        columns={[
          { id: 'node', header: say(t.node), width: 'minmax(120px, 1fr)', cell: (r) => <ObjectRef kind="v1/Node" name={r.node.metadata?.name ?? ''} quiet /> },
          {
            id: 'why',
            header: say(t.why),
            width: 'minmax(200px, 2fr)',
            cell: ({ why }) =>
              why?.reason === 'taint' ? (
                say(t.byTaint, { taint: why.taint })
              ) : why?.reason === 'selector' ? (
                say(t.bySelector)
              ) : why?.reason === 'affinity' ? (
                say(t.byAffinity)
              ) : (
                <span class="uk-quiet">{say(t.noPodYet)}</span>
              ),
          },
        ]}
      />
    </Section>
  );
}

/** A cron job's jobs (the core's section): those it owns, as theirs. */
export function Jobs({ object }: ResourceProps) {
  const say = useSay();
  return (
    <Section title={say(T.resource.view.workload.jobs)} part="jobs">
      <Of kind={Job} where={ownedBy(object)} object={object} />
    </Section>
  );
}

/** The workloads' in the core's view: their sections, their selector among what they are tied to. */
export function addWorkloads(c: KubeContributor): void {
  const picking = [Deployment, StatefulSet, DaemonSet, ReplicaSet] as const;
  c.add('Fill', 'core.resource.view.workload.pods', section({ kinds: [...picking, Job], order: 10, render: Pods }));
  c.add(
    'Fill',
    'core.resource.view.workload.template',
    section({
      kinds: [Deployment, StatefulSet, DaemonSet, Job, CronJob],
      order: 20,
      when: ({ kind, object }) => (specOf(kind, object)?.containers?.length ?? 0) > 0,
      render: Template,
    }),
  );
  c.add('Fill', 'core.resource.view.workload.strategy', section({ kinds: [Deployment], order: 5, render: Strategy }));
  c.add('Fill', 'core.resource.view.workload.update-strategy', section({ kinds: [StatefulSet, DaemonSet], order: 5, render: UpdateStrategy }));
  c.add(
    'Fill',
    'core.resource.view.workload.failure-policy',
    section({ kinds: [Job], order: 25, when: ({ object }) => (object.spec?.podFailurePolicy?.rules?.length ?? 0) > 0, render: PodFailurePolicy }),
  );
  c.add('Fill', 'core.resource.view.workload.rollout', section({ kinds: [Deployment], order: 30, render: Rollout }));
  c.add('Fill', 'core.resource.view.workload.not-on', section({ kinds: [DaemonSet], order: 15, render: NotOn }));
  c.add(
    'Fill',
    'core.resource.view.workload.claims',
    section({ kinds: [StatefulSet], order: 30, when: ({ object }) => (object.spec?.volumeClaimTemplates?.length ?? 0) > 0, render: Claims }),
  );
  c.add('Fill', 'core.resource.view.workload.jobs', section({ kinds: [CronJob], order: 10, render: Jobs }));
  addRelated<Workload>(c, ['workload', ...picking], 'selector', 200, T.resource.view.workload.selector, (o) => pickingLink(o.spec?.selector, o.metadata?.namespace));
}
