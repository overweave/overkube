import { autocompletion, type CompletionContext, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { json, jsonParseLinter } from '@codemirror/lang-json';
import { yaml } from '@codemirror/lang-yaml';
import { bracketMatching, foldGutter, foldKeymap, HighlightStyle, indentOnInput, indentUnit, syntaxHighlighting } from '@codemirror/language';
import { type Diagnostic, linter, lintGutter, lintKeymap } from '@codemirror/lint';
import { Compartment, EditorState, type Extension, StateEffect } from '@codemirror/state';
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  hoverTooltip,
  keymap,
  lineNumbers,
  placeholder as placeholderText,
} from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
import { completions, fieldAt, problems, rangeOfPath, type Schema, schemaAt, typeName } from './schema';

/*
 * The code editor's engine (CodeMirror 6), loaded only once an editor is
 * drawn: its text highlighted (YAML, JSON), its lines numbered and folded,
 * its history; what is wrong underlined and in the gutter — its YAML, then
 * against its schema (an unknown field, a wrong type, a missing required
 * field), then what it is told from outside (a server's dry run, by line or
 * by path); its schema's fields offered as one types (each its type, its
 * description), a key's description on hover. In the kit's tokens, as the
 * page is (dark, light).
 */

export type Language = 'yaml' | 'json' | 'text';

/** Something wrong told from outside: at a line (1-based) or a path of its document (the field's key). */
export interface CodeProblem {
  message: string;
  severity?: 'error' | 'warning' | 'info';
  line?: number;
  path?: readonly (string | number)[];
}

export interface EditorOptions {
  parent: HTMLElement;
  value: string;
  language: Language;
  readOnly: boolean;
  schema?: Schema;
  problems: readonly CodeProblem[];
  placeholder?: string;
  onChange?: (value: string) => void;
  /** What it finds wrong itself (its YAML, against its schema; JSON's), each time it checks: its errors counted. */
  onErrors?: (count: number) => void;
}

export interface Editor {
  set(value: string): void;
  configure(o: Pick<EditorOptions, 'readOnly' | 'schema' | 'problems' | 'language'>): void;
  focus(): void;
  destroy(): void;
}

