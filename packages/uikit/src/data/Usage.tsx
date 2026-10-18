import { Sparkline } from './Sparkline';

/*
 * How much of something is used now, as kubectl top says it (a pod's CPU,
 * a node's memory): its number and unit — near its limit (over 85%), a
 * warning; over it, an error; with no limit, plain. What it went through
 * (history), a sparkline before it: in a column of them the lines stand
 * in a row, whatever each number's length. Its title (the requests, the
 * limit), a tip.
 */
export function Usage({ value, unit = '', limit, history, title }: { value: number; unit?: string; limit?: number; history?: readonly number[]; title?: string }) {
  const level = limit === undefined ? undefined : value > limit ? 'error' : value > limit * 0.85 ? 'warn' : undefined;
  return (
    <span class="uk-usage" title={title}>
      {history && <Sparkline points={history} />}
      <span class="uk-usage-value" data-level={level}>
        {value}
        {unit && <span class="uk-usage-unit">{unit}</span>}
      </span>
    </span>
  );
}
