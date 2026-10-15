import { type KindInfo, kinds, type ObjectOf } from '@overkube/kube-types';
import type { FieldName } from '@overkube/query';
import { KindView, type KubeContributor, kindRef, type ResourceProps, StatusLook, section } from '@overkube/sdk';
import { useCount, useList, useSay } from '@overkube/sdk/preact';
import { Nothing, Ref, Section, Table } from '@overkube/uikit';
import { useDefinitions } from '@overweave/ui/preact';
import { Refused, RefusedQuietly, refused } from '../refused.tsx';
import { lookOf, StatusOf } from '../statuses.tsx';
import { T } from '../texts.ts';

/*
 * A namespace's own, in its view: what is in it (how many of each usual
 * kind, those not well among them — as their states' looks say), its limit
 * ranges (each kind of thing, each resource: its defaults, its bounds).
 */

const { Pod, Service, ConfigMap, Secret, PersistentVolumeClaim, LimitRange } = kinds.core.v1;
const { Deployment, StatefulSet, DaemonSet } = kinds.apps.v1;
const { Job, CronJob } = kinds.batch.v1;
type LimitObject = ObjectOf<typeof LimitRange>;

/** The kinds a namespace is said to hold, each by the field its state is told by (none: no state). */
const CONTENTS: readonly [KindInfo, FieldName | undefined][] = [
  [Pod, 'pods.v1.status'],
  [Deployment, 'deployments.v1.apps.health'],
  [StatefulSet, 'statefulsets.v1.apps.health'],
  [DaemonSet, 'daemonsets.v1.apps.health'],
  [Job, 'jobs.v1.batch.status'],
  [CronJob, 'cronjobs.v1.batch.status'],
  [Service, undefined],
  [ConfigMap, undefined],
  [Secret, undefined],
  [PersistentVolumeClaim, 'persistentvolumeclaims.v1.status'],
];

/** The tones of a state not well. */
const UNWELL = new Set(['error', 'warn', 'waiting']);

/** How many of a kind are in it, and those not well (each state, how many): a row, where there are any. */
function useContent([kind, field]: readonly [KindInfo, FieldName | undefined], namespace: string) {
  const looks = useDefinitions(StatusLook);
  const icon = useDefinitions(KindView).find((d) => d.name === kind.id)?.spec.icon ?? 'cube';
  const count = useCount({ kind: kindRef(kind), scope: { namespaces: [namespace] }, ...(field ? { groupBy: field } : {}) });
  const unwell = (count.groups ?? []).filter((g) => g.value !== null && g.value !== '' && UNWELL.has(lookOf(looks, kind, String(g.value))?.tone ?? ''));
  return { kind, icon, count, unwell };
}

/** What is in it (the core's section): each usual kind there is any of, how many, those not well; nothing, said so. Refused, said so in its row. */
export function Contents({ object }: ResourceProps) {
  const say = useSay();
  const t = T.resource.view.namespace;
  const name = object.metadata?.name ?? '';
  // One count each of a fixed list of kinds: the same hooks every time.
  const contents = CONTENTS.map((c) => useContent(c, name));
  const rows = contents.filter((r) => refused(r.count) || (r.count.total?.count ?? 0) > 0);
  const loading = contents.some((r) => r.count.state === 'loading');
  return (
    <Section title={say(t.contents)} part="contents">
      {rows.length ? (
        <Table
          plain
          rows={rows}
          rowKey={(r) => r.kind.id}
          columns={[
            {
              id: 'kind',
              header: say(t.kind),
              width: 'minmax(160px, 2fr)',
              cell: (r) => <Ref icon={r.icon}>{r.kind.kind}</Ref>,
            },
            {
              id: 'count',
              header: say(t.count),
              width: 'minmax(64px, 1fr)',
              cell: (r) => (refused(r.count) ? <RefusedQuietly kind={r.kind} error={r.count.error} /> : String(r.count.total?.count ?? '—')),
            },
            {
              id: 'unwell',
              header: say(t.notWell),
              width: 'minmax(140px, 2fr)',
              cell: (r) =>
                r.unwell.length ? (
                  <span class="uk-line">
                    {r.unwell.map((g) => (
                      <span key={String(g.value)}>
                        {g.count} <StatusOf kind={r.kind} words={String(g.value)} />
                      </span>
                    ))}
                  </span>
                ) : (
                  <span class="uk-quiet">—</span>
                ),
            },
          ]}
        />
      ) : (
        !loading && <Nothing icon="folder">{say(t.empty)}</Nothing>
      )}
    </Section>
  );
}

