import type { IncomingMessage, ServerResponse } from 'node:http';
import type { TLSSocket } from 'node:tls';
import { type AuthAnswer, actingAs, fail, fromAnotherSite, type Identity, identityError, type UpstreamSource, whoAmI } from '@overkube/gateway';
import { type Config, LOOPBACK_NAMES } from './config.ts';
import { claimsOf, oidcSignIn } from './oidc.ts';
import { Sessions } from './sessions.ts';

/*
 * Signing in, at /auth beside the gateway — as the configuration says
 * (Config.auth): no one (loopback), a token, an OIDC provider.
 *
 *   GET  /auth                 AuthAnswer: how one signs in here, who the page is signed in as
 *   POST /auth/login           { token } → 204, the session's cookie (token): the cluster asked who
 *                              the token is (its SelfSubjectReview, asked with it) — taken if it says
 *   GET  /auth/oidc            → the provider, to sign in there (oidc.ts)
 *   GET  /auth/oidc/callback   ← the provider: → the page, signed in
 *   POST /auth/logout          → 204, the cookie taken away, the session's streams ended
 *
 * Only where what is sent cannot be read on the way: over HTTPS (its own,
 * or a proxy's in front: X-Forwarded-Proto, when OVERKUBE_TLS=off), or by
 * this machine's own names. A POST as the page sends it (its header, from
 * its own origin). So many sign-ins a minute from one client (the proxy's
 * X-Forwarded-For when OVERKUBE_TLS=off), each counted before it is tried,
 * and so many tried at once in all. What went wrong in detail is the
 * server's log's; the browser is told what it can act on.
 */

/** Sign-ins begun from one client, a minute. */
const TRIES = 10;
/** Tokens being tried at once, in all. */
const AT_ONCE = 20;
/** So many clients remembered at most (those of more than a minute ago forgotten first). */
const CLIENTS = 10_000;
/** The largest body a sign-in has. */
const MAX_BODY = 64 * 1024;
/** How long a sign-in's body may take to come. */
const BODY_MS = 5000;

export interface SignIn {
  /** Who a request is signed in as (null: no one) — none: no one signs in (loopback). */
  identify?: (req: IncomingMessage) => Identity | null;
  /** Answer a request under /auth (false: not one). */
  handle(req: IncomingMessage, res: ServerResponse): boolean;
  close(): void;
}

/** The name a request reached it by: its Host, port and brackets left out. */
export function nameOf(req: IncomingMessage): string {
  const host = (req.headers.host ?? '').toLowerCase();
  return host.startsWith('[') ? host.slice(1, host.indexOf(']')) : host.replace(/:\d+$/, '');
}

/** What the proxy in front says the page used: a list's last (the nearest proxy's own word), as its X-Forwarded-For. */
const forwardedProto = (req: IncomingMessage) =>
  (
    String(req.headers['x-forwarded-proto'] ?? '')
      .split(',')
      .at(-1) ?? ''
  )
    .trim()
    .toLowerCase();

/** How the page reached it, where nothing can be read on the way: https, http by this machine's names; none: neither. */
export function secureOf(req: IncomingMessage, tls: Config['tls']): 'https' | 'http' | undefined {
  if ((req.socket as TLSSocket).encrypted || (tls === 'off' && forwardedProto(req) === 'https')) return 'https';
  return LOOPBACK_NAMES.includes(nameOf(req)) ? 'http' : undefined;
}

/** Who asks: the address it comes from — behind the proxy in front (OVERKUBE_TLS=off), the one the proxy says (its X-Forwarded-For's last). */
function clientOf(req: IncomingMessage, tls: Config['tls']): string {
  const forwarded =
    tls === 'off'
      ? String(req.headers['x-forwarded-for'] ?? '')
          .split(',')
          .at(-1)
          ?.trim()
      : '';
  return forwarded || req.socket.remoteAddress || '';
}

