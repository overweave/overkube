import type { ApiError, CollectionState } from '@overkube/client';
import type { KindInfo, KubeObject } from '@overkube/kube-types';
import type { CatalogItemParts, TabParts } from '@overkube/uikit';
import { type SlotRef, slot } from '@overweave/ui';
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
  /** Objects shown (after the table's filter) and there are. */
  shown: number;
  total: number;
  state: CollectionState;
  error: Pick<ApiError, 'status' | 'code' | 'message'> | null;
}

/** About a kind. */
export interface KindProps {
  kind: KindInfo;
}

/** A table of a kind's objects: which kind, which of its objects (none: all; and the TableView's filter — give a stable one), what it is called over it (none: nothing). */
export interface KindTableProps extends KindProps {
  filter?: (object: KubeObject) => boolean;
  title?: Label;
}

/** Where a resource is: its kind, namespace, name (the resource itself is the view's to find). */
export interface ResourceRef {
  kind: KindInfo;
  namespace?: string;
  name: string;
}

/** A resource not there: on its way, refused (its error; retry: ask again), or gone (stale: as last seen). */
export interface MissingState {
  state: CollectionState;
  error: Pick<ApiError, 'status' | 'code' | 'message'> | null;
  retry: () => void;
}

/** About one resource of a kind: its kind, the object. */
export interface ResourceProps {
  kind: KindInfo;
  object: KubeObject;
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

/** A part of the picker (its header, its content): what is typed in it, and closing it. */
export interface NavPickerPartProps extends NavPickerProps {
  query: string;
  onQuery: (query: string) => void;
}

/** An item of the picker: where it leads, its kind (none: an addon's page), what is typed (to mark in it). */
export interface NavPickerItemProps {
  entry: { key: string; title: string; path: string };
  kind?: KindInfo;
  query: string;
}

export const slots = {
  header: {
    /** Above the header: a notice for the whole page. */
    above: slot<Record<string, never>>('header.above'),
    start: slot<Record<string, never>>('header.start'),
    end: slot<Record<string, never>>('header.end'),
  },
  nav: {
    /**
     * Everything there is to go to, as a picker (opened by the core's +):
     * whole, one fill drawn (the first that takes it — the core's the last);
     * its parts, each in order: its header (the core's search), its content
     * (the core's groups), an item whole (one drawn: a link, its attrs on
     * it) and what is in it (the core's title).
     */
    picker: {
      ...slot<NavPickerProps>('nav.picker'),
      header: slot<NavPickerPartProps>('nav.picker.header'),
      content: slot<NavPickerPartProps>('nav.picker.content'),
      item: { ...slot<NavPickerItemProps & CatalogItemParts>('nav.picker.item'), content: slot<NavPickerItemProps>('nav.picker.item.content') },
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
     * A table of a kind's objects, wherever it is drawn (<KindTable>): whole,
     * one fill drawn, the first that takes the kind — the core's the last.
     * The core's parts: over it, its toolbar, in order (its count, what can
     * be done); in a column's header, what is in it, in order (the core's
     * title among it — sorting, the width's handle the core's); with no
     * rows, one fill drawn in their place (the first that takes the kind —
     * the core's the last). A cell: its column's render, wrapped by Wraps of
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
     * in order: its title (the core's: its kind and name), a summary over its
     * sections, its sections (the core's YAML), its footer (the core's: the
     * Actions); not there (on its way, gone, refused), one fill drawn in its
     * place (the core's the last).
     */
    view: {
      ...slot<ResourceRef>('resource.view'),
      title: slot<ResourceProps>('resource.view.title'),
      summary: slot<ResourceProps>('resource.view.summary'),
      sections: slot<ResourceProps>('resource.view.sections'),
      footer: slot<ResourceProps>('resource.view.footer'),
      missing: slot<ResourceRef & MissingState>('resource.view.missing'),
    },
  },
  page,
} as const;

/**
 * A Page's slot (its definition's name): page.<name> — empty but for what
 * fills it, in order (the core's page.kind: its table, core.page.kind.table;
 * page.home: the start); a region of it, page.<name>.<region> (a region's
 * name: not empty, no "." or ":"). Each given the page's props.
 */
function page(page: string, region?: string): SlotRef<PageProps> {
  if (!page) throw new Error('a page’s name: not empty');
  if (region !== undefined && !/^[^.:]+$/.test(region)) throw new Error(`a region’s name "${region}": not empty, no "." or ":"`);
  return slot<PageProps>(region === undefined ? `page.${page}` : `page.${page}.${region}`);
}
