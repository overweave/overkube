import { useDefinitions, useSlotView } from '@overweave/ui/preact';
import { useRef } from 'preact/hooks';
import { MenuItem, type MenuSubject, type MenuSubjects } from '../kinds.ts';
import { menuOf } from '../menu.ts';
import { slots } from '../slots.ts';
import { usePage } from './page.ts';

/*
 * A context menu for something (its subject): what its element calls with
 * the event that asks for one — a right click (at the pointer), the menu
 * key or Shift+F10 (at the element). Opened only if it has items for this
 * one and something draws menus (a fill the menu slot shows): else the
 * browser's own, as with Shift and a right click always. The click the
 * keyboard's sends after it (Windows, Linux) opens nothing again.
 */

const NO_PROPS = {};
/** How soon after the keyboard opened one its click (contextmenu) comes. */
const ECHO_MS = 600;

/** Opens the subject's menu for an event that asks for one: true if it did (the browser's not shown). */
export function useMenu<const S extends MenuSubject>(on: S): (subject: MenuSubjects[S], event: MouseEvent | KeyboardEvent, title?: string) => boolean {
  const page = usePage();
  const items = useDefinitions(MenuItem);
  const drawn = useSlotView(slots.menu, NO_PROPS).selected.length > 0;
  const byKeyboard = useRef(0);
  return (subject, event, title) => {
    const keyboard = event.type === 'keydown';
    if (event.type === 'contextmenu' && Date.now() - byKeyboard.current < ECHO_MS) {
      byKeyboard.current = 0;
      event.preventDefault();
      return true;
    }
    const k = event as KeyboardEvent;
    if (keyboard ? !(k.key === 'ContextMenu' || (k.shiftKey && k.key === 'F10')) : event.type !== 'contextmenu' || event.shiftKey) return false;
    if (!drawn || !menuOf(items, on, subject, (d, e) => page.report(d, 'when', e)).length) return false;
    event.preventDefault();
    const el = event.currentTarget as Element | null;
    const r = keyboard ? el?.getBoundingClientRect() : undefined;
    const at = r ? { x: r.left, y: r.bottom, above: r.top } : { x: (event as MouseEvent).clientX, y: (event as MouseEvent).clientY };
    if (keyboard) byKeyboard.current = Date.now();
    page.openMenu({ on, subject, at, keyboard, ...(title ? { title } : {}) });
    return true;
  };
}
