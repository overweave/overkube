import { kinds } from '@overkube/kube-types';
import { defineAddon, section, slots } from '@overkube/sdk';
import { KubeStory, make } from '@overkube/storybook/preact';
import { Badge, Button, Nothing, Section } from '@overkube/uikit';
import { fill, slotElement } from '@overweave/ui/preact';
import core from './index.tsx';
import type { StoryCluster } from './shop.fixture.tsx';

/*
 * A resource opened, as the core draws it for any kind: its title, tabs
 * (Overview, Events, YAML), summary, conditions, events, related, metadata;
 * where an addon puts its own in it; being deleted, no events; on its way,
 * gone, refused; the user's hiding its tabs. Each kind's own: core/Resource
 * view by kind.
 */

export default { title: 'core/Resource view' };

const { Pod, Namespace, Event } = kinds.core.v1;
const { CustomResourceDefinition } = kinds.apiextensions.v1;
const { ReplicaSet } = kinds.apps.v1;

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const started = ago(50);

const web = (extra: { metadata?: object } = {}) =>
  make(Pod, {
    metadata: {
      name: 'web-1',
      namespace: 'shop',
      uid: 'pod-web-1',
      labels: { app: 'web', 'pod-template-hash': '7d4b9' },
      ownerReferences: [{ apiVersion: 'apps/v1', kind: 'ReplicaSet', name: 'web-7d4b9', uid: 'rs-web', controller: true }],
      ...extra.metadata,
    },
    spec: { nodeName: 'node-1', containers: [{ name: 'web', image: 'nginx:1.27' }] },
    status: {
      phase: 'Running',
      podIPs: [{ ip: '10.42.0.12' }],
      containerStatuses: [{ name: 'web', image: 'nginx:1.27', imageID: '', ready: true, restartCount: 0, started: true, state: { running: { startedAt: started } } }],
      conditions: [
        { type: 'PodScheduled', status: 'True', lastTransitionTime: started },
        { type: 'Ready', status: 'False', reason: 'ContainersNotReady', message: 'containers with unready status: [web]', lastTransitionTime: ago(2) },
      ],
    },
  });

/** An event about the pod: its type, reason, message, how often, when last. */
const event = (name: string, type: string, reason: string, message: string, minutes: number, count = 1) =>
  make(Event, {
    metadata: { name, namespace: 'shop' },
    involvedObject: { kind: 'Pod', name: 'web-1', namespace: 'shop', uid: 'pod-web-1' },
    type,
    reason,
    message,
    count,
    lastTimestamp: ago(minutes),
  });

const shop =
  (pod = web(), events = true) =>
  (c: StoryCluster) => {
    c.add(Namespace, make(Namespace, { metadata: { name: 'shop' } }));
    c.add(ReplicaSet, make(ReplicaSet, { metadata: { name: 'web-7d4b9', namespace: 'shop', uid: 'rs-web' } }));
    c.add(Pod, pod);
    if (!events) return;
    c.add(Event, event('web-1.a', 'Normal', 'Scheduled', 'Successfully assigned shop/web-1 to node-1', 50));
    c.add(Event, event('web-1.b', 'Normal', 'Pulled', 'Container image "nginx:1.27" already present on machine', 49));
    c.add(Event, event('web-1.c', 'Warning', 'Unhealthy', 'Readiness probe failed: HTTP probe failed with statuscode: 503', 2, 14));
    c.add(Event, event('web-1.d', 'Normal', 'Started', 'Started container web', 49));
  };

const OPEN = '/k/pods.v1?open=pods.v1/shop/web-1';

const { Lease } = kinds.coordination.v1;
const { Node } = kinds.core.v1;

/** A kind the core knows nothing of but what every kind has (a Lease): its owner, an event, a label. */
const lease = (c: StoryCluster) => {
  c.add(Namespace, make(Namespace, { metadata: { name: 'kube-system' } }));
  c.add(Node, make(Node, { metadata: { name: 'kube', uid: 'node-kube' } }));
  c.add(
    Lease,
    make(Lease, {
      metadata: {
        name: 'kube-scheduler',
        namespace: 'kube-system',
        uid: 'lease-scheduler',
        labels: { tier: 'control-plane' },
        ownerReferences: [{ apiVersion: 'v1', kind: 'Node', name: 'kube', uid: 'node-kube' }],
      },
      spec: { holderIdentity: 'kube_4f1e9a', leaseDurationSeconds: 15, renewTime: ago(0) },
    }),
  );
  c.add(
    Event,
    make(Event, {
      metadata: { name: 'kube-scheduler.a', namespace: 'kube-system' },
      involvedObject: { kind: 'Lease', name: 'kube-scheduler', namespace: 'kube-system', uid: 'lease-scheduler' },
      type: 'Normal',
      reason: 'LeaderElection',
      message: 'kube_4f1e9a became leader',
      lastTimestamp: ago(60 * 24 * 3),
    }),
  );
};

