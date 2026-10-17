/**
 * The gateway: the page's way to a Kubernetes cluster — the API server's
 * paths passed on (never what reaches past it: exec, attach, portforward,
 * proxy), several watches over one stream, changes as JSON, a status — as
 * one handler over Node's request and response, for any host to serve:
 * overkube's own server, a framework's route, a platform's plugin. The
 * types the page speaks it in: '@overkube/gateway/protocol'.
 */

export { createGateway, fromAnotherSite, type Gateway, type GatewayOptions, type Given } from './gateway.ts';
export { actingAs, type Identity, identityError } from './identity.ts';
export type { Upstream } from './kubeconfig.ts';
export { readKubeconfig } from './kubeconfig.ts';
export { whoAmI } from './me.ts';
export { FIELD_MANAGER } from './patch.ts';
export { type ApiPath, classify } from './paths.ts';
export * from './protocol.ts';
export { kubeState } from './status.ts';
export { fail, fromKubeconfig, inCluster, type UpstreamSource } from './upstream.ts';
export { resetWatchState, type WatchOptions, watchTotals } from './watch.ts';
