/*
 * The networking group's v1 types (generated) and how kubectl shows its
 * kinds (by hand: printers.go, v1.37.1 — printIngress, printNetworkPolicy,
 * printIngressClass, printIPAddress, printServiceCIDR).
 */

import type { Ingress, IngressClass, IPAddress, NetworkPolicy, ServiceCIDR } from '../../gen/networking/v1.js';
import { loadBalancerAddresses } from '../core/v1.js';
import { ageColumn, formatLabelSelector, known, nameColumn, type PrinterColumn } from '../print.js';

export * from '../../gen/networking/v1.js';

/** An ingress's hosts: the first three named; a rule past them, "+ n more..." (n: the rules but three); none named: "*" (formatHosts). */
function hosts(ingress: Ingress): string {
  const rules = ingress.spec?.rules ?? [];
  const list: string[] = [];
  let more = false;
  for (const rule of rules) {
    if (list.length === 3) more = true;
    if (!more && rule.host) list.push(rule.host);
  }
  if (!list.length) return '*';
  return more ? `${list.join(',')} + ${rules.length - 3} more...` : list.join(',');
}

export const ingressColumns: PrinterColumn<Ingress>[] = [
  nameColumn,
  { name: 'Class', type: 'string', value: (o) => o.spec?.ingressClassName, display: (o) => o.spec?.ingressClassName ?? '<none>' },
  { name: 'Hosts', type: 'string', value: hosts, display: hosts },
  {
    name: 'Address',
    type: 'string',
    value: (o) => known(loadBalancerAddresses(o.status?.loadBalancer?.ingress)),
    display: (o) => loadBalancerAddresses(o.status?.loadBalancer?.ingress),
  },
  { name: 'Ports', type: 'string', value: (o) => (o.spec?.tls?.length ? '80, 443' : '80'), display: (o) => (o.spec?.tls?.length ? '80, 443' : '80') },
  ageColumn,
];

export const networkPolicyColumns: PrinterColumn<NetworkPolicy>[] = [
  nameColumn,
  // Its pod selector always there (none given: every pod — "<none>").
  {
    name: 'Pod-Selector',
    type: 'string',
    value: (o) => known(formatLabelSelector(o.spec?.podSelector ?? {})),
    display: (o) => formatLabelSelector(o.spec?.podSelector ?? {}),
  },
  ageColumn,
];

/** An ingress class's parameters, kind.group/name; none: undefined. */
function parameters(o: IngressClass): string | undefined {
  const p = o.spec?.parameters;
  return p ? `${p.apiGroup ? `${p.kind}.${p.apiGroup}` : p.kind}/${p.name}` : undefined;
}

/** An address's parent: resource.group (lowercased), its namespace if any, its name; none: undefined. */
function parentRef(o: IPAddress): string | undefined {
  const p = o.spec?.parentRef;
  if (!p) return undefined;
  const resource = (p.group ? `${p.resource}.${p.group}` : p.resource).toLowerCase();
  return `${resource}${p.namespace ? `/${p.namespace}` : ''}/${p.name}`;
}

export const ingressClassColumns: PrinterColumn<IngressClass>[] = [
  // Its name — marked the default, "(default)" after it (sorted by the name).
  {
    name: 'Name',
    type: 'string',
    format: 'name',
    value: (o) => o.metadata?.name,
    display: (o) => {
      const name = o.metadata?.name ?? '';
      return o.metadata?.annotations?.['ingressclass.kubernetes.io/is-default-class'] === 'true' ? `${name} (default)` : name;
    },
  },
  { name: 'Controller', type: 'string', value: (o) => o.spec?.controller, display: (o) => o.spec?.controller ?? '' },
  { name: 'Parameters', type: 'string', value: parameters, display: (o) => parameters(o) ?? '<none>' },
  ageColumn,
];

export const ipAddressColumns: PrinterColumn<IPAddress>[] = [
  nameColumn,
  { name: 'ParentRef', type: 'string', value: parentRef, display: (o) => parentRef(o) ?? '<none>' },
  ageColumn,
];

export const serviceCIDRColumns: PrinterColumn<ServiceCIDR>[] = [
  nameColumn,
  { name: 'CIDRs', type: 'string', value: (o) => known((o.spec?.cidrs ?? []).join(',')), display: (o) => (o.spec?.cidrs ?? []).join(',') },
  ageColumn,
];
