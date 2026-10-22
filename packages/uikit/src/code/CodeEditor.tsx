import { useEffect, useRef, useState } from 'preact/hooks';
import type { CodeProblem, Editor, Language } from './editor';
import type { Schema } from './schema';

/*
 * A text to edit (or to read): YAML or JSON highlighted, its lines
 * numbered and folded; what is wrong underlined, marked in its gutter, its
 * message on hover — its YAML, then against its schema if it has one, then
 * what it is told (problems: a server's dry run, at a line or a path); its
 * schema's fields offered as one types, a key's description on hover. Its
 * engine (CodeMirror) loaded when one is first drawn: till then, the text
 * as it is. In the kit's tokens; its height the parent's (or given).
 */

export type { CodeProblem } from './editor';
export type { Schema as CodeSchema } from './schema';

export interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  language?: Language;
  readOnly?: boolean;
  /** A JSON Schema (an OpenAPI one: $ref to its components) the text is checked against and completed from. */
  schema?: Schema;
  /** What is wrong, told from outside (a server's dry run): at a line, or at a path of the document. */
  problems?: readonly CodeProblem[];
  placeholder?: string;
  /** Its height (CSS); none: its parent's. */
  height?: string;
  /** Its name, for those who cannot see it. */
  label?: string;
  /** What it finds wrong itself (its YAML, against its schema), each time it checks: its errors counted. */
  onErrors?: (count: number) => void;
}

/** The engine, once: its module asked for by the first editor drawn. */
let engine: Promise<typeof import('./editor')> | undefined;
const load = () => {
  engine ??= import('./editor');
  return engine;
};

const NONE: readonly CodeProblem[] = [];

export function CodeEditor({ value, onChange, language = 'yaml', readOnly = false, schema, problems = NONE, placeholder, height, label, onErrors }: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<Editor | null>(null);
  const [ready, setReady] = useState(false);
  // The latest of what changes it, for the engine's callback (made once).
  const changed = useRef(onChange);
  changed.current = onChange;
  const erred = useRef(onErrors);
  erred.current = onErrors;
  // What it last told (its own text, typed): given back as its value, not set again (an effect drawn late would set an older one over newer typing).
  const told = useRef(value);

  useEffect(() => {
    let gone = false;
    void load().then(({ createEditor }) => {
      if (gone || !host.current) return;
      editor.current = createEditor({
        parent: host.current,
        // Its value as it is now (one given while the engine came, not the first).
        value: told.current,
        language,
        readOnly,
        ...(schema ? { schema } : {}),
        problems,
        ...(placeholder ? { placeholder } : {}),
        onChange: (v) => {
          told.current = v;
          changed.current?.(v);
        },
        onErrors: (n) => erred.current?.(n),
      });
      setReady(true);
    });
    return () => {
      gone = true;
      editor.current?.destroy();
      editor.current = null;
    };
  }, []);

  useEffect(() => {
    if (value === told.current) return;
    told.current = value;
    editor.current?.set(value);
  }, [value, ready]);
  useEffect(() => editor.current?.configure({ readOnly, ...(schema ? { schema } : {}), problems, language }), [readOnly, schema, problems, language, ready]);

  return (
    // biome-ignore lint/a11y/useSemanticElements: an editor's frame (ARIA group), not a form's fieldset.
    <div class="uk-code-editor" style={height ? { height } : undefined} role="group" aria-label={label} data-ready={ready ? '' : undefined}>
      {!ready && <pre class="uk-code-editor-wait">{value}</pre>}
      <div ref={host} class="uk-code-editor-host" />
    </div>
  );
}
