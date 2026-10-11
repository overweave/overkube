import type { Meta, StoryObj } from '@storybook/preact-vite';
import { toYaml } from '../lib/yaml';
import { Code } from './Code';

const meta = {
  title: 'Data/Code',
  component: Code,
  args: { children: toYaml({ apiVersion: 'v1', kind: 'ConfigMap', metadata: { name: 'settings' }, data: { mode: 'fast' } }) },
} satisfies Meta<typeof Code>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Yaml: Story = {};
