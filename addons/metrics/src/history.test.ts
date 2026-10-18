import { reachOver } from '@overkube/sdk';
import { effect, signal } from '@preact/signals';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Keeper, type LineOf, lines, range } from './history.ts';

/*
 * What is asked of where history is kept: a range's points on its grid,
 * and the lines of what tables show — those not had yet fetched within a
 * moment, alone; those had, again each minute (of those still drawn); a
 * query that failed, again in a minute, the rest kept.
 */

const target = { kind: 'service', namespace: 'm', name: 'vmsingle-main', port: 8428 } as const;

/** A keeper answering each query with a line per pod it names (fail: a namespace whose queries fail); what it was asked. */
function keeperOf(fail = new Set<string>()) {
  const asked: string[] = [];
  const reach = reachOver(async (_method, _path, init = {}) => {
    const query = init.query?.query ?? '';
    asked.push(query);
    const namespace = /namespace="([^"]+)"/.exec(query)?.[1] ?? '';
    if (fail.has(namespace)) return Response.json({ status: 'error', error: 'boom' });
    const pods = /pod=~"([^"]+)"/.exec(query)?.[1]?.split('|') ?? [];
    const start = Number(init.query?.start);
    return Response.json({
      status: 'success',
      data: { resultType: 'matrix', result: pods.map((pod) => ({ metric: { namespace, pod }, values: [0, 1, 2].map((i) => [start + i * 60, String(i + 1)]) })) },
    });
  });
  return { keeper: { title: 'VictoriaMetrics', target, reach } satisfies Keeper, asked };
}

const pod = (key: string): LineOf => ({ kind: 'pods', key, metric: 'cpu' });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('lines', () => {
  it('fetches those asked within a moment together (a query a namespace), again each minute of those still drawn — those not, let go of', async () => {
    const { keeper, asked } = keeperOf();
    const l = lines(signal<Keeper | null>(keeper));
    const drawn = signal(['shop/a', 'shop/b', 'ops/c']);
    const seen: (readonly number[] | undefined)[][] = [];
    const stop = effect(() => void seen.push(drawn.value.map((k) => l.line(pod(k)))));
    await vi.advanceTimersByTimeAsync(100);
    expect(asked).toHaveLength(2);
    expect(seen.at(-1)).toEqual([
      [1, 2, 3],
      [1, 2, 3],
      [1, 2, 3],
    ]);
    // Drawn since: asked again in a minute; one no longer drawn since, not.
    drawn.value = ['shop/a'];
    await vi.advanceTimersByTimeAsync(60_000);
    const had = asked.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(asked.slice(had)).toEqual([expect.stringContaining('pod=~"a"')]);
    stop();
    l.stop();
  });

  it('fetches a line not had yet within a moment, alone — not those had with it', async () => {
    const { keeper, asked } = keeperOf();
    const l = lines(signal<Keeper | null>(keeper));
    const drawn = signal(['shop/a']);
    const stop = effect(() => void drawn.value.map((k) => l.line(pod(k))));
    await vi.advanceTimersByTimeAsync(100);
    drawn.value = ['shop/a', 'shop/b'];
    await vi.advanceTimersByTimeAsync(100);
    expect(asked).toEqual([expect.stringContaining('pod=~"a"'), expect.stringContaining('pod=~"b"')]);
    stop();
    l.stop();
  });

  it('keeps what came of the queries that answered, asks those that failed again in a minute; none asked with no keeper, or once stopped', async () => {
    const { keeper, asked } = keeperOf(new Set(['ops']));
    const l = lines(signal<Keeper | null>(keeper));
    const stop = effect(() => void ['shop/a', 'ops/c'].map((k) => l.line(pod(k))));
    await vi.advanceTimersByTimeAsync(100);
    expect([l.line(pod('shop/a')), l.line(pod('ops/c'))]).toEqual([[1, 2, 3], undefined]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(asked.filter((q) => q.includes('"ops"'))).toHaveLength(2);
    stop();
    l.stop();
    await vi.advanceTimersByTimeAsync(120_000);
    const before = asked.length;
    const none = lines(signal<Keeper | null>(null));
    expect(none.line(pod('shop/a'))).toBeUndefined();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(asked).toHaveLength(before);
  });
});

describe('a range', () => {
  it('is its points on its grid: one off it to the nearest, none kept or not a number a gap', async () => {
    const reach = reachOver(async () =>
      Response.json({
        status: 'success',
        data: {
          resultType: 'matrix',
          result: [
            {
              metric: { node: 'n1' },
              values: [
                [1000, '1'],
                [1062, '2'],
                [1180, 'NaN'],
              ],
            },
          ],
        },
      }),
    );
    const got = await range({ title: 'x', target, reach }, 'q', 1000, 1180, 60);
    expect(got.get('n1')).toEqual([1, 2, null, null]);
  });

  it('says why the keeper did not answer', async () => {
    const reach = reachOver(async () => Response.json({ status: 'error', error: 'parse error' }));
    await expect(range({ title: 'x', target, reach }, 'q', 0, 60, 60)).rejects.toThrow('parse error');
  });
});
