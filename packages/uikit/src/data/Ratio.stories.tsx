import type { Meta, StoryObj } from '@storybook/preact-vite';
import { useEffect, useState } from 'preact/hooks';
import { Ratio } from './Ratio';

const PARTS: [number, number][] = [
  [0, 0],
  [0, 3],
  [1, 3],
  [2, 3],
  [3, 3],
  [4, 3],
  [1, 1],
  [7, 10],
  [99, 100],
  [12, 48],
];

/** Every sort of part, as a table's column has them; one below filling as it changes. */
function Column() {
  const [ready, setReady] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setReady((r) => (r + 1) % 5), 900);
    return () => clearInterval(t);
  }, []);
  return (
    <div class="uk-panel" style={{ width: '200px' }}>
      {[...PARTS, [ready, 4] as [number, number]].map(([value, of], i) => (
        <div key={i} style={{ padding: '8px 16px', borderBottom: '1px solid var(--uk-border)' }}>
          <Ratio value={value} of={of} />
        </div>
      ))}
    </div>
  );
}

const meta = { title: 'Data/Ratio', component: Column } satisfies Meta<typeof Column>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Every sort of part. */
export const Parts: Story = {};
