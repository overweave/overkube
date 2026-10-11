import { createClient } from '@overkube/client';
import { kubeKinds } from '@overkube/sdk';
import { notifications } from '@overkube/shell';
import { createRegistry } from '@overweave/core';
import { addons } from './addons.ts';
import { AddonHost } from './host/addons.ts';
import { clusterAccess } from './host/cluster.ts';
import { mount } from './shell/mount.tsx';

/*
 * The page: the client (the gateway at /kube, as overkube's server serves
 * it), the registry of the dashboard's kinds, the addons run in it (only
 * the core's and the built-in ones with ?safe), the shell drawn into #app.
 */

const client = createClient({ api: { base: '/kube' } });
const registry = createRegistry({ kinds: kubeKinds });
const cluster = clusterAccess(client);
const told = notifications();
const host = new AddonHost({ registry, cluster, notify: (n, from) => told.notify(n, from), safe: new URLSearchParams(window.location.search).has('safe') });
for (const addon of addons) host.register(addon);
mount(document.getElementById('app') as HTMLElement, { registry, host, cluster }, told);
