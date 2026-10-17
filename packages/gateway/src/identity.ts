import { createHash } from 'node:crypto';
import type { UpstreamSource } from './upstream.ts';

/*
 * Who someone signed in is, as the cluster is to take them — one of two:
 *
 * - their own credential (a token the API server takes: a ServiceAccount's,
 *   an OIDC id_token it trusts): sent instead of the gateway's, whose own
 *   credentials then reach nothing but where the API server is;
 * - a user and groups the gateway acts as (Impersonate-User,
 *   Impersonate-Group): its credentials needing no more than to impersonate,
 *   and never as the cluster's own (system:*).
 *
 * Either way RBAC grants them what it grants. How they signed in is their
 * host's (a token, OIDC, a platform's own): it says so in via.
 */

export interface Identity {
  user: string;
  groups: readonly string[];
  /** How they signed in, as the host says it (token, oidc, a platform's): told by /me. */
  via?: string;
  /** Their own bearer token: sent as it is, nothing impersonated. */
  token?: string;
  /** The sign-in it is of (its host's session): its streams its own — another sign-in of the same one ends apart. */
  session?: string;
}

/** A name a header carries: printable, no more than so long. */
const NAME = /^[\x21-\x7e](?:[\x20-\x7e]{0,252}[\x21-\x7e])?$/;
/** A bearer token: printable, no spaces, no more than 16 KiB (a JWT is a few). */
const TOKEN = /^[\x21-\x7e]{1,16384}$/;

/** Why an identity cannot be acted as (impersonated: a name a header cannot carry, the cluster's own), or nothing. */
export function identityError(who: Identity): string | undefined {
  if (who.token !== undefined) return TOKEN.test(who.token) ? undefined : 'its token is not one a header carries';
  if (!NAME.test(who.user) || who.user.startsWith('system:')) return 'its user is not a name the cluster takes from it';
  // The cluster's own (system:masters among them) are never another's to be given.
  if (who.groups.length > 64 || !who.groups.every((g) => NAME.test(g) && !g.startsWith('system:'))) return 'its groups are not names the cluster takes from it';
  return undefined;
}

/** The cluster as they reach it: with their token alone (the gateway's own credentials left out), or as the gateway impersonating them. */
export function actingAs(upstream: UpstreamSource, who: Identity): UpstreamSource {
  if (who.token !== undefined) {
    const token = who.token;
    return () => {
      const { cert: _cert, key: _key, impersonate: _as, ...where } = upstream();
      return { ...where, token };
    };
  }
  const impersonate = { user: who.user, groups: [...who.groups] };
  return () => ({ ...upstream(), impersonate });
}

/** Whose a stream is: the sign-in it is of, else the same one (a secret by its hash: never kept as it is). */
export function ownerOf(who: Identity): string {
  const hash = (s: string | undefined) => (s === undefined ? '' : createHash('sha256').update(s).digest('base64url'));
  return who.session === undefined ? JSON.stringify([who.user, [...who.groups].sort(), hash(who.token)]) : `session:${hash(who.session)}`;
}