/** Sign-ins counted by client, a minute each: taken before one is tried. */
class Tries {
  private readonly by = new Map<string, { count: number; since: number }>();

  /** One more from a client: false — too many this minute (or too many clients at once). */
  take(client: string): boolean {
    const now = Date.now();
    if (this.by.size >= CLIENTS) for (const [k, t] of this.by) if (now - t.since >= 60_000) this.by.delete(k);
    const had = this.by.get(client);
    const t = had && now - had.since < 60_000 ? had : { count: 0, since: now };
    if (t.count >= TRIES || (!had && this.by.size >= CLIENTS)) return false;
    t.count++;
    this.by.set(client, t);
    return true;
  }
}

/** A JSON body of at most MAX_BODY, come in BODY_MS — else why not: too large, too slow (its connection cut, or gone), not JSON. */
function jsonOf(req: IncomingMessage): Promise<{ value: unknown } | 'too_large' | 'too_slow' | 'not_json'> {
  return new Promise((done) => {
    let text = '';
    let over = false;
    const late = setTimeout(() => {
      req.destroy();
      done('too_slow');
    }, BODY_MS);
    req.setEncoding('utf8');
    req.on('data', (c: string) => {
      if (over) return;
      text += c;
      if (text.length <= MAX_BODY) return;
      // Answered at once; what is left of it read and let go.
      over = true;
      clearTimeout(late);
      done('too_large');
    });
    req.on('close', () => {
      clearTimeout(late);
      done('too_slow');
    });
    req.on('end', () => {
      clearTimeout(late);
      try {
        done({ value: JSON.parse(text) });
      } catch {
        done('not_json');
      }
    });
  });
}

const answer = (res: ServerResponse, status: number, body?: unknown, headers: Record<string, string | string[]> = {}) => {
  res.writeHead(status, { 'cache-control': 'no-store', ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers });
  res.end(body === undefined ? undefined : JSON.stringify(body));
};

/**
 * Signing in as the configuration says, its sessions ending what was
 * opened in their name (ended: the gateway's streams of one signed out).
 */
