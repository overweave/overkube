import { cleanup, render } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { css } from '../styles';
import { Stat } from './Stat';

/* A number at a glance: what it says, its level, loading, clicked. */

afterEach(cleanup);

const parts = (c: Element) => ({
  title: c.querySelector('.uk-stat-title')?.textContent,
  value: c.querySelector('.uk-stat-value')?.textContent,
  note: c.querySelector('.uk-stat-note')?.textContent ?? null,
});

describe('Stat', () => {
  it('says what it is, how many of how many, and a note', () => {
    const { container } = render(<Stat icon="cube" title="Pods" value={18} total={25} note="7 need a look" />);
    expect(parts(container)).toEqual({ title: 'Pods', value: '18 / 25', note: '7 need a look' });
    expect(container.querySelector('.uk-stat-title .uk-icon')).not.toBeNull();
  });

  it('says a count alone: no total, no note, no icon', () => {
    const { container } = render(<Stat title="Secrets" value={21} />);
    expect(parts(container)).toEqual({ title: 'Secrets', value: '21', note: null });
    expect(container.querySelector('.uk-icon')).toBeNull();
  });

  it('says 0 of 0 as such (a number, not nothing)', () => {
    expect(parts(render(<Stat title="Jobs" value={0} total={0} />).container).value).toBe('0 / 0');
  });

  it('colours its number and its note by its level', () => {
    const { container } = render(<Stat title="Pods" value={18} total={25} note="7 need a look" level="error" />);
    expect(container.querySelector('.uk-stat-value')?.getAttribute('data-level')).toBe('error');
    expect(container.querySelector('.uk-stat-note')?.getAttribute('data-level')).toBe('error');
  });

  it('shows a shimmer while loading, and says it is busy: no number, no total, no note', () => {
    const { container } = render(<Stat title="Pods" value={18} total={25} note="7 need a look" level="error" loading />);
    const stat = container.querySelector('.uk-stat') as HTMLElement;
    expect(stat.getAttribute('aria-busy')).toBe('true');
    expect(container.querySelector('.uk-stat-shimmer')).not.toBeNull();
    expect(parts(container)).toEqual({ title: 'Pods', value: '', note: null });
    expect(container.querySelector('.uk-stat-value')?.hasAttribute('data-level')).toBe(false);
  });

  it('is no button, and has no arrow, when it does nothing', () => {
    const { container, queryByRole } = render(<Stat title="Pods" value={1} />);
    expect(queryByRole('button')).toBeNull();
    expect(container.querySelector('.uk-stat')?.tagName).toBe('DIV');
    expect(container.querySelector('.uk-stat-go')).toBeNull();
  });

  it('is a button when it does something, named by what it says, its arrow hidden from a reader', async () => {
    let went = 0;
    const { getByRole, container } = render(<Stat icon="cube" title="Pods" value={18} total={25} onClick={() => went++} />);
    const button = getByRole('button', { name: /Pods\s*18 \/ 25/ });
    expect(button.getAttribute('type')).toBe('button');
    expect(container.querySelector('.uk-stat-go')?.getAttribute('aria-hidden')).toBe('true');
    const user = userEvent.setup();
    await user.click(button);
    button.focus();
    await user.keyboard('{Enter}');
    expect(went).toBe(2);
  });

  it('keeps one set of its rules (none drawn twice), and its number in figures of one width', () => {
    expect(css.split('\n').filter((l) => l.startsWith('button.uk-stat {'))).toHaveLength(1);
    expect(css.split('\n').find((l) => l.startsWith('.uk-stat-value {'))).toContain('tabular-nums');
  });
});
