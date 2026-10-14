import { type KindInfo, kinds } from '@overkube/kube-types';
import type { FieldCatalog, Value } from '@overkube/query';
import { type CellValue, Column, type ColumnSpec, closeIn, column, type KubeContributor, kindRef, openIn, takes } from '@overkube/sdk';
import { useFields, usePage } from '@overkube/sdk/preact';
import type { Definition } from '@overweave/core';
import { inOrder } from '@overweave/ui';
import { useDefinitions } from '@overweave/ui/preact';
import { useComputed } from '@preact/signals';
import { useMemo } from 'preact/hooks';
import { type Failed, fieldOf } from './failures.ts';
import { EMPTY } from './format.ts';
import { T } from './texts.ts';

/*
 * The core's columns — data only: each a field (or a path) it sorts by and
 * the fields its cell is made of; its cell, of those values, the page's.
 * Every kind's: its objects' names (a link to each), namespaces, ages; the
 * usual kinds' own, as kubectl shows them; a CRD's, as it says them (its
 * columns, its fields) — each a default another's column of its name takes
 * the place of. And the columns a kind's table (or a resource's summary)
 * has: those the definitions and its CRD give, as its TableView sets them
 * out.
 */

const { core, apps, batch, networking, storage } = kinds;

/** A value as one: a path's (all of its values: a list) its first. */
const one = (v: CellValue): Value | null => (Array.isArray(v) ? ((v as readonly Value[])[0] ?? null) : (v as Value | null));
/** A ratio of two numbers: 1/2 (none: "—"). */
const ratio = ([a, b]: readonly CellValue[]) => {
  const [x, y] = [one(a), one(b)];
  return x === null ? EMPTY : `${x}/${y ?? 0}`;
};

/** An object's name, a link opening it over the page it is on (drawn again when the page goes elsewhere, not as things open over it). */
function NameLink({ kind, name, namespace }: { kind: KindInfo; name: string; namespace?: string }) {
  const page = usePage();
  const here = useComputed(() => closeIn(page.path.value)).value;
  return <a href={page.href(openIn(here, kind, { metadata: { name, namespace } }))}>{name}</a>;
}

