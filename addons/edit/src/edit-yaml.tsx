import type { KindInfo, KubeObject } from '@overkube/kube-types';
import type { Cluster, KindSchema } from '@overkube/sdk';
import { OpenedView, useNotify, useSay } from '@overkube/sdk/preact';
import { Button, CodeEditor, type CodeProblem, type CodeSchema, Diff, Status, TabBar, toYaml } from '@overkube/uikit';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { parse } from 'yaml';
import { fieldPath, refusalOf } from './asked.ts';
import { T } from './texts.ts';

/*
 * An object edited as kubectl edit does it: its manifest (no status, no
 * managedFields: the server's), checked as it is typed — its YAML, its
 * kind's schema as the cluster serves it (a CRD's too) — and, once it
 * changed and parses, by the API server itself (a dry run): what it would
 * refuse, underlined at its field. Its changes reviewed (a diff); applied
 * as a replace at the resourceVersion it was read at — one changed since
 * is refused (409), never overwritten: its changes kept, rebased on the
 * latest (its diff against that one), applied again if so asked.
 */

/** Its kind's apiVersion (apps/v1, v1). */
const apiVersionOf = (kind: KindInfo) => (kind.group ? `${kind.group}/${kind.version}` : kind.version);

/** What it is edited as: its apiVersion and kind first (its kind's: an object as listed says none of its own), no status, no managedFields. */
export function editable(o: KubeObject, kind: KindInfo): string {
  const { status: _status, apiVersion: _v, kind: _k, ...rest } = o as KubeObject & { status?: unknown };
  const { managedFields: _managed, ...metadata } = rest.metadata ?? {};
  return toYaml({ apiVersion: apiVersionOf(kind), kind: kind.kind, ...rest, metadata });
}

/** The server's dry run, this long after the last key (ms). */
const DRY_RUN_MS = 600;

type Check = { state: 'idle' } | { state: 'checking' } | { state: 'valid' } | { state: 'invalid'; message: string; problems: CodeProblem[] };

