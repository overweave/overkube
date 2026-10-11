import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Icon } from '../display/Icon';
import { uid } from '../lib/focus';
import { usePresence } from '../lib/motion';
import { Popover } from '../overlays/Popover';

/*
 * Picking one of a list: a button saying what is picked, a listbox under
 * it (ARIA listbox: arrows move, Enter or Space picks, a letter jumps to
 * the next starting with it, Escape closes back to the button). It opens on
 * what is picked.
 */
export function Select({
  options,
  value,
  onChange,
  label,
  placeholder = '—',
}: {
  options: { value: string; title: string; hint?: string }[];
  value: string | undefined;
  onChange: (value: string) => void;
  label: string;
  /** What it says while nothing is picked. */
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const at = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const [active, setActive] = useState(at);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const presence = usePresence(open);
  const ids = useMemo(() => ({ list: uid('uk-select-list'), option: uid('uk-select-option') }), []);
  const current = options.find((o) => o.value === value);
  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    trigger.current?.focus();
  };
  const move = (i: number) => {
    setActive(i);
    list.current?.querySelector(`#${ids.option}-${i}`)?.scrollIntoView?.({ block: 'nearest' });
  };
  // Opened, it shows what is picked in the middle of the list, however far down (the list only: never the page).
  useEffect(() => {
    const box = list.current;
    const row = box?.querySelector<HTMLElement>(`#${ids.option}-${active}`);
    if (open && box && row) box.scrollTop = row.offsetTop - (box.clientHeight - row.offsetHeight) / 2;
  }, [open]);
  const key = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') move(Math.min(active + 1, options.length - 1));
    else if (e.key === 'ArrowUp') move(Math.max(active - 1, 0));
    else if (e.key === 'Home') move(0);
    else if (e.key === 'End') move(options.length - 1);
    else if ((e.key === 'Enter' || e.key === ' ') && options[active]) pick(options[active].value);
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // The next one after the active starting with the letter, round.
      const c = e.key.toLowerCase();
      const next = [...options.slice(active + 1), ...options.slice(0, active + 1)].find((o) => o.title.toLowerCase().startsWith(c));
      if (next) move(options.indexOf(next));
    } else return;
    e.preventDefault();
  };
  return (
    <div class="uk-select">
      <button
        type="button"
        ref={trigger}
        class="uk-button uk-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${current?.title ?? placeholder}`}
        onClick={() => {
          if (!open) setActive(at);
          setOpen(!open);
        }}
      >
        <span class="uk-select-value" data-empty={current ? undefined : ''}>
          {current?.title ?? placeholder}
        </span>
        <Icon name="chevron" />
      </button>
      {presence.mounted && (
        <Popover onClose={() => setOpen(false)} anchor={trigger} state={presence.state} label={label} class="uk-select-popup" matchWidth>
          <div
            ref={list}
            class="uk-select-list"
            role="listbox"
            id={ids.list}
            aria-label={label}
            tabIndex={0}
            aria-activedescendant={options[active] ? `${ids.option}-${active}` : undefined}
            onKeyDown={key}
          >
            {options.map((o, i) => (
              // biome-ignore lint/a11y/useKeyWithClickEvents: the keyboard picks through the listbox (aria-activedescendant).
              <div
                key={o.value}
                id={`${ids.option}-${i}`}
                class="uk-select-option"
                role="option"
                aria-selected={o.value === value}
                data-active={i === active ? '' : undefined}
                tabIndex={-1}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(o.value)}
              >
                <span class="uk-select-label">{o.title}</span>
                {o.hint && <span class="uk-select-hint">{o.hint}</span>}
                <span class="uk-select-mark" aria-hidden="true">
                  {o.value === value && <Icon name="check" />}
                </span>
              </div>
            ))}
          </div>
        </Popover>
      )}
    </div>
  );
}
