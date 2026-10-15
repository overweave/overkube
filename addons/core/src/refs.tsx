import type { KindInfo } from '@overkube/kube-types';
import { closeIn, KindView, openIn } from '@overkube/sdk';
import { usePage, useServedKinds } from '@overkube/sdk/preact';
import { Ref } from '@overkube/uikit';
import { useDefinition } from '@overweave/ui/preact';

/*
 * Another object, wherever a view names one (its owner, its node, a volume's
 * claim): its kind's icon (its KindView's), its kind quiet, its name — a link
 * opening it over the page, where its kind is served (by its id: v1/Node,
 * apps/v1/ReplicaSet); not served, its name only. Its kind not said (quiet):
 * where what it is goes without saying (Runs on: a node).
 */
/** A kind as a ref calls it: its name; a long one (PersistentVolumeClaim) its short name, as kubectl's (PVC). */
const called = (id: string, kind: KindInfo | undefined) => {
  const name = id.split('/').at(-1) ?? id;
  const short = kind?.shortNames?.[0];
  return name.length > 14 && short ? short.toUpperCase() : name;
};

export function ObjectRef({ kind: id, name, namespace, quiet = false }: { kind: string; name: string; namespace?: string | undefined; quiet?: boolean }) {
  const page = usePage();
  const { kinds } = useServedKinds();
  const kind: KindInfo | undefined = kinds.get(id);
  const icon = useDefinition(KindView, id)?.spec.icon ?? 'cube';
  const href = kind && page.href(openIn(closeIn(page.path.value), kind, { metadata: { name, ...(kind.namespaced && namespace ? { namespace } : {}) } }));
  return (
    <Ref icon={icon} {...(quiet ? {} : { kind: called(id, kind) })} {...(href ? { href } : {})}>
      {name}
    </Ref>
  );
}
