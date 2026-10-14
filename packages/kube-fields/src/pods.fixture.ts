// Sample pods, every status kubectl tells apart.
const md = (name: string, extra: Record<string, unknown> = {}) => ({ name, namespace: 'default', uid: name, ...extra });
const cs = (name: string, state: unknown, o: Record<string, unknown> = {}) => ({ name, image: 'x', imageID: '', ready: false, restartCount: 0, state, ...o });
const run = { running: { startedAt: '2026-01-01T00:00:00Z' } };
/** Pods of each kind of status kubectl prints (from the CEL research): printPod's port their reference (pods.reference.test-helper.ts). */
export const samples: ({ metadata: { name: string } } & Record<string, unknown>)[] = [
  {
    metadata: md('running'),
    spec: { containers: [{ name: 'a' }, { name: 'b' }] },
    status: {
      phase: 'Running',
      conditions: [
        { type: 'Ready', status: 'True' },
        { type: 'Initialized', status: 'True' },
      ],
      containerStatuses: [
        cs('a', run, { ready: true, restartCount: 2, lastState: { terminated: { exitCode: 1, finishedAt: '2026-01-01T00:00:00Z' } } }),
        cs('b', run, { ready: true, restartCount: 1 }),
      ],
    },
  },
  {
    metadata: md('crashloop'),
    spec: { containers: [{ name: 'a' }, { name: 'b' }] },
    status: { phase: 'Running', containerStatuses: [cs('a', run, { ready: true }), cs('b', { waiting: { reason: 'CrashLoopBackOff' } }, { restartCount: 7 })] },
  },
  { metadata: md('pending-noStatus'), spec: { containers: [{ name: 'a' }] }, status: { phase: 'Pending' } },
  {
    metadata: md('gated'),
    spec: { containers: [{ name: 'a' }] },
    status: { phase: 'Pending', conditions: [{ type: 'PodScheduled', status: 'False', reason: 'SchedulingGated' }] },
  },
  {
    metadata: md('init-waiting'),
    spec: { initContainers: [{ name: 'i1' }, { name: 'i2' }], containers: [{ name: 'a' }] },
    status: {
      phase: 'Pending',
      initContainerStatuses: [cs('i1', { terminated: { exitCode: 0, reason: 'Completed' } }), cs('i2', { waiting: { reason: 'PodInitializing' } }, { restartCount: 1 })],
      containerStatuses: [cs('a', { waiting: { reason: 'PodInitializing' } })],
    },
  },
  {
    metadata: md('init-crash'),
    spec: { initContainers: [{ name: 'i1' }], containers: [{ name: 'a' }] },
    status: {
      phase: 'Pending',
      initContainerStatuses: [cs('i1', { waiting: { reason: 'CrashLoopBackOff' } }, { restartCount: 4 })],
      containerStatuses: [cs('a', { waiting: { reason: 'PodInitializing' } })],
    },
  },
  {
    metadata: md('init-signal'),
    spec: { initContainers: [{ name: 'i1' }], containers: [{ name: 'a' }] },
    status: { phase: 'Pending', initContainerStatuses: [cs('i1', { terminated: { exitCode: 137, signal: 9 } })], containerStatuses: [cs('a', { waiting: {} })] },
  },
  {
    metadata: md('init-exitcode'),
    spec: { initContainers: [{ name: 'i1' }], containers: [{ name: 'a' }] },
    status: { phase: 'Pending', initContainerStatuses: [cs('i1', { terminated: { exitCode: 3 } })] },
  },
  {
    metadata: md('sidecar'),
    spec: { initContainers: [{ name: 'proxy', restartPolicy: 'Always' }, { name: 'migrate' }], containers: [{ name: 'a' }] },
    status: {
      phase: 'Running',
      conditions: [
        { type: 'Initialized', status: 'True' },
        { type: 'Ready', status: 'True' },
      ],
      initContainerStatuses: [
        cs('proxy', run, { started: true, ready: true, restartCount: 3 }),
        cs('migrate', { terminated: { exitCode: 0, reason: 'Completed' } }, { restartCount: 5 }),
      ],
      containerStatuses: [cs('a', run, { ready: true, restartCount: 1 })],
    },
  },
  {
    metadata: md('sidecar-initializing'),
    spec: { initContainers: [{ name: 'proxy', restartPolicy: 'Always' }, { name: 'migrate' }], containers: [{ name: 'a' }] },
    status: {
      phase: 'Pending',
      initContainerStatuses: [cs('proxy', run, { started: true, ready: true, restartCount: 3 }), cs('migrate', run, { restartCount: 2 })],
      containerStatuses: [cs('a', { waiting: { reason: 'PodInitializing' } })],
    },
  },
  {
    metadata: md('terminating', { deletionTimestamp: '2026-01-01T00:00:00Z' }),
    spec: { containers: [{ name: 'a' }] },
    status: { phase: 'Running', containerStatuses: [cs('a', run, { ready: true })] },
  },
  {
    metadata: md('nodelost', { deletionTimestamp: '2026-01-01T00:00:00Z' }),
    spec: { containers: [{ name: 'a' }] },
    status: { phase: 'Running', reason: 'NodeLost', containerStatuses: [cs('a', run, { ready: true })] },
  },
  {
    metadata: md('evicted'),
    spec: { containers: [{ name: 'a' }] },
    status: { phase: 'Failed', reason: 'Evicted', message: 'low on memory', containerStatuses: [cs('a', { terminated: { exitCode: 137, reason: 'ContainerStatusUnknown' } })] },
  },
  { metadata: md('evicted-nostatus'), spec: { containers: [{ name: 'a' }] }, status: { phase: 'Failed', reason: 'Evicted' } },
  {
    metadata: md('completed-job'),
    spec: { containers: [{ name: 'a' }] },
    status: { phase: 'Succeeded', containerStatuses: [cs('a', { terminated: { exitCode: 0, reason: 'Completed' } })] },
  },
  {
    metadata: md('completed-but-running'),
    spec: { containers: [{ name: 'a' }, { name: 'b' }] },
    status: {
      phase: 'Running',
      conditions: [{ type: 'Ready', status: 'False' }],
      containerStatuses: [cs('a', { terminated: { exitCode: 0, reason: 'Completed' } }), cs('b', run, { ready: true })],
    },
  },
  {
    metadata: md('completed-with-error'),
    spec: { containers: [{ name: 'a' }, { name: 'b' }] },
    status: { phase: 'Running', containerStatuses: [cs('a', { terminated: { exitCode: 0, reason: 'Completed' } }), cs('b', { terminated: { exitCode: 2, signal: 15 } })] },
  },
  {
    metadata: md('oom'),
    spec: { containers: [{ name: 'a' }] },
    status: { phase: 'Running', containerStatuses: [cs('a', { terminated: { exitCode: 137, reason: 'OOMKilled' } }, { restartCount: 1 })] },
  },
];
