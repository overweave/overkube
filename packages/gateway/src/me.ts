import type { ServerResponse } from 'node:http';
import type { ErrorCode, MeAnswer } from './protocol.ts';
import { ask } from './status.ts';
import { fail, type UpstreamSource } from './upstream.ts';

/*
 * Whom the cluster takes credentials for: its SelfSubjectReview (Kubernetes
 * 1.28 and later), asked with them — so what it says is what RBAC grants
 * by, the groups the cluster adds (system:authenticated) among them. GET
 * /me asks it as the page (the one signed in); a host, of a token given to
 * sign in with. A gateway that may not impersonate is told here too (the
 * API server's 403, as it is).
 *
 *   { "user": "alice", "groups": ["admins", "system:authenticated"], "via": "token" }
 */

const REVIEW = JSON.stringify({ apiVersion: 'authentication.k8s.io/v1', kind: 'SelfSubjectReview' });

/** Who the cluster takes them for; else its answer as it was (a refusal: 401, 403), or why it could not be asked. */
export type Reviewed = { user: string; groups: string[] } | { status: number; body: string } | { error: { code: ErrorCode; message: string } };

export async function whoAmI(upstream: UpstreamSource): Promise<Reviewed> {
  const asked = await ask(upstream, { method: 'POST', path: '/apis/authentication.k8s.io/v1/selfsubjectreviews', body: REVIEW });
  if ('error' in asked) return asked;
  let user: { username?: unknown; groups?: unknown } | undefined;
  try {
    user = (JSON.parse(asked.body) as { status?: { userInfo?: typeof user } }).status?.userInfo;
  } catch {
    // not JSON: answered as it was
  }
  if (asked.status !== 201 || typeof user?.username !== 'string') return asked.status === 201 ? { status: 502, body: '' } : asked;
  return { user: user.username, groups: Array.isArray(user.groups) ? user.groups.filter((g) => typeof g === 'string') : [] };
}

/** GET /me: whom the cluster takes the page for, as its host signed it in (via). */
export async function me(res: ServerResponse, options: { upstream: UpstreamSource; via?: string }): Promise<void> {
  const who = await whoAmI(options.upstream);
  if ('error' in who) return fail(res, who.error.code === 'kube_timeout' ? 504 : 503, who.error.code, who.error.message);
  if ('status' in who) {
    // The API server's own refusal (a Status), passed back as it is.
    if (!who.body) return fail(res, 502, 'kube_error', 'the API server said no one');
    res.writeHead(who.status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(who.body);
    return;
  }
  const answer: MeAnswer = { ...who, ...(options.via ? { via: options.via } : {}) };
  res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(answer));
}
