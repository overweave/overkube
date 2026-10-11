import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { NavList, type NavListGroup } from './NavList';

/* A side menu: its groups and links, the current one marked, one chosen. */

afterEach(cleanup);

const GROUPS: NavListGroup[] = [
  { key: 'w', title: 'Workloads', items: [{ key: 'pods', label: 'Pods', href: '#/k/pods.v1', extra: 3 }] },
  { key: 'c', title: 'Cluster', items: [{ key: 'nodes', label: 'Nodes', href: '#/k/nodes.v1', title: 'v1/Node' }] },
];

describe('NavList', () => {
  it('lists its groups, each entry a link; the current one marked', () => {
    const { container, getByRole } = render(<NavList label="Kinds" groups={GROUPS} current="nodes" />);
    expect(getByRole('navigation', { name: 'Kinds' })).toBeTruthy();
    expect([...container.querySelectorAll('.uk-navlist-group')].map((g) => g.textContent)).toEqual(['Workloads', 'Cluster']);
    expect(container.querySelector('a[href="#/k/pods.v1"]')?.textContent).toBe('Pods3');
    expect(container.querySelector('[aria-current="page"]')?.getAttribute('href')).toBe('#/k/nodes.v1');
  });

  it('tells which entry is chosen, when asked to', () => {
    const chosen: string[] = [];
    const { container } = render(
      <NavList
        label="Kinds"
        groups={GROUPS}
        onOpen={(item, e) => {
          e.preventDefault();
          chosen.push(item.key);
        }}
      />,
    );
    fireEvent.click(container.querySelector('a[href="#/k/nodes.v1"]') as Element);
    expect(chosen).toEqual(['nodes']);
  });
});
