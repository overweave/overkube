import type { Meta, StoryObj } from '@storybook/preact-vite';
import { hour } from './stories';
import { Usage } from './Usage';

/** A table's column of them: under its limit, near it, over it, none; with history and without — the lines in a row, whatever each number. */
function Column() {
  const cells = [
    <Usage key="a" value={412} unit="m" limit={500} history={hour(412, 'spike')} title="limit 500m" />,
    <Usage key="b" value={460} unit="Mi" limit={512} history={hour(460, 'rise')} title="limit 512Mi: near it" />,
    <Usage key="c" value={1240} unit="Mi" limit={1024} history={hour(1240, 'wave')} title="limit 1024Mi: over it" />,
    <Usage key="d" value={4} unit="m" history={hour(4, 'flat')} title="no limit" />,
    <Usage key="e" value={21} unit="Mi" limit={170} title="metrics-server alone: no history" />,
  ];
  return (
    <div class="uk-panel" style={{ width: '200px' }}>
      {cells.map((cell, i) => (
        <div key={i} style={{ padding: '8px 16px', borderBottom: '1px solid var(--uk-border)' }}>
          {cell}
        </div>
      ))}
    </div>
  );
}

const meta = { title: 'Data/Usage', component: Column } satisfies Meta<typeof Column>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Under its limit, near it, over it, none; with history and without. */
export const InAColumn: Story = {};
