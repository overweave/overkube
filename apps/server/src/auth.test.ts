import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type Auth, type Config, LOOPBACK_NAMES } from './config.ts';
import { type Running, startServer } from './server.ts';

/*
 * Signing in, over real HTTP: a token the cluster takes (a fake API server
 * that knows one), an OIDC provider (a fake one) — the session's cookie,
 * the gateway reaching the cluster as the one signed in, signing out.
 */

/** What the fake API server was asked with: its path, its credentials, whom it impersonated. */
let asked: { path: string; authorization?: string; user?: string[]; groups?: string[] }[] = [];
const servers: Server[] = [];
const running: Running[] = [];
let kubeconfig: string;

const listen = async (srv: Server) => {
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  servers.push(srv);
  return `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
};

/** A JWT (unsigned: the fake's) of these claims. */
const jwt = (claims: object) => `e30.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.sig`;
const ALICE = jwt({ sub: 'alice', exp: Math.floor(Date.now() / 1000) + 3600 });

beforeAll(async () => {
  const api = createServer((req: IncomingMessage, res) => {
    req.resume();
    asked.push({ path: req.url ?? '', authorization: req.headers.authorization, user: req.headersDistinct['impersonate-user'], groups: req.headersDistinct['impersonate-group'] });
    if (req.url === '/apis/authentication.k8s.io/v1/selfsubjectreviews') {
      const user = req.headersDistinct['impersonate-user']?.[0] ?? (req.headers.authorization === `Bearer ${ALICE}` ? 'system:serviceaccount:ops:alice' : undefined);
      if (!user) return void res.writeHead(401, { 'content-type': 'application/json' }).end('{"kind":"Status","code":401,"reason":"Unauthorized"}');
      res.writeHead(201, { 'content-type': 'application/json' });
      return void res.end(JSON.stringify({ kind: 'SelfSubjectReview', status: { userInfo: { username: user, groups: ['system:authenticated'] } } }));
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    if (req.url?.includes('watch=1')) return void res.write('');
    res.end('{"kind":"PodList","items":[]}');
  });
  const at = await listen(api);
  kubeconfig = join(mkdtempSync(join(tmpdir(), 'ok-')), 'kubeconfig');
  writeFileSync(
    kubeconfig,
    `clusters:\n- cluster:\n    server: ${at}\n  name: c\nusers:\n- name: u\n  user:\n    token: the-servers-token\ncontexts:\n- context:\n    cluster: c\n    user: u\n  name: x\ncurrent-context: x\n`,
  );
});
afterAll(() => {
  for (const s of servers) s.close();
});
beforeEach(() => {
  asked = [];
});
afterEach(async () => {
  for (const r of running.splice(0)) await r.close(100);
});

async function start(auth: Auth, more: Partial<Config> = {}) {
  const r = await startServer(
    {
      host: '127.0.0.1',
      port: 0,
      prefix: '/kube',
      readOnly: false,
      cluster: { from: 'kubeconfig', path: kubeconfig },
      hosts: [...LOOPBACK_NAMES, 'dash.example.org'],
      local: true,
      auth,
      ...more,
    },
    { log: () => {} },
  );
  running.push(r);
  return r.url;
}

/** A request as the page sends it: its header, its cookie (if it has one). */
const send = (url: string, init: { method?: string; body?: unknown; cookie?: string; headers?: Record<string, string> } = {}) =>
  fetch(url, {
    method: init.method ?? 'GET',
    redirect: 'manual',
    headers: { 'x-overkube': '1', 'content-type': 'application/json', ...(init.cookie ? { cookie: init.cookie } : {}), ...init.headers },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
/** The session's cookie a response sets: name=value, and its attributes. */
const cookieOf = (res: Response, name = '__Host-overkube') => {
  const set = res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`)) ?? '';
  return {
    pair: set.split(';')[0],
    attributes: set
      .split(';')
      .slice(1)
      .map((a) => a.trim()),
  };
};

