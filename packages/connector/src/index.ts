/**
 * overkube's way to the cluster's data: the gateway over HTTP (http), its
 * one changing stream (stream), what the cluster serves (discovery), and
 * feeds — a collection (a kind, in a namespace or every one, by name, by
 * labels, whole or its metadata) listed in pages and watched, shared by the
 * whole page, let go of a while after no one uses it. createConnector()
 * joins them. What is asked of the data (queries) is @overkube/source's.
 */

export { type Connector, type ConnectorOptions, createConnector } from './connector.ts';
export { Discovery, type DiscoveryState } from './discovery.ts';
export { Feed, type FeedOptions, type FeedSpec, type FeedState, feedKey } from './feed.ts';
export { type FeedHold, Feeds, type FeedsOptions } from './feeds.ts';
export { ApiError, BASE, collectionPath, Http, type HttpOptions, objectPath, type Query, type Session, type Status } from './http.ts';
export { type StreamOptions, type Subscriber, type WatchEvent, WatchStream } from './stream.ts';
