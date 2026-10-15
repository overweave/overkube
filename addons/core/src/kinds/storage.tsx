import { kinds, type ObjectOf } from '@overkube/kube-types';
import { type KubeContributor, kindRef, type ResourceProps, section } from '@overkube/sdk';
import { useCount, useSay } from '@overkube/sdk/preact';
import { Badge, KeyValue, Nothing, Section } from '@overkube/uikit';
import type { ComponentChildren } from 'preact';
import { ObjectRef } from '../refs.tsx';
import { RefusedQuietly, refused } from '../refused.tsx';
import { T } from '../texts.ts';
import { addRelated, said } from './shared.tsx';

/*
 * A claim's, a volume's and a storage class's own, in their views: a claim
 * not bound yet said so — bound, its volume, class and the pods that mount
 * it among what it is tied to; a volume's source (its sort, where it is:
 * a path, a server, a driver and handle; the nodes it may be used on), its
 * claim and class; a storage class's parameters (none: said so), mount
 * options, allowed topologies, how many claims are of it.
 */

const { PersistentVolumeClaim, PersistentVolume } = kinds.core.v1;
const { StorageClass } = kinds.storage.v1;
type ClaimObject = ObjectOf<typeof PersistentVolumeClaim>;
type VolumeObject = ObjectOf<typeof PersistentVolume>;
type ClassObject = ObjectOf<typeof StorageClass>;

const mono = (text: string | undefined) => (text ? <span class="uk-mono">{text}</span> : undefined);

/** A claim not bound yet (the core's section): said so — why, in its events and conditions. */
export function NotBound() {
  const say = useSay();
  const t = T.resource.view.storage;
  return (
    <Section title={say(t.volume)} part="volume">
      <Nothing icon="hourglass">{say(t.notBound)}</Nothing>
    </Section>
  );
}

/** Where a volume is (its source: the first of its spec's that says one): its sort, and its path, server, driver and handle as it has them. */
export function sourceOf(v: VolumeObject): [sort: string, rows: [keyof typeof T.resource.view.storage, string][]] {
  const s = v.spec ?? {};
  if (s.hostPath) return ['hostPath', [['path', s.hostPath.path]]];
  if (s.local) return ['local', [['path', s.local.path]]];
  if (s.nfs)
    return [
      'nfs',
      [
        ['server', s.nfs.server],
        ['path', s.nfs.path],
      ],
    ];
  if (s.csi)
    return [
      'csi',
      [
        ['driver', s.csi.driver],
        ['handle', s.csi.volumeHandle],
      ],
    ];
  const sort = Object.keys(s).find(
    (k) =>
      ![
        'accessModes',
        'capacity',
        'claimRef',
        'mountOptions',
        'nodeAffinity',
        'persistentVolumeReclaimPolicy',
        'storageClassName',
        'volumeMode',
        'volumeAttributesClassName',
      ].includes(k),
  );
  return [sort ?? '—', []];
}

/** A volume's source (the core's section): its sort, where it is, the nodes it may be used on. */
export function VolumeSource({ object }: ResourceProps) {
  const say = useSay();
  const t = T.resource.view.storage;
  const v = object as VolumeObject;
  const [sort, rows] = sourceOf(v);
  const nodes = (v.spec?.nodeAffinity?.required?.nodeSelectorTerms ?? []).map((term) => (term.matchExpressions ?? []).map(said).join(', ')).filter(Boolean);
  return (
    <Section title={say(t.source)} part="source">
      <KeyValue
        rows={[
          [say(t.type), sort],
          ...rows.map(([label, value]): [string, ComponentChildren] => [say(t[label]), mono(value)]),
          ...(nodes.length ? [[say(t.nodes), mono(nodes.join('; '))] as [string, ComponentChildren]] : []),
        ]}
      />
    </Section>
  );
}

/** A storage class's parameters (the core's section): each its name and value; none, said so. */
export function ClassParameters({ object }: ResourceProps) {
  const say = useSay();
  const t = T.resource.view.storage;
  const parameters = Object.entries((object as ClassObject).parameters ?? {}).sort(([a], [b]) => a.localeCompare(b));
  return (
    <Section title={say(t.parameters)} part="parameters">
      {parameters.length ? <KeyValue rows={parameters.map(([k, v]): [string, ComponentChildren] => [k, mono(v)])} /> : <Nothing icon="file">{say(t.noParameters)}</Nothing>}
    </Section>
  );
}

