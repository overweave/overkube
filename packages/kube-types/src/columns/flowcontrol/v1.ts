/*
 * The flowcontrol.apiserver.k8s.io group's v1 types (generated) and how
 * kubectl shows its kinds (by hand: printers.go, v1.37.1 — printFlowSchema,
 * printPriorityLevelConfiguration).
 */

import type { FlowSchema, PriorityLevelConfiguration } from '../../gen/flowcontrol/v1.js';
import { ageColumn, nameColumn, type PrinterColumn } from '../print.js';

export * from '../../gen/flowcontrol/v1.js';

export const flowSchemaColumns: PrinterColumn<FlowSchema>[] = [
  nameColumn,
  {
    name: 'PriorityLevel',
    type: 'string',
    value: (o) => o.spec?.priorityLevelConfiguration.name,
    display: (o) => o.spec?.priorityLevelConfiguration.name ?? '',
  },
  { name: 'MatchingPrecedence', type: 'string', value: (o) => o.spec?.matchingPrecedence ?? 0, display: (o) => String(o.spec?.matchingPrecedence ?? 0) },
  {
    name: 'DistinguisherMethod',
    type: 'string',
    value: (o) => o.spec?.distinguisherMethod?.type,
    display: (o) => o.spec?.distinguisherMethod?.type ?? '<none>',
  },
  ageColumn,
  // Its Dangling condition's status (its priority level missing); none: "?".
  {
    name: 'MissingPL',
    type: 'string',
    value: (o) => o.status?.conditions?.find((c) => c.type === 'Dangling')?.status,
    display: (o) => o.status?.conditions?.find((c) => c.type === 'Dangling')?.status ?? '?',
  },
];

/** A limited level's: its shares, its queuing's queues, hand size, queue length; else "<none>" each. */
const limited = (o: PriorityLevelConfiguration) => o.spec?.limited;

export const priorityLevelConfigurationColumns: PrinterColumn<PriorityLevelConfiguration>[] = [
  nameColumn,
  { name: 'Type', type: 'string', value: (o) => o.spec?.type, display: (o) => o.spec?.type ?? '' },
  {
    name: 'NominalConcurrencyShares',
    type: 'string',
    value: (o) => (limited(o) ? (limited(o)?.nominalConcurrencyShares ?? 0) : undefined),
    display: (o) => (limited(o) ? String(limited(o)?.nominalConcurrencyShares ?? 0) : '<none>'),
  },
  {
    name: 'Queues',
    type: 'string',
    value: (o) => limited(o)?.limitResponse?.queuing?.queues,
    display: (o) => String(limited(o)?.limitResponse?.queuing?.queues ?? '<none>'),
  },
  {
    name: 'HandSize',
    type: 'string',
    value: (o) => limited(o)?.limitResponse?.queuing?.handSize,
    display: (o) => String(limited(o)?.limitResponse?.queuing?.handSize ?? '<none>'),
  },
  {
    name: 'QueueLengthLimit',
    type: 'string',
    value: (o) => limited(o)?.limitResponse?.queuing?.queueLengthLimit,
    display: (o) => String(limited(o)?.limitResponse?.queuing?.queueLengthLimit ?? '<none>'),
  },
  ageColumn,
];
