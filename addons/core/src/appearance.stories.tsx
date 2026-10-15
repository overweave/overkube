import { defineAddon } from '@overkube/sdk';
import { KubeStory } from '@overkube/storybook/preact';
import core from './index.tsx';
import { shop } from './shop.fixture.tsx';

/* How the page looks and speaks: light, an addon's theme chosen by the user, a language pack. */

export default { title: 'core/Appearance' };

/** Light. */
export const Light = () => <KubeStory addons={[core]} path="/k/pods.v1" cluster={shop} theme="light" />;

/** An addon's theme, chosen by the user: the same page in its colours. */
const nord = defineAddon({
  id: 'nord',
  title: 'Nord',
  setup: ({ contributor }) =>
    void contributor.add('Theme', 'nord', {
      title: 'Nord',
      dark: { bg: '#2e3440', panel: '#3b4252', 'panel-2': '#434c5e', border: '#4c566a', text: '#eceff4', muted: '#a3abb9', accent: '#88c0d0', 'on-accent': '#2e3440' },
      light: { bg: '#eceff4', panel: '#e5e9f0', 'panel-2': '#d8dee9', border: '#c8d0dc', text: '#2e3440', muted: '#4c566a', accent: '#5e81ac', 'on-accent': '#eceff4' },
    }),
});
export const ATheme = () => <KubeStory addons={[core, nord]} path="/k/pods.v1" cluster={shop} theme="dark" user={(u) => u.patch('Appearance', 'default', { theme: 'nord' })} />;

/** A language pack (a few of the core's keys in Polish), the user's language set to it: the rest is said in English. */
const polish = defineAddon({
  id: 'lang-pl',
  title: 'Polski',
  setup: ({ contributor }) =>
    void contributor.add('Messages', 'pl:core', {
      messages: {
        'core.column.name': 'Nazwa',
        'core.column.namespace': 'Przestrzeń nazw',
        'core.column.age': 'Wiek',
        'core.nav.kinds': 'Rodzaje',
        'core.nav.picker.all': 'Wszystkie rodzaje',
      },
    }),
});
export const InPolish = () => <KubeStory addons={[core, polish]} path="/k/pods.v1" cluster={shop} locale="pl" />;

Light.storyName = 'Light';
ATheme.storyName = 'An addon’s theme';
InPolish.storyName = 'A language pack';
