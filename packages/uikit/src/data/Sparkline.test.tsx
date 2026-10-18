import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { Sparkline } from './Sparkline';

/* How something went, drawn small: a picture only, from nothing up, a dot where it is now. */

afterEach(cleanup);

describe('Sparkline', () => {
  it('draws nothing of fewer than two points', () => {
    expect(render(<Sparkline points={[3]} />).container.innerHTML).toBe('');
  });

  it('is a picture only: hidden from those who cannot see it', () => {
    const svg = render(<Sparkline points={[1, 2, 3]} />).container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });

  it('draws a steady line flat, from nothing up — its dot where it is now, at its end', () => {
    const { container } = render(<Sparkline points={[5, 5, 5, 5]} width={60} height={22} />);
    const line = container.querySelector('.uk-spark-line')?.getAttribute('d') ?? '';
    const ys = new Set([...line.matchAll(/[\d.]+,([\d.]+)/g)].map((m) => m[1]));
    expect(ys).toEqual(new Set(['4']));
    const dot = container.querySelector('circle');
    expect([dot?.getAttribute('cx'), dot?.getAttribute('cy')]).toEqual(['60', '4']);
  });
});
