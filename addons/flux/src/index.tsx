import { defineAddon, lazySetup } from '@overkube/sdk';

/*
 * Flux: its kinds under Delivery, each its own table (no page of its own):
 * its sources (Git, OCI, Helm repositories, Helm charts, buckets, external
 * artifacts) — their URL and ref, their artifact, what uses them; its
 * Kustomizations and HelmReleases — their source, the revision applied
 * against the one attempted, Flux's words; their state as Flux leaves it.
 * One opened: its source as it is, what uses a source, a Kustomization's
 * inventory. Reconcile, Reconcile with source, Suspend, Resume — each
 * shown to one who may. The start's, what is not Ready; what Flux applied,
 * marked beside its name in every table (its pods too), and in its view.
 * Its maps (an object's Map tab): a source, what uses it, what they applied.
 *
 *   kinds.ts     its kinds, the fields asked by      state.tsx    a state, a revision drawn
 *   columns.tsx  its tables                          view.tsx     one opened: its source, what uses it, its inventory
 *   actions.ts   Reconcile, Suspend, Resume          overview.tsx the start's panel
 *   mark.tsx     the tables' mark, Managed By        map.tsx      its maps: a source's, an applier's
 *
 * Off until turned on (an addon): suggested where Flux is served.
 */

/** Flux's sources' group (kinds.ts': not imported here — its module in the setup's chunk). */
const SOURCE_GROUP = 'source.toolkit.fluxcd.io';

export default defineAddon({
  id: 'flux',
  title: 'Flux',
  description: 'Flux’s sources, Kustomizations and HelmReleases: their state, the revision applied, what each manages; Reconcile, Suspend, Resume.',
  requires: { served: SOURCE_GROUP },
  answers: [{ title: 'Flux', when: { served: SOURCE_GROUP } }],
  setup: lazySetup(() => import('./setup.tsx')),
});
