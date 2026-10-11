import type { Meta, StoryObj } from '@storybook/preact-vite';
import { useState } from 'preact/hooks';
import { Select } from './Select';

const options = ['apps', 'media', 'kube-system'].map((n) => ({ value: n, title: n }));

const meta = { title: 'Forms/Select', component: Select, args: { label: 'Namespace', options, value: 'media', onChange: () => {} } } satisfies Meta<typeof Select>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Picking: Story = {
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return <Select {...args} value={value} onChange={setValue} />;
  },
};

export const WithHints: Story = {
  args: { options: options.map((o, i) => ({ ...o, hint: String([12, 3, 41][i]) })) },
  render: Picking.render,
};

export const Empty: Story = {
  args: { value: undefined, placeholder: 'Pick a namespace' },
  render: Picking.render,
};

export const Long: Story = {
  args: { options: Array.from({ length: 40 }, (_, i) => ({ value: `ns-${i}`, title: `namespace-${i}` })), value: 'ns-25' },
  render: Picking.render,
};
