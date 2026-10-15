import { act, cleanup, fireEvent, render } from '@testing-library/preact';
import { useRef } from 'preact/hooks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Popover } from './Popover';
import { TIP_MS, Tip, TipCard, TipField } from './Tip';

/*
 * A tip as its user has it: shown the pointer a while over it (those after
 * it at once), focus on it, a long press; its content drawn only then; one
 * at a time; gone with the pointer (a card: not as the pointer goes into
 * it), Escape, a press elsewhere; a card's parts only where there is
 * something.
 */

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const tip = () => document.querySelector<HTMLElement>('.uk-tip');
const at = (i: number) => document.querySelectorAll<HTMLElement>('.uk-tip-at')[i];
const later = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

function mount(card = false) {
  const drawn: string[] = [];
  const view = render(
    <>
      {['a', 'b'].map((name) => (
        <Tip
          key={name}
          card={card}
          content={() => {
            drawn.push(name);
            return <button type="button">{`about ${name}`}</button>;
          }}
        >
          <button type="button">{name}</button>
        </Tip>
      ))}
    </>,
  );
  return { ...view, drawn };
}

describe('Tip', () => {
  it('shows the pointer a while over it, its content drawn only then; the next at once, the last gone', () => {
    const { drawn } = mount();
    fireEvent.pointerEnter(at(0), { pointerType: 'mouse' });
    later(TIP_MS - 1);
    expect([tip(), drawn]).toEqual([null, []]);
    later(1);
    expect([tip()?.textContent, tip()?.getAttribute('role'), at(0).getAttribute('aria-describedby')]).toEqual(['about a', 'tooltip', tip()?.id]);
    fireEvent.pointerLeave(at(0), { pointerType: 'mouse' });
    fireEvent.pointerEnter(at(1), { pointerType: 'mouse' });
    later(0);
    expect([...document.querySelectorAll('.uk-tip')].map((t) => t.textContent)).toEqual(['about b']);
  });

  it('shows with focus, goes with it; Escape and a press elsewhere close it', () => {
    mount();
    fireEvent.keyDown(document, { key: 'Tab' });
    fireEvent.focusIn(at(0).querySelector('button') as HTMLElement);
    expect(tip()?.textContent).toBe('about a');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(tip()).toBeNull();
    fireEvent.keyDown(document, { key: 'Tab' });
    fireEvent.focusIn(at(1).querySelector('button') as HTMLElement);
    fireEvent.pointerDown(document.body);
    expect(tip()).toBeNull();
  });

  it('a card stays as the pointer goes into it, goes once it leaves; on a touch screen, a long press shows it', () => {
    mount(true);
    fireEvent.pointerDown(at(0), { pointerType: 'touch' });
    later(500);
    expect(tip()?.hasAttribute('data-card')).toBe(true);
    fireEvent.pointerLeave(at(0), { pointerType: 'mouse' });
    fireEvent.pointerEnter(tip() as HTMLElement);
    later(1000);
    expect(tip()).not.toBeNull();
    fireEvent.pointerLeave(tip() as HTMLElement);
    later(150);
    expect(tip()).toBeNull();
  });

  it('shows none with nothing in it; one in another, the outer one’s only', () => {
    const { container } = render(
      <>
        <Tip content={() => null}>
          <button type="button">empty</button>
        </Tip>
        <Tip content={() => 'outer'}>
          <Tip content={() => 'inner'}>
            <button type="button">nested</button>
          </Tip>
        </Tip>
      </>,
    );
    const [empty, nested] = container.querySelectorAll('button');
    fireEvent.keyDown(document, { key: 'Tab' });
    fireEvent.focusIn(empty);
    // Nothing in it: empty (its CSS, :empty, shows it not).
    expect(tip()?.innerHTML).toBe('');
    fireEvent.keyDown(document, { key: 'Tab' });
    fireEvent.focusIn(nested);
    expect([...document.querySelectorAll('.uk-tip')].map((t) => t.textContent)).toEqual(['outer']);
  });

  it('a card left for another, that one left before its time: the card goes still', () => {
    mount(true);
    fireEvent.pointerEnter(at(0), { pointerType: 'mouse' });
    later(TIP_MS);
    fireEvent.pointerLeave(at(0), { pointerType: 'mouse' });
    fireEvent.pointerEnter(at(1), { pointerType: 'mouse' });
    fireEvent.pointerLeave(at(1), { pointerType: 'mouse' });
    later(150);
    expect(tip()).toBeNull();
  });

  it('shows not with focus a click put there (nor a layer opening), only the keyboard’s; goes once focus leaves it and its card', () => {
    mount(true);
    const [a] = document.querySelectorAll<HTMLButtonElement>('.uk-tip-at > button');
    fireEvent.pointerDown(a);
    fireEvent.focusIn(a);
    expect(tip()).toBeNull();
    fireEvent.keyDown(document, { key: 'Tab' });
    fireEvent.focusIn(a);
    const inside = tip()?.querySelector('button') as HTMLButtonElement;
    // Into its card: it stays; out of both: it goes.
    fireEvent.focusOut(a, { relatedTarget: inside });
    expect(tip()).not.toBeNull();
    fireEvent.focusOut(tip() as HTMLElement, { relatedTarget: document.body });
    expect(tip()).toBeNull();
  });

  it('gone before its time was up: none shown after', () => {
    const { unmount } = mount();
    fireEvent.pointerEnter(at(0), { pointerType: 'mouse' });
    unmount();
    later(TIP_MS);
    expect(tip()).toBeNull();
  });

  it('in a popover: Escape closes the tip only; a press in its card closes neither', () => {
    const closed: string[] = [];
    function Open() {
      const anchor = useRef<HTMLButtonElement>(null);
      return (
        <>
          <button type="button" ref={anchor}>
            open
          </button>
          <Popover anchor={anchor} onClose={() => closed.push('popover')}>
            <Tip card content={() => <button type="button">act</button>}>
              <button type="button">mark</button>
            </Tip>
          </Popover>
        </>
      );
    }
    render(<Open />);
    fireEvent.pointerEnter(document.querySelector('.uk-tip-at') as HTMLElement, { pointerType: 'mouse' });
    later(TIP_MS);
    later(100);
    fireEvent.pointerDown(tip()?.querySelector('button') as HTMLButtonElement);
    expect([tip() !== null, closed]).toEqual([true, []]);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect([tip(), closed]).toEqual([null, []]);
    // A press outside both: the popover closes (it was armed all along).
    fireEvent.pointerDown(document.body);
    expect(closed).toEqual(['popover']);
  });

  it('has a card’s parts only where there is something', () => {
    const { container } = render(<TipCard title="Ready" fields={<TipField label="Reason">{undefined}</TipField>} />);
    expect([...container.querySelectorAll('.uk-tip-card > *')].map((p) => [p.className, p.textContent])).toEqual([
      ['uk-tip-title', 'Ready'],
      ['uk-tip-fields', 'Reason—'],
    ]);
  });
});
