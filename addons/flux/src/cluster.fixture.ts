import { type KindInfo, kinds } from '@overkube/kube-types';
import type { FakeCluster } from '@overkube/testkit';
import { Bucket, ExternalArtifact, GitRepository, HelmChart, HelmRelease, HelmRepository, Kustomization, OCIRepository } from './kinds.ts';

/*
 * A cluster the Flux addon's tests and stories draw: Flux's objects as its
 * controllers leave them (their Ready conditions; a source's artifact; a
 * Kustomization's applied and attempted revisions, its inventory — a kind
 * of the whole cluster's entry too) — a Git
 * source fetched, one failing (its last artifact still served: legacy
 * applies it, suspended), an OCI one, Helm repositories (default, oci), a
 * HelmChart of a GitRepository, a bucket that is not there, an external
 * artifact; Kustomizations applied, reconciling (a newer revision on its
 * way), failed (a path not in its source), suspended; HelmReleases
 * installed, upgrading, failed (its history: the failed attempt over the
 * deployed one); of another namespace's source (a Kustomization; a
 * HelmRelease whose HelmChart is its HelmRepository's namespace's); their
 * CRDs, their columns. What they applied (Flux's labels on it; a
 * HelmRelease's, helm's annotations too), as a deployment runs it (its
 * replica set, its pod: their owner references, the pod's
 * pod-template-hash; a stateful set's pod) — beside a deployment made by
 * hand.
 */

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

type Cond = [ready: 'True' | 'False' | 'Unknown', reason: string, message: string, since: number];
const OK = (message: string, since = 5 * MIN): Cond => ['True', 'Succeeded', message, since];

