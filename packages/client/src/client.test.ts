import { kinds } from '@overkube/kube-types';
import { afterEach, describe, expect, it } from 'vitest';
import { type Client, createClient } from './client.ts';
import { FakeGateway, kindOf } from './testing.ts';

const Certificate = kindOf('cert-manager.io', 'v1', 'Certificate', 'certificates');
const BUILT_IN = [kinds.core.v1.Pod, kinds.apiextensions.v1.CustomResourceDefinition, kinds.apiregistration.v1.APIService];

const closing: Client[] = [];
afterEach(() => {
  for (const k of closing.splice(0)) k.close();
});

function setup() {
  const fake = new FakeGateway([...BUILT_IN]);
  const client = createClient({ api: { fetch: fake.fetch }, stream: { debounceMs: 5, retryMs: 10 }, store: { lingerMs: 50, retryMs: 10 }, rediscoverMs: 10 });
  closing.push(client);
  return { fake, client };
}

describe('client', () => {
  it('knows what the cluster serves, and watches its objects over one stream', async () => {
    const { fake, client } = setup();
    await expect.poll(() => client.discovery.state.value).toBe('ready');
    expect(client.discovery.kinds.value?.has(kinds.core.v1.Pod.id)).toBe(true);
    const pods = client.store.use(kinds.core.v1.Pod);
    await expect.poll(() => pods.state.value).toBe('live');
    // One stream: opened again with the pods' watch a moment after the APIs' (a working stream waits for others to come).
    await expect
      .poll(() => fake.open.map((st) => st.watches.map((w) => w.id).sort()))
      .toEqual([['apiextensions.k8s.io/v1/CustomResourceDefinition', 'apiregistration.k8s.io/v1/APIService', 'v1/Pod']]);
  });

  it('asks discovery again when a CRD comes, and an addon’s kind turns from absent to live', async () => {
    const { fake, client } = setup();
    const certificates = client.store.use(Certificate);
    await expect.poll(() => certificates.state.value).toBe('absent');
    const discoveries = () => fake.requests.filter((r) => r === 'GET /apis').length;
    await expect.poll(() => fake.open.length).toBe(1);
    // The first, and one more once the APIs are first in.
    await expect.poll(discoveries).toBe(2);

    // cert-manager installed: its CRD appears, its kinds are served.
    fake.served = [...BUILT_IN, Certificate];
    fake.add(kinds.apiextensions.v1.CustomResourceDefinition, { metadata: { name: 'certificates.cert-manager.io' } });
    await expect.poll(() => certificates.state.value).toBe('live');
    expect(discoveries()).toBe(3);
  });

  it('asks discovery again once the APIs are first in: an addon installed between the two is not missed', async () => {
    const fake = new FakeGateway([...BUILT_IN]);
    const held = fake.hold('GET /apis/apiextensions.k8s.io/v1/customresourcedefinitions');
    const client = createClient({ api: { fetch: fake.fetch }, stream: { debounceMs: 5 }, store: { retryMs: 10 }, rediscoverMs: 10 });
    closing.push(client);
    const certificates = client.store.use(Certificate);
    await expect.poll(() => certificates.state.value).toBe('absent');
    // Installed now: after the first discovery, before the CRDs' first list.
    fake.served = [...BUILT_IN, Certificate];
    fake.add(kinds.apiextensions.v1.CustomResourceDefinition, { metadata: { name: 'certificates.cert-manager.io' } });
    held.release();
    await expect.poll(() => certificates.state.value).toBe('live');
  });

  it('does not ask discovery again for a list of the APIs that changed nothing', async () => {
    const { fake, client } = setup();
    await expect.poll(() => fake.open.length).toBe(1);
    await new Promise((r) => setTimeout(r, 50));
    const discoveries = () => fake.requests.filter((r) => r === 'GET /apis').length;
    const before = discoveries();
    const crds = fake.open[0].watches.find((w) => w.id.endsWith('CustomResourceDefinition'))?.id;
    fake.open[0].write({ w: crds, type: 'ERROR', object: { kind: 'Status', code: 410, reason: 'Expired' } });
    await expect.poll(() => fake.requests.filter((r) => r.startsWith('GET /apis/apiextensions.k8s.io')).length).toBe(2);
    await new Promise((r) => setTimeout(r, 50));
    expect(discoveries()).toBe(before);
    expect(client.discovery.state.value).toBe('ready');
  });

  it('asks nothing more once closed, whatever comes back of what was on its way', async () => {
    const fake = new FakeGateway([...BUILT_IN]);
    const held = fake.hold('GET /apis');
    fake.answer('GET /apis', { status: 503, body: { error: { code: 'kube_down', message: 'down' } } });
    // Discovery would ask again after 10 ms: the wait below is long enough for it to, were it not closed.
    const client = createClient({ api: { fetch: fake.fetch }, stream: { debounceMs: 5 }, discovery: { retryMs: 10 } });
    await expect.poll(() => fake.requests.includes('GET /apis')).toBe(true);
    client.close();
    held.release();
    const count = fake.requests.length;
    await new Promise((r) => setTimeout(r, 100));
    expect(fake.requests.length).toBe(count);
    expect(client.discovery.state.value).toBe('loading');
  });

  it('says once that the session is over', async () => {
    const fake = new FakeGateway([...BUILT_IN]);
    fake.answer('GET /apis', { status: 401, body: { message: 'Unauthorized', statusCode: 401 } });
    const client = createClient({ api: { fetch: fake.fetch }, stream: { debounceMs: 5 } });
    closing.push(client);
    await expect.poll(() => client.session.value).toBe('expired');
  });

  it('asks discovery again after a failure that may pass, and is ready once it answers', async () => {
    const fake = new FakeGateway([...BUILT_IN]);
    fake.answer('GET /apis', { status: 503, body: { error: { code: 'kube_down', message: 'down' } } });
    const client = createClient({ api: { fetch: fake.fetch }, stream: { debounceMs: 5 }, discovery: { retryMs: 10 } });
    closing.push(client);
    await expect.poll(() => client.discovery.state.value).toBe('ready');
    expect(fake.requests.filter((r) => r === 'GET /apis').length).toBeGreaterThanOrEqual(2);
  });

  it('does not ask an old cluster again and again; leaves out a group-version its server is down for (Stale)', async () => {
    const old = new FakeGateway([...BUILT_IN]);
    old.answer('GET /api', { status: 200, body: { kind: 'APIVersions' } }, { status: 200, body: { kind: 'APIVersions' } });
    const client = createClient({ api: { fetch: old.fetch }, discovery: { retryMs: 5 } });
    closing.push(client);
    await expect.poll(() => client.discovery.error.value?.code).toBe('old_kubernetes');
    await new Promise((r) => setTimeout(r, 50));
    expect(old.requests.filter((r) => r === 'GET /api')).toHaveLength(1);

    const stale = new FakeGateway([...BUILT_IN]);
    const list = (stale as unknown as { discovery(core: boolean): { items: { versions: { freshness?: string }[] }[] } }).discovery(false);
    for (const g of list.items) for (const v of g.versions) v.freshness = 'Stale';
    stale.answer('GET /apis', { status: 200, body: list });
    const fresh = createClient({ api: { fetch: stale.fetch } });
    closing.push(fresh);
    await expect.poll(() => fresh.discovery.state.value).toBe('ready');
    expect([...(fresh.discovery.kinds.value?.keys() ?? [])].every((id) => !id.includes('.'))).toBe(true);
  });
});
