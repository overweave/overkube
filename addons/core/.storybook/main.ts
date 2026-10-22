import { storybook } from '@overkube/storybook';

// The core's stories, the other addons' and the kit's, in Storybook (make storybook): polled, as in Docker no file events cross the mount.
export default storybook({
  stories: [
    '../src/**/*.stories.tsx',
    '../../metrics/src/**/*.stories.tsx',
    '../../cert-manager/src/**/*.stories.tsx',
    '../../trivy/src/**/*.stories.tsx',
    '../../helm/src/**/*.stories.tsx',
    '../../flux/src/**/*.stories.tsx',
    '../../edit/src/**/*.stories.tsx',
    '../../../packages/uikit/src/**/*.stories.tsx',
  ],
  poll: true,
  cacheDir: '../../../node_modules/.vite/storybook-core',
});
