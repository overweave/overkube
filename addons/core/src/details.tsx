import { type KindInfo, type KubeObject, kinds } from '@overkube/kube-types';
import type { FieldCatalog } from '@overkube/query';
import {
  type CellValue,
  type ColumnSpec,
  filterIn,
  kindPath,
  kindRef,
  type Label,
  type ResourceConditionProps,
  type ResourceEventProps,
  type ResourceFieldProps,
  type ResourceFinalizerProps,
  type ResourceLabelProps,
  type ResourceOwnerProps,
  type ResourceProps,
  slots,
  TableView,
} from '@overkube/sdk';
import { useList, usePage, useSay } from '@overkube/sdk/preact';
import { Chip, Chips, type ChipsLabels, Nothing, Notice, Row, Rows, Section, Tip } from '@overkube/uikit';
import type { Definition } from '@overweave/core';
import type { SlotRef } from '@overweave/ui';
import { slotElement, useDefinition } from '@overweave/ui/preact';
import { type ComponentChildren, Fragment } from 'preact';
import { useMemo } from 'preact/hooks';
import { Cell, contextOf, drawn, textOf } from './cell.tsx';
import { useColumns } from './columns.tsx';
import { type Failed, useFailures } from './failures.ts';
import { EMPTY, humanDuration, shortTime, shownAs } from './format.ts';
import { titleOf } from './kinds.ts';
import { clock, useLive } from './live.ts';
import { ObjectRef } from './refs.tsx';
import { Refused, refused } from './refused.tsx';
import { selectorFilter } from './selectors.ts';
import { StatusOf } from './statuses.tsx';
import { T } from './texts.ts';

/*
 * What the core shows of any resource opened: its summary (its kind's
 * columns as fields — their values asked as its table's are, the wide ones
 * too; but its name and namespace, its title's; being deleted, said first),
 * its conditions (status.conditions, where it has them), the events about it
 * (the recent ones; all, in a tab of their own), what it is tied to (its
 * owners), its metadata (when it was made, its uid, labels, annotations,
 * finalizers). Each part a slot: a field, its label, its value; a condition,
 * an event, each of its parts; a label, an annotation, an owner, a finalizer
 * — for another to draw in its place, or beside it.
 */

/** How long ago a time was, live (none: "—"); the time itself under the pointer. */
export function Since({ time }: { time: string | undefined }) {
  const at = time ? Date.parse(time) : Number.NaN;
  const text = useLive(() => (Number.isNaN(at) ? EMPTY : humanDuration(clock.value - at)), [at]);
  return <Tip content={() => time}>{text}</Tip>;
}

/** Being deleted (the core's, first in resource.view.summary): since when, and what it waits for (its finalizers). */
export function Deleting({ object }: ResourceProps) {
  const say = useSay();
  const since = object.metadata?.deletionTimestamp;
  const at = since ? Date.parse(since) : Number.NaN;
  const ago = useLive(() => (Number.isNaN(at) ? '' : humanDuration(clock.value - at)), [at]);
  if (!since) return null;
  const finalizers = object.metadata?.finalizers ?? [];
  return (
    <Notice level="warn" icon="warning">
      {/* Since when it says only where its time can be read. */}
      {ago ? say(T.resource.view.summary.deleting, { since: ago }) : say(T.resource.view.summary.deletingNow)}
      {finalizers.length > 0 && ` — ${say(T.resource.view.summary.waiting, { finalizers: finalizers.join(', ') })}`}
    </Notice>
  );
}

/** A field whole (the core's, resource.view.summary.field's and resource.view.metadata.field's last): its label, its value — a row of a list, or (apart) one of a grid of them. */
export function field(label: SlotRef<ResourceFieldProps>, value: SlotRef<ResourceFieldProps>, apart = false) {
  return function Field(props: ResourceFieldProps) {
    const pair = (
      <>
        <dt>{slotElement(label, props)}</dt>
        <dd>{slotElement(value, props)}</dd>
      </>
    );
    return apart ? <div class="uk-field">{pair}</div> : pair;
  };
}

/** A field's label (the core's): what it is called. */
export function FieldLabel({ field }: ResourceFieldProps) {
  return <>{field.label}</>;
}

/**
 * The summary's fields (the core's, in resource.view.summary): the columns
 * its kind's tables have — but its name and namespace, the title's — each a field, set
 * out as its TableView sets them (the wide ones shown too): its values
 * asked of the cluster as its table's are, its cell drawn as its table's.
 */
