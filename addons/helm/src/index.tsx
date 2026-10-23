import { defineAddon, lazySetup } from '@overkube/sdk';

/*
 * Helm: what helm deployed, as its releases' Secrets hold it (helm's own
 * storage, whoever ran helm — a person, a CI, a controller): its page, each
 * release (its chart, its state, its revision), one opened — its state and
 * why, what it made as it is now, the values given, the manifest applied,
 * its history (two revisions compared); the start's, the releases not
 * well; what helm made, marked beside its name in every table.
 *
 *   kinds.ts    the fields asked by           release.ts  a release's Secret decoded, its manifest read
 *   releases.ts the releases, revisions       page.tsx    the page;   view.tsx  a release opened
 *   overview.tsx the start's panel            mark.tsx    the tables' mark
 *
 * Reading them is reading Secrets (a view role cannot): off until turned on (an addon).
 */

export default defineAddon({
  id: 'helm',
  title: 'Helm',
  description: 'What helm deployed: each release’s chart, state, values, manifest and history; what helm made, marked in the tables.',
  setup: lazySetup(() => import('./setup.tsx')),
});
