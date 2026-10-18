import core from '@overkube/addon-core';
import { KubeStory } from '@overkube/storybook/preact';
import { helmCluster } from './cluster.fixture.ts';
import helm from './index.tsx';

/*
 * The Helm addon on the page, over a cluster in memory: its page; a
 * release opened (deployed, failed, stuck pending); the start's panel of
 * those not well; the Deployments' table, what helm made marked.
 */

export default { title: 'helm/Helm addon', parameters: { controls: { disable: true } } };

const Page = ({ path }: { path: string }) => <KubeStory addons={[core, helm]} path={path} cluster={(c) => helmCluster(c)} />;

/** The page: each release, its chart, its state — those not well first. */
export const Releases = () => <Page path="/helm" />;
/** A release opened: its state, its chart, what it made, its notes; its values, manifest, history. */
export const Release = () => <Page path="/helm?release=seed-helm%2Fhello" />;
/** A failed one: why, as helm said it. */
export const Failed = () => <Page path="/helm?release=seed-helm%2Fbroken" />;
/** One stuck pending: what that means, the rollback that undoes it. */
export const Pending = () => <Page path="/helm?release=seed-net%2Fingress" />;
/** The start: the releases not well. */
export const Start = () => <Page path="/" />;
/** The Deployments' table: what helm made, marked beside its name. */
export const Table = () => <Page path="/k/deployments.v1.apps" />;
