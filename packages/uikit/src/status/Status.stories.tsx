import type { Meta, StoryObj } from '@storybook/preact-vite';
import { Status, TONES, type Tone } from './Status';

const ICONS: Record<Tone, string> = {
  ok: 'circle-play',
  progress: 'spinner',
  waiting: 'circle-dashed',
  warn: 'octagon',
  error: 'crash-loop',
  done: 'circle-check',
  gone: 'trash',
  unknown: 'help',
};
const WORDS: Record<Tone, string> = {
  ok: 'Running',
  progress: 'ContainerCreating',
  waiting: 'Pending',
  warn: 'Evicted',
  error: 'CrashLoopBackOff',
  done: 'Completed',
  gone: 'Terminating',
  unknown: 'Unknown',
};

function Tones() {
  return (
    <div style={{ display: 'grid', gap: '10px' }}>
      {TONES.map((tone) => (
        <Status key={tone} tone={tone} icon={ICONS[tone]} title={tone}>
          {WORDS[tone]}
        </Status>
      ))}
    </div>
  );
}

const meta = { title: 'Status/Status', component: Tones } satisfies Meta<typeof Tones>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Every tone, as a pod's state says it. */
export const Every: Story = {};