export function SummaryFields({ kind, object }: ResourceProps) {
  const failed = useFailures();
  const view = useDefinition(TableView, kind.id)?.spec ?? {};
  const { placed, catalog } = useColumns(kind, view, failed, true);
  const columns = placed.filter((c) => c.definition.name !== 'core.name' && c.definition.name !== 'core.namespace');
  const namespace = object.metadata?.namespace;
  const select = useMemo(() => [...new Set(columns.flatMap((c) => c.fields))], [columns]);
  const answer = useList({
    kind: kindRef(kind),
    ...(namespace ? { scope: { namespaces: [namespace] } } : {}),
    where: { field: 'core.name', op: 'eq', value: object.metadata?.name ?? '' },
    page: { limit: 1 },
    select,
  });
  const values = answer.items[0]?.values;
  const say = useSay();
  if (!columns.length) return null;
  return (
    <section class="uk-section" data-part="summary">
      {(answer.state === 'error' || answer.state === 'denied') && (
        <Notice level="warn" icon="warning">
          <Tip content={() => answer.error?.message}>{say(T.kind.refused, { kind: kind.plural, code: answer.error?.code ?? '' })}</Tip>
        </Notice>
      )}
      <dl class="uk-fields">
        {columns.map(({ definition, fields }) => (
          <SummaryField
            key={definition.name}
            column={definition}
            fields={fields}
            values={fields.map((f) => (values?.[f] ?? null) as CellValue)}
            kind={kind}
            object={object}
            catalog={catalog}
            failed={failed}
          />
        ))}
      </dl>
    </section>
  );
}

/** One of its kind's columns as a field: its values, its cell (as its table's: Cell). */
function SummaryField({
  column,
  fields,
  values,
  kind,
  object,
  catalog,
  failed,
}: {
  column: Definition<ColumnSpec>;
  fields: readonly string[];
  values: readonly CellValue[];
  kind: KindInfo;
  object: KubeObject;
  catalog: FieldCatalog | undefined;
  failed: Failed;
}) {
  const say = useSay();
  const label = say(column.spec.header);
  // Its text, as its cell draws it (none: it draws more than text).
  const display = useLive(() => textOf(drawn(column, fields, values, contextOf(kind, say), catalog, failed)) ?? '', [column, fields, values, kind, catalog, say, failed]);
  const props = useMemo<ResourceFieldProps>(
    () => ({
      kind,
      object,
      field: { name: column.name, label },
      value: values,
      display,
      drawn: <Cell column={column} fields={fields} values={values} kind={kind} catalog={catalog} failed={failed} />,
    }),
    [kind, object, column, label, fields, values, display, catalog, failed],
  );
  return slotElement(slots.resource.view.summary.field, props, { limit: 1 });
}

/** A summary field's value (the core's): what its column draws. */
export function SummaryValue({ drawn }: ResourceFieldProps) {
  return <>{drawn}</>;
}

type Condition = ResourceConditionProps['condition'];

/** Its conditions (status.conditions), as the API gives them: those with a type. */
export function conditionsOf(object: KubeObject): Condition[] {
  const list = (object as { status?: { conditions?: unknown } }).status?.conditions;
  return Array.isArray(list) ? list.filter((c): c is Condition => typeof c === 'object' && c !== null && typeof c.type === 'string') : [];
}

/** Its conditions (the core's section, where it has them): rows, one under another. */
export function Conditions({ kind, object }: ResourceProps) {
  const say = useSay();
  return (
    <Section title={say(T.resource.view.conditions.title)} part="conditions">
      <Rows>
        {/* Keyed by type and its count so far: a type twice (a controller's slip) drawn twice. */}
        {conditionsOf(object).map((condition, i, all) => (
          <Fragment key={`${condition.type}#${all.slice(0, i).filter((c) => c.type === condition.type).length}`}>
            {slotElement(slots.resource.view.conditions.condition, { kind, object, condition }, { limit: 1 })}
          </Fragment>
        ))}
      </Rows>
    </Section>
  );
}

/** A condition whole (the core's, resource.view.conditions.condition's last): its status its mark, its type, when it changed; why (its reason, its message) under it — where it says. */
export function ConditionRow(props: ResourceConditionProps) {
  const parts = slots.resource.view.conditions.condition;
  const { reason, message } = props.condition;
  return (
    <Row
      mark={slotElement(parts.status, props)}
      lead={<span>{slotElement(parts.type, props)}</span>}
      end={slotElement(parts.changed, props)}
      under={
        (reason || message) && (
          <>
            {reason && slotElement(parts.reason, props)}
            {reason && message && ' · '}
            {message && slotElement(parts.message, props)}
          </>
        )
      }
    />
  );
}

