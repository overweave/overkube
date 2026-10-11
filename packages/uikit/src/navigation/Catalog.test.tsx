import { cleanup, fireEvent, render } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { Catalog, type CatalogGroup, type CatalogItem, type CatalogProps } from './Catalog';

/*
 * The catalog as a user has it (user-event): the filter, the groups and
 * their rows, opening one, its toggle, the arrows.
 */

afterEach(cleanup);

const GROUPS: CatalogGroup[] = [
  {
    key: 'workloads',
    title: 'Workloads',
    attrs: { 'data-def': 'Category/workloads' },
    items: [
      { key: 'pods', label: 'Pods', href: '#/kind/v1/Pod', extra: 25, on: true, attrs: { 'data-def': 'KindView/pods' } },
      { key: 'jobs', label: 'Jobs', extra: 0, muted: true },
    ],
  },
  { key: 'network', title: 'Network', items: [{ key: 'services', label: 'Services', title: 'v1/Service', extra: 12 }] },
];

function mount(props: Partial<CatalogProps> = {}) {
  const told: string[] = [];
  const view = render(
    <Catalog
      groups={GROUPS}
      query=""
      onQuery={(q) => told.push(`query ${q}`)}
      placeholder="Filter kinds"
      empty="No kind matches"
      onOpen={(item: CatalogItem) => told.push(`open ${item.key}`)}
      onToggle={(item, on) => told.push(`${on ? 'pin' : 'unpin'} ${item.key}`)}
      toggleLabel={(item) => `${item.on ? 'Unpin' : 'Pin'} ${item.label}`}
      {...props}
    />,
  );
  const name = (label: string) => [...view.container.querySelectorAll<HTMLElement>('.uk-catalog-name')].find((n) => n.textContent === label) as HTMLElement;
  return { ...view, told, user: userEvent.setup(), name, filter: () => view.getByRole('textbox', { name: 'Filter kinds' }) as HTMLInputElement };
}

describe('Catalog: what it shows', () => {
  it('shows the groups, titled, their rows in order with what they are given', () => {
    const { container, getByRole } = mount();
    expect([...container.querySelectorAll('.uk-catalog-group h4')].map((h) => h.textContent)).toEqual(['Workloads', 'Network']);
    expect(getByRole('region', { name: 'Workloads' })).toBeTruthy();
    expect([...container.querySelectorAll('.uk-catalog-row')].map((r) => r.textContent)).toEqual(['Pods25', 'Jobs0', 'Services12']);
  });

  it('draws an empty one quieter, a pinned one marked', () => {
    const { container } = mount();
    const rows = [...container.querySelectorAll('.uk-catalog-row')];
    expect(rows.map((r) => [r.hasAttribute('data-muted'), r.hasAttribute('data-on')])).toEqual([
      [false, true],
      [true, false],
      [false, false],
    ]);
  });

  it('puts what it is given on a group and a name (marks of where they come from), and a tooltip', () => {
    const { container, name } = mount();
    expect(container.querySelector('.uk-catalog-group')?.getAttribute('data-def')).toBe('Category/workloads');
    expect(name('Pods').getAttribute('data-def')).toBe('KindView/pods');
    expect(name('Services').getAttribute('title')).toBe('v1/Service');
    expect(name('Pods').getAttribute('href')).toBe('#/kind/v1/Pod');
  });

  it('says what it is given with no group', () => {
    expect(mount({ groups: [] }).container.querySelector('.uk-catalog-empty')?.textContent).toBe('No kind matches');
  });

  it('shows what it is given beside the filter', () => {
    expect(mount({ aside: <button type="button">hide empty</button> }).getByRole('button', { name: 'hide empty' })).toBeTruthy();
  });
});

describe('Catalog: the filter', () => {
  it('tells what is typed, and marks it in the names', async () => {
    const { filter, user, told } = mount();
    expect(filter().getAttribute('placeholder')).toBe('Filter kinds');
    await user.type(filter(), 'po');
    // The page holds the query; the field as typed.
    expect(told).toEqual(['query p', 'query po']);
    cleanup();
    const marked = mount({ query: 'po' });
    expect(marked.name('Pods').querySelector('mark')?.textContent).toBe('Po');
  });
});

describe('Catalog: opening one', () => {
  it('opens one by a click on its name', async () => {
    const { name, user, told } = mount();
    await user.click(name('Services'));
    expect(told).toEqual(['open services']);
  });

  it('opens one by Enter on its name', async () => {
    const { name, user, told } = mount();
    name('Pods').focus();
    await user.keyboard('{Enter}');
    expect(told).toEqual(['open pods']);
  });

  it('leaves a click for a new tab or window to the browser', () => {
    const { name, told } = mount();
    fireEvent.click(name('Pods'), { metaKey: true });
    fireEvent.click(name('Pods'), { ctrlKey: true });
    fireEvent.click(name('Pods'), { shiftKey: true });
    expect(told).toEqual([]);
  });

  it('keeps a name with nowhere to go from going anywhere', () => {
    const { name } = mount();
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    name('Services').dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
  });
});

describe('Catalog: the toggle', () => {
  it('says whether it is on, named as it is given, and turns it on or off', async () => {
    const { getByRole, user, told } = mount();
    const pods = getByRole('button', { name: 'Unpin Pods' });
    expect(pods.getAttribute('aria-pressed')).toBe('true');
    expect(getByRole('button', { name: 'Pin Jobs' }).getAttribute('aria-pressed')).toBe('false');
    await user.click(pods);
    await user.click(getByRole('button', { name: 'Pin Jobs' }));
    expect(told).toEqual(['unpin pods', 'pin jobs']);
  });

  it('has none with nobody to tell', () => {
    expect(mount({ onToggle: undefined }).container.querySelector('.uk-catalog-toggle')).toBeNull();
  });
});

describe('Catalog: the arrows', () => {
  it('go from the filter down to the first name, then name to name across the groups (round)', async () => {
    const { filter, name, user } = mount();
    filter().focus();
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(filter());
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(name('Pods'));
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(document.activeElement).toBe(name('Services'));
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(name('Pods'));
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(name('Services'));
  });
});
