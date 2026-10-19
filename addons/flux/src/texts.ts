import { t } from '@overkube/sdk';

/*
 * What the Flux addon says, by key — its English beside each
 * (Messages <locale>:flux). Its terms are Flux's own, as the flux CLI and
 * its controllers say them (flux get, flux reconcile, flux suspend; a
 * condition's reason as it is).
 */
export const T = {
  category: t('flux.category', 'Delivery'),
  columns: {
    status: t('flux.column.status', 'Status'),
    url: t('flux.column.url', 'URL'),
    endpoint: t('flux.column.endpoint', 'Endpoint'),
    chart: t('flux.column.chart', 'Chart'),
    artifact: t('flux.column.artifact', 'Artifact'),
    usedBy: t('flux.column.used-by', 'Used By'),
    source: t('flux.column.source', 'Source'),
    revision: t('flux.column.revision', 'Revision'),
    message: t('flux.column.message', 'Message'),
    name: t('flux.column.name', 'Name'),
    namespace: t('flux.column.namespace', 'Namespace'),
    kind: t('flux.column.kind', 'Kind'),
  },
  state: {
    ready: t('flux.state.ready', 'Ready'),
    reconciling: t('flux.state.reconciling', 'Reconciling'),
    reconcilingFor: t('flux.state.reconciling-for', 'Reconciling · {duration}'),
    suspended: t('flux.state.suspended', 'Suspended'),
  },
  /** An artifact still served while its fetch fails. */
  stale: t('flux.artifact.stale', 'Fetch failing: its last artifact, fetched {duration} ago, still served'),
  source: {
    title: t('flux.source.title', 'Source'),
    stale: t('flux.source.stale', 'Its last artifact, fetched {duration} ago, still served: no newer revision is applied till it is fetched.'),
  },
  usedBy: {
    title: t('flux.used-by.title', 'Used By'),
    none: t('flux.used-by.none', 'Nothing uses it.'),
  },
  inventory: {
    title: t('flux.inventory.title', 'Inventory'),
    none: t('flux.inventory.none', 'Nothing applied yet.'),
    notFound: t('flux.inventory.not-found', 'NotFound'),
  },
  actions: {
    reconcile: t('flux.action.reconcile', 'Reconcile'),
    withSource: t('flux.action.reconcile-with-source', 'Reconcile with source'),
    suspend: t('flux.action.suspend', 'Suspend'),
    resume: t('flux.action.resume', 'Resume'),
  },
  overview: {
    title: t('flux.overview.title', 'Flux'),
    ready: t('flux.overview.ready', '{count} Ready'),
    suspended: t('flux.overview.suspended', '{count} Suspended'),
  },
  mark: t('flux.mark', 'Flux {kind} {name}'),
  markRevision: t('flux.mark.revision', 'Flux {kind} {name} · revision {revision}'),
  managed: {
    flux: t('flux.managed.flux', 'Flux'),
    revision: t('flux.managed.revision', 'Revision'),
    source: t('flux.managed.source', 'Source'),
  },
} as const;
