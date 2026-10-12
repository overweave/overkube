/*
 * The apiregistration.k8s.io group's v1 types (generated) and how kubectl
 * shows its kinds (by hand: the aggregator's table, kube-aggregator
 * registry/apiservice, v1.37.1).
 */

import type { APIService } from '../../gen/apiregistration/v1.js';
import { ageColumn, nameColumn, type PrinterColumn } from '../print.js';

export * from '../../gen/apiregistration/v1.js';

/** Its service, namespace/name; none: Local. */
const service = (o: APIService) => (o.spec?.service ? `${o.spec.service.namespace}/${o.spec.service.name}` : 'Local');

/** Its Available condition: True; else its status and reason ("False (MissingEndpoints)"); none: Unknown. */
function available(o: APIService): string {
  const c = o.status?.conditions?.find((x) => x.type === 'Available');
  if (!c) return 'Unknown';
  return c.status !== 'True' && c.reason ? `${c.status} (${c.reason})` : c.status;
}

export const apiServiceColumns: PrinterColumn<APIService>[] = [
  nameColumn,
  { name: 'Service', type: 'string', value: service, display: service },
  { name: 'Available', type: 'string', value: available, display: available },
  ageColumn,
];
