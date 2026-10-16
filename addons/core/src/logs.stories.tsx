import { kinds } from '@overkube/kube-types';
import { KubeStory } from '@overkube/storybook/preact';
import { type FakeCluster, make } from '@overkube/testkit';
import core from './index.tsx';
import { shop } from './shop.fixture.tsx';

/*
 * A log's tab: a pod's (its containers: an init one, the app — restarted —,
 * an envoy sidecar), a workload's (its pods, grouped). Lines are written
 * every two seconds while the story is shown. The tab is before the YAML;
 * here, the user moved it first (its order), to be seen at once.
 */

const { Pod } = kinds.core.v1;

const PATHS = ['/', '/api/products', '/api/cart', '/static/app.js', '/healthz', '/api/checkout'];
/** An nginx's access log, a warning and an error now and then. */
const access = (i: number) =>
  i % 37 === 0
    ? `[error] 29#29: *${i} upstream timed out (110: Connection timed out) while reading response header from upstream`
    : i % 53 === 0
      ? `[warn] 29#29: *${i} an upstream response is buffered to a temporary file`
      : `10.42.0.${(i * 7) % 250} - - "GET ${PATHS[i % PATHS.length]} HTTP/1.1" ${i % 23 === 0 ? 404 : 200} ${(i * 131) % 9000} "-" "Mozilla/5.0"`;
/** An envoy sidecar's, quieter. */
const envoy = (i: number) => `[info][upstream] cds: added/updated ${i % 5} cluster(s), skipped ${i % 3} unmodified`;

const PODS = [
  ['web-7d4b9-x2k8p', 2],
  ['web-7d4b9-q7m4z', 0],
] as const;

/** The shop's web: two pods, so many lines, then more every two seconds. */
let writing: ReturnType<typeof setInterval> | undefined;
const logged =
  (lines: number) =>
  (c: FakeCluster): void => {
    shop(c);
    for (const [name, restarts] of PODS) {
      c.add(
        Pod,
        make(Pod, {
          metadata: { name, namespace: 'shop', labels: { app: 'web' } },
          spec: {
            initContainers: [{ name: 'migrate', image: 'shop/migrate:4' }],
            containers: [
              { name: 'app', image: 'nginx:1.27' },
              { name: 'envoy', image: 'envoyproxy/envoy:v1.31' },
            ],
          },
          status: {
            phase: 'Running',
            containerStatuses: [
              { name: 'app', image: 'nginx:1.27', imageID: '', ready: true, restartCount: restarts, state: { running: {} } },
              { name: 'envoy', image: 'envoyproxy/envoy:v1.31', imageID: '', ready: true, restartCount: 0, state: { running: {} } },
            ],
          },
        }),
      );
      c.log('shop', name, 'migrate', 'migrating schema 41 → 42', 'migration done in 1.8s');
    }
    c.log('shop', 'web-1', 'a', 'nginx: ready', 'start worker processes');
    for (let i = 0; i < lines; i++) {
      c.log('shop', PODS[i % 3 ? 0 : 1][0], 'app', access(i));
      if (i % 4 === 0) c.log('shop', PODS[i % 8 ? 0 : 1][0], 'envoy', envoy(i));
    }
    clearInterval(writing);
    let i = lines;
    writing = setInterval(() => {
      c.log('shop', PODS[i % 2][0], 'app', access(i));
      if (i++ % 3 === 0) c.log('shop', PODS[0][0], 'envoy', envoy(i));
    }, 2000);
  };

export default { title: 'core/resource/Logs' };

const first = (u: Parameters<NonNullable<Parameters<typeof KubeStory>[0]['user']>>[0]) => void u.patch('ResourceTab', 'core.logs', { order: 0 });

export const OfAPod = () => <KubeStory addons={[core]} path="/k/pods.v1?open=pods.v1/shop/web-7d4b9-x2k8p" cluster={logged(3000)} user={first} />;
export const OfADeployment = () => <KubeStory addons={[core]} path="/k/deployments.v1.apps?open=deployments.v1.apps/shop/web" cluster={logged(3000)} user={first} />;
export const Short = () => <KubeStory addons={[core]} path="/k/pods.v1?open=pods.v1/shop/web-7d4b9-x2k8p" cluster={logged(6)} user={first} />;
