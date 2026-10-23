import type { Ctx } from '@overkube/sdk';
import { addActions } from './actions.ts';
import { addColumns } from './columns.tsx';
import { Bucket, ExternalArtifact, FIELDS, GitRepository, HelmChart, HelmRelease, HelmRepository, Kustomization, OCIRepository } from './kinds.ts';
import { addMap } from './map.tsx';
import { addMark } from './mark.tsx';
import { addOverview } from './overview.tsx';
import { addViews } from './view.tsx';

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

/** Its definitions (its own chunk: loaded once it is turned on). */
export default function setup({ contributor: c, cluster }: Ctx) {
  for (const [name, spec] of Object.entries(FIELDS)) c.add('Field', name, spec);
  c.add('Messages', 'en:flux', { messages: {} }, { fallback: true });
  for (const [i, [kind, title, icon]] of VIEWS.entries()) c.add('KindView', kind.id, { title, category: 'delivery', icon, order: 20 + i * 10 }, { fallback: true });
  addColumns(c);
  addViews(c);
  addActions(c, cluster);
  addOverview(c);
  addMark(c);
  addMap(c);
}
