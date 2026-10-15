import { type ComponentChildren, createContext } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';
import { Above, usePlacedBy } from '../lib/layers';

/*
 * What something is, more of it, beside it while the pointer is over it
 * (a while: then the next one at once, as the pointer goes along), while
 * it has focus, a long press on a touch screen. One at a time: another
 * shown, the last one goes. Its content drawn only while shown (a table of
 * thousands of cells draws none of theirs). A hint: words, never in the
 * way (the pointer goes through it). A card: more (fields, a message,
 * actions) — the pointer goes into it and it stays, its text chosen, its
 * buttons pressed. Escape closes it, the pointer gone (a card: a moment
 * after), focus gone, a press elsewhere. One in another (a mark's hint in
 * a cell's card, a hint in a card): the outer one's, the inner none. One
 * with nothing in it (its content drawn nothing): not shown. Under what it
 * is about (over it where there is no room), or beside it (a side's
 * items, a list's: not over the next one).
 *
 * One shown, one on its way at a time: what times them, what closes them
 * (Escape — that only, not what it is over; a press elsewhere), the
 * page's — one of each, not each tip's (a table of thousands of marks:
 * each keeps only whether it is shown). Focus shows one only when the
 * keyboard moved it (Tab, an arrow): not a click's, not a popover's
 * putting it on its first button.
 */

/** How long the pointer rests before the first one shows. */
export const TIP_MS = 400;
/** Once one has shown, those after it at once — till so long after the last one went. */
const WARM_MS = 400;
/** How long a card stays once the pointer left (to go into it). */
const CARD_STAYS_MS = 150;
/** A press this long on a touch screen shows it. */
const LONG_PRESS_MS = 500;

/** A tip, as the page's timers and closing know it. */
interface One {
  anchor: HTMLElement | null;
  box: HTMLElement | null;
  set: (open: boolean) => void;
}

let shown: One | undefined;
/** The one on its way (shown once its time is up): one at a time. */
let coming: { one: One; timer: ReturnType<typeof setTimeout> } | undefined;
/** The shown one going (a card a moment after the pointer left it). */
let going: ReturnType<typeof setTimeout> | undefined;
let warmUntil = 0;
let ids = 0;
/** The last thing the user did was move focus by the keyboard (Tab, an arrow): focus then shows a tip; a click's, a layer's opening's, not. */
let byKeys = false;

/** Shown after so long (none: now) — this one on its way, any other no more. */
function soon(one: One, ms: number) {
  if (coming) clearTimeout(coming.timer);
  coming = undefined;
  if (ms <= 0) show(one);
  else coming = { one, timer: setTimeout(() => show(one), ms) };
}

/** This one on its way no more. */
function stay(one: One) {
  if (coming?.one !== one) return;
  clearTimeout(coming.timer);
  coming = undefined;
}

/** The shown one, if it is this one, hidden after so long (none: now). */
function later(one: One, ms: number) {
  stay(one);
  if (shown !== one) return;
  clearTimeout(going);
  going = ms > 0 ? setTimeout(() => hide(one), ms) : undefined;
  if (ms <= 0) hide(one);
}

const NAVIGATING = /^(Tab|Arrow|Home$|End$|PageUp$|PageDown$)/;
const typed = (e: KeyboardEvent) => {
  byKeys = NAVIGATING.test(e.key);
  // Escape: the shown one closed — that only (what it is over, a popover, a modal, stays).
  if (e.key === 'Escape' && shown) {
    e.preventDefault();
    e.stopPropagation();
    hide(shown);
  }
};
const pressed = (e: PointerEvent) => {
  byKeys = false;
  if (shown && !shown.anchor?.contains(e.target as Node) && !shown.box?.contains(e.target as Node)) hide(shown);
};
// What the user last did, the page's, once (whether focus is the keyboard's).
if (typeof document !== 'undefined') {
  document.addEventListener('keydown', typed, true);
  document.addEventListener('pointerdown', pressed, true);
}

function show(one: One) {
  stay(one);
  // Not there (gone before its time was up): nothing shown.
  if (!one.anchor?.isConnected) return;
  clearTimeout(going);
  if (shown && shown !== one) shown.set(false);
  shown = one;
  one.set(true);
}

function hide(one: One) {
  stay(one);
  if (shown !== one) return;
  clearTimeout(going);
  shown = undefined;
  warmUntil = Date.now() + WARM_MS;
  one.set(false);
}

export interface TipProps {
  /** What it says: drawn only while shown (none: no tip). */
  content: (() => ComponentChildren) | undefined;
  /** A card: the pointer goes into it, what is in it is pressed. */
  card?: boolean;
  /** Beside what it is about (at its right), not under it. */
  beside?: boolean;
  /** Shown as long as it is said (a story, a test): no pointer asked. */
  open?: boolean;
  children: ComponentChildren;
}

/** Inside a tip's anchor or its box: a tip there is none (the outer one says it). */
const Within = createContext(false);

export function Tip({ content, children, ...rest }: TipProps) {
  const { on, box } = useTip(content, rest);
  if (!on) return <>{children}</>;
  return (
    <>
      <span {...on} class="uk-tip-at">
        <Within.Provider value={true}>{children}</Within.Provider>
      </span>
      {box}
    </>
  );
}

/** What an element a tip is about is given (its ref, its name for the tip, the pointer's and focus's handlers): merged with its own (tipped). */
export interface TipOn {
  ref: (el: HTMLElement | null) => void;
  'aria-describedby': string | undefined;
  onPointerEnter: (e: PointerEvent) => void;
  onPointerLeave: (e: PointerEvent) => void;
  onPointerDown: (e: PointerEvent) => void;
  onPointerUp: (e: PointerEvent) => void;
  onPointerCancel: (e: PointerEvent) => void;
  onFocusIn: (e: FocusEvent) => void;
  onFocusOut: (e: FocusEvent) => void;
}

