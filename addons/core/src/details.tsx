import type { KindInfo, KubeObject } from '@overkube/kube-types';
import type { FieldCatalog } from '@overkube/query';
import {
  type CellValue,
  type ColumnSpec,
  closeIn,
  kindRef,
  type Label,
  openIn,
  type ResourceConditionProps,
  type ResourceFieldProps,
  type ResourceFinalizerProps,
  type ResourceLabelProps,
  type ResourceOwnerProps,
  type ResourceProps,
  slots,
  TableView,
} from '@overkube/sdk';
import { useList, usePage, useSay, useServedKinds } from '@overkube/sdk/preact';
import { Badge, Chip, Chips, Notice, Section } from '@overkube/uikit';
import type { Definition } from '@overweave/core';
import type { SlotRef } from '@overweave/ui';
import { slotElement, useDefinition } from '@overweave/ui/preact';
import { Fragment } from 'preact';
import { useMemo } from 'preact/hooks';
import { Cell, contextOf, drawn, textOf } from './cell.tsx';
import { useColumns } from './columns.tsx';
import { type Failed, useFailures } from './failures.ts';
import { EMPTY, humanDuration, shownAs } from './format.ts';
import { clock, useLive } from './live.ts';
import { T } from './texts.ts';

/*
 * What the core shows of any resource opened: its summary (its kind's
 * columns as fields — their values asked as its table's are, the wide ones
 * too; being deleted, said first), and from the object itself its conditions (status.conditions,
 * where it has them), its metadata (when it was made, its uid, labels,
 * annotations, owners, finalizers). Each part a slot: a field, its label,
 * its value; a condition, each of its parts; a label, an annotation, an
 * owner, a finalizer — for another to draw in its place, or beside it.
 */

