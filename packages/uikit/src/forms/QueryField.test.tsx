import { cleanup, fireEvent, render, waitFor } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { useState } from 'preact/hooks';
import { afterEach, describe, expect, it } from 'vitest';
import { QueryField, type QueryProblem, type QuerySuggestions } from './QueryField';

/*
 * A query as a user types it: its parts coloured, what is wrong under the
 * part the caret is in, what may go there taken with the keyboard or the
 * mouse; Enter, nothing offered, asks it.
 */

afterEach(cleanup);

const FIELDS = ['status', 'restarts', 'node'];

/** Fields offered where the text is one word (the word typed so far). */
function suggest(text: string, caret: number): QuerySuggestions | undefined {
  if (/\s/.test(text.slice(0, caret))) return undefined;
  const items = FIELDS.filter((f) => f.startsWith(text.slice(0, caret)) && f !== text).map((f) => ({ value: `${f} `, title: f }));
  return items.length ? { from: 0, to: text.length, items } : undefined;
}

function mount(initial = '', problems: (text: string) => QueryProblem[] = () => []) {
  const asked: string[] = [];
  function Field() {
    const [value, setValue] = useState(initial);
    return (
      <QueryField
        label="Filter"
        value={value}
        onChange={setValue}
        onSubmit={(v) => asked.push(v)}
        parts={value ? [{ start: 0, end: Math.min(value.length, value.indexOf(' ') >>> 0), kind: 'field' }] : []}
        problems={problems(value)}
        suggest={suggest}
      />
    );
  }
  const view = render(<Field />);
  const input = view.getByRole('combobox', { name: 'Filter' }) as HTMLInputElement;
  return { ...view, user: userEvent.setup(), input, asked };
}

describe('QueryField', () => {
  it('offers what may go where the caret is, and takes it with the keyboard', async () => {
    const { user, input, getByRole, queryByRole } = mount();
    await user.type(input, 're');
    const list = getByRole('listbox');
    expect([...list.querySelectorAll('[role="option"]')].map((o) => o.textContent)).toEqual(['restarts']);
    expect(input.getAttribute('aria-expanded')).toBe('true');
    await user.keyboard('{Tab}');
    expect(input.value).toBe('restarts ');
    expect(queryByRole('listbox')).toBeNull();
  });

  it('moves with the arrows, takes with Tab or a press', async () => {
    const { user, input, getByRole, getAllByRole } = mount();
    await user.click(input);
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(getAllByRole('option')[2].getAttribute('aria-selected')).toBe('true');
    expect(input.getAttribute('aria-activedescendant')).toBe(getAllByRole('option')[2].id);
    await user.keyboard('{Tab}');
    expect(input.value).toBe('node ');
    await user.clear(input);
    await user.click(getByRole('option', { name: 'restarts' }));
    expect(input.value).toBe('restarts ');
    expect(document.activeElement).toBe(input);
  });

  it('closes on Escape; asks on Enter as it is, what is offered not taken (and left open)', async () => {
    const { user, input, queryByRole, asked } = mount();
    await user.type(input, 's');
    await user.keyboard('{Escape}');
    expect(queryByRole('listbox')).toBeNull();
    await user.type(input, 't');
    expect(queryByRole('listbox')).not.toBeNull();
    await user.keyboard('{Enter}');
    expect([asked, input.value, queryByRole('listbox') !== null]).toEqual([['st'], 'st', true]);
  });

  it('puts a ) or , typed right after a suggestion taken in its space’s place', async () => {
    const { user, input } = mount();
    await user.type(input, 're');
    await user.keyboard('{Tab}');
    expect(input.value).toBe('restarts ');
    await user.keyboard(')');
    expect(input.value).toBe('restarts)');
    await user.keyboard(' ,');
    expect(input.value).toBe('restarts) ,');
  });

  it('says what is wrong under the pointer, without the caret there', async () => {
    const wrong = (text: string): QueryProblem[] => (text.startsWith('phase') ? [{ start: 0, end: 5, message: 'pods.v1 has no field phase' }] : []);
    const { input, container, queryByText } = mount('phase = x', wrong);
    const mark = container.querySelector('[data-problem-at="0"]') as HTMLElement;
    mark.getBoundingClientRect = () => ({ left: 10, right: 50, top: 0, bottom: 20, width: 40, height: 20, x: 10, y: 0, toJSON: () => ({}) });
    fireEvent.pointerMove(input, { clientX: 20, clientY: 10 });
    await waitFor(() => expect(queryByText('pods.v1 has no field phase')).not.toBeNull());
    fireEvent.pointerMove(input, { clientX: 80, clientY: 10 });
    await waitFor(() => expect(queryByText('pods.v1 has no field phase')).toBeNull());
  });

  it('says what is wrong under the part the caret is in, and marks it', async () => {
    const wrong = (text: string): QueryProblem[] => (text.startsWith('phase') ? [{ start: 0, end: 5, message: 'pods.v1 has no field phase' }] : []);
    const { user, input, container, queryByText } = mount('phase = x', wrong);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(container.querySelector('[data-problem="error"]')?.textContent).toBe('phase');
    expect(queryByText('pods.v1 has no field phase')).toBeNull();
    await user.click(input);
    input.setSelectionRange(2, 2);
    await user.keyboard('{ArrowRight}');
    await waitFor(() => expect(queryByText('pods.v1 has no field phase')).not.toBeNull());
    expect(document.getElementById(input.getAttribute('aria-describedby') ?? '')?.textContent).toContain('no field phase');
    input.setSelectionRange(8, 8);
    await user.keyboard('{ArrowRight}');
    await waitFor(() => expect(queryByText('pods.v1 has no field phase')).toBeNull());
  });

  it('places what is offered at the end, after a space: under where the caret is', async () => {
    const after = (text: string, caret: number): QuerySuggestions | undefined =>
      caret === text.length && text.endsWith(' ') ? { from: caret, to: caret, items: [{ value: '=' }] } : undefined;
    function Field() {
      const [value, setValue] = useState('status');
      return <QueryField label="Filter" value={value} onChange={setValue} suggest={after} />;
    }
    const view = render(<Field />);
    const input = view.getByRole('combobox', { name: 'Filter' });
    await userEvent.setup().type(input, ' ');
    expect(view.getByRole('listbox')).toBeTruthy();
    expect(view.container.querySelectorAll('.uk-query-at')).toHaveLength(1);
    expect(view.container.querySelector('.uk-query-copy')?.lastElementChild?.className).toBe('uk-query-at');
  });

  it('clears', async () => {
    const { user, input, getByRole } = mount('status = Running');
    await user.click(getByRole('button', { name: 'Clear' }));
    expect(input.value).toBe('');
    expect(document.activeElement).toBe(input);
  });
});
