import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfigViewer, entriesOf, sizeOf, textOf } from '../data/ConfigViewer';
import { File } from '../data/File';
import { Meter } from '../data/Meter';
import { Image } from '../display/Image';
import { Nothing } from '../display/Nothing';
import { Ref } from '../display/Ref';
import { Row, Rows } from './Rows';

/* Rows (a mark apart, what leads, what ends, what is under), nothing in a part, another thing by its icon, an image, a meter, a file, keys and values. */

afterEach(cleanup);

describe('Rows', () => {
  it('draws a row’s parts given, a mark only when given — what is more under them', () => {
    const { container } = render(
      <Rows>
        <Row mark={<i>!</i>} lead="Ready" end="3h" under="not yet">
          <p>more</p>
        </Row>
        <Row lead="Plain" />
      </Rows>,
    );
    const [marked, plain] = [...container.querySelectorAll('.uk-rows > .uk-row')];
    expect([...(marked?.children ?? [])].map((c) => [c.className, c.textContent])).toEqual([
      ['uk-row-mark', '!'],
      ['uk-row-lead', 'Ready'],
      ['uk-row-end', '3h'],
      ['uk-row-under', 'not yet'],
      ['', 'more'],
    ]);
    expect([marked?.hasAttribute('data-mark'), plain?.hasAttribute('data-mark'), [...(plain?.children ?? [])].map((c) => c.className)]).toEqual([true, false, ['uk-row-lead']]);
  });
});

describe('Nothing', () => {
  it('says what nothing means, by its icon', () => {
    const { container } = render(<Nothing icon="activity">No events</Nothing>);
    expect([container.querySelector('.uk-nothing .uk-icon') !== null, container.textContent]).toEqual([true, 'No events']);
  });
});

describe('Ref', () => {
  it('is its icon, its sort quiet, its name — a link where it has one', () => {
    const linked = render(
      <Ref icon="cube" kind="ReplicaSet" href="#/x">
        web-1
      </Ref>,
    ).container;
    expect([linked.querySelector('small')?.textContent, linked.querySelector('a')?.getAttribute('href'), linked.textContent]).toEqual(['ReplicaSet', '#/x', 'ReplicaSetweb-1']);
    cleanup();
    const plain = render(<Ref icon="disk">emptyDir</Ref>).container;
    expect([plain.querySelector('a'), plain.querySelector('small'), plain.textContent]).toEqual([null, null, 'emptyDir']);
  });
});

describe('Image', () => {
  it('is its registry and path quiet, its name, its tag apart (none: latest; a digest: its first characters)', () => {
    const parts = (image: string) => {
      const { container } = render(<Image image={image} />);
      const got = [...(container.querySelector('.uk-image')?.children ?? [])].map((c) => c.textContent);
      cleanup();
      return got;
    };
    expect(parts('registry.k8s.io/coredns/coredns:v1.12.0')).toEqual(['registry.k8s.io/coredns/', 'coredns', 'v1.12.0']);
    expect(parts('nginx')).toEqual(['', 'nginx', 'latest']);
    expect(parts('localhost:5000/web@sha256:0123456789abcdef0123')).toEqual(['localhost:5000/', 'web', '0123456789ab']);
  });
});

describe('Meter', () => {
  it('fills its bar as far (at most all of it), a warning nearly full, an error over', () => {
    const bar = (value: number, of: number) => {
      const { container } = render(
        <Meter label="CPU" value={value} of={of}>
          said
        </Meter>,
      );
      const track = container.querySelector('.uk-meter-track') as HTMLElement;
      const got = [track.dataset.level, (track.firstElementChild as HTMLElement).style.width, container.querySelector('dt')?.textContent];
      cleanup();
      return got;
    };
    expect([bar(1, 4), bar(9, 10), bar(5, 4), bar(1, 0)]).toEqual([
      [undefined, '25%', 'CPU'],
      ['warn', '90%', 'CPU'],
      ['error', '100%', 'CPU'],
      [undefined, '0%', 'CPU'],
    ]);
  });
});

describe('File', () => {
  it('shows a long text’s first lines, the rest a click away and back; a short one whole, no button', () => {
    const text = Array.from({ length: 5 }, (_, i) => `line ${i + 1}`).join('\n');
    const { container } = render(
      <File name="a" lines={3}>
        {text}
      </File>,
    );
    const more = () => container.querySelector('.uk-file-more') as HTMLButtonElement;
    expect([container.querySelector('.uk-code')?.textContent, more().textContent, container.querySelector('.uk-file')?.hasAttribute('data-cut')]).toEqual([
      'line 1\nline 2\nline 3',
      'Show all 5 lines',
      true,
    ]);
    fireEvent.click(more());
    expect([container.querySelector('.uk-code')?.textContent, more().textContent, more().getAttribute('aria-expanded')]).toEqual([text, 'Show less', 'true']);
    cleanup();
    const short = render(<File name="b">{'one\ntwo\n'}</File>).container;
    expect([short.querySelector('.uk-code')?.textContent, short.querySelector('.uk-file-more')]).toEqual(['one\ntwo', null]);
  });
});

describe('ConfigViewer', () => {
  it('reads sizes and base64 (binary: none); its entries by name, binary said so', () => {
    expect([sizeOf(12), sizeOf(2048), textOf(btoa('hello')), textOf(btoa(String.fromCharCode(0xff, 0xfe)))]).toEqual(['12 B', '2KiB', 'hello', undefined]);
    // A byte order mark kept: the value as it is.
    expect(textOf(btoa(String.fromCharCode(0xef, 0xbb, 0xbf, 0x41)))).toBe('\uFEFFA');
    expect(entriesOf({ data: { b: 'two', a: btoa('x') }, base64: false })).toEqual([
      { name: 'a', text: 'eA==', size: 4 },
      { name: 'b', text: 'two', size: 3 },
    ]);
    expect(entriesOf({ data: { k: btoa('v') }, binary: { logo: btoa('png') }, base64: true })).toEqual([
      { name: 'k', text: 'v', size: 1 },
      { name: 'logo', size: 3 },
    ]);
  });

  it('shows each key a file, copied by a button (said by its callback); a secret’s hidden till shown; none, said so', async () => {
    const copied: string[] = [];
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: async () => {} } });
    const { container, rerender } = render(<ConfigViewer data={{ 'a.conf': 'port 80' }} binary={{ logo: btoa('x') }} onCopy={(k) => copied.push(k)} />);
    const files = () => [...container.querySelectorAll('.uk-file')];
    expect(files().map((f) => [f.querySelector('b')?.textContent, f.querySelector('.uk-code, .uk-file-instead')?.textContent, f.querySelectorAll('button').length])).toEqual([
      ['a.conf', 'port 80', 1],
      ['logo', 'Binary: not shown', 0],
    ]);
    fireEvent.click(files()[0]?.querySelector('button') as HTMLButtonElement);
    await new Promise((r) => setTimeout(r));
    expect(copied).toEqual(['a.conf']);
    rerender(<ConfigViewer data={{ token: btoa('s3cret') }} base64 secret />);
    const shown = () => files()[0]?.querySelector('.uk-code, .uk-file-instead')?.textContent;
    expect(shown()).toBe('Hidden');
    fireEvent.click([...(files()[0]?.querySelectorAll('button') ?? [])].find((b) => b.textContent === 'Show') as HTMLButtonElement);
    expect(shown()).toBe('s3cret');
    rerender(<ConfigViewer />);
    expect(container.querySelector('.uk-nothing')?.textContent).toBe('No keys in it.');
    vi.unstubAllGlobals();
  });
});
