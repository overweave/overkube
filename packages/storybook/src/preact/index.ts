/**
 * The page in a story: <KubeStory addons={[core, mine]} path="/k/pods.v1"
 * cluster={(c) => c.add(Pod, make(Pod, …))} />. Objects are made with the
 * testkit's make.
 */

export { make } from '@overkube/testkit';
export { KubeStory, type KubeStoryProps } from './KubeStory.tsx';
