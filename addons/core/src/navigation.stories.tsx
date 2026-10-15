import { KubeStory } from '@overkube/storybook/preact';
import core from './index.tsx';
import { shop } from './shop.fixture.tsx';

/* The navigation, as the core draws it: its tabs across the top, or (the user's choice) a menu down the side. */

export default { title: 'core/Navigation' };

/** Across the top: the kinds pinned, the one shown. */
export const Tabs = () => <KubeStory addons={[core]} path="/k/deployments.v1.apps" cluster={shop} />;

/** Down the side, as the user chose: the same tabs in a rail. */
export const SideMenu = () => <KubeStory addons={[core]} path="/k/deployments.v1.apps" cluster={shop} user={(u) => u.patch('NavView', 'default', { mode: 'side' })} />;

Tabs.storyName = 'Tabs';
SideMenu.storyName = 'Side menu';
