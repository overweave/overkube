import { EditorView } from '@codemirror/view';
import { act, cleanup, render, waitFor } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import { afterEach, describe, expect, it } from 'vitest';
import { CodeEditor } from './CodeEditor';
import { DEPLOYMENT, GOOD } from './schema.fixture';

/*
 * The code editor: its engine loaded once drawn (its text shown till
 * then); what is typed told (onChange), its value given back not set again
 * — an effect drawn late never sets an older text over newer typing; its
 * value changed from outside, set (not told back); what it is told is
 * wrong underlined.
 */

afterEach(cleanup);

const viewOf = (root: HTMLElement) => EditorView.findFromDOM(root.querySelector('.cm-editor') as HTMLElement) as EditorView;

function Edited({ start, told }: { start: string; told: string[] }) {
  const [text, setText] = useState(start);
  return (
    <>
      <CodeEditor
        value={text}
        onChange={(v) => {
          told.push(v);
          setText(v);
        }}
      />
      <button type="button" onClick={() => setText('a: 9\n')}>
        reset
      </button>
    </>
  );
}

describe('CodeEditor', () => {
  it('shows its text till its engine is there, then edits it', async () => {
    const view = render(<CodeEditor value={'a: 1\n'} />);
    expect(view.container.querySelector('.uk-code-editor-wait')?.textContent).toBe('a: 1\n');
    await waitFor(() => expect(view.container.querySelector('.cm-editor')).not.toBeNull(), { timeout: 4000 });
    expect(viewOf(view.container as HTMLElement).state.doc.toString()).toBe('a: 1\n');
  });

  it('tells what is typed; its value given back is not set again (typing kept), one from outside is — and not told back', async () => {
    const told: string[] = [];
    const view = render(<Edited start={'a: 1\n'} told={told} />);
    await waitFor(() => expect(view.container.querySelector('.cm-editor')).not.toBeNull(), { timeout: 4000 });
    const cm = viewOf(view.container as HTMLElement);
    // Typed at once, twice, before any effect is drawn.
    cm.dispatch({ changes: { from: 3, to: 4, insert: '2' } });
    cm.dispatch({ changes: { from: 3, to: 4, insert: '3' } });
    await new Promise((r) => setTimeout(r, 100));
    expect([cm.state.doc.toString(), told]).toEqual(['a: 3\n', ['a: 2\n', 'a: 3\n']]);
    act(() => (view.getByText('reset') as HTMLButtonElement).click());
    await waitFor(() => expect(cm.state.doc.toString()).toBe('a: 9\n'));
    expect(told).toEqual(['a: 2\n', 'a: 3\n']);
  });

  it('starts with its value as it is once its engine is there (one given while it came, not the first)', async () => {
    const view = render(<CodeEditor value={'a: 1\n'} />);
    view.rerender(<CodeEditor value={'a: 2\n'} />);
    await waitFor(() => expect(view.container.querySelector('.cm-editor')).not.toBeNull(), { timeout: 4000 });
    expect(viewOf(view.container as HTMLElement).state.doc.toString()).toBe('a: 2\n');
  });

  it('checks JSON as its parser does (its error underlined, a character at least); told a problem of an empty text, draws all the same', async () => {
    const view = render(<CodeEditor language="json" value={'{"a": 1,}'} />);
    await waitFor(() => expect(view.container.querySelectorAll('.cm-lint-marker-error').length).toBeGreaterThan(0), { timeout: 4000 });
    expect(view.container.querySelector('.cm-lintRange-error')?.textContent).not.toBe('');
    const empty = render(<CodeEditor value="" problems={[{ line: 1, message: 'empty' }]} />);
    await waitFor(() => expect(empty.container.querySelector('.cm-editor')).not.toBeNull(), { timeout: 4000 });
  });

  it('underlines what is wrong against its schema, and what it is told', async () => {
    const view = render(
      <CodeEditor value={GOOD.replace('replicas: 2', 'replicas: two')} schema={DEPLOYMENT} problems={[{ path: ['spec', 'selector'], message: 'field is immutable' }]} />,
    );
    await waitFor(() => expect([...view.container.querySelectorAll('.cm-lintRange-error')].map((e) => e.textContent).sort()).toEqual(['selector', 'two']), { timeout: 4000 });
  });

  it('tells how many errors it finds itself (its YAML, against its schema): not those it is told', async () => {
    const counted: number[] = [];
    const view = render(
      <CodeEditor value={GOOD.replace('replicas: 2', 'replicas: two')} schema={DEPLOYMENT} problems={[{ line: 1, message: 'told' }]} onErrors={(n) => counted.push(n)} />,
    );
    await waitFor(() => expect(counted.at(-1)).toBe(1), { timeout: 4000 });
    view.rerender(<CodeEditor value={GOOD} schema={DEPLOYMENT} onErrors={(n) => counted.push(n)} />);
    await waitFor(() => expect(counted.at(-1)).toBe(0), { timeout: 4000 });
  });

  it('marks the line of its caret only where it is edited', async () => {
    const view = render(<CodeEditor value={'a: 1\n'} readOnly />);
    await waitFor(() => expect(view.container.querySelector('.cm-editor')).not.toBeNull(), { timeout: 4000 });
    expect(view.container.querySelector('.cm-activeLine')).toBeNull();
  });
});
