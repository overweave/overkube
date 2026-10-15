import type { Meta, StoryObj } from '@storybook/preact-vite';
import { useState } from 'preact/hooks';
import { Segmented } from './Segmented';

type Layout = 'right' | 'center' | 'full';

function Layouts() {
  const [value, setValue] = useState<Layout>('right');
  return (
    <Segmented
      label="Layout"
      value={value}
      onChange={setValue}
      options={[
        { value: 'right', label: 'Side panel', icon: 'panel-right' },
        { value: 'center', label: 'Window', icon: 'window' },
        { value: 'full', label: 'Full screen', icon: 'maximize' },
      ]}
    />
  );
}

const meta = { title: 'Actions/Segmented', component: Layouts } satisfies Meta<typeof Layouts>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A view's layout, chosen by icons. */
export const Icons: Story = {};
