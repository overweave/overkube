/*
 * The Kubernetes API's paths, as the gateway tells them apart:
 *
 *   /api/v1/pods                                   a collection (all namespaces)
 *   /api/v1/namespaces/media/pods                  a collection (one namespace)
 *   /apis/apps/v1/namespaces/media/deployments/web an object
 *   /apis/apps/v1/namespaces/media/deployments/web/scale   a subresource
 *   /api, /apis/apps, /api/v1, /version, /openapi/v3/…     other (discovery, schemas)
 *
 * Some subresources reach past the API server — into the kubelet, a pod's
 * processes or its HTTP — and are never passed on, whatever the method.
 */

/** Subresources the gateway never passes on: the kubelet, a container's shell, a pod's or service's HTTP. */
const FORBIDDEN = new Set(['proxy', 'exec', 'attach', 'portforward']);

/** A namespace's own subresources (/api/v1/namespaces/<ns>/status), not collections in it. */
const NAMESPACE_SUBRESOURCES = new Set(['status', 'finalize']);

/**
 * What a path segment may be made of. No "%": names in the API cannot hold
 * one, and the API server decodes the path — /nodes/x/%70roxy is its
 * /nodes/x/proxy — so an encoded segment could slip past the checks here.
 */
const SEGMENT = /^[\w\-.:~]+$/;

export type ApiPath =
  | { type: 'collection'; plural: string; namespace?: string }
  | { type: 'object'; plural: string; name: string; namespace?: string }
  | { type: 'subresource'; plural: string; name: string; subresource: string; namespace?: string }
  | { type: 'other' };

/** What a path (without its query) is in the API, or null when the gateway does not pass it on at all. */
export function classify(pathname: string): ApiPath | null {
  if (pathname.includes('..')) return null;
  const parts = pathname.replace(/\/$/, '').split('/').slice(1);
  // No "." segment either: a path is passed on as it is said, never as something else cleans it to.
  if (parts.length === 0 || parts.some((p) => !SEGMENT.test(p) || p === '.')) return null;

  if (parts[0] === 'version' && parts.length === 1) return { type: 'other' };
  if (parts[0] === 'openapi' && parts[1] === 'v3') return { type: 'other' };

  let rest: string[];
  if (parts[0] === 'api') {
    if (parts.length <= 2) return { type: 'other' }; // /api, /api/v1
    rest = parts.slice(2);
  } else if (parts[0] === 'apis') {
    if (parts.length <= 3) return { type: 'other' }; // /apis, /apis/<group>, /apis/<group>/<version>
    rest = parts.slice(3);
  } else {
    return null;
  }

  let namespace: string | undefined;
  if (rest[0] === 'namespaces' && rest.length >= 3 && !(rest.length === 3 && NAMESPACE_SUBRESOURCES.has(rest[2]))) {
    namespace = rest[1];
    rest = rest.slice(2);
  }
  const [plural, name, subresource] = rest;
  if (FORBIDDEN.has(plural) || (subresource !== undefined && FORBIDDEN.has(subresource))) return null;
  const scope = namespace === undefined ? {} : { namespace };
  if (name === undefined) return { type: 'collection', plural, ...scope };
  if (subresource === undefined) return { type: 'object', plural, name, ...scope };
  return { type: 'subresource', plural, name, subresource, ...scope };
}

/** A path and its query, split at the first "?". */
export function splitQuery(path: string): [string, string] {
  const at = path.indexOf('?');
  return at < 0 ? [path, ''] : [path.slice(0, at), path.slice(at + 1)];
}
