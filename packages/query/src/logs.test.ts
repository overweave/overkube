import { describe, expect, it } from 'vitest';
import { cursorOf, entriesBefore, entriesOf, logWindow, readCursor } from './logs.ts';

/*
 * A log's windows by cursor: a line with its pieces one entry; the newest
 * so many, or those just before a window — lines of one time told apart by
 * their order.
 */

const at = (time: string, text: string) => ({ time, text });
const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

describe('a log’s windows', () => {
  const lines = [at('t1', 'a'), at('t2', 'b'), { text: 'b, the rest' }, at('t3', 'c'), at('t3', 'd'), at('t3', 'e'), at('t4', 'f')];

  it('take a line with its pieces as one; the newest so many, where the one before begins', () => {
    const entries = entriesOf(lines);
    expect(entries.map((e) => e.length)).toEqual([1, 2, 1, 1, 1, 1]);
    expect(logWindow(entries, 3)).toEqual({ lines: [at('t3', 'd'), at('t3', 'e'), at('t4', 'f')], older: 't3 2' });
    expect(logWindow(entries, 10)).toEqual({ lines });
  });

  it('give those before a cursor, of its time all but the last it has; none for a cursor that is not one', () => {
    const entries = entriesOf(lines);
    const cursor = readCursor('t3 2') as { time: string; count: number };
    expect(
      entriesBefore(entries, cursor, order)
        .flat()
        .map((l) => l.text),
    ).toEqual(['a', 'b', 'b, the rest', 'c']);
    expect(logWindow(entriesBefore(entries, cursor, order), 2)).toEqual({ lines: [at('t2', 'b'), { text: 'b, the rest' }, at('t3', 'c')], older: 't2 1' });
    expect([readCursor('t3'), readCursor('t3 -1'), cursorOf([[{ text: 'piece' }]])]).toEqual([undefined, undefined, undefined]);
  });
});
