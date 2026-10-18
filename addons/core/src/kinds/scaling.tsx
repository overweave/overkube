import { kinds, type ObjectOf } from '@overkube/kube-types';
import { type KubeContributor, kindRef, type ResourceProps, section } from '@overkube/sdk';
import { ObjectRef, useList, useSay } from '@overkube/sdk/preact';
import { Badge, KeyValue, Meter, Nothing, Section, Table } from '@overkube/uikit';
import type { ComponentChildren } from 'preact';
import { quantity } from '../format.ts';
import { Refused, refused } from '../refused.tsx';
import { T } from '../texts.ts';
import { addRelated, pickingLink } from './shared.tsx';

/*
 * An autoscaler's, a disruption budget's and a namespace's own, in their
 * views: an autoscaler's metrics (each now against its target — a
 * resource's share of what its pods request, a meter; another's, in words),
 * what it scales; the pods a budget keeps; what a namespace's quotas allow
 * and how much of it is used.
 */

const { HorizontalPodAutoscaler } = kinds.autoscaling.v2;
const { PodDisruptionBudget } = kinds.policy.v1;
const { Namespace, ResourceQuota } = kinds.core.v1;
type ScalerObject = ObjectOf<typeof HorizontalPodAutoscaler>;
type BudgetObject = ObjectOf<typeof PodDisruptionBudget>;
type QuotaObject = ObjectOf<typeof ResourceQuota>;
type Metric = NonNullable<NonNullable<ScalerObject['spec']>['metrics']>[number];
type Current = NonNullable<NonNullable<ScalerObject['status']>['currentMetrics']>[number];

type Source = Metric | Current;

