import type { Meta, StoryObj } from '@storybook/preact-vite';
import { useState } from 'preact/hooks';
import { Status } from '../status/Status';
import { SEVERITIES, type Severity, SeverityFilter, SeverityMatrix, SeverityStatus, SeverityTally, SeverityTotals } from './Severity';

const WORDS = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low', unknown: 'Unknown' };
const NGINX = { critical: 9, high: 52, medium: 29, low: 6, unknown: 0 };

/** Each severity as a state (and its shield alone); counts in a line, totals; a matrix (one row being scanned); a filter. */
function Severities() {
  const [shown, setShown] = useState<ReadonlySet<Severity>>(new Set(SEVERITIES));
  return (
    <div style={{ display: 'grid', gap: '24px', maxWidth: '560px' }}>
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
        {SEVERITIES.map((s) => (
          <SeverityStatus key={s} severity={s}>
            {WORDS[s]}
          </SeverityStatus>
        ))}
        <SeverityStatus severity="high" title="High" />
      </div>
      <SeverityTally counts={NGINX} words={WORDS} />
      <SeverityTotals counts={{ critical: 17, high: 104, medium: 62, low: 12, unknown: 754 }} words={WORDS} />
      <SeverityMatrix
        words={WORDS}
        rows={[
          { key: 'nginx', mark: <SeverityStatus severity="critical" title="Critical" />, lead: <b>nginx</b>, under: 'library/nginx:1.19-alpine', counts: NGINX },
          { key: 'api', mark: <Status tone="progress" icon="spinner" />, lead: <b>api</b>, under: 'library/nginx:1.27-alpine', instead: <span class="uk-quiet">Scanning</span> },
        ]}
      />
      <SeverityFilter counts={NGINX} words={WORDS} shown={shown} onChange={setShown} />
    </div>
  );
}

const meta = { title: 'Data/Severity', component: Severities } satisfies Meta<typeof Severities>;
export default meta;
type Story = StoryObj<typeof meta>;

export const All: Story = {};
