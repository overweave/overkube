/**
 * overkube's way to the cluster's data: the gateway over HTTP (http), its
 * one changing stream (stream), what the cluster serves (discovery), and
 * feeds — a collection (a kind, in a namespace or every one, by name, by
 * labels, whole or its metadata) listed in pages and watched, shared by the
 * whole page, let go of a while after no one uses it; or a collection
 * listed once, nothing watched or kept (list). createConnector()
 * joins them. What is asked of the data (queries) is @overkube/source's.
 */

export { type Connector, type ConnectorOptions, createConnector } from './connector.ts';
export { Discovery, type DiscoveryState, preferredKinds } from './discovery.ts';
export { Feed, type FeedOptions, type FeedSpec, type FeedState, feedKey } from './feed.ts';
export { type FeedHold, Feeds, type FeedsOptions } from './feeds.ts';
export { ApiError, BASE, collectionPath, Http, type HttpOptions, type ListPage, METADATA_LIST, objectPath, pagesOf, type Query, type Session, type Status } from './http.ts';
export { type Counted, countOnce, type Listed, type ListOnce, listOnce } from './lists.ts';
export { type StreamOptions, type Subscriber, type WatchEvent, WatchStream } from './stream.ts';
