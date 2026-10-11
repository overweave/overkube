import { type ComponentCluster, kindMatcher } from '@overkube/sdk';
import { KubeProvider, PageProvider, type PageValue } from '@overkube/sdk/preact';
import type { Registry } from '@overweave/core';
import type { Failure } from '@overweave/ui';
import { OverweaveProvider } from '@overweave/ui/preact';
import type { ComponentChildren } from 'preact';
import { useMemo, useRef } from 'preact/hooks';
import { Frame } from './Frame.tsx';
import type { Notifications } from './notifications.ts';
import type { Router } from './router.ts';

/** A definition's failure: its kind and name, the field whose function failed, what it threw. */
export type OnFailure = (definition: { kind: string; name: string }, field: string, error: unknown) => void;

export interface ShellOptions {
  router: Router;
  notifications: Notifications;
  /** A definition's function failed (none: said in the console). */
  onFailure?: OnFailure;
}

const warn: OnFailure = (d, field, error) => console.warn(`[overkube] ${d.kind}/${d.name} (${field}):`, error);

/** What the page gives its components (PageValue), of a router and notifications: under a test's or a story's own providers too. */
export function ShellProvider({ router, notifications, onFailure = warn, children }: ShellOptions & { children?: ComponentChildren }) {
  // A definition's failure told once the drawing is done (a status written while drawing would draw again), each once.
  const pending = useRef<Map<string, [{ kind: string; name: string }, string, unknown]> | null>(null);
  const told = useRef(onFailure);
  told.current = onFailure;
  const report = useMemo(
    () => (definition: { kind: string; name: string }, field: string, error: unknown) => {
      if (!pending.current) {
        pending.current = new Map();
        queueMicrotask(() => {
          const all = pending.current;
          pending.current = null;
          for (const [d, f, e] of all?.values() ?? []) told.current(d, f, e);
        });
      }
      const key = `${definition.kind}/${definition.name}/${field}`;
      if (!pending.current.has(key)) pending.current.set(key, [{ kind: definition.kind, name: definition.name }, field, error]);
    },
    [],
  );
  const value = useMemo<PageValue>(
    () => ({
      path: router.path,
      navigate: (to, options) => router.navigate(to, options),
      href: (to) => router.href(to),
      notifications: notifications.list,
      notify: (n) => notifications.notify(n),
      dismiss: (id) => notifications.dismiss(id),
      back: () => router.back(),
      hold: (id, held) => notifications.hold(id, held),
      report,
    }),
    [router, notifications, report],
  );
  return <PageProvider value={value}>{children}</PageProvider>;
}

/** A drawing failure (overweave's) as a definition's: the field that failed. */
export function failureField(failure: Failure): string {
  return failure.phase === 'when' ? 'when' : failure.phase === 'match' ? 'target' : 'render';
}

export interface ShellProps extends ShellOptions {
  // biome-ignore lint/suspicious/noExplicitAny: a registry of the dashboard's kinds.
  registry: Registry<any>;
  cluster: ComponentCluster;
}

/** The whole page: the registry and how its slots choose, the cluster, the page's own (ShellProvider), the frame. */
export function Shell({ registry, cluster, ...options }: ShellProps) {
  const onFailure = options.onFailure ?? warn;
  return (
    <OverweaveProvider registry={registry} matcher={kindMatcher} onError={(f: Failure) => onFailure(f.definition, failureField(f), f.error)}>
      <KubeProvider cluster={cluster}>
        <ShellProvider {...options}>
          <Frame />
        </ShellProvider>
      </KubeProvider>
    </OverweaveProvider>
  );
}
