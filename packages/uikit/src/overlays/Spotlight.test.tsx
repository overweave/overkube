import { cleanup, fireEvent, render, waitFor } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { useState } from 'preact/hooks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Spotlight, type SpotlightItem, type SpotlightProps } from './Spotlight';

/*
 * The search panel as a user has it (user-event): the field, the results
 * and the active one, choosing, closing; rows marked as coming in.
 */

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ITEMS: SpotlightItem[] = [
  { key: 'pods', title: 'Pods', subtitle: 'Kind', icon: 'cube', group: 'Kinds', attrs: { 'data-def': 'SearchProvider/kinds' } },
  { key: 'nodes', title: 'Nodes', subtitle: 'Kind', group: 'Kinds' },
  { key: 'overview', title: 'Overview', subtitle: 'Page', group: 'Pages' },
];

function mount(props: Partial<SpotlightProps> = {}) {
  const told: string[] = [];
  const view = render(
    <Spotlight
      label="Search"
      resultsLabel="Results"
      placeholder="Kinds, pages…"
      query=""
      onQuery={(q) => told.push(`query ${q}`)}
      items={ITEMS}
      onChoose={(item) => told.push(`choose ${item.key}`)}
      onClose={() => told.push('close')}
      {...props}
    />,
  );
  const field = () => view.getByRole('combobox', { name: 'Search' }) as HTMLInputElement;
  const active = () =>
    view
      .queryAllByRole('option')
      .find((o) => o.getAttribute('aria-selected') === 'true')
      ?.getAttribute('data-key');
  return { ...view, told, field, active, user: userEvent.setup(), dialog: () => view.container.querySelector('dialog') as HTMLDialogElement };
}

describe('Spotlight: opening', () => {
  it('is a dialog named as it is given, open, the field focused', () => {
    const { dialog, field } = mount();
    expect(dialog().getAttribute('aria-label')).toBe('Search');
    expect(dialog().open || dialog().hasAttribute('open')).toBe(true);
    expect(document.activeElement).toBe(field());
    expect(field().getAttribute('placeholder')).toBe('Kinds, pages…');
  });

  it('gives focus back where it was once gone', () => {
    const before = document.createElement('button');
    document.body.append(before);
    before.focus();
    const { unmount } = mount();
    unmount();
    expect(document.activeElement).toBe(before);
    before.remove();
  });
});

describe('Spotlight: the field and its results', () => {
  it('is a combobox over its listbox, the active result said', () => {
    const { field, getByRole } = mount();
    const list = getByRole('listbox', { name: 'Results' });
    expect(field().getAttribute('aria-controls')).toBe(list.id);
    expect(field().getAttribute('aria-expanded')).toBe('true');
    expect(field().getAttribute('aria-activedescendant')).toBe(getByRole('option', { name: /Pods/ }).id);
  });

  it('tells what is typed', async () => {
    const { field, user, told } = mount();
    await user.type(field(), 'po');
    expect(told).toEqual(['query p', 'query po']);
  });

  it('shows the results by group, each group named once, with what they are given', () => {
    const { container, getAllByRole } = mount();
    expect([...container.querySelectorAll('.uk-spot-group')].map((g) => g.textContent)).toEqual(['Kinds', 'Pages']);
    expect(getAllByRole('option').map((o) => `${o.querySelector('.uk-spot-title')?.textContent}/${o.querySelector('.uk-spot-subtitle')?.textContent}`)).toEqual([
      'Pods/Kind',
      'Nodes/Kind',
      'Overview/Page',
    ]);
    expect(getAllByRole('option')[0].getAttribute('data-def')).toBe('SearchProvider/kinds');
  });

  it('says it is searching', () => {
    expect(mount({ busy: true }).container.querySelector('.uk-spot-field')?.hasAttribute('data-busy')).toBe(true);
    cleanup();
    expect(mount().container.querySelector('.uk-spot-field')?.hasAttribute('data-busy')).toBe(false);
  });

  it('says a query found nothing — once nothing is being searched, and not for no query', () => {
    expect(mount({ query: 'zzz', items: [], empty: 'Nothing for zzz' }).container.querySelector('.uk-spot-empty')?.textContent).toBe('Nothing for zzz');
    cleanup();
    expect(mount({ query: 'zzz', items: [], empty: 'Nothing', busy: true }).container.querySelector('.uk-spot-empty')).toBeNull();
    cleanup();
    expect(mount({ query: ' ', items: [], empty: 'Nothing' }).container.querySelector('.uk-spot-empty')).toBeNull();
  });

  it('shows what it is given under the results', () => {
    expect(mount({ footer: <span>↵ to open</span> }).container.querySelector('.uk-spot-footer')?.textContent).toBe('↵ to open');
  });
});

