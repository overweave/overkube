/*
 * The storage group's v1 types (generated) and how kubectl shows its kinds
 * (by hand: printers.go, v1.37.1 — printStorageClass, printStorageClassList,
 * printCSIDriver, printCSINode, printCSIStorageCapacity,
 * printVolumeAttachment, printVolumeAttributesClass).
 */

import type { CSIDriver, CSINode, CSIStorageCapacity, StorageClass, VolumeAttachment, VolumeAttributesClass } from '../../gen/storage/v1.js';
import { ageColumn, known, nameColumn, type PrinterColumn, quantityValue } from '../print.js';

export * from '../../gen/storage/v1.js';

/** Marked the default (the annotation, or its beta one, "true"). */
const marked = (c: StorageClass) =>
  c.metadata?.annotations?.['storageclass.kubernetes.io/is-default-class'] === 'true' || c.metadata?.annotations?.['storageclass.beta.kubernetes.io/is-default-class'] === 'true';

/** The default of these: of those marked, the newest; made at once, the first by name (getEffectiveDefaultStorageClass). */
function effectiveDefault(classes: readonly StorageClass[]): StorageClass | undefined {
  let found: StorageClass | undefined;
  for (const c of classes) {
    if (!marked(c)) continue;
    const at = Date.parse(c.metadata?.creationTimestamp ?? '') || 0;
    const best = Date.parse(found?.metadata?.creationTimestamp ?? '') || 0;
    if (!found || at > best || (at === best && (c.metadata?.name ?? '') < (found.metadata?.name ?? ''))) found = c;
  }
  return found;
}

export const storageClassColumns: PrinterColumn<StorageClass>[] = [
  // Its name — the default of those shown "(default)" after it (sorted by the name).
  {
    name: 'Name',
    type: 'string',
    format: 'name',
    value: (o) => o.metadata?.name,
    display: (o, { objects }) => {
      const name = o.metadata?.name ?? '';
      return effectiveDefault(objects)?.metadata?.name === name && name ? `${name} (default)` : name;
    },
  },
  { name: 'Provisioner', type: 'string', value: (o) => o.provisioner, display: (o) => o.provisioner },
  { name: 'ReclaimPolicy', type: 'string', value: (o) => o.reclaimPolicy ?? 'Delete', display: (o) => o.reclaimPolicy ?? 'Delete' },
  { name: 'VolumeBindingMode', type: 'string', value: (o) => o.volumeBindingMode ?? 'Immediate', display: (o) => o.volumeBindingMode ?? 'Immediate' },
  { name: 'AllowVolumeExpansion', type: 'string', value: (o) => o.allowVolumeExpansion ?? false, display: (o) => String(o.allowVolumeExpansion ?? false) },
  ageColumn,
];

export const csiDriverColumns: PrinterColumn<CSIDriver>[] = [
  nameColumn,
  { name: 'AttachRequired', type: 'boolean', value: (o) => o.spec.attachRequired ?? true, display: (o) => String(o.spec.attachRequired ?? true) },
  { name: 'PodInfoOnMount', type: 'boolean', value: (o) => o.spec.podInfoOnMount ?? false, display: (o) => String(o.spec.podInfoOnMount ?? false) },
  { name: 'StorageCapacity', type: 'boolean', value: (o) => o.spec.storageCapacity ?? false, display: (o) => String(o.spec.storageCapacity ?? false) },
  {
    name: 'TokenRequests',
    type: 'string',
    value: (o) => known(o.spec.tokenRequests?.map((t) => t.audience).join(',')),
    display: (o) => o.spec.tokenRequests?.map((t) => t.audience).join(',') ?? '<unset>',
  },
  { name: 'RequiresRepublish', type: 'boolean', value: (o) => o.spec.requiresRepublish ?? false, display: (o) => String(o.spec.requiresRepublish ?? false) },
  {
    name: 'Modes',
    type: 'string',
    value: (o) => (o.spec.volumeLifecycleModes ?? []).join(',') || undefined,
    display: (o) => (o.spec.volumeLifecycleModes ?? []).join(',') || '<none>',
  },
  ageColumn,
];

export const csiNodeColumns: PrinterColumn<CSINode>[] = [
  nameColumn,
  { name: 'Drivers', type: 'integer', value: (o) => o.spec.drivers?.length ?? 0, display: (o) => String(o.spec.drivers?.length ?? 0) },
  ageColumn,
];

export const csiStorageCapacityColumns: PrinterColumn<CSIStorageCapacity>[] = [
  nameColumn,
  { name: 'StorageClassName', type: 'string', value: (o) => o.storageClassName, display: (o) => o.storageClassName },
  { name: 'Capacity', type: 'string', value: (o) => quantityValue(o.capacity), display: (o) => (o.capacity === undefined ? '<unset>' : String(o.capacity)) },
];

export const volumeAttachmentColumns: PrinterColumn<VolumeAttachment>[] = [
  nameColumn,
  // Marked a name as kubectl marks it.
  { name: 'Attacher', type: 'string', format: 'name', value: (o) => o.spec.attacher, display: (o) => o.spec.attacher },
  { name: 'PV', type: 'string', value: (o) => o.spec.source.persistentVolumeName, display: (o) => o.spec.source.persistentVolumeName ?? '' },
  { name: 'Node', type: 'string', value: (o) => o.spec.nodeName, display: (o) => o.spec.nodeName },
  { name: 'Attached', type: 'boolean', value: (o) => o.status?.attached ?? false, display: (o) => String(o.status?.attached ?? false) },
  ageColumn,
];

export const volumeAttributesClassColumns: PrinterColumn<VolumeAttributesClass>[] = [
  nameColumn,
  { name: 'DriverName', type: 'string', value: (o) => o.driverName, display: (o) => o.driverName },
  ageColumn,
];
