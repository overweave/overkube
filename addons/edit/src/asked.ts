import type { KindInfo, KubeObject } from '@overkube/kube-types';
import { type Signal, signal } from '@preact/signals';

/*
 * What is asked of one object (its dialog, over the page: the overlay's):
 * edited, deleted, drained — and what the API server says of a refused
 * write (its causes, each at its field).
 */

import type { What } from './links.ts';

/** An action's ask: its object and its kind (an object as listed says none of its own) — the page's path then says it (links.ts). */
export interface Asked {
  what: What;
  kind: KindInfo;
  name: string;
  namespace?: string;
}

/** The addon's ask, till the page's path says it. */
export type AskedSignal = Signal<Asked | null>;

export const askedSignal = (): AskedSignal => signal<Asked | null>(null);

export const askOf = (what: What, o: KubeObject, kind: KindInfo): Asked => ({
  what,
  kind,
  name: o.metadata?.name ?? '',
  ...(o.metadata?.namespace && kind.namespaced ? { namespace: o.metadata.namespace } : {}),
});

/** A Kubernetes Status's field path (spec.template.spec.containers[0].image, metadata.labels[app.kubernetes.io/name]) as a document's path: a key in brackets whole, dots and all. */
export function fieldPath(field: string): (string | number)[] {
  return [...field.matchAll(/\[([^\]]*)\]|[^.[\]]+/g)].map((m) => (m[1] === undefined ? m[0] : /^\d+$/.test(m[1]) ? Number(m[1]) : m[1]));
}

/** What the API server said of a refused write: its message, and each cause at its field (a Status's details.causes). */
export function refusalOf(error: unknown): { message: string; causes: { field?: string; message: string }[]; code?: string; status?: number } {
  const e = error as { message?: string; code?: string; status?: number; kubeStatus?: { message?: string; details?: { causes?: { field?: string; message?: string }[] } } };
  const causes = (e?.kubeStatus?.details?.causes ?? []).map((c) => ({ ...(c.field ? { field: c.field } : {}), message: c.message ?? '' }));
  return {
    message: e?.kubeStatus?.message ?? e?.message ?? String(error),
    causes,
    ...(e?.code ? { code: e.code } : {}),
    ...(typeof e?.status === 'number' ? { status: e.status } : {}),
  };
}
