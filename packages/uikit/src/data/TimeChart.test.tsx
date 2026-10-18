import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { TimeChart } from './TimeChart';

/*
 * How something went over a range: its number now; pointed at or stepped
 * through by keys, that point's — when and how much in a tip; let go, now
 * again. What the times are called is the caller's.
 */

afterEach(cleanup);

const POINTS = [100, 200, 300, 400, 500];
const when = (i: number) => `${(4 - i) * 15} min ago`;

function chart() {
  const view = render(
    <TimeChart
      title="CPU"
      unit="m"
      points={POINTS}
      start="1h ago"
      end="now"
      when={when}
      marks={[
        { label: 'requests', value: 250, tone: 'info' },
        { label: 'limit', value: 500, tone: 'warn' },
      ]}
    />,
  );
  const plot = view.container.querySelector('.uk-chart-plot') as HTMLElement;
  const head = () => view.container.querySelector('.uk-chart-head b')?.textContent;
  const tip = () => view.container.querySelector('.uk-chart-tip')?.textContent;
  return { ...view, plot, head, tip };
}

describe('TimeChart', () => {
  it('says its number now over it; its marks dashed in their tone, said under it (in its unit) with the range', () => {
    const { container, head, tip } = chart();
    expect([head(), tip()]).toEqual(['500m', undefined]);
    expect([...container.querySelectorAll('.uk-chart-mark')].map((m) => m.getAttribute('data-tone'))).toEqual(['info', 'warn']);
    expect(container.querySelector('.uk-chart-axis')?.textContent).toBe('1h agorequests 250m · limit 500mnow');
  });

  it('draws a value past its top at it, a top of none as none given, one point flat across', () => {
    const plot = (props: { points: number[]; max?: number }) => {
      const { container } = render(<TimeChart title="CPU" start="1h ago" end="now" when={when} {...props} />);
      const d = container.querySelector('.uk-chart-line')?.getAttribute('d') ?? '';
      cleanup();
      return d;
    };
    expect(plot({ points: [100, 900], max: 500 })).not.toMatch(/-\d/);
    expect(plot({ points: [100, 200], max: 0 })).not.toContain('NaN');
    expect(plot({ points: [100] })).toMatch(/^M0,/);
  });

  it('draws no mark past its top (a max given), says it still', () => {
    const { container } = render(
      <TimeChart title="CPU" unit="m" points={POINTS} max={600} start="1h ago" end="now" when={when} marks={[{ label: 'limit', value: 2000, tone: 'warn' }]} />,
    );
    expect(container.querySelectorAll('.uk-chart-mark')).toHaveLength(0);
    expect(container.querySelector('.uk-chart-axis')?.textContent).toBe('1h agolimit 2000mnow');
  });

  it('pointed at: that point’s number, when and how much in a tip — let go, now again', () => {
    const { plot, head, tip } = chart();
    plot.getBoundingClientRect = () => ({ left: 0, width: 400 }) as DOMRect;
    fireEvent.pointerMove(plot, { clientX: 100 });
    expect([head(), tip()]).toEqual(['200m', '45 min ago · 200m']);
    fireEvent.pointerLeave(plot);
    expect([head(), tip()]).toEqual(['500m', undefined]);
  });

  it('is stepped through by keys — arrows, Home, End; Escape lets go — its value said as it moves', () => {
    const { plot, head, tip } = chart();
    fireEvent.keyDown(plot, { key: 'ArrowLeft' });
    expect([head(), plot.getAttribute('aria-valuetext')]).toEqual(['400m', '15 min ago: 400m']);
    fireEvent.keyDown(plot, { key: 'Home' });
    fireEvent.keyDown(plot, { key: 'ArrowLeft' });
    expect(tip()).toBe('60 min ago · 100m');
    fireEvent.keyDown(plot, { key: 'End' });
    expect(head()).toBe('500m');
    fireEvent.keyDown(plot, { key: 'Escape' });
    expect(tip()).toBeUndefined();
  });
});