export function EditYaml({ kind, object, cluster, onClose }: { kind: KindInfo; object: KubeObject; cluster: Cluster; onClose: () => void }) {
  const say = useSay();
  const notify = useNotify();
  const name = object.metadata?.name ?? '';
  // What it was when the dialog opened (or reloaded): the base its changes are against, its resourceVersion the replace's.
  const [base, setBase] = useState(object);
  const before = useMemo(() => editable(base, kind), [base]);
  const [text, setText] = useState(before);
  const [tab, setTab] = useState<'yaml' | 'changes'>('yaml');
  const [schema, setSchema] = useState<KindSchema | undefined>();
  const [check, setCheck] = useState<Check>({ state: 'idle' });
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  // What the editor finds wrong itself (against its kind's schema): not applied so.
  const [erring, setErring] = useState(0);

  useEffect(() => {
    let gone = false;
    void cluster.schema(kind).then((s) => !gone && setSchema(s));
    return () => {
      gone = true;
    };
  }, [kind.id]);

  // Its text as an object: what changed, what may not (its identity).
  const parsed = useMemo((): { object?: KubeObject; error?: string } => {
    try {
      const o = parse(text) as KubeObject | null;
      if (!o || typeof o !== 'object') return { error: say(T.edit.notYaml) };
      const same = o.apiVersion === apiVersionOf(kind) && o.kind === kind.kind && o.metadata?.name === name && (o.metadata?.namespace ?? '') === (base.metadata?.namespace ?? '');
      return same ? { object: o } : { error: say(T.edit.identity) };
    } catch (error) {
      return { error: `${say(T.edit.notYaml)}: ${(error as Error).message.split('\n')[0]}` };
    }
  }, [text, base]);
  const changed = text !== before;
  // Sent at the version read, its status as it was (not edited here; a CRD's with no status subresource would lose it, as kubectl edit keeps it).
  const status = (base as { status?: unknown }).status;
  const sent = (o: KubeObject): KubeObject =>
    ({ ...o, metadata: { ...o.metadata, resourceVersion: base.metadata?.resourceVersion }, ...(status === undefined ? {} : { status }) }) as KubeObject;

  // The server's dry run, once it changed and parses — what it would refuse, at its fields.
  useEffect(() => {
    if (!changed || !parsed.object) return setCheck({ state: 'idle' });
    setCheck({ state: 'checking' });
    let gone = false;
    const at = setTimeout(() => {
      cluster
        .update(kind, sent(parsed.object as KubeObject), { dryRun: true })
        .then(() => !gone && setCheck({ state: 'valid' }))
        .catch((error: unknown) => {
          if (gone) return;
          const r = refusalOf(error);
          // Changed since it was read: what the replace would be refused for too.
          if (r.status === 409) return void setConflict(r.message);
          const problems = r.causes.length
            ? r.causes.map((c): CodeProblem => ({ message: c.message, ...(c.field ? { path: fieldPath(c.field) } : { line: 1 }) }))
            : [{ message: r.message, line: 1 }];
          setCheck({ state: 'invalid', message: r.message, problems });
        });
    }, DRY_RUN_MS);
    return () => {
      gone = true;
      clearTimeout(at);
    };
  }, [text, base]);

  const apply = async () => {
    if (!parsed.object) return;
    setBusy(true);
    setConflict(null);
    try {
      await cluster.update(kind, sent(parsed.object));
      notify({ level: 'ok', title: `${kind.kind} ${name}`, text: say(T.edit.applied) });
      onClose();
    } catch (error) {
      const r = refusalOf(error);
      if (r.status === 409) setConflict(r.message);
      else setCheck({ state: 'invalid', message: r.message, problems: [{ message: r.message, line: 1 }] });
    } finally {
      setBusy(false);
    }
  };
  // Changed since: the latest its base (its resourceVersion the replace's), the changes typed kept — the diff says what they now change.
  const rebase = () => {
    setBase(object);
    setConflict(null);
  };
  const lines = useMemo(() => {
    if (!changed) return 0;
    const [a, b] = [before.split('\n'), text.split('\n')];
    let n = 0;
    for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) n++;
    return n;
  }, [text, before]);
  const problems = check.state === 'invalid' ? check.problems : NONE;
  const invalid = !!parsed.error || erring > 0 || check.state === 'invalid';

  return (
    <OpenedView
      title={say(T.edit.title, { kind: kind.kind, name })}
      onClose={onClose}
      tabs={
        <TabBar
          label={say(T.edit.title, { kind: kind.kind, name })}
          tabs={[
            { key: 'yaml', label: say(T.edit.yaml) },
            { key: 'changes', label: changed ? say(T.edit.changedLines, { count: lines }) : say(T.edit.changes) },
          ]}
          active={tab}
          onSelect={(k) => setTab(k as 'yaml' | 'changes')}
        />
      }
      footer={
        <div class="uk-bar" style={{ width: '100%' }} data-part="edit-footer">
          {conflict ? (
            <Status tone="error" icon="circle-x" title={conflict}>
              409 Conflict
            </Status>
          ) : parsed.error ? (
            <Status tone="error" icon="circle-x" title={parsed.error}>
              {parsed.error}
            </Status>
          ) : erring > 0 ? (
            <Status tone="error" icon="circle-x">
              {say(T.edit.schema, { count: erring })}
            </Status>
          ) : check.state === 'checking' ? (
            <Status tone="progress" icon="spinner">
              {say(T.edit.checking)}
            </Status>
          ) : check.state === 'invalid' ? (
            <Status tone="error" icon="circle-x" title={check.message}>
              {say(T.edit.invalid, { count: check.problems.length })}
            </Status>
          ) : check.state === 'valid' ? (
            <Status tone="ok" icon="circle-check">
              {say(T.edit.valid)}
            </Status>
          ) : (
            <span class="uk-quiet">{say(T.edit.noChanges)}</span>
          )}
          <span style={{ flex: 1 }} />
          <Button variant="ghost" onClick={onClose}>
            {say(T.cancel)}
          </Button>
          {conflict ? <Button onClick={rebase}>{say(T.edit.reload)}</Button> : tab === 'yaml' && changed && <Button onClick={() => setTab('changes')}>{say(T.edit.review)}</Button>}
          <Button variant="primary" busy={busy} disabled={!changed || invalid || check.state === 'checking' || !!conflict} onClick={() => void apply()}>
            {say(T.edit.apply)}
          </Button>
        </div>
      }
    >
      <div class="uk-stack" style={{ gridColumn: '1 / -1', height: '100%', minHeight: 0 }} data-part="edit-yaml">
        {tab === 'yaml' ? (
          <>
            <span class="uk-quiet" style={{ fontSize: '12px' }}>
              {say(T.edit.replaced, { version: base.metadata?.resourceVersion ?? '—' })}
            </span>
            <CodeEditor
              value={text}
              onChange={setText}
              label={say(T.edit.file, { kind: kind.kind.toLowerCase() })}
              {...(schema ? { schema: schema as CodeSchema } : {})}
              problems={problems}
              onErrors={setErring}
              height="calc(100vh - 230px)"
            />
          </>
        ) : (
          <Diff before={before} after={text} title={say(T.edit.file, { kind: kind.kind.toLowerCase() })} />
        )}
      </div>
    </OpenedView>
  );
}

const NONE: readonly CodeProblem[] = [];
