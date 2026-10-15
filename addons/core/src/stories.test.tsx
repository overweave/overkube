import { cleanup, render, waitFor } from '@testing-library/preact';
import { type FunctionComponent, h } from 'preact';
import { afterEach, describe, expect, it } from 'vitest';
import * as appearance from './appearance.stories.tsx';
import * as byKind from './kinds.stories.tsx';
import * as navigation from './navigation.stories.tsx';
import * as overview from './overview.stories.tsx';
import * as page from './page.stories.tsx';
import * as statuses from './statuses.stories.tsx';
import * as view from './view.stories.tsx';

/* The core's stories draw, each: what Storybook shows is what they say (a page's in the page, a resource's in its view). */

afterEach(cleanup);

const SAID: [module: Record<string, unknown>, where: string, said: Record<string, string>][] = [
  [
    page,
    'body',
    {
      Pods: 'web-1',
      Loading: 'Loading pods',
      Arriving: 'Loading pods',
      Forbidden: 'pods cannot be had: Forbidden',
      AnAddonsColumn: '1.27',
      ColumnsSettings: 'ReplicaSet/web-7d4b9',
      ConditionTips: 'api-0',
    },
  ],
  [navigation, 'body', { Tabs: 'Deployments', SideMenu: 'Deployments' }],
  [overview, 'body', { InTrouble: 'CrashLoopBackOff', Healthy: 'Every Node is Ready, every workload Available.', WithAddons: 'Flux · in sync' }],
  [statuses, 'body', { Looks: 'CrashLoopBackOff' }],
  [appearance, 'body', { Light: 'web-2', ATheme: 'web-1', InPolish: 'Przestrzeń nazw' }],
  [
    view,
    '.uk-modal',
    {
      AnyKind: 'LeaderElection',
      CustomResource: 'Applied revision: main@sha1:4f2a9c1',
      AnyKindAndAnAddon: "An addon's section",
      BeingDeleted: 'Deletion requested',
      NoEvents: 'web-7d4b9',
      Loading: 'Loading Pod web-1',
      Gone: 'There is no Pod web-1',
      Refused: 'pods cannot be had: Forbidden',
      OneTab: 'Pod web-1 shop',
    },
  ],
  [
    byKind,
    '.uk-modal',
    {
      PodRunning: 'init 1',
      PodCrashing: 'sidecarCrashLoopBackOff',
      PodPending: 'Unschedulable',
      PodAndAnAddon: 'managed',
      DeploymentRolling: 'coredns-6d8f9c7b5',
      DeploymentScaledToZero: 'worker-6c9f',
      DeploymentStuck: 'ProgressDeadlineExceeded',
      ReplicaSetNow: 'coredns-75c7b7f4-b9mgn',
      ReplicaSetOld: 'Scaled to zero (replicas: 0)',
      StatefulSetRunning: 'ReadWriteOnce',
      DaemonSetRunning: 'node-exporter-x9fp',
      DaemonSetNowhere: 'No pods',
      ServiceClusterIP: 'Not ready',
      ServiceNoEndpoints: 'No ready endpoints',
      ServiceNodePort: '30432',
      ServiceExternalName: 'ExternalName',
      NodeReady: '5 of 110',
      NodeNotReady: 'NodeStatusUnknown',
      JobComplete: 'backup-29012340-zq7nh',
      JobFailed: 'BackoffLimitExceeded',
      CronJobScheduled: 'backup-29010900',
      CronJobSuspended: 'Suspended',
      ConfigMapWithKeys: 'Corefile',
      ConfigMapEmpty: 'No data.',
      SecretWithKeys: 'Hidden',
      IngressRouting: 'shop-tls',
      NetworkPolicyRules: 'IP block',
      NetworkPolicyDenyAll: 'All ingress traffic denied',
      ClusterRoleRules: 'All verbs',
      RoleBindingSubjects: 'jane@acme.io',
      ServiceAccountUsed: 'ghcr-pull',
      ClaimBound: 'pvc-8f1c2e',
      ClaimPending: 'Pending: not bound to a volume.',
      VolumeBound: 'Node affinity',
      StorageClassFull: 'Allowed topologies',
      StorageClassPlain: 'No parameters',
      AutoscalerMetrics: 'target 70%',
      BudgetBlocking: 'InsufficientPods',
      NamespaceQuota: '46 of 50',
      NamespaceFree: 'No resource quota',
      DaemonSetNotEverywhere: 'Untolerated taint dedicated=gpu:NoSchedule',
      NodeCordoned: 'Cordoned',
      SecretTls: 'ECDSA P-256',
      SecretPull: 'acme-bot',
      ClusterRoleAggregated: 'flux-view',
      IngressClassDefault: 'traefik.io/ingress-controller',
      PriorityClassCritical: 'coredns-75c7b7f4-b9mgn',
      EndpointSliceOfService: '10.42.0.9',
      ResourceQuotaUsed: '46 of 50',
      LimitRangeDefaults: 'storagePersistentVolumeClaim',
      CustomResourceDefinitionFlux: '2 Kustomization',
      APIServiceDown: 'FailedDiscoveryCheck',
      WebhookBlocking: 'Fail',
      CertificateRequestPending: 'CN=system:node:kube-3',
      EventItself: 'Back-off restarting failed container metrics-proxy',
    },
  ],
];

describe('the core’s stories', () => {
  for (const [module, where, said] of SAID) {
    const title = (module.default as { title: string }).title;
    for (const [name, Story] of Object.entries(module).filter(([n]) => n !== 'default')) {
      it(`${title}: ${name} draws`, async () => {
        render(h(Story as FunctionComponent, null));
        expect(said[name], `${name}: what it says`).toBeDefined();
        await waitFor(() => expect(document.querySelector(where)?.textContent).toContain(said[name]));
      });
    }
  }
});
