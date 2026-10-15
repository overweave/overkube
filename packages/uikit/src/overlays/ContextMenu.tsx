import { type ComponentChildren, Fragment } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '../display/Icon';
import { keyName, onMac } from '../display/Kbd';
import { activeElement } from '../lib/focus';
import { Layer, placeAt } from '../lib/layers';

/*
 * A menu of what can be done with something, opened where it was asked for
 * (a right click: at the pointer; the keyboard: under the element). A layer
 * over the page (over a modal one too, and to be reached there), kept
 * inside the window — opening
 * to the left or up where it does not fit, growing from that corner. Its
 * items in groups, a line between them; one may be dangerous (said in the
 * error colour) or not to be had now. The keyboard as a system's menu: the
 * arrows round, Home and End, a letter to the next item it starts; Enter or
 * Space chooses, Escape or Tab closes. The pointer over an item takes it.
 * One chosen blinks, then is done and the menu closes; closed by the
 * keyboard (or a choice), focus goes back where it was. A click outside, the
 * window scrolled, resized or left: closed.
 */

export interface ContextMenuItem {
  key: string;
  label: ComponentChildren;
  icon?: string;
  /** Its keys, shown at its end ("delete", "mod+w"). */
  keys?: string;
  /** What it does cannot be taken back: said in the error colour. */
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

export interface ContextMenuGroup {
  key: string;
  items: ContextMenuItem[];
}

export interface ContextMenuProps {
  /** Where it opens (the window's coordinates): the pointer, or under an element (above: its top, where it opens up from). */
  at: { x: number; y: number; above?: number };
  groups: ContextMenuGroup[];
  /** What it is for, for those who cannot see it ("Pods"). */
  label?: string;
  /** What it is for, at its top (a small heading). */
  title?: ComponentChildren;
  /** Opened by the keyboard: its first item taken at once. */
  keyboard?: boolean;
  /** closing: fading out (usePresence). */
  state?: 'open' | 'closing';
  onClose: () => void;
}

/** Keys as ARIA says them ("mod+w": Meta+W on a Mac, Control+W elsewhere). */
function ariaKeys(keys: string): string {
  return keys
    .split(/\+(?!$)/)
    .map((k) => (k === 'mod' ? (onMac() ? 'Meta' : 'Control') : k.length === 1 ? k.toUpperCase() : k[0].toUpperCase() + k.slice(1)))
    .join('+');
}

/** How long a chosen item blinks before it is done. */
const BLINK_MS = 110;

export function ContextMenu({ at, groups, label, title, keyboard = false, state = 'open', onClose }: ContextMenuProps) {
  const [chosen, setChosen] = useState<string>();
  const close = useRef(onClose);
  close.current = onClose;
  const before = useRef<HTMLElement | null>(null);
  /** A choice blinking: done at once if the menu goes meanwhile (a click elsewhere: focus left where it went). */
  const blinking = useRef<{ timer: ReturnType<typeof setTimeout>; item: ContextMenuItem }>();
  const icons = groups.some((g) => g.items.some((i) => i.icon));

  // Placed before it is seen (once it is there): at the point, or to its left / above it where it does not fit; growing from that corner.
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (el) placeAt(el, at);
  }, [el, at.x, at.y, at.above]);

  const items = () => [...(el?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? [])];

  useEffect(() => {
    if (!el) return;
    before.current = activeElement() as HTMLElement | null;
    // Opened by the keyboard: its first item; by the pointer: the menu itself (the arrows from there).
    (keyboard ? items()[0] : el)?.focus();
    const root = el;
    const gone = () => close.current();
    // The page scrolled (not the menu itself, a long one).
    const scrolled = (e: Event) => root && !e.composedPath().includes(root) && close.current();
    window.addEventListener('blur', gone);
    window.addEventListener('resize', gone);
    window.addEventListener('scroll', scrolled, true);
    return () => {
      const b = blinking.current;
      if (b) {
        clearTimeout(b.timer);
        b.item.onSelect();
      }
      window.removeEventListener('blur', gone);
      window.removeEventListener('resize', gone);
      window.removeEventListener('scroll', scrolled, true);
    };
  }, [el]);

  /** Closed, focus back where it was (the keyboard's way out, or a choice). */
  const back = () => {
    before.current?.focus?.();
    close.current();
  };

  const choose = (item: ContextMenuItem) => {
    if (item.disabled || chosen) return;
    setChosen(item.key);
    const still = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const timer = setTimeout(
      () => {
        blinking.current = undefined;
        back();
        item.onSelect();
      },
      still ? 0 : BLINK_MS,
    );
    blinking.current = { timer, item };
  };

  const keys = (e: KeyboardEvent) => {
    const list = items();
    const at = list.indexOf(activeElement() as HTMLElement);
    const go = (i: number) => list[(i + list.length) % list.length]?.focus();
    if (e.key === 'ArrowDown') go(at + 1);
    else if (e.key === 'ArrowUp') go(at < 0 ? -1 : at - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(-1);
    else if (e.key === 'Escape' || e.key === 'Tab') back();
    else if (e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // A letter: the next item it starts (round).
      const letter = e.key.toLocaleLowerCase();
      const next = [...list.slice(at + 1), ...list.slice(0, at + 1)].find((el) => el.textContent?.trim().toLocaleLowerCase().startsWith(letter));
      if (!next) return;
      next.focus();
      // Space on the menu itself (no item yet): nothing — not the page scrolled (the menu closed with it).
    } else if (e.key !== ' ') return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <Layer
      class="uk-menu"
      role="menu"
      label={label || undefined}
      focus="none"
      onLayer={setEl}
      onDismiss={() => close.current()}
      closing={state === 'closing'}
      onKeyDown={keys}
      onContextMenu={(e) => e.preventDefault()}
      onClick={(e) => e.stopPropagation()}
    >
      {title && <div class="uk-menu-title">{title}</div>}
      {groups
        .filter((g) => g.items.length)
        .map((g, i) => (
          <Fragment key={g.key}>
            {i > 0 && <hr class="uk-menu-sep" />}
            {/* biome-ignore lint/a11y/useSemanticElements: a menu's group (ARIA), not a form's fieldset. */}
            <div role="group" class="uk-menu-group">
              {g.items.map((item) => (
                <div
                  key={item.key}
                  role="menuitem"
                  class="uk-menu-item"
                  tabIndex={-1}
                  aria-disabled={item.disabled ? true : undefined}
                  aria-keyshortcuts={item.keys && ariaKeys(item.keys)}
                  data-danger={item.danger ? '' : undefined}
                  data-chosen={chosen === item.key ? '' : undefined}
                  onPointerMove={(e) => !item.disabled && activeElement() !== e.currentTarget && (e.currentTarget as HTMLElement).focus()}
                  onPointerLeave={(e) => activeElement() === e.currentTarget && el?.focus()}
                  onClick={() => choose(item)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    e.preventDefault();
                    choose(item);
                  }}
                >
                  {icons && <span class="uk-menu-icon">{item.icon && <Icon name={item.icon} />}</span>}
                  <span class="uk-menu-label">{item.label}</span>
                  {item.keys && (
                    <span class="uk-menu-keys" aria-hidden="true">
                      {item.keys
                        .split(/\+(?!$)/)
                        .map((k) => keyName(k))
                        .join(onMac() ? '' : '+')}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </Fragment>
        ))}
    </Layer>
  );
}