describe('Spotlight: the active one', () => {
  it('moves by the arrows (not past the ends), Home and End', async () => {
    const { field, user, active } = mount();
    field().focus();
    expect(active()).toBe('pods');
    await user.keyboard('{ArrowUp}');
    expect(active()).toBe('pods');
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
    expect(active()).toBe('overview');
    await user.keyboard('{Home}');
    expect(active()).toBe('pods');
    await user.keyboard('{End}');
    expect(active()).toBe('overview');
  });

  it('moves under the pointer', async () => {
    const { getByRole, user, active } = mount();
    await user.hover(getByRole('option', { name: /Nodes/ }));
    expect(active()).toBe('nodes');
  });

  it('is the first again on a new search', async () => {
    function Searching() {
      const [items, setItems] = useState(ITEMS);
      return (
        <>
          <button type="button" onClick={() => setItems([ITEMS[2], ITEMS[0]])}>
            search
          </button>
          <Spotlight label="Search" query="" onQuery={() => {}} items={items} onChoose={() => {}} onClose={() => {}} />
        </>
      );
    }
    const view = render(<Searching />);
    const active = () =>
      view
        .getAllByRole('option')
        .find((o) => o.getAttribute('aria-selected') === 'true')
        ?.getAttribute('data-key');
    fireEvent.keyDown(view.getByRole('combobox'), { key: 'End' });
    expect(active()).toBe('overview');
    fireEvent.click(view.getByRole('button', { name: 'search', hidden: true }));
    await waitFor(() => expect(active()).toBe('overview'));
    expect(view.getAllByRole('option')[0].getAttribute('data-key')).toBe('overview');
  });
});

describe('Spotlight: choosing', () => {
  it('chooses the active one by Enter, not while composing', async () => {
    const { field, user, told } = mount();
    field().focus();
    fireEvent.keyDown(field(), { key: 'Enter', isComposing: true });
    await user.keyboard('{ArrowDown}{Enter}');
    expect(told).toEqual(['choose nodes']);
  });

  it('chooses one by a click', async () => {
    const { getByRole, user, told } = mount();
    await user.click(getByRole('option', { name: /Overview/ }));
    expect(told).toEqual(['choose overview']);
  });

  it('chooses nothing by Enter with nothing found', () => {
    const { field, told } = mount({ items: [] });
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(told).toEqual([]);
  });
});

describe('Spotlight: closing', () => {
  it('fades by Escape (its dialog’s cancel), then is closed', async () => {
    const { dialog, told } = mount();
    const cancel = new Event('cancel', { cancelable: true });
    dialog().dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    await waitFor(() => expect(dialog().getAttribute('data-state')).toBe('closing'));
    expect(told).toEqual([]);
    await waitFor(() => expect(told).toEqual(['close']));
  });

  it('closes by a click beside the panel, not in it', async () => {
    const { dialog, field, told } = mount();
    fireEvent.click(field());
    fireEvent.click(dialog().querySelector('.uk-spot-panel') as Element);
    expect(told).toEqual([]);
    fireEvent.click(dialog());
    await waitFor(() => expect(told).toEqual(['close']));
  });

  it('closes once, however often it is asked', async () => {
    const { dialog, told } = mount();
    fireEvent.click(dialog());
    fireEvent.click(dialog());
    dialog().dispatchEvent(new Event('cancel', { cancelable: true }));
    await new Promise((r) => setTimeout(r, 250));
    expect(told).toEqual(['close']);
  });

  it('closes at once under prefers-reduced-motion', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce') }));
    const { dialog, told } = mount();
    fireEvent.click(dialog());
    await new Promise((r) => setTimeout(r, 5));
    expect(told).toEqual(['close']);
  });
});

describe('Spotlight: rows coming in', () => {
  it('marks those new to the list, one after another; not those still there', async () => {
    function Searching() {
      const [items, setItems] = useState(ITEMS.slice(0, 2));
      return (
        <>
          <button type="button" onClick={() => setItems([ITEMS[0], ITEMS[2]])}>
            search
          </button>
          <Spotlight label="Search" query="" onQuery={() => {}} items={items} onChoose={() => {}} onClose={() => {}} />
        </>
      );
    }
    const view = render(<Searching />);
    const marks = () => view.getAllByRole('option').map((o) => `${o.getAttribute('data-key')}:${o.hasAttribute('data-enter') ? o.style.getPropertyValue('--uk-spot-i') : '-'}`);
    // At first, all of them (the group's name first in line).
    expect(marks()).toEqual(['pods:1', 'nodes:2']);
    // A while later: none.
    await new Promise((r) => setTimeout(r, 650));
    fireEvent.click(view.getByRole('button', { name: 'search', hidden: true }));
    // Pods still there; Overview (and its group's name) new.
    expect(marks()).toEqual(['pods:-', 'overview:1']);
  });
});
