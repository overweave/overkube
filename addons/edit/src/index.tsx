import { defineAddon, lazySetup } from '@overkube/sdk';

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

export default defineAddon({
  id: 'edit',
  title: 'Edit',
  description: 'Changing the cluster from the page, as kubectl does: Edit YAML (its schema, the server’s dry run), Delete (--cascade), scale, rollout restart, cordon, drain.',
  setup: lazySetup(() => import('./setup.tsx')),
});
