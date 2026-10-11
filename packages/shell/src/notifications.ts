import type { Notification } from '@overkube/sdk';
import type { Shown } from '@overkube/sdk/preact';
import { type ReadonlySignal, signal } from '@preact/signals';

/*
 * What the user is told: kept until its time is up (a few seconds; an
 * error until closed) or it is dismissed.
 */

export interface Notifications {
  readonly list: ReadonlySignal<readonly Shown[]>;
  /** Told: its id. One with the key (and teller) of one shown replaces it, its id kept. */
  notify(notification: Notification, from?: string): string;
  dismiss(id: string): void;
  /** Its time stopped (the pointer on it, focus in it), or let run again. */
  hold(id: string, held: boolean): void;
  /** Every one let go of, no timer left. */
  close(): void;
}

const DEFAULT_MS = 5000;

export function notifications(): Notifications {
  const list = signal<readonly Shown[]>([]);
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  let next = 0;
  const dismiss = (id: string) => {
    clearTimeout(timers.get(id));
    timers.delete(id);
    list.value = list.peek().filter((n) => n.id !== id);
  };
  const msOf = (n: Notification) => n.timeoutMs ?? (n.level === 'error' ? 0 : DEFAULT_MS);
  const time = (id: string, ms: number) => {
    clearTimeout(timers.get(id));
    timers.delete(id);
    if (ms > 0)
      timers.set(
        id,
        setTimeout(() => dismiss(id), ms),
      );
  };
  return {
    list,
    notify(notification, from) {
      const same = notification.key === undefined ? undefined : list.peek().find((n) => n.key === notification.key && n.from === from);
      const id = same?.id ?? `n${++next}`;
      const shown: Shown = { ...notification, id, ...(from ? { from } : {}) };
      list.value = same ? list.peek().map((n) => (n.id === id ? shown : n)) : [...list.peek(), shown];
      time(id, msOf(notification));
      return id;
    },
    dismiss,
    hold(id, held) {
      const n = list.peek().find((x) => x.id === id);
      if (n) time(id, held ? 0 : msOf(n));
    },
    close() {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
      list.value = [];
    },
  };
}