/** How long ago a time was, live (none: "—"); the time itself under the pointer. */
function Since({ time }: { time: string | undefined }) {
  const at = time ? Date.parse(time) : Number.NaN;
  const text = useLive(() => (Number.isNaN(at) ? EMPTY : humanDuration(clock.value - at)), [at]);
  return <span title={time}>{text}</span>;
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
 * its kind's tables have — but its name, the title's — each a field, set
 * out as its TableView sets them (the wide ones shown too): its values
 * asked of the cluster as its table's are, its cell drawn as its table's.
 */
export function SummaryFields({ kind, object }: ResourceProps) {
  const failed = useFailures();
  const view = useDefinition(TableView, kind.id)?.spec ?? {};
  const { placed, catalog } = useColumns(kind, view, failed, true);
  const columns = placed.filter((c) => c.definition.name !== 'core.name');
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
    <section class="uk-section">
      {(answer.state === 'error' || answer.state === 'denied') && (
        <Notice level="warn" icon="warning">
          <span title={answer.error?.message}>{say(T.kind.refused, { kind: kind.plural, code: answer.error?.code ?? '' })}</span>
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

/** Its conditions (the core's section, where it has them): one under another. */
export function Conditions({ kind, object }: ResourceProps) {
  const say = useSay();
  return (
    <Section title={say(T.resource.view.conditions.title)}>
      <ul class="uk-conditions">
        {/* Keyed by type and its count so far: a type twice (a controller's slip) drawn twice. */}
        {conditionsOf(object).map((condition, i, all) => (
          <Fragment key={`${condition.type}#${all.slice(0, i).filter((c) => c.type === condition.type).length}`}>
            {slotElement(slots.resource.view.conditions.condition, { kind, object, condition }, { limit: 1 })}
          </Fragment>
        ))}
      </ul>
    </Section>
  );
}

/** A condition whole (the core's, resource.view.conditions.condition's last): its status, its type, when it changed; why (its reason, its message) under its type — where it says. */
export function ConditionRow(props: ResourceConditionProps) {
  const parts = slots.resource.view.conditions.condition;
  const { reason, message } = props.condition;
  return (
    <li class="uk-condition" data-status={props.condition.status}>
      <span class="uk-condition-status">{slotElement(parts.status, props)}</span>
      <span class="uk-condition-type">{slotElement(parts.type, props)}</span>
      <span class="uk-condition-changed">{slotElement(parts.changed, props)}</span>
      {(reason || message) && (
        <span class="uk-condition-why">
          {reason && <span class="uk-condition-reason">{slotElement(parts.reason, props)}</span>}
          {reason && message && ' · '}
          {message && slotElement(parts.message, props)}
        </span>
      )}
    </li>
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

/** Its status as a badge: as it should be ok (True — False for those bad when they hold), else a warning; neither (Unknown), quiet. */
export const ConditionStatus = ({ condition }: ResourceConditionProps) => {
  const good = ABNORMAL.has(condition.type) ? 'False' : 'True';
  const level = condition.status === good ? 'ok' : condition.status === 'True' || condition.status === 'False' ? 'warn' : undefined;
  return <Badge level={level}>{condition.status || EMPTY}</Badge>;
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
    <Section title={say(T.resource.view.metadata.title)}>
      <dl class="uk-kv">{slotElement(slots.resource.view.metadata, props)}</dl>
    </Section>
  );
}

type MetadataOf = NonNullable<KubeObject['metadata']>;

/**
 * One of the core's metadata fields (a fill of resource.view.metadata): its
 * name, what it is called, its value and its value as text read from the
 * object's metadata — none (undefined): not drawn (an object with no
 * owners, no finalizers).
 */
export function metadataField(name: string, label: Label, read: (m: MetadataOf) => [unknown, string] | undefined) {
  return function MetadataField({ kind, object }: ResourceProps) {
    const say = useSay();
    const got = read(object.metadata ?? {});
    if (!got) return null;
    const [value, display] = got;
    return slotElement(slots.resource.view.metadata.field, { kind, object, field: { name, label: say(label) }, value, display }, { limit: 1 });
  };
}

/** The core's metadata fields, in order: when it was made, its uid, generation (where it has one), labels, annotations (kubectl's copy of it left out), owners and finalizers (where it has them). */
export const METADATA: [string, ReturnType<typeof metadataField>][] = (() => {
  const t = T.resource.view.metadata;
  return [
    ['created', metadataField('created', t.created, (m) => [m.creationTimestamp, m.creationTimestamp ?? ''])],
    ['uid', metadataField('uid', t.uid, (m) => [m.uid, m.uid ?? ''])],
    ['generation', metadataField('generation', t.generation, (m) => (m.generation === undefined ? undefined : [m.generation, String(m.generation)]))],
    ['labels', metadataField('labels', t.labels, (m) => [m.labels ?? {}, ''])],
    ['annotations', metadataField('annotations', t.annotations, (m) => [Object.fromEntries(Object.entries(m.annotations ?? {}).filter(([k]) => !QUIET.has(k))), ''])],
    ['owners', metadataField('owners', t.owners, (m) => (m.ownerReferences?.length ? [m.ownerReferences, ''] : undefined))],
    ['finalizers', metadataField('finalizers', t.finalizers, (m) => (m.finalizers?.length ? [m.finalizers, ''] : undefined))],
  ];
})();

/** A metadata field's value (the core's): a list's items, each its own slot's; when it was made, and how long ago (live); else as text ("—": none). */
export function MetadataValue({ kind, object, field, value, display }: ResourceFieldProps) {
  const item = slots.resource.view.metadata;
  switch (field.name) {
    case 'labels':
    case 'annotations': {
      const slot = field.name === 'labels' ? item.label : item.annotation;
      return <Chips items={value as Record<string, string>} chip={(name, v) => slotElement(slot, { kind, object, name, value: v }, { limit: 1 })} />;
    }
    case 'owners':
      return (
        <ul class="uk-list">
          {(value as ResourceOwnerProps['owner'][]).map((owner) => (
            <li key={owner.uid}>{slotElement(item.owner, { kind, object, owner }, { limit: 1 })}</li>
          ))}
        </ul>
      );
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
          {display} (<Since time={display} />)
        </>
      );
  }
  return <>{shownAs(display)}</>;
}

/** A label, an annotation (the core's): a chip — a click copies key=value. */
export function LabelChip({ name, value }: ResourceLabelProps) {
  const say = useSay();
  const t = T.resource.view.metadata;
  return <Chip name={name} value={value} labels={{ copy: (text) => say(t.copy, { text }), copied: say(t.copied) }} />;
}

/** An owner (the core's): kind/name — a link opening it over the page, where its kind is served. */
export function Owner({ object, owner }: ResourceOwnerProps) {
  const page = usePage();
  const { kinds } = useServedKinds();
  const here = closeIn(page.path.value);
  const kind = kinds.get(`${owner.apiVersion}/${owner.kind}`);
  const text = `${owner.kind}/${owner.name}`;
  if (!kind) return <>{text}</>;
  return <a href={page.href(openIn(here, kind, { metadata: { name: owner.name, namespace: object.metadata?.namespace } }))}>{text}</a>;
}

/** A finalizer (the core's): as it is named. */
export const Finalizer = ({ finalizer }: ResourceFinalizerProps) => <code>{finalizer}</code>;
