/*
 * The resource.k8s.io group's v1 types (generated) and how kubectl shows its
 * kinds (by hand: printers.go, v1.37.1 — printDeviceClass,
 * printResourceClaim, resourceClaimState, printResourceClaimTemplate,
 * printResourceSlice).
 */

import type { DeviceClass, ResourceClaim, ResourceClaimTemplate, ResourceSlice } from '../../gen/resource/v1.js';
import { ageColumn, known, nameColumn, type PrinterColumn } from '../print.js';

export * from '../../gen/resource/v1.js';

export const deviceClassColumns: PrinterColumn<DeviceClass>[] = [nameColumn, ageColumn];

/** A claim's state: deleted; pending (not allocated, not deleted), or allocated (and reserved, if for any) — comma-joined (resourceClaimState). */
function claimState(o: ResourceClaim): string {
  const states: string[] = [];
  if (o.metadata?.deletionTimestamp) states.push('deleted');
  if (!o.status?.allocation) {
    if (!o.metadata?.deletionTimestamp) states.push('pending');
  } else {
    states.push('allocated');
    if (o.status.reservedFor?.length) states.push('reserved');
  }
  return states.join(',');
}

export const resourceClaimColumns: PrinterColumn<ResourceClaim>[] = [
  nameColumn,
  { name: 'State', type: 'string', value: (o) => known(claimState(o)), display: claimState },
  ageColumn,
];

export const resourceClaimTemplateColumns: PrinterColumn<ResourceClaimTemplate>[] = [nameColumn, ageColumn];

export const resourceSliceColumns: PrinterColumn<ResourceSlice>[] = [
  nameColumn,
  { name: 'Node', type: 'string', value: (o) => o.spec.nodeName, display: (o) => o.spec.nodeName ?? '' },
  { name: 'Driver', type: 'string', value: (o) => o.spec.driver, display: (o) => o.spec.driver },
  { name: 'Pool', type: 'string', value: (o) => o.spec.pool.name, display: (o) => o.spec.pool.name },
  ageColumn,
];
