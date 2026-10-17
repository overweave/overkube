import { createHash, randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { type Identity, identityError } from '@overkube/gateway';
import { type Oidc, onThisMachine } from './config.ts';
import { cookieOf, type Sessions, setCookie } from './sessions.ts';

/*
 * Signing in with an OpenID Connect provider: the authorization code flow
 * with PKCE.
 *
 *   GET /auth/oidc            → the provider's authorization endpoint (a state, a nonce, a PKCE
 *                               challenge; the state in a cookie of this browser's for ten minutes)
 *   GET /auth/oidc/callback   ← the provider (code, state): the state this browser's and one it
 *                               began; the code traded for an ID token at the token endpoint (its
 *                               verifier, the client's secret if it has one); the token's issuer,
 *                               audience, time and nonce checked — its signature not: it came
 *                               straight from the token endpoint over TLS (OpenID Connect Core
 *                               3.1.3.7), so every endpoint is https (only one on this machine
 *                               may be http) and no redirect is followed — then signed in until
 *                               the ID token ends → the page.
 *
 * Who it is: its user claim and groups claim, each prefixed (oidc:), the
 * gateway impersonating them; an email only once the provider says it is
 * verified. A sign-in that fails goes back to the page with why
 * (?signin=refused|stale|failed|invalid|forbidden), its detail to the log.
 * The provider's TLS is checked against the system's CAs and
 * NODE_EXTRA_CA_CERTS; it answers in ASK_MS or not at all.
 */

/** The cookie of a sign-in begun: its state, for the callback to be this browser's. */
const STATE = '__Host-overkube-oidc';
/** How long a sign-in begun waits for its callback. */
const WAIT_MS = 10 * 60_000;
/** So many begun at most, waiting (the oldest let go). */
const MAX_WAITING = 1000;
/** How long the provider has to answer. */
const ASK_MS = 10_000;

interface Provider {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
}

interface Begun {
  nonce: string;
  verifier: string;
  redirect: string;
  at: number;
  /** The browser's session when it began (its cookie comes with the start, not with the provider's redirect back): ended once signed in anew. */
  replaces?: string;
}

/** Why a sign-in went back to the page: the provider said no; not begun here (or too long ago); the provider not reached; its token not for this sign-in; the one signed in not one to act as. */
type Failed = 'refused' | 'stale' | 'failed' | 'invalid' | 'forbidden';

/** A JWT's claims, unchecked (what checked it is said where it is read); none: not a JWT. */
export function claimsOf(jwt: string): Record<string, unknown> | undefined {
  try {
    const claims: unknown = JSON.parse(Buffer.from(jwt.split('.')[1] ?? '', 'base64url').toString());
    return typeof claims === 'object' && claims !== null && !Array.isArray(claims) ? (claims as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

/** Whether an endpoint may be asked: https, or http on this machine. */
const safe = (url: unknown) => {
  try {
    const u = new URL(String(url));
    return u.protocol === 'https:' || (u.protocol === 'http:' && onThisMachine(u.hostname));
  } catch {
    return false;
  }
};

const random = () => randomBytes(32).toString('base64url');

export function oidcSignIn(oidc: Oidc, hours: number, sessions: Sessions, log: (message: string) => void) {
  /** Asked of the provider: in time, no redirect followed. */
  const ask = (url: string, init: RequestInit = {}) => fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(ASK_MS) });
  let provider: Promise<Provider> | undefined;
  /** The provider, as its discovery says (asked again after a failure). */
  const discovered = () => {
    provider ??= ask(`${oidc.issuer.replace(/\/$/, '')}/.well-known/openid-configuration`, { headers: { accept: 'application/json' } })
      .then(async (r) => {
        if (!r.ok) throw new Error(`its discovery answered ${r.status}`);
        const p = (await r.json()) as Provider;
        if (p.issuer !== oidc.issuer) throw new Error(`it says it is ${p.issuer}, not ${oidc.issuer}`);
        if (!safe(p.authorization_endpoint) || !safe(p.token_endpoint)) throw new Error('its authorization and token endpoints are not both https');
        return p;
      })
      .catch((err: Error) => {
        provider = undefined;
        throw err;
      });
    return provider;
  };
  const waiting = new Map<string, Begun>();

  /** Back to the page, said why — the sign-in begun let go (its cookie too), unless it was another's (theirs: left to them). */
  const failed = (res: ServerResponse, why: Failed, detail: string, mine = true) => {
    log(`oidc sign-in ${why}: ${detail}`);
    res.writeHead(303, { location: `/?signin=${why}`, 'cache-control': 'no-store', ...(mine ? { 'set-cookie': setCookie(STATE, '', 0, 'Lax') } : {}) });
    res.end();
  };

  return {
    async start(req: IncomingMessage, res: ServerResponse, proto: string) {
      let p: Provider;
      try {
        p = await discovered();
      } catch (err) {
        return failed(res, 'failed', `the provider cannot be reached: ${(err as Error).message}`);
      }
      for (const [state, b] of waiting) if (Date.now() - b.at > WAIT_MS || waiting.size >= MAX_WAITING) waiting.delete(state);
      const state = random();
      const had = sessions.idOf(req);
      const begun: Begun = {
        nonce: random(),
        verifier: random(),
        redirect: `${proto}://${req.headers.host}/auth/oidc/callback`,
        at: Date.now(),
        ...(had ? { replaces: had } : {}),
      };
      waiting.set(state, begun);
      const to = new URL(p.authorization_endpoint);
      for (const [k, v] of Object.entries({
        response_type: 'code',
        client_id: oidc.clientId,
        redirect_uri: begun.redirect,
        scope: oidc.scopes,
        state,
        nonce: begun.nonce,
        code_challenge: createHash('sha256').update(begun.verifier).digest('base64url'),
        code_challenge_method: 'S256',
      }))
        to.searchParams.set(k, v);
      // Lax: the provider's redirect back is another site's navigation — a Strict cookie would not come with it.
      res.writeHead(302, { location: to.href, 'cache-control': 'no-store', 'set-cookie': setCookie(STATE, state, WAIT_MS / 1000, 'Lax') });
      res.end();
    },

    async callback(req: IncomingMessage, res: ServerResponse, proto: string) {
      const query = new URL(req.url ?? '/', 'http://x').searchParams;
      const state = query.get('state') ?? '';
      // This browser's, or none: another's state (seen in a URL; another tab's, begun before this browser's last) ends no sign-in, nor the one this browser waits for.
      if (!state || cookieOf(req, STATE) !== state) return failed(res, 'stale', 'its state is not this browser’s', false);
      const begun = waiting.get(state);
      waiting.delete(state);
      if (query.get('error')) return failed(res, 'refused', `the provider said ${query.get('error')}`);
      if (!begun || Date.now() - begun.at > WAIT_MS || begun.redirect !== `${proto}://${req.headers.host}/auth/oidc/callback`)
        return failed(res, 'stale', 'not begun here, or too long ago');
      let claims: Record<string, unknown> | undefined;
      try {
        const p = await discovered();
        const form = new URLSearchParams({ grant_type: 'authorization_code', code: query.get('code') ?? '', redirect_uri: begun.redirect, code_verifier: begun.verifier });
        const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' };
        if (oidc.clientSecret) headers.authorization = `Basic ${Buffer.from(`${encodeURIComponent(oidc.clientId)}:${encodeURIComponent(oidc.clientSecret)}`).toString('base64')}`;
        else form.set('client_id', oidc.clientId);
        const r = await ask(p.token_endpoint, { method: 'POST', headers, body: form });
        const tokens = (await r.json().catch(() => ({}))) as { id_token?: unknown; error?: unknown };
        if (!r.ok || typeof tokens.id_token !== 'string') return failed(res, 'failed', `the provider gave no ID token: ${String(tokens.error ?? r.status)}`);
        claims = claimsOf(tokens.id_token);
      } catch (err) {
        return failed(res, 'failed', `the provider cannot be reached: ${(err as Error).message}`);
      }
      const aud = claims?.aud;
      const audiences = Array.isArray(aud) ? aud : [aud];
      const exp = claims?.exp;
      if (
        !claims ||
        claims.iss !== oidc.issuer ||
        !audiences.includes(oidc.clientId) ||
        (audiences.length > 1 && claims.azp !== oidc.clientId) ||
        typeof exp !== 'number' ||
        exp * 1000 <= Date.now() ||
        claims.nonce !== begun.nonce
      )
        return failed(res, 'invalid', 'its ID token is not for this sign-in (its issuer, audience, time or nonce)');
      const user = claims[oidc.userClaim];
      if (typeof user !== 'string' || !user) return failed(res, 'forbidden', `its ID token has no ${oidc.userClaim}`);
      // An email the one signing in may have set themselves names no one until the provider has verified it.
      if (oidc.userClaim === 'email' && claims.email_verified !== true) return failed(res, 'forbidden', `the email ${user} is not verified`);
      const groups = [claims[oidc.groupsClaim] ?? []].flat().filter((g): g is string => typeof g === 'string');
      const who: Identity = { user: oidc.prefix + user, groups: groups.map((g) => oidc.prefix + g), via: 'oidc' };
      const wrong = identityError(who);
      if (wrong) return failed(res, 'forbidden', `${who.user} cannot be acted as: ${wrong}`);
      const cookie = sessions.open(who, Math.min(exp * 1000, Date.now() + hours * 3_600_000), begun.replaces);
      res.writeHead(303, { location: '/', 'cache-control': 'no-store', 'set-cookie': [cookie, setCookie(STATE, '', 0, 'Lax')] });
      res.end();
    },
  };
}
