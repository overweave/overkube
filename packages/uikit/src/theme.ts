/*
 * The kit's tokens: everything a theme may say of how things look — its
 * colours, its corners, its fonts — each a CSS variable (--uk-<name>) the
 * kit's styles read, and nothing else: no colour is written into them. A
 * theme says some (the others: the defaults); its colours in a dark and a
 * light variant, its corners and fonts the same in both; shades (a hover, a
 * badge's soft ground) are mixed from them.
 * Whoever draws in the kit's look (an addon's component) reads them too:
 * var(--uk-accent).
 */

/** Colours: grounds, text, lines, the accent and what is on it, states, what covers and shades. */
export const COLOR_TOKENS = [
  /** The page's ground. */
  'bg',
  /** A panel on it (a table, a card, a modal). */
  'panel',
  /** Raised on a panel (a button, a hovered row). */
  'panel-2',
  'border',
  'text',
  /** Text that says less (a header, a hint). */
  'muted',
  'accent',
  /** Text and marks on the accent. */
  'on-accent',
  /** A focus ring. */
  'focus',
  'ok',
  'warn',
  'error',
  'info',
  /** Behind a dialog. */
  'overlay',
  /** What shadows are made of. */
  'shadow',
  /** A switch's knob. */
  'knob',
] as const;

/** The rest: fonts, corners. */
export const SHAPE_TOKENS = ['font', 'mono', 'radius-sm', 'radius', 'radius-lg'] as const;

export const TOKENS = [...COLOR_TOKENS, ...SHAPE_TOKENS] as const;
export type Token = (typeof TOKENS)[number];

/** Some tokens' values (a theme's: those it changes). */
export type Tokens = Partial<Record<Token, string>>;

const dark: Record<Token, string> = {
  bg: '#1a1a1a',
  panel: '#222',
  'panel-2': '#2a2a2a',
  border: '#333',
  text: '#e6e6e6',
  muted: '#9a9a9a',
  accent: '#ff8c2f',
  'on-accent': '#111',
  focus: 'color-mix(in srgb, var(--uk-accent) 40%, transparent)',
  ok: '#4caf50',
  warn: '#e3b341',
  error: '#e5534b',
  info: '#58a6ff',
  overlay: 'rgb(0 0 0 / .5)',
  shadow: '#000',
  knob: '#fff',
  font: 'inherit',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  'radius-sm': '4px',
  radius: '6px',
  'radius-lg': '12px',
};

/** The kit's own look: every token, both variants. */
export const DEFAULT_TOKENS: { dark: Record<Token, string>; light: Record<Token, string> } = {
  dark,
  light: {
    ...dark,
    bg: '#ecebe7',
    panel: '#f8f7f4',
    'panel-2': '#e7e5e0',
    border: '#d6d3cc',
    text: '#1f1e1b',
    muted: '#66635c',
    accent: '#d9690b',
    'on-accent': '#fff',
    ok: '#2e8b3e',
    warn: '#a87a12',
    error: '#c4382f',
    focus: 'color-mix(in srgb, var(--uk-accent) 33%, transparent)',
    info: '#1f6feb',
    overlay: 'rgb(0 0 0 / .28)',
  },
};

/** How big the page is drawn, each a scale of the kit's sizes (its text, its room): compact as given. */
export const SIZES = { compact: 1, comfortable: 1.1, large: 1.2 } as const;
export type Size = keyof typeof SIZES;

/**
 * Styles written in px, drawn at a scale (--uk-u: one px of theirs, 1px as
 * given): each length of 3px or more scaled; lines (1px, 2px) as they are,
 * and what a media or container query asks (its condition is not a style).
 */
