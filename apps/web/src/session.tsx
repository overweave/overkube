import type { AuthAnswer } from '@overkube/gateway/protocol';
import { grantsAny } from '@overkube/query';
import { defineAddon, slots } from '@overkube/sdk';
import { adoptStyles, Button, copyText, Logo, Notice, PageHeader } from '@overkube/uikit';
import { fill } from '@overweave/ui/preact';
import { type ComponentChildren, render } from 'preact';
import { useEffect, useState } from 'preact/hooks';

/*
 * The page signed in, as its server says one signs in here (GET /auth):
 * no one does (loopback); a token of the cluster's, pasted; an OIDC
 * provider, gone to (where the page was kept, come back to after). Not
 * signed in, the page is this screen only — signed in, the page itself,
 * who it is and a way out at its header's end; the session over (the
 * server or the cluster no longer takes it), this screen again, said why.
 * A host with no /auth (its own sign-in, a gateway alone) draws the page
 * as it is; a server not answering is said so, and asked again.
 */

/** How the page signs in here; null: its host has no /auth (its own sign-in); unreachable: the server did not answer. */
export async function authOf(): Promise<AuthAnswer | null | 'unreachable'> {
  try {
    const res = await fetch('/auth', { headers: { accept: 'application/json' } });
    if (res.status === 404) return null;
    if (!res.ok) return 'unreachable';
    const body = (await res.json().catch(() => null)) as AuthAnswer | null;
    return body && typeof body.mode === 'string' ? body : null;
  } catch {
    return 'unreachable';
  }
}

/** Whether one signs in here (a token, OIDC). */
export const signsIn = (auth: AuthAnswer | null | 'unreachable'): auth is AuthAnswer => typeof auth === 'object' && (auth?.mode === 'token' || auth?.mode === 'oidc');

/** Where the page was when it went to sign in (its hash), kept for after. */
const AFTER = 'overkube.after-sign-in';

/** Back where the page was before it went to sign in, if it was somewhere. */
export function returnAfterSignIn(): void {
  try {
    const hash = sessionStorage.getItem(AFTER);
    sessionStorage.removeItem(AFTER);
    if (hash && !window.location.hash) window.location.hash = hash;
  } catch {}
}

/** Why an OIDC sign-in came back to the page (?signin=), said. */
const FAILED: Record<string, string> = {
  refused: 'The provider did not let you in.',
  stale: 'That sign-in was not begun here, or took too long: sign in again.',
  failed: 'The provider could not be reached: try again.',
  invalid: 'The provider’s answer was not for this sign-in: sign in again.',
  forbidden: 'You are signed in at the provider, but not as one the cluster is asked as (no verified email, or a name it does not take).',
};

/** The page as one screen: signing in (ended: the session it had is over), or the server not answering (asked again until it does). */
export function showSignIn(element: HTMLElement, auth: AuthAnswer | 'unreachable', ended = false): void {
  adoptStyles(element.ownerDocument);
  element.classList.add('uk-root');
  render(auth === 'unreachable' ? <Unreachable /> : <SignIn auth={auth} ended={ended} />, element);
}

/** The screen's card in the middle of the page: the mark and name, a title, what it says under it. */
function Card({ title, sub, children }: { title: string; sub?: string; children: ComponentChildren }) {
  return (
    <main class="ok-signin">
      <section class="ok-signin-card">
        <PageHeader mark={<Logo />}>overkube</PageHeader>
        <div class="ok-signin-title">
          <h2>{title}</h2>
          {sub && <p>{sub}</p>}
        </div>
        {children}
      </section>
    </main>
  );
}

function Unreachable() {
  useEffect(() => {
    const timer = setInterval(() => void authOf().then((a) => a !== 'unreachable' && window.location.reload()), 3000);
    return () => clearInterval(timer);
  }, []);
  return (
    <Card title="Not answering" sub={window.location.host}>
      <Notice level="warn" loading>
        The server does not answer: asking again.
      </Notice>
    </Card>
  );
}

/** How a token is made: kubectl's, for a ServiceAccount — copied by its button. */
const MAKE = 'kubectl -n <namespace> create token <service-account> --duration=8h';

