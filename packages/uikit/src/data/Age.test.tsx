import { act, cleanup, render } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AGE_TICK_MS, Age, age } from './Age';

/* How long ago, as kubectl says it (to one unit); and Age, moving on as time does. */

const AT = Date.parse('2026-10-09T12:00:00Z');
const ago = (seconds: number) => new Date(AT - seconds * 1000).toISOString();

describe('age', () => {
  it('says seconds under two minutes, minutes under two hours, hours under two days, else days', () => {
    expect([0, 45, 119, 120, 754, 7199, 7200, 10_800, 172_799, 172_800, 432_000, 40_000_000].map((s) => age(ago(s), AT))).toEqual([
      '0s',
      '45s',
      '119s',
      '2m',
      '12m',
      '119m',
      '2h',
      '3h',
      '47h',
      '2d',
      '5d',
      '462d',
    ]);
  });

  it('rounds down, as kubectl does', () => {
    expect(age(ago(179), AT)).toBe('2m');
    expect(age(ago(3 * 3600 + 3599), AT)).toBe('3h');
  });

  it('takes a time as a string, a number or a Date', () => {
    expect(age('2026-10-09T11:48:00Z', AT)).toBe('12m');
    expect(age(AT - 45_000, AT)).toBe('45s');
    expect(age(new Date(AT - 3 * 3_600_000), AT)).toBe('3h');
  });

  it('says 0s of a time yet to come (a clock a little ahead)', () => {
    expect(age(ago(-30), AT)).toBe('0s');
  });

  it('says nothing for no time, or one that is not a time', () => {
    expect(age(undefined, AT)).toBe('');
    expect(age('', AT)).toBe('');
    expect(age('yesterday', AT)).toBe('');
  });

  it('is as of now when not told when', () => {
    expect(age(new Date(Date.now() - 5 * 60_000))).toBe('5m');
  });
});

describe('Age', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(AT);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('says how long ago, the time itself under the pointer', () => {
    const { container } = render(<Age since={ago(45)} />);
    const span = container.querySelector('span') as HTMLElement;
    expect(span.textContent).toBe('45s');
    expect(span.getAttribute('title')).toBe(ago(45));
  });

  it('says nothing for no time', () => {
    expect(render(<Age />).container.textContent).toBe('');
  });

  it('moves on as time does, every one together', () => {
    const { container } = render(
      <>
        <Age since={ago(90)} />
        <Age since={ago(3600 * 2 - 10)} />
      </>,
    );
    const said = () => [...container.querySelectorAll('span')].map((s) => s.textContent);
    expect(said()).toEqual(['90s', '119m']);
    act(() => {
      vi.advanceTimersByTime(AGE_TICK_MS);
    });
    expect(said()).toEqual(['2m', '2h']);
  });

  it('runs nothing with none drawn: the first starts its clock, the last stops it', () => {
    expect(vi.getTimerCount()).toBe(0);
    const one = render(<Age since={ago(1)} />);
    const two = render(<Age since={ago(2)} />);
    expect(vi.getTimerCount()).toBe(1);
    one.unmount();
    expect(vi.getTimerCount()).toBe(1);
    two.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('is as of now when drawn again after a while with none drawn', () => {
    render(<Age since={ago(0)} />).unmount();
    vi.setSystemTime(AT + 10 * 60_000);
    const { container } = render(<Age since={ago(0)} />);
    act(() => {});
    expect(container.textContent).toBe('10m');
  });
});