/** A storage class's mount options (the core's section, where it has them): each a badge. */
export function MountOptions({ object }: ResourceProps) {
  const say = useSay();
  return (
    <Section title={say(T.resource.view.storage.mountOptions)} part="mount">
      <span class="uk-badges">
        {((object as ClassObject).mountOptions ?? []).map((o) => (
          <Badge key={o}>{o}</Badge>
        ))}
      </span>
    </Section>
  );
}

/** A storage class's allowed topologies (the core's section, where it has them): each label and the values it may have. */
export function Topologies({ object }: ResourceProps) {
  const say = useSay();
  const terms = ((object as ClassObject).allowedTopologies ?? []).flatMap((term) => term.matchLabelExpressions ?? []);
  return (
    <Section title={say(T.resource.view.storage.topologies)} part="topology">
      <KeyValue rows={terms.map((e): [string, ComponentChildren] => [e.key, mono(e.values.join(', '))])} />
    </Section>
  );
}

/** How many claims are of a storage class (in every namespace allowed). */
function ClaimsOf({ name }: { name: string }) {
  const say = useSay();
  const count = useCount({ kind: kindRef(PersistentVolumeClaim), where: { field: '.spec.storageClassName', op: 'eq', value: name } });
  if (refused(count)) return <RefusedQuietly kind={PersistentVolumeClaim} error={count.error} />;
  return <>{count.total ? say(T.resource.view.storage.claimCount, { count: count.total.count }) : '—'}</>;
}

/** Claims', volumes' and storage classes' in the core's view: their sections; what each is bound to, of which class, used by. */
export function addStorage(c: KubeContributor): void {
  const t = T.resource.view.storage;
  const klass = (name: string | undefined): [ComponentChildren, string] | undefined =>
    name ? [<ObjectRef kind="storage.k8s.io/v1/StorageClass" name={name} quiet />, name] : undefined;
  c.add(
    'Fill',
    'core.resource.view.claim.volume',
    section({ kinds: [PersistentVolumeClaim], order: 10, when: ({ object }) => object.status?.phase === 'Pending', render: NotBound }),
  );
  addRelated<ClaimObject>(c, ['claim', PersistentVolumeClaim], 'volume', 100, t.boundTo, (o) =>
    o.spec?.volumeName ? [<ObjectRef kind="v1/PersistentVolume" name={o.spec.volumeName} quiet />, o.spec.volumeName] : undefined,
  );
  addRelated<ClaimObject>(c, ['claim', PersistentVolumeClaim], 'class', 200, t.class, (o) => klass(o.spec?.storageClassName));
  c.add('Fill', 'core.resource.view.volume.source', section({ kinds: [PersistentVolume], order: 10, render: VolumeSource }));
  addRelated<VolumeObject>(c, ['volume', PersistentVolume], 'claim', 100, t.claimedBy, (o) => {
    const ref = o.spec?.claimRef;
    return ref?.name ? [<ObjectRef kind="v1/PersistentVolumeClaim" name={ref.name} namespace={ref.namespace} />, `${ref.namespace ?? ''}/${ref.name}`] : undefined;
  });
  addRelated<VolumeObject>(c, ['volume', PersistentVolume], 'class', 200, t.class, (o) => klass(o.spec?.storageClassName));
  c.add('Fill', 'core.resource.view.class.parameters', section({ kinds: [StorageClass], order: 10, render: ClassParameters }));
  c.add(
    'Fill',
    'core.resource.view.class.mount',
    section({ kinds: [StorageClass], order: 20, when: ({ object }) => (object.mountOptions?.length ?? 0) > 0, render: MountOptions }),
  );
  c.add(
    'Fill',
    'core.resource.view.class.topology',
    section({ kinds: [StorageClass], order: 30, when: ({ object }) => (object.allowedTopologies?.length ?? 0) > 0, render: Topologies }),
  );
  addRelated<ClassObject>(c, ['class', StorageClass], 'claims', 100, t.claims, (o) => [<ClaimsOf name={o.metadata?.name ?? ''} />, '']);
}
