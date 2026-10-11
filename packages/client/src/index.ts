/**
 * overkube's data: the gateway's API (api), the page's watches over few
 * streams (stream), what the cluster serves (discovery), and its objects as
 * signals (store) — one informer per kind, shared by the whole page, kept
 * current, let go of a while after no one uses it. createClient() joins
 * them. Nothing here draws; a fake gateway for tests: '@overkube/client/testing'.
 */

export {
  Api,
  ApiError,
  type ApiOptions,
  BASE,
  collectionPath,
  type List,
  type ListQuery,
  objectPath,
  type PatchRequest,
  type Session,
  type Status,
  type WatchSpec,
} from './api.ts';
export { type Client, type ClientOptions, createClient } from './client.ts';
export { Discovery, type DiscoveryState } from './discovery.ts';
export { Informer, type InformerOptions } from './informer.ts';
export { type Collection, type CollectionView, Store, type StoreOptions } from './store.ts';
export { type StreamOptions, type WatchEvent, type Watcher, WatchStream } from './stream.ts';
export type { CollectionState, ObjectOfKind } from './types.ts';
