import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import { adoptStyles, FONT } from '@overkube/uikit';
import type { Decorator } from '@storybook/preact-vite';

/** A kit's story on the page's ground: its styles, its root (the addons' draw their own, KubeStory). */
const kit: Decorator = (Story, { title }) => {
  if (title.startsWith('core') || title.startsWith('metrics') || title.startsWith('cert-manager')) return <Story />;
  adoptStyles(document);
  return (
    <div class="uk-root" style={{ padding: '24px', minHeight: '100vh', background: 'var(--uk-bg)', fontFamily: FONT }}>
      <Story />
    </div>
  );
};

export default {
  decorators: [kit],
  parameters: {
    // No frame of Storybook's own: the core's draw a whole page, the kit's their ground (kit, above).
    layout: 'fullscreen',
    // The core's first, by where it is on the page: a kind's page, the navigation, a resource opened (any kind's, each kind's), states, how it looks;
    // its sketches last. Then the other addons', then the kit's. Said here as it is: Storybook reads it without running this file.
    options: {
      storySort: { order: ['core', ['Kind page', 'Navigation', 'Resource view', 'Resource view by kind', 'Statuses', 'Appearance', 'resource'], 'metrics', 'cert-manager'] },
    },
  },
};
