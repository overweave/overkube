import { type KindInfo, type KubeObject, kinds, type ObjectOf } from '@overkube/kube-types';
import type { KubeContributor } from '@overkube/sdk';
import { T } from '../texts.ts';
import { addPointing, picks, type Selector } from './shared.tsx';
import { pickedBy } from './workloads.tsx';

/*
 * What points at an object, among what it is tied to (the other way: what
 * selects it, scales it, keeps it, binds it, routes to it, uses it) — each
 * found by looking through the objects of the kind that would point, in its
 * namespace (or everywhere, for what is cluster-wide): a pod's services and
 * budgets; a workload's services, autoscalers, budgets; a service's
 * ingresses; a role's bindings; a service account's bindings; a policy's,
 * a budget's pods; a pull secret's service accounts; a stateful set's
 * claims; an ingress class's ingresses, a priority class's pods.
 */

const { Pod, Service, PersistentVolumeClaim, ServiceAccount, Secret, ConfigMap } = kinds.core.v1;
const { Deployment, StatefulSet, DaemonSet, ReplicaSet } = kinds.apps.v1;
const { Ingress, NetworkPolicy, IngressClass } = kinds.networking.v1;
const { HorizontalPodAutoscaler } = kinds.autoscaling.v2;
const { PodDisruptionBudget } = kinds.policy.v1;
const { Role, ClusterRole, RoleBinding, ClusterRoleBinding } = kinds.rbac.v1;
const { PriorityClass } = kinds.scheduling.v1;

type Labelled = KubeObject & { spec?: { template?: { metadata?: { labels?: Record<string, string> } } } };
type ServiceObject = ObjectOf<typeof Service>;
type IngressObject = ObjectOf<typeof Ingress>;
type Binding = ObjectOf<typeof RoleBinding>;

/** The labels its pods have: a pod's own, a workload's template's. */
const podLabels = (o: Labelled, kind: KindInfo) => (kind.id === Pod.id ? o.metadata?.labels : o.spec?.template?.metadata?.labels);
/** Whether a service selects pods of these labels (a service with no selector: none). */
const selects = (s: ServiceObject, labels: Record<string, string> | undefined) =>
  Object.keys(s.spec?.selector ?? {}).length > 0 && picks({ matchLabels: s.spec?.selector }, labels);
/** The services an ingress routes to: its rules' backends', its default one's. */
const routesTo = (i: IngressObject) =>
  [i.spec?.defaultBackend, ...(i.spec?.rules ?? []).flatMap((r) => (r.http?.paths ?? []).map((p) => p.backend))].flatMap((b) => (b?.service ? [b.service.name] : []));
/** Whether a binding names this role (its kind, its name). */
const binds = (role: string, kind: string) => (b: Binding) => b.roleRef.kind === kind && b.roleRef.name === role;
/** Whether a binding has this service account among its subjects. */
const hasAccount = (name: string, namespace: string | undefined) => (b: Binding) =>
  (b.subjects ?? []).some((s) => s.kind === 'ServiceAccount' && s.name === name && (s.namespace ?? b.metadata?.namespace) === namespace);

