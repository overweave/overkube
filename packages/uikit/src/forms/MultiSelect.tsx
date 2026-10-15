import { useMemo, useRef, useState } from 'preact/hooks';
import { Highlight } from '../display/Highlight';
import { Icon } from '../display/Icon';
import { uid } from '../lib/focus';
import { usePresence } from '../lib/motion';
import { Popover } from '../overlays/Popover';

/*
 * Picking several of a list (namespaces): a button saying what is picked,
 * and a popup with a filter and the options (the ARIA combobox and
 * multi-select listbox patterns: arrows move, Space or Enter toggles,
 * Escape closes). Nothing picked means all.
 */

export interface Option {
  value: string;
  label?: string;
  /** A count or a note beside it. */
  hint?: string;
}

export interface MultiSelectProps {
  options: Option[];
  value: readonly string[];
  onChange: (value: string[]) => void;
  /** What nothing picked means: "All namespaces". */
  all: string;
  /** What it picks, for those who cannot see it: "Namespaces". */
  label: string;
  icon?: string;
  /** What its filter says (its placeholder, its name): no word a browser takes for a login's (Safari offers a password for "Filter namespaces": a name). */
  search?: string;
}

export function MultiSelect({ options, value, onChange, all, label, icon, search = 'Search…' }: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [active, setActive] = useState(0);
  const ids = useMemo(() => ({ list: uid('uk-ms-list'), option: uid('uk-ms-option') }), []);
  const trigger = useRef<HTMLButtonElement>(null);
  const presence = usePresence(open);
  const picked = new Set(value);
  const q = filter.trim().toLowerCase();
  const shown = options.filter((o) => !q || (o.label ?? o.value).toLowerCase().includes(q));
  const name = (v: string) => options.find((o) => o.value === v)?.label ?? v;
  const summary = value.length === 0 ? all : value.length <= 2 ? value.map(name).join(', ') : `${value.length} ${label.toLowerCase()}`;

  const toggle = (v: string) => onChange(picked.has(v) ? value.filter((x) => x !== v) : [...value, v]);
  const close = () => {
    setOpen(false);
    setFilter('');
    trigger.current?.focus();
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, shown.length - 1));
    else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
    else if (e.key === 'Home') setActive(0);
    else if (e.key === 'End') setActive(shown.length - 1);
    else if ((e.key === 'Enter' || (e.key === ' ' && !filter)) && shown[active]) toggle(shown[active].value);
    else return;
    e.preventDefault();
  };

  return (
    <div class="uk-ms">
      <button
        type="button"
        ref={trigger}
        class="uk-button uk-ms-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${summary}`}
        onClick={() => setOpen(!open)}
      >
        {icon && <Icon name={icon} />}
        <span class="uk-ms-summary">{summary}</span>
        <Icon name="chevron" />
      </button>
      {presence.mounted && (
        <Popover onClose={close} anchor={trigger} align="end" label={label} state={presence.state} class="uk-ms-popup">
          <div class="uk-ms-search">
            <Icon name="search" />
            <input
              role="combobox"
              aria-expanded="true"
              aria-controls={ids.list}
              aria-activedescendant={shown[active] ? `${ids.option}-${active}` : undefined}
              aria-label={search}
              placeholder={search}
              value={filter}
              onInput={(e) => {
                setFilter((e.target as HTMLInputElement).value);
                setActive(0);
              }}
              onKeyDown={key}
            />
          </div>
          {/* Nothing picked is all of them: a row of its own, over the others. */}
          {!q && (
            <button type="button" class="uk-ms-option uk-ms-all" aria-pressed={value.length === 0} onClick={() => onChange([])}>
              <span class="uk-check" aria-hidden="true">
                {value.length === 0 && <Icon name="check" />}
              </span>
              <span class="uk-ms-label">{all}</span>
              <span class="uk-ms-hint">{options.length}</span>
            </button>
          )}
          <div class="uk-ms-list" role="listbox" id={ids.list} aria-multiselectable="true" aria-label={label}>
            {shown.length === 0 && <div class="uk-ms-empty">No {label.toLowerCase()} match</div>}
            {shown.map((o, i) => (
              // biome-ignore lint/a11y/useKeyWithClickEvents: the keyboard picks through the combobox (aria-activedescendant).
              <div
                key={o.value}
                id={`${ids.option}-${i}`}
                class="uk-ms-option"
                role="option"
                aria-selected={picked.has(o.value)}
                data-active={i === active ? '' : undefined}
                tabIndex={-1}
                onMouseEnter={() => setActive(i)}
                onClick={() => toggle(o.value)}
              >
                <span class="uk-check" aria-hidden="true">
                  {picked.has(o.value) && <Icon name="check" />}
                </span>
                <span class="uk-ms-label">
                  <Highlight text={o.label ?? o.value} query={filter} />
                </span>
                {o.hint && <span class="uk-ms-hint">{o.hint}</span>}
              </div>
            ))}
          </div>
          {q && shown.length > 0 && (
            <div class="uk-ms-foot">
              <button type="button" class="uk-link" onClick={() => onChange([...new Set([...value, ...shown.map((o) => o.value)])])}>
                Pick these {shown.length}
              </button>
            </div>
          )}
        </Popover>
      )}
    </div>
  );
}
