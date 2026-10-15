import type { KindInfo, KubeObject, kinds, ObjectOf } from '@overkube/kube-types';
import type { QueryError, Scope, State, Where } from '@overkube/query';
import type { TabParts } from '@overkube/uikit';
import { type SlotRef, slot } from '@overweave/ui';
import type { ComponentChildren } from 'preact';
import type { PageProps } from './kinds.ts';
import type { Label } from './text.ts';

/*
 * The places of the page others put things in (Fills), each with what it is
 * drawn about — fill() types a fill's render by it. The frame's own (its
 * header, the navigation's tabs and side, the overlay, the menu, what the
 * user is told, the page at the path and the resource opened over it) are
 * drawn by the shell, the rest by what fills those (a kind's table's parts,
 * a resource's, the picker's items); a Page is a slot (and its regions
 * slots) of its own.
 */

/** A kind's table, as its toolbar and its empty state are given it. */
export interface ListState {
  /** Objects shown (those its where takes) and there are (none: not known yet). */
  shown?: number;
  total?: number;
  state: State;
  error?: QueryError;
}

/** About a kind. */
export interface KindProps {
  kind: KindInfo;
}

/** A table of a kind's objects: which kind, which of its objects (where, scope — with the TableView's where; none: all), what it is called over it (none: nothing). */
export interface KindTableProps extends KindProps {
  where?: Where;
  scope?: Scope;
  title?: Label;
  /** Inside another's frame (a resource's section): no frame of its own. */
  plain?: boolean;
}

/** Where a resource is: its kind, namespace, name (the resource itself is the view's to find). */
export interface ResourceRef {
  kind: KindInfo;
  namespace?: string;
  name: string;
}

/** A resource not there: on its way, refused (its error), or gone. */
export interface MissingState {
  state: State;
  error?: QueryError;
}

/** About one resource of a kind: its kind, the object. */
export interface ResourceProps {
  kind: KindInfo;
  object: KubeObject;
}

/**
 * A field of a resource's view (its summary's: one of its kind's columns,
 * by the column's name; its metadata's: created, uid, labels, …): its name,
 * what it is called, its value, and its value as text (a list's: none).
 */
export interface ResourceFieldProps extends ResourceProps {
  field: { name: string; label: string };
  value: unknown;
  display: string;
  /** What its column draws (a summary's field: its cell, live). */
  drawn?: ComponentChildren;
}

/** One of a resource's conditions (status.conditions), as the API gives it. */
export interface ResourceConditionProps extends ResourceProps {
  condition: { type: string; status: string; reason?: string; message?: string; lastTransitionTime?: string };
}

/** One of a resource's labels or annotations: its key (name: key is the page's own word), its value. */
export interface ResourceLabelProps extends ResourceProps {
  name: string;
  value: string;
}

/** One of a resource's owners (metadata.ownerReferences), as the API gives it. */
export interface ResourceOwnerProps extends ResourceProps {
  owner: { apiVersion: string; kind: string; name: string; uid: string; controller?: boolean };
}

/** One of the events about a resource (core/v1 Event), as the API gives it. */
export interface ResourceEventProps extends ResourceProps {
  event: { type?: string; reason?: string; message?: string; count?: number; lastSeen?: string; source?: string; uid?: string };
}

type PodSpec = NonNullable<ObjectOf<typeof kinds.core.v1.Pod>['spec']>;
type PodStatus = NonNullable<ObjectOf<typeof kinds.core.v1.Pod>['status']>;

/**
 * One of a pod's containers (an init container, a sidecar — an init
 * container that keeps running — or its own), or of a pod template's: its
 * spec as the API gives it, its status (a pod's: as it is now; a
 * template's, none).
 */
export interface ResourceContainerProps extends ResourceProps {
  container: {
    name: string;
    role?: 'init' | 'sidecar' | 'ephemeral';
    spec: PodSpec['containers'][number];
    status?: NonNullable<PodStatus['containerStatuses']>[number];
  };
}

/** One of a resource's finalizers. */
export interface ResourceFinalizerProps extends ResourceProps {
  finalizer: string;
}

/**
 * A tab of the navigation: where it leads, whether it is pinned, whether the
 * page is there; its kind (none: an addon's page); where it is drawn —
 * across the top, or down the side (collapsed there: its mark only seen).
 */
export interface NavTabProps extends NavTabsProps {
  entry: { key: string; title: string; path: string; icon?: string };
  kind?: KindInfo;
  pinned: boolean;
  current: boolean;
}

