/*
 * The rbac.authorization.k8s.io group's v1 types (generated) and how kubectl
 * shows its kinds (by hand: printers.go, v1.37.1 — printRoleBinding,
 * printClusterRoleBinding, rbac.SubjectsStrings; Role, ClusterRole: the
 * default table).
 */

import type { ClusterRole, ClusterRoleBinding, Role, RoleBinding, Subject } from '../../gen/rbac/v1.js';
import { ageColumn, defaultColumns, known, nameColumn, type PrinterColumn } from '../print.js';

export * from '../../gen/rbac/v1.js';

/** Its subjects of a kind, ", "-joined: users' and groups' names, service accounts' namespace/name (SubjectsStrings). */
const subjects = (list: readonly Subject[] | undefined, kind: string) =>
  (list ?? [])
    .filter((s) => s.kind === kind)
    .map((s) => (kind === 'ServiceAccount' ? `${s.namespace ?? ''}/${s.name}` : s.name))
    .join(', ');

/** A binding's columns: its role (kind/name); with -o wide, its users, groups, service accounts. */
function bindingColumns<B extends RoleBinding | ClusterRoleBinding>(): PrinterColumn<B>[] {
  return [
    nameColumn,
    { name: 'Role', type: 'string', value: (o) => `${o.roleRef.kind}/${o.roleRef.name}`, display: (o) => `${o.roleRef.kind}/${o.roleRef.name}` },
    ageColumn,
    { name: 'Users', type: 'string', priority: 1, value: (o) => known(subjects(o.subjects, 'User')), display: (o) => subjects(o.subjects, 'User') },
    { name: 'Groups', type: 'string', priority: 1, value: (o) => known(subjects(o.subjects, 'Group')), display: (o) => subjects(o.subjects, 'Group') },
    {
      name: 'ServiceAccounts',
      type: 'string',
      priority: 1,
      value: (o) => known(subjects(o.subjects, 'ServiceAccount')),
      display: (o) => subjects(o.subjects, 'ServiceAccount'),
    },
  ];
}

export const roleBindingColumns: PrinterColumn<RoleBinding>[] = bindingColumns<RoleBinding>();
export const clusterRoleBindingColumns: PrinterColumn<ClusterRoleBinding>[] = bindingColumns<ClusterRoleBinding>();

/** No printer of their own: the default table. */
export const roleColumns: PrinterColumn<Role>[] = defaultColumns;
export const clusterRoleColumns: PrinterColumn<ClusterRole>[] = defaultColumns;
