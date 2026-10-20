import { createConnector } from '@overkube/connector';
import { type AddonChoicesSpec, fieldLayers, knownNamespaces, kubeKinds, type NamespacesSpec } from '@overkube/sdk';
import { localStore, notifications, UserService } from '@overkube/shell';
import { createSource } from '@overkube/source';
import { createRegistry } from '@overweave/core';
import { definitionSignal } from '@overweave/ui/preact';
import { computed, effect } from '@preact/signals';
import { addons } from './addons.ts';
import { AddonHost } from './host/addons.ts';
import { clusterAccess } from './host/cluster.ts';
import type { BootOptions } from './options.ts';
import { authOf, returnAfterSignIn, session, showSignIn, signsIn } from './session.tsx';
import { mount } from './shell/mount.tsx';

/*
 * The page started, in one place and in order: signed in (session.tsx: not
 * signed in where one signs in, the sign-in screen alone); the connector (the gateway
 * at /kube, as overkube's server serves it) and the source answering
 * queries over it — the kinds' fields and those addons define — the
 * registry of the dashboard's kinds; the user's changes read back (before
 * anything is drawn: no table drawn as by default, then again as the user
 * set it); the addons run in it (only the core's and the built-in ones
 * with ?safe); the shell drawn into its element (?debug: the slots over
 * it, what the one signed in may not have marked rather than hidden) —
 * its session over, the sign-in screen in its place. The user's changes saved as the page goes.
 *
 * Another host (a platform's plugin) starts it the same way, into an
 * element of its own page: its gateway where it serves it, its headers on
 * every request (a CSRF token), and with signIn false the page asks no /auth
 * — the host has signed the user in already; its own addons (addons) run
 * beside the page's, as they are (their layer theirs: builtin, always on).
 */

export async function boot({ element, asked, gateway = '/kube', headers, signIn = true, addons: theirs = [] }: BootOptions) {
  // No /auth asked: as a host without one (null), its own sign-in.
  const auth = signIn ? await authOf() : null;
  if (auth === 'unreachable' || (signsIn(auth) && !auth.user)) return showSignIn(element, auth);
  if (signsIn(auth)) returnAfterSignIn();
  // Signed in with a token of one's own: the API server's 401 (the token ended, taken back) ends the session too.
  const connector = createConnector({ http: { base: gateway, headers, tokenSession: signsIn(auth) && auth.via === 'token' } });
  const registry = createRegistry({ kinds: kubeKinds });
  // The namespaces one may use without listing them (Namespaces): asked one by one when the cluster's list is refused.
  const known = definitionSignal(registry, 'Namespaces', 'default');
  const source = createSource(connector, { layers: fieldLayers(registry), namespaces: () => knownNamespaces(known.value?.spec as NamespacesSpec | undefined) });
  const cluster = clusterAccess(connector, source);
  const told = notifications();

  // The user's changes of this cluster (its gateway: the page's, at this origin).
  const user = new UserService({ registry, store: localStore(`${window.location.host}${gateway}`) });
  await user.start();
  // Going (closed, reloaded, sent to the background): what is waiting saved now.
  window.addEventListener('pagehide', () => void user.flush());

  // Which addons the user turned on, whose suggestion they put off: theirs, kept as the rest of their changes.
  const chosen = definitionSignal(registry, 'AddonChoices', 'default');
  const choices = computed(() => chosen.value?.spec as AddonChoicesSpec | undefined);
  const host = new AddonHost({ registry, cluster, choices, notify: (n, from) => told.notify(n, from), safe: asked.has('safe') });
  for (const addon of signsIn(auth) ? [...addons, session(auth)] : addons) host.register(addon);
  // The host's: one whose id is taken (the page's own, another of the host's) refused and said, the page drawn all the same.
  for (const addon of theirs) {
    try {
      host.register(addon);
    } catch (error) {
      console.warn(`[overkube] the host's addon ${addon.id} refused: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const unmount = mount(element, { registry, host, cluster, user, debug: asked.has('debug') }, told);
  // Turned away (the session ended, its token taken back): the page gives way to signing in again.
  if (signsIn(auth)) {
    const stop = effect(() => {
      if (connector.session.value !== 'expired') return;
      // Once: what is ended here is read nowhere again.
      queueMicrotask(() => {
        stop();
        unmount();
        host.close();
        cluster.close();
        connector.close();
        showSignIn(element, auth, true);
      });
    });
  }
  // Ended by the host (its page left): drawn no more, what is waiting saved, every watch let go.
  const close = () => {
    unmount();
    host.close();
    cluster.close();
    connector.close();
    void user.flush();
  };
  return { registry, cluster, host, user, close };
}
