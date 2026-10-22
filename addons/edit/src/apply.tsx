import type { KindInfo, KubeObject } from '@overkube/kube-types';
import type { Cluster, KindSchema } from '@overkube/sdk';
import { OpenedView, useSay, useServedKinds } from '@overkube/sdk/preact';
import { Button, CodeEditor, type CodeProblem, type CodeSchema, Status, Switch } from '@overkube/uikit';
import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { type Document, isNode, parseAllDocuments } from 'yaml';
import { fieldPath, refusalOf } from './asked.ts';
import { T } from './texts.ts';

/*
 * YAML of any objects applied, as kubectl apply --server-side does it: one
 * document or many (---, a List's items); each object's kind as the
 * cluster serves it (none: "no matches for kind"), its namespace its own
 * (else default); checked by the API server as it is typed (a dry run of
 * each against the cluster as it is: what it refuses, underlined at its
 * line — told, not in the way: one may need those before it applied, a
 * Namespace, as kubectl applies them) — its kind's schema too, one object
 * alone (its errors in the way); applied each in turn (a server-side apply
 * in the addon's name: --force-conflicts takes over fields others manage),
 * told as kubectl tells it (deployment.apps/web serverside-applied).
 */

/** The server's dry run, this long after the last key (ms). */
const DRY_RUN_MS = 600;

/** Dry runs at once, at most (a manifest of hundreds: not hundreds of requests at a time). */
const AT_ONCE = 8;

