import core from '@overkube/addon-core';
import { KubeStory } from '@overkube/storybook/preact';
import { fluxCluster } from './cluster.fixture.ts';
import flux from './index.tsx';
import { FLUX } from './kinds.ts';

/*
 * The Flux addon on the page, over a cluster in memory: its kinds' tables
 * (sources, Kustomizations, HelmReleases); one opened (reconciling, its
 * source failing, its inventory; a source and what uses it); the start's
 * panel; what Flux applied marked (pods too) and Managed By.
 */

export default { title: 'flux/Flux addon', parameters: { controls: { disable: true } } };

const Page = ({ path }: { path: string }) => <KubeStory addons={[core, flux]} path={path} cluster={(c) => fluxCluster(c)} kinds={FLUX} />;
const K = 'kustomizations.v1.kustomize.toolkit.fluxcd.io';
const G = 'gitrepositories.v1.source.toolkit.fluxcd.io';

/** GitRepositories: their URL and ref, their artifact (one stale), what uses them. */
export const GitRepositories = () => <Page path={`/k/${G}`} />;
/** Kustomizations: their source, the revision applied → attempted, their state. */
export const Kustomizations = () => <Page path={`/k/${K}`} />;
/** HelmReleases: their chart, the revision applied → attempted. */
export const HelmReleases = () => <Page path="/k/helmreleases.v2.helm.toolkit.fluxcd.io" />;
/** A Kustomization reconciling: a newer revision on its way. */
export const Reconciling = () => <Page path={`/k/${K}?open=${K}/seed-flux/apps`} />;
/** One whose source fails: its last artifact still served. */
export const SourceFailing = () => <Page path={`/k/${K}?open=${K}/flux-system/legacy`} />;
/** Its inventory: each object it applied, as it is now. */
export const Inventory = () => <Page path={`/k/${K}?open=${K}/seed-flux/apps&open-tab=flux.inventory`} />;
/** A source opened: what uses it. */
export const UsedBy = () => <Page path={`/k/${G}?open=${G}/seed-flux/seed`} />;
/** The start: what is not Ready. */
export const Start = () => <Page path="/" />;
/** The pods' table: what Flux applied marked, by their deployments. */
export const Pods = () => <Page path="/k/pods.v1" />;
/** A pod opened: Managed By. */
export const ManagedBy = () => <Page path="/k/pods.v1?open=pods.v1/seed-flux/web-5f9c6549b7-rzrtz" />;
