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
    bg: '#fff',
    panel: '#f7f7f7',
    'panel-2': '#efefef',
    border: '#ddd',
    text: '#222',
    muted: '#6b6b6b',
    focus: 'color-mix(in srgb, var(--uk-accent) 33%, transparent)',
    info: '#1f6feb',
    overlay: 'rgb(0 0 0 / .28)',
  },
};

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
