import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { activeElement, focusable, trapTab, uid } from './focus';

/* Keyboard focus: what can take it, a trap keeping Tab inside, the element with it (into shadow roots), ids. */

afterEach(cleanup);

describe('focusable', () => {
  it('finds what Tab stops at, in order: links, buttons, fields, what has a tabindex — none inside what is inert or hidden', () => {
    // Markup a page should not have (a link with no href, a hidden button that takes focus): what focusable leaves out.
    const container = document.createElement('div');
    container.innerHTML = `
      <a href="#x">link</a><a>no href</a>
      <button type="button">button</button><button type="button" disabled>disabled</button>
      <input aria-label="field"><input aria-label="off" disabled>
      <select aria-label="pick"></select><textarea aria-label="text"></textarea>
      <div tabindex="0">stop</div><div tabindex="-1">no stop</div>
      <button type="button" aria-hidden="true">hidden</button><button type="button" inert>inert</button>
      <section inert><input aria-label="in a closed body"></section><div hidden><button type="button">in hidden</button></div>`;
    expect(focusable(container).map((el) => el.textContent || el.getAttribute('aria-label'))).toEqual(['link', 'button', 'field', 'pick', 'text', 'stop']);
  });
});

describe('trapTab', () => {
  function trap() {
    const view = render(
      <div>
        <button type="button">outside</button>
        <div data-trap>
          <button type="button">first</button>
          <button type="button">middle</button>
          <button type="button">last</button>
        </div>
      </div>,
    );
    const root = view.container.querySelector('[data-trap]') as HTMLElement;
    const press = (shiftKey = false) => {
      const e = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, cancelable: true });
      trapTab(root, e);
      return e.defaultPrevented;
    };
    return { ...view, root, press };
  }

  it('takes Tab from the last round to the first', () => {
    const { getByText, press } = trap();
    getByText('last').focus();
    expect(press()).toBe(true);
    expect(document.activeElement).toBe(getByText('first'));
  });

  it('takes Shift+Tab from the first round to the last', () => {
    const { getByText, press } = trap();
    getByText('first').focus();
    expect(press(true)).toBe(true);
    expect(document.activeElement).toBe(getByText('last'));
  });

  it('leaves Tab in between to the browser', () => {
    const { getByText, press } = trap();
    getByText('middle').focus();
    expect(press()).toBe(false);
    expect(press(true)).toBe(false);
  });

  it('brings focus from outside in, by Shift+Tab, to the last', () => {
    const { getByText, press } = trap();
    getByText('outside').focus();
    expect(press(true)).toBe(true);
    expect(document.activeElement).toBe(getByText('last'));
  });

  it('does nothing but for Tab, or with nothing to focus', () => {
    const { root } = trap();
    const e = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    trapTab(root, e);
    expect(e.defaultPrevented).toBe(false);
    const empty = document.createElement('div');
    const tab = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    trapTab(empty, tab);
    expect(tab.defaultPrevented).toBe(false);
  });
});

describe('activeElement', () => {
  it('finds the element with focus inside a shadow root', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const inner = document.createElement('button');
    shadow.append(inner);
    inner.focus();
    expect(document.activeElement).toBe(host);
    expect(activeElement()).toBe(inner);
    host.remove();
  });

  it('is the document’s otherwise', () => {
    const { getByText } = render(<button type="button">here</button>);
    getByText('here').focus();
    expect(activeElement()).toBe(getByText('here'));
    fireEvent.blur(getByText('here'));
  });
});

describe('uid', () => {
  it('gives each its own id, with its prefix', () => {
    const a = uid('uk-x');
    const b = uid('uk-x');
    expect(a).toMatch(/^uk-x-\d+$/);
    expect(a).not.toBe(b);
  });
});
