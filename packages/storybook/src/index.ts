/**
 * overkube's addons in Storybook — its .storybook/main.ts:
 * `export default storybook({ stories: [<its stories' globs>] })`
 * (overweave's, with overkube's packages read from their sources in its
 * workspace). A story draws the page: '@overkube/storybook/preact'
 * (KubeStory). What a story shows — its addons, its cluster's objects and
 * states, the user's changes — is its author's.
 */

import { storybook as overweave, type StorybookConfig, type StorybookOptions } from '@overweave/storybook';

export type { StorybookConfig, StorybookOptions };

/** Storybook's config: overweave's (its panel: the addons turned off and on, who says what), overkube's sources read as the page reads them. */
export function storybook(options: StorybookOptions): StorybookConfig {
  return overweave({ ...options, conditions: ['overkube-source', 'overweave-source', ...(options.conditions ?? [])] });
}