/** Which metric it is (the same in the spec and the status): its type and name, a container's, an object's, its selector — and its name as said. */
function idOf(m: Source): { id: string; name: string } {
  // Its selector whole, in one order: its labels, its expressions (each its values sorted).
  const select = (s: { matchLabels?: Record<string, string>; matchExpressions?: { key: string; operator: string; values?: string[] }[] } | undefined) =>
    JSON.stringify([
      Object.entries(s?.matchLabels ?? {}).sort(([a], [b]) => a.localeCompare(b)),
      (s?.matchExpressions ?? []).map((e) => [e.key, e.operator, [...(e.values ?? [])].sort()]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    ]);
  if (m.resource) return { id: `Resource/${m.resource.name}`, name: m.resource.name };
  if (m.containerResource)
    return { id: `ContainerResource/${m.containerResource.container}/${m.containerResource.name}`, name: `${m.containerResource.name} · ${m.containerResource.container}` };
  if (m.pods) return { id: `Pods/${m.pods.metric.name}/${select(m.pods.metric.selector)}`, name: m.pods.metric.name };
  if (m.object) {
    const o = m.object.describedObject;
    return { id: `Object/${o.kind}/${o.name}/${m.object.metric.name}/${select(m.object.metric.selector)}`, name: `${m.object.metric.name} · ${o.kind}/${o.name}` };
  }
  if (m.external) return { id: `External/${m.external.metric.name}/${select(m.external.metric.selector)}`, name: m.external.metric.name };
  return { id: m.type, name: m.type };
}

/** A metric, its target and what it is now (the same metric in the status): a resource's share of requests, or a value (a share of its target). */
export function metricOf(m: Metric, now: Current[]): { id: string; name: string; share: boolean; target: string; now?: string; part?: number } {
  const { id, name } = idOf(m);
  const target = m.resource?.target ?? m.containerResource?.target ?? m.pods?.target ?? m.object?.target ?? m.external?.target;
  const current = now.find((c) => c.type === m.type && idOf(c).id === id);
  const value = current?.resource?.current ?? current?.containerResource?.current ?? current?.pods?.current ?? current?.object?.current ?? current?.external?.current;
  if (target?.averageUtilization !== undefined) {
    const at = value?.averageUtilization;
    return { id, name, share: true, target: `${target.averageUtilization}%`, ...(at === undefined ? {} : { now: `${at}%`, part: at / target.averageUtilization }) };
  }
  const want = String(target?.averageValue ?? target?.value ?? '—');
  const got = value?.averageValue ?? value?.value;
  const part = got === undefined ? Number.NaN : quantity(String(got)) / quantity(want);
  return { id, name, share: false, target: want, ...(got === undefined ? {} : { now: String(got) }), ...(Number.isFinite(part) ? { part } : {}) };
}

/** Its metrics (the core's section): a resource's share of requests a meter (its target full), now against its target; another's in words; none, said so. */
export function Metrics({ object }: ResourceProps) {
  const say = useSay();
  const t = T.resource.view.scaling;
  const scaler = object as ScalerObject;
  const metrics = (scaler.spec?.metrics ?? []).map((m) => metricOf(m, scaler.status?.currentMetrics ?? []));
  const words = (m: ReturnType<typeof metricOf>) => (m.now === undefined ? say(t.unknown, { target: m.target }) : say(t.now, { now: m.now, target: m.target }));
  return (
    <Section title={say(t.metrics)} part="metrics">
      {metrics.length ? (
        <>
          {metrics.some((m) => m.share) && (
            <dl class="uk-fields">
              {metrics
                .filter((m) => m.share)
                .map((m) => (
                  <Meter key={m.id} label={say(t.ofRequests, { resource: m.name })} value={m.part ?? 0} of={1}>
                    {words(m)}
                  </Meter>
                ))}
            </dl>
          )}
          {metrics.some((m) => !m.share) && <KeyValue rows={metrics.filter((m) => !m.share).map((m): [string, ComponentChildren] => [m.name, words(m)])} />}
        </>
      ) : (
        <Nothing icon="activity">{say(t.noMetrics)}</Nothing>
      )}
    </Section>
  );
}

type Rules = NonNullable<NonNullable<ScalerObject['spec']>['behavior']>['scaleUp'];

/** How it scales each way where its spec says nothing (the API's defaults): up at once, by its pods or 4 a 15s; down after 5m, by all of them a 15s — the most of its policies. */
const DEFAULTS: Record<'up' | 'down', Required<Pick<NonNullable<Rules>, 'stabilizationWindowSeconds' | 'policies' | 'selectPolicy'>>> = {
  up: {
    stabilizationWindowSeconds: 0,
    policies: [
      { type: 'Percent', value: 100, periodSeconds: 15 },
      { type: 'Pods', value: 4, periodSeconds: 15 },
    ],
    selectPolicy: 'Max',
  },
  down: { stabilizationWindowSeconds: 300, policies: [{ type: 'Percent', value: 100, periodSeconds: 15 }], selectPolicy: 'Max' },
};

/** How it scales up and down: each its rules, what it does not say the API's default. */
export function rulesOf(scaler: ScalerObject): { way: 'up' | 'down'; waits: number; given: boolean; policies: NonNullable<NonNullable<Rules>['policies']>; picks: string }[] {
  const of = (way: 'up' | 'down', rules: Rules) => ({
    way,
    waits: rules?.stabilizationWindowSeconds ?? DEFAULTS[way].stabilizationWindowSeconds,
    // Not said: the controller's (scaling down, its --horizontal-pod-autoscaler-downscale-stabilization flag's).
    given: rules?.stabilizationWindowSeconds !== undefined,
    policies: rules?.policies ?? DEFAULTS[way].policies,
    picks: rules?.selectPolicy ?? DEFAULTS[way].selectPolicy,
  });
  return [of('up', scaler.spec?.behavior?.scaleUp), of('down', scaler.spec?.behavior?.scaleDown)];
}

/** How it scales (the core's section): each way, how long it waits, at most how much a while (its policies — the first, then the others), which it picks. */
export function Behaviour({ object }: ResourceProps) {
  const say = useSay();
  const t = T.resource.view.scaling;
  return (
    <Section title={say(t.behaviour)} part="behaviour">
      <Table
        plain
        rows={rulesOf(object as ScalerObject)}
        rowKey={(r) => r.way}
        columns={[
          { id: 'way', header: say(t.direction), width: 'minmax(72px, 1fr)', cell: (r) => say(t[r.way]) },
          {
            id: 'waits',
            header: say(t.waits),
            width: 'minmax(96px, 1fr)',
            cell: (r) => (
              <span class="uk-line">
                <span>{`${r.waits}s`}</span>
                {!r.given && <span class="uk-quiet">{say(t.controllerDefault)}</span>}
              </span>
            ),
          },
          {
            id: 'most',
            header: say(t.atMost),
            width: 'minmax(160px, 3fr)',
            cell: (r) => {
              const [first, ...others] = r.policies.map((p) =>
                say(p.type === 'Percent' ? t.percent : t.pods, { sign: r.way === 'up' ? '+' : '−', value: String(p.value), period: String(p.periodSeconds) }),
              );
              return (
                <span class="uk-line">
                  <span>{first ?? '—'}</span>
                  {others.length > 0 && <span class="uk-quiet">{others.map((policy) => say(t.or, { policy })).join(', ')}</span>}
                </span>
              );
            },
          },
          { id: 'picks', header: say(t.picks), width: 'minmax(72px, 1fr)', cell: (r) => r.picks },
        ]}
      />
    </Section>
  );
}

/** What quotas hold to, each how much of it is used of how much allowed (a meter); more than one quota: each named. */
function QuotaMeters({ quotas }: { quotas: QuotaObject[] }) {
  const say = useSay();
  const rows = quotas.flatMap((q) =>
    Object.entries(q.status?.hard ?? q.spec?.hard ?? {}).map(([resource, hard]) => ({
      key: `${q.metadata?.name}/${resource}`,
      label: quotas.length > 1 ? `${resource} · ${q.metadata?.name}` : resource,
      hard: String(hard),
      used: String(q.status?.used?.[resource] ?? '0'),
    })),
  );
  return (
    <dl class="uk-fields">
      {rows.map((r) => (
        <Meter key={r.key} label={r.label} value={quantity(r.used)} of={quantity(r.hard)}>
          {say(T.resource.view.scaling.used, { used: r.used, hard: r.hard })}
        </Meter>
      ))}
    </dl>
  );
}

/** A namespace's quotas (the core's section): each thing they hold to, how much of it is used of how much allowed; none, said so. */
export function Quota({ object }: ResourceProps) {
  const say = useSay();
  const t = T.resource.view.scaling;
  const name = object.metadata?.name ?? '';
  const answer = useList<QuotaObject>({ kind: kindRef(ResourceQuota), scope: { namespaces: [name] }, page: { offset: 0, limit: 20 } });
  const quotas = answer.items.flatMap((i) => (i.object ? [i.object] : []));
  const any = quotas.some((q) => Object.keys(q.status?.hard ?? q.spec?.hard ?? {}).length > 0);
  return (
    <Section title={say(t.quota)} part="quota">
      {refused(answer) ? (
        <Refused kind={ResourceQuota} error={answer.error} />
      ) : any ? (
        <QuotaMeters quotas={quotas} />
      ) : (
        answer.state !== 'loading' && <Nothing icon="activity">{say(t.noQuota)}</Nothing>
      )}
    </Section>
  );
}

/** A quota's own (the core's section): how much of each thing it holds to is used of how much allowed; its scopes, where it has them, under. */
export function QuotaUsed({ object }: ResourceProps) {
  const say = useSay();
  const t = T.resource.view.scaling;
  const quota = object as QuotaObject;
  const scopes = [
    ...(quota.spec?.scopes ?? []),
    ...(quota.spec?.scopeSelector?.matchExpressions ?? []).map((e) => `${e.scopeName} ${e.operator}${e.values?.length ? ` (${e.values.join(', ')})` : ''}`),
  ];
  return (
    <Section title={say(t.usedOfAllowed)} part="quota">
      <QuotaMeters quotas={[quota]} />
      {scopes.length > 0 && (
        <KeyValue
          rows={[
            [
              say(t.scopes),
              <span class="uk-badges">
                {scopes.map((x) => (
                  <Badge key={x}>{x}</Badge>
                ))}
              </span>,
            ],
          ]}
        />
      )}
    </Section>
  );
}

/** Autoscalers', disruption budgets' and namespaces' in the core's view: metrics, quotas; what an autoscaler scales, the pods a budget keeps. */
export function addScaling(c: KubeContributor): void {
  const t = T.resource.view.scaling;
  c.add('Fill', 'core.resource.view.autoscaler.metrics', section({ kinds: [HorizontalPodAutoscaler], order: 10, render: Metrics }));
  c.add('Fill', 'core.resource.view.autoscaler.behaviour', section({ kinds: [HorizontalPodAutoscaler], order: 20, render: Behaviour }));
  addRelated<ScalerObject>(c, ['autoscaler', HorizontalPodAutoscaler], 'scales', 100, t.scales, (o) => {
    const ref = o.spec?.scaleTargetRef;
    return ref ? [<ObjectRef kind={`${ref.apiVersion ?? 'apps/v1'}/${ref.kind}`} name={ref.name} namespace={o.metadata?.namespace} />, ref.name] : undefined;
  });
  addRelated<BudgetObject>(c, ['budget', PodDisruptionBudget], 'selector', 100, T.resource.view.workload.selector, (o) => pickingLink(o.spec?.selector, o.metadata?.namespace));
  c.add('Fill', 'core.resource.view.namespace.quota', section({ kinds: [Namespace], order: 10, render: Quota }));
  c.add('Fill', 'core.resource.view.quota.used', section({ kinds: [ResourceQuota], order: 10, render: QuotaUsed }));
}
