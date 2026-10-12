/*
 * The apps group's v1 types (generated) and how kubectl shows its kinds (by
 * hand: printers.go, v1.37.1 — printDeployment, printStatefulSet,
 * printDaemonSet, printReplicaSet, printControllerRevision). A replica count
 * not given is 1, as the API defaults it. Ready ("1/2"): sorted by those
 * ready.
 */

import type { ControllerRevision, DaemonSet, Deployment, ReplicaSet, StatefulSet } from '../../gen/apps/v1.js';
import { ageColumn, containerCells, formatLabelSelector, formatLabels, known, nameColumn, type PrinterColumn, ratio, selectorString } from '../print.js';

export * from '../../gen/apps/v1.js';

export const deploymentColumns: PrinterColumn<Deployment>[] = [
  nameColumn,
  {
    name: 'Ready',
    type: 'string',
    value: (o) => ratio(o.status?.readyReplicas ?? 0, o.spec?.replicas ?? 1),
    display: (o) => `${o.status?.readyReplicas ?? 0}/${o.spec?.replicas ?? 1}`,
  },
  { name: 'Up-to-date', type: 'string', value: (o) => o.status?.updatedReplicas ?? 0, display: (o) => String(o.status?.updatedReplicas ?? 0) },
  { name: 'Available', type: 'string', value: (o) => o.status?.availableReplicas ?? 0, display: (o) => String(o.status?.availableReplicas ?? 0) },
  ageColumn,
  {
    name: 'Containers',
    type: 'string',
    priority: 1,
    value: (o) => known(containerCells(o.spec?.template?.spec?.containers).names),
    display: (o) => containerCells(o.spec?.template?.spec?.containers).names,
  },
  {
    name: 'Images',
    type: 'string',
    priority: 1,
    value: (o) => known(containerCells(o.spec?.template?.spec?.containers).images),
    display: (o) => containerCells(o.spec?.template?.spec?.containers).images,
  },
  // As the selector's string: nothing in it, empty (not "<none>"); one not to be read, "<invalid>".
  {
    name: 'Selector',
    type: 'string',
    priority: 1,
    value: (o) => known(selectorString(o.spec?.selector)),
    display: (o) => selectorString(o.spec?.selector) ?? '<invalid>',
  },
];

export const statefulSetColumns: PrinterColumn<StatefulSet>[] = [
  nameColumn,
  {
    name: 'Ready',
    type: 'string',
    value: (o) => ratio(o.status?.readyReplicas ?? 0, o.spec?.replicas ?? 1),
    display: (o) => `${o.status?.readyReplicas ?? 0}/${o.spec?.replicas ?? 1}`,
  },
  ageColumn,
  {
    name: 'Containers',
    type: 'string',
    priority: 1,
    value: (o) => known(containerCells(o.spec?.template?.spec?.containers).names),
    display: (o) => containerCells(o.spec?.template?.spec?.containers).names,
  },
  {
    name: 'Images',
    type: 'string',
    priority: 1,
    value: (o) => known(containerCells(o.spec?.template?.spec?.containers).images),
    display: (o) => containerCells(o.spec?.template?.spec?.containers).images,
  },
];

export const daemonSetColumns: PrinterColumn<DaemonSet>[] = [
  nameColumn,
  { name: 'Desired', type: 'integer', value: (o) => o.status?.desiredNumberScheduled ?? 0, display: (o) => String(o.status?.desiredNumberScheduled ?? 0) },
  { name: 'Current', type: 'integer', value: (o) => o.status?.currentNumberScheduled ?? 0, display: (o) => String(o.status?.currentNumberScheduled ?? 0) },
  { name: 'Ready', type: 'integer', value: (o) => o.status?.numberReady ?? 0, display: (o) => String(o.status?.numberReady ?? 0) },
  { name: 'Up-to-date', type: 'integer', value: (o) => o.status?.updatedNumberScheduled ?? 0, display: (o) => String(o.status?.updatedNumberScheduled ?? 0) },
  { name: 'Available', type: 'integer', value: (o) => o.status?.numberAvailable ?? 0, display: (o) => String(o.status?.numberAvailable ?? 0) },
  {
    name: 'Node Selector',
    type: 'string',
    value: (o) => known(formatLabels(o.spec?.template?.spec?.nodeSelector)),
    display: (o) => formatLabels(o.spec?.template?.spec?.nodeSelector),
  },
  ageColumn,
  {
    name: 'Containers',
    type: 'string',
    priority: 1,
    value: (o) => known(containerCells(o.spec?.template?.spec?.containers).names),
    display: (o) => containerCells(o.spec?.template?.spec?.containers).names,
  },
  {
    name: 'Images',
    type: 'string',
    priority: 1,
    value: (o) => known(containerCells(o.spec?.template?.spec?.containers).images),
    display: (o) => containerCells(o.spec?.template?.spec?.containers).images,
  },
  { name: 'Selector', type: 'string', priority: 1, value: (o) => known(selectorString(o.spec?.selector)), display: (o) => formatLabelSelector(o.spec?.selector) },
];

export const replicaSetColumns: PrinterColumn<ReplicaSet>[] = [
  nameColumn,
  { name: 'Desired', type: 'integer', value: (o) => o.spec?.replicas ?? 1, display: (o) => String(o.spec?.replicas ?? 1) },
  { name: 'Current', type: 'integer', value: (o) => o.status?.replicas ?? 0, display: (o) => String(o.status?.replicas ?? 0) },
  { name: 'Ready', type: 'integer', value: (o) => o.status?.readyReplicas ?? 0, display: (o) => String(o.status?.readyReplicas ?? 0) },
  ageColumn,
  {
    name: 'Containers',
    type: 'string',
    priority: 1,
    value: (o) => known(containerCells(o.spec?.template?.spec?.containers).names),
    display: (o) => containerCells(o.spec?.template?.spec?.containers).names,
  },
  {
    name: 'Images',
    type: 'string',
    priority: 1,
    value: (o) => known(containerCells(o.spec?.template?.spec?.containers).images),
    display: (o) => containerCells(o.spec?.template?.spec?.containers).images,
  },
  { name: 'Selector', type: 'string', priority: 1, value: (o) => known(selectorString(o.spec?.selector)), display: (o) => formatLabelSelector(o.spec?.selector) },
];

/** Its controller as kind.group/name, lowercased (formatResourceName); none: undefined. */
function controller(o: ControllerRevision): string | undefined {
  const ref = o.metadata?.ownerReferences?.find((r) => r.controller);
  if (!ref) return undefined;
  const group = ref.apiVersion.includes('/') ? ref.apiVersion.split('/')[0] : '';
  return `${(group ? `${ref.kind}.${group}` : ref.kind).toLowerCase()}/${ref.name}`;
}

export const controllerRevisionColumns: PrinterColumn<ControllerRevision>[] = [
  nameColumn,
  { name: 'Controller', type: 'string', value: controller, display: (o) => controller(o) ?? '<none>' },
  { name: 'Revision', type: 'string', value: (o) => o.revision, display: (o) => String(o.revision) },
  ageColumn,
];
