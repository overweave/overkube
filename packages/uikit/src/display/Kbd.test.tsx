import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { css } from '../styles';
import { Kbd, keyName, onMac } from './Kbd';

/* A key cap; a combination's caps, named as the platform names them (a Mac's signs, else words). */

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** The page as on a platform. */
const platform = (name: string, data?: string) => vi.stubGlobal('navigator', { ...navigator, platform: name, userAgentData: data === undefined ? undefined : { platform: data } });

describe('onMac', () => {
  it('knows a Mac (an iPhone, an iPad) by the platform, the newer word first', () => {
    platform('MacIntel');
    expect(onMac()).toBe(true);
    platform('iPad');
    expect(onMac()).toBe(true);
    platform('Win32');
    expect(onMac()).toBe(false);
    platform('Linux x86_64');
    expect(onMac()).toBe(false);
    platform('Win32', 'macOS');
    expect(onMac()).toBe(true);
  });
});

describe('keyName', () => {
  it('names the modifiers by their signs on a Mac, by words elsewhere', () => {
    expect(['mod', 'shift', 'alt', 'ctrl', 'cmd', 'option'].map((k) => keyName(k, true))).toEqual(['⌘', '⇧', '⌥', '⌃', '⌘', '⌥']);
    expect(['mod', 'shift', 'alt', 'ctrl', 'meta'].map((k) => keyName(k, false))).toEqual(['Ctrl', 'Shift', 'Alt', 'Ctrl', 'Win']);
  });

  it('names arrows, Enter, Escape and the like by their signs, on any platform', () => {
    expect(['up', 'down', 'left', 'right', 'ArrowUp', 'enter', 'esc', 'Escape', 'backspace'].map((k) => keyName(k, false))).toEqual([
      '↑',
      '↓',
      '←',
      '→',
      '↑',
      '↵',
      'Esc',
      'Esc',
      '⌫',
    ]);
  });

  it('writes a letter in capitals, a sign as it is, any other key as it is given', () => {
    expect([keyName('k', false), keyName('/', false), keyName('+', false), keyName('F5', false), keyName(' PageUp ', false)]).toEqual(['K', '/', '+', 'F5', 'PageUp']);
  });

  it('names by the platform the page is on, when not told', () => {
    platform('MacIntel');
    expect(keyName('mod')).toBe('⌘');
    platform('Win32');
    expect(keyName('mod')).toBe('Ctrl');
  });
});

describe('Kbd', () => {
  it('draws a key as it is written, in a key cap', () => {
    const kbd = render(<Kbd>/</Kbd>).container.firstElementChild as HTMLElement;
    expect(kbd.tagName).toBe('KBD');
    expect(kbd.className).toBe('uk-kbd');
    expect(kbd.textContent).toBe('/');
  });

  it('draws a combination as a cap each, in a kbd of kbds', () => {
    platform('MacIntel');
    const outer = render(<Kbd keys="mod+shift+k" />).container.firstElementChild as HTMLElement;
    expect(outer.className).toBe('uk-kbds');
    expect([...outer.querySelectorAll(':scope > kbd.uk-kbd')].map((k) => k.textContent)).toEqual(['⌘', '⇧', 'K']);
  });

  it('names a combination’s keys as the platform does', () => {
    platform('Win32');
    expect(render(<Kbd keys="mod+k" />).container.textContent).toBe('CtrlK');
  });

  it('takes "+" alone as a key, not a joint', () => {
    platform('Win32');
    const caps = (keys: string) => [...render(<Kbd keys={keys} />).container.querySelectorAll('kbd.uk-kbd')].map((k) => k.textContent);
    expect(caps('mod++')).toEqual(['Ctrl', '+']);
    cleanup();
    expect(caps('+')).toEqual(['+']);
  });

  it('draws one key given as keys', () => {
    expect(render(<Kbd keys="enter" />).container.textContent).toBe('↵');
  });

  it('sits where it is put: no margin of its own, to the end only in a field’s button', () => {
    const rule = css.split('\n').find((l) => l.startsWith('.uk-kbd {')) ?? '';
    expect(rule).not.toContain('margin');
    expect(css).toContain(".uk-button[data-variant='field'] > .uk-kbd");
  });
});
