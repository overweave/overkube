import { computed } from '@preact/signals';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Kept } from './kept.ts';
import { Queue } from './queue.ts';

/*
 * Answers asked once and kept a while: in sight first, let go of when no
 * one reads them (not asked, or aborted on their way), asked again as they
 * get old while read (a passing failure sooner), let go of whole unread.
 */

afterEach(() => {
  vi.useRealTimers();
});

const flush = () => vi.advanceTimersByTimeAsync(0);

describe('kept answers', () => {
  it('asks what is in sight first; one let go of before its turn is never asked; one on its way, aborted', async () => {
    vi.useFakeTimers();
    const queue = new Queue();
    const started: string[] = [];
    const aborted: string[] = [];
    const later = new Kept<string>({ queue, lane: 'later', ttl: 60_000 });
    const now = new Kept<string>({ queue, lane: 'now', ttl: 60_000 });
    const ask = (key: string) => (signal: AbortSignal) =>
      new Promise<string>((resolve) => {
        started.push(key);
        signal.addEventListener('abort', () => aborted.push(key));
        setTimeout(() => resolve(key), 1000);
      });
    // Eight behind (six at a time), one in sight after them: it goes before the two left.
    const reads = Array.from({ length: 8 }, (_, i) => computed(() => later.read(`l${i}`, ask(`l${i}`))));
    const offs = reads.map((r) => r.subscribe(() => {}));
    const seen = computed(() => now.read('n', ask('n')));
    const off = seen.subscribe(() => {});
    await flush();
    expect(started).toEqual(['l0', 'l1', 'l2', 'l3', 'l4', 'l5']);
    // No one reads two waiting and one on its way: never asked, aborted.
    offs[6]();
    offs[7]();
    offs[0]();
    expect(aborted).toEqual(['l0']);
    await vi.advanceTimersByTimeAsync(1000);
    expect(started).toEqual(['l0', 'l1', 'l2', 'l3', 'l4', 'l5', 'n']);
    await vi.advanceTimersByTimeAsync(1000);
    expect(seen.value).toEqual({ value: 'n' });
    off();
    for (const o of offs) o();
  });

  it('asks again as it gets old while read (a passing failure sooner), and lets go of one unread a while', async () => {
    vi.useFakeTimers();
    const kept = new Kept<number>({ queue: new Queue(), lane: 'now', ttl: 60_000, idle: 120_000 });
    let n = 0;
    let fail = true;
    const ask = async () => {
      n++;
      if (fail) throw Object.assign(new Error('busy'), { status: 503, code: 'ServiceUnavailable' });
      return n;
    };
    const read = computed(() => kept.read('k', ask));
    const off = read.subscribe(() => {});
    await flush();
    expect(read.value).toMatchObject({ error: { status: 503 } });
    // Passing: again after 2 s, not a minute.
    fail = false;
    await vi.advanceTimersByTimeAsync(2000);
    expect(read.value).toEqual({ value: 2 });
    // Old while read: asked again, those reading it told.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(read.value).toEqual({ value: 3 });
    // No one reads it: not asked again; a while after, let go of whole.
    off();
    await vi.advanceTimersByTimeAsync(180_000);
    expect(n).toBe(3);
    kept.read('other', async () => 0);
    expect(kept.size).toBe(1);
  });

  it('asks nothing of a read no one follows; a job that throws does not stop the queue', async () => {
    vi.useFakeTimers();
    const queue = new Queue();
    const kept = new Kept<number>({ queue, lane: 'now', ttl: 60_000 });
    let asked = 0;
    expect(kept.read('k', async () => ++asked)).toBeUndefined();
    await flush();
    expect(asked).toBe(0);
    let ran = 0;
    queue.add(() => Promise.reject(new Error('no luck')), { lane: 'now', signal: new AbortController().signal });
    queue.add(async () => void ran++, { lane: 'now', signal: new AbortController().signal });
    await flush();
    expect(ran).toBe(1);
  });
});
