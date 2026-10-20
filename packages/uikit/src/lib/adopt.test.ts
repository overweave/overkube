import { describe, expect, it } from 'vitest';
import { adoptStyles, styleRootOf } from './adopt';

/*
 * The kit's styles where an element is drawn: its document, or the shadow
 * root a host draws the page in (its own styles kept out of it) — there
 * once, as on a document.
 */

describe('adoptStyles', () => {
  it('takes the shadow root an element is drawn in, else its document', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const inside = document.createElement('div');
    shadow.append(inside);
    const outside = document.createElement('div');
    document.body.append(outside);
    expect([styleRootOf(inside), styleRootOf(outside)]).toEqual([shadow, document]);
    host.remove();
    outside.remove();
  });

  it('puts them in a shadow root once', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const count = () => shadow.adoptedStyleSheets.length + shadow.querySelectorAll('style').length;
    adoptStyles(shadow);
    adoptStyles(shadow);
    expect(count()).toBe(1);
    host.remove();
  });
});
