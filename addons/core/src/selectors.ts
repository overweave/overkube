import { selectorCel } from '@overkube/cel';
import { type LabelSelector, requirementsOf } from '@overkube/query';

/*
 * A label selector (a workload's, a service's, a policy's) as a filter of a
 * kind's page (CEL: those it picks, as kubectl's -l does) — the core's
 * links from a selector, a label, to the objects of it.
 */

export type Selector = LabelSelector;

/** A label selector as a filter (CEL: those it picks, as kubectl's -l does), in a namespace if given (none, nothing to pick: every one, or every one of it). */
export function selectorFilter(selector: Selector | undefined, namespace?: string): string {
  const picks = selectorCel(requirementsOf(selector));
  return [...(namespace ? [`namespace_ == ${JSON.stringify(namespace)}`] : []), ...(picks ? [picks] : [])].join(' && ');
}
