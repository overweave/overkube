import { type KindInfo, kinds } from '@overkube/kube-types';
import type { FieldCatalog, Value } from '@overkube/query';
import { type CellValue, Column, type ColumnSpec, closeIn, column, type KubeContributor, kindRef, openIn, takes } from '@overkube/sdk';
import { useFields, usePage, useSay } from '@overkube/sdk/preact';
import { Chips, Ratio, Status, Tip } from '@overkube/uikit';
import type { Definition } from '@overweave/core';
import { inOrder } from '@overweave/ui';
import { useDefinitions } from '@overweave/ui/preact';
import { useComputed } from '@preact/signals';
import { useMemo, useRef } from 'preact/hooks';
import { type Cron, nextRun, parseCron } from './cron.ts';
import { type Failed, fieldOf } from './failures.ts';
import { EMPTY, humanDuration, msOf } from './format.ts';
import { builtIn } from './kinds.ts';
import { clock, useLive } from './live.ts';
import { StatusOf, statusFormat } from './statuses.tsx';
import { T } from './texts.ts';
import { ConditionTip, ContainerTip, TaintsTip } from './tips.tsx';

/*
 * The core's columns — data only: each a field (or a path) it sorts by and
 * the fields its cell is made of; its cell, of those values, the page's.
 * Every kind's: its objects' names (a link to each), namespaces, ages; the
 * usual kinds' own, as kubectl shows them; a CRD's, as it says them (its
 * columns, its fields) — each a default another's column of its name takes
 * the place of. And more than kubectl says, not shown till asked (the More
 * of the columns' settings): any object's labels, its controller, its
 * conditions; a pod's containers' states; a node's taints, whether
 * cordoned. (What needs a query of each row's — an object's Warning
 * events, a node's pods — waits for counts of related objects.) And the columns a kind's table (or a resource's summary)
 * has: those the definitions and its CRD give, as its TableView sets them
 * out.
 */

const { core, apps, batch, networking, storage, certificates, apiregistration, apiextensions, autoscaling, rbac, policy, scheduling, discovery, admissionregistration } = kinds;

/** A value as one: a path's (all of its values: a list) its first. */
const one = (v: CellValue): Value | null => (Array.isArray(v) ? ((v as readonly Value[])[0] ?? null) : (v as Value | null));
/** A part of a whole (ready of wanted): a ring filled as far, 1/2 beside it (none: "—"). */
const ratio = ([a, b]: readonly CellValue[]) => {
  const [x, y] = [one(a), one(b)];
  return x === null ? EMPTY : <Ratio value={Number(x)} of={Number(y ?? 0)} />;
};

/** All of a column's values, as text (each of many). */
const all = (values: readonly CellValue[]) => values.flatMap((v) => (v === null || v === undefined ? [] : Array.isArray(v) ? v : [v])).map(String);
/** Where a service is reached from outside (its load balancer's addresses, those it is given; an external name's, its name — as kubectl says): none, a load balancer's still to come. */
const externalFormat = ([ips, hosts, given, type, name]: readonly CellValue[]) => {
  if (one(type) === 'ExternalName') return String(one(name) ?? EMPTY);
  const found = all([ips, hosts, given]);
  return found.length ? found.join(',') : one(type) === 'LoadBalancer' ? '<pending>' : EMPTY;
};
/** A service's IP families, and how many it may have (IPv4,IPv6 (PreferDualStack)). */
const familiesFormat = ([families, policy]: readonly CellValue[]) => {
  const found = all([families]);
  return found.length ? `${found.join(',')}${one(policy) ? ` (${one(policy)})` : ''}` : EMPTY;
};

/** Where a claim's data comes from (a snapshot, another claim): its kind and name. */
const sourceFormat = ([kind, name]: readonly CellValue[]) => (one(name) ? `${one(kind)}/${one(name)}` : EMPTY);

/** Some values in a line (none: "—"). */
const listFormat = (values: readonly CellValue[]) => all(values).filter(Boolean).join(', ') || EMPTY;
/** How many values there are. */
const countFormat = ([values]: readonly CellValue[]) => String(all([values]).length);
/** An API service's service (namespace/name); none: served by the API server itself, Local — as kubectl says. */
const serviceFormat = ([namespace, name]: readonly CellValue[]) => (one(name) ? `${one(namespace)}/${one(name)}` : 'Local');

/** A cron job's history limits, its finished jobs kept (successful / failed; none said: 3 / 1, the API's). */
const historyFormat = ([ok, failed]: readonly CellValue[]) => `${one(ok) ?? 3} / ${one(failed) ?? 1}`;

/** A workload's pod template's columns, as kubectl's -o wide has them: its containers, images, selector (those asked for). */
const templated = (kind: KindInfo, which: readonly ('containers' | 'images' | 'selector')[]): [KindInfo, string, Omit<ColumnSpec, 'target' | 'header'>][] =>
  which.map((w) => [kind, w === 'containers' ? 'Containers' : w === 'images' ? 'Images' : 'Selector', { sort: `${kindRef(kind)}.${w}`, wide: true }]);

