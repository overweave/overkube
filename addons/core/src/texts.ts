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
    pages: t('core.nav.pages', 'Pages'),
    tabs: {
      tab: {
        closeTitle: t('core.nav.tabs.tab.close-title', 'Close {title}'),
        context: {
          pin: t('core.nav.tabs.tab.context.pin', 'Pin'),
          unpin: t('core.nav.tabs.tab.context.unpin', 'Unpin'),
          close: t('core.nav.tabs.tab.context.close', 'Close'),
        },
      },
    },
    side: {
      label: t('core.nav.side.label', 'Navigation'),
      pin: t('core.nav.side.pin', 'Keep open'),
    },
    picker: {
      all: t('core.nav.picker.all', 'All kinds'),
      search: t('core.nav.picker.search', 'Find a kind'),
      nothingLike: t('core.nav.picker.nothing-like', 'Nothing like “{query}”'),
    },
  },
  page: {
    home: { asking: t('core.page.home.asking', 'Asking the cluster what it serves…') },
    kind: {
      missing: {
        asking: t('core.page.kind.missing.asking', 'Asking the cluster what it serves…'),
        refused: t('core.page.kind.missing.refused', 'What the cluster serves cannot be had: {code}'),
        noKind: t('core.page.kind.missing.no-kind', 'The cluster serves no kind {kind}.'),
      },
    },
  },
  /** Of a kind, wherever it is shown (its table, one of its resources). */
  kind: {
    notServed: t('core.kind.not-served', 'The cluster does not serve {kind}.'),
    refused: t('core.kind.refused', '{kind} cannot be had: {code}'),
    table: {
      loading: t('core.kind.table.loading', 'Loading {kind}…'),
      count: t('core.kind.table.count', '{count} {kind}'),
      none: t('core.kind.table.none', 'No {kind}'),
      noneShown: t('core.kind.table.none-shown', 'No {kind} shown of {total}'),
      noColumns: t('core.kind.table.no-columns', 'No columns for {kind}: no addon defines any.'),
      waiting: t('core.kind.table.waiting', 'Waiting: {reason}'),
      stale: t('core.kind.table.stale', "Not current: the page has lost the cluster's changes and is reconnecting. What is shown is as it was."),
      cellLoading: t('core.kind.table.cell-loading', 'Loading'),
    },
  },
  /** A resource: its menu's, and opened. */
  resource: {
    context: {
      open: t('core.resource.context.open', 'Open'),
      copyName: t('core.resource.context.copy-name', 'Copy name'),
      copyYaml: t('core.resource.context.copy-yaml', 'Copy YAML'),
      copied: t('core.resource.context.copied', 'Copied'),
    },
    view: {
      missing: {
        loading: t('core.resource.view.missing.loading', 'Loading {kind} {name}…'),
        gone: t('core.resource.view.missing.gone', 'There is no {kind} {name} (now).'),
        goneStale: t('core.resource.view.missing.gone-stale', 'There is no {kind} {name} (as last seen: the page is reconnecting).'),
      },
      actions: { sure: t('core.resource.view.actions.sure', '{action}: sure?') },
      summary: {
        deleting: t('core.resource.view.summary.deleting', 'Being deleted since {since} ago'),
        deletingNow: t('core.resource.view.summary.deleting-now', 'Being deleted'),
        waiting: t('core.resource.view.summary.waiting', 'waiting for {finalizers}'),
      },
      conditions: {
        title: t('core.resource.view.conditions.title', 'Conditions'),
      },
      yaml: { title: t('core.resource.view.yaml.title', 'YAML') },
      metadata: {
        title: t('core.resource.view.metadata.title', 'Metadata'),
        created: t('core.resource.view.metadata.created', 'Created'),
        uid: t('core.resource.view.metadata.uid', 'UID'),
        generation: t('core.resource.view.metadata.generation', 'Generation'),
        labels: t('core.resource.view.metadata.labels', 'Labels'),
        annotations: t('core.resource.view.metadata.annotations', 'Annotations'),
        owners: t('core.resource.view.metadata.owners', 'Owners'),
        finalizers: t('core.resource.view.metadata.finalizers', 'Finalizers'),
        /** A label's, an annotation's chip: what a click on it does, and what it says once done. */
        copy: t('core.resource.view.metadata.copy', 'Copy {text}'),
        copied: t('core.resource.view.metadata.copied', '✓ Copied'),
      },
    },
  },
};
