import type { KindInfo } from '@overkube/kube-types';
import { kindOfRef, kindRef } from '@overkube/query';

/*
 * Where things are on the page, as paths: a kind as kubectl says it
 * (<plural>.<version>[.<group>]: pods.v1, deployments.v1.apps) — one part of
 * a path, read back unambiguously — its page at /k/<kind> (KIND_PAGE: the
 * core's Page 'kind'); a resource opened over any page,
 * ?open=<kind>/<namespace>/<name> (<kind>/<name>: one of the whole cluster),
 * on one of its tabs, &open-tab=<name> (none: its first); a kind's page
 * filtered, ?filter=<CEL> (its objects those it holds).
 */

type KindLike = Pick<KindInfo, 'plural' | 'version' | 'group'>;
type Named = { metadata?: { name?: string; namespace?: string } };

/** A kind's page, as a Page's path. */
export const KIND_PAGE = '/k/:kind';

/** A kind as one part of a path: its ref, as queries name it (pods.v1, deployments.v1.apps). */
/** The kind a ref names, of these (by an index of a map: discovery's). */
export { kindOfRef, kindRef };

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
export function openIn(path: string, kind: KindLike & { namespaced?: boolean }, object: Named, tab?: string): string {
  const { name = '' } = object.metadata ?? {};
  const namespace = kind.namespaced === false ? undefined : object.metadata?.namespace;
  const open = [kindRef(kind), ...(namespace ? [namespace] : []), name].map(encodeURIComponent).join('/');
  const rest = closeIn(path);
  return `${rest}${rest.includes('?') ? '&' : '?'}open=${open}${tab ? `&open-tab=${encodeURIComponent(tab)}` : ''}`;
}

/** A path with nothing opened over its page (nor its tab). */
export function closeIn(path: string): string {
  const [where, query] = split(path);
  const rest = query.split('&').filter((p) => p && !p.startsWith('open=') && !p.startsWith('open-tab='));
  return rest.length ? `${where}?${rest.join('&')}` : where;
}

/** The tab what is opened is on, as the path says it; none: its first. */
export function tabIn(path: string): string | undefined {
  const raw = split(path)[1]
    .split('&')
    .find((p) => p.startsWith('open-tab='));
  try {
    return raw ? decodeURIComponent(raw.slice('open-tab='.length)) || undefined : undefined;
  } catch {
    // Not one to be read: its first.
    return undefined;
  }
}

/** A path with what is opened on this tab (none: its first); the rest as it is. */
export function tabbedIn(path: string, tab: string | undefined): string {
  const [where, query] = split(path);
  const all = [...query.split('&').filter((p) => p && !p.startsWith('open-tab=')), ...(tab ? [`open-tab=${encodeURIComponent(tab)}`] : [])];
  return all.length ? `${where}?${all.join('&')}` : where;
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

/** A path with its page filtered by this CEL (none, or empty: not filtered); what is opened over it kept. */
export function filterIn(path: string, filter: string | undefined): string {
  const [where, query] = split(path);
  const rest = query.split('&').filter((p) => p && !p.startsWith('filter='));
  const all = [...(filter ? [`filter=${encodeURIComponent(filter)}`] : []), ...rest];
  return all.length ? `${where}?${all.join('&')}` : where;
}

/** The CEL a path's page is filtered by; none: not filtered. */
export function filteredIn(path: string): string | undefined {
  const raw = split(path)[1]
    .split('&')
    .find((p) => p.startsWith('filter='));
  if (!raw) return undefined;
  try {
    return decodeURIComponent(raw.slice('filter='.length)) || undefined;
  } catch {
    // Not one to be read: not filtered.
    return undefined;
  }
}