/** Where an addon puts its own in any kind's view: a mark and a button in its header, a tab, a section, a related field. */
const places = defineAddon({
  id: 'places',
  title: 'An addon',
  setup: ({ contributor }) => {
    contributor.add('Fill', 'places.mark', fill(slots.resource.view.header, { render: () => <Badge>mark</Badge> }));
    contributor.add(
      'Fill',
      'places.action',
      fill(slots.resource.view.header, {
        render: () => (
          <Button variant="ghost" size="sm" icon="run">
            Action
          </Button>
        ),
      }),
    );
    contributor.add('ResourceTab', 'places.tab', { target: {}, title: 'Addon', icon: 'puzzle', order: 500 });
    contributor.add(
      'Fill',
      'places.tab',
      fill(slots.resource.view.tab('places.tab'), {
        render: () => (
          <Section title="An addon's tab">
            <Nothing icon="puzzle">Its own, between the core's tabs, as its order says.</Nothing>
          </Section>
        ),
      }),
    );
    contributor.add(
      'Fill',
      'places.section',
      section({
        title: "An addon's section",
        order: 50,
        render: () => (
          <Section title="An addon's section">
            <Nothing icon="puzzle">Before or after the core's, as its order says; for the kinds it is for.</Nothing>
          </Section>
        ),
      }),
    );
    contributor.add(
      'Fill',
      'places.related',
      fill(slots.resource.view.related, {
        render: (props) =>
          slotElement(slots.resource.view.related.field, { ...props, field: { name: 'places', label: 'An addon’s' }, value: 'its own', display: 'its own' }, { limit: 1 }),
      }),
    );
  },
});

/** A custom resource's kind (Flux's Kustomization): known by its CRD only — served beside the kinds the kinds table knows. */
const KUSTOMIZATION = {
  id: 'kustomize.toolkit.fluxcd.io/v1/Kustomization',
  group: 'kustomize.toolkit.fluxcd.io',
  version: 'v1',
  kind: 'Kustomization',
  plural: 'kustomizations',
  singular: 'kustomization',
  namespaced: true,
  verbs: ['get', 'list', 'watch', 'create', 'update', 'patch', 'delete'],
  shortNames: ['ks'],
} as const;

/** Its CRD (its printer columns: Ready, Status) and one of it, reconciled: Ready, its revision applied. */
const flux = (c: StoryCluster) => {
  c.add(Namespace, make(Namespace, { metadata: { name: 'flux-system' } }));
  c.add(
    CustomResourceDefinition,
    make(CustomResourceDefinition, {
      metadata: { name: 'kustomizations.kustomize.toolkit.fluxcd.io', uid: 'crd-ks', generation: 1 },
      spec: {
        group: 'kustomize.toolkit.fluxcd.io',
        scope: 'Namespaced',
        names: { plural: 'kustomizations', singular: 'kustomization', kind: 'Kustomization', shortNames: ['ks'] },
        versions: [
          {
            name: 'v1',
            served: true,
            storage: true,
            additionalPrinterColumns: [
              { name: 'Age', type: 'date', jsonPath: '.metadata.creationTimestamp' },
              { name: 'Ready', type: 'string', jsonPath: '.status.conditions[?(@.type=="Ready")].status' },
              { name: 'Status', type: 'string', jsonPath: '.status.conditions[?(@.type=="Ready")].message' },
            ],
          },
        ],
      },
    }),
  );
  c.add(KUSTOMIZATION, {
    apiVersion: 'kustomize.toolkit.fluxcd.io/v1',
    kind: 'Kustomization',
    metadata: { name: 'infrastructure', namespace: 'flux-system', uid: 'ks-infra', generation: 4, creationTimestamp: ago(40 * 24 * 60) },
    spec: { interval: '10m', path: './infrastructure', prune: true, sourceRef: { kind: 'GitRepository', name: 'flux-system' } },
    status: {
      observedGeneration: 4,
      lastAppliedRevision: 'main@sha1:4f2a9c1',
      conditions: [
        { type: 'Ready', status: 'True', reason: 'ReconciliationSucceeded', message: 'Applied revision: main@sha1:4f2a9c1', lastTransitionTime: ago(3), observedGeneration: 4 },
      ],
    },
  });
};

