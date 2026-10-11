import { cleanup, render } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { useState } from 'preact/hooks';
import { afterEach, describe, expect, it } from 'vitest';
import { Switch } from './Switch';

/* A switch as a user has it (user-event): what it says, turning it by the pointer and the keyboard, disabled. */

afterEach(cleanup);

function mount(props: Partial<Parameters<typeof Switch>[0]> = {}) {
  const told: boolean[] = [];
  function Live() {
    const [on, setOn] = useState(props.checked ?? false);
    return (
      <Switch
        label="Hide empty"
        {...props}
        checked={on}
        onChange={(next) => {
          told.push(next);
          setOn(next);
        }}
      />
    );
  }
  const view = render(<Live />);
  return { ...view, told, user: userEvent.setup(), sw: () => view.getByRole('switch', { name: 'Hide empty' }) as HTMLButtonElement };
}

describe('Switch', () => {
  it('is a switch named by its label, saying whether it is on', () => {
    const { sw } = mount();
    expect(sw().getAttribute('aria-checked')).toBe('false');
    expect(sw().getAttribute('type')).toBe('button');
    cleanup();
    expect(mount({ checked: true }).sw().getAttribute('aria-checked')).toBe('true');
  });

  it('turns by a click, Space and Enter, telling each turn', async () => {
    const { sw, user, told } = mount();
    await user.click(sw());
    expect(sw().getAttribute('aria-checked')).toBe('true');
    sw().focus();
    await user.keyboard(' ');
    await user.keyboard('{Enter}');
    expect(told).toEqual([true, false, true]);
  });

  it('turns by a click on its label too (it is all one button)', async () => {
    const { getByText, user, told } = mount();
    await user.click(getByText('Hide empty'));
    expect(told).toEqual([true]);
  });

  it('does not turn disabled, and says it is', async () => {
    const { sw, user, told } = mount({ disabled: true });
    expect(sw().disabled).toBe(true);
    await user.click(sw());
    expect(told).toEqual([]);
    expect(sw().getAttribute('aria-checked')).toBe('false');
  });

  it('keeps its track and thumb from a reader: its state is aria-checked', () => {
    expect(mount().container.querySelector('.uk-switch-track')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('gives the button what else it is given (an id a label points at, a description)', () => {
    const { sw } = mount({ id: 'hide', title: 'Hide kinds with nothing in them', 'aria-describedby': 'hint' });
    expect(sw().id).toBe('hide');
    expect(sw().getAttribute('title')).toBe('Hide kinds with nothing in them');
    expect(sw().getAttribute('aria-describedby')).toBe('hint');
  });

  it('is named by a label in other words than a string', () => {
    const { getByRole } = render(
      <Switch
        checked={false}
        onChange={() => {}}
        label={
          <>
            Hide <b>empty</b>
          </>
        }
      />,
    );
    expect(getByRole('switch', { name: 'Hide empty' })).toBeTruthy();
  });
});
