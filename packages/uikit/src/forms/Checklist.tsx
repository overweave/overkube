import { useState } from 'preact/hooks';
import { Icon } from '../display/Icon';
import { Tip } from '../overlays/Tip';

/*
 * Things turned on and off, grouped (a table's columns, by where they come
 * from): a filter over them; each group its check — all on, none, some (a
 * dash) — turning the whole of it on or off at once (filtered, those of
 * it shown), then each of its items; one locked (always on) not to be
 * turned off (still reached by the keyboard, said so). Under them, how many
 * are on, and back to the defaults. Its body scrolls; the filter and the
 * foot stay. What an item is and where it is from: its hint, in its tip
 * (the filter reads it) — a locked one's, said so there too.
 */

export interface ChecklistItem {
  id: string;
  label: string;
  on: boolean;
  /** Always on: not to be turned off. */
  locked?: boolean;
  /** What it is, where it is from (searched; in its tip). */
  hint?: string;
}

export interface ChecklistGroup {
  id: string;
  title: string;
  /** Beside its title, quiet: where it comes from. */
  note?: string;
  items: ChecklistItem[];
}

export interface ChecklistLabels {
  filter: string;
  /** How many are on, of how many. */
  shown: (on: number, all: number) => string;
  reset: string;
  locked: string;
  none: string;
}

export const CHECKLIST_LABELS: ChecklistLabels = {
  filter: 'Filter',
  shown: (on, all) => `${on} of ${all} shown`,
  reset: 'Reset to defaults',
  locked: 'Always shown',
  none: 'Nothing matches',
};

/** Its check: on, off — a group's, some of it on (a dash). */
function Check({ state }: { state: boolean | 'mixed' }) {
  return (
    <span class="uk-check" aria-hidden="true">
      {state === 'mixed' ? <span class="uk-check-mixed" /> : state ? <Icon name="check" /> : null}
    </span>
  );
}

export function Checklist({
  groups,
  onChange,
  onReset,
  labels = CHECKLIST_LABELS,
}: {
  groups: ChecklistGroup[];
  /** Some turned on or off (a group's: all of it but those locked). */
  onChange: (ids: string[], on: boolean) => void;
  /** Back to the defaults (none: no such button). */
  onReset?: () => void;
  labels?: ChecklistLabels;
}) {
  const [filter, setFilter] = useState('');
  const q = filter.trim().toLowerCase();
  const all = groups.flatMap((g) => g.items);
  const matched = groups
    .map((g) => ({ ...g, shown: g.items.filter((i) => !q || i.label.toLowerCase().includes(q) || i.hint?.toLowerCase().includes(q)) }))
    .filter((g) => g.shown.length);
  return (
    <div class="uk-checklist">
      <div class="uk-ms-search">
        <Icon name="search" />
        <input aria-label={labels.filter} placeholder={labels.filter} value={filter} onInput={(e) => setFilter((e.target as HTMLInputElement).value)} />
      </div>
      <div class="uk-checklist-body">
        {matched.length === 0 && <div class="uk-ms-empty">{labels.none}</div>}
        {matched.map((g) => {
          const on = g.items.filter((i) => i.on).length;
          const state = on === g.items.length ? true : on === 0 ? false : 'mixed';
          // At once: those of it shown (all, or those the filter leaves), those locked aside.
          const free = g.shown.filter((i) => !i.locked).map((i) => i.id);
          return (
            <fieldset key={g.id} class="uk-checklist-group" aria-label={g.title}>
              <button type="button" class="uk-checklist-row uk-checklist-head" aria-pressed={state} disabled={!free.length} onClick={() => onChange(free, state !== true)}>
                <Check state={state} />
                <span class="uk-checklist-label">
                  {g.title}
                  {g.note && <span class="uk-checklist-note"> · {g.note}</span>}
                </span>
                <span class="uk-checklist-count">
                  {on}/{g.items.length}
                </span>
              </button>
              {g.shown.map((i) => {
                const item = (
                  <button
                    key={i.id}
                    type="button"
                    class="uk-checklist-row uk-checklist-item"
                    aria-pressed={i.on}
                    aria-disabled={i.locked || undefined}
                    onClick={() => !i.locked && onChange([i.id], !i.on)}
                  >
                    <Check state={i.on} />
                    <span class="uk-checklist-label">{i.label}</span>
                  </button>
                );
                return i.hint || i.locked ? (
                  <Tip
                    key={i.id}
                    beside
                    content={() => (
                      <>
                        {i.hint && <code>{i.hint}</code>}
                        {i.locked && <div>{labels.locked}</div>}
                      </>
                    )}
                  >
                    {item}
                  </Tip>
                ) : (
                  item
                );
              })}
            </fieldset>
          );
        })}
      </div>
      <div class="uk-checklist-foot">
        <span>{labels.shown(all.filter((i) => i.on).length, all.length)}</span>
        {onReset && (
          <button type="button" class="uk-link" onClick={onReset}>
            {labels.reset}
          </button>
        )}
      </div>
    </div>
  );
}
