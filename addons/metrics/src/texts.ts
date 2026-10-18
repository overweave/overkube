import { t } from '@overkube/sdk';

/* What the metrics addon says, by key — its English beside each (Messages <locale>:metrics). */
export const T = {
  columns: {
    cpu: t('metrics.column.cpu', 'CPU'),
    memory: t('metrics.column.memory', 'Memory'),
    /** A node's: beside its capacity's (the core's CPU, Memory). */
    cpuUsage: t('metrics.column.cpu-usage', 'CPU Usage'),
    memoryUsage: t('metrics.column.memory-usage', 'Memory Usage'),
    /** A cell's tip: what is used, of what is asked for and what it may take. */
    used: t('metrics.column.used', '{value} used'),
    requests: t('metrics.column.requests', 'requests {value}'),
    limit: t('metrics.column.limit', 'limit {value}'),
    allocatable: t('metrics.column.allocatable', 'allocatable {value}'),
  },
  overview: {
    cpuUsed: t('metrics.overview.cpu-used', 'CPU used'),
    memoryUsed: t('metrics.overview.memory-used', 'Memory used'),
    of: t('metrics.overview.of', '{part}% of {whole}'),
    top: {
      title: t('metrics.overview.top.title', 'Top pods'),
      name: t('metrics.overview.top.name', 'Name'),
      namespace: t('metrics.overview.top.namespace', 'Namespace'),
      none: t('metrics.overview.top.none', 'No pod metrics yet'),
    },
  },
  tab: {
    title: t('metrics.tab.title', 'Metrics'),
    now: t('metrics.tab.now', 'Now'),
    container: t('metrics.tab.container', 'Container'),
    overTime: t('metrics.tab.over-time', 'Over time'),
    range: t('metrics.tab.range', 'Range'),
    noNow: t('metrics.tab.no-now', 'No metrics for this {kind} yet (metrics-server scrapes every 15s)'),
    noHistory: {
      title: t('metrics.tab.no-history.title', 'No history: no VictoriaMetrics or Prometheus found'),
      text: t(
        'metrics.tab.no-history.text',
        'metrics-server serves current usage only. With a VictoriaMetrics or Prometheus Service in the cluster, this tab charts usage over time (query_range).',
      ),
    },
    nothingKept: t('metrics.tab.nothing-kept', 'No samples in this range'),
    failed: t('metrics.tab.failed', '{keeper} did not answer: {message}'),
    charts: {
      cpu: t('metrics.tab.chart.cpu', 'CPU'),
      memory: t('metrics.tab.chart.memory', 'Memory'),
      throttled: t('metrics.tab.chart.throttled', 'CPU throttled'),
      received: t('metrics.tab.chart.received', 'Network received'),
      sent: t('metrics.tab.chart.sent', 'Network sent'),
    },
    marks: {
      requests: t('metrics.tab.mark.requests', 'requests'),
      limit: t('metrics.tab.mark.limit', 'limit'),
      allocatable: t('metrics.tab.mark.allocatable', 'allocatable'),
    },
    ago: t('metrics.tab.ago', '{time} ago'),
    at: t('metrics.tab.at', 'now'),
  },
};
