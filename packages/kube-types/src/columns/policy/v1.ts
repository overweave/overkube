/*
 * The policy group's v1 types (generated) and how kubectl shows its kinds
 * (by hand: printers.go, v1.37.1 — printPodDisruptionBudget).
 */

import type { PodDisruptionBudget } from '../../gen/policy/v1.js';
import { ageColumn, nameColumn, type PrinterColumn } from '../print.js';

export * from '../../gen/policy/v1.js';

export const podDisruptionBudgetColumns: PrinterColumn<PodDisruptionBudget>[] = [
  nameColumn,
  // A number or a percentage, as given; none: "N/A".
  {
    name: 'Min Available',
    type: 'string',
    value: (o) => o.spec?.minAvailable,
    display: (o) => (o.spec?.minAvailable === undefined ? 'N/A' : String(o.spec.minAvailable)),
  },
  {
    name: 'Max Unavailable',
    type: 'string',
    value: (o) => o.spec?.maxUnavailable,
    display: (o) => (o.spec?.maxUnavailable === undefined ? 'N/A' : String(o.spec.maxUnavailable)),
  },
  {
    name: 'Allowed Disruptions',
    type: 'integer',
    value: (o) => o.status?.disruptionsAllowed ?? 0,
    display: (o) => String(o.status?.disruptionsAllowed ?? 0),
  },
  ageColumn,
];
