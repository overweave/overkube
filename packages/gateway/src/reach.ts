import type { IncomingHttpHeaders, ServerResponse } from 'node:http';
import { REACH, type ReachTarget, reachPath } from './protocol.ts';
import { encodeBody, passedHeaders, relay } from './proxy.ts';
import { fail, type UpstreamSource } from './upstream.ts';

/*
 * Reaching what runs in the cluster: a Service's or a pod's port, through
 * the API server's proxy (…/services/<scheme:name:port>/proxy/…), as the
 * one signed in — so RBAC decides, by the method (GET: get, POST: create,
 * … on services/proxy, pods/proxy). For the page's code (an addon asking a
 * scanner, a metrics API): data, never a page of the dashboard's origin —
 * what comes back is sandboxed and never sniffed (no script of it runs
 * here, opened or not), kept by no cache, read by no other origin,
 * cookies it sets dropped, its size and time bounded; asked by the page's
 * code alone (a navigation, a frame, an image refused). Nothing of the request but what it is and takes (content-type,
 * accept) is passed on. Read only: GET and HEAD alone.
 *
 *   /proxy/services/<namespace>/<[scheme:]name:port>/<path>?<query>
 *   /proxy/pods/<namespace>/<[scheme:]name:port>/<path>?<query>
 */

const METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']);
/** A DNS label (a namespace's, a Service's or a pod's name is one, or a subdomain: dots too). */
const NAME = /^[a-z0-9]([-a-z0-9.]{0,251}[a-z0-9])?$/;
/** A port: its number, or its name (an IANA service name). */
const PORT = /^([1-9]\d{0,4}|[a-z0-9]([-a-z0-9]{0,13}[a-z0-9])?)$/;
/**
 * What a segment of the path reached may be: no "%" (the API server decodes
 * it), no "." or ".." alone (cleaned away, the path would reach the API
 * itself) — a path as services name theirs.
 */
const SEGMENT = /^[\w\-.:~@+,=!$]*$/;

/** The target and path of a /proxy/… route (its query apart), or why it is none. */
export function reachOf(route: string): { target: ReachTarget; path: string } | string {
  const [, kinds, namespace, at, ...rest] = route.split('/').slice(1);
  if (kinds !== 'services' && kinds !== 'pods') return 'a reach is /proxy/services/… or /proxy/pods/…';
  if (!namespace || !NAME.test(namespace)) return 'a namespace is a DNS label';
  const parts = (at ?? '').split(':');
  if (parts.length > 3) return 'a target is [scheme:]name:port';
  const [scheme, name, port] = parts.length === 3 ? parts : [undefined, parts[0], parts[1]];
  if (scheme !== undefined && scheme !== 'http' && scheme !== 'https') return 'a scheme is http or https';
  if (!name || !NAME.test(name) || !port || !PORT.test(port)) return 'a target is [scheme:]name:port';
  if (rest.some((s) => !SEGMENT.test(s) || s === '.' || s === '..')) return 'a path is plain segments: no "%", no "." or ".." alone';
  const target: ReachTarget = { kind: kinds === 'services' ? 'service' : 'pod', namespace, name, port, ...(scheme ? { scheme } : {}) };
  return { target, path: `/${rest.join('/')}` };
}

/** Pass a request to a workload's port, its answer back as data. */
export function reach(
  req: { method: string; url: string; headers: IncomingHttpHeaders; body?: unknown },
  res: ServerResponse,
  options: { upstream: UpstreamSource; readOnly?: boolean },
) {
  const method = req.method.toUpperCase();
  const [route, query] = [req.url.split('?')[0], req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''];
  const reached = reachOf(route);
  if (typeof reached === 'string') return fail(res, 400, 'bad_path', reached);
  // Asked by the page's code (fetch), never opened (a page, a frame, an image, a script); one that does not say (curl): as asked.
  const dest = req.headers['sec-fetch-dest'];
  if (dest !== undefined && dest !== 'empty') return fail(res, 403, 'not_fetched', 'a workload is asked by the page’s code, never opened as a page');
  if (!METHODS.has(method)) return fail(res, 405, 'bad_method', `method ${req.method} is not allowed`);
  if (options.readOnly && method !== 'GET' && method !== 'HEAD') return fail(res, 403, 'read_only', 'the gateway is read only: a workload is asked with GET and HEAD alone');
  relay(
    {
      method: method === 'HEAD' ? 'GET' : method,
      path: `${reachPath(reached.target)}${reached.path}${query}`,
      headers: passedHeaders(req.headers),
      body: method === 'GET' || method === 'HEAD' ? undefined : encodeBody(req.body),
      idleTimeoutMs: REACH.idleMs,
    },
    res,
    {
      upstream: options.upstream,
      head: method === 'HEAD',
      maxBytes: REACH.maxBytes,
      // Kept by no cache (its own say aside: the answer is the one signed in's), read by no other origin.
      force: { 'cache-control': 'no-store', 'cross-origin-resource-policy': 'same-origin' },
    },
  );
}
