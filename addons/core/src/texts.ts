import { t } from '@overkube/sdk';

/*
 * What the core says, by key — its English beside each: one list, for a
 * language pack to say otherwise (Messages ru:core). Kinds' names (pods,
 * Deployment) and what the cluster says (its codes, its messages) are as
 * they are: terms, not words to translate.
 */
export const T = {
  retry: t('core.retry', 'Try again'),
  close: t('core.close', 'Close'),

  categories: {
    workloads: t('core.category.workloads', 'Workloads'),
    network: t('core.category.network', 'Network'),
    config: t('core.category.config', 'Config'),
    storage: t('core.category.storage', 'Storage'),
    cluster: t('core.category.cluster', 'Cluster'),
  },
  columns: {
    name: t('core.column.name', 'Name'),
    namespace: t('core.column.namespace', 'Namespace'),
    age: t('core.column.age', 'Age'),
  },
  nav: {
    kinds: t('core.nav.kinds', 'Kinds'),
    all: t('core.nav.all', 'All kinds'),
    find: t('core.nav.find', 'Find a kind'),
    nothingLike: t('core.nav.nothing-like', 'Nothing like “{query}”'),
    pages: t('core.nav.pages', 'Pages'),
    close: t('core.nav.close', 'Close {title}'),
    tab: {
      pin: t('core.nav.tab.pin', 'Pin'),
      unpin: t('core.nav.tab.unpin', 'Unpin'),
      close: t('core.nav.tab.close', 'Close'),
    },
  },
  discovery: {
    asking: t('core.discovery.asking', 'Asking the cluster what it serves…'),
    refused: t('core.discovery.refused', 'What the cluster serves cannot be had: {code}'),
    noKind: t('core.discovery.no-kind', 'The cluster serves no kind {kind}.'),
  },
  /** Of a kind, wherever it is shown (its table, one of its objects). */
  kind: {
    notServed: t('core.kind.not-served', 'The cluster does not serve {kind}.'),
    refused: t('core.kind.refused', '{kind} cannot be had: {code}'),
  },
  table: {
    loading: t('core.table.loading', 'Loading {kind}…'),
    count: t('core.table.count', '{count} {kind}'),
    none: t('core.table.none', 'No {kind}'),
    noneShown: t('core.table.none-shown', 'No {kind} shown of {total}'),
    noColumns: t('core.table.no-columns', 'No columns for {kind}: no addon defines any.'),

    waiting: t('core.table.waiting', 'Waiting: {reason}'),
    stale: t('core.table.stale', "Not current: the page has lost the cluster's changes and is reconnecting. What is shown is as it was."),
    cellLoading: t('core.table.cell-loading', 'Loading'),
  },
  object: {
    loading: t('core.object.loading', 'Loading {kind} {name}…'),
    gone: t('core.object.gone', 'There is no {kind} {name} (now).'),
    goneStale: t('core.object.gone-stale', 'There is no {kind} {name} (as last seen: the page is reconnecting).'),
    sure: t('core.object.sure', '{action}: sure?'),
  },
};
