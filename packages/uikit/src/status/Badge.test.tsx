import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { css } from '../styles';
import { Badge } from './Badge';

/* A word or a number on a tint of its level: its level, a dot, its words cut short with a title. */

afterEach(cleanup);

const badge = (c: Element) => c.querySelector('.uk-badge') as HTMLElement;

describe('Badge', () => {
  it('says its words, marked by its level', () => {
    const { container } = render(<Badge level="error">CrashLoopBackOff</Badge>);
    expect(badge(container).textContent).toBe('CrashLoopBackOff');
    expect(badge(container).getAttribute('data-level')).toBe('error');
  });

  it('is grey with no level', () => {
    expect(badge(render(<Badge>init</Badge>).container).hasAttribute('data-level')).toBe(false);
  });

  it('draws a dot of its level before its words, asked to, hidden from a reader', () => {
    const { container } = render(
      <Badge level="ok" dot>
        Running
      </Badge>,
    );
    const dot = container.querySelector('.uk-badge-dot') as HTMLElement;
    expect(badge(container).firstElementChild).toBe(dot);
    expect(dot.getAttribute('aria-hidden')).toBe('true');
    expect(badge(container).textContent).toBe('Running');
    cleanup();
    expect(render(<Badge level="ok">Running</Badge>).container.querySelector('.uk-badge-dot')).toBeNull();
  });

  it('says it in full under the pointer, given a title (its tip)', () => {
    fireEvent.keyDown(document, { key: 'Tab' });
    fireEvent.focusIn(badge(render(<Badge title="Back-off restarting a failed container">CrashLoopBackOff</Badge>).container));
    expect(document.querySelector('.uk-tip')?.textContent).toBe('Back-off restarting a failed container');
  });

  it('draws a number', () => {
    expect(badge(render(<Badge level="warn">{3}</Badge>).container).textContent).toBe('3');
  });

  it('darkens its words on a light page, to be read', () => {
    expect(css).toContain(".uk-root[data-theme='light'] .uk-badge[data-level]");
  });
});