const theme = EditorView.theme({
  '&': { height: '100%', color: 'var(--uk-text)', backgroundColor: 'var(--uk-bg)', fontSize: '12px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--uk-mono)', lineHeight: '19px' },
  '.cm-content': { padding: '6px 0', caretColor: 'var(--uk-accent)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--uk-accent)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'color-mix(in srgb, var(--uk-accent) 22%, transparent) !important' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--uk-panel-2) 60%, transparent)' },
  '.cm-gutters': { backgroundColor: 'var(--uk-bg)', color: 'color-mix(in srgb, var(--uk-muted) 70%, transparent)', border: 'none' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--uk-text)' },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 8px 0 12px' },
  '.cm-foldGutter .cm-gutterElement': { color: 'var(--uk-muted)', cursor: 'pointer' },
  '.cm-foldPlaceholder': { backgroundColor: 'var(--uk-panel-2)', border: 'none', color: 'var(--uk-muted)', padding: '0 4px' },
  '.cm-matchingBracket': { backgroundColor: 'color-mix(in srgb, var(--uk-accent) 18%, transparent)', outline: 'none' },
  '.cm-placeholder': { color: 'var(--uk-muted)' },
  // What is wrong: a wavy line of its level's colour; its gutter's mark.
  '.cm-lintRange': { backgroundImage: 'none', textDecoration: 'underline wavy', textUnderlineOffset: '3px', textDecorationThickness: '1px' },
  '.cm-lintRange-error': { textDecorationColor: 'var(--uk-error)' },
  '.cm-lintRange-warning': { textDecorationColor: 'var(--uk-warn)' },
  '.cm-lintRange-info': { textDecorationColor: 'var(--uk-info)' },
  '.cm-lint-marker': { width: '8px', height: '8px', borderRadius: '50%', content: 'none' },
  '.cm-lint-marker-error': { backgroundColor: 'var(--uk-error)' },
  '.cm-lint-marker-warning': { backgroundColor: 'var(--uk-warn)' },
  '.cm-lint-marker-info': { backgroundColor: 'var(--uk-info)' },
  '.cm-gutter-lint': { width: '14px' },
  '.cm-gutter-lint .cm-gutterElement': { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0' },
  // Its tips (a problem's, a field's, what may be typed): panels of the kit.
  '.cm-tooltip': {
    backgroundColor: 'var(--uk-panel)',
    border: '1px solid var(--uk-border)',
    borderRadius: 'var(--uk-radius)',
    color: 'var(--uk-text)',
    boxShadow: '0 8px 24px color-mix(in srgb, var(--uk-shadow) 35%, transparent)',
    fontFamily: 'var(--uk-font)',
  },
  '.cm-tooltip-lint': { padding: '0' },
  '.cm-diagnostic': { padding: '6px 10px', borderLeft: '2px solid var(--uk-error)', fontSize: '12px', maxWidth: '520px' },
  '.cm-diagnostic-warning': { borderLeftColor: 'var(--uk-warn)' },
  '.cm-diagnostic-info': { borderLeftColor: 'var(--uk-info)' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul': { fontFamily: 'var(--uk-mono)', fontSize: '12px', maxHeight: '240px' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li': { padding: '3px 10px', lineHeight: '18px' },
  '.cm-tooltip-autocomplete ul li[aria-selected]': { backgroundColor: 'color-mix(in srgb, var(--uk-accent) 22%, transparent)', color: 'var(--uk-text)' },
  '.cm-completionDetail': { color: 'var(--uk-muted)', fontStyle: 'normal', marginLeft: '12px' },
  '.cm-completionMatchedText': { textDecoration: 'none', color: 'var(--uk-accent)' },
  '.cm-completionInfo': { padding: '8px 10px', maxWidth: '360px', fontSize: '12px', lineHeight: '1.5' },
  '.cm-completionIcon': { display: 'none' },
  '.uk-code-hover': { padding: '8px 10px', maxWidth: '420px', fontSize: '12px', lineHeight: '1.5' },
  '.uk-code-hover b': { fontFamily: 'var(--uk-mono)' },
  '.uk-code-hover span': { color: 'var(--uk-muted)', fontFamily: 'var(--uk-mono)', marginLeft: '8px' },
  '.uk-code-hover p': { margin: '6px 0 0' },
});

/** Its colours, the kit's: keys info, strings ok, numbers and words warn, comments muted. */
const highlight = HighlightStyle.define([
  { tag: [t.propertyName, t.definition(t.propertyName)], color: 'var(--uk-info)' },
  { tag: [t.string, t.special(t.string)], color: 'var(--uk-ok)' },
  { tag: [t.number, t.bool, t.null, t.atom, t.keyword], color: 'var(--uk-warn)' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--uk-muted)', fontStyle: 'italic' },
  { tag: [t.labelName, t.typeName, t.meta], color: 'var(--uk-accent)' },
  { tag: [t.punctuation, t.separator, t.bracket], color: 'var(--uk-muted)' },
  { tag: t.invalid, color: 'var(--uk-error)' },
]);

/** JSON's own errors, as its parser says them. */
const jsonLint = jsonParseLinter();

/** Told anew what is wrong (problems, a schema): checked again, the text unchanged. */
const relint = StateEffect.define<null>();

/** Read only: not editable, no line of its own (no caret in it); else its line marked. */
const readOnlyOf = (readOnly: boolean): Extension => [EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly), readOnly ? [] : highlightActiveLine()];

const languageOf = (l: Language): Extension => (l === 'yaml' ? yaml() : l === 'json' ? json() : []);

