# Data access: namespaces, permissions, relations, an indexer

Status: proposal. It sums up two reviews (October 2026): the data path as it is,
the risks as the app grows, and whether a Kubernetes indexer is worth building.
"Verified" means read in code, docs or source; "recalled" means from memory.

## Summary

- The namespace becomes part of every request. Queries are scoped to the
  namespaces selected on the page by default, and a page such as the
  Overview widens them to all namespaces itself. Filtering on the frontend
  stays, but only as the way a wider live query serves narrower ones.
- There is no separate stream for "these ids of these kinds". An object by
  name is an ordinary query (`fieldSelector=metadata.name=X`), deduplicated
  and covered by any wider query.
- One query layer in the SDK replaces `collection(kind)`. Addons say what
  they need; the layer decides how, shares identical queries and serves
  narrower ones from wider ones.
- Permissions are checked before asking, and forbidden data is never
  requested. New states `denied` and `partial` replace a whole kind failing.
- Fix the watch stream protocol now, before relations and namespaces
  multiply the queries.
- No indexer now. On small clusters it is useless, and since Kubernetes
  1.31–1.34 the apiserver handles the load itself. When it is needed, it is
  a shared cache in our gateway (the Rancher steve/vai model), never direct
  etcd reads.

## How it works now

Verified in code.

- **Discovery** (`packages/client/src/discovery.ts`): aggregated discovery,
  two GETs. CRDs and APIServices are held cluster-wide for the page's
  lifetime to re-run discovery (`client.ts:47`).
- **Store** (`packages/client/src/store.ts`): one informer per kind id. The
  key has no namespace, selector or projection. It is ref-counted with a
  30 s linger, and kinds nobody holds are evicted when a stream is full.
- **Informer** (`packages/client/src/informer.ts:68`): always
  `collectionPath(kind)`, which is cluster-wide.
  - It lists in pages of 500 with continue tokens, then watches.
  - On 410 it lists again.
  - Any other end, 403 included, means `error`, and it stops.
  - Every batch of events copies the whole map (`new Map(data)`).
  - managedFields are stripped.
- **Api** (`packages/client/src/api.ts`): label and field selectors and
  `collectionPath(kind, namespace)` exist, but nothing uses them. Access
  reviews (SSAR/SSRR) are not used anywhere.
- **Watch stream** (`packages/client/src/stream.ts:256`):
  - Watches are multiplexed over `GET /watch`: 50 per stream, 2 streams per
    tab, so 100 watches per tab.
  - Adding or removing any watch reopens the whole stream with every watch
    in it.
- **Gateway** (`packages/gateway/src/watch.ts`):
  - Each `/watch` request is a new stream, and each of its channels is its
    own upstream watch. Nothing is shared between tabs or users.
  - `accept: application/json` is fixed, so metadata-only watches are
    impossible.
  - Limits: 100 streams and 500 channels per process.
- **Identity**: one for everyone, the kubeconfig or the in-cluster
  ServiceAccount. In read-only mode every non-GET is refused
  (`gateway.ts:156`), so the access reviews are refused too, although they
  change nothing.
- **SDK** (`packages/sdk/src/cluster.ts`):
  - `useCollection(kind)`, `peek(kind)`, `hold(kind)` and
    `ctx.cluster.collection(kind)` all return a whole kind. None takes a
    namespace, selector or projection.
  - `ctx.cluster.collection(kind)` holds it for the addon's whole run.
  - A column sees only its own kind's objects.

| Screen | Requests |
|---|---|
| Any page | 2 discovery GETs; CRDs and APIServices listed and watched cluster-wide |
| A kind's page | 1 paged cluster-wide list and 1 watch |
| An opened object | Shares its kind's collection. Opened by a link, it lists the whole kind: one Secret means every Secret, with data |
| Overview | Text only, no data yet |
| Relations | A uikit concept, no data |

Within a tab, identical kinds are shared. Across tabs nothing is: each tab
has its own lists, its own one or two `/watch` connections and its own
upstream watches.

## Risks as the app grows

Ranked by likelihood × impact.

1. **Limited RBAC.** A cluster-wide list gets 403, the kind stays in
   `error`, and a user who can read 3 namespaces sees an error. Holding CRDs
   cluster-wide fails for most non-admins, so discovery stops following CRD
   changes, silently.
