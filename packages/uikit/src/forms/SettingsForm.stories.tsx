import type { Meta, StoryObj } from '@storybook/preact-vite';
import { useState } from 'preact/hooks';
import { SettingsForm } from './SettingsForm';

const meta = {
  title: 'Forms/SettingsForm',
  component: SettingsForm,
  args: {
    settings: {
      latest: { type: 'boolean', title: 'Warn of :latest', default: true },
      limit: { type: 'number', title: 'At most', default: 20 },
      note: { type: 'string', title: 'Note', default: '' },
    },
    values: {},
    onChange: () => {},
  },
} satisfies Meta<typeof SettingsForm>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Setting: Story = {
  render: (args) => {
    const [values, setValues] = useState<Record<string, unknown>>(args.values);
    return <SettingsForm {...args} values={values} onChange={(key, value) => setValues((v) => ({ ...v, [key]: value }))} />;
  },
};
