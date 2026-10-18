import { t } from '@overkube/sdk';

/*
 * What the Helm addon says, by key — its English beside each
 * (Messages <locale>:helm). Its terms are helm's own, as helm list, helm
 * status, helm history and helm get say them.
 */
export const T = {
  category: t('helm.category', 'Delivery'),
  page: {
    title: t('helm.page.title', 'Helm'),
    heading: t('helm.page.heading', 'Helm releases'),
    count: t('helm.page.count', { one: '{count} release', other: '{count} releases' }),
    placeholder: t('helm.page.placeholder', 'Filter: release, status = failed, revision > 1'),
    none: t('helm.page.none', 'No releases.'),
    noneFound: t('helm.page.none-found', 'No releases found.'),
  },
  columns: {
    release: t('helm.column.release', 'Release'),
    namespace: t('helm.column.namespace', 'Namespace'),
    chart: t('helm.column.chart', 'Chart'),
    version: t('helm.column.version', 'Version'),
    appVersion: t('helm.column.app-version', 'App Version'),
    status: t('helm.column.status', 'Status'),
    revision: t('helm.column.revision', 'Revision'),
    updated: t('helm.column.updated', 'Updated'),
    description: t('helm.column.description', 'Description'),
    kind: t('helm.column.kind', 'Kind'),
    name: t('helm.column.name', 'Name'),
  },
  release: {
    title: t('helm.release.title', 'Release {name}'),
    overview: t('helm.release.overview', 'Overview'),
    values: t('helm.release.values', 'Values'),
    manifest: t('helm.release.manifest', 'Manifest'),
    history: t('helm.release.history', 'History'),
    summary: t('helm.release.summary', 'Summary'),
    description: t('helm.release.description', 'Description'),
    firstDeployed: t('helm.release.first-deployed', 'First Deployed'),
    lastDeployed: t('helm.release.last-deployed', 'Last Deployed'),
    resources: t('helm.release.resources', 'Resources'),
    noResources: t('helm.release.no-resources', 'No resources in its manifest.'),
    notes: t('helm.release.notes', 'Notes'),
    given: t('helm.release.given', 'User-supplied'),
    all: t('helm.release.all', 'With chart defaults'),
    noValues: t('helm.release.no-values', 'No values given: the chart’s own.'),
    noManifest: t('helm.release.no-manifest', 'No manifest: helm stopped before it rendered one.'),
    compare: t('helm.release.compare', 'Revision {to} (from {from})'),
    first: t('helm.release.first', 'Revision {to}'),
    nothingBefore: t('helm.release.nothing-before', 'Its first revision: nothing before it to compare with.'),
    expand: t('helm.release.expand', 'Show the lines skipped'),
    added: t('helm.release.added', 'added'),
    removed: t('helm.release.removed', 'removed'),
    sameObjects: t('helm.release.same-objects', { one: '{count} unchanged: {names}', other: '{count} unchanged: {names}' }),
    same: t('helm.release.same', 'No differences.'),
    stuck: t('helm.release.stuck', 'Stuck in {status} for {duration}'),
    stuckText: t('helm.release.stuck-text', 'helm stopped before it finished: every next upgrade is refused (another operation is in progress) till it is rolled back.'),
    stuckFirst: t('helm.release.stuck-first', 'helm stopped before its first install finished: no revision before it to roll back to; uninstall it, then install it again.'),
    reading: t('helm.release.reading', 'Reading its revision…'),
  },
  mark: t('helm.mark', 'Helm release {name}'),
  overview: {
    title: t('helm.overview.title', 'Helm releases'),
  },
} as const;
