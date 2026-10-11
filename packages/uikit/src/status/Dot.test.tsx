import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { Dot } from './Dot';

/* A health dot: its level; named, an image a reader says; else hidden from one. */

afterEach(cleanup);

const dot = (c: Element) => c.querySelector('.uk-dot') as HTMLElement;

describe('Dot', () => {
  it('is marked by its level, grey with none', () => {
    expect(dot(render(<Dot level="warn" />).container).getAttribute('data-level')).toBe('warn');
    cleanup();
    expect(dot(render(<Dot />).container).hasAttribute('data-level')).toBe(false);
  });

  it('is hidden from a reader with no name (what it means is said beside it)', () => {
    const d = dot(render(<Dot level="ok" />).container);
    expect(d.getAttribute('aria-hidden')).toBe('true');
    expect(d.hasAttribute('role')).toBe(false);
  });

  it('is an image a reader says, named, the name under the pointer too', () => {
    const { getByRole } = render(<Dot level="error" title="Failing" />);
    const d = getByRole('img', { name: 'Failing' });
    expect(d.getAttribute('title')).toBe('Failing');
    expect(d.hasAttribute('aria-hidden')).toBe(false);
  });
});
