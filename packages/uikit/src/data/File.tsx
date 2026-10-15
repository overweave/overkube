import type { ComponentChildren } from 'preact';
import { useId, useState } from 'preact/hooks';
import { Icon } from '../display/Icon';
import { Code } from './Code';

/*
 * A file (a config map's key, a secret's): a section of its own — its name,
 * its size quiet, what can be done with it at its end; its text under them,
 * edge to edge (no box in the box), or what stands in for it (hidden: a
 * word, by its icon). A long text cut at its first lines, fading out, the
 * rest a click away (and back).
 */

export interface FileLabels {
  more: (lines: number) => string;
  less: string;
}

export const FILE_LABELS: FileLabels = { more: (lines) => `Show all ${lines} lines`, less: 'Show less' };

/** How many lines of a text are shown at first. */
export const FILE_LINES = 12;

export function File({
  name,
  size,
  actions,
  children,
  part,
  lines = FILE_LINES,
  labels = FILE_LABELS,
}: {
  name: string;
  size?: string;
  actions?: ComponentChildren;
  children: ComponentChildren;
  part?: string;
  /** Lines of its text shown at first (the rest a click away). */
  lines?: number;
  labels?: FileLabels;
}) {
  const [all, setAll] = useState(false);
  const id = useId();
  const text = typeof children === 'string' ? children.replace(/\n$/, '') : undefined;
  const count = text === undefined ? 0 : text.split('\n').length;
  const cut = count > lines && !all;
  return (
    <section class="uk-section uk-file" data-part={part} data-cut={cut ? '' : undefined}>
      <header class="uk-file-head">
        <span class="uk-file-title">
          <b class="uk-mono">{name}</b>
          {size && <span class="uk-quiet">{size}</span>}
        </span>
        {actions && <span class="uk-file-actions">{actions}</span>}
      </header>
      {text === undefined ? <div class="uk-file-instead">{children}</div> : <Code id={id}>{cut ? text.split('\n').slice(0, lines).join('\n') : text}</Code>}
      {count > lines && (
        <button type="button" class="uk-file-more" aria-expanded={all} aria-controls={id} onClick={() => setAll(!all)}>
          <Icon name="chevron" />
          {all ? labels.less : labels.more(count)}
        </button>
      )}
    </section>
  );
}
