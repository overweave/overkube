import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type LogRow, LogView } from './LogView';

/*
 * A log's lines in sight: each its source, its time, its text (what is
 * looked for marked); more further back asked for at its top — not while
 * some is on its way (said so).
 */

afterEach(cleanup);

const rows: LogRow[] = [
  { key: 'a|1', time: '2026-10-17T09:00:01.5Z', text: 'GET / 200', source: { name: 'app', colour: 'red' } },
  { key: 'b|1', time: '2026-10-17T09:00:02Z', text: '[error] upstream timed out', source: { name: 'envoy', colour: 'blue' }, level: 'error' },
];

describe('a log’s lines', () => {
  it('are drawn each its source (when several), its time, its text — what is looked for marked', () => {
    const { container } = render(<LogView rows={rows} sources find="UPSTREAM" />);
    const lines = [...container.querySelectorAll('.uk-log-line')];
    expect(
      lines.map((l) => [l.querySelector('em')?.textContent, l.querySelector('time')?.textContent, l.querySelector('span')?.textContent, l.getAttribute('data-level')]),
    ).toEqual([
      ['app', '09:00:01.500', 'GET / 200', null],
      ['envoy', '09:00:02.000', '[error] upstream timed out', 'error'],
    ]);
    expect(container.querySelector('mark')?.textContent).toBe('upstream');
  });

  it('ask for more further back at its top, not while some is on its way (said so)', () => {
    const onOlder = vi.fn();
    const { container, rerender } = render(<LogView rows={rows} more onOlder={onOlder} />);
    const scroller = container.querySelector('.uk-log-scroll') as HTMLElement;
    fireEvent.scroll(scroller);
    expect(onOlder).toHaveBeenCalledTimes(1);
    rerender(<LogView rows={rows} more loading onOlder={onOlder} />);
    fireEvent.scroll(scroller);
    expect([onOlder.mock.calls.length, container.querySelector('.uk-log-note[data-at="top"]') !== null]).toEqual([1, true]);
    // In, and nothing more: none asked, none said.
    rerender(<LogView rows={rows} onOlder={onOlder} />);
    fireEvent.scroll(scroller);
    expect([onOlder.mock.calls.length, container.querySelector('.uk-log-note[data-at="top"]')]).toEqual([1, null]);
  });
});
