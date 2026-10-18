import type { Meta, StoryObj } from '@storybook/preact-vite';
import { Sparkline } from './Sparkline';
import { hour, type Shape } from './stories';

const SHAPES: [Shape, string][] = [
  ['flat', 'steady'],
  ['rise', 'a leak'],
  ['spike', 'a spike'],
  ['wave', 'waves'],
];

/** Every shape an hour may take, drawn small; and larger, as a caller may ask. */
function Shapes() {
  return (
    <div style={{ display: 'grid', gap: '20px' }}>
      <div style={{ display: 'flex', gap: '28px' }}>
        {SHAPES.map(([shape, said]) => (
          <figure key={shape} style={{ margin: 0, display: 'grid', gap: '6px', color: 'var(--uk-muted)', fontSize: '12px' }}>
            <Sparkline points={hour(100, shape)} />
            {said}
          </figure>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '28px' }}>
        {SHAPES.map(([shape]) => (
          <Sparkline key={shape} points={hour(100, shape)} width={120} height={36} />
        ))}
      </div>
    </div>
  );
}

const meta = { title: 'Data/Sparkline', component: Shapes } satisfies Meta<typeof Shapes>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Steady, a leak, a spike, waves — small, and larger. */
export const AllShapes: Story = {};
