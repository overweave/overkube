import { cleanup, render, waitFor } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { useState } from 'preact/hooks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Select } from './Select';

/*
 * The select as a user has it: the mouse and the keyboard (user-event), what
 * is read back is what the page shows and says (roles, names, ARIA states).
 */

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const OPTIONS = [
  { value: 'apps', title: 'apps', hint: '12' },
  { value: 'media', title: 'Media' },
  { value: 'mysql', title: 'mysql' },
  { value: 'kube-system', title: 'kube-system' },
  { value: 'kube-public', title: 'kube-public' },
  { value: 'nginx', title: 'nginx' },
];

/** A select that keeps what it is given, and every change it told. */
/** null: nothing picked. */
function mount(initial: string | null = 'mysql', extra: { placeholder?: string; options?: typeof OPTIONS } = {}) {
  const changes: string[] = [];
  function Picker() {
    const [value, setValue] = useState(initial ?? undefined);
    return (
      <Select
        label="Namespace"
        options={extra.options ?? OPTIONS}
        placeholder={extra.placeholder}
        value={value}
        onChange={(v) => {
          changes.push(v);
          setValue(v);
        }}
      />
    );
  }
  const view = render(<Picker />);
  const user = userEvent.setup();
  const trigger = () => view.getByRole('button', { name: /^Namespace:/ });
  return {
    ...view,
    user,
    changes,
    trigger,
    /** Opens it with a click; the list takes focus once it is drawn. */
    open: async () => {
      await user.click(trigger());
      const list = view.getByRole('listbox');
      await waitFor(() => expect(document.activeElement).toBe(list));
      return list;
    },
    /** The options' names, as shown. */
    names: () => view.queryAllByRole('option').map((o) => o.textContent),
    /** The option picked. */
    picked: () =>
      view
        .queryAllByRole('option')
        .filter((o) => o.getAttribute('aria-selected') === 'true')
        .map((o) => o.textContent),
    /** The option the keyboard is on. */
    active: () => {
      const id = view.getByRole('listbox').getAttribute('aria-activedescendant');
      return id ? document.getElementById(id)?.textContent : undefined;
    },
    value: () => trigger().querySelector('.uk-select-value') as HTMLElement,
    closed: () => waitFor(() => expect(view.queryByRole('listbox')).toBeNull()),
  };
}

describe('Select: the button', () => {
  it('shows what is picked, by its title', () => {
    const { trigger, value } = mount('media');
    expect(value().textContent).toBe('Media');
    expect(value().hasAttribute('data-empty')).toBe(false);
    expect(trigger().getAttribute('aria-label')).toBe('Namespace: Media');
  });

  it('says a dash while nothing is picked', () => {
    const { trigger, value } = mount(null);
    expect(value().textContent).toBe('—');
    expect(value().hasAttribute('data-empty')).toBe(true);
    expect(trigger().getAttribute('aria-label')).toBe('Namespace: —');
  });

  it('says its placeholder while nothing is picked, or what is picked is none of its options', () => {
    expect(mount(null, { placeholder: 'Pick one' }).value().textContent).toBe('Pick one');
    cleanup();
    expect(mount('gone', { placeholder: 'Pick one' }).trigger().getAttribute('aria-label')).toBe('Namespace: Pick one');
  });

  it('says whether it is open', async () => {
    const { trigger, open } = mount();
    expect(trigger().getAttribute('aria-haspopup')).toBe('listbox');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    await open();
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
  });
});