/** How long a job ran: from its start to its end (done, or failed: when it failed), or (still running) to now, live; not started, "—". */
function Duration({ from, to }: { from: number; to: number }) {
  return <>{useLive(() => humanDuration((Number.isNaN(to) ? clock.value : to) - from), [from, to])}</>;
}
const durationFormat = ([started, finished]: readonly CellValue[]) => {
  const from = msOf(one(started) as Value);
  return Number.isNaN(from) ? EMPTY : <Duration from={from} to={msOf(one(finished) as Value)} />;
};
/** Seconds, as a duration (86400: 24h). */
const secondsFormat = ([seconds]: readonly CellValue[]) => (typeof one(seconds) === 'number' ? humanDuration((one(seconds) as number) * 1000) : EMPTY);
/** An autoscaler's targets as kubectl shows them: two, and how many more. */
const targetsFormat = ([targets]: readonly CellValue[]) => {
  const said = all([targets]);
  return said.length ? `${said.slice(0, 2).join(', ')}${said.length > 2 ? ` + ${said.length - 2} more...` : ''}` : EMPTY;
};

/** When a cron job runs next (its schedule, in its time zone), how long till then, live — worked out again only once it is past; suspended, not at all; @every, its period; not a schedule, "—". No time zone: the controller's own, taken as UTC (said under the pointer). */
function NextRun({ schedule, zone }: { schedule: string; zone: string }) {
  const say = useSay();
  const cron = useMemo(() => parseCron(schedule), [schedule]);
  const next = useRef<{ cron?: Cron; zone?: string; at?: number }>({});
  const text = useLive(() => {
    const now = clock.value;
    if (!cron) return EMPTY;
    if (cron.every !== undefined) return say(T.columns.every, { period: humanDuration(cron.every) });
    const n = next.current;
    if (n.cron !== cron || n.zone !== zone || n.at === undefined || n.at <= now) next.current = { cron, zone, at: nextRun(cron, now, zone || 'UTC') };
    const at = next.current.at;
    return at === undefined ? EMPTY : say(T.columns.inTime, { time: humanDuration(at - now) });
  }, [cron, zone]);
  return <Tip content={() => zone || say(T.columns.controllerZone)}>{text}</Tip>;
}
const nextFormat = ([schedule, zone, suspended]: readonly CellValue[]) =>
  one(suspended) === true || one(suspended) === 'true' ? EMPTY : <NextRun schedule={String(one(schedule) ?? '')} zone={String(one(zone) ?? '')} />;

/** An object's name, a link opening it over the page it is on (drawn again when the page goes elsewhere, not as things open over it). */
function NameLink({ kind, name, namespace }: { kind: KindInfo; name: string; namespace?: string }) {
  const page = usePage();
  const here = useComputed(() => closeIn(page.path.value)).value;
  return <a href={page.href(openIn(here, kind, { metadata: { name, namespace } }))}>{name}</a>;
}

