import { type KubeObject, kinds } from '@overkube/kube-types';
import { action, defineAddon, slots } from '@overkube/sdk';
import { fill, usePage, useSay } from '@overkube/sdk/preact';
import { Button } from '@overkube/uikit';
import { askedSignal, askOf } from './asked.ts';
import { Dialogs } from './dialogs.tsx';
import { editIn } from './links.ts';
import { editLockedBy, lockedBy } from './managed.ts';
import { SCALED, Scale, scaleAction } from './scale.tsx';
import { T } from './texts.ts';

/*
 * Edit: changing the cluster from the page, as kubectl does — in an
 * object's view, its replicas (kubectl scale), Restart (kubectl rollout
 * restart), Edit YAML (kubectl edit: its schema, the server's dry run, a
 * replace at the version read), Delete (its dependents, --cascade); a
 * node's Cordon, Uncordon, Drain (the Eviction API, its budgets); in the
 * header, Apply YAML (kubectl apply --server-side, any objects). Each
 * shown to one who may (its verb on the kind); what Flux or Helm manages,
 * locked — its tip saying by what (a change here, undone by it); what a
 * controller keeps (a ReplicaSet's pod), its YAML not edited here (deleted
 * still: made anew, as kubectl delete pod restarts it). Its
 * dialogs over the page as everything opened is laid out.
 *
 *   managed.ts   what manages an object        scale.tsx      replicas in the footer
 *   edit-yaml.tsx  Edit YAML                   delete.tsx     Delete
 *   drain.tsx    Drain                         dialogs.tsx    the dialog asked for
 *   apply.tsx    Apply YAML                    links.ts       the dialog in the page's path
 *
 * Off until turned on (an addon): the page reads, it does not write, till then.
 */

const { Node } = kinds.core.v1;
const { Deployment, StatefulSet, DaemonSet } = kinds.apps.v1;
const RESTARTED = [Deployment, StatefulSet, DaemonSet];

/** The header's Apply YAML: its dialog asked for in the page's path. */
function ApplyButton() {
  const page = usePage();
  const say = useSay();
  return (
    <Button icon="file-text" onClick={() => page.navigate(editIn(page.path.peek(), { what: 'apply' }))}>
      {say(T.apply.open)}
    </Button>
  );
}

const unschedulable = (o: KubeObject) => !!(o as { spec?: { unschedulable?: boolean } }).spec?.unschedulable;

export default defineAddon({
  id: 'edit',
  title: 'Edit',
  description: 'Changing the cluster from the page, as kubectl does: Edit YAML (its schema, the server’s dry run), Delete (--cascade), scale, rollout restart, cordon, drain.',
  setup({ contributor: c, cluster }) {
    c.add('Messages', 'en:edit', { messages: {} }, { fallback: true });
    const asked = askedSignal();
    c.add('Fill', 'edit.dialogs', fill(slots.overlay, { render: () => <Dialogs asked={asked} cluster={cluster} /> }));
    // Apply YAML: in the header, before its search.
    c.add('Fill', 'edit.header.apply', fill(slots.header.end, { order: 50, render: ApplyButton }));
    // A workload's replicas, first in its footer — what it needs said by an Action of its own (the access layer's): never a button
    // (its when), its stepper asking its access.
    for (const k of SCALED)
      c.add('Action', scaleAction(k), action({ kinds: [k], title: T.scale.replicas, order: 0, needs: [{ verb: 'patch' }], when: () => false, run: () => undefined }));
    c.add(
      'Fill',
      'edit.scale',
      fill(slots.resource.view.footer, { order: 10, when: (p) => SCALED.some((k) => k.id === p.kind.id), render: (p) => <Scale {...p} cluster={cluster} /> }),
    );
    for (const k of RESTARTED)
      c.add(
        'Action',
        `edit.${k.plural}.restart`,
        action({
          kinds: [k],
          title: T.actions.restart,
          icon: 'refresh',
          order: 100,
          needs: [{ verb: 'patch' }],
          // As kubectl rollout restart: its pod template annotated, its pods replaced as its strategy says.
          run: (o) =>
            cluster.patch(k, o, { type: 'merge', patch: { spec: { template: { metadata: { annotations: { 'kubectl.kubernetes.io/restartedAt': new Date().toISOString() } } } } } }),
        }),
      );
    const patchNode = (o: KubeObject, on: boolean) => cluster.patch(Node, o, { type: 'merge', patch: { spec: { unschedulable: on ? true : null } } });
    c.add(
      'Action',
      'edit.nodes.cordon',
      action({ kinds: [Node], title: T.actions.cordon, icon: 'pause', order: 100, needs: [{ verb: 'patch' }], when: (o) => !unschedulable(o), run: (o) => patchNode(o, true) }),
    );
    c.add(
      'Action',
      'edit.nodes.uncordon',
      action({ kinds: [Node], title: T.actions.uncordon, icon: 'run', order: 100, needs: [{ verb: 'patch' }], when: unschedulable, run: (o) => patchNode(o, false) }),
    );
    c.add(
      'Action',
      'edit.nodes.drain',
      action({
        kinds: [Node],
        title: T.actions.drain,
        icon: 'way-out',
        order: 110,
        needs: [{ verb: 'patch' }, { verb: 'create', group: '', resource: 'pods', subresource: 'eviction' }],
        run: (o, kind) => {
          asked.value = askOf('drain', o, kind);
        },
      }),
    );
    // Every kind's: its YAML edited, it deleted.
    c.add(
      'Action',
      'edit.edit',
      action({
        title: T.actions.edit,
        icon: 'file-text',
        order: 900,
        needs: [{ verb: 'update' }],
        locked: editLockedBy,
        run: (o, kind) => {
          asked.value = askOf('yaml', o, kind);
        },
      }),
    );
    c.add(
      'Action',
      'edit.delete',
      action({
        title: T.actions.delete,
        icon: 'trash',
        order: 990,
        needs: [{ verb: 'delete' }],
        locked: lockedBy,
        run: (o, kind) => {
          asked.value = askOf('delete', o, kind);
        },
      }),
    );
  },
});
