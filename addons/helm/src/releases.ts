import type { KubeObject } from '@overkube/kube-types';
import { useList } from '@overkube/sdk/preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { F, SECRETS } from './kinds.ts';
import { type Release, releaseOf } from './release.ts';

/*
 * The releases as helm keeps them: each one's revisions (its Secrets, by
 * their labels — none decoded to list them), its latest; those decoded
 * that are asked for (one list of them, by name: never every revision's
 * manifest held).
 */

/** A revision, as its Secret's labels say it. */
export interface Revision {
  secret: string;
  version: number;
  status: string;
  modified: number;
}

export interface ReleaseRow {
  key: string;
  name: string;
  namespace: string;
  revisions: Revision[];
  latest: Revision;
}

const SELECT = ['core.name', 'core.namespace', F.name, F.status, F.version, F.modified];

/** Every release (of the namespaces asked), its revisions newest first — a filter given (CEL, of their Secrets' fields), those whose latest revision it lets through. */
export function useReleases(filter = ''): { releases: ReleaseRow[]; state: string } {
  const helm = { field: F.owner, op: 'eq' as const, value: 'helm' };
  const got = useList({ kind: SECRETS, where: helm, page: { limit: 5000 }, select: SELECT });
  const through = useList(filter.trim() ? { kind: SECRETS, where: helm, filter, page: { limit: 5000 }, select: ['core.name', 'core.namespace'] } : undefined);
  const all = useMemo(() => {
    const by = new Map<string, ReleaseRow>();
    for (const i of got.items) {
      const v = i.values ?? {};
      const name = String(v[F.name] ?? '');
      const namespace = String(v['core.namespace'] ?? '');
      if (!name) continue;
      const revision = { secret: String(v['core.name']), version: Number(v[F.version] ?? 0), status: String(v[F.status] ?? 'unknown'), modified: Number(v[F.modified] ?? 0) };
      const key = `${namespace}/${name}`;
      const had = by.get(key);
      if (had) had.revisions.push(revision);
      else by.set(key, { key, name, namespace, revisions: [revision], latest: revision });
    }
    for (const r of by.values()) {
      r.revisions.sort((a, b) => b.version - a.version);
      r.latest = r.revisions[0] as Revision;
    }
    return [...by.values()];
  }, [got.items]);
  const releases = useMemo(() => {
    if (!filter.trim()) return all;
    const kept = new Set(through.items.map((i) => `${i.values?.['core.namespace']}/${i.values?.['core.name']}`));
    return all.filter((r) => kept.has(`${r.namespace}/${r.latest.secret}`));
  }, [all, filter, through.items]);
  return { releases, state: filter.trim() && through.state === 'loading' ? 'loading' : got.state };
}

/** Each of these revisions decoded (namespace/secret name: its release), as they come. */
export function useDecoded(wanted: readonly { namespace: string; secret: string }[]): ReadonlyMap<string, Release> {
  const names = [...new Set(wanted.map((w) => w.secret))].sort();
  const namespaces = [...new Set(wanted.map((w) => w.namespace))].sort();
  // Of their namespaces, by their names: as many as could be (a name in each), those not asked for left.
  const got = useList<KubeObject & { data?: Record<string, string> }>(
    names.length ? { kind: SECRETS, scope: { namespaces }, where: { field: 'core.name', op: 'in', values: names }, page: { limit: names.length * namespaces.length } } : undefined,
  );
  const [decoded, setDecoded] = useState<ReadonlyMap<string, Release>>(new Map());
  const want = new Set(wanted.map((w) => `${w.namespace}/${w.secret}`));
  const objects = got.items.flatMap((i) => (i.object && want.has(`${i.object.metadata?.namespace}/${i.object.metadata?.name}`) ? [i.object] : []));
  const version = objects.map((o) => `${o.metadata?.namespace}/${o.metadata?.name}@${o.metadata?.resourceVersion}`).join(',');
  useEffect(() => {
    let live = true;
    void Promise.all(objects.map(async (o) => [`${o.metadata?.namespace}/${o.metadata?.name}`, await releaseOf(o)] as const)).then((all) => {
      if (live) setDecoded(new Map(all.flatMap(([k, r]) => (r ? [[k, r] as const] : []))));
    });
    return () => {
      live = false;
    };
  }, [version]);
  return decoded;
}