2. **Stream reopening.** Per-object, per-selector and per-namespace queries
   turn every panel opened or closed, and every namespace switched, into
   restarts of up to 49 other upstream watches.
3. **The HTTP/1.1 connection cap.** Browsers allow 6 connections per origin
   across all tabs, and each tab can hold 2 long-lived streams. After
   3 tabs, every request of a 4th waits.
4. **Big clusters.** Every tab gets cluster-wide lists of Pods, Events,
   ReplicaSets and Secrets, plus an O(N) copy of the map on every batch of
   events. The browser fails first, not the apiserver.
5. **Addons opening their own watches.** Kinds are held cluster-wide for an
   addon's whole run, with no scope, budget or visibility. They hit the
   100 watches per tab and the 500 channels per gateway, shared by every
   user.
6. **No fan-out in the gateway.** N tabs × K kinds means N×K upstream
   watches and full lists. 500 channels is about 5–10 heavy users.
7. **Namespaces under limited RBAC.** 30 namespaces × 10 kinds is
   300 watches, beyond 100 per tab.
8. **Naive relations and live cells.** A query or watch per row grows
   without bound.
9. **Overview cost.** Cluster-wide alerts need full Pods, Nodes,
   Deployments and warning Events. A phase field selector misses
   CrashLoopBackOff, because the phase is still Running.
10. **Error states.** 403, 404 and "denied by policy" all show as `error`
    with a retry button. There is no `denied` or `partial`.

## Requests we need

| Request | Verdict | Notes |
|---|---|---|
| list + watch per (kind, scope, selectors) | **Keep**: the main one | Scope is a namespace or all; it becomes part of the key. |
| Pages (`limit=500`, `continue`) | **Keep** | Already done. |
| Get by name | **Rarely** | Only once, for an object whose collection is not held. A live single object is list+watch with `fieldSelector=metadata.name=X` in its namespace. |
| Label selectors | **Add** | Service→Pods, workload→Pods, PDB. |
| Field selectors | **Add, the common ones only** | `metadata.name`, `metadata.namespace`; Pod `spec.nodeName` and `status.phase`; Event `involvedObject.*` and `type`. Equality only, AND only (verified). |
| Metadata only (PartialObjectMetadata) | **Add** as `projection: 'metadata'` | Secrets (no data unless asked), owner graphs, counts. The gateway's watch must send the right `Accept`. |
| Table (`as=Table`) | **Skip** for the live UI | Columns are computed on the client from kube-types. CRD columns come from `additionalPrinterColumns`. |
| WatchList (`sendInitialEvents=true`) | **Later, in the gateway** | One request instead of a list then a watch, and no continue-token expiry. Beta since 1.32 (verified). With a fallback to list. |
| `resourceVersion` on lists | **Leave unset** | Consistent reads are served from the watch cache since 1.31 (verified, KEP-2340). |
| Bookmarks | **Keep** | Already done. |
| Counts (`limit=1` + `remainingItemCount`) | **Add** for the Overview | Not returned with a selector (recalled). |
| SelfSubjectAccessReview / SelfSubjectRulesReview | **Add** | Allowed by the gateway even when it is read-only. |
| Polling | **Only for kinds without watch** | Already done. |

What to do on errors:

- **410 during a watch:** list again and keep showing the stale items (as
  now).
- **410 on `continue`:** restart the list (as now).
- **403:** the state `denied`, not `error`.
  - Do not retry it automatically. Check again when the permission cache
    expires (about 5 min) or on demand.
  - An "all namespaces" query that gets 403 falls back to the namespaces
    the user can read and reports `partial`.
- **429:** wait as long as Retry-After says (the gateway already does).

## A single query layer

### Principles

- Addons and components say **what** they need; the layer decides **how**.
- A query is a value with one key, and every holder of the same key shares
  one informer.
- A wider live query serves narrower ones, with no request of their own.
- The scope comes from the page by default and is widened explicitly.
- Permissions are known before asking, so nothing forbidden is requested.

### The SDK

