import { cleanup, render } from '@testing-library/preact';
import type { VNode } from 'preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ICONS, Icon, registerIcons } from './Icon';
import { TABLER } from './icons.generated';

/* Icons by name: the kit's (Tabler's, generated), Kubernetes' own, those an extension registers; a name none has. */

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const svg = (node: VNode) => render(node).container.querySelector('svg') as SVGSVGElement;
const paths = (s: SVGSVGElement) => [...s.querySelectorAll('path')].map((p) => p.getAttribute('d'));

describe('Icon', () => {
  it('draws an icon of the kit by its name: its paths on a 24×24 grid', () => {
    const s = svg(<Icon name="search" />);
    expect(s.getAttribute('class')).toBe('uk-icon');
    expect(s.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(paths(s)).toEqual([...TABLER.search.d]);
  });

  it('has the kit’s icons, and Kubernetes’ own', () => {
    expect(ICONS).toEqual([...Object.keys(TABLER), 'kube']);
    expect(paths(svg(<Icon name="kube" />))).toHaveLength(1);
  });

  it('marks a filled one, to be filled not stroked', () => {
    expect(svg(<Icon name="pin-filled" />).hasAttribute('data-filled')).toBe(true);
    cleanup();
    expect(svg(<Icon name="pin" />).hasAttribute('data-filled')).toBe(false);
  });

  it('is hidden from a reader, unless given a title: then an image of that name', () => {
    expect(svg(<Icon name="x" />).getAttribute('aria-hidden')).toBe('true');
    cleanup();
    const titled = svg(<Icon name="warning" title="Needs a look" />);
    expect(titled.getAttribute('role')).toBe('img');
    expect(titled.hasAttribute('aria-hidden')).toBe(false);
    expect(titled.querySelector('title')?.textContent).toBe('Needs a look');
  });

  it('draws a cube for a name none has, and says so once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(paths(svg(<Icon name="no-such-icon" />))).toEqual([...TABLER.cube.d]);
    cleanup();
    svg(<Icon name="no-such-icon" />);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('no-such-icon');
  });

  it('draws an extension’s icons by their names: a path, several, filled', () => {
    registerIcons({ 'test-ship': 'M1 1h22', 'test-two': { d: ['M1 1h1', 'M2 2h2'], filled: true } });
    expect(paths(svg(<Icon name="test-ship" />))).toEqual(['M1 1h22']);
    cleanup();
    const two = svg(<Icon name="test-two" />);
    expect(paths(two)).toEqual(['M1 1h1', 'M2 2h2']);
    expect(two.hasAttribute('data-filled')).toBe(true);
  });

  it('takes an extension’s icon over the kit’s of the same name (the later one)', () => {
    registerIcons({ 'test-later': 'M1 1h1' });
    registerIcons({ 'test-later': 'M2 2h2' });
    expect(paths(svg(<Icon name="test-later" />))).toEqual(['M2 2h2']);
  });
});
