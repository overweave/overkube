import { cleanup, render } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { TabBar } from './TabBar';

/* A view's tabs as a user has them: one tab stop, the one shown; a click or the arrows (Home, End) show another. */

afterEach(cleanup);

const TABS = [
  { key: 'overview', label: 'Overview', icon: 'grid' },
  { key: 'logs', label: 'Logs' },
  { key: 'yaml', label: 'YAML', icon: 'file' },
];

function bar(active?: string) {
  const chosen: string[] = [];
  const view = render(<TabBar tabs={TABS} active={active} onSelect={(k) => chosen.push(k)} label="Its parts" panel="p1" />);
  const tabs = [...view.container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  return { view, tabs, chosen };
}

describe('TabBar', () => {
  it('shows the one active (none, or not among them: the first) — the only tab stop, controlling the panel', () => {
    for (const [active, shown] of [
      ['logs', 1],
      [undefined, 0],
      ['gone', 0],
    ] as const) {
      const { tabs } = bar(active);
      expect(tabs.map((t) => [t.getAttribute('aria-selected'), t.tabIndex, t.getAttribute('aria-controls')])).toEqual(
        tabs.map((_, i) => (i === shown ? ['true', 0, 'p1'] : ['false', -1, null])),
      );
      cleanup();
    }
  });

  it('is named, each tab its icon and name', () => {
    const { view, tabs } = bar();
    expect(view.container.querySelector('[role="tablist"]')?.getAttribute('aria-label')).toBe('Its parts');
    expect(tabs.map((t) => [t.textContent, !!t.querySelector('.uk-icon')])).toEqual([
      ['Overview', true],
      ['Logs', false],
      ['YAML', true],
    ]);
  });

  it('shows another clicked, or by the arrows, Home and End (round at the ends), focus going with it', async () => {
    const user = userEvent.setup();
    const { tabs, chosen } = bar('overview');
    await user.click(tabs[1] as HTMLButtonElement);
    (tabs[0] as HTMLButtonElement).focus();
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(tabs[2]);
    await user.keyboard('{ArrowRight}{End}{Home}');
    expect(chosen).toEqual(['logs', 'yaml', 'logs', 'yaml', 'overview']);
  });
});
