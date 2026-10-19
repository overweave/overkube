import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '../display/Icon';
import { Tip } from '../overlays/Tip';
import { Status } from '../status/Status';
import { type Laid, layout, type Measured } from './layout';
import type { MapCard, MapGraph, MapLinkKind } from './types';

/*
 * The map's engine: whatever pattern made it, its cards (HTML) drawn first
 * unseen and measured (their sizes, their ports' places), laid out (ELK,
 * then the columns put straight), then shown; links drawn as soft curves
 * from port to port, in their kinds' tints, a glow running along each. A
 * change of what is in it lays it out again, the cards gliding to their
 * new places. Panned by dragging (or two fingers), zoomed by a pinch, the
 * wheel with Ctrl or ⌘, or the buttons. A card pointed at lights its
 * links and those at their other ends; one chosen, its details beside it.
 */

export interface MapLabels {
  /** The map's name, for those who cannot see it (its keys: arrows pan, + and − zoom, 0 back to start; a card, Enter chooses it). */
  map: string;
  zoomIn: string;
  zoomOut: string;
  home: string;
  close: string;
  /** A card's button opening what it is: "Open {title}". */
  open: (title: string) => string;
  /** Its details' name, for those who cannot see them: "About {title}". */
  about: (title: string) => string;
  warning: string;
}

export const MAP_LABELS: MapLabels = {
  map: 'Map',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  home: 'Back to start',
  close: 'Close',
  open: (title) => `Open ${title}`,
  about: (title) => `About ${title}`,
  warning: 'Warning',
};

const ZOOM = { min: 0.25, max: 2 };
const POPOVER_WIDTH = 340;
/** Smaller than this a fitted map is not read: what does not fit is panned to, from the top. */
const FIT_MIN = 0.6;

interface View {
  x: number;
  y: number;
  k: number;
}

/** What a layout depends on: the cards, their ports, their layers, the links (not their words or states). */
function shapeOf(g: MapGraph): string {
  return [...g.cards.map((c) => `${c.id}@${c.layer}:${c.ports.map((p) => p.id).join(',')}`), ...g.links.map((l) => l.id)].join('\n');
}

export interface MapViewProps {
  graph: MapGraph;
  /** The card chosen (its details shown beside it), if any. */
  selected?: string | null;
  onSelect?: (id: string | null) => void;
  /** A card's details; pick chooses another card (and brings it into view). */
  details?: (id: string, pick: (id: string) => void) => ComponentChildren;
  /** The card the view starts on (an object's own, in its map), shown as drawn in the middle where all of it does not fit (else all of it); none: all of it fitted. Back to start comes back here. */
  focus?: string;
  /** What a card opens (its own view), if anything: a small button beside its title does. */
  opens?: (id: string) => (() => void) | undefined;
  labels?: MapLabels;
}