/** What points at the usual kinds, in the core's view. */
export function addPointings(c: KubeContributor): void {
  const t = T.resource.view.points;
  const ns = (o: KubeObject) => o.metadata?.namespace;
  const name = (o: KubeObject) => o.metadata?.name ?? '';
  const workloads = [Deployment, StatefulSet, DaemonSet, ReplicaSet] as const;

  // A pod's, a workload's: the services that select its pods, the budgets that keep them; what scales a workload.
  addPointing<ServiceObject>(c, ['pod', Pod, ...workloads], 'services', 300, t.selectedBy, (o, kind) => ({
    kind: Service,
    namespace: ns(o),
    test: (s) => selects(s, podLabels(o as Labelled, kind)),
  }));
  addPointing<ObjectOf<typeof PodDisruptionBudget>>(c, ['pod', Pod, ...workloads], 'budgets', 310, t.protectedBy, (o, kind) => ({
    kind: PodDisruptionBudget,
    namespace: ns(o),
    test: (b) => picks(b.spec?.selector as Selector | undefined, podLabels(o as Labelled, kind)),
  }));
  addPointing<ObjectOf<typeof HorizontalPodAutoscaler>>(c, ['workload', Deployment, StatefulSet, ReplicaSet], 'autoscalers', 320, t.scaledBy, (o, kind) => ({
    kind: HorizontalPodAutoscaler,
    namespace: ns(o),
    test: (h) => h.spec?.scaleTargetRef.kind === kind.kind && h.spec.scaleTargetRef.name === name(o),
  }));
  // A service's: the ingresses that route to it.
  addPointing<IngressObject>(c, ['service', Service], 'ingresses', 300, t.routedFrom, (o) => ({ kind: Ingress, namespace: ns(o), test: (i) => routesTo(i).includes(name(o)) }));
  // A role's: the bindings that name it — a cluster role's, cluster-wide and in namespaces.
  addPointing<Binding>(c, ['role', Role], 'bindings', 300, t.boundBy, (o) => ({ kind: RoleBinding, namespace: ns(o), test: binds(name(o), 'Role') }));
  addPointing<Binding>(c, ['clusterrole', ClusterRole], 'bindings', 300, t.boundBy, (o) => ({ kind: ClusterRoleBinding, test: binds(name(o), 'ClusterRole') }));
  addPointing<Binding>(c, ['clusterrole', ClusterRole], 'namespaced', 310, t.boundInNamespaces, (o) => ({ kind: RoleBinding, test: binds(name(o), 'ClusterRole') }));
  // A service account's: the bindings that have it among their subjects — a role binding in any namespace may grant it that namespace.
  addPointing<Binding>(c, ['serviceaccount', ServiceAccount], 'bindings', 250, t.boundInNamespaces, (o) => ({ kind: RoleBinding, test: hasAccount(name(o), ns(o)) }));
  addPointing<Binding>(c, ['serviceaccount', ServiceAccount], 'cluster-bindings', 260, t.boundClusterWideBy, (o) => ({
    kind: ClusterRoleBinding,
    test: hasAccount(name(o), ns(o)),
  }));
  // A policy's, a budget's: the pods it picks (its selector asked of the cluster; an empty one, all of them).
  const picked = (o: KubeObject, selector: Selector | undefined) => {
    const where = pickedBy(selector);
    return { kind: Pod, namespace: ns(o), ...(where ? { where } : {}), quiet: true };
  };
  addPointing(c, ['networkpolicy', NetworkPolicy], 'applies', 300, t.appliesTo, (o) => picked(o, (o as ObjectOf<typeof NetworkPolicy>).spec?.podSelector as Selector | undefined));
  addPointing(c, ['budget', PodDisruptionBudget], 'pods', 300, t.keeps, (o) => picked(o, (o as ObjectOf<typeof PodDisruptionBudget>).spec?.selector as Selector | undefined));
  // A pull secret's: the service accounts that pull with it.
  addPointing<ObjectOf<typeof ServiceAccount>>(c, ['secret', Secret], 'accounts', 300, t.pulledWithBy, (o) =>
    (o as ObjectOf<typeof Secret>).type === 'kubernetes.io/dockerconfigjson'
      ? { kind: ServiceAccount, namespace: ns(o), test: (a) => (a.imagePullSecrets ?? []).some((s) => s.name === name(o)) }
      : undefined,
  );
  // A stateful set's: the claims made of its templates (<template>-<set>-<ordinal>).
  addPointing<ObjectOf<typeof PersistentVolumeClaim>>(c, ['workload', StatefulSet], 'claims', 330, t.claims, (o) => {
    const prefixes = ((o as ObjectOf<typeof StatefulSet>).spec?.volumeClaimTemplates ?? []).map((v) => `${v.metadata?.name}-${name(o)}-`);
    return prefixes.length
      ? { kind: PersistentVolumeClaim, namespace: ns(o), test: (p) => prefixes.some((x) => name(p).startsWith(x) && /^\d+$/.test(name(p).slice(x.length))) }
      : undefined;
  });
  // A config map's, a secret's, a claim's, a service account's: the pods that use it (as their fields say: asked of the cluster).
  const used = (field: string) => (o: KubeObject) => ({ kind: Pod, namespace: ns(o), where: { field, op: 'eq' as const, value: name(o) }, quiet: true });
  addPointing(c, ['config', ConfigMap], 'used', 200, T.resource.view.used.by, used('pods.v1.configmaps'));
  addPointing(c, ['secret', Secret], 'used', 200, T.resource.view.used.by, used('pods.v1.secrets'));
  addPointing(c, ['claim', PersistentVolumeClaim], 'used', 300, T.resource.view.used.by, used('pods.v1.pvcs'));
  addPointing(c, ['serviceaccount', ServiceAccount], 'used', 300, T.resource.view.used.by, used('pods.v1.service-account'));
  // A class's: the ingresses of it, the pods of it (in every namespace).
  addPointing<IngressObject>(c, ['ingressclass', IngressClass], 'ingresses', 300, t.ofIt, (o) => ({ kind: Ingress, test: (i) => i.spec?.ingressClassName === name(o) }));
  addPointing<ObjectOf<typeof Pod>>(c, ['priorityclass', PriorityClass], 'pods', 300, t.ofIt, (o) => ({
    kind: Pod,
    test: (p) => p.spec?.priorityClassName === name(o),
    quiet: true,
  }));
}
