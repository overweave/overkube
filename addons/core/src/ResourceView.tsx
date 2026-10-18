import type { KindInfo, KubeObject } from '@overkube/kube-types';
import {
  Action,
  type ActionSpec,
  Appearance,
  accessOf,
  kindRef,
  type MissingState,
  type ResourceProps,
  type ResourceRef,
  ResourceTab,
  type ResourceTabSpec,
  slots,
  tabbedIn,
  tabIn,
  takes,
} from '@overkube/sdk';
import { useGet, useMenu, useNotify, useOpened, usePage, useSay, useUser } from '@overkube/sdk/preact';
import { Button, Modal, Notice, Segmented, TabBar, Tip, toYaml, YamlView } from '@overkube/uikit';
import type { Definition } from '@overweave/core';
import { inOrder } from '@overweave/ui';
import { slotElement, useDefinition, useDefinitions } from '@overweave/ui/preact';
import { useId, useMemo, useState } from 'preact/hooks';
import { T } from './texts.ts';
import { Waiting } from './Waiting.tsx';

/**
 * A resource, opened over a page (?open=): its parts, each a slot of
 * resource.view — its title (the core's: its kind, name and namespace; a
 * right click on it, its menu), its marks after it, beside them its header (the core's: how it is
 * laid out), its tabs (ResourceTabs for its kind and object, in order: the
 * core's Overview first, YAML last — each a slot of its own), its footer
 * (the core's: the Actions for its kind); not there, the missing slot (the
 * core's: on its way, refused, gone). Laid out as the user chose (a side
 * panel, a window, all the window: its header's switch, one for all of
 * them). Closed as the page closes what it opened (useOpened): back to
 * where it was opened from.
 */
export function ResourceView({ kind, namespace, name }: ResourceRef) {
  const layout = useLayout();
  const { close } = useOpened();
  const say = useSay();
  const menu = useMenu('resource.context');
  const { object, state, error } = useGet<KubeObject>({ kind: kindRef(kind), ...(namespace ? { namespace } : {}), name });
  // The same props while it (or why it is not there) is the same: its parts not drawn again for another object's change.
  const props = useMemo(() => object && { kind, object }, [kind, object]);
  const missing = useMemo(() => ({ kind, namespace, name, state, ...(error ? { error } : {}) }), [kind, namespace, name, state, error]);
  const named = `${kind.kind} ${namespace ? `${namespace}/` : ''}${name}`;
  const tabs = useTabs(kind, object);
  // The tab shown: the one the path says (&open-tab=: a link to it, kept as it is chosen); none, or not one of its: its first.
  const page = usePage();
  const asked = tabIn(page.path.value);
  const panel = useId();
  if (!object || !props) {
    return (
      <Modal title={<Titled kind={kind} name={name} namespace={namespace} />} placement={layout} onClose={close}>
        {slotElement(slots.resource.view.missing, missing, { limit: 1 })}
      </Modal>
    );
  }
  const shown = tabs.find((t) => t.name === asked) ?? tabs[0];
  return (
    <Modal
      title={
        // Its menu, as a row's: a right click, or the menu key (Shift+F10) on it — focusable for that.
        <>
          {/* biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/noNoninteractiveTabindex: a context menu's place, by mouse and keyboard. */}
          <span tabIndex={0} onContextMenu={(e) => menu({ kind, object, opened: true }, e, named)} onKeyDown={(e) => menu({ kind, object, opened: true }, e, named)}>
            {slotElement(slots.resource.view.title, props)}
          </span>
          {slotElement(slots.resource.view.marks, props)}
        </>
      }
      actions={slotElement(slots.resource.view.header, props)}
      tabs={
        tabs.length > 1 && (
          <TabBar
            label={say(T.resource.view.tabs.label)}
            tabs={tabs.map((t) => ({ key: t.name, label: say(t.spec.title), icon: accessOf(t, props) === 'marked' ? 'denied' : t.spec.icon }))}
            active={shown?.name}
            onSelect={(tab) => page.navigate(tabbedIn(page.path.peek(), tab === tabs[0]?.name ? undefined : tab), { replace: true })}
            panel={panel}
          />
        )
      }
      placement={layout}
      onClose={close}
      footer={slotElement(slots.resource.view.footer, props)}
    >
      {/* Shown as last seen: said so (the cluster's changes not coming, or refused). */}
      {state !== 'live' && (
        <Notice level="warn" icon="refresh">
          <Tip content={() => error?.message}>{say(state === 'stale' ? T.kind.table.stale : T.kind.refused, { kind: kind.plural, code: error?.code ?? '' })}</Tip>
        </Notice>
      )}
      {shown && (
        <div class="uk-region uk-details" role="tabpanel" id={panel} aria-labelledby={tabs.length > 1 ? `${panel}-${shown.name}` : undefined} data-tab={shown.name}>
          {slotElement(slots.resource.view.tab(shown.name), props)}
        </div>
      )}
    </Modal>
  );
}

