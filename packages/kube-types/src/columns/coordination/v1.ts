/*
 * The coordination.k8s.io group's v1 types (generated) and how kubectl shows
 * its kinds (by hand: printers.go, v1.37.1 — printLease).
 */

import type { Lease } from '../../gen/coordination/v1.js';
import { ageColumn, nameColumn, type PrinterColumn } from '../print.js';

export * from '../../gen/coordination/v1.js';

export const leaseColumns: PrinterColumn<Lease>[] = [
  nameColumn,
  { name: 'Holder', type: 'string', value: (o) => o.spec?.holderIdentity, display: (o) => o.spec?.holderIdentity ?? '' },
  ageColumn,
];