export function signIn(config: Config, upstream: UpstreamSource, ended: (who: Identity) => void, log: (message: string) => void = () => {}): SignIn {
  const { auth, tls } = config;
  if (auth.mode === 'loopback')
    return {
      handle(req, res) {
        if (!under(req)) return false;
        if (pathOf(req) === '/auth' && req.method === 'GET') answer(res, 200, { mode: 'loopback' } satisfies AuthAnswer);
        else fail(res, 404, 'not_found', 'no one signs in here (OVERKUBE_AUTH=loopback)');
        return true;
      },
      close() {},
    };

  const sessions = new Sessions(ended);
  const oidc = auth.mode === 'oidc' ? oidcSignIn(auth.oidc, auth.hours, sessions, log) : undefined;
  const tries = new Tries();
  let trying = 0;
  /** What is answered in the end: what throws said as the server's failure, its detail to the log. */
  const settled = (res: ServerResponse, work: Promise<void>) =>
    void work.catch((err: Error) => {
      log(`sign-in failed: ${err.message}`);
      if (!res.headersSent) fail(res, 500, 'kube_error', 'signing in failed: try again');
    });

  /** A token taken: who the cluster says it is, signed in until its end (or so many hours on). */
  const login = async (req: IncomingMessage, res: ServerResponse) => {
    if (auth.mode !== 'token') return fail(res, 404, 'not_found', `one signs in here with ${auth.mode}`);
    if (!tries.take(clientOf(req, tls))) return fail(res, 429, 'too_many_tries', 'too many sign-ins tried: wait a minute');
    const body = await jsonOf(req);
    if (body === 'too_slow') return;
    if (body === 'too_large') {
      res.setHeader('connection', 'close');
      return fail(res, 413, 'too_large', `a sign-in is at most ${MAX_BODY} bytes`);
    }
    const said = body === 'not_json' ? undefined : (body.value as { token?: unknown } | null);
    const token = typeof said?.token === 'string' ? said.token.trim() : '';
    const who: Identity = { user: '', groups: [], via: 'token', token };
    if (!token || identityError(who)) return fail(res, 400, 'bad_body', 'a sign-in is { "token": "…" }, a token as kubectl gives it');
    // So many asked of the cluster at once, in all (while the cluster is asked: a body on its way holds none).
    if (trying >= AT_ONCE) return fail(res, 429, 'too_many_tries', 'too many sign-ins tried: wait a minute');
    trying++;
    try {
      const reviewed = await whoAmI(actingAs(upstream, who));
      if ('error' in reviewed) {
        log(`sign-in: the cluster could not be asked: ${reviewed.error.message}`);
        return fail(res, 503, reviewed.error.code, 'the cluster cannot be reached: try again');
      }
      if ('status' in reviewed) {
        if (reviewed.status === 401 || reviewed.status === 403) return fail(res, 401, 'unauthorized', 'the cluster does not take this token');
        log(`sign-in: the cluster answered ${reviewed.status} to who a token is`);
        return fail(res, 502, 'kube_error', 'the cluster could not say who this token is');
      }
      const exp = claimsOf(token)?.exp;
      const until = Math.min(Date.now() + auth.hours * 3_600_000, typeof exp === 'number' ? exp * 1000 : Number.POSITIVE_INFINITY);
      if (until <= Date.now()) return fail(res, 401, 'unauthorized', 'this token has ended');
      answer(res, 204, undefined, { 'set-cookie': sessions.open({ ...who, ...reviewed }, until, sessions.idOf(req)) });
    } finally {
      trying--;
    }
  };

  return {
    identify: (req) => sessions.of(req),
    handle(req, res) {
      if (!under(req)) return false;
      const path = pathOf(req);
      const method = req.method ?? 'GET';
      if (path === '/auth' && method === 'GET') {
        const who = sessions.of(req);
        const state: AuthAnswer = {
          mode: auth.mode,
          ...(auth.mode === 'oidc' ? { provider: auth.oidc.issuer } : {}),
          ...(who ? { user: who.user, groups: [...who.groups], ...(who.via ? { via: who.via } : {}) } : {}),
        };
        answer(res, 200, state);
        return true;
      }
      const proto = secureOf(req, tls);
      if (!proto) {
        const proxy = tls === 'off' ? ` — the proxy in front said X-Forwarded-Proto: ${forwardedProto(req) || 'nothing'}; it is to say https` : '';
        fail(res, 403, 'insecure', `signing in needs HTTPS: what is sent could be read on the way${proxy}`);
        return true;
      }
      if (method === 'POST' && (path === '/auth/login' || path === '/auth/logout')) {
        if (fromAnotherSite(req) || req.headers['x-overkube'] === undefined) {
          fail(res, 403, 'cross_site', 'a sign-in is sent by the page itself');
          return true;
        }
        if (path === '/auth/logout') answer(res, 204, undefined, { 'set-cookie': sessions.signOut(req) });
        else settled(res, login(req, res));
        return true;
      }
      if (oidc && method === 'GET' && path === '/auth/oidc') {
        if (tries.take(clientOf(req, tls))) settled(res, oidc.start(req, res, proto));
        else fail(res, 429, 'too_many_tries', 'too many sign-ins begun: wait a minute');
        return true;
      }
      if (oidc && method === 'GET' && path === '/auth/oidc/callback') {
        settled(res, oidc.callback(req, res, proto));
        return true;
      }
      fail(res, 404, 'not_found', `no ${method} ${path}`);
      return true;
    },
    close() {
      sessions.close();
    },
  };
}

const pathOf = (req: IncomingMessage) => (req.url ?? '/').split('?')[0];
const under = (req: IncomingMessage) => pathOf(req) === '/auth' || pathOf(req).startsWith('/auth/');