/** The usual kinds' own columns (beside every kind's name, namespace, age), as kubectl shows them: [kind, header, spec]. */
const OWN: [KindInfo, string, Omit<ColumnSpec, 'target' | 'header'>][] = [
  [core.v1.Pod, 'Ready', { sort: 'pods.v1.ready', values: ['pods.v1.ready', 'pods.v1.containers'], format: ratio }],
  [core.v1.Pod, 'Status', { sort: 'pods.v1.status', format: statusFormat }],
  [core.v1.Pod, 'Restarts', { sort: 'pods.v1.restarts' }],
  [core.v1.Pod, 'IP', { sort: 'pods.v1.ip', wide: true }],
  [core.v1.Pod, 'Node', { sort: 'pods.v1.node', wide: true }],
  [core.v1.Pod, 'QoS', { sort: 'pods.v1.qos', wide: true }],
  [core.v1.Pod, 'Started', { sort: 'pods.v1.started', wide: true }],
  [core.v1.Pod, 'Nominated Node', { sort: '.status.nominatedNodeName', wide: true }],
  [core.v1.Pod, 'Readiness Gates', { sort: 'pods.v1.readinessGates', wide: true }],
  ...([apps.v1.Deployment, apps.v1.StatefulSet, apps.v1.ReplicaSet] as const).flatMap((k): [KindInfo, string, Omit<ColumnSpec, 'target' | 'header'>][] => {
    const ref = kindRef(k);
    return [
      [k, 'Status', { sort: `${ref}.health`, format: statusFormat }],
      [k, 'Ready', { sort: `${ref}.ready`, values: [`${ref}.ready`, `${ref}.desired`], format: ratio }],
      ...(k === apps.v1.ReplicaSet ? [] : [[k, 'Up-to-date', { sort: `${ref}.updated` }] as [KindInfo, string, Omit<ColumnSpec, 'target' | 'header'>]]),
      ...(k === apps.v1.StatefulSet ? [] : [[k, 'Available', { sort: `${ref}.available` }] as [KindInfo, string, Omit<ColumnSpec, 'target' | 'header'>]]),
    ];
  }),
  [apps.v1.Deployment, 'Strategy', { sort: '.spec.strategy.type', wide: true }],
  [apps.v1.Deployment, 'Revision', { sort: 'deployments.v1.apps.revision', wide: true }],
  ...templated(apps.v1.Deployment, ['containers', 'images', 'selector']),
  [apps.v1.ReplicaSet, 'Revision', { sort: 'replicasets.v1.apps.revision' }],
  [apps.v1.ReplicaSet, 'Images', { sort: 'replicasets.v1.apps.images' }],
  ...templated(apps.v1.ReplicaSet, ['containers', 'selector']),
  [apps.v1.StatefulSet, 'Service', { sort: '.spec.serviceName', wide: true }],
  [apps.v1.StatefulSet, 'Update', { sort: '.spec.updateStrategy.type', wide: true }],
  [apps.v1.StatefulSet, 'Partition', { sort: '.spec.updateStrategy.rollingUpdate.partition', wide: true }],
  [apps.v1.StatefulSet, 'Pod Management', { sort: '.spec.podManagementPolicy', wide: true }],
  [apps.v1.StatefulSet, 'Revision', { sort: '.status.updateRevision', wide: true }],
  ...templated(apps.v1.StatefulSet, ['containers', 'images']),
  [apps.v1.DaemonSet, 'Status', { sort: 'daemonsets.v1.apps.health', format: statusFormat }],
  [apps.v1.DaemonSet, 'Desired', { sort: 'daemonsets.v1.apps.desired' }],
  [apps.v1.DaemonSet, 'Current', { sort: '.status.currentNumberScheduled' }],
  [apps.v1.DaemonSet, 'Ready', { sort: 'daemonsets.v1.apps.ready' }],
  [apps.v1.DaemonSet, 'Up-to-date', { sort: 'daemonsets.v1.apps.updated' }],
  [apps.v1.DaemonSet, 'Available', { sort: 'daemonsets.v1.apps.available' }],
  [apps.v1.DaemonSet, 'Node Selector', { sort: 'daemonsets.v1.apps.nodeSelector' }],
  [apps.v1.DaemonSet, 'Misscheduled', { sort: '.status.numberMisscheduled', wide: true }],
  [apps.v1.DaemonSet, 'Max Unavailable', { sort: '.spec.updateStrategy.rollingUpdate.maxUnavailable', wide: true }],
  ...templated(apps.v1.DaemonSet, ['containers', 'images', 'selector']),
  [batch.v1.Job, 'Status', { sort: 'jobs.v1.batch.status', format: statusFormat }],
  [batch.v1.Job, 'Completions', { sort: 'jobs.v1.batch.succeeded', values: ['jobs.v1.batch.succeeded', 'jobs.v1.batch.completions'], format: ratio }],
  [batch.v1.Job, 'Duration', { values: ['jobs.v1.batch.started', 'jobs.v1.batch.finished'], format: durationFormat }],
  [batch.v1.Job, 'Parallelism', { sort: '.spec.parallelism', wide: true }],
  [batch.v1.Job, 'Failed', { sort: '.status.failed', wide: true }],
  [batch.v1.Job, 'Started', { sort: 'jobs.v1.batch.started', wide: true }],
  [batch.v1.Job, 'Finished', { sort: 'jobs.v1.batch.finished', wide: true }],
  [batch.v1.Job, 'Deadline', { sort: '.spec.activeDeadlineSeconds', wide: true }],
  [batch.v1.Job, 'TTL', { sort: '.spec.ttlSecondsAfterFinished', wide: true }],
  [batch.v1.Job, 'Backoff Limit', { sort: '.spec.backoffLimit', wide: true }],
  [batch.v1.Job, 'Completion Mode', { sort: '.spec.completionMode', wide: true }],
  ...templated(batch.v1.Job, ['containers', 'images', 'selector']),
  [batch.v1.CronJob, 'Status', { sort: 'cronjobs.v1.batch.status', format: statusFormat }],
  [batch.v1.CronJob, 'Schedule', { sort: '.spec.schedule' }],
  [batch.v1.CronJob, 'Time Zone', { sort: '.spec.timeZone' }],
  [batch.v1.CronJob, 'Suspend', { sort: '.spec.suspend' }],
  [batch.v1.CronJob, 'Active', { sort: 'cronjobs.v1.batch.active' }],
  [batch.v1.CronJob, 'Last Schedule', { sort: 'cronjobs.v1.batch.lastSchedule' }],
  [batch.v1.CronJob, 'Next', { values: ['.spec.schedule', '.spec.timeZone', '.spec.suspend'], format: nextFormat }],
  [batch.v1.CronJob, 'Last Successful', { sort: 'cronjobs.v1.batch.lastSuccess', wide: true }],
  [batch.v1.CronJob, 'Concurrency', { sort: '.spec.concurrencyPolicy', wide: true }],
  [batch.v1.CronJob, 'Starting Deadline', { sort: '.spec.startingDeadlineSeconds', wide: true }],
  [batch.v1.CronJob, 'History Limits', { values: ['.spec.successfulJobsHistoryLimit', '.spec.failedJobsHistoryLimit'], format: historyFormat, wide: true }],
  ...templated(batch.v1.CronJob, ['containers', 'images', 'selector']),
  [core.v1.Service, 'Type', { sort: '.spec.type' }],
  [core.v1.Service, 'Cluster-IP', { sort: '.spec.clusterIP' }],
  [
    core.v1.Service,
    'External-IP',
    {
      values: ['.status.loadBalancer.ingress[*].ip', '.status.loadBalancer.ingress[*].hostname', '.spec.externalIPs[*]', '.spec.type', '.spec.externalName'],
      format: externalFormat,
    },
  ],
  [core.v1.Service, 'Port(s)', { sort: '.spec.ports[*].port' }],
  [core.v1.Service, 'Traffic Policy', { sort: '.spec.externalTrafficPolicy', wide: true }],
  [core.v1.Service, 'Session Affinity', { sort: '.spec.sessionAffinity', wide: true }],
  [core.v1.Service, 'IP Families', { values: ['.spec.ipFamilies[*]', '.spec.ipFamilyPolicy'], format: familiesFormat, wide: true }],
  [core.v1.Service, 'Selector', { sort: 'services.v1.selector', wide: true }],
  [networking.v1.Ingress, 'Class', { sort: '.spec.ingressClassName' }],
  [networking.v1.Ingress, 'Hosts', { sort: '.spec.rules[*].host' }],
  [networking.v1.Ingress, 'Address', { sort: '.status.loadBalancer.ingress[*].ip' }],
  [networking.v1.Ingress, 'Ports', { sort: 'ingresses.v1.networking.k8s.io.ports' }],
  [networking.v1.NetworkPolicy, 'Pod-Selector', { sort: 'networkpolicies.v1.networking.k8s.io.pods' }],
  [core.v1.ConfigMap, 'Data', { sort: 'configmaps.v1.keys' }],
  [core.v1.ConfigMap, 'Immutable', { sort: '.immutable', wide: true }],
  [core.v1.Secret, 'Type', { sort: '.type' }],
  [core.v1.Secret, 'Data', { sort: 'secrets.v1.keys' }],
  [core.v1.Secret, 'Immutable', { sort: '.immutable', wide: true }],
  [core.v1.ServiceAccount, 'Secrets', { sort: 'serviceaccounts.v1.secrets' }],
  [core.v1.ServiceAccount, 'Automount', { sort: '.automountServiceAccountToken', wide: true }],
  [core.v1.ResourceQuota, 'Request', { values: ['resourcequotas.v1.request'], format: listFormat }],
  [core.v1.ResourceQuota, 'Limit', { values: ['resourcequotas.v1.limit'], format: listFormat }],
  [core.v1.PersistentVolumeClaim, 'Status', { sort: 'persistentvolumeclaims.v1.status', format: statusFormat }],
  [core.v1.PersistentVolumeClaim, 'Volume', { sort: '.spec.volumeName' }],
  [core.v1.PersistentVolumeClaim, 'Capacity', { sort: '.status.capacity.storage' }],
  [core.v1.PersistentVolumeClaim, 'Access Modes', { sort: '.spec.accessModes[*]' }],
  [core.v1.PersistentVolumeClaim, 'StorageClass', { sort: '.spec.storageClassName' }],
  [core.v1.PersistentVolumeClaim, 'VolumeAttributesClass', { sort: '.spec.volumeAttributesClassName' }],
  [core.v1.PersistentVolumeClaim, 'Requested', { sort: '.spec.resources.requests.storage', wide: true }],
  [core.v1.PersistentVolumeClaim, 'VolumeMode', { sort: '.spec.volumeMode', wide: true }],
  [core.v1.PersistentVolumeClaim, 'Data Source', { values: ['.spec.dataSource.kind', '.spec.dataSource.name'], format: sourceFormat, wide: true }],
  [core.v1.PersistentVolume, 'Capacity', { sort: '.spec.capacity.storage' }],
  [core.v1.PersistentVolume, 'Status', { sort: 'persistentvolumes.v1.status', format: statusFormat }],
  [core.v1.PersistentVolume, 'Access Modes', { sort: '.spec.accessModes[*]' }],
  [core.v1.PersistentVolume, 'Reclaim Policy', { sort: '.spec.persistentVolumeReclaimPolicy' }],
  [core.v1.PersistentVolume, 'Claim', { sort: '.spec.claimRef.name' }],
  [core.v1.PersistentVolume, 'StorageClass', { sort: '.spec.storageClassName' }],
  [core.v1.PersistentVolume, 'VolumeAttributesClass', { sort: '.spec.volumeAttributesClassName' }],
  [core.v1.PersistentVolume, 'Reason', { sort: '.status.reason' }],
  [core.v1.PersistentVolume, 'VolumeMode', { sort: '.spec.volumeMode', wide: true }],
  [core.v1.PersistentVolume, 'Mount Options', { sort: '.spec.mountOptions[*]', wide: true }],
  [storage.v1.StorageClass, 'Provisioner', { sort: '.provisioner' }],
  [storage.v1.StorageClass, 'Reclaim Policy', { sort: '.reclaimPolicy' }],
  [storage.v1.StorageClass, 'Volume Binding Mode', { sort: '.volumeBindingMode' }],
  [storage.v1.StorageClass, 'Allow Volume Expansion', { sort: '.allowVolumeExpansion' }],
  [storage.v1.StorageClass, 'Default', { sort: 'storageclasses.v1.storage.k8s.io.default' }],
  ...([rbac.v1.RoleBinding, rbac.v1.ClusterRoleBinding] as const).flatMap((k): [KindInfo, string, Omit<ColumnSpec, 'target' | 'header'>][] => {
    const ref = kindRef(k);
    return [
      [k, 'Role', { sort: '.roleRef.name' }],
      [k, 'Users', { sort: `${ref}.users`, wide: true }],
      [k, 'Groups', { sort: `${ref}.groups`, wide: true }],
      [k, 'ServiceAccounts', { sort: `${ref}.serviceAccounts`, wide: true }],
    ];
  }),
  [policy.v1.PodDisruptionBudget, 'Min Available', { sort: '.spec.minAvailable' }],
  [policy.v1.PodDisruptionBudget, 'Max Unavailable', { sort: '.spec.maxUnavailable' }],
  [policy.v1.PodDisruptionBudget, 'Allowed Disruptions', { sort: '.status.disruptionsAllowed' }],
  [policy.v1.PodDisruptionBudget, 'Unhealthy Pods', { sort: '.spec.unhealthyPodEvictionPolicy', wide: true }],
  [policy.v1.PodDisruptionBudget, 'Current Healthy', { sort: '.status.currentHealthy', wide: true }],
  [policy.v1.PodDisruptionBudget, 'Desired Healthy', { sort: '.status.desiredHealthy', wide: true }],
  [policy.v1.PodDisruptionBudget, 'Expected Pods', { sort: '.status.expectedPods', wide: true }],
  [core.v1.Node, 'Status', { sort: 'nodes.v1.status', format: statusFormat }],
  [core.v1.Node, 'Roles', { sort: 'nodes.v1.roles' }],
  [core.v1.Node, 'Version', { sort: 'nodes.v1.version' }],
  [core.v1.Node, 'Internal-IP', { sort: '.status.addresses[?(@.type=="InternalIP")].address', wide: true }],
  [core.v1.Node, 'CPU', { sort: 'nodes.v1.cpu', wide: true }],
  [core.v1.Node, 'Memory', { sort: 'nodes.v1.memory', wide: true }],
  [core.v1.Node, 'External-IP', { sort: '.status.addresses[?(@.type=="ExternalIP")].address', wide: true }],
  [core.v1.Node, 'OS-Image', { sort: '.status.nodeInfo.osImage', wide: true }],
  [core.v1.Node, 'Kernel-Version', { sort: '.status.nodeInfo.kernelVersion', wide: true }],
  [core.v1.Node, 'Container-Runtime', { sort: '.status.nodeInfo.containerRuntimeVersion', wide: true }],
  [core.v1.Namespace, 'Status', { sort: '.status.phase', format: statusFormat }],
  [core.v1.Namespace, 'Pod Security', { sort: 'namespaces.v1.podSecurity', wide: true }],
  [core.v1.Event, 'Last Seen', { sort: 'events.v1.lastSeen' }],
  [core.v1.Event, 'Type', { sort: '.type', format: statusFormat }],
  [core.v1.Event, 'Reason', { sort: '.reason' }],
  [core.v1.Event, 'Object', { sort: '.involvedObject.name' }],
  [core.v1.Event, 'Message', { sort: '.message' }],
  [core.v1.Event, 'Subobject', { sort: '.involvedObject.fieldPath', wide: true }],
  [core.v1.Event, 'Source', { values: ['.source.component', '.source.host', '.reportingComponent'], format: listFormat, wide: true }],
  [core.v1.Event, 'First Seen', { sort: 'events.v1.firstSeen', wide: true }],
  [core.v1.Event, 'Count', { sort: 'events.v1.count', wide: true }],
  [networking.v1.IngressClass, 'Controller', { sort: '.spec.controller' }],
  [networking.v1.IngressClass, 'Parameters', { values: ['.spec.parameters.kind', '.spec.parameters.name'], format: sourceFormat }],
  [networking.v1.IngressClass, 'Default', { sort: 'ingressclasses.v1.networking.k8s.io.default', wide: true }],
  [scheduling.v1.PriorityClass, 'Value', { sort: '.value' }],
  [scheduling.v1.PriorityClass, 'Global-Default', { sort: '.globalDefault' }],
  [scheduling.v1.PriorityClass, 'Preemption Policy', { sort: '.preemptionPolicy' }],
  [discovery.v1.EndpointSlice, 'AddressType', { sort: '.addressType' }],
  [discovery.v1.EndpointSlice, 'Ports', { sort: '.ports[*].port' }],
  [discovery.v1.EndpointSlice, 'Endpoints', { sort: '.endpoints[*].addresses[*]' }],
  [apiextensions.v1.CustomResourceDefinition, 'Kind', { sort: '.spec.names.kind' }],
  [apiextensions.v1.CustomResourceDefinition, 'Group', { sort: '.spec.group' }],
  [apiextensions.v1.CustomResourceDefinition, 'Scope', { sort: '.spec.scope' }],
  [apiextensions.v1.CustomResourceDefinition, 'Short Names', { sort: '.spec.names.shortNames[*]', wide: true }],
  [apiregistration.v1.APIService, 'Service', { values: ['.spec.service.namespace', '.spec.service.name'], format: serviceFormat }],
  ...[admissionregistration.v1.ValidatingWebhookConfiguration, admissionregistration.v1.MutatingWebhookConfiguration].map(
    (k): [KindInfo, string, Omit<ColumnSpec, 'target' | 'header'>] => [k, 'Webhooks', { values: ['.webhooks[*].name'], format: countFormat }],
  ),
  [certificates.v1.CertificateSigningRequest, 'SignerName', { sort: '.spec.signerName' }],
  [certificates.v1.CertificateSigningRequest, 'Requestor', { sort: '.spec.username' }],
  [certificates.v1.CertificateSigningRequest, 'Requested Duration', { sort: '.spec.expirationSeconds', format: secondsFormat }],
  [certificates.v1.CertificateSigningRequest, 'Usages', { sort: '.spec.usages[*]', wide: true }],
  [certificates.v1.CertificateSigningRequest, 'Condition', { sort: 'certificatesigningrequests.v1.certificates.k8s.io.status', format: statusFormat }],
  [apiregistration.v1.APIService, 'Available', { sort: 'apiservices.v1.apiregistration.k8s.io.status', format: statusFormat }],
  [apiextensions.v1.CustomResourceDefinition, 'Status', { sort: 'customresourcedefinitions.v1.apiextensions.k8s.io.status', format: statusFormat }],
  [autoscaling.v2.HorizontalPodAutoscaler, 'Reference', { sort: '.spec.scaleTargetRef.name' }],
  [autoscaling.v2.HorizontalPodAutoscaler, 'Targets', { values: ['horizontalpodautoscalers.v2.autoscaling.targets'], format: targetsFormat }],
  [autoscaling.v2.HorizontalPodAutoscaler, 'MinPods', { sort: '.spec.minReplicas' }],
  [autoscaling.v2.HorizontalPodAutoscaler, 'MaxPods', { sort: '.spec.maxReplicas' }],
  [autoscaling.v2.HorizontalPodAutoscaler, 'Replicas', { sort: '.status.currentReplicas' }],
  [autoscaling.v2.HorizontalPodAutoscaler, 'Desired', { sort: '.status.desiredReplicas', wide: true }],
  [autoscaling.v2.HorizontalPodAutoscaler, 'Last Scaled', { sort: 'horizontalpodautoscalers.v2.autoscaling.lastScale', wide: true }],
  [autoscaling.v2.HorizontalPodAutoscaler, 'Status', { sort: 'horizontalpodautoscalers.v2.autoscaling.status', format: statusFormat }],
];

