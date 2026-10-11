import type { ComponentChildren } from 'preact';

/*
 * A key, as on the keyboard: a key cap. Given keys ("mod+k", "shift+enter"),
 * a key cap each, as the platform names them: ⌘ ⇧ ⌥ ⌃ on a Mac, Ctrl Shift
 * Alt elsewhere ("mod": ⌘ on a Mac, Ctrl elsewhere); arrows, Enter, Escape
 * as their signs.
 */

/** Whether the page is on a Mac (its keys named as a Mac names them). */
export function onMac(): boolean {
  const nav = globalThis.navigator as (Navigator & { userAgentData?: { platform?: string } }) | undefined;
  return /mac|iphone|ipad/i.test(nav?.userAgentData?.platform ?? nav?.platform ?? '');
}

const MAC: Record<string, string> = { mod: '⌘', cmd: '⌘', meta: '⌘', ctrl: '⌃', shift: '⇧', alt: '⌥', option: '⌥' };
const OTHER: Record<string, string> = { mod: 'Ctrl', cmd: 'Ctrl', meta: 'Win', ctrl: 'Ctrl', shift: 'Shift', alt: 'Alt', option: 'Alt' };
const SIGNS: Record<string, string> = {
  enter: '↵',
  return: '↵',
  escape: 'Esc',
  esc: 'Esc',
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  backspace: '⌫',
  delete: 'Del',
  tab: 'Tab',
  space: 'Space',
};

/** A key as the platform names it: a modifier's sign or word, a named key's sign, a letter in capitals. */
export function keyName(key: string, mac = onMac()): string {
  const k = key.trim().toLowerCase();
  return (mac ? MAC : OTHER)[k] ?? SIGNS[k] ?? (k.length === 1 ? k.toUpperCase() : key.trim());
}

export interface KbdProps {
  /** A key as it is written. */
  children?: ComponentChildren;
  /** Keys pressed together ("mod+k"): a key cap each, named as the platform names them. */
  keys?: string;
}

export function Kbd({ children, keys }: KbdProps) {
  if (keys === undefined) return <kbd class="uk-kbd">{children}</kbd>;
  // "+" alone is a key, not a joint ("mod++").
  const parts = keys.split(/\+(?!$)/).filter(Boolean);
  return (
    <kbd class="uk-kbds">
      {parts.map((k, i) => (
        <kbd class="uk-kbd" key={i}>
          {keyName(k)}
        </kbd>
      ))}
    </kbd>
  );
}
