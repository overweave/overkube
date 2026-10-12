/*
 * The discovery.k8s.io group's v1 types (generated) and how kubectl shows
 * its kinds (by hand: printers.go, v1.37.1 — printEndpointSlice,
 * formatDiscoveryPorts, formatDiscoveryEndpoints).
 */

import type { EndpointSlice } from '../../gen/discovery/v1.js';
import { ageColumn, listWithMore, nameColumn, type PrinterColumn } from '../print.js';

export * from '../../gen/discovery/v1.js';

/** Its ports: each one's number, else its name, else "*". */
const ports = (o: EndpointSlice) => (o.ports ?? []).map((p) => (p.port !== undefined ? String(p.port) : (p.name ?? '*')));

export const endpointSliceColumns: PrinterColumn<EndpointSlice>[] = [
  nameColumn,
  { name: 'AddressType', type: 'string', value: (o) => o.addressType, display: (o) => o.addressType },
  { name: 'Ports', type: 'string', value: (o) => ports(o).join(',') || undefined, display: (o) => listWithMore(ports(o)) },
  {
    name: 'Endpoints',
    type: 'string',
    value: (o) => o.endpoints.flatMap((e) => e.addresses).join(',') || undefined,
    display: (o) => listWithMore(o.endpoints.flatMap((e) => e.addresses)),
  },
  ageColumn,
];
