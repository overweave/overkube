import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { toYaml } from '../lib/yaml';
import { YamlView } from './YamlView';

/*
 * YAML as it reads best: each line numbered, its parts told apart (a key,
 * a string, a number, a word, a block of text); a key's lines folded away
 * and back; how long it is said.
 */

afterEach(cleanup);

const text = toYaml({
  metadata: { name: 'web', labels: { app: 'web' } },
  spec: { replicas: 2, paused: false, note: 'line one\nline two', ports: [{ port: 80 }] },
});

describe('YAML shown', () => {
  it('tells each line’s parts apart', () => {
    const { container } = render(<YamlView text={text} />);
    const kinds = (n: number) => [...container.querySelectorAll('.uk-yaml-line')][n].querySelectorAll('[data-k]');
    const parts = (n: number) => [...kinds(n)].map((p) => [p.textContent, p.getAttribute('data-k')]);
    expect(container.querySelector('.uk-yaml-size')?.textContent).toMatch(/^12 lines · \d+ B$/);
    expect(parts(1)).toEqual([
      ['name', 'key'],
      [':', 'mark'],
      ['web', 'string'],
    ]);
    expect(parts(5)).toEqual([
      ['replicas', 'key'],
      [':', 'mark'],
      ['2', 'number'],
    ]);
    expect(parts(6)).toEqual([
      ['paused', 'key'],
      [':', 'mark'],
      ['false', 'word'],
    ]);
    expect([parts(7), parts(8)]).toEqual([
      [
        ['note', 'key'],
        [':', 'mark'],
        ['|-', 'mark'],
      ],
      [['    line one', 'block']],
    ]);
    expect(parts(11)).toEqual([
      ['- ', 'mark'],
      ['port', 'key'],
      [':', 'mark'],
      ['80', 'number'],
    ]);
  });

  it('tells a comment apart after a value, a line that starts with # as one; reads a long run of dashes or # at once', () => {
    const { container } = render(<YamlView text={'image: web:1.2 # pinned\n#a: b # c\n- - name: x'} />);
    const parts = (n: number) => [...[...container.querySelectorAll('.uk-yaml-line')][n].querySelectorAll('[data-k]')].map((p) => [p.textContent, p.getAttribute('data-k')]);
    expect(parts(0)).toEqual([
      ['image', 'key'],
      [':', 'mark'],
      ['web:1.2', 'string'],
      [' # pinned', 'comment'],
    ]);
    expect(parts(1)).toEqual([['#a: b # c', 'comment']]);
    expect(parts(2)).toEqual([
      ['- - ', 'mark'],
      ['name', 'key'],
      [':', 'mark'],
      ['x', 'string'],
    ]);
    // What an object may say (an annotation's value): never slow to read, however it repeats.
    const started = performance.now();
    render(<YamlView text={`${'- '.repeat(20000)}!\nnote: ${' #'.repeat(20000)}!\nk${' '.repeat(20000)}x`} />);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it('folds a key’s lines away, how many said in their place — and back', () => {
    const { container } = render(<YamlView text={text} />);
    const lines = () => container.querySelectorAll('.uk-yaml-line').length;
    expect(lines()).toBe(12);
    fireEvent.click(container.querySelectorAll('.uk-yaml-fold')[0] as HTMLElement);
    expect([lines(), container.querySelector('.uk-yaml-skip')?.textContent]).toEqual([10, '… 3 lines']);
    fireEvent.click(container.querySelector('.uk-yaml-skip') as HTMLElement);
    expect(lines()).toBe(12);
  });

  it('folds a block of text whole, its blank lines in it — not those after it', () => {
    const { container } = render(<YamlView text={'data:\n  script: |\n    one\n\n    two\n\nkind: ConfigMap\n'} />);
    fireEvent.click(container.querySelectorAll('.uk-yaml-fold')[0] as HTMLElement);
    expect([...container.querySelectorAll('.uk-yaml-line')].map((l) => l.textContent?.replace(/^\d+/, ''))).toEqual(['data:', '… 4 lines', '', 'kind: ConfigMap']);
  });

  it('keeps a key folded as the text changes (a watched object’s), by where it is — not by its line', () => {
    const { container, rerender } = render(<YamlView text={'metadata:\n  name: web\nstatus:\n  phase: Pending\n'} />);
    fireEvent.click(container.querySelectorAll('.uk-yaml-fold')[1] as HTMLElement);
    rerender(<YamlView text={'metadata:\n  name: web\n  labels:\n    app: web\nstatus:\n  phase: Running\n'} />);
    expect([...container.querySelectorAll('.uk-yaml-line')].map((l) => l.textContent?.replace(/^\d+/, ''))).toEqual([
      'metadata:',
      '  name: web',
      '  labels:',
      '    app: web',
      'status:',
      '… 1 lines',
    ]);
  });
});