```ts
type Scope =
  | { namespace: string }
  | { namespaces: readonly string[] }
  | 'all'    // every namespace the user can read: cluster-wide if allowed, else one by one
  | 'page';  // the default: the namespaces selected on the page

interface Query<K extends KindInfo = KindInfo> {
  kind: K;
  scope?: Scope;                      // ignored for cluster-scoped kinds
  labelSelector?: string;
  fieldSelector?: string;             // the common fields only; checked
  name?: string;                      // shorthand for fieldSelector metadata.name=…
  projection?: 'full' | 'metadata';   // default 'full'
}

type QueryState = 'loading' | 'live' | 'stale' | 'partial' | 'denied' | 'error' | 'absent';

interface Coverage {
  namespaces: 'all' | readonly string[];  // what is covered
  denied: readonly string[];              // asked for, not allowed
}

interface QueryView<T> {
  readonly items: ReadonlySignal<ReadonlyMap<string, T>>;
  readonly state: ReadonlySignal<QueryState>;
  readonly coverage: ReadonlySignal<Coverage>;
  readonly error: ReadonlySignal<ApiError | null>;
  retry(): void;
  /** Indexes kept up to date: 'owner' (ownerReferences uid), 'node' (spec.nodeName). */
  index(name: string, key: string): ReadonlySignal<readonly T[]>;
}

interface Access {
  /** undefined while not yet known. */
  can(verb: 'list' | 'watch' | 'get' | 'patch' | 'delete', kind: KindInfo, namespace?: string): boolean | undefined;
  readonly namespaces: ReadonlySignal<readonly string[] | null>;  // the namespaces the user can read
}

// Preact
useQuery(query)                       // held while drawn
useObject({ kind, namespace, name })  // from a held collection if there is one
useRelated(object, relation)          // groups of { kind, items, state }
useCan(verb, kind, namespace?)
usePageScope()
```

### Relations as definitions

Relations are definitions in the overweave way: the core gives owners,
field references and selectors, and addons add their own. `resolve` returns
queries, never data; the layer turns them into requests and deduplicates
them.

```ts
Relation({ name: 'core.pods', from: 'v1/Service',
  resolve: (svc) => [{ kind: Pod, scope: { namespace: ns(svc) }, labelSelector: toSelector(svc.spec.selector) }] })
Relation({ name: 'core.owners', from: '*',
  resolve: (o) => o.metadata.ownerReferences.map((r) => ({ kind: byApiVersion(r), namespace: ns(o), name: r.name })) })
Relation({ name: 'core.children', from: 'apps/v1/Deployment',
  resolve: (d) => [{ kind: ReplicaSet, scope: { namespace: ns(d) }, index: ['owner', d.metadata.uid] }] })
```

Columns showing other kinds get `needs?(kind, scope) => Query[]`, plus
`ctx.lookup(ref)` and `ctx.related(object, name)` in `ColumnContext`. The
table holds those queries once, at its own scope, never per row.

### Rules for deduplication, holds and linger

1. **The key:** `kind | scope (sorted namespaces, or *) | labelSelector |
   fieldSelector | projection`, the selectors normalised.
2. **Covering.** Q1 serves Q2 when all of these hold:
   - the kind is the same;
   - Q1's scope contains Q2's;
   - Q1 has no selector, or the same one;
   - Q1's projection is at least Q2's.

   Q2 is then Q1 filtered on the client. Label selectors and the common
   field selectors are evaluated on the client; other field selectors never
   cover anything.
3. **Handoff.** When the covering query is live, narrower ones drop their
   own watch and become views. When the cover is released, live narrower
   queries reopen their watch before its linger ends.
4. **Merging.** More than about 5 queries by name of one kind in one
   namespace become one query for the namespace. One kind in more than
   about 5 namespaces, with cluster-wide list allowed, becomes one
   cluster-wide informer, filtered.
5. **Holds and linger.**
   - Components keep the 30 s linger.
   - Queries held for an addon's whole run must say their scope and
     projection, and each addon has a budget.
   - Eviction follows a memory budget (object count) in LRU order, not only
     time.
   - A developer overlay shows the live queries, who holds them and what
     they cost.
6. **Publishing.** Do not copy the whole map on every batch. Use shared
   structure, or a signal per key plus a version. Keep indexes (owner uid,
   nodeName, labels) up to date incrementally.

### Namespaces and permissions

- **The page's scope** is a signal: the selected namespaces, or all.
  Queries default to `'page'`, so scoping by namespace stays a free
  optimisation on the server.
- **The Overview** asks `scope: 'all'` for its own blocks. A live `'all'`
  query of a kind also serves the namespace views of that kind, for free.