function MakeToken() {
  const [copied, setCopied] = useState(false);
  return (
    <div class="ok-signin-make">
      <p>Make one for a ServiceAccount:</p>
      <div class="ok-signin-command">
        <code>{MAKE}</code>
        <Button
          size="sm"
          variant="ghost"
          icon={copied ? 'check' : 'copy'}
          title={copied ? 'Copied' : 'Copy'}
          onClick={() => {
            void copyText(MAKE);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
        />
      </div>
    </div>
  );
}

function SignIn({ auth, ended }: { auth: AuthAnswer; ended: boolean }) {
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(() => (ended ? null : (FAILED[new URLSearchParams(window.location.search).get('signin') ?? ''] ?? null)));
  // Said once: taken off the address (a reload, a session over later, says it no more).
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('signin')) return;
    url.searchParams.delete('signin');
    window.history.replaceState(null, '', url);
  }, []);
  const [busy, setBusy] = useState(false);
  const submit = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/auth/login', { method: 'POST', headers: { 'x-overkube': '1', 'content-type': 'application/json' }, body: JSON.stringify({ token }) });
      if (res.ok) {
        // Taken — and kept by the browser? One that keeps no Secure cookie over plain http (Safari) is signed in for nothing.
        const now = await authOf();
        if (typeof now === 'object' && now?.user) return window.location.reload();
        setError('Signed in, but the browser kept no session: open the page over HTTPS.');
      } else {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(body?.error?.message ?? `the server answered ${res.status}`);
      }
    } catch (err) {
      setError(`the server did not answer: ${(err as Error).message}`);
    }
    setBusy(false);
  };
  const toProvider = () => {
    try {
      sessionStorage.setItem(AFTER, window.location.hash);
    } catch {}
    window.location.assign('/auth/oidc');
  };
  const provider = new URL(auth.provider ?? '/', window.location.href).host;
  return (
    <Card title="Sign in" sub={`to ${window.location.host}`}>
      {ended && (
        <Notice level="warn" icon="clock">
          The session is over: sign in again.
        </Notice>
      )}
      {error && (
        <Notice level="error" icon="warning">
          {error}
        </Notice>
      )}
      {auth.mode === 'oidc' ? (
        <>
          <Button variant="primary" icon="key" onClick={toProvider}>
            Sign in with {provider}
          </Button>
          <p class="ok-signin-note">You come back here once signed in there.</p>
        </>
      ) : (
        <form onSubmit={submit}>
          <label for="ok-token">Token</label>
          <textarea
            id="ok-token"
            rows={4}
            placeholder="eyJhbGciOiJSUzI1NiIsImtpZCI6…"
            autocomplete="off"
            spellcheck={false}
            value={token}
            onInput={(e) => setToken(e.currentTarget.value)}
          />
          <MakeToken />
          <Button type="submit" variant="primary" icon="key" busy={busy} disabled={!token.trim()}>
            Sign in
          </Button>
        </form>
      )}
    </Card>
  );
}

/** A ServiceAccount's own namespace, of its user's name (system:serviceaccount:<namespace>:<name>). */
const ownNamespace = (user: string | undefined) => /^system:serviceaccount:([^:]+):[^:]+$/.exec(user ?? '')?.[1];

/**
 * Who the page is signed in as, and a way out: at the header's end (an
 * addon of the page's own). Signed in as a ServiceAccount: its own
 * namespace one the page guesses it uses (Namespaces), if anything is
 * allowed it there — the user's to take back.
 */
export const session = (auth: AuthAnswer) =>
  defineAddon({
    id: 'session',
    title: 'Session',
    layer: 'builtin',
    setup({ contributor, cluster, effect }) {
      contributor.add('Fill', 'session.header', fill(slots.header.end, { after: 'core.header.settings', render: () => <SignedIn auth={auth} /> }));
      const namespace = ownNamespace(auth.user);
      if (!namespace) return;
      const rules = cluster.source.access({ namespace });
      effect(() => {
        if (grantsAny(rules.value)) contributor.patch('Namespaces', 'default', { known: { [namespace]: true } });
      });
    },
  });

function SignedIn({ auth }: { auth: AuthAnswer }) {
  const [busy, setBusy] = useState(false);
  const out = async () => {
    setBusy(true);
    await fetch('/auth/logout', { method: 'POST', headers: { 'x-overkube': '1' } }).catch(() => undefined);
    window.location.reload();
  };
  return (
    <span class="ok-signed-in">
      <span title={[auth.user, ...(auth.groups ?? [])].join('\n')}>{auth.user}</span>
      <Button variant="ghost" icon="sign-out" title="Sign out" busy={busy} onClick={out} />
    </span>
  );
}