export function fluxCluster(c: FakeCluster, now = Date.now()) {
  const { Namespace, Pod, ConfigMap, Service } = kinds.core.v1;
  const { Deployment, ReplicaSet } = kinds.apps.v1;
  const at = (ago: number) => new Date(now - ago).toISOString();
  const made = at(3 * DAY);
  const put = (k: KindInfo, o: Record<string, unknown>) => c.add(k, { apiVersion: k.group ? `${k.group}/${k.version}` : k.version, kind: k.kind, ...o } as never);
  for (const ns of ['flux-system', 'seed-flux', 'seed-net']) put(Namespace, { metadata: { name: ns } });

  // Their CRDs, their columns as Flux's say them (kubectl get's: Ready, Status — its message —, a source's URL…).
  const ready = '.status.conditions[?(@.type=="Ready")]';
  const COLUMN: Record<string, [string, string, string]> = {
    URL: ['URL', 'string', '.spec.url'],
    Endpoint: ['Endpoint', 'string', '.spec.endpoint'],
    Chart: ['Chart', 'string', '.spec.chart'],
    Version: ['Version', 'string', '.spec.version'],
    'Source Kind': ['Source Kind', 'string', '.spec.sourceRef.kind'],
    'Source Name': ['Source Name', 'string', '.spec.sourceRef.name'],
    Source: ['Source', 'string', '.spec.sourceRef.name'],
    Age: ['Age', 'date', '.metadata.creationTimestamp'],
    Ready: ['Ready', 'string', `${ready}.status`],
    Status: ['Status', 'string', `${ready}.message`],
  };
  const CRD_COLUMNS: [KindInfo, string[]][] = [
    [GitRepository, ['URL', 'Age', 'Ready', 'Status']],
    [OCIRepository, ['URL', 'Ready', 'Status', 'Age']],
    [HelmRepository, ['URL', 'Age', 'Ready', 'Status']],
    [HelmChart, ['Chart', 'Version', 'Source Kind', 'Source Name', 'Age', 'Ready', 'Status']],
    [Bucket, ['Endpoint', 'Age', 'Ready', 'Status']],
    [ExternalArtifact, ['Age', 'Ready', 'Status', 'Source']],
    [Kustomization, ['Age', 'Ready', 'Status']],
    [HelmRelease, ['Age', 'Ready', 'Status']],
  ];
  for (const [k, columns] of CRD_COLUMNS)
    put(kinds.apiextensions.v1.CustomResourceDefinition, {
      metadata: { name: `${k.plural}.${k.group}` },
      spec: {
        group: k.group,
        scope: 'Namespaced',
        names: { kind: k.kind, plural: k.plural },
        versions: [
          {
            name: k.version,
            served: true,
            storage: true,
            additionalPrinterColumns: columns.map((c) => COLUMN[c]).map(([name, type, jsonPath] = ['', '', '']) => ({ name, type, jsonPath })),
          },
        ],
      },
    });

  const conditions = ([status, reason, message, since]: Cond) => [
    { type: 'Ready', status, reason, message, lastTransitionTime: at(since) },
    ...(status === 'Unknown' ? [{ type: 'Reconciling', status: 'True', reason: 'Progressing', message, lastTransitionTime: at(since) }] : []),
  ];
  const obj = (k: KindInfo, name: string, namespace: string, spec: Record<string, unknown>, cond: Cond, status: Record<string, unknown> = {}) =>
    put(k, { metadata: { name, namespace, creationTimestamp: made, generation: 1 }, spec, status: { conditions: conditions(cond), ...status } });
  const artifact = (revision: string, fetched: number) => ({ artifact: { revision, lastUpdateTime: at(fetched), digest: 'sha256:0f1e2d3c', size: 2048 } });

  // ── Sources ──
  obj(
    GitRepository,
    'seed',
    'seed-flux',
    { url: 'ssh://git@git.seed-flux.svc.cluster.local/srv/git/seed.git', ref: { branch: 'main' }, interval: '1m', secretRef: { name: 'flux-git' } },
    OK("stored artifact for revision 'main@sha1:5bec00da24'", MIN),
    artifact('main@sha1:5bec00da24', MIN),
  );
  obj(
    GitRepository,
    'infra',
    'flux-system',
    { url: 'ssh://git@github.com/acme/infra', ref: { branch: 'main' }, interval: '5m' },
    [
      'False',
      'GitOperationFailed',
      "failed to checkout and determine revision: unable to clone 'ssh://git@github.com/acme/infra': ssh: handshake failed: knownhosts: key mismatch",
      12 * MIN,
    ],
    artifact('main@sha1:1a2b3c4d5e', 2 * DAY),
  );
  obj(
    OCIRepository,
    'apps',
    'seed-flux',
    { url: 'oci://registry.seed-flux:5000/apps', ref: { semver: '^1.4' }, interval: '5m' },
    OK("stored artifact for digest '1.4.2@sha256:9f1c2e7'"),
    artifact('1.4.2@sha256:9f1c2e7', 5 * MIN),
  );
  obj(
    HelmRepository,
    'bitnami',
    'flux-system',
    { url: 'https://charts.bitnami.com/bitnami', interval: '1h' },
    OK("stored artifact: revision 'sha256:2f3a9b1'", 10 * MIN),
    artifact('sha256:2f3a9b1', 10 * MIN),
  );
  obj(HelmRepository, 'podinfo', 'flux-system', { type: 'oci', url: 'oci://ghcr.io/stefanprodan/charts', interval: '1h' }, OK('Helm repository is Ready', DAY));
  obj(
    HelmChart,
    'seed-flux-hello-chart',
    'seed-flux',
    { chart: './charts/hello', sourceRef: { kind: 'GitRepository', name: 'seed' }, version: '*', interval: '5m' },
    OK("packaged 'hello' chart with version '0.1.0'", MIN),
    artifact('0.1.0', MIN),
  );
  obj(
    HelmChart,
    'flux-system-podinfo',
    'flux-system',
    { chart: 'podinfo', sourceRef: { kind: 'HelmRepository', name: 'podinfo' }, version: '6.x', interval: '10m' },
    OK("pulled 'podinfo' chart with version '6.9.2'", 8 * MIN),
    artifact('6.9.2', 8 * MIN),
  );
  obj(
    HelmChart,
    'seed-net-ingress',
    'flux-system',
    { chart: 'nginx-ingress-controller', sourceRef: { kind: 'HelmRepository', name: 'bitnami' }, version: '11.x', interval: '10m' },
    OK("pulled 'nginx-ingress-controller' chart with version '11.6.3'", MIN),
    artifact('11.6.3', MIN),
  );
  obj(Bucket, 'backups', 'flux-system', { provider: 'generic', endpoint: 'minio.storage:9000', bucketName: 'manifests', interval: '5m' }, [
    'False',
    'BucketOperationFailed',
    "bucket 'manifests' does not exist",
    4 * MIN,
  ]);
  obj(
    ExternalArtifact,
    'bundle',
    'flux-system',
    { sourceRef: { apiVersion: 'source.extensions.fluxcd.io/v1beta1', kind: 'ArtifactGenerator', name: 'bundle' } },
    OK('Artifact is ready', 2 * MIN),
    artifact('sha256:77ad410', 2 * MIN),
  );

  // ── What applies them ──
  const inventory = (...ids: string[]) => ({ inventory: { entries: ids.map((id) => ({ id, v: 'v1' })) } });
  obj(
    Kustomization,
    'hello',
    'seed-flux',
    { sourceRef: { kind: 'GitRepository', name: 'seed' }, path: './hello', targetNamespace: 'seed-flux', prune: true, wait: true, interval: '5m' },
    OK('Applied revision: main@sha1:5bec00da24', MIN),
    {
      lastAppliedRevision: 'main@sha1:5bec00da24',
      lastAttemptedRevision: 'main@sha1:5bec00da24',
      ...inventory('seed-flux_hello-git__ConfigMap', 'seed-flux_hello-git_apps_Deployment', 'seed-flux_db_apps_StatefulSet', '_seed-flux__Namespace'),
    },
  );
  obj(
    Kustomization,
    'apps',
    'seed-flux',
    { sourceRef: { kind: 'OCIRepository', name: 'apps' }, path: './', prune: true, wait: true, interval: '10m', timeout: '5m' },
    ['Unknown', 'Progressing', 'Health check: waiting for Deployment/seed-flux/web (1/2 updated)', 20_000],
    {
      lastAppliedRevision: '1.4.1@sha256:0c8e1aa',
      lastAttemptedRevision: '1.4.2@sha256:9f1c2e7',
      ...inventory('seed-flux_web_apps_Deployment', 'seed-flux_web__Service', 'seed-flux_gone__ConfigMap'),
    },
  );
  obj(
    Kustomization,
    'broken',
    'seed-flux',
    { sourceRef: { kind: 'GitRepository', name: 'seed' }, path: './not-there', prune: true, interval: '5m' },
    ['False', 'ArtifactFailed', 'kustomization path not found: stat /tmp/kustomization-350302138/not-there: no such file or directory', 3 * MIN],
    { lastAttemptedRevision: 'main@sha1:5bec00da24' },
  );
  obj(
    Kustomization,
    'legacy',
    'flux-system',
    { sourceRef: { kind: 'GitRepository', name: 'infra' }, path: './legacy', suspend: true, prune: true, interval: '10m' },
    OK('Applied revision: main@sha1:1a2b3c4d5e', 2 * DAY),
    { lastAppliedRevision: 'main@sha1:1a2b3c4d5e', lastAttemptedRevision: 'main@sha1:1a2b3c4d5e' },
  );
  // Of another namespace's source.
  obj(
    Kustomization,
    'net',
    'seed-net',
    { sourceRef: { kind: 'GitRepository', name: 'seed', namespace: 'seed-flux' }, path: './net', prune: true, interval: '5m' },
    OK('Applied revision: main@sha1:5bec00da24', MIN),
    { lastAppliedRevision: 'main@sha1:5bec00da24', lastAttemptedRevision: 'main@sha1:5bec00da24' },
  );
  // Its chart's HelmChart made in its HelmRepository's namespace (flux-system: <namespace>-<name>), not its own.
  obj(
    HelmRelease,
    'ingress',
    'seed-net',
    { chart: { spec: { chart: 'nginx-ingress-controller', version: '11.x', sourceRef: { kind: 'HelmRepository', name: 'bitnami', namespace: 'flux-system' } } }, interval: '10m' },
    OK('Helm upgrade succeeded for release seed-net/ingress.v4 with chart nginx-ingress-controller@11.6.3', MIN),
    { lastAttemptedRevision: '11.6.3', history: [{ chartVersion: '11.6.3', status: 'deployed', version: 4 }] },
  );
  obj(
    HelmRelease,
    'hello-chart',
    'seed-flux',
    { chart: { spec: { chart: './charts/hello', sourceRef: { kind: 'GitRepository', name: 'seed' } } }, interval: '5m', values: { message: 'delivered by flux' } },
    OK('Helm install succeeded for release seed-flux/hello-chart.v1 with chart hello@0.1.0', MIN),
    { lastAttemptedRevision: '0.1.0', history: [{ chartVersion: '0.1.0', status: 'deployed', version: 1 }] },
  );
  obj(
    HelmRelease,
    'podinfo',
    'flux-system',
    { chartRef: { kind: 'HelmChart', name: 'flux-system-podinfo' }, interval: '10m' },
    ['False', 'UpgradeFailed', 'Helm upgrade failed for release flux-system/podinfo with chart podinfo@6.9.2: context deadline exceeded', 7 * MIN],
    {
      lastAttemptedRevision: '6.9.2',
      history: [
        { chartVersion: '6.9.2', status: 'failed', version: 4 },
        { chartVersion: '6.9.1', status: 'deployed', version: 3 },
      ],
    },
  );

  // ── What they applied, and what it runs ──
  const byKustomization = (name: string) => ({ labels: { 'kustomize.toolkit.fluxcd.io/name': name, 'kustomize.toolkit.fluxcd.io/namespace': 'seed-flux' } });
  const byRelease = (name: string) => ({
    labels: { 'helm.toolkit.fluxcd.io/name': name, 'helm.toolkit.fluxcd.io/namespace': 'seed-flux', 'app.kubernetes.io/managed-by': 'Helm' },
    annotations: { 'meta.helm.sh/release-name': name, 'meta.helm.sh/release-namespace': 'seed-flux' },
  });
  const app = (name: string, meta: Record<string, unknown>, updated = 1) => {
    const hash = '5f9c6549b7';
    put(Deployment, {
      metadata: { name, namespace: 'seed-flux', uid: `${name}-d`, creationTimestamp: made, ...meta },
      spec: {
        replicas: 1,
        selector: { matchLabels: { app: name } },
        template: { metadata: { labels: { app: name } }, spec: { containers: [{ name: 'c', image: 'busybox:1.37' }] } },
      },
      status: { replicas: 1, readyReplicas: 1, availableReplicas: 1, updatedReplicas: updated, conditions: [{ type: 'Available', status: 'True' }] },
    });
    const owner = (kind: string, of: string, uid: string) => [{ apiVersion: 'apps/v1', kind, name: of, uid, controller: true }];
    put(ReplicaSet, {
      metadata: {
        name: `${name}-${hash}`,
        namespace: 'seed-flux',
        uid: `${name}-rs`,
        creationTimestamp: made,
        labels: { app: name, 'pod-template-hash': hash },
        ownerReferences: owner('Deployment', name, `${name}-d`),
      },
      spec: { replicas: 1, selector: { matchLabels: { app: name } } },
      status: { replicas: 1, readyReplicas: 1, availableReplicas: 1 },
    });
    put(Pod, {
      metadata: {
        name: `${name}-${hash}-rzrtz`,
        namespace: 'seed-flux',
        creationTimestamp: made,
        labels: { app: name, 'pod-template-hash': hash },
        ownerReferences: owner('ReplicaSet', `${name}-${hash}`, `${name}-rs`),
      },
      spec: { containers: [{ name: 'c', image: 'busybox:1.37' }] },
      status: {
        phase: 'Running',
        conditions: [{ type: 'Ready', status: 'True' }],
        containerStatuses: [{ name: 'c', ready: true, restartCount: 0, state: { running: { startedAt: made } } }],
      },
    });
  };
  app('hello-git', byKustomization('hello'));
  app('web', byKustomization('apps'), 0);
  app('hello-chart', byRelease('hello-chart'));
  app('by-hand', {});
  // A stateful set's pod: its stateful set's mark (its owner, no hash).
  const { StatefulSet } = kinds.apps.v1;
  put(StatefulSet, {
    metadata: { name: 'db', namespace: 'seed-flux', uid: 'db-s', creationTimestamp: made, ...byKustomization('hello') },
    spec: { replicas: 1, selector: { matchLabels: { app: 'db' } }, template: { spec: { containers: [{ name: 'c', image: 'busybox:1.37' }] } } },
    status: { replicas: 1, readyReplicas: 1, currentReplicas: 1, updatedReplicas: 1 },
  });
  put(Pod, {
    metadata: {
      name: 'db-0',
      namespace: 'seed-flux',
      creationTimestamp: made,
      labels: { app: 'db' },
      ownerReferences: [{ apiVersion: 'apps/v1', kind: 'StatefulSet', name: 'db', uid: 'db-s', controller: true }],
    },
    spec: { containers: [{ name: 'c', image: 'busybox:1.37' }] },
    status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] },
  });
  put(ConfigMap, { metadata: { name: 'hello-git', namespace: 'seed-flux', creationTimestamp: made, ...byKustomization('hello') }, data: { message: 'hello from git' } });
  put(Service, { metadata: { name: 'web', namespace: 'seed-flux', creationTimestamp: made, ...byKustomization('apps') }, spec: { ports: [{ port: 80 }] } });
}
