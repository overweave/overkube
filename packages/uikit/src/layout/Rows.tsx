import type { ComponentChildren } from 'preact';

/*
 * Rows, ruled: a line each — its mark apart (a state's icon), what leads it,
 * what ends it (quiet: a time, a count); what is under it (quiet, smaller:
 * why, a message) lined up with what leads it, not its mark; more under that
 * (children). Words on one baseline, what is no word (an icon, a button) by
 * the line's middle.
 */

/** The rows, ruled. */
export function Rows({ children }: { children: ComponentChildren }) {
  return <div class="uk-rows">{children}</div>;
}

export interface RowProps {
  /** Its mark apart, before what leads it (a state's icon). */
  mark?: ComponentChildren;
  /** What leads it (its name, what is said of it beside). */
  lead: ComponentChildren;
  /** At its end, quiet (a time, a count). */
  end?: ComponentChildren;
  /** Under it, quiet (why, a message). */
  under?: ComponentChildren;
  children?: ComponentChildren;
}

export function Row({ mark, lead, end, under, children }: RowProps) {
  return (
    <div class="uk-row" data-mark={mark === undefined ? undefined : ''}>
      {mark !== undefined && <span class="uk-row-mark">{mark}</span>}
      <div class="uk-row-lead">{lead}</div>
      {end !== undefined && <div class="uk-row-end">{end}</div>}
      {under !== undefined && <div class="uk-row-under">{under}</div>}
      {children}
    </div>
  );
}
