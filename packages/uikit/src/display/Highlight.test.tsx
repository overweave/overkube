import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { Highlight } from './Highlight';

/* What a query matches in a text, marked: the first match, case aside, as the text writes it. */

afterEach(cleanup);

/** The text as drawn, the marked part in brackets. */
function drawn(text: string, query: string): string {
  const { container } = render(<Highlight text={text} query={query} />);
  return [...container.childNodes].map((n) => (n.nodeName === 'MARK' ? `[${n.textContent}]` : n.textContent)).join('');
}

describe('Highlight', () => {
  it('marks what matches, at the start, in the middle, at the end, or all of it', () => {
    expect(drawn('Pods', 'po')).toBe('[Po]ds');
    expect(drawn('StatefulSets', 'ful')).toBe('State[ful]Sets');
    expect(drawn('Deployments', 'ments')).toBe('Deploy[ments]');
    expect(drawn('Jobs', 'jobs')).toBe('[Jobs]');
  });

  it('matches case aside, and marks the text as it is written', () => {
    expect(drawn('ConfigMaps', 'CONFIGM')).toBe('[ConfigM]aps');
  });

  it('marks the first match only', () => {
    expect(drawn('ingress-nginx-ingress', 'ingress')).toBe('[ingress]-nginx-ingress');
  });

  it('takes a query without the spaces around it', () => {
    expect(drawn('Pods', '  od ')).toBe('P[od]s');
  });

  it('draws the text alone with no query, a blank one, or no match', () => {
    expect(drawn('Pods', '')).toBe('Pods');
    expect(drawn('Pods', '   ')).toBe('Pods');
    expect(drawn('Pods', 'nodes')).toBe('Pods');
    expect(drawn('Pods', 'Pods and more')).toBe('Pods');
  });

  it('takes a query as text, not a pattern', () => {
    expect(drawn('a.b*c', '.b*')).toBe('a[.b*]c');
    expect(drawn('abc', '.')).toBe('abc');
  });

  it('marks with the kit’s mark', () => {
    const { container } = render(<Highlight text="Pods" query="po" />);
    expect(container.querySelector('mark')?.getAttribute('class')).toBe('uk-mark');
  });
});
