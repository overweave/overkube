import type { ComponentChildren } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { Highlight } from '../display/Highlight';
import { Icon } from '../display/Icon';
import { usePresence } from '../lib/motion';
import { Popover } from '../overlays/Popover';

/*
 * Picking some of a list in groups (a workload's pods, each its
 * containers): a button saying what is picked (each one's colour, the
 * first few), a popup with a filter, "all" (nothing picked), and the
 * groups — a group's box all of it, some of it (mixed), or none; under it
 * its items, each its colour, a tag (init, sidecar), a hint. From all of
 * them, a click picks only that one (or that group); after, it is put in
 * or taken out — all of them picked, or none: all again. Filtered, a
 * group's box is of those of it shown. Ungrouped (one group, no head): its
 * items only. Its rows: a Checklist's.
 */

export interface PickItem {
  key: string;
  label: string;
  colour?: string;
  tag?: string;
  hint?: ComponentChildren;
}

export interface PickGroup {
  key: string;
  /** Its head (none: its items only — a list of one group). */
  label?: string;
  hint?: ComponentChildren;
  items: readonly PickItem[];
}

export interface GroupPickerLabels {
  /** What it picks, for those who cannot see it. */
  label: string;
  /** The row picking all of them (nothing picked). */
  all: string;
  /** What the button says of all of them. */
  allShort: string;
  /** What the button says of some of them. */
  some: (picked: number, of: number) => string;
  search: string;
}

export function GroupPicker({
  groups,
  picked,
  onPick,
  labels,
}: {
  groups: readonly PickGroup[];
  picked: readonly string[];
  onPick: (keys: string[]) => void;
  labels: GroupPickerLabels;
}) {
  const [open, setOpen] = useState(false);
  const [find, setFind] = useState('');
  const trigger = useRef<HTMLButtonElement>(null);
  const presence = usePresence(open);
  const all = groups.flatMap((g) => g.items);
  const on = new Set(picked);
  const read = picked.length ? all.filter((i) => on.has(i.key)) : all;
  const summary = !picked.length ? labels.allShort : read.length === 1 ? read[0].label : labels.some(read.length, all.length);
  const q = find.trim().toLowerCase();
  const matches = (g: PickGroup, i: PickItem) => !q || i.label.toLowerCase().includes(q) || !!g.label?.toLowerCase().includes(q);
  /** From all of them: only these; else these in or out. */
  const toggle = (keys: readonly string[], out: boolean) => {
    if (!picked.length) return onPick(keys.length === all.length ? [] : [...keys]);
    const now = new Set(picked);
    for (const k of keys) out ? now.delete(k) : now.add(k);
    onPick(now.size === all.length || now.size === 0 ? [] : [...now]);
  };
  const box = (state: boolean | 'mixed') => (
    <span class="uk-check" aria-hidden="true">
      {state === 'mixed' ? <span class="uk-check-mixed" /> : state ? <Icon name="check" /> : null}
    </span>
  );
  return (
    <span class="uk-ms">
      <button
        type="button"
        ref={trigger}
        class="uk-button uk-gp-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${labels.label}: ${summary}`}
        onClick={() => setOpen(!open)}
      >
        <span class="uk-gp-dots">
          {read.slice(0, 4).map((i) => (
            <i key={i.key} style={{ '--uk-gp-c': i.colour }} />
          ))}
        </span>
        <span class="uk-ms-summary">{summary}</span>
        <Icon name="chevron" />
      </button>
      {presence.mounted && (
        <Popover onClose={() => setOpen(false)} anchor={trigger} label={labels.label} state={presence.state} class="uk-ms-popup uk-gp-popup">
          <div class="uk-ms-search">
            <Icon name="search" />
            <input aria-label={labels.search} placeholder={labels.search} value={find} onInput={(e) => setFind((e.target as HTMLInputElement).value)} />
          </div>
          {!q && (
            <button type="button" class="uk-ms-option uk-ms-all" aria-pressed={!picked.length} onClick={() => onPick([])}>
              {box(!picked.length)}
              <span class="uk-ms-label">{labels.all}</span>
              <span class="uk-ms-hint">{all.length}</span>
            </button>
          )}
          <div class="uk-ms-list">
            {groups.map((g) => {
              const items = g.items.filter((i) => matches(g, i));
              if (!items.length) return null;
              const count = items.filter((i) => on.has(i.key)).length;
              const state = !picked.length ? false : count === items.length ? true : count ? 'mixed' : false;
              return (
                <div key={g.key} class="uk-gp-group">
                  {g.label !== undefined && (
                    <button
                      type="button"
                      class="uk-checklist-row uk-gp-row"
                      data-head=""
                      aria-pressed={state}
                      onClick={() =>
                        toggle(
                          items.map((i) => i.key),
                          state === true,
                        )
                      }
                    >
                      {box(state)}
                      <span class="uk-ms-label">
                        <Highlight text={g.label} query={find} />
                      </span>
                      {g.hint && <span class="uk-ms-hint">{g.hint}</span>}
                    </button>
                  )}
                  {items.map((i) => {
                    const checked = picked.length > 0 && on.has(i.key);
                    return (
                      <button
                        key={i.key}
                        type="button"
                        class="uk-checklist-row uk-gp-row"
                        data-child={g.label !== undefined ? '' : undefined}
                        aria-pressed={checked}
                        onClick={() => toggle([i.key], checked)}
                      >
                        {box(checked)}
                        {i.colour && <i style={{ '--uk-gp-c': i.colour }} />}
                        <span class="uk-ms-label">
                          <Highlight text={i.label} query={find} />
                        </span>
                        {i.tag && <span class="uk-gp-tag">{i.tag}</span>}
                        {i.hint && <span class="uk-ms-hint">{i.hint}</span>}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </Popover>
      )}
    </span>
  );
}
