import { type KindInfo, type KubeObject, kinds, type ObjectOf, type PrinterColumn } from '@overkube/kube-types';
import * as admissionregistration from '@overkube/kube-types/admissionregistration/v1';
import * as apiextensions from '@overkube/kube-types/apiextensions/v1';
import * as apiregistration from '@overkube/kube-types/apiregistration/v1';
import * as apps from '@overkube/kube-types/apps/v1';
import * as autoscalingV1 from '@overkube/kube-types/autoscaling/v1';
import * as autoscaling from '@overkube/kube-types/autoscaling/v2';
import * as batch from '@overkube/kube-types/batch/v1';
import * as certificates from '@overkube/kube-types/certificates/v1';
import * as coordination from '@overkube/kube-types/coordination/v1';
import * as core from '@overkube/kube-types/core/v1';
import * as discovery from '@overkube/kube-types/discovery/v1';
import * as events from '@overkube/kube-types/events/v1';
import * as flowcontrol from '@overkube/kube-types/flowcontrol/v1';
import * as networking from '@overkube/kube-types/networking/v1';
import * as node from '@overkube/kube-types/node/v1';
import * as policy from '@overkube/kube-types/policy/v1';
import * as rbac from '@overkube/kube-types/rbac/v1';
import * as resource from '@overkube/kube-types/resource/v1';
import * as scheduling from '@overkube/kube-types/scheduling/v1';
import * as storage from '@overkube/kube-types/storage/v1';

/** A kind and its columns — typed by the kind's objects (a Pod's columns for Pods only). */
const of = <K extends KindInfo>(kind: K, columns: readonly PrinterColumn<ObjectOf<K>>[]): [KindInfo, readonly PrinterColumn<KubeObject>[]] => [
  kind,
  columns as unknown as readonly PrinterColumn<KubeObject>[],
];

/** The built-in kinds kubectl has columns of: each kind, its columns (as the API server prints them). */
export const PRINTED: [KindInfo, readonly PrinterColumn<KubeObject>[]][] = [
  of(kinds.core.v1.Pod, core.podColumns),
  of(kinds.core.v1.Service, core.serviceColumns),
  of(kinds.core.v1.Node, core.nodeColumns),
  of(kinds.core.v1.Namespace, core.namespaceColumns),
  of(kinds.core.v1.ConfigMap, core.configMapColumns),
  of(kinds.core.v1.Secret, core.secretColumns),
  of(kinds.core.v1.PersistentVolume, core.persistentVolumeColumns),
  of(kinds.core.v1.PersistentVolumeClaim, core.persistentVolumeClaimColumns),
  of(kinds.core.v1.Event, core.eventColumns),
  of(kinds.core.v1.PodTemplate, core.podTemplateColumns),
  of(kinds.core.v1.ReplicationController, core.replicationControllerColumns),
  of(kinds.core.v1.Endpoints, core.endpointsColumns),
  of(kinds.core.v1.ServiceAccount, core.serviceAccountColumns),
  of(kinds.core.v1.ResourceQuota, core.resourceQuotaColumns),
  of(kinds.core.v1.ComponentStatus, core.componentStatusColumns),
  of(kinds.core.v1.LimitRange, core.limitRangeColumns),
  of(kinds.apps.v1.Deployment, apps.deploymentColumns),
  of(kinds.apps.v1.StatefulSet, apps.statefulSetColumns),
  of(kinds.apps.v1.DaemonSet, apps.daemonSetColumns),
  of(kinds.apps.v1.ReplicaSet, apps.replicaSetColumns),
  of(kinds.apps.v1.ControllerRevision, apps.controllerRevisionColumns),
  of(kinds.batch.v1.Job, batch.jobColumns),
  of(kinds.batch.v1.CronJob, batch.cronJobColumns),
  of(kinds.networking.v1.Ingress, networking.ingressColumns),
  of(kinds.networking.v1.NetworkPolicy, networking.networkPolicyColumns),
  of(kinds.networking.v1.IngressClass, networking.ingressClassColumns),
  of(kinds.networking.v1.IPAddress, networking.ipAddressColumns),
  of(kinds.networking.v1.ServiceCIDR, networking.serviceCIDRColumns),
  of(kinds.storage.v1.StorageClass, storage.storageClassColumns),
  of(kinds.storage.v1.CSIDriver, storage.csiDriverColumns),
  of(kinds.storage.v1.CSINode, storage.csiNodeColumns),
  of(kinds.storage.v1.CSIStorageCapacity, storage.csiStorageCapacityColumns),
  of(kinds.storage.v1.VolumeAttachment, storage.volumeAttachmentColumns),
  of(kinds.storage.v1.VolumeAttributesClass, storage.volumeAttributesClassColumns),
  of(kinds.autoscaling.v2.HorizontalPodAutoscaler, autoscaling.horizontalPodAutoscalerColumns),
  of(kinds.autoscaling.v1.HorizontalPodAutoscaler, autoscalingV1.horizontalPodAutoscalerColumns),
  of(kinds.certificates.v1.CertificateSigningRequest, certificates.certificateSigningRequestColumns),
  of(kinds.coordination.v1.Lease, coordination.leaseColumns),
  of(kinds.discovery.v1.EndpointSlice, discovery.endpointSliceColumns),
  of(kinds.events.v1.Event, events.eventColumns),
  of(kinds.flowcontrol.v1.FlowSchema, flowcontrol.flowSchemaColumns),
  of(kinds.flowcontrol.v1.PriorityLevelConfiguration, flowcontrol.priorityLevelConfigurationColumns),
  of(kinds.node.v1.RuntimeClass, node.runtimeClassColumns),
  of(kinds.policy.v1.PodDisruptionBudget, policy.podDisruptionBudgetColumns),
  of(kinds.rbac.v1.RoleBinding, rbac.roleBindingColumns),
  of(kinds.rbac.v1.ClusterRoleBinding, rbac.clusterRoleBindingColumns),
  of(kinds.rbac.v1.Role, rbac.roleColumns),
  of(kinds.rbac.v1.ClusterRole, rbac.clusterRoleColumns),
  of(kinds.resource.v1.DeviceClass, resource.deviceClassColumns),
  of(kinds.resource.v1.ResourceClaim, resource.resourceClaimColumns),
  of(kinds.resource.v1.ResourceClaimTemplate, resource.resourceClaimTemplateColumns),
  of(kinds.resource.v1.ResourceSlice, resource.resourceSliceColumns),
  of(kinds.scheduling.v1.PriorityClass, scheduling.priorityClassColumns),
  of(kinds.admissionregistration.v1.MutatingWebhookConfiguration, admissionregistration.mutatingWebhookConfigurationColumns),
  of(kinds.admissionregistration.v1.ValidatingWebhookConfiguration, admissionregistration.validatingWebhookConfigurationColumns),
  of(kinds.admissionregistration.v1.ValidatingAdmissionPolicy, admissionregistration.validatingAdmissionPolicyColumns),
  of(kinds.admissionregistration.v1.ValidatingAdmissionPolicyBinding, admissionregistration.validatingAdmissionPolicyBindingColumns),
  of(kinds.apiextensions.v1.CustomResourceDefinition, apiextensions.customResourceDefinitionColumns),
  of(kinds.apiregistration.v1.APIService, apiregistration.apiServiceColumns),
];