/** The tabs, where they are drawn: across the top, or down the side (collapsed there: marks only). */
export interface NavTabsProps {
  placement: 'top' | 'side';
  collapsed: boolean;
}

/** The picker (everything there is to go to), whole: closing it. */
export interface NavPickerProps {
  close: () => void;
}

/** Something in the picker: where it leads, its icon, its kind (none: an addon's page), the heading it is under in its section (a CRD's API group). */
export interface NavPickerEntry {
  key: string;
  title: string;
  path: string;
  icon?: string;
  kind?: KindInfo;
  heading?: string;
}

/** A section down the picker's side: its entries (typed: those that match). */
export interface NavPickerSection {
  key: string;
  title: string;
  icon?: string;
  entries: readonly NavPickerEntry[];
}

/**
 * What the picker's parts are given: what is typed, the sections (as
 * typed), the one shown (typed: none — every section's matches), pinning
 * an entry (kept at hand: a tab), closing it.
 */
export interface NavPickerPartProps extends NavPickerProps {
  query: string;
  onQuery: (query: string) => void;
  sections: readonly NavPickerSection[];
  chosen: string | null;
  choose: (section: string | null) => void;
  pinned: (key: string) => boolean;
  pin: (key: string, on: boolean) => void;
}

/** A section down the side, as the picker's parts are given it: which one, chosen or not. */
export interface NavPickerSectionProps extends NavPickerPartProps {
  section: NavPickerSection;
}

/** An entry of the picker, drawn: its kind (what fills for some kinds take it by; none: an addon's page), what is typed (to mark in it), pinned or not (and pinning it), closing the picker (it is gone to), its place among those shown. */
export interface NavPickerItemProps {
  entry: NavPickerEntry;
  kind?: KindInfo;
  query: string;
  pinned: boolean;
  pin: (on: boolean) => void;
  close: () => void;
  place: number;
}

