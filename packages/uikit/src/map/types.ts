import type { Tone } from '../status/Status';

/*
 * A map, as its engine has it (MapView): cards in layers (columns, left to
 * right), ports on their sides, links from port to port. One map, many
 * patterns: a pattern (MapPattern) is what makes a map of a scope — a
 * namespace's traffic, an object's neighbours, a node's pods — saying what
 * is in it, which layer each card goes to, what kinds of links it has; the
 * engine places each card in its layer, routes the links and draws any of
 * them the same way.
 */

/** A link's colour (and its ports' pips', its chips'): one of the map's tints. */
export type MapTint = 'green' | 'blue' | 'teal' | 'violet' | 'amber' | 'orange' | 'pink' | 'slate' | 'gray';

/** A kind of link a pattern draws: what it means (the legend's words), its tint, its weight, its port chips' icon. */
export interface MapLinkKind {
  label: string;
  tint: MapTint;
  /** Thicker for what matters most (traffic from outside): 1.2–2.4, 1.6 if none said. */
  weight?: number;
  icon?: string;
}

export interface MapPort {
  id: string;
  /** Which side of its card: in (left), out (right). */
  side: 'in' | 'out';
  /** Its words beside it (a port number, a path in a container…). */
  label?: string;
  /** Quieter words after them (an address). */
  sub?: string;
  /** What goes through it (a link kind's name): its pip and chip take that kind's tint. */
  kind?: string;
}

export interface MapCard {
  id: string;
  /** Its column (0 the leftmost), as its pattern says. */
  layer: number;
  title: string;
  /** Its kind's icon, before its title. */
  icon?: string;
  /** Beside its title, quieter: its kind, an address. */
  sub?: string;
  /** A line or two of what matters, quieter. */
  lines?: string[];
  /** Its state, as a table draws it (an icon in its tone; what it means, its tip). */
  status?: { tone: Tone; icon: string; title?: string };
  /** The one the map is of (an object's own map): drawn stronger. */
  main?: boolean;
  /** Not of this scope (another namespace's): drawn faint. */
  external?: boolean;
  /** Not there at all (what is named but does not exist): dashed. */
  missing?: boolean;
  /** Something about it wants a look. */
  warn?: string;
  /** Not as it is meant to be (what a change would do to it): dashed in the warning's colour, told in its mark. */
  pending?: string;
  /** All of it, in its tip. */
  tip?: string;
  /** What it gathers, each a dot in its state (a workload's pods: one each, not a card each); their words, its tip. */
  dots?: { tone: Tone; title: string }[];
  /** The group it is in (its frame: a namespace, what manages it). */
  group?: string;
  ports: MapPort[];
}

/** A frame round some of a map's cards (a namespace's, a Kustomization's): its title above them. */
export interface MapGroup {
  id: string;
  title: string;
  icon?: string;
  /** Quieter, after its title (its kind). */
  sub?: string;
  /** Not of the map's own (another namespace): drawn faint. */
  external?: boolean;
}

export interface MapLink {
  id: string;
  from: { card: string; port: string };
  to: { card: string; port: string };
  /** Its kind: one of its map's kinds. */
  kind: string;
  /** A way that is not there (to what does not exist): dashed. */
  missing?: boolean;
}

export interface MapGraph {
  cards: MapCard[];
  links: MapLink[];
  /** The kinds of its links, by name: their tints, the legend's words, in this order. */
  kinds: Readonly<Record<string, MapLinkKind>>;
  /** Its frames, in their order (top to bottom): each a band of its cards across the columns. */
  groups?: MapGroup[];
  /**
   * Layers that may wrap: one with many cards laid in several columns side
   * by side rather than one long one (a node's pods: many, each linked to
   * the one node).
   */
  wrap?: number[];
}

/** A pattern: a map of a scope, made of what it is given. */
export type MapPattern<I> = (input: I) => MapGraph;
