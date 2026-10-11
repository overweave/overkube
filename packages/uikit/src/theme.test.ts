import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { css } from './styles';
import { DEFAULT_TOKENS, TOKENS, tokenCss, tokenStyle } from './theme';

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
