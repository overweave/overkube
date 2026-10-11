import type { ServerResponse } from 'node:http';
import { classify } from './paths.ts';
import { relay } from './proxy.ts';
import { fail, type UpstreamSource } from './upstream.ts';

/*
 * Changes to an object, the one way the page makes them:
 *
 *   POST /patch
 *   { "path": "/apis/apps/v1/namespaces/web/deployments/shop",
 *     "type": "merge" | "json" | "strategic" | "apply",
 *     "patch": <JSON>, "fieldManager"?: "overkube", "force"?: false, "dryRun"?: false }
 *
 * The page sends JSON only (a host's framework may take nothing else); the
 * gateway sends the API server a PATCH of the media type each kind of
 * patch is: a merge patch, a JSON patch (a list of operations), a strategic
 * merge patch, or a server-side apply (whose YAML JSON already is). The API
 * server's answer comes back as it is.
 */

const MEDIA_TYPES = {
  merge: 'application/merge-patch+json',
  json: 'application/json-patch+json',
  strategic: 'application/strategic-merge-patch+json',
  apply: 'application/apply-patch+yaml',
} as const;

type PatchType = keyof typeof MEDIA_TYPES;

export interface PatchRequest {
  path: string;
  type: PatchType;
  patch: unknown;
  fieldManager: string;
  force: boolean;
  dryRun: boolean;
}

/** Who made the change, as the API server records it (managedFields), unless the page or the gateway's options say otherwise. */
export const FIELD_MANAGER = 'overkube';
const NAME = /^[\w.:-]{1,128}$/;

/** A /patch request's body, checked; or why it cannot be sent. */
export function parsePatch(body: unknown, fieldManager = FIELD_MANAGER): PatchRequest | string {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'the body is not a JSON object';
  const b = body as Record<string, unknown>;
  if (typeof b.path !== 'string') return 'path: the object to change, as an API path';
  if (b.path.includes('?')) return 'path: without a query (fieldManager, force and dryRun are fields of the body)';
  const target = classify(b.path);
  if (target?.type !== 'object' && target?.type !== 'subresource') return `path: ${b.path} is not an object (or its subresource) of the API`;
  if (typeof b.type !== 'string' || !Object.hasOwn(MEDIA_TYPES, b.type)) return `type: one of ${Object.keys(MEDIA_TYPES).join(', ')}`;
  const type = b.type as PatchType;
  if (type === 'json') {
    if (!Array.isArray(b.patch) || b.patch.some((op) => !op || typeof op !== 'object' || typeof op.op !== 'string'))
      return 'patch: a JSON patch is a list of operations ({ "op": … })';
  } else if (!b.patch || typeof b.patch !== 'object' || Array.isArray(b.patch)) {
    return `patch: ${type === 'apply' ? 'an' : 'a'} ${type} patch is a JSON object`;
  }
  if (b.fieldManager !== undefined && (typeof b.fieldManager !== 'string' || !NAME.test(b.fieldManager))) return 'fieldManager: a name of up to 128 letters, digits and .:-_';
  if (b.force !== undefined && typeof b.force !== 'boolean') return 'force: true or false';
  if (b.force && type !== 'apply') return 'force: only for an apply';
  if (b.dryRun !== undefined && typeof b.dryRun !== 'boolean') return 'dryRun: true or false';
  return { path: b.path, type, patch: b.patch, fieldManager: b.fieldManager ?? fieldManager, force: b.force === true, dryRun: b.dryRun === true };
}

/** Send one change to the API server and its answer back. */
export function patch(
  req: { body: unknown },
  res: ServerResponse,
  options: { upstream: UpstreamSource; fieldManager?: string; connectTimeoutMs?: number; idleTimeoutMs?: number },
): void {
  const change = parsePatch(req.body, options.fieldManager);
  if (typeof change === 'string') {
    fail(res, 400, 'bad_patch', change);
    return;
  }
  const query = new URLSearchParams({ fieldManager: change.fieldManager });
  if (change.force) query.set('force', 'true');
  if (change.dryRun) query.set('dryRun', 'All');
  relay(
    {
      method: 'PATCH',
      path: `${change.path}?${query}`,
      headers: { 'content-type': MEDIA_TYPES[change.type], accept: 'application/json' },
      body: JSON.stringify(change.patch),
      connectTimeoutMs: options.connectTimeoutMs,
      idleTimeoutMs: options.idleTimeoutMs ?? 60_000,
    },
    res,
    { upstream: options.upstream },
  );
}
