import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { Usage } from './Usage';

/* How much is used now: its number and unit, its level by its limit, its sparkline with history. */

afterEach(cleanup);

const value = (c: Element) => c.querySelector('.uk-usage-value') as HTMLElement;

describe('Usage', () => {
  it('says its number and unit, plain with no limit', () => {
    const { container } = render(<Usage value={412} unit="m" />);
    expect([value(container).textContent, value(container).hasAttribute('data-level')]).toEqual(['412m', false]);
  });

  it('is a warning near its limit (over 85%), an error over it, plain under', () => {
    const level = (v: number) => value(render(<Usage value={v} unit="Mi" limit={512} />).container).getAttribute('data-level');
    expect([level(400), level(460), level(600)]).toEqual([null, 'warn', 'error']);
  });

  it('draws its sparkline before its number only with history; its title a tip', () => {
    const plain = render(<Usage value={4} unit="m" />).container;
    expect(plain.querySelector('.uk-spark')).toBeNull();
    cleanup();
    const { container } = render(<Usage value={4} unit="m" history={[1, 2, 4]} title="requests 100m" />);
    const usage = container.querySelector('.uk-usage') as HTMLElement;
    expect([usage.firstElementChild?.classList.contains('uk-spark'), usage.title]).toEqual([true, 'requests 100m']);
  });
});
