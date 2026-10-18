import type { KindInfo } from '@overkube/kube-types';
import { Ref } from '@overkube/uikit';
import { useDefinition } from '@overweave/ui/preact';
import { KindView } from '../kinds.ts';
import { closeIn, openIn } from '../links.ts';
import { useServedKinds } from './kinds.ts';
import { usePage } from './page.ts';

/*
 * Another object, wherever a view names one (its owner, its node, a volume's
 * claim): its kind's icon (its KindView's), its kind quiet, its name — a link
 * opening it over the page, where its kind is served (by its id: v1/Node,
 * apps/v1/ReplicaSet); not served, its name only. Its kind not said (quiet):
 * where what it is goes without saying (Runs on: a node). Said otherwise
 * (its label: a Challenge as its DNS name), it still opens it by its name;
 * its name in its tip, shown in full where it is cut.
 */
/**
 * A kind as a ref calls it: its name; a long one of Kubernetes' own
 * (PersistentVolumeClaim) its short name, as kubectl's (PVC) — another's
 * short name (CR: a CertificateRequest) says nothing to one who does not
 * know it, so never.
 */
const called = (id: string, kind: KindInfo | undefined) => {
  const name = id.split('/').at(-1) ?? id;
  const short = kind?.shortNames?.[0];
  const kubernetes = kind !== undefined && (!kind.group.includes('.') || kind.group.endsWith('.k8s.io'));
  return name.length > 14 && short && kubernetes ? short.toUpperCase() : name;
};

export function ObjectRef({ kind: id, name, namespace, quiet = false, label }: { kind: string; name: string; namespace?: string | undefined; quiet?: boolean; label?: string }) {
  const page = usePage();
  const { kinds } = useServedKinds();
  const kind: KindInfo | undefined = kinds.get(id);
  const icon = useDefinition(KindView, id)?.spec.icon ?? 'cube';
  const href = kind && page.href(openIn(closeIn(page.path.value), kind, { metadata: { name, ...(kind.namespaced && namespace ? { namespace } : {}) } }));
  return (
    <Ref icon={icon} title={name} {...(quiet ? {} : { kind: called(id, kind) })} {...(href ? { href } : {})}>
      {label ?? name}
    </Ref>
  );
}
