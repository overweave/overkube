/*
 * What is asked once of the cluster, a few at a time (not a hundred
 * requests at once): what is in sight first (now: a picker's counts, a
 * search's kind), what goes on behind after (later: a search's lists of
 * every kind) — in the order they come within each; one let go of before
 * its turn (its signal aborted) never asked.
 */

/** How many are asked at a time. */
const AT_ONCE = 6;

export type Lane = 'now' | 'later';

type Job = (signal: AbortSignal) => Promise<void>;

export class Queue {
  private readonly lanes: Record<Lane, { job: Job; signal: AbortSignal }[]> = { now: [], later: [] };
  private running = 0;

  /** A job, run once one of the few places is free (those in sight first); let go of before then (its signal aborted): never run. */
  add(job: Job, how: { lane: Lane; signal: AbortSignal }): void {
    this.lanes[how.lane].push({ job, signal: how.signal });
    this.pump();
  }

  private next(): { job: Job; signal: AbortSignal } | undefined {
    for (const lane of ['now', 'later'] as const) {
      const waiting = this.lanes[lane];
      while (waiting.length) {
        const one = waiting.shift() as { job: Job; signal: AbortSignal };
        if (!one.signal.aborted) return one;
      }
    }
    return undefined;
  }

  private pump(): void {
    while (this.running < AT_ONCE) {
      const one = this.next();
      if (!one) return;
      this.running++;
      // A job's failure its own (told through what it answers): never the queue's.
      void one
        .job(one.signal)
        .catch(() => {})
        .finally(() => {
          this.running--;
          this.pump();
        });
    }
  }
}