export function scaled(css: string): string {
  return css.replace(
    /(@(?:media|container)[^{]*)|(-?\d*\.?\d+)px\b/g,
    (all, at: string | undefined, n: string) => at ?? (Math.abs(Number(n)) < 3 ? all : `calc(${n} * var(--uk-u))`),
  );
}

/** Whether a name is a token. */
export const isToken = (name: string): name is Token => (TOKENS as readonly string[]).includes(name);

/** Tokens as CSS declarations: '--uk-bg: #fff; …' (those that are no tokens left out). */
export function tokenCss(tokens: Tokens): string {
  return Object.entries(tokens)
    .filter(([name, value]) => isToken(name) && typeof value === 'string')
    .map(([name, value]) => `--uk-${name}: ${value};`)
    .join(' ');
}

/** Tokens as a style object (an element's own): { '--uk-bg': '#fff', … }. */
export function tokenStyle(tokens: Tokens): Record<string, string> {
  return Object.fromEntries(
    Object.entries(tokens)
      .filter(([name, value]) => isToken(name) && typeof value === 'string')
      .map(([name, value]) => [`--uk-${name}`, value as string]),
  );
}

/*
 * A theme made of a few knobs (one's own): the accent, the ground's hue,
 * how much of it (0: grey), how dark it is, how far the text stands from
 * it, the corners, the font — every token made of them, both variants (the
 * light one, its ground turned over). Read back from the tokens it made.
 */

export interface ThemeKnobs {
  accent: string;
  hue: number;
  tint: number;
  depth: number;
  contrast: number;
  corners: number;
  font: string;
}

/** A hue knob's track: the colours round (0–360). */
export const HUE_TRACK = `linear-gradient(90deg, ${[0, 60, 120, 180, 240, 300, 360].map((h) => `hsl(${h} 70% 50%)`).join(', ')})`;

/** The kit's own, as near as knobs say it. */
export const KNOBS: ThemeKnobs = { accent: '#ff8c2f', hue: 0, tint: 0, depth: 10, contrast: 90, corners: 6, font: 'inherit' };

const hsl = (h: number, s: number, l: number) => `hsl(${h} ${s}% ${Math.max(0, Math.min(100, l))}%)`;

/** Dark marks on a light accent, light on a dark one. */
function onAccent(color: string): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (!m) return '#111';
  const [r, g, b] = m.slice(1).map((x) => Number.parseInt(x, 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#111' : '#fff';
}

/** The knobs as tokens: dark and light. */
export function madeTheme(k: ThemeKnobs): { dark: Tokens; light: Tokens } {
  const soft = Math.min(k.tint, 12);
  const shape: Tokens = {
    accent: k.accent,
    'on-accent': onAccent(k.accent),
    font: k.font,
    'radius-sm': `${Math.round(k.corners * 0.66)}px`,
    radius: `${k.corners}px`,
    'radius-lg': `${k.corners * 2}px`,
  };
  const light = 99 - k.depth / 5;
  return {
    dark: {
      ...shape,
      bg: hsl(k.hue, k.tint, k.depth),
      panel: hsl(k.hue, k.tint, k.depth + 3),
      'panel-2': hsl(k.hue, k.tint, k.depth + 6),
      border: hsl(k.hue, k.tint, k.depth + 11),
      text: hsl(k.hue, soft, k.contrast),
      muted: hsl(k.hue, soft, (k.contrast + k.depth) / 2 + 8),
    },
    light: {
      ...shape,
      bg: hsl(k.hue, k.tint, light),
      panel: hsl(k.hue, k.tint, light - 2),
      'panel-2': hsl(k.hue, k.tint, light - 5),
      border: hsl(k.hue, k.tint, light - 13),
      text: hsl(k.hue, soft, 100 - k.contrast + 4),
      muted: hsl(k.hue, soft, 100 - (k.contrast + k.depth) / 2 - 8),
    },
  };
}

/** The knobs a theme was made of (its dark tokens, as madeTheme made them); what it says otherwise, the kit's. */
export function knobsOf(dark: Tokens | undefined): ThemeKnobs {
  const of = (token: string | undefined) =>
    /^hsl\((\d+(?:\.\d+)?) (\d+(?:\.\d+)?)% (\d+(?:\.\d+)?)%\)$/
      .exec(token ?? '')
      ?.slice(1)
      .map(Number);
  const bg = of(dark?.bg);
  const text = of(dark?.text);
  const corners = Number.parseFloat(dark?.radius ?? '');
  return {
    accent: dark?.accent && /^#[0-9a-f]{6}$/i.test(dark.accent) ? dark.accent : KNOBS.accent,
    hue: bg?.[0] ?? KNOBS.hue,
    tint: bg?.[1] ?? KNOBS.tint,
    depth: bg?.[2] ?? KNOBS.depth,
    contrast: text?.[2] ?? KNOBS.contrast,
    corners: Number.isNaN(corners) ? KNOBS.corners : corners,
    font: dark?.font ?? KNOBS.font,
  };
}