/**
 * A tip about an element drawn by its owner (a tab, a link, a button — no
 * element around it: what holds it, a tab list, a sorted strip, has it as
 * it is): what to give it (on: none — no content, or inside another tip),
 * and the tip to draw beside it (box).
 */
export function useTip(
  content: (() => ComponentChildren) | undefined,
  { card = false, beside = false, open: asked }: Omit<TipProps, 'content' | 'children'> = {},
): { on: TipOn | undefined; box: ComponentChildren } {
  const within = useContext(Within);
  const [open, setOpen] = useState(false);
  // Its own, the same however often it is drawn: what the page's timer and closing know it by, where it is (its refs: once each, not again as it is drawn).
  const [one] = useState(() => {
    const me: One & { id: string; attach: (el: HTMLElement | null) => void } = {
      anchor: null,
      box: null,
      set: setOpen,
      id: `uk-tip-${++ids}`,
      attach: (el) => {
        me.anchor = el;
      },
    };
    return me;
  });
  // Gone (shown, or on its way): no more.
  useEffect(() => () => hide(one), []);
  if (within || !content) return { on: undefined, box: null };
  const visible = asked ?? open;
  const leave = () => later(one, card ? CARD_STAYS_MS : 0);
  // Focus gone from it and its card both: hidden.
  const blurred = (e: FocusEvent) => {
    const to = e.relatedTarget as Node | null;
    if (!one.anchor?.contains(to) && !one.box?.contains(to)) hide(one);
  };
  return {
    on: {
      ref: one.attach,
      'aria-describedby': visible ? one.id : undefined,
      onPointerEnter: (e) => {
        if (e.pointerType === 'touch') return;
        if (shown === one) clearTimeout(going);
        else soon(one, Date.now() < warmUntil ? 0 : TIP_MS);
      },
      onPointerLeave: (e) => e.pointerType !== 'touch' && leave(),
      onPointerDown: (e) => e.pointerType === 'touch' && soon(one, LONG_PRESS_MS),
      onPointerUp: (e) => e.pointerType === 'touch' && stay(one),
      onPointerCancel: () => stay(one),
      onFocusIn: () => byKeys && show(one),
      onFocusOut: blurred,
    },
    box: visible && (
      <TipBox one={one} card={card} beside={beside} onEnter={() => clearTimeout(going)} onLeave={leave} onBlur={blurred}>
        <Within.Provider value={true}>{content()}</Within.Provider>
      </TipBox>
    ),
  };
}

/** An element's own props with a tip's: each handler both, its ref both (none: its own as they are). */
// biome-ignore lint/suspicious/noExplicitAny: any element's props.
export function tipped<P extends Record<string, any>>(own: P, on: TipOn | undefined): P {
  if (!on) return own;
  const merged: Record<string, unknown> = { ...own };
  for (const [k, v] of Object.entries(on)) {
    const mine = own[k];
    if (k === 'ref')
      merged.ref = (el: HTMLElement | null) => {
        on.ref(el);
        if (typeof mine === 'function') mine(el);
        else if (mine && typeof mine === 'object') (mine as { current: unknown }).current = el;
      };
    else if (k === 'aria-describedby') merged[k] = [mine, v].filter(Boolean).join(' ') || undefined;
    else if (typeof v === 'function' && typeof mine === 'function')
      merged[k] = (e: Event) => {
        mine(e);
        (v as (e: Event) => void)(e);
      };
    else merged[k] = mine ?? v;
  }
  return merged as P;
}

function TipBox({
  one,
  card,
  beside,
  onEnter,
  onLeave,
  onBlur,
  children,
}: {
  one: One & { id: string };
  card: boolean;
  beside: boolean;
  onEnter: () => void;
  onLeave: () => void;
  onBlur: (e: FocusEvent) => void;
  children: ComponentChildren;
}) {
  const [anchor] = useState(() => ({
    get current() {
      return one.anchor;
    },
  }));
  const place = usePlacedBy(anchor, { gap: 4, inWindow: true, beside });
  // Placed once, as it comes (not again as it is drawn: what is in it would lose its scroll).
  const [attach] = useState(() => (el: HTMLDivElement | null) => {
    one.box = el;
    if (el) place(el);
  });
  return (
    <Above>
      <div
        ref={attach}
        id={one.id}
        role="tooltip"
        class="uk-tip"
        data-card={card ? '' : undefined}
        onPointerEnter={card ? onEnter : undefined}
        onPointerLeave={card ? onLeave : undefined}
        onFocusOut={card ? onBlur : undefined}
      >
        {children}
      </div>
    </Above>
  );
}

/**
 * A card's parts, each in its place and only when there is something in
 * it: its title; its fields (TipField: a name and its value, a row each);
 * its sections (a message, a list); its actions at its foot.
 */
export function TipCard({
  title,
  fields,
  sections,
  actions,
}: {
  title?: ComponentChildren;
  fields?: ComponentChildren;
  sections?: ComponentChildren;
  actions?: ComponentChildren;
}) {
  return (
    <div class="uk-tip-card">
      {title && <div class="uk-tip-title">{title}</div>}
      {fields && <dl class="uk-tip-fields">{fields}</dl>}
      {sections && <div class="uk-tip-sections">{sections}</div>}
      {actions && <div class="uk-tip-actions">{actions}</div>}
    </div>
  );
}

/** A card's field: its name, its value. */
export function TipField({ label, children }: { label: ComponentChildren; children: ComponentChildren }) {
  return (
    <div class="uk-tip-field">
      <dt>{label}</dt>
      <dd>{children === undefined || children === null || children === '' ? <span class="uk-muted">—</span> : children}</dd>
    </div>
  );
}
