import type { Meta, StoryObj } from '@storybook/preact-vite';
import { useState } from 'preact/hooks';
import { Segmented } from '../actions/Segmented';
import { ago, hour } from './stories';
import { TimeChart } from './TimeChart';

const RANGES: Record<string, number> = { '15m': 15, '1h': 60, '6h': 360, '24h': 1440 };

/** A pod's charts over a range the user picks: pointed at, or stepped through by keys (Tab, arrows, Home, End; Escape lets go). */
function Pod() {
  const [range, setRange] = useState('1h');
  const minutes = RANGES[range];
  const when = (i: number) => ago(Math.round(((59 - i) / 59) * minutes));
  return (
    <div style={{ display: 'grid', gap: '16px', maxWidth: '760px', justifyItems: 'start' }}>
      <Segmented label="Range" value={range} onChange={setRange} options={Object.keys(RANGES).map((r) => ({ value: r, label: r }))} />
      <div class="uk-charts" style={{ justifySelf: 'stretch' }}>
        <TimeChart
          title="CPU"
          unit="m"
          points={hour(400, 'spike')}
          max={1000}
          start={ago(minutes)}
          end="now"
          when={when}
          marks={[
            { label: 'requests', value: 250, tone: 'info' },
            { label: 'limit', value: 500, tone: 'warn' },
          ]}
        />
        <TimeChart
          title="Memory"
          unit="Mi"
          points={hour(460, 'rise')}
          max={560}
          start={ago(minutes)}
          end="now"
          when={when}
          marks={[
            { label: 'requests', value: 256, tone: 'info' },
            { label: 'limit', value: 512, tone: 'warn' },
          ]}
        />
        <TimeChart title="Network in" unit=" KiB/s" points={hour(22, 'wave')} start={ago(minutes)} end="now" when={when} />
        <TimeChart title="Restarts" points={hour(3, 'flat').map(Math.round)} start={ago(minutes)} end="now" when={when} format={(v) => String(Math.round(v))} />
      </div>
    </div>
  );
}

const meta = { title: 'Data/TimeChart', component: Pod } satisfies Meta<typeof Pod>;
export default meta;
type Story = StoryObj<typeof meta>;

/** CPU and memory with their requests and limit, the network, restarts — over 15m to 24h. */
export const APodsCharts: Story = { name: 'A pod’s charts' };
