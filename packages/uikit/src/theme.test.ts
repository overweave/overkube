import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { css } from './styles';
import { DEFAULT_TOKENS, KNOBS, knobsOf, madeTheme, scaled, TOKENS, tokenCss, tokenStyle } from './theme';

/*
 * The kit's look, all tokens: every token has both defaults; the styles
 * read them, and write no colour of their own (none outside theme.ts) —
 * so a theme reaches everything.
 */

const COLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|(?<![\w-])(white|black)(?![\w-])/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}

describe('tokens', () => {
  it('each has a default in both variants', () => {
    for (const variant of ['dark', 'light'] as const) expect(Object.keys(DEFAULT_TOKENS[variant]).sort()).toEqual([...TOKENS].sort());
  });

  it('are what the styles read: no colour written anywhere else in the kit', () => {
    const own = join(import.meta.dirname, 'theme.ts');
    const generated = join(import.meta.dirname, 'display', 'icons.generated.ts');
    const written = files(import.meta.dirname)
      .filter((f) => f !== own && f !== generated && !f.endsWith('.test.ts') && !f.endsWith('.test.tsx'))
      .flatMap((f) =>
        readFileSync(f, 'utf8')
          .split('\n')
          .map((line, i) => [f, i + 1, line] as const)
          .filter(([, , line]) => COLOR.test(line.replace(/'#\/[^']*'|"#\/[^"]*"|`#\/[^`]*`|#\{|&#\d+;/g, ''))),
      )
      .map(([f, n, line]) => `${f.slice(import.meta.dirname.length + 1)}:${n}: ${line.trim()}`);
    expect(written).toEqual([]);
    expect(css).toContain('--uk-accent: #ff8c2f;');
  });

  it('are said as CSS and as a style, those that are none left out', () => {
    expect(tokenCss({ accent: 'red', 'radius-lg': '0' })).toBe('--uk-accent: red; --uk-radius-lg: 0;');
    expect(tokenStyle({ accent: 'red', nope: 'x' } as never)).toEqual({ '--uk-accent': 'red' });
  });
});

describe('a theme of knobs', () => {
  it('makes both variants of a few knobs, and reads them back of what it made; what it did not make, the kit’s', () => {
    const knobs = { accent: '#a371f7', hue: 260, tint: 14, depth: 12, contrast: 88, corners: 4, font: 'inherit' };
    const made = madeTheme(knobs);
    expect([made.dark.bg, made.dark['on-accent'], made.dark.radius, made.light.bg]).toEqual(['hsl(260 14% 12%)', '#fff', '4px', 'hsl(260 14% 96.6%)']);
    expect(knobsOf(made.dark)).toEqual(knobs);
    expect(knobsOf({ bg: '#000', accent: 'red' })).toEqual(KNOBS);
  });
});

describe('styles at a scale', () => {
  it('leave the tokens and the host’s padding as they are said: the kit’s own styles scaled', () => {
    expect([css.includes('--uk-radius: 6px;'), css.includes('--uk-shell-inset: 32px;'), css.includes('--uk-row: calc(34 * var(--uk-u));')]).toEqual([true, true, true]);
  });

  it('scale each length but lines, and what a query asks', () => {
    expect(scaled('.a { padding: 8px -12px; border: 1px solid; } @container (max-width: 760px) { .b { gap: 16px; } }')).toBe(
      '.a { padding: calc(8 * var(--uk-u)) calc(-12 * var(--uk-u)); border: 1px solid; } @container (max-width: 760px) { .b { gap: calc(16 * var(--uk-u)); } }',
    );
  });
});
