/*
 * The events.k8s.io group's v1 types (generated) and how kubectl shows its
 * kinds (by hand: printers.go, v1.37.1 — printEvent, as the API server
 * converts an events.k8s.io event first: regarding its object, note its
 * message, its deprecated fields the core event's).
 */

import type { Event } from '../../gen/events/v1.js';
import { known, nameColumn, type PrinterColumn, since, time } from '../print.js';

export * from '../../gen/events/v1.js';

/** When it was first seen: its deprecated first timestamp, else its eventTime. */
const firstSeen = (o: Event) => o.deprecatedFirstTimestamp || o.eventTime;

/** When it was last seen: its series' last, else its deprecated last timestamp, else when it was first seen. */
const lastSeen = (o: Event) => (o.series ? o.series.lastObservedTime : o.deprecatedLastTimestamp || firstSeen(o));

/** The object it is about, kind/name (the kind lowercased). */
function regarding(o: Event): string {
  const kind = (o.regarding?.kind ?? '').toLowerCase();
  return o.regarding?.name ? `${kind}/${o.regarding.name}` : kind;
}

/** Who reported it: the component, ", instance" after it. */
function source(o: Event): string {
  const component = o.deprecatedSource?.component || o.reportingController || '';
  const instance = o.deprecatedSource?.host || o.reportingInstance || '';
  return instance ? `${component}, ${instance}` : component;
}

/** How many times it happened: its series' count, else its own (0: once). */
const times = (o: Event) => (o.series ? o.series.count : o.deprecatedCount || 1);

export const eventColumns: PrinterColumn<Event>[] = [
  { name: 'Last Seen', type: 'string', value: (o) => time(lastSeen(o)), display: (o, { now }) => since(lastSeen(o), now) },
  { name: 'Type', type: 'string', value: (o) => o.type, display: (o) => o.type ?? '' },
  { name: 'Reason', type: 'string', value: (o) => o.reason, display: (o) => o.reason ?? '' },
  { name: 'Object', type: 'string', value: (o) => known(regarding(o)), display: regarding },
  { name: 'Subobject', type: 'string', priority: 1, value: (o) => o.regarding?.fieldPath, display: (o) => o.regarding?.fieldPath ?? '' },
  { name: 'Source', type: 'string', priority: 1, value: (o) => known(source(o)), display: source },
  { name: 'Message', type: 'string', value: (o) => (o.note ?? '').trim() || undefined, display: (o) => (o.note ?? '').trim() },
  { name: 'First Seen', type: 'string', priority: 1, value: (o) => time(firstSeen(o)), display: (o, { now }) => since(firstSeen(o), now) },
  { name: 'Count', type: 'string', priority: 1, value: times, display: (o) => String(times(o)) },
  { ...nameColumn, priority: 1 },
];
