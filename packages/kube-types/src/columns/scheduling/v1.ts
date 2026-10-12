/*
 * The scheduling.k8s.io group's v1 types (generated) and how kubectl shows
 * its kinds (by hand: printers.go, v1.37.1 — printPriorityClass).
 */

import type { PriorityClass } from '../../gen/scheduling/v1.js';
import { ageColumn, nameColumn, type PrinterColumn } from '../print.js';

export * from '../../gen/scheduling/v1.js';

export const priorityClassColumns: PrinterColumn<PriorityClass>[] = [
  nameColumn,
  { name: 'Value', type: 'integer', value: (o) => o.value, display: (o) => String(o.value) },
  { name: 'Global-Default', type: 'boolean', value: (o) => o.globalDefault ?? false, display: (o) => String(o.globalDefault ?? false) },
  ageColumn,
  // Not marked wide in kubectl's columns, though its printer fills it only with -o wide: shown, as the columns say.
  { name: 'PreemptionPolicy', type: 'string', value: (o) => o.preemptionPolicy, display: (o) => o.preemptionPolicy ?? '' },
];