- **Checking access** (the `Access` service, one per client):
  1. A SelfSubjectAccessReview for `list` and `watch` of the kind,
     cluster-wide. Allowed: one cluster-wide informer.
  2. Otherwise, the namespaces the user can read, in this order:
     - `list namespaces`, if allowed;
     - else the `allowedNamespaces` setting (server or user);
     - else the kubeconfig context's namespace;
     - else ask the user.
  3. A SelfSubjectRulesReview per namespace; one covers every kind there.
     If it says it is `incomplete`, fall back to SelfSubjectAccessReview.
  4. The results are cached for about 5 minutes and dropped on a 403.
- **Partial queries:** a query over a scope that is only partly allowed
  opens only the allowed (kind, namespace) pairs and reports `partial`, the
  rest in `coverage.denied`. It never sends a request it knows will be
  refused.
- **The gateway:**
  - allows `POST` to `selfsubjectaccessreviews` and
    `selfsubjectrulesreviews` even when it is read-only;
  - gets a watch spec over several namespaces: one slot in the tab, N
    watches upstream.

### Where it lives

**Phase 1, in the browser** (packages/client, sdk):
- the query keys, covering, the `Access` service, `denied` and `partial`;
- relation definitions, indexes and the columns' `needs`;
- the metadata projection, and no Secret data unless asked.

**Phase 1, the stream protocol:**
- Add and remove watches one by one instead of reopening the stream:
  either a WebSocket, or `POST /watch/{streamId}` with add/remove. Each
  watch keeps its upstream watch.
- Parameters for the projection and for several namespaces.
- The access reviews allowed by the gateway.
- For the connection cap: HTTP/2, or one stream per tab, optionally a
  SharedWorker with one client for all tabs.

**Phase 2, a cache in the gateway:**
- Shared informers keyed by (identity, query key), with a linger.
- Many tabs and users are served from one upstream watch. Whoever comes
  later gets the state from the cache, with its resourceVersion.
- 410 handling and WatchList move here.
- The identity question: see "Open decisions".

## The indexer

### Why have one

The hypothesis holds: on small clusters it is useless; on big ones the
first thing to fail is the browser, not the apiserver. Rough numbers
(recalled, not measured on overkube):

- A Pod is about 3–8 KB of JSON without managedFields; a big one 15–30 KB.
  In a JS heap an object costs 2–5× its JSON.
- 100k pods are about 0.5 GB on the wire and 1–2.5 GB in the tab. Chrome
  tabs fail at about 2–4 GB.
- The initial list is about 200 pages of 500: tens of seconds, plus parsing
  on the main thread.
- KEP-3157's scale test, 5,000 nodes and about 165k pods (verified):
  WatchList P50 969 ms and P99 about 29.7 s for pods.

| Concern | Without an indexer | At 100k+ objects |
|---|---|---|
| apiserver load | Each browser lists and watches every kind cluster-wide. Mostly fixed in 1.31+. APF charges LIST seats by object count. | Medium; high with many users on old clusters |
| Browser memory | Each tab holds whole kinds | **High: fails first** |
| First load | Tens of seconds, in every tab | High |
| Cross-kind relations | Every involved kind loaded into the tab, or N×M requests | High |
| Full-text search | Load everything, scan in JS | High |
| Server-side sort and pages | The apiserver has no sort, and continue tokens give no offset or total. Field selectors: equality only, a fixed list per kind | High for big tables |
| Events history | Events expire in about 1 h (recalled) | A feature, not scale |

### What the apiserver already does

- **Consistent reads from the cache** (KEP-2340; beta and on by default in
  1.31; verified): −30% apiserver CPU, −25% etcd CPU, pod LIST P99 from 5 s
  to 1.5 s at 5k nodes. Continue pages are served from cache snapshots
  (KEP-4988; beta in 1.34).
- **WatchList** (KEP-3157; beta since 1.32; verified): the server's memory
  stays about constant instead of about 5× the response (about 2 GB versus
  about 20 GB in the blog). It ends with a bookmark marked
  `k8s.io/initial-events-end`.
- **Streamed list encoding** (1.33): less memory on the server for a plain
  LIST, with nothing to change on the client.
- **Metadata only and Table** (verified): a Table row is about 10–20% of
  the object.
- **APF** (verified): LIST seats grow with the object count. Today every
  browser shares one identity, so one APF flow: one heavy user can slow
  down everyone.