/** A condition's parts (the core's): its type, status, reason, message as the API gives them; when it changed, live. */
export const ConditionType = ({ condition }: ResourceConditionProps) => <>{condition.type}</>;
/**
 * The conditions that are bad when they hold: True a warning, False ok — a
 * node's pressures, a replica set's failure, a pod about to be disrupted, a
 * job failed; kstatus' Reconciling and Stalled, a Degraded operator. Another
 * kind's own: its addon's fill of resource.view.conditions.condition.status.
 */
const ABNORMAL = new Set([
  'MemoryPressure',
  'DiskPressure',
  'PIDPressure',
  'NetworkUnavailable',
  'ReplicaFailure',
  'DisruptionTarget',
  'Failed',
  'FailureTarget',
  'Reconciling',
  'Stalled',
  'Degraded',
]);

/** Its status as a mark (its words under the pointer): as it should be (True — False for those bad when they hold) as True looks, else as False; neither (Unknown) as it is. */
export const ConditionStatus = ({ kind, condition }: ResourceConditionProps) => {
  const { status } = condition;
  const as = ABNORMAL.has(condition.type) && (status === 'True' || status === 'False') ? (status === 'True' ? 'False' : 'True') : status;
  return <StatusOf kind={kind} words={as || 'Unknown'} title={status || EMPTY} mark />;
};
export const ConditionReason = ({ condition }: ResourceConditionProps) => <>{condition.reason ?? ''}</>;
export const ConditionMessage = ({ condition }: ResourceConditionProps) => <>{condition.message ?? ''}</>;
export const ConditionChanged = ({ condition }: ResourceConditionProps) => <Since time={condition.lastTransitionTime} />;

/** What its annotations leave out: kubectl's copy of the object as last applied (the whole object again — its YAML has it). */
const QUIET = new Set(['kubectl.kubernetes.io/last-applied-configuration']);

/** Its metadata (the core's section): its fields (resource.view.metadata's, in order — the core's, another's among them). */
export function Metadata(props: ResourceProps) {
  const say = useSay();
  return (
    <Section title={say(T.resource.view.metadata.title)} part="metadata">
      <dl class="uk-kv">{slotElement(slots.resource.view.metadata, props)}</dl>
    </Section>
  );
}

type MetadataOf = NonNullable<KubeObject['metadata']>;

/**
 * One of the core's metadata fields (a fill of resource.view.metadata; of
 * resource.view.related, drawn as its field): its name, what it is called,
 * its value and its value as text read from the object's metadata — none
 * (undefined): not drawn (an object with no owners, no finalizers).
 */
export function metadataField(
  name: string,
  label: Label,
  read: (m: MetadataOf) => [unknown, string] | undefined,
  whole: SlotRef<ResourceFieldProps> = slots.resource.view.metadata.field,
) {
  return function MetadataField({ kind, object }: ResourceProps) {
    const say = useSay();
    const got = read(object.metadata ?? {});
    if (!got) return null;
    const [value, display] = got;
    return slotElement(whole, { kind, object, field: { name, label: say(label) }, value, display }, { limit: 1 });
  };
}

/** The core's metadata fields, in order: when it was made, its uid, generation, labels, annotations (kubectl's copy of it left out), finalizers — each where it has them. */
export const METADATA: [string, ReturnType<typeof metadataField>][] = (() => {
  const t = T.resource.view.metadata;
  return [
    ['created', metadataField('created', t.created, (m) => [m.creationTimestamp, m.creationTimestamp ?? ''])],
    ['uid', metadataField('uid', t.uid, (m) => [m.uid, m.uid ?? ''])],
    ['generation', metadataField('generation', t.generation, (m) => (m.generation === undefined ? undefined : [m.generation, String(m.generation)]))],
    ['labels', metadataField('labels', t.labels, (m) => (Object.keys(m.labels ?? {}).length ? [m.labels, ''] : undefined))],
    [
      'annotations',
      metadataField('annotations', t.annotations, (m) => {
        const shown = Object.entries(m.annotations ?? {}).filter(([k]) => !QUIET.has(k));
        return shown.length ? [Object.fromEntries(shown), ''] : undefined;
      }),
    ],
    ['finalizers', metadataField('finalizers', t.finalizers, (m) => (m.finalizers?.length ? [m.finalizers, ''] : undefined))],
  ];
})();

