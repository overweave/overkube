/**
 * overkube's way to the cluster's data: the gateway over HTTP (http), its
 * one changing stream (stream), what the cluster serves (discovery), and
 * feeds — a collection (a kind, in a namespace or every one, by name, by
 * labels, whole or its metadata) listed in pages and watched, shared by the
 * whole page, let go of a while after no one uses it; or a collection
 * listed once, nothing watched or kept (list); a container's log,
 * followed or read a window at a time (logs). createConnector()
 * joins them. What is asked of the data (queries) is @overkube/source's.
 */

export { compareLogTimes } from '@overkube/gateway/protocol';
export { type Connector, type ConnectorOptions, createConnector } from './connector.ts';
export { Discovery, type DiscoveryState, preferredKinds } from './discovery.ts';
export { Feed, type FeedOptions, type FeedSpec, type FeedState, feedKey } from './feed.ts';
export { type FeedHold, Feeds, type FeedsOptions } from './feeds.ts';
export { ApiError, BASE, collectionPath, Http, type HttpOptions, type ListPage, METADATA_LIST, objectPath, pagesOf, type Query, type Session, type Status } from './http.ts';
export { type Counted, countOnce, type Listed, type ListOnce, listOnce } from './lists.ts';
export { LOG_WINDOW_BYTES, type LogFrom, type LogHandlers, type LogLine, type LogTarget, type LogWindow } from './logs.ts';
export { type StreamOptions, type Subscriber, type WatchEvent, WatchStream } from './stream.ts';