export const slots = {
  /**
   * The page's header, each part in order: above it, a notice for the whole
   * page; its start (the core's: its mark and name, what it is about beside
   * them — header.sub); its end (others' controls).
   */
  header: {
    above: slot<Record<string, never>>('header.above'),
    start: slot<Record<string, never>>('header.start'),
    sub: slot<Record<string, never>>('header.sub'),
    end: slot<Record<string, never>>('header.end'),
  },
  nav: {
    /**
     * Everything there is to go to, as a picker (opened by the core's +):
     * whole, one fill drawn (the first that takes it — the core's the last).
     * Its parts, each in order: its header (the core's search); down its
     * side (the core's: every section — typed, all the matches first); a
     * section whole (one drawn: the core's, its icon and count) and what is
     * in it (the core's title); beside the side, what the chosen one shows
     * (the core's: its entries under their headings — typed, every
     * section's matches by section); an entry whole (one drawn: the core's,
     * a link, its icon, its pin) and what is in it (the core's title, what
     * is typed marked); nothing to show (one drawn: the core's, why — and
     * a way on).
     */
    picker: {
      ...slot<NavPickerProps>('nav.picker'),
      header: slot<NavPickerPartProps>('nav.picker.header'),
      side: slot<NavPickerPartProps>('nav.picker.side'),
      section: { ...slot<NavPickerSectionProps>('nav.picker.section'), content: slot<NavPickerSectionProps>('nav.picker.section.content') },
      content: slot<NavPickerPartProps>('nav.picker.content'),
      item: { ...slot<NavPickerItemProps>('nav.picker.item'), content: slot<NavPickerItemProps>('nav.picker.item.content') },
      empty: slot<NavPickerPartProps>('nav.picker.empty'),
    },
    /** Down its side: the navigation there (the core's: the tabs down a side rail — collapsed, peeking, pinned — when the NavView says side). */
    side: slot<Record<string, never>>('nav.side'),
    /**
     * Across the page, under its header: the navigation as tabs (the core's
     * strip; another's in its place). Its parts — the same down the side
     * (placement: 'side'): a tab drawn either way, by one fill.
     */
    tabs: {
      ...slot<Record<string, never>>('nav.tabs'),
      /**
       * A tab, whole: one fill drawn, the first that takes it — the core's the
       * last (a link: its attrs on its element, its × in it, what is in it the
       * content slot's). What is in it: tabs.tab.content, in order — the core's
       * title (core.nav.tabs.tab.title) among them, others before or after it.
       */
      tab: {
        ...slot<NavTabProps & TabParts>('nav.tabs.tab'),
        content: slot<NavTabProps>('nav.tabs.tab.content'),
        /** Down the side, before what is in it: its mark — what is seen of it collapsed (one fill drawn: the core's, its icon or its name's first letter, the last). */
        mark: slot<NavTabProps>('nav.tabs.tab.mark'),
      },
      /** After the tabs, in order — told where they are: the core's + (core.nav.tabs.picker: opening nav.picker, beside it down the side), others' buttons before or after it. */
      actions: slot<NavTabsProps>('nav.tabs.actions'),
    },
  },
  /** Over the page: what is opened over it (a palette, a panel); placed by what fills it. */
  overlay: slot<Record<string, never>>('overlay'),
  /** The context menu open (usePage().menu): drawn over everything, by what fills it. */
  menu: slot<Record<string, never>>('menu'),
  /** What the user is told: drawn over everything, a dialog too (the shell keeps it on top). */
  notifications: slot<Record<string, never>>('notifications'),
  kind: {
    /**
     * A kind's header, over its table on its page: whole, one fill drawn
     * (the first that takes the kind — the core's the last). The core's
     * parts, each in order: its title (the core's: the kind's name, as its
     * KindView says it), the line under it (the core's: its group and
     * version, how many there are), its actions at its end (none of the
     * core's).
     */
    header: {
      ...slot<KindProps>('kind.header'),
      title: slot<KindProps>('kind.header.title'),
      sub: slot<KindProps>('kind.header.sub'),
      actions: slot<KindProps>('kind.header.actions'),
    },
    /**
     * A table of a kind's objects, wherever it is drawn (<KindTable>): whole,
     * one fill drawn, the first that takes the kind — the core's the last.
     * The core's parts: over it, its toolbar, in order (its count, what can
     * be done); in a column's header, what is in it, in order (the core's
     * title among it — sorting, the width's handle the core's); with no
     * rows, one fill drawn in their place (the first that takes the kind —
     * the core's the last). A cell: its column's format of its values, wrapped by Wraps of
     * that column's name (wraps: 'core.name'), given the cell's props.
     */
    table: {
      ...slot<KindTableProps>('kind.table'),
      toolbar: slot<KindTableProps & { list: ListState }>('kind.table.toolbar'),
      column: { content: slot<KindProps & { column: { name: string; header: string } }>('kind.table.column.content') },
      empty: slot<KindTableProps & { list: ListState }>('kind.table.empty'),
    },
  },
  resource: {
    /**
     * A resource of the cluster opened (by its place): whole, one fill drawn
     * (the first that takes its kind — the core's the last). Its parts, each
     * in order: its title (the core's: its kind and name), beside it in its
     * header (the core's: how it is laid out — a side panel, a window, all
     * the window), a summary over its
     * sections, its sections (the core's: conditions, metadata, YAML), its
     * footer (the core's: the Actions); not there (on its way, gone,
     * refused), one fill drawn in its place (the core's the last).
     */
    view: {
      ...slot<ResourceRef>('resource.view'),
      title: slot<ResourceProps>('resource.view.title'),
      /** After its title, in order: marks of what it is (an addon's: managed by Flux, scanned by Trivy). */
      marks: slot<ResourceProps>('resource.view.marks'),
      header: slot<ResourceProps>('resource.view.header'),
      /**
       * Over its sections, in order (the core's: its kind's columns as
       * fields; being deleted, said first). A field whole: one fill drawn
       * (the core's the last: its label and value); in its label, in its
       * value, each in order (the core's: the column's header; its display,
       * live, in the Wraps of the column's name — as a table's cell).
       */
      summary: {
        ...slot<ResourceProps>('resource.view.summary'),
        field: {
          ...slot<ResourceFieldProps>('resource.view.summary.field'),
          label: slot<ResourceFieldProps>('resource.view.summary.field.label'),
          value: slot<ResourceFieldProps>('resource.view.summary.field.value'),
        },
      },
      /** A tab's (a ResourceTab, by its name): what it shows, in order (the core's Overview: its summary and sections; its YAML: the object). */
      tab,
      sections: slot<ResourceProps>('resource.view.sections'),
      /**
       * The core's conditions section's (status.conditions): a condition
       * whole, one fill drawn (the core's the last: a row — its status its
       * mark, its type, when it changed, why under it); its parts, each in
       * order (the core's: its type, status, reason, message, when it
       * changed — live).
       */
      conditions: {
        condition: {
          ...slot<ResourceConditionProps>('resource.view.conditions.condition'),
          type: slot<ResourceConditionProps>('resource.view.conditions.condition.type'),
          status: slot<ResourceConditionProps>('resource.view.conditions.condition.status'),
          reason: slot<ResourceConditionProps>('resource.view.conditions.condition.reason'),
          message: slot<ResourceConditionProps>('resource.view.conditions.condition.message'),
          changed: slot<ResourceConditionProps>('resource.view.conditions.condition.changed'),
        },
      },
      /**
       * The core's events' (the events about it: its Overview's recent ones,
       * its Events tab's all): an event whole, one fill drawn (the core's the
       * last: a row — its type its mark, its reason, how often and when last,
       * its message under it); its parts, each in order (the core's: its
       * type, reason, message, how often and when last — live).
       */
      events: {
        event: {
          ...slot<ResourceEventProps>('resource.view.events.event'),
          type: slot<ResourceEventProps>('resource.view.events.event.type'),
          reason: slot<ResourceEventProps>('resource.view.events.event.reason'),
          message: slot<ResourceEventProps>('resource.view.events.event.message'),
          seen: slot<ResourceEventProps>('resource.view.events.event.seen'),
        },
      },
      /**
       * A pod's own (the core's: its containers section): a container whole,
       * one fill drawn (the core's the last: a line opened for more — its
       * state its mark, its name, its image, ports and resources under it);
       * what can be done with it at its line's end, in order (an addon's:
       * its logs, a shell in it).
       */
      pod: {
        container: {
          ...slot<ResourceContainerProps>('resource.view.pod.container'),
          actions: slot<ResourceContainerProps>('resource.view.pod.container.actions'),
        },
      },
      /**
       * The core's related section's: what else it is tied to — its fields,
       * in order (the core's: its owners, core.resource.view.related.owners;
       * another's among them, drawing a field: a pod's node, a deployment's
       * pods). The section drawn only with a field in it. A field whole, one
       * fill drawn (the core's the last); its label, its value, each in order
       * (the core's: its name; its value — an owner's, one fill drawn each).
       */
      related: {
        ...slot<ResourceProps>('resource.view.related'),
        field: {
          ...slot<ResourceFieldProps>('resource.view.related.field'),
          label: slot<ResourceFieldProps>('resource.view.related.field.label'),
          value: slot<ResourceFieldProps>('resource.view.related.field.value'),
        },
        owner: slot<ResourceOwnerProps>('resource.view.related.owner'),
      },
      /**
       * The core's metadata section's: its fields, in order (the core's,
       * each a fill — created, uid, generation, labels, annotations,
       * finalizers: core.resource.view.metadata.<name>, 100 to 600 — another's
       * among them, drawing a field; one of the core's hidden, or all set out
       * otherwise, as any slot's: a patch of its Slot, hidden or
       * arrangement, by the fills' names — the user's too). A field whole, one fill drawn (the
       * core's the last); its label, its value, each in order (the core's:
       * its name; its value — a list's, each of its items, one fill drawn
       * each: a label, an annotation, a finalizer).
       */
      metadata: {
        ...slot<ResourceProps>('resource.view.metadata'),
        field: {
          ...slot<ResourceFieldProps>('resource.view.metadata.field'),
          label: slot<ResourceFieldProps>('resource.view.metadata.field.label'),
          value: slot<ResourceFieldProps>('resource.view.metadata.field.value'),
        },
        label: slot<ResourceLabelProps>('resource.view.metadata.label'),
        annotation: slot<ResourceLabelProps>('resource.view.metadata.annotation'),
        finalizer: slot<ResourceFinalizerProps>('resource.view.metadata.finalizer'),
      },
      footer: slot<ResourceProps>('resource.view.footer'),
      missing: slot<ResourceRef & MissingState>('resource.view.missing'),
    },
  },
  page,
} as const;

/** A resource's view's tab's slot (its ResourceTab's name): resource.view.tab.<name>. */
function tab(name: string): SlotRef<ResourceProps> {
  if (!name) throw new Error('a tab’s name: not empty');
  return slot<ResourceProps>(`resource.view.tab.${name}`);
}

/**
 * A Page's slot (its definition's name): page.<name> — empty but for what
 * fills it, in order (the core's page.kind: its table, core.page.kind.table;
 * page.overview: the start); a region of it, page.<name>.<region> (a region's
 * name: not empty, no "." or ":"). Each given the page's props.
 */
function page(page: string, region?: string): SlotRef<PageProps> {
  if (!page) throw new Error('a page’s name: not empty');
  if (region !== undefined && !/^[^.:]+$/.test(region)) throw new Error(`a region’s name "${region}": not empty, no "." or ":"`);
  return slot<PageProps>(region === undefined ? `page.${page}` : `page.${page}.${region}`);
}
