import { css } from '@overkube/uikit';
import type { Decorator } from '@storybook/preact-vite';

/** A kit's story on the page's ground: its styles, its root (the core's draw their own, KubeStory). */
const kit: Decorator = (Story, { title }) => {
  if (title.startsWith('core')) return <Story />;
  if (!document.getElementById('overkube-css')) document.head.appendChild(Object.assign(document.createElement('style'), { id: 'overkube-css', textContent: css }));
  return (
    <div class="uk-root" style={{ padding: '24px', minHeight: '100vh', background: 'var(--uk-bg)', fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      <Story />
    </div>
  );
};

export default {
  decorators: [kit],
  parameters: {
    // The core's first, by where it is on the page: a kind's page, the navigation, a resource opened (any kind's, each kind's), states, how it looks;
    // its sketches last. Then the kit's. Said here as it is: Storybook reads it without running this file.
    options: { storySort: { order: ['core', ['Kind page', 'Navigation', 'Resource view', 'Resource view by kind', 'Statuses', 'Appearance', 'resource']] } },
  },
};