/** Any kind (a Lease: the core knows nothing of it but what every kind has): its summary (its kind's columns), conditions, recent events, related (its owner), metadata; Overview, Events, YAML. */
export const AnyKind = () => <KubeStory addons={[core]} path="/k/leases.v1.coordination.k8s.io?open=leases.v1.coordination.k8s.io/kube-system/kube-scheduler" cluster={lease} />;

/** A custom resource (known by its CRD only): its state as kstatus works it out, its CRD's columns as its summary, its conditions — the view any kind has. */
export const CustomResource = () => (
  <KubeStory
    addons={[core]}
    kinds={[KUSTOMIZATION]}
    path="/k/kustomizations.v1.kustomize.toolkit.fluxcd.io?open=kustomizations.v1.kustomize.toolkit.fluxcd.io/flux-system/infrastructure"
    cluster={flux}
  />
);

/** Any kind, with where an addon puts its own: a mark and a button in its header, a tab, a section, a related field. */
export const AnyKindAndAnAddon = () => (
  <KubeStory addons={[core, places]} path="/k/leases.v1.coordination.k8s.io?open=leases.v1.coordination.k8s.io/kube-system/kube-scheduler" cluster={lease} />
);

/** Being deleted: said first, over its summary — since when, waiting for what. */
export const BeingDeleted = () => <KubeStory addons={[core]} path={OPEN} cluster={shop(web({ metadata: { deletionTimestamp: started, finalizers: ['example.com/cleanup'] } }))} />;

/** Nothing said of it yet: no events — its Overview without them, its Events tab saying so. */
export const NoEvents = () => <KubeStory addons={[core]} path={OPEN} cluster={shop(web(), false)} />;

/** On its way: waiting, in its place. */
export const Loading = () => <KubeStory addons={[core]} path={OPEN} cluster={(c) => c.state(Pod, 'loading')} />;

/** Not there: said so. */
export const Gone = () => <KubeStory addons={[core]} path={OPEN} cluster={(c) => c.add(Namespace, make(Namespace, { metadata: { name: 'shop' } }))} />;

/** Refused by the cluster: said why. */
export const Refused = () => <KubeStory addons={[core]} path={OPEN} cluster={(c) => c.state(Pod, 'error', { status: 403, code: 'Forbidden', message: 'pods is forbidden' })} />;

/** One who may read pods, their namespaces and workloads only (no events, no logs): what they may not have is not there — the Events and Logs tabs, the kinds they may not list. */
const viewer = (c: StoryCluster) => {
  shop()(c);
  c.rules({ cluster: [{ verbs: ['get', 'list', 'watch'], apiGroups: ['', 'apps'], resources: ['pods', 'namespaces', 'deployments', 'replicasets', 'nodes'] }] });
};
export const Viewer = () => <KubeStory addons={[core]} path={OPEN} cluster={viewer} />;

/** The same, debugged: nothing hidden — what would be, marked (a red lock). */
export const ViewerMarked = () => <KubeStory addons={[core]} path={OPEN} cluster={viewer} access="mark" />;

/** The user's: the Events and YAML tabs hidden — one tab left, no tabs drawn. */
export const OneTab = () => (
  <KubeStory
    addons={[core]}
    path={OPEN}
    cluster={shop()}
    user={(u) => {
      u.patch('ResourceTab', 'core.events', { hidden: true });
      u.patch('ResourceTab', 'core.yaml', { hidden: true });
    }}
  />
);

AnyKind.storyName = 'Any kind';
Viewer.storyName = 'Viewer - no events, no logs';
ViewerMarked.storyName = 'Viewer - marked (debugging)';
CustomResource.storyName = 'Any kind - a custom resource';
AnyKindAndAnAddon.storyName = 'Any kind - an addon’s places';
BeingDeleted.storyName = 'Any kind - being deleted';
NoEvents.storyName = 'Any kind - no events';
OneTab.storyName = 'Any kind - one tab (the user’s)';
Loading.storyName = 'Not there - loading';
Gone.storyName = 'Not there - gone';
Refused.storyName = 'Not there - refused';
