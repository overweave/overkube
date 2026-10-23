import type { Found } from '@overkube/sdk';

/** Where history is kept, as it is looked for — the first found, the one asked (what the addon answers to, and what its setup asks). */
export const KEEPERS: [string, Found][] = [
  ['VictoriaMetrics', { service: ['vmsingle-*', '*-victoria-metrics-single-server'] }],
  ['Prometheus', { service: ['prometheus', 'prometheus-operated', 'prometheus-server', '*-prometheus', '*-prometheus-server'], port: 9090 }],
];