/** Limit ranges' limits, one line each kind of thing and resource: its default request and limit, its least and most; more than one range: each named. */
export function LimitTable({ ranges }: { ranges: LimitObject[] }) {
  const say = useSay();
  const t = T.resource.view.namespace;
  const rows = ranges.flatMap((r) =>
    (r.spec?.limits ?? []).flatMap((l, i) => {
      const resources = [...new Set([l.default, l.defaultRequest, l.min, l.max, l.maxLimitRequestRatio].flatMap((m) => Object.keys(m ?? {})))].sort();
      const of = (m: Record<string, unknown> | undefined, resource: string) => (m?.[resource] === undefined ? '—' : String(m[resource]));
      return resources.map((resource) => ({
        key: `${r.metadata?.name}/${i}/${resource}`,
        resource,
        of: `${l.type}${ranges.length > 1 ? ` · ${r.metadata?.name}` : ''}`,
        request: of(l.defaultRequest, resource),
        limit: of(l.default, resource),
        min: of(l.min, resource),
        max: of(l.max, resource),
        ratio: of(l.maxLimitRequestRatio, resource),
      }));
    }),
  );
  const mono = (v: string) => <span class="uk-mono">{v}</span>;
  return (
    <Table
      plain
      rows={rows}
      rowKey={(r) => r.key}
      columns={[
        {
          id: 'of',
          header: say(t.of),
          width: 'minmax(120px, 2fr)',
          cell: (r) => (
            <span class="uk-line">
              <span class="uk-mono">{r.resource}</span>
              <span class="uk-quiet">{r.of}</span>
            </span>
          ),
        },
        { id: 'request', header: say(t.defaultRequest), width: 'minmax(72px, 1fr)', cell: (r) => mono(r.request) },
        { id: 'limit', header: say(t.defaultLimit), width: 'minmax(72px, 1fr)', cell: (r) => mono(r.limit) },
        { id: 'min', header: say(t.min), width: 'minmax(56px, 1fr)', cell: (r) => mono(r.min) },
        { id: 'max', header: say(t.max), width: 'minmax(56px, 1fr)', cell: (r) => mono(r.max) },
        ...(rows.some((r) => r.ratio !== '—') ? [{ id: 'ratio', header: say(t.ratio), width: 'minmax(56px, 1fr)', cell: (r: (typeof rows)[number]) => mono(r.ratio) }] : []),
      ]}
    />
  );
}

/** Its limit ranges (the core's section, where it has any): their limits. Refused, said so. */
export function Limits({ object }: ResourceProps) {
  const say = useSay();
  const t = T.resource.view.namespace;
  const answer = useList<LimitObject>({ kind: kindRef(LimitRange), scope: { namespaces: [object.metadata?.name ?? ''] }, page: { offset: 0, limit: 50 } });
  const ranges = answer.items.flatMap((i) => (i.object?.spec?.limits?.length ? [i.object] : []));
  if (!refused(answer) && !ranges.length) return null;
  return (
    <Section title={say(t.limits)} part="limits">
      {refused(answer) ? <Refused kind={LimitRange} error={answer.error} /> : <LimitTable ranges={ranges} />}
    </Section>
  );
}

/** A limit range's own (the core's section): its limits. */
export function RangeLimits({ object }: ResourceProps) {
  const say = useSay();
  return (
    <Section title={say(T.resource.view.namespace.limitsOwn)} part="limits">
      <LimitTable ranges={[object as LimitObject]} />
    </Section>
  );
}

/** A namespace's in the core's view: what is in it, its limit ranges; a limit range's own limits. */
export function addNamespace(c: KubeContributor): void {
  const { Namespace } = kinds.core.v1;
  c.add('Fill', 'core.resource.view.namespace.contents', section({ kinds: [Namespace], order: 5, render: Contents }));
  c.add('Fill', 'core.resource.view.namespace.limits', section({ kinds: [Namespace], order: 20, render: Limits }));
  c.add('Fill', 'core.resource.view.limitrange.limits', section({ kinds: [LimitRange], order: 10, render: RangeLimits }));
}