/** Each item done by fn, at most `n` at once: their results in their order. */
async function limited<T, R>(items: readonly T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

interface Found {
  object: KubeObject;
  kind?: KindInfo;
  /** What kubectl calls it: deployment.apps/web. */
  name: string;
  /** Its document, and where it starts in the text. */
  doc: Document;
  /** Not to be applied, and why (its kind not served, no name). */
  wrong?: string;
}

/** A kind by its apiVersion and kind (apps/v1 Deployment). */
const typeOf = (apiVersion: unknown, kind: unknown) => `${String(apiVersion)} ${String(kind)}`;

/** Each object of the text (a List's items one by one), its kind as served, or the YAML's errors. */
function objectsOf(text: string, kinds: ReadonlyMap<string, KindInfo>): { found: Found[]; errors: CodeProblem[] } {
  const found: Found[] = [];
  const errors: CodeProblem[] = [];
  for (const doc of parseAllDocuments(text)) {
    for (const e of doc.errors) errors.push({ message: e.message.split('\n')[0] ?? e.message, line: lineAt(text, e.pos[0]) });
    if (doc.errors.length) continue;
    const value = doc.toJS() as KubeObject | null;
    if (!value || typeof value !== 'object') continue;
    const items = value.kind === 'List' && Array.isArray((value as { items?: unknown }).items) ? ((value as { items: KubeObject[] }).items ?? []) : [value];
    for (const object of items) {
      const kind = kinds.get(typeOf(object.apiVersion, object.kind));
      const name = object.metadata?.name ?? '';
      const called = `${(object.kind ?? '').toLowerCase()}${kind?.group ? `.${kind.group}` : ''}/${name}`;
      const wrong = !object.apiVersion
        ? "Object 'apiVersion' is missing"
        : !object.kind
          ? "Object 'Kind' is missing"
          : !kind
            ? `no matches for kind "${object.kind}" in version "${object.apiVersion}"`
            : !name
              ? 'resource name may not be empty'
              : undefined;
      found.push({ object, name: called, doc, ...(kind ? { kind } : {}), ...(wrong ? { wrong } : {}) });
    }
  }
  return { found, errors };
}

const lineAt = (text: string, offset: number) => text.slice(0, Math.max(0, offset)).split('\n').length;

/** Where a field of a document is (its line): the nearest of its path there; none, the document's first. */
function lineOfPath(text: string, doc: Document, path: readonly (string | number)[]): number {
  for (let n = path.length; n > 0; n--) {
    const node = doc.getIn(path.slice(0, n), true);
    if (isNode(node) && node.range) return lineAt(text, node.range[0]);
  }
  // Its first line of its own (not the --- before it).
  return lineAt(text, (isNode(doc.contents) ? doc.contents.range?.[0] : undefined) ?? doc.range?.[0] ?? 0);
}

/** Its namespace: its own, else default (a namespaced kind's). */
const placed = (f: Found): KubeObject =>
  f.kind?.namespaced && !f.object.metadata?.namespace ? ({ ...f.object, metadata: { ...f.object.metadata, namespace: 'default' } } as KubeObject) : f.object;

type Check = { state: 'checking' } | { state: 'ok' } | { state: 'applied' } | { state: 'error'; message: string; causes: readonly CodeProblem[] };

export function ApplyYaml({ cluster, onClose }: { cluster: Cluster; onClose: () => void }) {
  const say = useSay();
  const { kinds } = useServedKinds();
  const [text, setText] = useState('');
  const [force, setForce] = useState(false);
  const [checks, setChecks] = useState<readonly Check[]>([]);
  // Applied: what each came to, for the text it was applied as (another typed since, or the flag changed: none).
  const [applying, setApplying] = useState<{ text: string; results: readonly Check[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [schema, setSchema] = useState<KindSchema | undefined>();
  // What the editor finds wrong itself (against one object's schema): not applied so.
  const [erring, setErring] = useState(0);
  const gone = useRef(false);
  useEffect(
    () => () => {
      gone.current = true;
    },
    [],
  );
  const byType = useMemo(() => new Map([...kinds.values()].map((k) => [typeOf(k.group ? `${k.group}/${k.version}` : k.version, k.kind), k])), [kinds]);
  const { found, errors } = useMemo(() => objectsOf(text, byType), [text, byType]);
  const applied = applying && applying.text === text ? applying.results : null;

  // One object alone: its kind's schema (its fields offered, checked as typed).
  const only = found.length === 1 ? found[0]?.kind : undefined;
  useEffect(() => {
    let stop = false;
    if (only) void cluster.schema(only).then((s) => !stop && setSchema(s));
    else setSchema(undefined);
    return () => {
      stop = true;
    };
  }, [only?.id]);

  // One object applied (or checked only): a server-side apply in the addon's name; its refusal's causes, each at its line.
  const run = async (f: Found, dryRun: boolean): Promise<Check> => {
    if (f.wrong) return { state: 'error', message: f.wrong, causes: [] };
    try {
      const o = placed(f);
      await cluster.patch(f.kind as KindInfo, o, { type: 'apply', patch: o, force, dryRun });
      return { state: dryRun ? 'ok' : 'applied' };
    } catch (error) {
      const r = refusalOf(error);
      return { state: 'error', message: r.message, causes: r.causes.map((c) => ({ message: c.message, line: lineOfPath(text, f.doc, c.field ? fieldPath(c.field) : []) })) };
    }
  };

  // The server's dry run of each, a moment after the last key (not again once applied: the kinds it made served anew).
  useEffect(() => {
    if (applied) return;
    if (!found.length || errors.length) return setChecks([]);
    setChecks(found.map(() => ({ state: 'checking' })));
    let stop = false;
    const at = setTimeout(async () => {
      const results = await limited(found, AT_ONCE, (f) => (stop ? Promise.resolve<Check>({ state: 'checking' }) : run(f, true)));
      if (!stop) setChecks(results);
    }, DRY_RUN_MS);
    return () => {
      stop = true;
      clearTimeout(at);
    };
  }, [found, force]);

  const apply = async () => {
    setBusy(true);
    const results: Check[] = [];
    // Each in turn, as kubectl applies them: one refused, the rest still applied.
    for (const f of found) {
      results.push(await run(f, false));
      if (gone.current) return;
      setApplying({ text, results: [...results] });
    }
    setBusy(false);
  };

  // Each row's state: applied, else its dry run's (those not applied yet keep theirs).
  const states = useMemo(() => found.map((_, i) => applied?.[i] ?? checks[i]), [found, applied, checks]);
  // What is wrong, each at its line: the YAML's; each object's refusal and its causes.
  const shown = useMemo(
    () => [
      ...errors,
      ...found.flatMap((f, i): CodeProblem[] => {
        const s = states[i];
        return s?.state === 'error' ? [{ message: `${f.name}: ${s.message}`, line: lineOfPath(text, f.doc, []) }, ...s.causes] : [];
      }),
    ],
    [errors, states],
  );
  const checking = checks.some((c) => c.state === 'checking');
  const done = !!applied && applied.length === found.length;
  const line = (i: number): ComponentChildren => {
    const s = states[i];
    if (!s) return null;
    if (s.state === 'checking')
      return (
        <Status tone="progress" icon="spinner">
          {say(T.apply.checking)}
        </Status>
      );
    if (s.state === 'error')
      return (
        <Status tone="error" icon="circle-x" title={s.message}>
          {s.message}
        </Status>
      );
    return s.state === 'applied' ? (
      <Status tone="ok" icon="circle-check">
        serverside-applied
      </Status>
    ) : (
      <Status tone="ok" icon="circle-check">
        {say(T.apply.valid)}
      </Status>
    );
  };

  return (
    <OpenedView
      title={say(T.apply.title)}
      onClose={onClose}
      footer={
        <div class="uk-bar" style={{ width: '100%' }} data-part="apply-footer">
          <span class="uk-quiet" style={{ fontSize: '12px' }}>
            {!found.length && !errors.length
              ? say(T.apply.empty)
              : errors.length
                ? say(T.edit.notYaml)
                : done
                  ? say(T.apply.done, { count: applied.filter((c) => c.state === 'applied').length, of: found.length })
                  : say(T.apply.objects, { count: found.length })}
          </span>
          <span style={{ flex: 1 }} />
          <Button variant="ghost" onClick={onClose}>
            {done ? say(T.close) : say(T.cancel)}
          </Button>
          {!done && (
            <Button variant="primary" busy={busy} disabled={!found.length || errors.length > 0 || erring > 0 || checking} onClick={() => void apply()}>
              {say(T.edit.apply)}
            </Button>
          )}
        </div>
      }
    >
      <style>{CSS}</style>
      <div class="ok-apply" data-part="apply">
        <span class="uk-quiet" style={{ fontSize: '12px' }}>
          {say(T.apply.hint)}
        </span>
        <CodeEditor
          value={text}
          onChange={setText}
          label="apply.yaml"
          placeholder={PLACEHOLDER}
          {...(schema ? { schema: schema as CodeSchema } : {})}
          problems={shown}
          onErrors={setErring}
          height="calc(100vh - 380px)"
        />
        <Switch
          checked={force}
          onChange={(v) => {
            setForce(v);
            setApplying(null);
          }}
          label={say(T.apply.force)}
        />
        {found.length > 0 && (
          <div class="ok-apply-list">
            {found.map((f, i) => (
              <div key={`${i}:${f.name}`} class="ok-apply-row" data-object={f.name}>
                <b>{f.name}</b>
                {line(i)}
              </div>
            ))}
          </div>
        )}
      </div>
    </OpenedView>
  );
}

const PLACEHOLDER = `apiVersion: v1
kind: ConfigMap
metadata:
  name: example
  namespace: default
data:
  key: value
---
# more objects, each its own document`;

const CSS = `
.ok-apply { display: flex; flex-direction: column; gap: 12px; grid-column: 1 / -1; min-height: 0; }
.ok-apply-list { display: flex; flex-direction: column; border: 1px solid var(--uk-border); border-radius: var(--uk-radius); overflow: auto; max-height: 160px; }
.ok-apply-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 7px 12px; font-size: 12px; }
.ok-apply-row + .ok-apply-row { border-top: 1px solid var(--uk-border); }
.ok-apply-row b { font-family: var(--uk-mono); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ok-apply-row .uk-status { max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`;
