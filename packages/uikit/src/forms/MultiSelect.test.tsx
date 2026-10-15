import { cleanup, render, waitFor } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { useState } from 'preact/hooks';
import { afterEach, describe, expect, it } from 'vitest';
import { MultiSelect, type Option } from './MultiSelect';

/*
 * The picker as a user has it: the mouse and the keyboard (user-event), what
 * is read back is what the page shows and says (roles, names, ARIA states).
 */

afterEach(cleanup);

const OPTIONS: Option[] = [{ value: 'apps', hint: '12' }, { value: 'media', label: 'Media library' }, { value: 'kube-system' }, { value: 'kube-public' }];

/** A picker that keeps what it is given, and every change it told. */
function mount(initial: string[] = []) {
  const changes: string[][] = [];
  function Picker() {
    const [value, setValue] = useState(initial);
    return (
      <MultiSelect
        label="Namespaces"
        all="All namespaces"
        icon="layers"
        options={OPTIONS}
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
  const trigger = () => view.getByRole('button', { name: /^Namespaces:/ });
  return {
    ...view,
    user,
    changes,
    trigger,
    /** Opens it with a click; the filter takes focus once it is drawn. */
    open: async () => {
      await user.click(trigger());
      const input = view.getByRole('combobox');
      await waitFor(() => expect(document.activeElement).toBe(input));
      return input;
    },
    /** The options' names, as shown. */
    names: () => view.queryAllByRole('option').map((o) => o.textContent),
    /** The options picked. */
    picked: () =>
      view
        .queryAllByRole('option')
        .filter((o) => o.getAttribute('aria-selected') === 'true')
        .map((o) => o.textContent),
    /** The option the keyboard is on. */
    active: () => {
      const id = view.getByRole('combobox').getAttribute('aria-activedescendant');
      return id ? document.getElementById(id)?.textContent : undefined;
    },
    allRow: () => view.queryByRole('button', { name: /^All namespaces/ }),
    popover: () => view.baseElement.querySelector('.uk-popover'),
  };
}

describe('MultiSelect: the button', () => {
  it('says all when nothing is picked', () => {
    const { trigger } = mount();
    expect(trigger().textContent).toContain('All namespaces');
    expect(trigger().getAttribute('aria-label')).toBe('Namespaces: All namespaces');
  });

  it('names one or two picked, by their labels', () => {
    const { trigger } = mount(['apps', 'media']);
    expect(trigger().querySelector('.uk-ms-summary')?.textContent).toBe('apps, Media library');
  });

  it('counts more than two', () => {
    const { trigger } = mount(['apps', 'media', 'kube-system']);
    expect(trigger().getAttribute('aria-label')).toBe('Namespaces: 3 namespaces');
    expect(trigger().querySelector('.uk-ms-summary')?.textContent).toBe('3 namespaces');
  });

  it('names a value no option has by itself', () => {
    const { trigger } = mount(['gone']);
    expect(trigger().querySelector('.uk-ms-summary')?.textContent).toBe('gone');
  });

  it('says whether it is open', async () => {
    const { trigger, open } = mount();
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(trigger().getAttribute('aria-haspopup')).toBe('listbox');
    await open();
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
  });
});

describe('MultiSelect: the popup', () => {
  it('opens with the filter focused, every option shown, the first one active', async () => {
    const { open, names, active, getByRole } = mount();
    const input = await open();
    expect(document.activeElement).toBe(input);
    expect(input.getAttribute('placeholder')).toBe('Search…');
    expect(getByRole('dialog', { name: 'Namespaces' })).toBeTruthy();
    const list = getByRole('listbox', { name: 'Namespaces' });
    expect(list.getAttribute('aria-multiselectable')).toBe('true');
    expect(input.getAttribute('aria-controls')).toBe(list.id);
    expect(names()).toEqual(['apps12', 'Media library', 'kube-system', 'kube-public']);
    expect(active()).toBe('apps12');
  });

  it('shows the picked ones checked', async () => {
    const { open, picked } = mount(['media', 'kube-public']);
    await open();
    expect(picked()).toEqual(['Media library', 'kube-public']);
  });

  it('toggles an option with a click, and stays open', async () => {
    const { open, user, getByRole, changes, picked, trigger } = mount();
    await open();
    await user.click(getByRole('option', { name: 'kube-system' }));
    await user.click(getByRole('option', { name: /^apps/ }));
    expect(picked()).toEqual(['apps12', 'kube-system']);
    await user.click(getByRole('option', { name: 'kube-system' }));
    expect(changes).toEqual([['kube-system'], ['kube-system', 'apps'], ['apps']]);
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(trigger().querySelector('.uk-ms-summary')?.textContent).toBe('apps');
  });

  it('has an All row: on while nothing is picked, a click unpicks everything', async () => {
    const { open, user, allRow, changes, picked, trigger } = mount(['apps', 'media']);
    await open();
    expect(allRow()?.getAttribute('aria-pressed')).toBe('false');
    expect(allRow()?.textContent).toBe('All namespaces4');
    await user.click(allRow() as HTMLElement);
    expect(changes).toEqual([[]]);
    expect(picked()).toEqual([]);
    expect(allRow()?.getAttribute('aria-pressed')).toBe('true');
    expect(trigger().textContent).toContain('All namespaces');
  });

  it('moves the active option with the mouse', async () => {
    const { open, user, getByRole, active } = mount();
    await open();
    await user.hover(getByRole('option', { name: 'kube-system' }));
    expect(active()).toBe('kube-system');
    expect(getByRole('option', { name: 'kube-system' }).hasAttribute('data-active')).toBe(true);
  });
});

describe('MultiSelect: the keyboard', () => {
  it('arrows move within the list, Home and End go to its ends', async () => {
    const { open, user, active } = mount();
    await open();
    await user.keyboard('{ArrowUp}');
    expect(active()).toBe('apps12');
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(active()).toBe('kube-system');
    await user.keyboard('{End}');
    expect(active()).toBe('kube-public');
    await user.keyboard('{ArrowDown}');
    expect(active()).toBe('kube-public');
    await user.keyboard('{Home}');
    expect(active()).toBe('apps12');
  });

  it('Enter and Space toggle the active option', async () => {
    const { open, user, picked, changes, getByRole } = mount();
    const input = await open();
    await user.keyboard('{ArrowDown}{Enter}');
    expect(picked()).toEqual(['Media library']);
    await user.keyboard('{ArrowDown} ');
    expect(picked()).toEqual(['Media library', 'kube-system']);
    await user.keyboard(' ');
    expect(picked()).toEqual(['Media library']);
    expect(changes).toEqual([['media'], ['media', 'kube-system'], ['media']]);
    // Space toggled, it did not type.
    expect((input as HTMLInputElement).value).toBe('');
    expect(getByRole('combobox')).toBe(document.activeElement);
  });

  it('Space types into a filter already begun', async () => {
    const { open, user, picked } = mount();
    const input = (await open()) as HTMLInputElement;
    await user.keyboard('kube ');
    expect(input.value).toBe('kube ');
    expect(picked()).toEqual([]);
  });

  it('Escape closes it, fading, and gives focus back to the button', async () => {
    const { open, user, trigger, popover, queryByRole } = mount(['apps']);
    await open();
    await user.keyboard('{ArrowDown}{Enter}{Escape}');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(popover()?.getAttribute('data-state')).toBe('closing');
    await waitFor(() => expect(queryByRole('listbox')).toBeNull());
    expect(document.activeElement).toBe(trigger());
    expect(trigger().querySelector('.uk-ms-summary')?.textContent).toBe('apps, Media library');
  });
});

describe('MultiSelect: filtering', () => {
  it('narrows by label, case aside, and marks what matches', async () => {
    const { open, user, names, getByRole } = mount();
    await open();
    await user.keyboard('LIBR');
    expect(names()).toEqual(['Media library']);
    expect(getByRole('option').querySelector('mark')?.textContent).toBe('libr');
  });

  it('hides the All row while filtering, and makes the first match active', async () => {
    const { open, user, allRow, active } = mount();
    await open();
    await user.keyboard('{End}');
    await user.keyboard('kube');
    expect(allRow()).toBeNull();
    expect(active()).toBe('kube-system');
    await user.keyboard('{Enter}');
    expect(allRow()).toBeNull();
  });

  it('picks every match at once, keeping what was picked', async () => {
    const { open, user, getByRole, changes, trigger, queryByRole } = mount(['apps', 'kube-system']);
    await open();
    expect(queryByRole('button', { name: /^Pick these/ })).toBeNull();
    await user.keyboard('kube');
    await user.click(getByRole('button', { name: 'Pick these 2' }));
    expect(changes).toEqual([['apps', 'kube-system', 'kube-public']]);
    expect(trigger().getAttribute('aria-label')).toBe('Namespaces: 3 namespaces');
  });

  it('says when nothing matches, with nothing active and nothing to pick', async () => {
    const { open, user, names, getByText, queryByRole, changes } = mount();
    const input = await open();
    await user.keyboard('zzz');
    expect(names()).toEqual([]);
    expect(getByText('No namespaces match')).toBeTruthy();
    expect(input.hasAttribute('aria-activedescendant')).toBe(false);
    expect(queryByRole('button', { name: /^Pick these/ })).toBeNull();
    await user.keyboard('{Enter}');
    expect(changes).toEqual([]);
  });

  it('forgets the filter once closed', async () => {
    const { open, user, names, queryByRole } = mount();
    await open();
    await user.keyboard('kube{Escape}');
    await waitFor(() => expect(queryByRole('listbox')).toBeNull());
    const input = (await open()) as HTMLInputElement;
    expect(input.value).toBe('');
    expect(names()).toHaveLength(4);
  });
});

describe('MultiSelect: closing', () => {
  it('closes on a click outside', async () => {
    const { open, user, trigger, queryByRole } = mount();
    await open();
    // A click outside counts only after the one that opened it.
    await new Promise((r) => setTimeout(r));
    await user.click(document.body);
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    await waitFor(() => expect(queryByRole('listbox')).toBeNull());
  });

  it('stays open on a click inside', async () => {
    const { open, user, trigger, getByRole } = mount();
    await open();
    await new Promise((r) => setTimeout(r));
    await user.click(getByRole('listbox'));
    await user.click(getByRole('combobox'));
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
  });
});
