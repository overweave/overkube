import { addNameMark, type KubeContributor, type NameMarkProps, openIn } from '@overkube/sdk';
import { ObjectRef, useList, usePage, useSay } from '@overkube/sdk/preact';
import { Status, Tip } from '@overkube/uikit';
import { byName, F, own, ref, STATE } from './kinds.ts';
import { FluxState, Revision, stateOf, text } from './state.tsx';
import { T } from './texts.ts';

/*
 * What Flux applied, marked beside its name in its kind's table — and what
 * a workload of it runs (its pods, its replica sets: addNameMark): Flux's
 * mark (git-branch), a link opening what applied it (its Kustomization,
 * its HelmRelease). Its tip says which, and the revision it applied —
 * asked only once the tip is open (no join of every row). In its view,
 * under Managed By: what applied it as it is now (its state, the revision
 * applied → attempted, its source).
 */

/** What applied it (the mark's value: Kustomization namespace/name): its kind, namespace, name. */
function applierOf(value: string) {
  const [k = '', where = ''] = value.split(' ');
  const [namespace = '', name = ''] = where.split('/');
  const kind = byName(k);
  return kind && name ? { kind, namespace, name } : undefined;
}

/** Its applier's fields, of it alone. */
function useApplier(value: string, select: readonly string[]) {
  const a = applierOf(value);
  const got = useList(
    a ? { kind: ref(a.kind), scope: { namespaces: [a.namespace] }, where: { field: 'core.name', op: 'eq', value: a.name }, page: { limit: 1 }, select } : undefined,
  );
  return { a, values: got.items[0]?.values };
}

function MarkTip({ value }: { value: string }) {
  const say = useSay();
  const kind = applierOf(value)?.kind;
  const { a, values } = useApplier(value, kind ? [own(F.applied, kind)] : []);
  if (!a) return null;
  const revision = text(values?.[own(F.applied, a.kind)]);
  const name = `${a.namespace}/${a.name}`;
  return <>{revision ? say(T.markRevision, { kind: a.kind.kind, name, revision }) : say(T.mark, { kind: a.kind.kind, name })}</>;
}

function FluxMark({ value }: NameMarkProps) {
  const say = useSay();
  const page = usePage();
  const a = applierOf(value);
  if (!a) return null;
  const label = say(T.mark, { kind: a.kind.kind, name: `${a.namespace}/${a.name}` });
  return (
    <Tip content={() => <MarkTip value={value} />}>
      <a class="uk-mark-link" aria-label={label} href={page.href(openIn(`/k/${ref(a.kind)}`, a.kind, { metadata: { name: a.name, namespace: a.namespace } }))}>
        <Status tone="unknown" icon="git" />
      </a>
    </Tip>
  );
}

function FluxDetail({ value }: NameMarkProps) {
  const say = useSay();
  const kind = applierOf(value)?.kind;
  const { a, values } = useApplier(value, kind ? [...STATE, own(F.applied, kind), F.attempted, F.source] : []);
  if (!a) return null;
  const state = stateOf(STATE.map((f) => values?.[f]));
  const [sourceKind = '', sourceNamespace = '', sourceName = ''] = text(values?.[F.source]).split('/');
  const source = byName(sourceKind);
  return (
    <>
      <dt>{say(T.managed.flux)}</dt>
      <dd>
        <span class="uk-line">
          <ObjectRef kind={a.kind.id} name={a.name} namespace={a.namespace} />
          {values && <FluxState {...state} />}
        </span>
      </dd>
      {values && (
        <>
          <dt>{say(T.managed.revision)}</dt>
          <dd>
            <Revision applied={text(values[own(F.applied, a.kind)])} attempted={text(values[F.attempted])} failed={state.ready === 'False'} />
          </dd>
        </>
      )}
      {source && (
        <>
          <dt>{say(T.managed.source)}</dt>
          <dd>
            <ObjectRef kind={source.id} name={sourceName} namespace={sourceNamespace} />
          </dd>
        </>
      )}
    </>
  );
}

export function addMark(c: KubeContributor): void {
  addNameMark(c, 'flux.applied-by', { target: {}, field: F.by, render: FluxMark, detail: FluxDetail, order: 5 });
}