On clusters at 1.31–1.34 or later, a handful of dashboards are not the
apiserver's problem. What is left is the browser's memory and wait, and the
queries the apiserver cannot do.

### Ways to build one

**A. Shared informers in our gateway: recommended when needed.** This is
Rancher steve with vai (verified: the sqlcache README and the Rancher docs).

How vai works:
- an informer whose indexer is SQLite on disk;
- tables: objects, indexed fields, labels, events;
- filtering on indexed fields only; sorting on several keys; pages with an
  offset;
- partitions (namespaces or names) as hard conditions, for RBAC;
- encryption of Secrets.

What Rancher learned:
- lists are updated about every 5 s, on purpose;
- the cache on disk is about 2× the objects;
- columns computed in the UI (restarts, health, CPU) are lost, so computed
  columns have to be computed on the server when objects are indexed.

For us:
- an informer in Node is simple: the one in `client/src/informer.ts` runs
  there as is;
- Maps with secondary indexes carry a few hundred thousand objects, if the
  objects are slimmed;
- SQLite (`node:sqlite`, built into Node 22.5+) comes after: full-text
  search, events history, less memory.

Pros:
- one upstream watch per kind for everyone;
- the browser holds one page;
- sort, filters, pages and totals on the server;
- relations, search and history.

Cons:
- the gateway gets state: memory or disk in proportion to the cluster, and
  warming up after a restart;
- several replicas mean duplicate caches or sticky sessions;
- data is eventually fresh, and there is a second copy of Secrets.

**B. External indexers: no.**
- Karpor syncs into Elasticsearch (layout verified).
- OCM/ACM search runs GraphQL over Postgres (verified: the search-v2-api
  README and `rbac/userData.go`).

Both need another store, another deployment and another trust boundary.
They are worth it only for searching many clusters, and that could later
be one more source behind the same SDK API.

**C. Reading etcd directly: no.** Decoding works (auger, verified), but:
1. EKS, GKE and AKS do not expose etcd (recalled).
2. Secrets are encrypted with KMS, so it needs the key (verified for EKS,
   GKE and AKS).
3. What the API does on the way out is lost: version conversion, defaults,
   Table printers.
4. It is root on the cluster: it bypasses RBAC and audit.
5. It adds load on etcd and ties us to its internals.

It is good only for forensics on a snapshot after an incident.

**D. Memory tricks.**
- Strip managedFields: already done.
- Slim objects per kind in the gateway: drop
  `kubectl.kubernetes.io/last-applied-configuration`, keep only key names
  and sizes for ConfigMap and Secret `data`, and send the full object only
  for a detail view.
- Intern repeated strings (namespace, nodeName, image).
- Batch events sent to the browser every 0.5–5 s, and send only the rows of
  the page being shown.

### A shared cache with per-user RBAC

1. **Rancher steve** (verified: `access_store.go`):
   - it computes each user's access from cached Role and Binding objects,
     with no request to the apiserver;
   - the result is an LRU cache (50 entries, 24 h);
   - it applies the result as partitions in the query.

   Fast, but it reimplements RBAC and ignores the other authorizers
   (webhooks, Node, EKS IAM).
2. **OCM search** (verified):
   - TokenReview identifies the user;
   - access reviews run under impersonation; a cluster admin is
     short-circuited;
   - a SelfSubjectRulesReview runs per namespace;
   - the result is cached per user and turned into a SQL WHERE.

   It respects every authorizer, but costs one review per namespace per
   user.
3. **The simplest safe way:** restricted users do not share the data path.
   Their requests go through impersonation or their own token, and the
   shared cache serves only users whose access covers the whole query.

Rules every approach shares:
- Filter before sorting, paging and counting; totals otherwise reveal that
  objects exist.
- Filter relations and search results per related kind.
- Watch fan-out rechecks access when the user's rights change.
- Never return cached Secret `data` without `get` on secrets.

Today the gateway has one identity, so a shared cache adds no new exposure.

### When it is time

Signals, any one of them (estimates; measure on overkube: list bytes, parse
time, heap):

- more than about 20–30k objects of a kind users open (Pods, Events), or
  about 100k across the kinds of a typical page;
- more than about 500–1,000 namespaces;
- more than about 20 users at once on one cluster, or 429s from APF to the
  gateway's identity;
- the product needs global search, "what references X", or events history.

Then, in steps:

- **A1, in memory:**
  - shared informers in the gateway, slimmed per kind, with indexes
    (namespace, labels, owner uid, references, nodeName);
  - a `/query` endpoint (filter, sort, page, total);
  - fan-out: one page plus batched updates;
  - one identity, so no RBAC work yet.
- **A2, SQLite:** full-text search (FTS5), events kept past their TTL,
  Secrets encrypted or stored as metadata and key names. About 2× the
  objects on disk.
- **A3, per-user RBAC:** when the gateway gets per-user identity, compute
  each user's access and apply it before sorting, paging and counting.

## How others do it

- **Headlamp** (verified: `useKubeObjectList.ts`):
  - React Query with one query per (cluster, namespace);
  - lists split by namespace;
  - an `allowedNamespaces` setting; if namespaces cannot be listed, it
    fetches the allowed ones by name;
  - errors per namespace while the rest still shows;
  - recalled: the backend multiplexer opens one upstream watch per
    subscription, nothing shared between clients.
- **Lens / OpenLens** (verified: v5.4.6):
  - every 30 s it checks `isAdmin`, cluster-wide watch,
    `allowedNamespaces` (a setting, or the list, else the context's
    namespace) and SSARs per resource;
  - lists per selected namespace;
  - watches cluster-wide when allowed, else per namespace.
- **k9s** (verified: `internal/watch/factory.go`):
  - one informer factory per namespace, one shared for all namespaces;
  - a cached `CanI` (SSAR) before every informer;
  - factories live until exit.
- **Kubernetes Dashboard** (recalled): no watches, polling. The backend
  proxies with the user's token and filters, sorts and pages on the server.
  No shared cache.
- **Rancher steve** (verified):
  - a cluster cache on the server;
  - an `AccessSet` per user;
  - lists split into namespace partitions;
  - filter, sort and pages on the server;
  - the vai SQLite cache, and `/v1/subscribe` over a WebSocket.
- **OpenShift console** (recalled):
  - the `Project` API lists only the namespaces the user can see;
  - `useK8sWatchResource` keeps watches keyed by (kind, namespace,
    selector, name), ref-counted and deduplicated within a tab;
  - "All projects" is an explicit choice;
  - SSAR hides actions the user cannot take.
- **Octant** (recalled; archived): an informer cache on the server per
  (namespace, GVR), access checked before an informer starts.
- **kubectl** (recalled): discovery cached on disk; `get` uses Table, lists
  in chunks of 500; `auth can-i --list` uses SSRR.

What they share:
- requests scoped by namespace by default, with "all" an explicit choice;
- access checked with SSAR/SSRR, a namespace list set by the user as the
  last resort;
- watches keyed by (kind, namespace, selector) and ref-counted.

Only Rancher (and partly Octant) share a cache across users on the server.

## Open decisions

1. **Namespaces.** Requests are scoped to the namespaces selected on the
   page, and the Overview widens to `'all'`. Recommended.
2. **A stream of specific ids.** No: by name is an ordinary query (see
   above).
3. **Checking access.** First a SelfSubjectAccessReview cluster-wide, then
   a SelfSubjectRulesReview per namespace, with an `allowedNamespaces`
   setting. The gateway allows these reviews when it is read-only.
4. **The stream protocol.** Fix it now: add and remove watches one by one,
   watches over several namespaces, the projection, and the connection cap.
5. **A cache in the gateway.** Not yet; see "When it is time".
6. **Secrets and metadata.** Metadata only by default for Secrets, the
   Overview's counts and owner graphs. The full object only once opened.
7. **Table and WatchList.** No Table for the live UI. WatchList later, in
   the gateway, falling back to a list.
8. **Addon budgets.** Queries held for an addon's whole run say their scope
   and projection. Each addon has a budget of watches and objects, and a
   developer overlay shows them.
9. **Overview cost.** Its blocks ask for `'all'`, use metadata and counts
   where they can, and hold full Pods only while the page is open.
10. **The gateway's identity.**
    - One for everyone (as now): sharing is safe, but users with fewer
      rights will not exist.
    - A token per user: a cache per identity.
    - Impersonation: a steve-style filter, more complex and more
      sensitive.

    To decide before a shared cache.

## Order of work

1. The stream protocol: add and remove one by one, projection, several
   namespaces.
2. `useQuery` with namespaces and covering.
3. Access checks, `denied` and `partial`.
4. Selecting namespaces in the UI.
5. Relations on top.
