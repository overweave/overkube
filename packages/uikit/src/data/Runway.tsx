import type { ComponentChildren } from 'preact';

/*
 * Things on one time axis, a row each (certificates: how long each holds):
 * its lead, then a bar from now to its end — the soon ones short, the long
 * ones long; one ended, back from now — its level's tone, what is said at
 * the bar's end; none (not known yet): what is said alone. The axis's ticks
 * as the caller says them (the kit knows no days). Where it is narrow, each
 * lead above its lane, the axis's ends alone.
 */

export interface RunwayRow {
  key: string;
  lead: ComponentChildren;
  /** Its end, in the axis's units from now (ended: below 0); none: not known. */
  at?: number | undefined;
  said: ComponentChildren;
  level?: 'warn' | 'error' | undefined;
  title?: string;
}

export function Runway({ rows, from, to, ticks }: { rows: readonly RunwayRow[]; from: number; to: number; ticks: readonly { at: number; label: string }[] }) {
  const x = (v: number) => `${((Math.min(to, Math.max(from, v)) - from) / (to - from)) * 100}%`;
  return (
    <div class="uk-runway-wrap">
      <div class="uk-runway" style={{ '--now': x(0) }}>
        <span />
        <div class="uk-runway-axis" aria-hidden="true">
          {ticks.map((t) => (
            <span key={t.at} style={{ left: x(t.at) }}>
              {t.label}
            </span>
          ))}
        </div>
        {rows.flatMap((r) => [
          <span key={`${r.key}-lead`} class="uk-runway-lead" title={r.title}>
            {r.lead}
          </span>,
          <div key={`${r.key}-lane`} class="uk-runway-lane">
            {r.at !== undefined && (
              <span
                class="uk-runway-bar"
                data-level={r.level}
                style={r.at < 0 ? { left: x(r.at), right: `calc(100% - ${x(0)})` } : { left: x(0), width: `calc(${x(r.at)} - ${x(0)})` }}
              />
            )}
            <span class="uk-runway-said" data-level={r.level} style={{ left: x(Math.max(r.at ?? 0, 0)) }}>
              {r.said}
            </span>
          </div>,
        ])}
      </div>
    </div>
  );
}
