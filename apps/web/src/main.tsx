import { createConnector } from '@overkube/connector';
import { fieldLayers, kubeKinds } from '@overkube/sdk';
import { notifications } from '@overkube/shell';
import { createSource } from '@overkube/source';
import { createRegistry } from '@overweave/core';
import { addons } from './addons.ts';
import { AddonHost } from './host/addons.ts';
import { clusterAccess } from './host/cluster.ts';
import { mount } from './shell/mount.tsx';

/*
 * The page: the connector (the gateway at /kube, as overkube's server
 * serves it) and the source answering queries over it — the kinds' fields
 * and those addons define — the registry of the dashboard's kinds, the
 * addons run in it (only the core's and the built-in ones with ?safe), the
 * shell drawn into #app (?debug: the slots over it).
 */

const connector = createConnector({ http: { base: '/kube' } });
const registry = createRegistry({ kinds: kubeKinds });
const source = createSource(connector, { layers: fieldLayers(registry) });
const cluster = clusterAccess(connector, source);
const told = notifications();
const asked = new URLSearchParams(window.location.search);
const host = new AddonHost({ registry, cluster, notify: (n, from) => told.notify(n, from), safe: asked.has('safe') });
for (const addon of addons) host.register(addon);
mount(document.getElementById('app') as HTMLElement, { registry, host, cluster, debug: asked.has('debug') }, told);
