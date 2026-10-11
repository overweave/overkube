import type { Meta, StoryObj } from '@storybook/preact-vite';
import { useState } from 'preact/hooks';
import { MultiSelect } from './MultiSelect';

const options = ['apps', 'media', 'kube-system'].map((n) => ({ value: n }));

const meta = {
  title: 'Forms/MultiSelect',
  component: MultiSelect,
  args: { label: 'Namespaces', all: 'All namespaces', icon: 'layers', options, value: [], onChange: () => {} },
} satisfies Meta<typeof MultiSelect>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Picking: Story = {
  render: (args) => {
    const [value, setValue] = useState<string[]>([...args.value]);
    return <MultiSelect {...args} value={value} onChange={setValue} />;
  },
};