/** A metadata field's value (the core's): a list's items, each its own slot's; when it was made, and how long ago (live); else as text ("—": none). */
export function MetadataValue({ kind, object, field, value, display }: ResourceFieldProps) {
  const labels = useChipLabels();
  const item = slots.resource.view.metadata;
  switch (field.name) {
    case 'labels':
    case 'annotations': {
      const slot = field.name === 'labels' ? item.label : item.annotation;
      return <Chips items={value as Record<string, string>} labels={labels} chip={(name, v) => slotElement(slot, { kind, object, name, value: v }, { limit: 1 })} />;
    }
    case 'finalizers':
      return (
        <ul class="uk-list">
          {(value as string[]).map((finalizer) => (
            <li key={finalizer}>{slotElement(item.finalizer, { kind, object, finalizer }, { limit: 1 })}</li>
          ))}
        </ul>
      );
    case 'created':
      if (!display) return <>{EMPTY}</>;
      return (
        <>
          <Tip content={() => display}>{shortTime(display)}</Tip> (<Since time={display} />)
        </>
      );
  }
  return field.name === 'uid' ? <code>{shownAs(display)}</code> : shownAs(display);
}

/** An annotation (the core's): a chip — a click copies key=value. */
export function LabelChip({ name, value }: ResourceLabelProps) {
  return <Chip name={name} value={value} labels={useChipLabels()} />;
}

/** A label (the core's): a chip leading to its kind's page, those of it (all namespaces': as a label means it). */
export function LabelLink({ kind, name, value }: ResourceLabelProps) {
  const page = usePage();
  const say = useSay();
  const text = `${name}=${value}`;
  const href = page.href(filterIn(kindPath(kind), selectorFilter({ matchLabels: { [name]: value } })));
  return <Chip name={name} value={value} href={href} labels={{ ...useChipLabels(), follow: () => say(T.resource.view.metadata.follow, { kind: titleOf(kind), text }) }} />;
}

/** Chips' words in the page's language (how many more, back to a few, a copy, done): labels, annotations, selectors alike. */
export function useChipLabels(): ChipsLabels {
  const say = useSay();
  const t = T.resource.view.metadata;
  return { more: (count) => say(t.more, { count }), less: say(t.less), copy: (text) => say(t.copy, { text }), copied: say(t.copied) };
}

/** An owner (the core's): its kind's icon, its kind quiet, its name — a link opening it over the page, where its kind is served. */
export const Owner = ({ object, owner }: ResourceOwnerProps) => <ObjectRef kind={`${owner.apiVersion}/${owner.kind}`} name={owner.name} namespace={object.metadata?.namespace} />;

/** A finalizer (the core's): as it is named. */
export const Finalizer = ({ finalizer }: ResourceFinalizerProps) => <code>{finalizer}</code>;

/** What it is tied to (the core's section): its fields (resource.view.related's, in order — the core's, another's among them); none, not drawn. */
export function Related(props: ResourceProps) {
  const say = useSay();
  return (
    <Section title={say(T.resource.view.related.title)} part="related">
      <dl class="uk-kv">{slotElement(slots.resource.view.related, props)}</dl>
    </Section>
  );
}

/** Its owners (the core's related field, where it has them). */
export const OWNERS = metadataField(
  'owners',
  T.resource.view.related.owners,
  (m) => (m.ownerReferences?.length ? [m.ownerReferences, ''] : undefined),
  slots.resource.view.related.field,
);

/**
 * One of the core's related fields of some kinds (a fill of
 * resource.view.related, its target theirs): its name, what it is called,
 * what it draws of the object (others: ObjectRefs) and as text — none: not
 * drawn.
 */
export function relatedField<O extends KubeObject>(name: string, label: Label, read: (object: O) => [drawn: ComponentChildren, display: string] | undefined) {
  return function RelatedField({ kind, object }: ResourceProps) {
    const say = useSay();
    const got = read(object as O);
    if (!got) return null;
    const [drawn, display] = got;
    return slotElement(slots.resource.view.related.field, { kind, object, field: { name, label: say(label) }, value: display, display, drawn }, { limit: 1 });
  };
}

/** A related field's value (the core's): what it draws; its owners, each its own slot's; else as text. */
export function RelatedValue({ kind, object, field, value, display, drawn }: ResourceFieldProps) {
  if (drawn !== undefined) return <>{drawn}</>;
  if (field.name !== 'owners') return <>{shownAs(display)}</>;
  return (
    <ul class="uk-list">
      {(value as ResourceOwnerProps['owner'][]).map((owner) => (
        <li key={owner.uid}>{slotElement(slots.resource.view.related.owner, { kind, object, owner }, { limit: 1 })}</li>
      ))}
    </ul>
  );
}

type Event = ResourceEventProps['event'];

