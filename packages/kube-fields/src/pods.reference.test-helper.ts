import type { Pod } from '@overkube/kube-types/core/v1';

/*
 * The reference the pod fields of CEL are held to in tests: kubectl's
 * printPod (printers.go, v1.37.1), ported by hand — its containers ready of
 * all, its reason (Status), its restarts and the last of them. Not used by
 * anything but the tests.
 */

/** What printPod works out of a pod at once: its containers ready of all, its reason (Status), its restarts and the last of them. */
interface PodSummary {
  ready: number;
  total: number;
  reason: string;
  restarts: number;
  /** When it last restarted (ms); none: 0. */
  lastRestart: number;
}

const summaries = new WeakMap<Pod, PodSummary>();

const at = (time: string | undefined) => (time ? Date.parse(time) || 0 : 0);

/** A pod as printPod works it out: its ready containers, its reason, its restarts — once per object. */
export function podSummary(pod: Pod): PodSummary {
  const known = summaries.get(pod);
  if (known) return known;
  const spec = pod.spec;
  const status = pod.status ?? {};
  const phase = status.phase ?? '';
  let reason = status.reason || phase;
  let total = spec?.containers?.length ?? 0;
  let ready = 0;
  let restarts = 0;
  let lastRestart = 0;
  let sidecarRestarts = 0;
  let lastSidecarRestart = 0;

  // A pod gated from scheduling says so.
  for (const c of status.conditions ?? []) if (c.type === 'PodScheduled' && c.reason === 'SchedulingGated') reason = 'SchedulingGated';

  // Init containers: those that run beside the others (sidecars: restartPolicy Always) are counted with them.
  const inits = new Map((spec?.initContainers ?? []).map((c) => [c.name, c]));
  for (const c of spec?.initContainers ?? []) if (c.restartPolicy === 'Always') total++;
  const sidecar = (name: string) => inits.get(name)?.restartPolicy === 'Always';

  let initializing = false;
  const initStatuses = status.initContainerStatuses ?? [];
  for (let i = 0; i < initStatuses.length; i++) {
    const c = initStatuses[i];
    restarts += c.restartCount ?? 0;
    const lastEnd = at(c.lastState?.terminated?.finishedAt);
    if (lastEnd > lastRestart) lastRestart = lastEnd;
    if (sidecar(c.name)) {
      sidecarRestarts += c.restartCount ?? 0;
      if (lastEnd > lastSidecarRestart) lastSidecarRestart = lastEnd;
    }
    const terminated = c.state?.terminated;
    const waiting = c.state?.waiting;
    // An exit code not given is 0, as in Go.
    if (terminated && (terminated.exitCode ?? 0) === 0) continue;
    if (sidecar(c.name) && c.started) {
      if (c.ready) ready++;
      continue;
    }
    if (terminated) {
      reason = terminated.reason ? `Init:${terminated.reason}` : terminated.signal ? `Init:Signal:${terminated.signal}` : `Init:ExitCode:${terminated.exitCode ?? 0}`;
    } else if (waiting?.reason && waiting.reason !== 'PodInitializing') {
      reason = `Init:${waiting.reason}`;
    } else {
      reason = `Init:${i}/${spec?.initContainers?.length ?? 0}`;
    }
    initializing = true;
    break;
  }

  const initialized = (status.conditions ?? []).find((c) => c.type === 'Initialized')?.status === 'True';
  if (!initializing || initialized) {
    restarts = sidecarRestarts;
    lastRestart = lastSidecarRestart;
    let running = false;
    let errorReason = '';
    const statuses = status.containerStatuses ?? [];
    // The last first: the first container's reason is the one that stays.
    for (let i = statuses.length - 1; i >= 0; i--) {
      const c = statuses[i];
      restarts += c.restartCount ?? 0;
      const lastEnd = at(c.lastState?.terminated?.finishedAt);
      if (lastEnd > lastRestart) lastRestart = lastEnd;
      const terminated = c.state?.terminated;
      if (c.state?.waiting?.reason) {
        reason = c.state.waiting.reason;
      } else if (terminated) {
        reason = terminated.reason || (terminated.signal ? `Signal:${terminated.signal}` : `ExitCode:${terminated.exitCode ?? 0}`);
        if ((terminated.exitCode ?? 0) !== 0) errorReason = reason;
      } else if (c.ready && c.state?.running) {
        running = true;
        ready++;
      }
    }
    // A container still running: not Completed.
    if (reason === 'Completed') {
      const podReady = (status.conditions ?? []).some((c) => c.type === 'Ready' && c.status === 'True');
      if (running && podReady) reason = 'Running';
      else if (errorReason) reason = errorReason;
      else if (running) reason = 'NotReady';
    }
  }

  if (pod.metadata?.deletionTimestamp && status.reason === 'NodeLost') reason = 'Unknown';
  else if (pod.metadata?.deletionTimestamp && phase !== 'Succeeded' && phase !== 'Failed') reason = 'Terminating';

  const summary = { ready, total, reason, restarts, lastRestart };
  summaries.set(pod, summary);
  return summary;
}
