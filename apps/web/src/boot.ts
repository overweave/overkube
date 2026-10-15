import { createConnector } from '@overkube/connector';
import { fieldLayers, kubeKinds } from '@overkube/sdk';
import { localStore, notifications, UserService } from '@overkube/shell';
import { createSource } from '@overkube/source';
import { createRegistry } from '@overweave/core';
import { addons } from './addons.ts';
import { AddonHost } from './host/addons.ts';
import { clusterAccess } from './host/cluster.ts';
import { mount } from './shell/mount.tsx';

/*
 * The page started, in one place and in order: the connector (the gateway
 * at /kube, as overkube's server serves it) and the source answering
 * queries over it — the kinds' fields and those addons define — the
 * registry of the dashboard's kinds; the user's changes read back (before
 * anything is drawn: no table drawn as by default, then again as the user
 * set it); the addons run in it (only the core's and the built-in ones
 * with ?safe); the shell drawn into its element (?debug: the slots over
 * it). The user's changes saved as the page goes.
 */

export interface BootOptions {
  /** Where the shell is drawn. */
  element: HTMLElement;
  /** The page's query: ?safe, ?debug. */
  asked: URLSearchParams;
}

export async function boot({ element, asked }: BootOptions) {
  const connector = createConnector({ http: { base: '/kube' } });
  const registry = createRegistry({ kinds: kubeKinds });
  const source = createSource(connector, { layers: fieldLayers(registry) });
  const cluster = clusterAccess(connector, source);
  const told = notifications();

  const user = new UserService({ registry, store: localStore() });
  await user.start();
  // Going (closed, reloaded, sent to the background): what is waiting saved now.
  window.addEventListener('pagehide', () => void user.flush());

  const host = new AddonHost({ registry, cluster, notify: (n, from) => told.notify(n, from), safe: asked.has('safe') });
  for (const addon of addons) host.register(addon);
  mount(element, { registry, host, cluster, user, debug: asked.has('debug') }, told);
  return { registry, cluster, host, user };
}