describe('Select: the list', () => {
  it('opens focused, every option shown, the picked one marked and active', async () => {
    const { open, names, picked, active, getByRole } = mount();
    const list = await open();
    expect(getByRole('dialog', { name: 'Namespace' })).toBeTruthy();
    expect(list.getAttribute('aria-label')).toBe('Namespace');
    expect(names()).toEqual(['apps12', 'Media', 'mysql', 'kube-system', 'kube-public', 'nginx']);
    expect(picked()).toEqual(['mysql']);
    expect(active()).toBe('mysql');
    expect(getByRole('option', { name: 'mysql' }).querySelector('.uk-select-mark svg')).not.toBeNull();
    expect(getByRole('option', { name: 'Media' }).querySelector('.uk-select-mark svg')).toBeNull();
  });

  it('opens on the first option while nothing is picked', async () => {
    const { open, picked, active } = mount(null);
    await open();
    expect(picked()).toEqual([]);
    expect(active()).toBe('apps12');
  });

  it('picks with a click: closes, focus back on the button', async () => {
    const { open, user, getByRole, changes, trigger, value, closed } = mount();
    await open();
    await user.click(getByRole('option', { name: 'nginx' }));
    expect(changes).toEqual(['nginx']);
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(value().textContent).toBe('nginx');
    await closed();
    expect(document.activeElement).toBe(trigger());
  });

  it('moves the active option with the mouse', async () => {
    const { open, user, getByRole, active } = mount();
    await open();
    await user.hover(getByRole('option', { name: 'kube-public' }));
    expect(active()).toBe('kube-public');
    expect(getByRole('option', { name: 'kube-public' }).hasAttribute('data-active')).toBe(true);
  });

  it('opens again on what is picked, wherever the keyboard was left', async () => {
    const { open, user, active, closed } = mount();
    await open();
    await user.keyboard('{End}{Escape}');
    await closed();
    await open();
    expect(active()).toBe('mysql');
  });

  it('opens with the picked one in the middle of the list', async () => {
    // A list 300px high of 34px rows (happy-dom lays nothing out).
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(34);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300);
    vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (this: HTMLElement) {
      return Number(this.id.split('-').pop()) * 34;
    });
    const options = Array.from({ length: 40 }, (_, i) => ({ value: `ns-${i}`, title: `ns-${i}` }));
    const list = await mount('ns-25', { options }).open();
    expect(list.scrollTop).toBe(25 * 34 - (300 - 34) / 2);
  });
});

describe('Select: the keyboard', () => {
  it('arrows move within the list, Home and End go to its ends', async () => {
    const { open, user, active } = mount('apps');
    await open();
    await user.keyboard('{ArrowUp}');
    expect(active()).toBe('apps12');
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(active()).toBe('mysql');
    await user.keyboard('{End}{ArrowDown}');
    expect(active()).toBe('nginx');
    await user.keyboard('{Home}');
    expect(active()).toBe('apps12');
  });

  it('Enter picks the active option and closes', async () => {
    const { open, user, changes, trigger, closed } = mount();
    await open();
    await user.keyboard('{ArrowDown}{Enter}');
    expect(changes).toEqual(['kube-system']);
    await closed();
    expect(document.activeElement).toBe(trigger());
  });

  it('Space picks the active option and closes', async () => {
    const { open, user, changes, closed } = mount();
    await open();
    await user.keyboard('{ArrowUp} ');
    expect(changes).toEqual(['media']);
    await closed();
  });

  it('Escape closes it without a change, focus back on the button', async () => {
    const { open, user, changes, trigger, value, closed } = mount();
    await open();
    await user.keyboard('{End}{Escape}');
    await closed();
    expect(changes).toEqual([]);
    expect(value().textContent).toBe('mysql');
    expect(document.activeElement).toBe(trigger());
  });

  it('a letter jumps to the next option starting with it, round, case aside', async () => {
    const { open, user, active } = mount();
    await open();
    await user.keyboard('k');
    expect(active()).toBe('kube-system');
    await user.keyboard('k');
    expect(active()).toBe('kube-public');
    await user.keyboard('M');
    expect(active()).toBe('Media');
    await user.keyboard('m');
    expect(active()).toBe('mysql');
    await user.keyboard('m');
    expect(active()).toBe('Media');
  });

  it('a letter nothing starts with, or a shortcut, moves nothing', async () => {
    const { open, user, active, changes } = mount();
    await open();
    await user.keyboard('z');
    expect(active()).toBe('mysql');
    await user.keyboard('{Control>}k{/Control}');
    expect(active()).toBe('mysql');
    expect(changes).toEqual([]);
  });
});

describe('Select: closing', () => {
  it('closes on a click outside, without a change', async () => {
    const { open, user, trigger, changes, closed } = mount();
    await open();
    // A click outside counts only after the one that opened it.
    await new Promise((r) => setTimeout(r));
    await user.click(document.body);
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    await closed();
    expect(changes).toEqual([]);
  });
});
