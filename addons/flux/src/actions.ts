import type { KindInfo, KubeObject } from '@overkube/kube-types';
import { action, type Cluster, type KubeContributor } from '@overkube/sdk';
import { APPLIERS, byName, FLUX, type Ref, sourceRefOf } from './kinds.ts';
import { T } from './texts.ts';

/*
 * What the flux CLI does to them, done as it does it: Reconcile — its
 * reconcile.fluxcd.io/requestedAt annotation set to now (its controller
 * reconciles it at once, not at its interval); with source — its source's
 * first (flux reconcile --with-source); Suspend, Resume — spec.suspend set,
 * removed. Each a merge patch, shown to one who may patch it (its source
 * too, with source).
 */

const REQUESTED = 'reconcile.fluxcd.io/requestedAt';

const suspended = (o: KubeObject) => !!(o as { spec?: { suspend?: boolean } }).spec?.suspend;
const patching = (k: KindInfo) => [{ verb: 'patch' as const, group: k.group, resource: k.plural }];

function reconcile(cluster: Cluster, k: KindInfo, o: KubeObject) {
  return cluster.patch(k, o, { type: 'merge', patch: { metadata: { annotations: { [REQUESTED]: new Date().toISOString() } } } });
}

/** What it is reconciled with (flux reconcile --with-source): its source; a HelmRelease's of a chart template, the HelmChart Flux makes of it (<namespace>-<name>, in its source's namespace). */
function reconciledWith(o: KubeObject): { kind: KindInfo; object: KubeObject } | undefined {
  const namespace = o.metadata?.namespace ?? '';
  const template = (o as { spec?: { chart?: { spec?: { sourceRef?: Ref } } } }).spec?.chart?.spec?.sourceRef;
  const r: Ref | undefined = template
    ? { kind: 'HelmChart', name: `${namespace}-${o.metadata?.name}`, ...(template.namespace ? { namespace: template.namespace } : {}) }
    : sourceRefOf(o);
  const kind = r && byName(r.kind);
  return kind && r ? { kind, object: { metadata: { name: r.name, namespace: r.namespace ?? namespace } } } : undefined;
}

export function addActions(c: KubeContributor, cluster: Cluster): void {
  for (const k of FLUX) {
    const needs = patching(k);
    c.add('Action', `flux.${k.plural}.reconcile`, action({ kinds: [k], title: T.actions.reconcile, icon: 'refresh', order: 10, needs, run: (o) => reconcile(cluster, k, o) }));
    if (APPLIERS.includes(k))
      c.add(
        'Action',
        `flux.${k.plural}.reconcile-with-source`,
        action({
          kinds: [k],
          title: T.actions.withSource,
          icon: 'refresh',
          order: 20,
          needs,
          when: (o) => !!reconciledWith(o),
          run: async (o) => {
            const source = reconciledWith(o);
            if (source) await reconcile(cluster, source.kind, source.object);
            return reconcile(cluster, k, o);
          },
        }),
      );
    c.add(
      'Action',
      `flux.${k.plural}.suspend`,
      action({
        kinds: [k],
        title: T.actions.suspend,
        icon: 'pause',
        order: 30,
        needs,
        when: (o) => !suspended(o),
        run: (o) => cluster.patch(k, o, { type: 'merge', patch: { spec: { suspend: true } } }),
      }),
    );
    c.add(
      'Action',
      `flux.${k.plural}.resume`,
      action({
        kinds: [k],
        title: T.actions.resume,
        icon: 'run',
        order: 30,
        needs,
        when: suspended,
        // As flux resume: no longer suspended, and reconciled at once.
        run: (o) => cluster.patch(k, o, { type: 'merge', patch: { spec: { suspend: false }, metadata: { annotations: { [REQUESTED]: new Date().toISOString() } } } }),
      }),
    );
  }
}