describe('signing in with a token', () => {
  it('takes a token the cluster takes: a session in a cookie only the page has, the cluster reached with the token', async () => {
    const base = await start({ mode: 'token', hours: 8 });
    expect(await (await send(`${base}/auth`)).json()).toEqual({ mode: 'token' });
    expect((await send(`${base}/kube/api/v1/pods`)).status).toBe(401);
    const login = await send(`${base}/auth/login`, { method: 'POST', body: { token: ALICE } });
    expect(login.status).toBe(204);
    const { pair, attributes } = cookieOf(login);
    expect(attributes.slice(0, 4)).toEqual(['Path=/', 'HttpOnly', 'Secure', 'SameSite=Strict']);
    // To the token's end at most (an hour), not the 8 hours.
    expect(Number(attributes[4].replace('Max-Age=', ''))).toBeLessThanOrEqual(3600);
    expect(await (await send(`${base}/auth`, { cookie: pair })).json()).toEqual({
      mode: 'token',
      user: 'system:serviceaccount:ops:alice',
      groups: ['system:authenticated'],
      via: 'token',
    });
    asked = [];
    expect((await send(`${base}/kube/api/v1/pods`, { cookie: pair })).status).toBe(200);
    expect(asked).toEqual([{ path: '/api/v1/pods', authorization: `Bearer ${ALICE}`, user: undefined, groups: undefined }]);
  });

  it('refuses a token the cluster does not take, one ended, a sign-in not the page’s, and too many tries', async () => {
    const base = await start({ mode: 'token', hours: 8 });
    const tried = await send(`${base}/auth/login`, { method: 'POST', body: { token: 'a-guess' } });
    expect([tried.status, (await tried.json()).error.code]).toEqual([401, 'unauthorized']);
    expect((await send(`${base}/auth/login`, { method: 'POST', body: { token: ALICE }, headers: { 'sec-fetch-site': 'cross-site' } })).status).toBe(403);
    expect((await fetch(`${base}/auth/login`, { method: 'POST', body: JSON.stringify({ token: ALICE }) })).status).toBe(403);
    expect((await send(`${base}/auth/login`, { method: 'POST', body: { nope: 1 } })).status).toBe(400);
    for (let i = 0; i < 9; i++) await send(`${base}/auth/login`, { method: 'POST', body: { token: 'a-guess' } });
    const blocked = await send(`${base}/auth/login`, { method: 'POST', body: { token: ALICE } });
    expect([blocked.status, (await blocked.json()).error.code]).toEqual([429, 'too_many_tries']);
  });

  it('signs in only where nothing sent can be read on the way: HTTPS, or this machine’s names', async () => {
    // By another name than this machine's (fetch keeps its own Host: asked as a browser would be, by that name).
    const login = (base: string, headers: Record<string, string>) =>
      new Promise<number>((done, failed) => {
        const out = request(
          `${base}/auth/login`,
          { method: 'POST', headers: { 'x-overkube': '1', 'content-type': 'application/json', host: 'dash.example.org', ...headers } },
          (res) => {
            res.resume();
            done(res.statusCode ?? 0);
          },
        );
        out.on('error', failed);
        out.end(JSON.stringify({ token: ALICE }));
      });
    const own = await start({ mode: 'token', hours: 8 });
    expect(await login(own, {})).toBe(403);
    // No proxy said to be in front: what a request says of one is not taken.
    expect(await login(own, { 'x-forwarded-proto': 'https' })).toBe(403);
    const proxied = await start({ mode: 'token', hours: 8 }, { tls: 'off' });
    expect(await login(proxied, {})).toBe(403);
    expect(await login(proxied, { 'x-forwarded-proto': 'https' })).toBe(204);
    // The nearest proxy's word (a list's last): https said by the client before it, http by the proxy, is http.
    expect(await login(proxied, { 'x-forwarded-proto': 'https, http' })).toBe(403);
  });

  it('signs out: the cookie taken away, the session over, its streams ended — another sign-in of the same one’s not', async () => {
    const base = await start({ mode: 'token', hours: 8 });
    const signedIn = async () => cookieOf(await send(`${base}/auth/login`, { method: 'POST', body: { token: ALICE } })).pair;
    const [pair, other] = [await signedIn(), await signedIn()];
    const open = async (cookie: string) => {
      const reader = ((await send(`${base}/kube/stream`, { cookie })).body as ReadableStream<Uint8Array>).getReader();
      await reader.read();
      return reader;
    };
    const [stream, others] = [await open(pair), await open(other)];
    const out = await send(`${base}/auth/logout`, { method: 'POST', cookie: pair });
    expect([out.status, cookieOf(out).pair, cookieOf(out).attributes.at(-1)]).toEqual([204, '__Host-overkube=', 'Max-Age=0']);
    expect(new TextDecoder().decode((await stream.read()).value)).toContain('"CLOSE"');
    expect((await send(`${base}/kube/api/v1/pods`, { cookie: pair })).status).toBe(401);
    expect(await Promise.race([others.read().then(() => 'read'), new Promise((r) => setTimeout(() => r('open'), 100))])).toBe('open');
    expect((await send(`${base}/kube/api/v1/pods`, { cookie: other })).status).toBe(200);
    await others.cancel();
  });

  it('signing in again in a browser ends its session before', async () => {
    const base = await start({ mode: 'token', hours: 8 });
    const { pair } = cookieOf(await send(`${base}/auth/login`, { method: 'POST', body: { token: ALICE } }));
    const again = cookieOf(await send(`${base}/auth/login`, { method: 'POST', body: { token: ALICE }, cookie: pair })).pair;
    expect([(await send(`${base}/kube/api/v1/pods`, { cookie: pair })).status, (await send(`${base}/kube/api/v1/pods`, { cookie: again })).status]).toEqual([401, 200]);
  });

  it('counts a try before it is tried: many at once reach the cluster no more than the limit; behind a proxy, each client its own', async () => {
    const base = await start({ mode: 'token', hours: 8 });
    await Promise.all(Array.from({ length: 25 }, () => send(`${base}/auth/login`, { method: 'POST', body: { token: 'a-guess' } })));
    expect(asked.filter((a) => a.path.includes('selfsubjectreviews')).length).toBe(10);
    const proxied = await start({ mode: 'token', hours: 8 }, { tls: 'off' });
    const from = (client: string) => ({ 'x-forwarded-proto': 'https', 'x-forwarded-for': `203.0.113.9, ${client}` });
    for (let i = 0; i < 10; i++) await send(`${proxied}/auth/login`, { method: 'POST', body: { token: 'a-guess' }, headers: from('198.51.100.1') });
    expect((await send(`${proxied}/auth/login`, { method: 'POST', body: { token: ALICE }, headers: from('198.51.100.1') })).status).toBe(429);
    expect((await send(`${proxied}/auth/login`, { method: 'POST', body: { token: ALICE }, headers: from('198.51.100.2') })).status).toBe(204);
  });

  it('answers a body too large at once (413), one not a token’s (400) — and a body on its way holds no place of those tried at once', async () => {
    const base = await start({ mode: 'token', hours: 8 });
    expect((await send(`${base}/auth/login`, { method: 'POST', body: { token: 'x'.repeat(70_000) } })).status).toBe(413);
    expect((await send(`${base}/auth/login`, { method: 'POST', body: { token: 'a\nb' } })).status).toBe(400);
    // Bodies begun and never ended, from many clients (behind a proxy): another's sign-in goes on.
    const proxied = await start({ mode: 'token', hours: 8 }, { tls: 'off' });
    const slow = Array.from({ length: 25 }, (_, i) => {
      const out = request(`${proxied}/auth/login`, {
        method: 'POST',
        headers: { 'x-overkube': '1', 'content-type': 'application/json', 'content-length': '100', 'x-forwarded-for': `198.51.100.${i}` },
      });
      out.on('error', () => {});
      out.write('{"token":');
      return out;
    });
    await new Promise((r) => setTimeout(r, 100));
    expect((await send(`${proxied}/auth/login`, { method: 'POST', body: { token: ALICE }, headers: { 'x-forwarded-for': '203.0.113.7' } })).status).toBe(204);
    for (const s of slow) s.destroy();
  });
});

