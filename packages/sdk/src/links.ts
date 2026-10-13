import type { KindInfo } from '@overkube/kube-types';

/*
 * Where things are on the page, as paths: a kind as kubectl says it
 * (<plural>.<version>[.<group>]: pods.v1, deployments.v1.apps) — one part of
 * a path, read back unambiguously — its page at /k/<kind> (KIND_PAGE: the
 * core's Page 'kind'); a resource opened over any page,
 * ?open=<kind>/<namespace>/<name> (<kind>/<name>: one of the whole cluster).
 */

type KindLike = Pick<KindInfo, 'plural' | 'version' | 'group'>;
type Named = { metadata?: { name?: string; namespace?: string } };

/** A kind's page, as a Page's path. */
export const KIND_PAGE = '/k/:kind';

/** A kind as one part of a path: pods.v1, deployments.v1.apps. */
export function kindRef(kind: KindLike): string {
  return [kind.plural, kind.version, ...(kind.group ? [kind.group] : [])].join('.');
}

/** The kind a ref names, of these. */
export function kindOfRef<K extends KindLike>(kinds: Iterable<K>, ref: string): K | undefined {
  for (const kind of kinds) if (kindRef(kind) === ref) return kind;
  return undefined;
}

/** A kind's page. */
export function kindPath(kind: KindLike): string {
  return KIND_PAGE.replace(':kind', kindRef(kind));
}

/** The kind's ref of a kind's page (what is opened over it aside); none: another page. */
export function kindRefIn(path: string): string | undefined {
  const parts = split(path)[0].split('/');
  return parts.length === 3 && parts[0] === '' && `/${parts[1]}/:kind` === KIND_PAGE ? parts[2] : undefined;
}

/** A path's own part and its query (no "?"). */
function split(path: string): [string, string] {
  const at = path.indexOf('?');
  return at < 0 ? [path, ''] : [path.slice(0, at), path.slice(at + 1)];
}

/**
 * A path with a resource opened over its page (another one opened there:
 * this one instead). A kind of the whole cluster (namespaced: false) is
 * opened by its name alone, whatever namespace it is given (an owner's,
 * named by what it owns).
 */
export function openIn(path: string, kind: KindLike & { namespaced?: boolean }, object: Named): string {
  const { name = '' } = object.metadata ?? {};
  const namespace = kind.namespaced === false ? undefined : object.metadata?.namespace;
  const open = [kindRef(kind), ...(namespace ? [namespace] : []), name].map(encodeURIComponent).join('/');
  const rest = closeIn(path);
  return `${rest}${rest.includes('?') ? '&' : '?'}open=${open}`;
}

/** A path with nothing opened over its page. */
export function closeIn(path: string): string {
  const [where, query] = split(path);
  const rest = query.split('&').filter((p) => p && !p.startsWith('open='));
  return rest.length ? `${where}?${rest.join('&')}` : where;
}

/** The resource a path has opened over its page: its kind's ref, namespace (if it says one), name. */
export function openedIn(path: string): { kind: string; namespace?: string; name: string } | undefined {
  const raw = split(path)[1]
    .split('&')
    .find((p) => p.startsWith('open='));
  if (!raw) return undefined;
  try {
    const parts = raw.slice('open='.length).split('/').map(decodeURIComponent);
    if (!parts.every(Boolean)) return undefined;
    if (parts.length === 2) return { kind: parts[0], name: parts[1] };
    if (parts.length === 3) return { kind: parts[0], namespace: parts[1], name: parts[2] };
  } catch {
    // Not one to be read: nothing opened.
  }
  return undefined;
}
