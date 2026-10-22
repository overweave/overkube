import { cleanup, fireEvent, render } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { css } from '../styles';
import { Button } from './Button';

/*
 * The button as a user has it (user-event): what it says, how it is drawn
 * (its marks: variant, size, square, busy), what it does — and what it
 * does not, disabled or busy.
 */

afterEach(cleanup);

const button = (view: ReturnType<typeof render>, name?: string) => view.getByRole('button', name ? { name } : undefined) as HTMLButtonElement;

describe('Button: what it is', () => {
  it('is a button that does not submit, named by its words', () => {
    const view = render(<Button>Restart</Button>);
    const b = button(view, 'Restart');
    expect(b.getAttribute('type')).toBe('button');
    expect(b.classList.contains('uk-button')).toBe(true);
    expect(b.hasAttribute('data-variant')).toBe(false);
  });

  it('marks its variant and size', () => {
    for (const variant of ['primary', 'danger', 'ghost', 'field'] as const) {
      expect(button(render(<Button variant={variant}>x</Button>)).getAttribute('data-variant')).toBe(variant);
      cleanup();
    }
    expect(button(render(<Button size="sm">x</Button>)).getAttribute('data-size')).toBe('sm');
  });

  it('draws its icon before its words, hidden from a reader', () => {
    const b = button(render(<Button icon="refresh">Restart</Button>), 'Restart');
    expect(b.firstElementChild?.classList.contains('uk-icon')).toBe(true);
    expect(b.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
    expect(b.hasAttribute('data-square')).toBe(false);
  });

  it('is square with an icon and no words, named by what it is given', () => {
    const b = button(render(<Button icon="refresh" aria-label="Refresh" />), 'Refresh');
    expect(b.hasAttribute('data-square')).toBe(true);
    cleanup();
    // Words of nothing are none.
    for (const nothing of ['', false, null]) {
      expect(button(render(<Button icon="x">{nothing}</Button>)).hasAttribute('data-square')).toBe(true);
      cleanup();
    }
    expect(button(render(<Button icon="x">0</Button>)).hasAttribute('data-square')).toBe(false);
  });

  it('an icon only, named by its title (none other given); with words or a name given, its title its tip and its description', () => {
    expect(render(<Button icon="x" title="Close" />).getByRole('button', { name: 'Close' })).toBeTruthy();
    cleanup();
    expect(
      render(<Button icon="x" title="Close" aria-label="Close the panel" />)
        .getByRole('button')
        .getAttribute('aria-label'),
    ).toBe('Close the panel');
    cleanup();
    const b = render(<Button title="Restart the pod">Restart</Button>).getByRole('button', { name: 'Restart' });
    expect(b.hasAttribute('aria-label')).toBe(false);
    expect(document.getElementById(b.getAttribute('aria-describedby') ?? '')?.textContent).toBe('Restart the pod');
  });

  it('passes on what else it is given', () => {
    const b = button(render(<Button title="Restart the pod" data-def="Action/x" type="submit" />));
    fireEvent.keyDown(document, { key: 'Tab' });
    fireEvent.focusIn(b);
    expect(document.querySelector('.uk-tip')?.textContent).toBe('Restart the pod');
    expect(b.getAttribute('data-def')).toBe('Action/x');
    // Given a type, that one.
    expect(b.getAttribute('type')).toBe('submit');
  });
});

describe('Button: what it does', () => {
  it('tells a click, and Enter and Space', async () => {
    let pressed = 0;
    const view = render(<Button onClick={() => pressed++}>Restart</Button>);
    const user = userEvent.setup();
    await user.click(button(view));
    button(view).focus();
    await user.keyboard('{Enter} ');
    expect(pressed).toBe(3);
  });

  it('tells nothing disabled', async () => {
    let pressed = 0;
    const view = render(
      <Button disabled onClick={() => pressed++}>
        Restart
      </Button>,
    );
    await userEvent.setup().click(button(view));
    expect(pressed).toBe(0);
    expect(button(view).disabled).toBe(true);
  });
});

describe('Button: busy', () => {
  it('shows a spinner where its icon is, says it is busy, and is not to be pressed', async () => {
    let pressed = 0;
    const view = render(
      <Button busy icon="check" onClick={() => pressed++}>
        Apply
      </Button>,
    );
    const b = button(view, 'Apply');
    expect(b.querySelector('.uk-spinner')).not.toBeNull();
    expect(b.querySelector('.uk-icon')).toBeNull();
    expect(b.getAttribute('aria-busy')).toBe('true');
    expect(b.hasAttribute('data-busy')).toBe(true);
    expect(b.disabled).toBe(true);
    await userEvent.setup().click(b);
    expect(pressed).toBe(0);
  });

  it('is square busy with no words', () => {
    expect(button(render(<Button busy aria-label="Saving" />), 'Saving').hasAttribute('data-square')).toBe(true);
  });

  it('is as it was once no longer busy', () => {
    const view = render(<Button busy>Apply</Button>);
    view.rerender(<Button icon="check">Apply</Button>);
    const b = button(view, 'Apply');
    expect(b.disabled).toBe(false);
    expect(b.hasAttribute('aria-busy')).toBe(false);
    expect(b.querySelector('.uk-icon')).not.toBeNull();
  });
});

describe('Button: its look', () => {
  it('has a rule for each variant, size and state it marks', () => {
    for (const selector of [
      "[data-variant='primary']",
      "[data-variant='danger']",
      "[data-variant='ghost']",
      "[data-variant='field']",
      "[data-size='sm']",
      '[data-square]',
      '[data-busy]',
      ":is(:disabled, [aria-disabled='true'])",
    ]) {
      expect(css).toContain(`.uk-button${selector}`);
    }
  });

  it('draws primary framed in the accent, its words in spaced capitals', () => {
    const rule = css.split('\n').find((l) => l.startsWith(".uk-button[data-variant='primary'] {")) ?? '';
    expect(rule).toContain('background: transparent');
    expect(rule).toContain('border-color: var(--uk-accent)');
    expect(rule).toContain('text-transform: uppercase');
  });
});
