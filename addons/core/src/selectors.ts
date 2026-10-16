/*
 * A label selector (a workload's, a service's, a policy's) as a filter of a
 * kind's page (CEL: those it picks, as kubectl's -l does) — the core's
 * links from a selector, a label, to the objects of it.
 */

export type Selector = { matchLabels?: Record<string, string>; matchExpressions?: { key: string; operator: string; values?: string[] }[] };

/** A label's value, "" where it has none (as a filter says it: a where's). */
const labelOf = (key: string) => `labels[?${JSON.stringify(key)}].orValue("")`;

/** A label selector as a filter (CEL: those it picks, as kubectl's -l does), in a namespace if given (none, nothing to pick: every one, or every one of it). */
export function selectorFilter(selector: Selector | undefined, namespace?: string): string {
  const had = (key: string) => `${JSON.stringify(key)} in labels`;
  // A value of "" is a label had with none (not one not had).
  const equal = (key: string, value: string) => (value === '' ? `${had(key)} && ${labelOf(key)} == ""` : `${labelOf(key)} == ${JSON.stringify(value)}`);
  const tests = [
    ...Object.entries(selector?.matchLabels ?? {}).map(([k, v]) => equal(k, v)),
    ...(selector?.matchExpressions ?? []).map(({ key, operator, values = [] }) => {
      const among = `${labelOf(key)} in ${JSON.stringify(values)}`;
      if (operator === 'In') return values.includes('') ? `${had(key)} && ${among}` : among;
      if (operator === 'NotIn') return values.includes('') ? `!(${had(key)} && ${among})` : `!(${among})`;
      if (operator === 'Exists') return had(key);
      if (operator === 'DoesNotExist') return `!(${had(key)})`;
      return 'false';
    }),
  ];
  return [...(namespace ? [`namespace_ == ${JSON.stringify(namespace)}`] : []), ...tests].join(' && ');
}