/** An Event (core/v1) as its parts: when it was last seen as kubectl says (its series', its last, its first time, or when it was made), how often (its series' count, its count). */
function eventOf(o: KubeObject): Event {
  const e = o as KubeObject & {
    type?: string;
    reason?: string;
    message?: string;
    count?: number;
    lastTimestamp?: string;
    firstTimestamp?: string;
    eventTime?: string;
    series?: { count?: number; lastObservedTime?: string };
    source?: { component?: string };
    reportingComponent?: string;
  };
  return {
    type: e.type,
    reason: e.reason,
    message: e.message,
    count: e.series?.count ?? e.count,
    lastSeen: e.series?.lastObservedTime ?? e.lastTimestamp ?? e.firstTimestamp ?? e.eventTime ?? o.metadata?.creationTimestamp,
    source: e.source?.component || e.reportingComponent,
    uid: o.metadata?.uid,
  };
}

/** The events about it (the latest first; some: the first of them), asked of the cluster live — in its namespace, or (of the cluster) in any. */
function useEvents({ object }: ResourceProps, some?: number) {
  const namespace = object.metadata?.namespace;
  const answer = useList<KubeObject>({
    kind: kindRef(kinds.core.v1.Event),
    ...(namespace ? { scope: { namespaces: [namespace] } } : {}),
    where: { field: 'events.v1.about', op: 'eq', value: object.metadata?.uid ?? '' },
    sort: [{ field: 'events.v1.lastSeen', desc: true }],
    page: { offset: 0, limit: some ?? 500 },
  });
  const events = useMemo(() => answer.items.flatMap((i) => (i.object ? [eventOf(i.object)] : [])), [answer.items]);
  return { events, answer };
}

/** Events as rows (each resource.view.events.event's, one fill drawn). */
function EventRows({ kind, object, events }: ResourceProps & { events: Event[] }) {
  return (
    <Rows>
      {events.map((event, i) => (
        <Fragment key={event.uid ?? i}>{slotElement(slots.resource.view.events.event, { kind, object, event }, { limit: 1 })}</Fragment>
      ))}
    </Rows>
  );
}

/** How many events its Overview shows. */
export const RECENT = 3;

/** Its recent events (the core's section, where there are any — or they were refused: said so): the latest few. */
export function RecentEvents(props: ResourceProps) {
  const say = useSay();
  const { events, answer } = useEvents(props, RECENT);
  if (!events.length && !refused(answer)) return null;
  return (
    <Section title={say(T.resource.view.events.recent)} part="events">
      {refused(answer) ? <Refused kind={kinds.core.v1.Event} error={answer.error} /> : <EventRows {...props} events={events} />}
    </Section>
  );
}

/** All the events about it (the core's Events tab): none, said so — how long the cluster keeps them; refused, said so. */
export function AllEvents(props: ResourceProps) {
  const say = useSay();
  const { events, answer } = useEvents(props);
  return (
    <Section title={say(T.resource.view.events.title)} part="events">
      {refused(answer) ? (
        <Refused kind={kinds.core.v1.Event} error={answer.error} />
      ) : events.length ? (
        <EventRows {...props} events={events} />
      ) : (
        answer.state !== 'loading' && <Nothing icon="activity">{say(T.resource.view.events.none)}</Nothing>
      )}
    </Section>
  );
}

/** An event whole (the core's, resource.view.events.event's last): its type its mark, its reason, how often and when last; its message under it. */
export function EventRow(props: ResourceEventProps) {
  const parts = slots.resource.view.events.event;
  return (
    <Row
      mark={slotElement(parts.type, props)}
      lead={<span>{slotElement(parts.reason, props)}</span>}
      end={slotElement(parts.seen, props)}
      under={props.event.message ? slotElement(parts.message, props) : undefined}
    />
  );
}

/** An event's parts (the core's): its type as a mark (as an Event's type looks), its reason, its message, how often (more than once) and when last — live. */
export const EventType = ({ event }: ResourceEventProps) => <StatusOf kind={kinds.core.v1.Event} words={event.type || 'Unknown'} mark />;
export const EventReason = ({ event }: ResourceEventProps) => <>{event.reason || EMPTY}</>;
export const EventMessage = ({ event }: ResourceEventProps) => <>{event.message}</>;
export function EventSeen({ event }: ResourceEventProps) {
  const say = useSay();
  return (
    <>
      {event.count !== undefined && event.count > 1 && `${say(T.resource.view.events.times, { count: event.count })} · `}
      <Since time={event.lastSeen} />
    </>
  );
}