/** The usual kinds' own columns (beside every kind's name, namespace, age), as kubectl shows them: [kind, header, spec]. */
const OWN: [KindInfo, string, Omit<ColumnSpec, 'target' | 'header'>][] = [
  [core.v1.Pod, 'Ready', { sort: 'pods.v1.ready', values: ['pods.v1.ready', 'pods.v1.containers'], format: ratio }],
  [core.v1.Pod, 'Status', { sort: 'pods.v1.status' }],
  [core.v1.Pod, 'Restarts', { sort: 'pods.v1.restarts' }],
  [core.v1.Pod, 'IP', { sort: 'pods.v1.ip', wide: true }],
  [core.v1.Pod, 'Node', { sort: 'pods.v1.node', wide: true }],
  ...([apps.v1.Deployment, apps.v1.StatefulSet, apps.v1.ReplicaSet] as const).flatMap((k): [KindInfo, string, Omit<ColumnSpec, 'target' | 'header'>][] => {
    const ref = kindRef(k);
    return [
      [k, 'Ready', { sort: `${ref}.ready`, values: [`${ref}.ready`, `${ref}.desired`], format: ratio }],
      ...(k === apps.v1.ReplicaSet ? [] : [[k, 'Up-to-date', { sort: `${ref}.updated` }] as [KindInfo, string, Omit<ColumnSpec, 'target' | 'header'>]]),
      ...(k === apps.v1.StatefulSet ? [] : [[k, 'Available', { sort: `${ref}.available` }] as [KindInfo, string, Omit<ColumnSpec, 'target' | 'header'>]]),
    ];
  }),
  [apps.v1.DaemonSet, 'Desired', { sort: 'daemonsets.v1.apps.desired' }],
  [apps.v1.DaemonSet, 'Ready', { sort: 'daemonsets.v1.apps.ready' }],
  [apps.v1.DaemonSet, 'Up-to-date', { sort: 'daemonsets.v1.apps.updated' }],
  [apps.v1.DaemonSet, 'Available', { sort: 'daemonsets.v1.apps.available' }],
  [batch.v1.Job, 'Completions', { sort: 'jobs.v1.batch.succeeded', values: ['jobs.v1.batch.succeeded', 'jobs.v1.batch.completions'], format: ratio }],
  [batch.v1.CronJob, 'Schedule', { sort: '.spec.schedule' }],
  [batch.v1.CronJob, 'Suspend', { sort: '.spec.suspend' }],
  [batch.v1.CronJob, 'Last Schedule', { sort: 'cronjobs.v1.batch.lastSchedule' }],
  [core.v1.Service, 'Type', { sort: '.spec.type' }],
  [core.v1.Service, 'Cluster-IP', { sort: '.spec.clusterIP' }],
  [core.v1.Service, 'Port(s)', { sort: '.spec.ports[*].port' }],
  [networking.v1.Ingress, 'Class', { sort: '.spec.ingressClassName' }],
  [networking.v1.Ingress, 'Hosts', { sort: '.spec.rules[*].host' }],
  [core.v1.Secret, 'Type', { sort: '.type' }],
  [core.v1.PersistentVolumeClaim, 'Status', { sort: '.status.phase' }],
  [core.v1.PersistentVolumeClaim, 'Volume', { sort: '.spec.volumeName' }],
  [core.v1.PersistentVolumeClaim, 'Capacity', { sort: '.status.capacity.storage' }],
  [core.v1.PersistentVolumeClaim, 'StorageClass', { sort: '.spec.storageClassName' }],
  [core.v1.PersistentVolume, 'Capacity', { sort: '.spec.capacity.storage' }],
  [core.v1.PersistentVolume, 'Status', { sort: '.status.phase' }],
  [core.v1.PersistentVolume, 'Claim', { sort: '.spec.claimRef.name' }],
  [storage.v1.StorageClass, 'Provisioner', { sort: '.provisioner' }],
  [core.v1.Node, 'Status', { sort: 'core.ready', format: ([s]) => (s === 'True' ? 'Ready' : s === null || s === undefined ? 'Unknown' : 'NotReady') }],
  [core.v1.Node, 'Roles', { sort: 'nodes.v1.roles' }],
  [core.v1.Node, 'Version', { sort: 'nodes.v1.version' }],
  [core.v1.Node, 'CPU', { sort: 'nodes.v1.cpu', wide: true }],
  [core.v1.Node, 'Memory', { sort: 'nodes.v1.memory', wide: true }],
  [core.v1.Namespace, 'Status', { sort: '.status.phase' }],
  [core.v1.Event, 'Last Seen', { sort: 'events.v1.lastSeen' }],
  [core.v1.Event, 'Type', { sort: '.type' }],
  [core.v1.Event, 'Reason', { sort: '.reason' }],
  [core.v1.Event, 'Object', { sort: '.involvedObject.name' }],
  [core.v1.Event, 'Message', { sort: '.message' }],
];

/** A column's name as kubectl heads it, for a definition's name: "Port(s)" port-s. */
const slug = (header: string) =>
  header
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** The core's columns, each a default another's of its name takes the place of: every kind's, the usual kinds' own. */
export function addColumns(c: KubeContributor): void {
  const fallback = { fallback: true };
  c.add(
    'Column',
    'core.name',
    column({
      header: T.columns.name,
      order: 0,
      // An Event's, as kubectl's: only when wide.
      wide: (k) => k.id === core.v1.Event.id,
      sort: 'core.name',
      values: ['core.name', 'core.namespace'],
      format: ([name, namespace], { kind }) => <NameLink kind={kind} name={String(name ?? '')} namespace={typeof namespace === 'string' ? namespace : undefined} />,
    }),
    fallback,
  );
  c.add('Column', 'core.namespace', column({ header: T.columns.namespace, order: 10, when: (k) => k.namespaced, sort: 'core.namespace' }), fallback);
  // An Event's age is its Last Seen.
  c.add('Column', 'core.age', column({ header: T.columns.age, order: 900, width: 90, when: (k) => k.id !== core.v1.Event.id, sort: 'core.created' }), fallback);
  for (const [i, [kind, header, spec]] of OWN.entries())
    c.add('Column', `core.${kind.id}.${slug(header)}`, column({ kinds: [kind], header, order: 100 + i * 10, ...spec }), fallback);
}

