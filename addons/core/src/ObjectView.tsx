import type { KindInfo, KubeObject } from '@overkube/kube-types';
import { Action, type ActionSpec, kindPath, type ObjectRef, objectPathOf, slots, takes } from '@overkube/sdk';
import { useCollection, useNotify, usePage } from '@overkube/sdk/preact';
import { Button, Code, Modal, Notice, toYaml } from '@overkube/uikit';
import type { Definition } from '@overweave/core';
import { inOrder } from '@overweave/ui';
import { slotElement, useDefinitions } from '@overweave/ui/preact';
import { useState } from 'preact/hooks';
import { Waiting } from './Waiting.tsx';

/**
 * An object, opened over its kind's table: its header and sections (the
 * object.* slots — the core's YAML among them), the Actions for its kind at
 * its foot. A dangerous one asks first — for this object (its uid), and is
 * done to the object asked about. What the cluster refuses is said in it
 * and told. Closed, the page goes back to the table (in place: Back does
 * not open it again), unless it went elsewhere meanwhile.
 */
export function ObjectView({ kind, namespace, name }: ObjectRef) {
  const page = usePage();
  const collection = useCollection(kind);
  const object = collection.items.value.get(namespace ? `${namespace}/${name}` : name);
  const here = objectPathOf(kind, { metadata: { name, namespace } });
  const close = () => {
    if (page.path.peek() === here) page.navigate(kindPath(kind), { replace: true });
  };
  const title = `${kind.kind} ${namespace ? `${namespace}/` : ''}${name}`;
  if (!object) {
    const state = collection.state.value;
    const error = collection.error.value;
    return (
      <Modal title={title} placement="right" onClose={close}>
        {state === 'loading' ? (
          <Waiting label={`Loading ${kind.kind} ${name}…`} />
        ) : state === 'error' ? (
          <Notice
            level="error"
            icon="warning"
            action={
              <Button variant="ghost" size="sm" icon="refresh" onClick={() => collection.retry()}>
                Try again
              </Button>
            }
          >
            <span title={error?.message}>
              {kind.plural} cannot be had: {error?.code}
            </span>
          </Notice>
        ) : state === 'absent' ? (
          <Notice icon="puzzle">The cluster does not serve {kind.id}.</Notice>
        ) : (
          <Notice icon="puzzle">
            There is no {kind.kind} {name}
            {state === 'stale' ? ' (as last seen: the page is reconnecting)' : ' (now)'}.
          </Notice>
        )}
      </Modal>
    );
  }
  return (
    <Modal title={title} placement="right" onClose={close} footer={<Actions kind={kind} object={object} />}>
      <div class="uk-region">
        {slotElement(slots.object.header, { kind, object })}
        {slotElement(slots.object.sections, { kind, object })}
      </div>
    </Modal>
  );
}

/** The object as YAML: the core's section, last. */
export function YamlSection({ object }: { object: KubeObject }) {
  return <Code>{toYaml(object)}</Code>;
}

/** An action asked about: which, for which object (its uid), the object as it was asked about. */
interface Asked {
  action: string;
  uid: string | undefined;
  object: KubeObject;
}

function Actions({ kind, object }: { kind: KindInfo; object: KubeObject }) {
  const page = usePage();
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
      notify({ level: 'error', title: a.spec.title, text: message, key: `action:${a.name}` });
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
        <Notice level="error" icon="warning" title={actions.find((a) => a.name === refused.action)?.spec.title}>
          {refused.message}
        </Notice>
      )}
      <div class="uk-bar">
        {actions.map((a) => (
          <Button key={a.name} variant={a.spec.dangerous ? 'danger' : undefined} icon={a.spec.icon} busy={busy === a.name} onClick={() => press(a)}>
            {asking === a.name ? `${a.spec.title}: sure?` : a.spec.title}
          </Button>
        ))}
      </div>
    </div>
  );
}
