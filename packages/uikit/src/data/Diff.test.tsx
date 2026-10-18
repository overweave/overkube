import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { Diff, diffLines } from './Diff';

afterEach(cleanup);

describe('Diff', () => {
  it('says the lines gone before those come, the rest as they are', () => {
    expect(diffLines('a\nb\nc', 'a\nB\nc')).toEqual([
      [' ', 'a'],
      ['-', 'b'],
      ['+', 'B'],
      [' ', 'c'],
    ]);
  });

  it('sets aside what both start and end with; too many lines between to compare, all gone then all come (never a table of every pair held)', () => {
    const many = (p: string) => Array.from({ length: 2500 }, (_, i) => `${p}${i}`);
    const lines = diffLines(['head', ...many('a'), 'tail'].join('\n'), ['head', ...many('b'), 'tail'].join('\n'));
    expect(lines.map(([d]) => d).join('')).toBe(` ${'-'.repeat(2500)}${'+'.repeat(2500)} `);
    // A change in a long text: only it compared.
    const long = many('l');
    expect(diffLines(long.join('\n'), long.map((l) => (l === 'l1000' ? 'L1000' : l)).join('\n')).filter(([d]) => d !== ' ')).toEqual([
      ['-', 'l1000'],
      ['+', 'L1000'],
    ]);
  });

  it('heads it (its name, its counts) and each hunk as git does; numbers each line; marks what changed in a line; a skipped run shown by its button', () => {
    const long = Array.from({ length: 20 }, (_, i) => `l${i}`);
    const { container } = render(<Diff title="values.yaml" before={[...long, 'message: installed'].join('\n')} after={[...long, 'message: upgraded'].join('\n')} />);
    expect(container.querySelector('.uk-diff-head')?.textContent).toBe('values.yaml+1−1');
    const rows = () => [...container.querySelectorAll('.uk-diff-row')].map((r) => [...r.children].map((c) => c.textContent));
    expect(rows()).toEqual([
      ['', '@@ -18,4 +18,4 @@'],
      ['18', '18', ' l17'],
      ['19', '19', ' l18'],
      ['20', '20', ' l19'],
      ['21', '', '−message: installed'],
      ['', '21', '+message: upgraded'],
    ]);
    expect([...container.querySelectorAll('mark')].map((m) => m.textContent)).toEqual(['installed', 'upgraded']);
    fireEvent.click(container.querySelector('.uk-diff-expand button') as HTMLButtonElement);
    expect(rows()).toHaveLength(22);
  });

  it('the same texts: said so', () => {
    expect(render(<Diff before="a" after="a" same="No differences." />).container.textContent).toBe('No differences.');
  });
});