export function createEditor(o: EditorOptions): Editor {
  let current = { schema: o.schema, problems: o.problems, language: o.language };
  // Set from outside (its value given): not told back as a change.
  let setting = false;
  const lang = new Compartment();
  const readOnly = new Compartment();

  // What is wrong: its YAML and its schema's (a YAML text), then what it is told.
  const lint = linter(
    (view): Diagnostic[] => {
      const text = view.state.doc.toString();
      const end = text.length;
      // Within the text, a character at least (one at its end: the last; an empty text: none of more than its place) — underlined.
      const clamp = (d: Diagnostic): Diagnostic => {
        const from = Math.max(0, Math.min(d.from, d.to <= d.from ? end - 1 : end));
        return { ...d, from, to: Math.min(Math.max(d.to, from + 1), end) };
      };
      const own: Diagnostic[] = current.language === 'yaml' ? problems(text, current.schema) : current.language === 'json' && text.trim() ? jsonLint(view) : [];
      o.onErrors?.(own.filter((d) => d.severity === 'error').length);
      const told = current.problems.map((p): Diagnostic => {
        const at = p.path ? rangeOfPath(text, p.path) : p.line && p.line <= view.state.doc.lines ? view.state.doc.line(p.line) : undefined;
        const from = at?.from ?? 0;
        return { from, to: Math.max(from + 1, at?.to ?? 1), message: p.message, severity: p.severity ?? 'error' };
      });
      return [...own, ...told].map(clamp);
    },
    { delay: 250, needsRefresh: (u) => u.transactions.some((tr) => tr.effects.some((e) => e.is(relint))) },
  );

  // What may be typed: its schema's fields, a field's values.
  const complete = (ctx: CompletionContext) => {
    if (current.language !== 'yaml' || !current.schema) return null;
    const c = completions(ctx.state.doc.toString(), ctx.pos, current.schema);
    if (!c || (!c.options.length && !ctx.explicit)) return null;
    return {
      from: c.from,
      options: c.options.map((x) => ({ label: x.label, detail: x.detail, ...(x.info ? { info: x.info } : {}), apply: x.apply, type: x.type })),
      validFor: /^[\w./-]*$/,
    };
  };

  // A key's description, on hover: its path, its type.
  const hover = hoverTooltip((view, pos) => {
    if (current.language !== 'yaml' || !current.schema) return null;
    const f = fieldAt(view.state.doc.toString(), pos);
    const s = f && schemaAt(current.schema, f.path);
    if (!f || !s) return null;
    return {
      pos: f.from,
      end: f.to,
      above: true,
      create: () => {
        const dom = document.createElement('div');
        dom.className = 'uk-code-hover';
        const head = document.createElement('div');
        const b = document.createElement('b');
        b.textContent = String(f.path[f.path.length - 1]);
        const ty = document.createElement('span');
        ty.textContent = typeName(current.schema as Schema, s);
        head.append(b, ty);
        dom.append(head);
        if (s.description) {
          const p = document.createElement('p');
          p.textContent = s.description;
          dom.append(p);
        }
        return { dom };
      },
    };
  });

  const view = new EditorView({
    parent: o.parent,
    state: EditorState.create({
      doc: o.value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        foldGutter({ openText: '▾', closedText: '▸' }),
        lintGutter(),
        highlightSpecialChars(),
        history(),
        drawSelection(),
        indentOnInput(),
        indentUnit.of('  '),
        EditorState.tabSize.of(2),
        bracketMatching(),
        closeBrackets(),
        syntaxHighlighting(highlight),
        autocompletion({ override: [complete], icons: false, activateOnTyping: true }),
        hover,
        lint,
        keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, ...foldKeymap, ...completionKeymap, ...lintKeymap, indentWithTab]),
        lang.of(languageOf(o.language)),
        readOnly.of(readOnlyOf(o.readOnly)),
        EditorView.lineWrapping,
        ...(o.placeholder ? [placeholderText(o.placeholder)] : []),
        theme,
        EditorView.updateListener.of((u) => {
          if (u.docChanged && !setting) o.onChange?.(u.state.doc.toString());
        }),
      ],
    }),
  });

  return {
    set(value) {
      if (value === view.state.doc.toString()) return;
      setting = true;
      try {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
      } finally {
        setting = false;
      }
    },
    configure(next) {
      const langChanged = next.language !== current.language;
      current = { schema: next.schema, problems: next.problems, language: next.language };
      view.dispatch({
        effects: [readOnly.reconfigure(readOnlyOf(next.readOnly)), ...(langChanged ? [lang.reconfigure(languageOf(next.language))] : []), relint.of(null)],
      });
    },
    focus: () => view.focus(),
    destroy: () => view.destroy(),
  };
}
