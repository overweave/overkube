import type { Meta, StoryObj } from '@storybook/preact-vite';
import { Lifetime, LifetimeCell } from './Lifetime';

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-18T09:00:00Z');
const at = (days: number) => NOW + days * DAY;

/** A lifetime whole, renewed as it should be; past its renewal; one nothing renews, ending; ended — and the same, small, in cells. */
function Lifetimes() {
  return (
    <div style={{ display: 'grid', gap: '28px', maxWidth: '520px' }}>
      <Lifetime
        from={at(-4)}
        renewal={at(56)}
        till={at(86)}
        now={NOW}
        marks={[
          { label: 'Not Before', date: '2026-10-14', when: '4d ago' },
          { label: 'Renewal Time', date: '2026-12-13', when: 'in 56d' },
          { label: 'Not After', date: '2027-01-12', when: 'in 86d' },
        ]}
      />
      <Lifetime
        from={at(-88)}
        renewal={at(-28)}
        till={at(2)}
        now={NOW}
        marks={[
          { label: 'Not Before', date: '2026-07-22', when: '88d ago' },
          { label: 'Renewal Time', date: '2026-09-20', when: '28d ago', level: 'warn' },
          { label: 'Not After', date: '2026-10-20', when: 'in 2d', level: 'error' },
        ]}
      />
      <Lifetime
        from={at(-356)}
        till={at(9)}
        now={NOW}
        level="warn"
        marks={[
          { label: 'Not Before', date: '2025-10-27', when: '356d ago' },
          { label: 'Not After', date: '2026-10-27', when: 'in 9d', level: 'warn' },
        ]}
      />
      <div style={{ display: 'grid', gap: '10px' }}>
        <LifetimeCell from={at(-4)} renewal={at(56)} till={at(86)} now={NOW} said="86d" />
        <LifetimeCell from={at(-88)} renewal={at(-28)} till={at(7)} now={NOW} level="warn" said="7d" />
        <LifetimeCell from={at(-120)} renewal={at(-60)} till={at(-30)} now={NOW} level="error" said="ended 30d ago" />
      </div>
    </div>
  );
}

const meta = { title: 'Data/Lifetime', component: Lifetimes } satisfies Meta<typeof Lifetimes>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Renewed as it should be, past its renewal, nothing renewing it, ended. */
export const States: Story = {};
