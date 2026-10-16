import { defineAddon } from '@overkube/sdk';
import { KubeStory } from '@overkube/storybook/preact';
import core from './index.tsx';
import { shop } from './shop.fixture.tsx';

/* The settings page (/settings, the gear at the header's end): the themes there are, a language pack's language, what the user changed. */

export default { title: 'core/Settings' };

/** Another theme and a language pack: each one to choose. */
const more = defineAddon({
  id: 'more',
  title: 'More',
  setup({ contributor }) {
    contributor.add('Theme', 'nord', {
      title: 'Nord',
      dark: { bg: '#2e3440', panel: '#3b4252', 'panel-2': '#434c5e', border: '#4c566a', text: '#eceff4', muted: '#a3abb9', accent: '#88c0d0', 'on-accent': '#2e3440' },
      light: { bg: '#eceff4', panel: '#e5e9f0', 'panel-2': '#d8dee9', border: '#c8d0dc', text: '#2e3440', muted: '#4c566a', accent: '#5e81ac', 'on-accent': '#eceff4' },
    });
    contributor.add('Messages', 'pl:core', { messages: { 'core.page.settings.title': 'Ustawienia' } });
  },
});

export const Settings = () => <KubeStory addons={[core, more]} path="/settings" cluster={shop} />;

/** Some changed: each listed, to take back. */
export const Changed = () => (
  <KubeStory
    addons={[core, more]}
    path="/settings"
    cluster={shop}
    user={(u) => {
      u.patch('Appearance', 'default', { theme: 'nord' });
      u.patch('NavView', 'default', { mode: 'side', side: 'pinned' });
    }}
  />
);

/** An addon failing: said in its line, started again by its button. */
export const AddonFailing = () => (
  <KubeStory
    addons={[core, more]}
    path="/settings"
    cluster={shop}
    states={{ more: { state: 'crashloop', reason: 'tried again in 8s', restarts: 3, errors: 3, error: "TypeError: Cannot read properties of undefined (reading 'tokens')" } }}
  />
);