/** Its tabs: the ResourceTabs for its kind and object, not hidden, not denied the one signed in, in order. */
function useTabs(kind: KindInfo, object: KubeObject | undefined): Definition<ResourceTabSpec>[] {
  const page = usePage();
  return inOrder(useDefinitions(ResourceTab)).filter((t) => {
    if (t.spec.hidden || !object || !takes(t.spec.target, kind) || accessOf(t, { kind, object }) === 'denied') return false;
    try {
      return t.spec.when ? t.spec.when(object) : true;
    } catch (error) {
      page.report(t, 'when', error);
      return false;
    }
  });
}

/** Its Overview (the core's, in its tab): its summary over its sections. */
export function ResourceOverview(props: ResourceProps) {
  return (
    <>
      {slotElement(slots.resource.view.summary, props)}
      {slotElement(slots.resource.view.sections, props)}
    </>
  );
}

/** How an opened resource is laid out, as the Appearance says (a side panel, unless said). */
const useLayout = () => useDefinition(Appearance, 'default')?.spec.layout ?? 'right';

/** How it is laid out, switched (the core's, in resource.view.header: as icons; the settings', in words): one for every resource opened — the user's (Appearance.layout), kept. */
export function LayoutSwitch({ words = false }: { words?: boolean }) {
  const say = useSay();
  const user = useUser();
  const l = T.resource.view.layout;
  return (
    <Segmented
      label={say(l.label)}
      value={useLayout()}
      onChange={(layout) => user.patch('Appearance', 'default', { layout })}
      options={[
        { value: 'right', label: say(l.right), ...(words ? {} : { icon: 'panel-right' }) },
        { value: 'center', label: say(l.center), ...(words ? {} : { icon: 'window' }) },
        { value: 'full', label: say(l.full), ...(words ? {} : { icon: 'maximize' }) },
      ]}
    />
  );
}

/** Its title (the core's, resource.view.title): its kind and name, its namespace quiet. */
export const ResourceTitle = ({ kind, object }: ResourceProps) => <Titled kind={kind} name={object.metadata?.name ?? ''} namespace={object.metadata?.namespace} />;

/** A resource's kind and name, its namespace quiet: its title, there or not. */
function Titled({ kind, name, namespace }: ResourceRef) {
  return (
    <>
      {`${kind.kind} ${name}`}
      {namespace && <small> {namespace}</small>}
    </>
  );
}

/** Not there (the core's, resource.view.missing): on its way, refused, not served, gone. */
export function ResourceMissing({ kind, name, state, error }: ResourceRef & MissingState) {
  const say = useSay();
  if (state === 'loading') return <Waiting label={say(T.resource.view.missing.loading, { kind: kind.kind, name })} />;
  if (state === 'error' && error?.code === 'not_served') return <Notice icon="puzzle">{say(T.kind.notServed, { kind: kind.id })}</Notice>;
  if (state === 'error' || state === 'denied')
    return (
      <Notice level="error" icon="warning">
        <Tip content={() => error?.message}>{say(T.kind.refused, { kind: kind.plural, code: error?.code ?? '' })}</Tip>
      </Notice>
    );
  return <Notice icon="puzzle">{say(state === 'stale' ? T.resource.view.missing.goneStale : T.resource.view.missing.gone, { kind: kind.kind, name })}</Notice>;
}

/** The object as YAML (the core's, in its tab). */
export function Yaml({ object }: ResourceProps) {
  const say = useSay();
  const y = T.resource.view.yaml;
  const text = useMemo(() => toYaml(object), [object]);
  return (
    <YamlView
      text={text}
      name={object.metadata?.name}
      labels={{
        size: (count, size) => say(y.size, { count, size }),
        copy: say(y.copy),
        copied: say(y.copied),
        download: say(y.download),
        wrap: say(y.wrap),
        folded: (count) => say(y.folded, { count }),
        fold: say(y.fold),
      }}
    />
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
    if (!takes(a.spec.target, kind) || accessOf(a, { kind, object }) === 'denied') return false;
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
          <Button
            key={a.name}
            variant={a.spec.dangerous ? 'danger' : undefined}
            icon={accessOf(a, { kind, object }) === 'marked' ? 'denied' : a.spec.icon}
            busy={busy === a.name}
            onClick={() => press(a)}
          >
            {asking === a.name ? say(T.resource.view.actions.sure, { action: say(a.spec.title) }) : say(a.spec.title)}
          </Button>
        ))}
      </div>
    </div>
  );
}
