/*
 * Keyboard focus, for the kit's dialogs and popovers: what can take it, a
 * trap that keeps Tab inside, and putting it back where it was.
 */

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** What can take focus inside root: not inside what is inert, hidden, or hidden from assistive technology (a closed accordion's body). */
export function focusable(root: Element): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.closest('[inert], [hidden], [aria-hidden="true"]'));
}

/** The element that has focus, looking into shadow roots. */
export function activeElement(): Element | null {
  let el = document.activeElement;
  while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
  return el;
}

/** Tab and Shift+Tab go round inside root. */
export function trapTab(root: Element, e: KeyboardEvent): void {
  if (e.key !== 'Tab') return;
  const items = focusable(root);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  const at = activeElement();
  if (e.shiftKey && (at === first || !root.contains(at))) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && at === last) {
    e.preventDefault();
    first.focus();
  }
}

let ids = 0;
/** An id unique on the page, for aria-labelledby, aria-controls and the like. */
export function uid(prefix: string): string {
  ids++;
  return `${prefix}-${ids}`;
}
