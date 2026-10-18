/**
 * Testing overkube's addons without the page or a cluster: a cluster in
 * memory (fakeCluster), objects as the API server would have them (make), a
 * world where addons run as on the page (kubeWorld: each its contributor and
 * its ctx) — and overweave's checks over it. Their drawing:
 * '@overkube/testkit/preact'.
 */

export {
  assertContributions,
  assertEmpty,
  assertGone,
  assertNoConflicts,
  assertNothingRefused,
  assertResult,
  assertSameSnapshot,
  assertSays,
  CheckError,
  cleanup,
  everyOrder,
} from '@overweave/testkit';
export { CSR_PEM, EC_PEM, RSA_PEM } from './certs.ts';
export { type Asked, type FakeCluster, type FakeClusterOptions, fakeCluster, type Refusal, type Write } from './cluster.ts';
export { type DeepPartial, make } from './make.ts';
export { type AddonEnv, addonEnv, addonRun, type KubeWorld, kubeWorld } from './world.ts';