/** Labels as chips, one line (key=value each; prefixes folded). */
const labelsFormat = ([labels]: readonly CellValue[]) => {
  const items = Object.fromEntries(all([labels]).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
  return Object.keys(items).length ? <Chips items={items} compact /> : EMPTY;
};

/** Conditions whose True is a trouble (a node's pressure, a replica failure): the others' True is well. */
const TROUBLE = /Pressure$|Unavailable$|Failure$|^Failed$|^Stalled$|^Degraded$/;

/** Conditions as marks, each its type: well (a check), not (a cross), not known — its tip, more of it (the object read then). */
const conditionsFormat = ([conditions, name, namespace]: readonly CellValue[], { kind }: { kind: KindInfo }) => {
  const said = all([conditions]).map((c) => [c.slice(0, c.indexOf('=')), c.slice(c.indexOf('=') + 1)]);
  if (!said.length) return EMPTY;
  const ns = typeof one(namespace) === 'string' ? String(one(namespace)) : undefined;
  return said.map(([type, status]) => {
    const well = status === 'True' ? !TROUBLE.test(type) : status === 'False' ? TROUBLE.test(type) : undefined;
    const [tone, icon] = well === undefined ? (['unknown', 'help'] as const) : well ? (['ok', 'circle-check'] as const) : (['error', 'circle-x'] as const);
    return (
      <Tip key={type} card content={() => <ConditionTip kind={kind} namespace={ns} name={String(one(name) ?? '')} type={type} />}>
        <Status tone={tone} icon={icon} title={`${type}=${status}`} />
      </Tip>
    );
  });
};

/** A pod's containers' states, a mark each — its tip, more of it (the pod read then). */
const statesFormat = ([states, name, namespace]: readonly CellValue[], { kind }: { kind: KindInfo }) => {
  const each = all([states]);
  if (!each.length) return EMPTY;
  const ns = typeof one(namespace) === 'string' ? String(one(namespace)) : undefined;
  return each.map((s) => {
    const [container, state] = [s.slice(0, s.indexOf('|')), s.slice(s.indexOf('|') + 1)];
    return (
      <Tip key={container} card content={() => <ContainerTip kind={kind} namespace={ns} name={String(one(name) ?? '')} container={container} />}>
        <StatusOf kind={kind} words={state} mark title={`${container}: ${state}`} />
      </Tip>
    );
  });
};

/** A node's taints: how many — its tip, each (the node read then). */
const taintsFormat = ([taints, name]: readonly CellValue[], { kind }: { kind: KindInfo }) => {
  const each = all([taints]);
  return each.length ? (
    <Tip card content={() => <TaintsTip kind={kind} name={String(one(name) ?? '')} />}>
      {each.length}
    </Tip>
  ) : (
    EMPTY
  );
};

/** More than kubectl says, a kind's: [kind, header, spec] (more, each). */
const MORE: [KindInfo, string, Omit<ColumnSpec, 'target' | 'header'>][] = [
  [core.v1.Pod, 'Container States', { values: ['pods.v1.containerStates', 'core.name', 'core.namespace'], format: statesFormat }],
  [core.v1.Node, 'Taints', { values: ['nodes.v1.taints', 'core.name'], format: taintsFormat }],
  [core.v1.Node, 'Cordoned', { sort: 'nodes.v1.unschedulable', format: ([on]) => (one(on) === true ? 'Cordoned' : EMPTY) }],
];

/** A column's name as kubectl heads it, for a definition's name: "Port(s)" port-s. */
const slug = (header: string) =>
  header
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** The core's columns, each a default another's of its name takes the place of: every kind's, the usual kinds' own. */
export function addColumns(c: KubeContributor): void {
  const fallback = { fallback: true };
  c.add(
    'Column',
    'core.name',
    column({
      header: T.columns.name,
      order: 0,
      // An Event's, as kubectl's: only when wide.
      wide: (k) => k.id === core.v1.Event.id,
      sort: 'core.name',
      values: ['core.name', 'core.namespace'],
      format: ([name, namespace], { kind }) => <NameLink kind={kind} name={String(name ?? '')} namespace={typeof namespace === 'string' ? namespace : undefined} />,
    }),
    fallback,
  );
  c.add('Column', 'core.namespace', column({ header: T.columns.namespace, order: 10, when: (k) => k.namespaced, sort: 'core.namespace' }), fallback);
  // An Event's age is its Last Seen.
  c.add('Column', 'core.age', column({ header: T.columns.age, order: 900, width: 90, when: (k) => k.id !== core.v1.Event.id, sort: 'core.created' }), fallback);
  // An operator's resource's state, as kstatus works it out (its addon's looks say it in its words): after its name, before its CRD's columns.
  c.add('Column', 'core.health', column({ header: T.columns.status, order: 50, when: (k) => !builtIn(k.group), sort: 'core.health', format: statusFormat }), fallback);
  // Each kind's in its own order (after the name, the namespace, a CRD's state; before the age), as kubectl has them.
  const placed = new Map<KindInfo, number>();
  for (const [kind, header, spec] of OWN) {
    const i = placed.get(kind) ?? 0;
    placed.set(kind, i + 1);
    c.add('Column', `core.${kind.id}.${slug(header)}`, column({ kinds: [kind], header, order: 100 + i * 10, ...spec }), fallback);
  }
  // More than kubectl says (not shown till asked): before the age — any object's, then the kind's.
  const more = { more: true };
  c.add('Column', 'core.labels', column({ header: T.columns.labels, order: 800, values: ['core.labels'], format: labelsFormat, ...more }), fallback);
  c.add('Column', 'core.controlled-by', column({ header: T.columns.controlledBy, order: 810, sort: 'core.controller', ...more }), fallback);
  c.add(
    'Column',
    'core.conditions',
    column({ header: T.columns.conditions, order: 820, values: ['core.conditions', 'core.name', 'core.namespace'], format: conditionsFormat, ...more }),
    fallback,
  );
  for (const [i, [kind, header, spec]] of MORE.entries())
    c.add('Column', `core.${kind.id}.${slug(header)}`, column({ kinds: [kind], header, order: 840 + i, ...more, ...spec }), fallback);
}

/** A column placed: its definition (or a CRD's column, made one), its cell's fields. */
export interface Placed {
  definition: Definition<ColumnSpec>;
  fields: readonly string[];
}

/** A column's fields: those its cell is made of (none said: the one it sorts by). */
const fieldsOfColumn = (spec: ColumnSpec): readonly string[] => spec.values ?? (spec.sort ? [spec.sort] : []);

/** A column there is for a kind: who gives it (an addon's id; the core's, a CRD's: core), whether it is kubectl's -o wide only, more than kubectl says, whether shown now. */
export interface Offered {
  definition: Definition<ColumnSpec>;
  by: string;
  wide: boolean;
  more: boolean;
  shown: boolean;
}

/**
 * A kind's columns, as its tables (and a resource's summary) have them: the
 * definitions its target and when take (one whose when throws: not drawn,
 * its failure told), its CRD's columns (as it says them: its own fields;
 * one of the definitions' names in their place), set out as its TableView
 * says — those it names first; hidden as it says, else as the column is
 * (wide: only when the table is). With them, its fields' definitions (how
 * a column with no format of its own shows its values).
 */
export function useColumns(
  kind: KindInfo,
  view: { readonly columns?: readonly string[]; readonly hidden?: Readonly<Record<string, boolean>> },
  failed: Failed,
  wide = false,
): { placed: Placed[]; offered: Offered[]; catalog: FieldCatalog | undefined } {
  const fields = useFields(kindRef(kind));
  // A field defined (an addon's) that cannot be: its owner's failure.
  for (const [name, why] of Object.entries(fields.rejected ?? {})) if (name) failed(fieldOf(name), 'Field', name, 'definition', new Error(why));
  const definitions = useDefinitions(Column);
  const [placed, offered] = useMemo(() => {
    // Its CRD says its state itself (a Status or Ready column): kstatus's not drawn beside it.
    const says = (fields.columns ?? []).some((k) => ['status', 'ready'].includes(slug(k.name)));
    const all = definitions.filter((c) => {
      if (!takes(c.spec.target, kind) || (says && c.name === 'core.health')) return false;
      try {
        return c.spec.when?.(kind) ?? true;
      } catch (error) {
        failed(c, 'Column', c.name, 'when', error);
        return false;
      }
    });
    const named = new Set(all.map((c) => c.name));
    // Its CRD's, as it says them: after the name and namespace, before the age.
    const crd = (fields.columns ?? [])
      .map((k, i) => ({
        name: `core.${kind.id}.${slug(k.name)}`,
        spec: { target: { kinds: [kind.id] }, header: k.name, sort: k.field, wide: k.priority > 0, order: 100 + i * 10 } satisfies ColumnSpec,
      }))
      .filter((c) => !named.has(c.name)) as unknown as Definition<ColumnSpec>[];
    const isWide = (c: Definition<ColumnSpec>) => {
      const w = c.spec.wide;
      try {
        return typeof w === 'function' ? w(kind) : w === true;
      } catch (error) {
        failed(c, 'Column', c.name, 'wide', error);
        return false;
      }
    };
    const shown = (c: Definition<ColumnSpec>) => {
      const hidden = view.hidden?.[c.name];
      return hidden !== undefined ? !hidden : wide ? !c.spec.more : !isWide(c) && !c.spec.more;
    };
    const ordered = arranged([...all, ...crd], view);
    return [
      ordered.filter(shown).map((definition) => ({ definition, fields: fieldsOfColumn(definition.spec) })),
      // Every column there is for it (a CRD's, the core's): who gives it, whether only wide, whether shown — what the columns' settings offer.
      ordered.map((definition) => ({ definition, by: definition.definedBy ?? 'core', wide: isWide(definition), more: definition.spec.more === true, shown: shown(definition) })),
    ];
  }, [definitions, fields.columns, kind, view.columns, view.hidden, wide, failed]);
  return { placed, offered, catalog: fields.catalog };
}

/** Columns as a TableView sets them out: those it names first, in its order; the others after, in theirs. */
function arranged<C extends { name: string; spec: { order?: number } }>(all: readonly C[], view: { readonly columns?: readonly string[] }): C[] {
  const order = [...new Set(view.columns ?? [])];
  return [...order.map((name) => all.find((c) => c.name === name)).filter((c): c is C => !!c), ...inOrder(all.filter((c) => !order.includes(c.name)))];
}