/** A column placed: its definition (or a CRD's column, made one), its cell's fields. */
export interface Placed {
  definition: Definition<ColumnSpec>;
  fields: readonly string[];
}

/** A column's fields: those its cell is made of (none said: the one it sorts by). */
const fieldsOfColumn = (spec: ColumnSpec): readonly string[] => spec.values ?? (spec.sort ? [spec.sort] : []);

/**
 * A kind's columns, as its tables (and a resource's summary) have them: the
 * definitions its target and when take (one whose when throws: not drawn,
 * its failure told), its CRD's columns (as it says them: its own fields;
 * one of the definitions' names in their place), set out as its TableView
 * says — those it names first; hidden as it says, else as the column is
 * (wide: only when the table is). With them, its fields' definitions (how
 * a column with no format of its own shows its values).
 */
export function useColumns(
  kind: KindInfo,
  view: { readonly columns?: readonly string[]; readonly hidden?: Readonly<Record<string, boolean>> },
  failed: Failed,
  wide = false,
): { placed: Placed[]; catalog: FieldCatalog | undefined } {
  const fields = useFields(kindRef(kind));
  // A field defined (an addon's) that cannot be: its owner's failure.
  for (const [name, why] of Object.entries(fields.rejected ?? {})) if (name) failed(fieldOf(name), 'Field', name, 'definition', new Error(why));
  const definitions = useDefinitions(Column);
  const placed = useMemo(() => {
    const all = definitions.filter((c) => {
      if (!takes(c.spec.target, kind)) return false;
      try {
        return c.spec.when?.(kind) ?? true;
      } catch (error) {
        failed(c, 'Column', c.name, 'when', error);
        return false;
      }
    });
    const named = new Set(all.map((c) => c.name));
    // Its CRD's, as it says them: after the name and namespace, before the age.
    const crd = (fields.columns ?? [])
      .map((k, i) => ({
        name: `core.${kind.id}.${slug(k.name)}`,
        spec: { target: { kinds: [kind.id] }, header: k.name, sort: k.field, wide: k.priority > 0, order: 100 + i * 10 } satisfies ColumnSpec,
      }))
      .filter((c) => !named.has(c.name)) as unknown as Definition<ColumnSpec>[];
    const shown = (c: Definition<ColumnSpec>) => {
      const hidden = view.hidden?.[c.name];
      if (hidden !== undefined) return !hidden;
      const w = c.spec.wide;
      try {
        return wide || !(typeof w === 'function' ? w(kind) : w);
      } catch (error) {
        failed(c, 'Column', c.name, 'wide', error);
        return true;
      }
    };
    return arranged([...all, ...crd], view)
      .filter(shown)
      .map((definition) => ({ definition, fields: fieldsOfColumn(definition.spec) }));
  }, [definitions, fields.columns, kind, view.columns, view.hidden, wide, failed]);
  return { placed, catalog: fields.catalog };
}

/** Columns as a TableView sets them out: those it names first, in its order; the others after, in theirs. */
function arranged<C extends { name: string; spec: { order?: number } }>(all: readonly C[], view: { readonly columns?: readonly string[] }): C[] {
  const order = [...new Set(view.columns ?? [])];
  return [...order.map((name) => all.find((c) => c.name === name)).filter((c): c is C => !!c), ...inOrder(all.filter((c) => !order.includes(c.name)))];
}
