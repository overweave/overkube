import { defineAddon } from '@overkube/sdk';
import { addActions } from './actions.ts';
import { addColumns } from './columns.tsx';
import { Bucket, ExternalArtifact, FIELDS, GitRepository, HelmChart, HelmRelease, HelmRepository, Kustomization, OCIRepository, SOURCE_GROUP } from './kinds.ts';
import { addMark } from './mark.tsx';
import { addOverview } from './overview.tsx';
import { T } from './texts.ts';
import { addViews } from './view.tsx';

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
 *
 *   kinds.ts     its kinds, the fields asked by      state.tsx    a state, a revision drawn
 *   columns.tsx  its tables                          view.tsx     one opened: its source, what uses it, its inventory
 *   actions.ts   Reconcile, Suspend, Resume          overview.tsx the start's panel
 *   mark.tsx     the tables' mark, Managed By
 *
 * Off until turned on (an addon): suggested where Flux is served.
 */

/** Its kinds under Delivery: what applies first, then the sources; each its title (their plurals, as kubectl api-resources has them) and icon. */
const VIEWS = [
  [Kustomization, 'Kustomizations', 'layers'],
  [HelmRelease, 'HelmReleases', 'helm'],
  [GitRepository, 'GitRepositories', 'git'],
  [OCIRepository, 'OCIRepositories', 'cube'],
  [HelmRepository, 'HelmRepositories', 'books'],
  [HelmChart, 'HelmCharts', 'helm'],
  [Bucket, 'Buckets', 'bucket'],
  [ExternalArtifact, 'ExternalArtifacts', 'artifact'],
] as const;

export default defineAddon({
  id: 'flux',
  title: 'Flux',
  description: 'Flux’s sources, Kustomizations and HelmReleases: their state, the revision applied, what each manages; Reconcile, Suspend, Resume.',
  requires: { served: SOURCE_GROUP },
  answers: [{ title: 'Flux', when: { served: SOURCE_GROUP } }],
  setup({ contributor: c, cluster }) {
    for (const [name, spec] of Object.entries(FIELDS)) c.add('Field', name, spec);
    c.add('Messages', 'en:flux', { messages: {} }, { fallback: true });
    c.add('Category', 'delivery', { title: T.category, icon: 'rocket', order: 45 }, { fallback: true });
    for (const [i, [kind, title, icon]] of VIEWS.entries()) c.add('KindView', kind.id, { title, category: 'delivery', icon, order: 20 + i * 10 }, { fallback: true });
    addColumns(c);
    addViews(c);
    addActions(c, cluster);
    addOverview(c);
    addMark(c);
  },
});