describe('signing in with OIDC', () => {
  let issuer: string;
  /** What the provider's token endpoint gives next: the ID token's claims (the nonce asked, unless said). */
  let claims: (nonce: string) => object;
  /** The endpoints its discovery says, beyond its own. */
  let endpoints: Record<string, string> = {};
  /** The nonce and PKCE challenge it was asked with, by code. */
  const begun = new Map<string, { nonce: string; challenge: string }>();

  beforeAll(async () => {
    const idp = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://idp');
      if (url.pathname === '/.well-known/openid-configuration') {
        res.writeHead(200, { 'content-type': 'application/json' });
        return void res.end(JSON.stringify({ issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, ...endpoints }));
      }
      let body = '';
      req.on('data', (c) => {
        body += c;
      });
      req.on('end', () => {
        const form = new URLSearchParams(body);
        const was = begun.get(form.get('code') ?? '');
        // PKCE: the verifier is the challenge's.
        if (
          !was ||
          createHash('sha256')
            .update(form.get('code_verifier') ?? '')
            .digest('base64url') !== was.challenge ||
          form.get('client_id') !== 'overkube'
        ) {
          return void res.writeHead(400, { 'content-type': 'application/json' }).end('{"error":"invalid_grant"}');
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ id_token: jwt(claims(was.nonce)) }));
      });
    });
    issuer = await listen(idp);
  });

  const oidc = (): Auth => ({
    mode: 'oidc',
    hours: 8,
    oidc: { issuer, clientId: 'overkube', scopes: 'openid email groups', userClaim: 'email', groupsClaim: 'groups', prefix: 'oidc:' },
  });
  const good = (nonce: string) => ({
    iss: issuer,
    aud: 'overkube',
    exp: Math.floor(Date.now() / 1000) + 300,
    nonce,
    email: 'alice@example.org',
    email_verified: true,
    groups: ['admins'],
  });

  /** Begun at the server, as the provider would see it come back (its code given): the callback's URL and the state's cookie. */
  async function begin(base: string, code: string) {
    const start = await send(`${base}/auth/oidc`);
    const to = new URL(start.headers.get('location') ?? '');
    expect([start.status, to.origin + to.pathname, to.searchParams.get('client_id'), to.searchParams.get('code_challenge_method')]).toEqual([
      302,
      `${issuer}/authorize`,
      'overkube',
      'S256',
    ]);
    begun.set(code, { nonce: to.searchParams.get('nonce') ?? '', challenge: to.searchParams.get('code_challenge') ?? '' });
    return { callback: `${to.searchParams.get('redirect_uri')}?code=${code}&state=${to.searchParams.get('state')}`, state: cookieOf(start, '__Host-overkube-oidc') };
  }

  it('signs in with the provider: the code traded (PKCE), the ID token checked, the one signed in impersonated, prefixed', async () => {
    claims = good;
    const base = await start(oidc());
    expect(await (await send(`${base}/auth`)).json()).toEqual({ mode: 'oidc', provider: issuer });
    const { callback, state } = await begin(base, 'c1');
    expect(state.attributes).toEqual(['Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax', 'Max-Age=600']);
    const back = await send(callback, { cookie: state.pair });
    expect([back.status, back.headers.get('location')]).toEqual([303, '/']);
    const { pair, attributes } = cookieOf(back);
    // Until the ID token ends (five minutes), not the 8 hours.
    expect(Number(attributes[4].replace('Max-Age=', ''))).toBeLessThanOrEqual(300);
    asked = [];
    expect((await send(`${base}/kube/api/v1/pods`, { cookie: pair })).status).toBe(200);
    expect(asked).toEqual([{ path: '/api/v1/pods', authorization: 'Bearer the-servers-token', user: ['oidc:alice@example.org'], groups: ['oidc:admins'] }]);
  });

  it('sends back to the page, said why: a callback not this browser’s, an ID token not for this sign-in, an email not verified', async () => {
    const base = await start(oidc());
    claims = good;
    const other = await begin(base, 'c2');
    const where = async (res: Promise<Response>) => (await res).headers.get('location');
    expect(await where(send(other.callback))).toBe('/?signin=stale');
    // Not this browser's: its sign-in still waits, and goes on.
    expect(await where(send(other.callback, { cookie: other.state.pair }))).toBe('/');
    for (const [code, wrong, why] of [
      ['c3', (n: string) => ({ ...good(n), nonce: 'another' }), 'invalid'],
      ['c4', (n: string) => ({ ...good(n), aud: 'someone-else' }), 'invalid'],
      ['c5', (n: string) => ({ ...good(n), iss: 'https://evil.example' }), 'invalid'],
      ['c6', (n: string) => ({ ...good(n), exp: 1 }), 'invalid'],
      ['c7', (n: string) => ({ ...good(n), email_verified: false }), 'forbidden'],
    ] as const) {
      claims = wrong;
      const { callback, state } = await begin(base, code);
      expect([code, await where(send(callback, { cookie: state.pair }))]).toEqual([code, `/?signin=${why}`]);
    }
  });

  it('signing in anew ends the browser’s session before (its cookie comes with the start, not the provider’s redirect back)', async () => {
    claims = good;
    const base = await start(oidc());
    const first = await begin(base, 'r1');
    const before = cookieOf(await send(first.callback, { cookie: first.state.pair })).pair;
    const start2 = await send(`${base}/auth/oidc`, { cookie: before });
    const to = new URL(start2.headers.get('location') ?? '');
    begun.set('r2', { nonce: to.searchParams.get('nonce') ?? '', challenge: to.searchParams.get('code_challenge') ?? '' });
    const back = await send(`${to.searchParams.get('redirect_uri')}?code=r2&state=${to.searchParams.get('state')}`, { cookie: cookieOf(start2, '__Host-overkube-oidc').pair });
    const after = cookieOf(back).pair;
    expect([(await send(`${base}/kube/api/v1/pods`, { cookie: before })).status, (await send(`${base}/kube/api/v1/pods`, { cookie: after })).status]).toEqual([401, 200]);
  });

  it('one tab’s sign-in coming back after another’s began ends neither the other’s, nor its cookie', async () => {
    claims = good;
    const base = await start(oidc());
    const a = await begin(base, 't1');
    const b = await begin(base, 't2');
    // The browser holds b's state now: a's callback comes with it.
    const late = await send(a.callback, { cookie: b.state.pair });
    expect([late.headers.get('location'), late.headers.getSetCookie()]).toEqual(['/?signin=stale', []]);
    expect((await send(b.callback, { cookie: b.state.pair })).headers.get('location')).toBe('/');
  });

  it('asks no provider whose endpoints are not https', async () => {
    endpoints = { authorization_endpoint: 'http://id.example.org/authorize' };
    const base = await start(oidc());
    expect((await send(`${base}/auth/oidc`)).headers.get('location')).toBe('/?signin=failed');
    endpoints = {};
  });
});
