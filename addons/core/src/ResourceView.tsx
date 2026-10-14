import type { KindInfo, KubeObject } from '@overkube/kube-types';
import { Action, type ActionSpec, kindRef, type MissingState, type ResourceProps, type ResourceRef, slots, takes } from '@overkube/sdk';
import { useGet, useMenu, useNotify, useOpened, usePage, useSay } from '@overkube/sdk/preact';
import { Button, Code, Modal, Notice, Section, toYaml } from '@overkube/uikit';
import type { Definition } from '@overweave/core';
import { inOrder } from '@overweave/ui';
import { slotElement, useDefinitions } from '@overweave/ui/preact';
import { useMemo, useState } from 'preact/hooks';
import { T } from './texts.ts';
import { Waiting } from './Waiting.tsx';

/**
 * A resource, opened over a page (?open=): its parts, each a slot of
 * resource.view — its title (the core's: its kind and name; a right click
 * on it, its menu), a summary, its sections (the core's YAML among them),
 * its footer (the core's: the Actions for its kind); not there, the
 * missing slot (the core's: on its way, refused, gone). Closed as the page
 * closes what it opened (useOpened): back to where it was opened from.
 */
export function ResourceView({ kind, namespace, name }: ResourceRef) {
  const { close } = useOpened();
  const say = useSay();
  const menu = useMenu('resource.context');
  const { object, state, error } = useGet<KubeObject>({ kind: kindRef(kind), ...(namespace ? { namespace } : {}), name });
  // The same props while it (or why it is not there) is the same: its parts not drawn again for another object's change.
  const props = useMemo(() => object && { kind, object }, [kind, object]);
  const missing = useMemo(() => ({ kind, namespace, name, state, ...(error ? { error } : {}) }), [kind, namespace, name, state, error]);
  const named = `${kind.kind} ${namespace ? `${namespace}/` : ''}${name}`;
  if (!object || !props) {
    return (
      <Modal title={named} placement="right" onClose={close}>
        {slotElement(slots.resource.view.missing, missing, { limit: 1 })}
      </Modal>
    );
  }
  return (
    <Modal
      title={
        // Its menu, as a row's: a right click, or the menu key (Shift+F10) on it — focusable for that.
        // biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/noNoninteractiveTabindex: a context menu's place, by mouse and keyboard.
        <span tabIndex={0} onContextMenu={(e) => menu({ kind, object, opened: true }, e, named)} onKeyDown={(e) => menu({ kind, object, opened: true }, e, named)}>
          {slotElement(slots.resource.view.title, props)}
        </span>
      }
      placement="right"
      onClose={close}
      footer={slotElement(slots.resource.view.footer, props)}
    >
      <div class="uk-region uk-details">
        {/* Shown as last seen: said so (the cluster's changes not coming, or refused). */}
        {state !== 'live' && (
          <Notice level="warn" icon="refresh">
            <span title={error?.message}>{say(state === 'stale' ? T.kind.table.stale : T.kind.refused, { kind: kind.plural, code: error?.code ?? '' })}</span>
          </Notice>
        )}
        {slotElement(slots.resource.view.summary, props)}
        {slotElement(slots.resource.view.sections, props)}
      </div>
    </Modal>
  );
}

/** Its title (the core's, resource.view.title): its kind and name. */
export function ResourceTitle({ kind, object }: ResourceProps) {
  const ns = object.metadata?.namespace;
  return <>{`${kind.kind} ${ns ? `${ns}/` : ''}${object.metadata?.name ?? ''}`}</>;
}

/** Not there (the core's, resource.view.missing): on its way, refused, not served, gone. */
export function ResourceMissing({ kind, name, state, error }: ResourceRef & MissingState) {
  const say = useSay();
  if (state === 'loading') return <Waiting label={say(T.resource.view.missing.loading, { kind: kind.kind, name })} />;
  if (state === 'error' && error?.code === 'not_served') return <Notice icon="puzzle">{say(T.kind.notServed, { kind: kind.id })}</Notice>;
  if (state === 'error' || state === 'denied')
    return (
      <Notice level="error" icon="warning">
        <span title={error?.message}>{say(T.kind.refused, { kind: kind.plural, code: error?.code ?? '' })}</span>
      </Notice>
    );
  return <Notice icon="puzzle">{say(state === 'stale' ? T.resource.view.missing.goneStale : T.resource.view.missing.gone, { kind: kind.kind, name })}</Notice>;
}

/** The object as YAML: the core's section, last. */
export function YamlSection({ object }: { object: KubeObject }) {
  const say = useSay();
  return (
    <Section title={say(T.resource.view.yaml.title)}>
      <Code>{toYaml(object)}</Code>
    </Section>
  );
}

/** An action asked about: which, for which object (its uid), the object as it was asked about. */
interface Asked {
  action: string;
  uid: string | undefined;
  object: KubeObject;
}

/** Its footer's actions (the core's, resource.view.footer): the Actions for its kind, a dangerous one asked first — for this object (its uid), done to the object asked about; what the cluster refuses said here, and told. */
export function Actions({ kind, object }: { kind: KindInfo; object: KubeObject }) {
  const page = usePage();
  const say = useSay();
  const notify = useNotify();
  const [asked, setAsked] = useState<Asked | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [refused, setRefused] = useState<{ action: string; message: string } | null>(null);
  const uid = object.metadata?.uid;
  // Asked about another object (one made anew under its name): asked about nothing.
  const asking = asked && asked.uid === uid ? asked.action : null;
  const actions = inOrder(useDefinitions(Action)).filter((a) => {
    if (!takes(a.spec.target, kind)) return false;
    try {
      return a.spec.when ? a.spec.when(object) : true;
    } catch (error) {
      page.report(a, 'when', error);
      return false;
    }
  });
  if (!actions.length) return null;
  const run = async (a: Definition<ActionSpec>, target: KubeObject) => {
    setAsked(null);
    setRefused(null);
    setBusy(a.name);
    try {
      await a.spec.run(target);
    } catch (error) {
      // The cluster's refusal (or the action's own failure): said here, and told.
      const message = error instanceof Error ? error.message : String(error);
      setRefused({ action: a.name, message });
      notify({ level: 'error', title: say(a.spec.title), text: message, key: `action:${a.name}` });
    } finally {
      setBusy(null);
    }
  };
  const press = (a: Definition<ActionSpec>) => {
    if (!a.spec.dangerous) return void run(a, object);
    // Done to the object asked about — not one that took its place since.
    if (asking === a.name && asked) return void run(a, asked.object);
    setAsked({ action: a.name, uid, object });
  };
  return (
    <div class="uk-region">
      {refused && (
        <Notice level="error" icon="warning" title={say(actions.find((a) => a.name === refused.action)?.spec.title ?? '')}>
          {refused.message}
        </Notice>
      )}
      <div class="uk-bar">
        {actions.map((a) => (
          <Button key={a.name} variant={a.spec.dangerous ? 'danger' : undefined} icon={a.spec.icon} busy={busy === a.name} onClick={() => press(a)}>
            {asking === a.name ? say(T.resource.view.actions.sure, { action: say(a.spec.title) }) : say(a.spec.title)}
          </Button>
        ))}
      </div>
    </div>
  );
}
