import type { ComponentChildren } from 'preact';
import { Icon } from '../display/Icon';
import { Tip } from '../overlays/Tip';

/*
 * How bad what a scanner found is (a vulnerability's, a failed check's
 * severity): each severity its colour, critical the worst. As a state is
 * drawn (a shield in its colour, its word beside it; what it means in
 * full, its tip), a count
 * (none: a quiet dash), counts in a line, totals (large), a matrix (a row
 * each — its lead, under it what it is of; a column a severity, numbers
 * only — or one thing said across them: being scanned), and a filter (a
 * toggle each severity there is some of). The words are the caller's: the
 * kit knows the severities, not what they are called.
 */

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'unknown';

/** The worst first. */
export const SEVERITIES: readonly Severity[] = ['critical', 'high', 'medium', 'low', 'unknown'];

/** How many of each. */
export type SeverityCounts = Readonly<Record<Severity, number>>;

/** What each is called (the caller's words). */
export type SeverityWords = Readonly<Record<Severity, string>>;

/** The worst there is some of (none of any: none). */
export const worstOf = (counts: SeverityCounts): Severity | undefined => SEVERITIES.find((s) => counts[s] > 0);

/**
 * A severity as a state is drawn (Status): a shield in its colour, its
 * word beside it (in its colour too); no word, the shield alone — its word
 * its name for those who cannot see it.
 */
export function SeverityStatus({ severity, title, children }: { severity: Severity; title?: string; children?: ComponentChildren }) {
  const alone = children === undefined;
  const status = (
    <span class="uk-status uk-sev-status" data-sev={severity} {...(alone ? { role: 'img', 'aria-label': title ?? severity } : {})}>
      <Icon name="shield" />
      {!alone && <span class="uk-status-text">{children}</span>}
    </span>
  );
  return title ? <Tip content={() => title}>{status}</Tip> : status;
}

/** A count in its colour; none, a quiet dash. */
export function SeverityCount({ severity, value }: { severity: Severity; value: number }) {
  return (
    <span class="uk-sev-n" data-sev={severity}>
      {value || ''}
    </span>
  );
}

/** Those there are some of, in a line: each its count (in its colour), its word. */
export function SeverityTally({ counts, words }: { counts: SeverityCounts; words: SeverityWords }) {
  return (
    <span class="uk-sev-tally">
      {SEVERITIES.filter((s) => counts[s]).map((s) => (
        <span key={s}>
          <b data-sev={s}>{counts[s]}</b> {words[s]}
        </span>
      ))}
    </span>
  );
}

/** Each severity's total, large, its word over it. */
export function SeverityTotals({ counts, words }: { counts: SeverityCounts; words: SeverityWords }) {
  return (
    <div class="uk-sev-totals">
      {SEVERITIES.map((s) => (
        <div key={s}>
          <span>{words[s]}</span>
          <b data-sev={s}>{counts[s]}</b>
        </div>
      ))}
    </div>
  );
}

export interface SeverityRow {
  key: string;
  /** Its mark, before what leads it. */
  mark?: ComponentChildren;
  /** What leads it (a name, badges). */
  lead: ComponentChildren;
  /** Under what leads it, quiet (what it is of: an image). */
  under?: ComponentChildren;
  /** Its counts — or, none, what is said across them (being scanned). */
  counts?: SeverityCounts;
  instead?: ComponentChildren;
  /** Its tip (an image in full). */
  title?: string;
}

/**
 * A row each, a column a severity (its word over it; those asked, none: all
 * five): numbers only — its lead's head given, over its leads; under them,
 * quiet, what is said of all of them (by what, when: its parts at its ends).
 */
export function SeverityMatrix({
  words,
  rows,
  severities = SEVERITIES,
  head,
  foot,
}: {
  words: SeverityWords;
  rows: readonly SeverityRow[];
  severities?: readonly Severity[];
  head?: ComponentChildren;
  foot?: ComponentChildren;
}) {
  return (
    <div class="uk-sev-matrix" style={{ '--uk-sev-cols': severities.length }}>
      <span class="uk-sev-h">{head}</span>
      {severities.map((s) => (
        <span key={s} class="uk-sev-h">
          {words[s]}
        </span>
      ))}
      {rows.flatMap((r) => [
        <span key={`${r.key}:lead`} class="uk-sev-lead" title={r.title}>
          <span>
            {r.mark}
            {r.lead}
          </span>
          {r.under !== undefined && (
            <span class="uk-sev-under" data-marked={r.mark === undefined ? undefined : ''}>
              {r.under}
            </span>
          )}
        </span>,
        ...(r.counts
          ? severities.map((s) => <SeverityCount key={`${r.key}:${s}`} severity={s} value={r.counts?.[s] ?? 0} />)
          : [
              <span key={`${r.key}:instead`} class="uk-sev-instead">
                {r.instead}
              </span>,
            ]),
      ])}
      {foot !== undefined && <div class="uk-sev-foot">{foot}</div>}
    </div>
  );
}

/** A toggle each severity there is some of (its count, its word): those pressed shown. */
export function SeverityFilter({
  counts,
  words,
  shown,
  onChange,
}: {
  counts: SeverityCounts;
  words: SeverityWords;
  shown: ReadonlySet<Severity>;
  onChange: (shown: ReadonlySet<Severity>) => void;
}) {
  const toggled = (s: Severity) => {
    const next = new Set(shown);
    if (!next.delete(s)) next.add(s);
    return next;
  };
  return (
    <span class="uk-sev-filter">
      {SEVERITIES.filter((s) => counts[s]).map((s) => (
        <button key={s} type="button" class="uk-sev-toggle" aria-pressed={shown.has(s)} onClick={() => onChange(toggled(s))}>
          <b data-sev={s}>{counts[s]}</b>
          {words[s]}
        </button>
      ))}
    </span>
  );
}