export function MapView({ graph, selected = null, onSelect, details, focus, opens, labels = MAP_LABELS }: MapViewProps) {
  const box = useRef<HTMLDivElement>(null);
  const plane = useRef<HTMLDivElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const [laid, setLaid] = useState<Laid | null>(null);
  const laidRef = useRef<Laid | null>(null);
  // The view (pan and zoom) set on the plane straight, once a frame: moving it draws nothing anew.
  const view = useRef<View>({ x: 0, y: 0, k: 1 });
  const frame = useRef(0);
  const sizes = useRef<Record<string, Measured>>({});
  const apply = () => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const v = view.current;
      if (plane.current) plane.current.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.k})`;
      placePopover();
    });
  };
  // The details sit beside their card (right of it, or left where there is no room), moving with the view.
  const placePopover = () => {
    const el = popover.current;
    const l = laidRef.current;
    const id = el?.dataset.for;
    if (!el || !l || !id || !box.current) return;
    const at = l.cards[id];
    const m = sizes.current[id];
    if (!at || !m) return;
    const v = view.current;
    const x = v.x + at.x * v.k;
    const y = v.y + at.y * v.k;
    const bw = box.current.clientWidth;
    const bh = box.current.clientHeight;
    let left = x + m.width * v.k + 14;
    if (left + POPOVER_WIDTH > bw - 8) left = x - 14 - POPOVER_WIDTH;
    left = Math.max(8, Math.min(left, bw - POPOVER_WIDTH - 8));
    const top = Math.max(8, Math.min(y, bh - el.offsetHeight - 8));
    el.style.transform = `translate(${left}px, ${top}px)`;
  };
  const setView = (v: View | ((v: View) => View)) => {
    view.current = typeof v === 'function' ? v(view.current) : v;
    apply();
  };
  // Moved by its user (panned, zoomed): kept so; till then, fitted again as its room changes (a page drawing round it).
  const touched = useRef(false);
  const move = (v: View | ((v: View) => View)) => {
    touched.current = true;
    setView(v);
  };
  const glide = () => {
    plane.current?.classList.add('is-gliding');
    setTimeout(() => plane.current?.classList.remove('is-gliding'), 400);
  };
  // A card brought to the middle of the view, gliding.
  const centerOn = (id: string) => {
    const at = laidRef.current?.cards[id];
    const m = sizes.current[id];
    if (!at || !m || !box.current) return;
    const k = view.current.k;
    glide();
    setView({ k, x: box.current.clientWidth / 2 - (at.x + m.width / 2) * k - POPOVER_WIDTH / 4, y: box.current.clientHeight / 2 - (at.y + m.height / 2) * k });
  };
  // Where the view starts: on its focus, else all of it fitted.
  const start = (l: Laid, b: HTMLElement): View => {
    const at = focus ? l.cards[focus] : undefined;
    const m = focus ? sizes.current[focus] : undefined;
    const whole = fit(l, b);
    // All of it, where it fits as it is read; its focus in the middle only where it does not.
    if (!at || !m || (l.width * whole.k <= b.clientWidth && l.height * whole.k <= b.clientHeight)) return whole;
    return { k: 1, x: b.clientWidth / 2 - (at.x + m.width / 2), y: b.clientHeight / 2 - (at.y + m.height / 2) };
  };
  const home = () => {
    if (!laid || !box.current) return;
    glide();
    setView(start(laid, box.current));
  };
  const pick = (id: string) => {
    onSelect?.(id);
    centerOn(id);
  };
  // Laid out once: the cards put in place at once (no gliding from nowhere), the links drawn in.
  const [settled, setSettled] = useState(false);
  const [lit, setLit] = useState<string | null>(null);
  const measured = useRef('');
  const fitted = useRef(false);
  const runs = useRef(0);
  const shape = shapeOf(graph);
  const [tick, setTick] = useState(0);

  // What is drawn measured (once there is room: a closed panel has none); laid out again when its shape or a size changed.
  useLayoutEffect(() => {
    const el = plane.current;
    if (!el || !box.current?.clientWidth) return;
    const now: Record<string, Measured> = {};
    for (const node of el.querySelectorAll<HTMLElement>('[data-card]')) {
      const ports: Record<string, number> = {};
      for (const p of node.querySelectorAll<HTMLElement>('[data-port]')) ports[p.dataset.port as string] = p.offsetTop + p.offsetHeight / 2;
      now[node.dataset.card as string] = { width: node.offsetWidth, height: node.offsetHeight, ports };
    }
    const key = shape + JSON.stringify(now);
    if (key === measured.current) return;
    measured.current = key;
    sizes.current = now;
    // Only the latest layout counts (one asked meanwhile replaces it).
    const run = ++runs.current;
    void layout(graph, now).then((l) => run === runs.current && setLaid(l));
  });

  // Its room, and its cards' sizes, change: measured again, fitted again till fitted.
  useLayoutEffect(() => {
    if (typeof ResizeObserver === 'undefined' || !box.current) return;
    const watch = new ResizeObserver(() => setTick((t) => t + 1));
    watch.observe(box.current);
    for (const node of plane.current?.querySelectorAll<HTMLElement>('[data-card]') ?? []) watch.observe(node);
    return () => watch.disconnect();
  }, [shape]);

  // Not laid out yet: looked at again shortly, till there is room (a panel opening after its map was drawn tells no one).
  useLayoutEffect(() => {
    if (laid) return;
    const id = setInterval(() => box.current?.clientWidth && setTick((t) => t + 1), 100);
    return () => clearInterval(id);
  }, [laid]);

  laidRef.current = laid;
  useLayoutEffect(() => placePopover());

  // Esc lets go of the card chosen (and closes nothing it is in).
  useLayoutEffect(() => {
    if (!selected) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onSelect?.(null);
    };
    document.addEventListener('keydown', key, true);
    return () => document.removeEventListener('keydown', key, true);
  }, [selected]);

  // Its layout (with room for it) fitted into the view — again while its room changes, till its user moves it; gliding only from the frame after it is first shown.
  useLayoutEffect(() => {
    if (!laid || !box.current?.clientWidth || touched.current) return;
    setView(start(laid, box.current));
    if (!fitted.current) {
      fitted.current = true;
      requestAnimationFrame(() => requestAnimationFrame(() => setSettled(true)));
    }
  }, [laid, tick]);

  // Two fingers (or a wheel) pan; a pinch, or the wheel with Ctrl or ⌘, zooms around the pointer. Not passive: the page must not scroll.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest('.uk-map-pv')) return; // the details scroll themselves
      e.preventDefault();
      const lines = e.deltaMode === 1 ? 16 : 1;
      if (e.ctrlKey || e.metaKey) {
        const b = el.getBoundingClientRect();
        zoomAt(view.current.k * Math.exp(-e.deltaY * lines * 0.01), { x: e.clientX - b.left, y: e.clientY - b.top });
      } else move((v) => ({ ...v, x: v.x - e.deltaX * lines, y: v.y - e.deltaY * lines }));
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);

  const zoomAt = (k: number, at?: { x: number; y: number }) => {
    const b = box.current?.getBoundingClientRect();
    if (!b) return;
    const p = at ?? { x: b.width / 2, y: b.height / 2 };
    move((v) => {
      const nk = Math.min(ZOOM.max, Math.max(ZOOM.min, k));
      return { k: nk, x: p.x - ((p.x - v.x) * nk) / v.k, y: p.y - ((p.y - v.y) * nk) / v.k };
    });
  };

  // Dragging pans, on the plane or a card; a press that does not move is a click.
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);
  const touching = (id: string) => graph.links.filter((l) => l.from.card === id || l.to.card === id);
  const shown = lit ?? selected;
  const litLinks = new Set(shown ? touching(shown).map((l) => l.id) : []);
  const litCards = new Set(shown ? [shown, ...touching(shown).flatMap((l) => [l.from.card, l.to.card])] : []);
  const chosen = selected ? graph.cards.find((c) => c.id === selected) : undefined;

  return (
    <div
      class={`uk-map ${laid ? 'is-laid' : ''} ${settled ? 'is-settled' : ''}`}
      ref={box}
      role="application"
      aria-label={labels.map}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: an application, moved about by its keys.
      tabIndex={0}
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).closest('.uk-map-pv, .uk-map-tools, .uk-map-card-open')) return;
        const card = (e.target as HTMLElement).closest<HTMLElement>('[data-card]');
        const step = 60;
        const pan: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
        if (card && (e.key === 'Enter' || e.key === ' ')) onSelect?.(card.dataset.card === selected ? null : (card.dataset.card as string));
        else if (pan[e.key]) {
          const [dx, dy] = pan[e.key] as [number, number];
          move((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
        } else if (e.key === '+' || e.key === '=') zoomAt(view.current.k * 1.25);
        else if (e.key === '-') zoomAt(view.current.k / 1.25);
        else if (e.key === '0') home();
        else return;
        e.preventDefault();
      }}
      onPointerDown={(e) => {
        if (e.button !== 0 || (e.target as HTMLElement).closest('.uk-map-tools, .uk-map-pv')) return;
        drag.current = { x: e.clientX, y: e.clientY, vx: view.current.x, vy: view.current.y, moved: false };
      }}
      onClick={(e) => {
        const t = e.target as HTMLElement;
        if (e.defaultPrevented || t.closest('.uk-map-tools, .uk-map-pv')) return;
        const card = t.closest<HTMLElement>('[data-card]');
        onSelect?.(card ? (card.dataset.card === selected ? null : (card.dataset.card as string)) : null);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) return;
        if (!d.moved) {
          d.moved = true;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }
        move((v) => ({ ...v, x: d.vx + e.clientX - d.x, y: d.vy + e.clientY - d.y }));
      }}
      onPointerUp={() => {
        // A drag that moved does not click what it started on.
        if (drag.current?.moved) addEventListener('click', (ev) => ev.preventDefault(), { capture: true, once: true });
        drag.current = null;
      }}
    >
      <div class="uk-map-plane" ref={plane}>
        {laid &&
          (graph.groups ?? []).map((group) => {
            const box = frameOf(
              laid,
              sizes.current,
              graph.cards.filter((c) => c.group === group.id).map((c) => c.id),
            );
            return box ? (
              <div
                key={group.id}
                class={`uk-map-frame ${group.external ? 'is-external' : ''}`}
                style={{ transform: `translate(${box.x}px, ${box.y}px)`, width: `${box.w}px`, height: `${box.h}px` }}
              >
                <span class="uk-map-frame-title">
                  {group.icon && <Icon name={group.icon} />}
                  <b>{group.title}</b>
                  {group.sub && <span>{group.sub}</span>}
                </span>
              </div>
            ) : null;
          })}
        {laid && (
          <svg class="uk-map-links" width={laid.width} height={laid.height} aria-hidden="true">
            {graph.links.map((l) => {
              const a = anchor(laid, sizes.current, l.from.card, l.from.port, 'out');
              const b = anchor(laid, sizes.current, l.to.card, l.to.port, 'in');
              if (!a || !b) return null;
              const kind = graph.kinds[l.kind];
              // Drawn in from port to port, left to right: a link starts as its column does.
              const delay = Math.min(0.6, (a.x / Math.max(1, laid.width)) * 0.6);
              const d = curve(a, b);
              const state = shown ? (litLinks.has(l.id) ? 'is-lit' : 'is-dim') : '';
              return (
                <g key={l.id} data-tint={kind?.tint ?? 'gray'}>
                  <path
                    d={d}
                    pathLength={1}
                    style={{ animationDelay: `${delay.toFixed(2)}s`, strokeWidth: kind?.weight ?? 1.6 }}
                    class={`uk-map-link ${l.missing ? 'is-missing' : ''} ${state}`}
                  />
                  {/* A glow running from its start to its end, again and again, each link at its own beat. */}
                  {!l.missing && <path d={d} pathLength={1} style={{ animationDelay: `${(0.9 + beat(l.id) * 2.4).toFixed(2)}s` }} class={`uk-map-flow ${state}`} />}
                </g>
              );
            })}
          </svg>
        )}
        {graph.cards.map((c) => (
          <Card
            key={c.id}
            c={c}
            kinds={graph.kinds}
            labels={labels}
            open={opens?.(c.id)}
            at={laid?.cards[c.id]}
            dim={!!shown && !litCards.has(c.id)}
            chosen={c.id === selected}
            onHover={(on) => setLit(on ? c.id : null)}
          />
        ))}
      </div>
      <Legend kinds={graph.kinds} shown={new Set(graph.links.map((l) => l.kind))} />
      {chosen && details && (
        <div class="uk-map-pv" ref={popover} data-for={chosen.id} role="dialog" aria-label={labels.about(chosen.title)}>
          <header class="uk-map-pv-head">
            <span class="uk-map-pv-name">{chosen.title}</span>
            <button type="button" class="uk-map-tool" aria-label={labels.close} onClick={() => onSelect?.(null)}>
              <Icon name="x" />
            </button>
          </header>
          <div class="uk-map-pv-body">{details(chosen.id, pick)}</div>
        </div>
      )}
      <div class="uk-map-tools">
        <button type="button" class="uk-map-tool" aria-label={labels.zoomIn} title={labels.zoomIn} onClick={() => zoomAt(view.current.k * 1.25)}>
          <Icon name="plus" />
        </button>
        <button type="button" class="uk-map-tool" aria-label={labels.zoomOut} title={labels.zoomOut} onClick={() => zoomAt(view.current.k / 1.25)}>
          <Icon name="minus" />
        </button>
        <button type="button" class="uk-map-tool" aria-label={labels.home} title={labels.home} onClick={home}>
          <Icon name="maximize" />
        </button>
      </div>
    </div>
  );
}

/** A port's words as a chip: its kind's icon and tint (/data reads as a volume, /conf as a config). */
function PortChip({ label, kind, sub }: { label: string; kind: MapLinkKind | undefined; sub: string | undefined }) {
  return (
    <span class={`uk-map-chip ${sub ? 'has-sub' : ''}`} data-tint={kind?.tint ?? 'gray'}>
      {kind?.icon && <Icon name={kind.icon} />}
      <span class="uk-map-chip-label">{label}</span>
      {sub && <span class="uk-map-chip-sub">{sub}</span>}
    </span>
  );
}

/** What each kind of link on the map means. */
function Legend({ kinds, shown }: { kinds: MapGraph['kinds']; shown: ReadonlySet<string> }) {
  const on = Object.entries(kinds).filter(([name]) => shown.has(name));
  if (!on.length) return null;
  return (
    <div class="uk-map-legend">
      {on.map(([name, k]) => (
        <span key={name} class="uk-map-legend-item" data-tint={k.tint}>
          <svg width="22" height="8" aria-hidden="true">
            <path d="M1 4 H21" class="uk-map-link" style={{ strokeWidth: k.weight ?? 1.6 }} />
          </svg>
          {k.label}
        </span>
      ))}
    </div>
  );
}

/** A link's own beat (0…1), of its id: the glows do not run in step. */
function beat(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000;
}

/** Where a link meets a card: its port's pip, on its left (in) or right (out) edge. */
function anchor(l: Laid, sizes: Record<string, Measured>, card: string, port: string, side: 'in' | 'out') {
  const at = l.cards[card];
  const m = sizes[card];
  if (!at || !m) return null;
  return { x: at.x + (side === 'out' ? m.width : 0), y: at.y + (m.ports[port] ?? m.height / 2) };
}

/** Room round a frame's cards: beside them, below them, and above for its title. */
const FRAME = { side: 14, top: 30, bottom: 10 };

/** A frame's place: round its cards (none laid: none). */
function frameOf(l: Laid, sizes: Record<string, Measured>, ids: readonly string[]) {
  const boxes = ids.flatMap((id) => {
    const at = l.cards[id];
    const m = sizes[id];
    return at && m ? [{ x: at.x, y: at.y, r: at.x + m.width, b: at.y + m.height }] : [];
  });
  if (!boxes.length) return undefined;
  const x = Math.min(...boxes.map((b) => b.x)) - FRAME.side;
  const y = Math.min(...boxes.map((b) => b.y)) - FRAME.top;
  return { x, y, w: Math.max(...boxes.map((b) => b.r)) + FRAME.side - x, h: Math.max(...boxes.map((b) => b.b)) + FRAME.bottom - y };
}

/** A soft curve leaving and reaching its ports level. */
function curve(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const dx = Math.max(30, Math.abs(b.x - a.x) * 0.5);
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
}

/** The view showing all of it, not bigger than drawn (nor smaller than read). */
function fit(l: Laid, box: HTMLElement): View {
  const pad = 24;
  const w = box.clientWidth - pad * 2;
  const h = box.clientHeight - pad * 2;
  const k = Math.max(FIT_MIN, Math.min(1, w / Math.max(1, l.width), h / Math.max(1, l.height)));
  const x = l.width * k <= w ? (box.clientWidth - l.width * k) / 2 : pad;
  const y = l.height * k <= h ? (box.clientHeight - l.height * k) / 2 : pad;
  return { k, x, y };
}

function Card({
  c,
  kinds,
  labels,
  at,
  dim,
  chosen,
  onHover,
  open,
}: {
  c: MapCard;
  kinds: MapGraph['kinds'];
  labels: MapLabels;
  at: { x: number; y: number } | undefined;
  dim: boolean;
  chosen: boolean;
  onHover: (on: boolean) => void;
  open: (() => void) | undefined;
}) {
  const ins = c.ports.filter((p) => p.side === 'in');
  const outs = c.ports.filter((p) => p.side === 'out');
  const tint = (kind: string | undefined) => (kind ? kinds[kind]?.tint : undefined) ?? 'gray';
  const worded = (ports: typeof ins) => ports.filter((p) => p.label);
  // Ports without words: one pip a side, level with its title, every such link meeting there.
  const pin = (side: 'in' | 'out', ports: typeof ins) => {
    const quiet = ports.filter((p) => !p.label);
    if (!quiet.length) return null;
    return (
      <>
        <span class={`uk-map-pip is-pin is-${side}`} data-tint={tint(quiet[0]?.kind)} />
        {quiet.map((p) => (
          <span key={p.id} class={`uk-map-pin-at is-${side}`} data-port={p.id} />
        ))}
      </>
    );
  };
  const head = (
    <div class="uk-map-card-head">
      {c.status && <Status tone={c.status.tone} icon={c.status.icon} {...(c.status.title ? { title: c.status.title } : {})} />}
      <span class="uk-map-card-title">{c.title}</span>
      {c.pending && <Status tone="warn" icon="warning" title={c.pending} />}
      {c.warn && <Status tone="warn" icon="warning" title={c.warn} />}
    </div>
  );
  const meta = c.lines?.filter(Boolean) ?? [];
  return (
    // biome-ignore lint/a11y/useSemanticElements: it holds a button of its own (opening what it is), which a button cannot.
    <div
      data-card={c.id}
      role="button"
      tabIndex={0}
      aria-pressed={chosen}
      class={`uk-map-card ${c.main ? 'is-main' : ''} ${c.external ? 'is-external' : ''} ${c.missing ? 'is-missing' : ''} ${c.pending ? 'is-pending' : ''} ${dim ? 'is-dim' : ''} ${chosen ? 'is-chosen' : ''}`}
      style={at ? { transform: `translate(${at.x}px, ${at.y}px)` } : undefined}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
    >
      {/* Its kind, small, above its name; what opens it, beside, shown when pointed at. */}
      <div class="uk-map-card-kind">
        {c.icon && <Icon name={c.icon} />}
        <span>{c.sub}</span>
        {open && (
          <button
            type="button"
            class="uk-map-card-open"
            aria-label={labels.open(c.title)}
            title={labels.open(c.title)}
            onClick={(e) => {
              // Opens it, not chooses it (nor after a drag).
              e.stopPropagation();
              if (!e.defaultPrevented) open();
            }}
          >
            <Icon name="external" />
          </button>
        )}
      </div>
      {c.tip ? <Tip content={() => c.tip}>{head}</Tip> : head}
      {(meta.length > 0 || (c.dots?.length ?? 0) > 0) && (
        <div class="uk-map-card-meta">
          {meta.length > 0 && <span class="uk-map-card-line">{meta.join(' · ')}</span>}
          {c.dots && c.dots.length > 0 && (
            <span class="uk-map-dots">
              {c.dots.map((d, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: dots of the same words, in their order.
                <Tip key={i} content={() => d.title}>
                  <span class="uk-map-dot" data-tone={d.tone} role="img" aria-label={d.title} />
                </Tip>
              ))}
            </span>
          )}
        </div>
      )}
      {(worded(ins).length > 0 || worded(outs).length > 0) && (
        <div class="uk-map-ports">
          <div class="uk-map-ins">
            {worded(ins).map((p) => (
              <div key={p.id} class="uk-map-port is-in" data-port={p.id}>
                <span class="uk-map-pip" data-tint={tint(p.kind)} />
                <PortChip label={p.label as string} kind={p.kind ? kinds[p.kind] : undefined} sub={p.sub} />
              </div>
            ))}
          </div>
          <div class="uk-map-outs">
            {worded(outs).map((p) => (
              <div key={p.id} class="uk-map-port is-out" data-port={p.id}>
                <PortChip label={p.label as string} kind={p.kind ? kinds[p.kind] : undefined} sub={p.sub} />
                <span class="uk-map-pip" data-tint={tint(p.kind)} />
              </div>
            ))}
          </div>
        </div>
      )}
      {pin('in', ins)}
      {pin('out', outs)}
    </div>
  );
}
