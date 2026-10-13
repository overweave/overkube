import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { Relations } from './Relations';

/* What a thing is related to, as one table: groups in the order given, each named once; a dot before a state only; none said only where it means something. */

afterEach(cleanup);

const item = (kind: string, name: string, state?: string, level?: 'ok' | 'warn') => ({ kind, name, href: `#${kind}/${name}`, state, level });

describe('Relations', () => {
  it('draws its groups in the order given, each named on its first row; a state after a dot; none said where it means something, else nothing', () => {
    const { container } = render(
      <Relations
        groups={[
          { label: 'Runs on', items: [item('Node', 'z-node', 'Ready', 'ok')] },
          { label: 'Config', items: [item('ConfigMap', 'b'), item('ConfigMap', 'a', 'env')] },
          { label: 'Selects', items: [], none: 'no pod matches' },
          { label: 'Budgets', items: [] },
        ]}
      />,
    );
    const rows = [...container.querySelectorAll('.uk-table-row')].map((r) => [...r.querySelectorAll('[role="cell"]')].map((c) => c.textContent));
    expect(rows).toEqual([
      ['Runs on', 'Node', 'z-node', 'Ready'],
      ['Config', 'ConfigMap', 'b', ''],
      ['', 'ConfigMap', 'a', 'env'],
      ['Selects', 'no pod matches', '', ''],
    ]);
    expect(container.querySelectorAll('.uk-relations-state .uk-dot')).toHaveLength(2);
    expect(container.querySelector('a[href="#Node/z-node"]')?.textContent).toBe('z-node');
  });
});
