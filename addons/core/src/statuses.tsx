import { type KindInfo, kinds } from '@overkube/kube-types';
import { type CellValue, type KubeContributor, StatusLook, type StatusLookSpec, takes } from '@overkube/sdk';
import { Status, type Tone } from '@overkube/uikit';
import type { Definition } from '@overweave/core';
import { useDefinitions } from '@overweave/ui/preact';
import { useMemo } from 'preact/hooks';
import { EMPTY } from './format.ts';

/*
 * How the states kinds are told by look (StatusLook): the core's standard
 * set — every kind Kubernetes serves itself (as kubectl says their states,
 * as their health is worked out), any object's conditions and kstatus — each
 * a default another's of its name takes the place of (an operator's addon
 * adds its own words). And a state drawn: as its look says, else as it is.
 */

const { core, apps, batch, certificates, apiregistration, apiextensions, autoscaling } = kinds;
const POD = [core.v1.Pod];
const NODE = [core.v1.Node];
const WORKLOADS = [apps.v1.Deployment, apps.v1.StatefulSet, apps.v1.DaemonSet, apps.v1.ReplicaSet];
const JOB = [batch.v1.Job];
const CRONJOB = [batch.v1.CronJob];
const PVC = [core.v1.PersistentVolumeClaim];
const PV = [core.v1.PersistentVolume];
const NAMESPACE = [core.v1.Namespace];
const CSR = [certificates.v1.CertificateSigningRequest];
const APISERVICE = [apiregistration.v1.APIService];
const CRD = [apiextensions.v1.CustomResourceDefinition];
const HPA = [autoscaling.v2.HorizontalPodAutoscaler];
const EVENT = [core.v1.Event];

/** A look: the kinds it is for (none: every kind), the words it is for (* any run of them), its tone and icon. */
type Look = [kinds: readonly KindInfo[] | null, match: string, tone: Tone, icon: string];

export const LOOKS: Look[] = [
  // Any object's: going, not known; its conditions; kstatus.
  [null, 'Terminating', 'gone', 'trash'],
  [null, 'Unknown', 'unknown', 'help'],
  [null, 'True', 'ok', 'circle-check'],
  [null, 'False', 'error', 'circle-x'],
  [null, 'Current', 'ok', 'circle-check'],
  [null, 'InProgress', 'progress', 'spinner'],
  [null, 'Failed', 'error', 'circle-x'],
  [null, 'NotFound', 'gone', 'circle-off'],
  // A pod's, as kubectl says them.
  [POD, 'Running', 'ok', 'circle-play'],
  [POD, 'NotReady', 'warn', 'octagon'],
  [POD, 'Completed', 'done', 'circle-check'],
  [POD, 'Succeeded', 'done', 'circle-check'],
  [POD, 'Pending', 'waiting', 'circle-dashed'],
  [POD, 'SchedulingGated', 'waiting', 'clock-pause'],
  [POD, 'ContainerCreating', 'progress', 'spinner'],
  [POD, 'PodInitializing', 'progress', 'spinner'],
  [POD, 'Init:CrashLoopBackOff', 'error', 'crash-loop'],
  [POD, 'Init:Signal:*', 'error', 'bolt-off'],
  [POD, 'Init:ExitCode:*', 'error', 'octagon'],
  [POD, 'Init:*/*', 'progress', 'spinner'],
  [POD, 'Init:*', 'error', 'octagon'],
  [POD, 'CrashLoopBackOff', 'error', 'crash-loop'],
  [POD, 'Error', 'error', 'circle-x'],
  [POD, 'OOMKilled', 'error', 'flame'],
  [POD, 'ContainerCannotRun', 'error', 'circle-x'],
  [POD, 'StartError', 'error', 'circle-x'],
  [POD, 'DeadlineExceeded', 'error', 'hourglass'],
  [POD, 'ImagePullBackOff', 'error', 'image-off'],
  [POD, 'ErrImagePull', 'error', 'image-off'],
  [POD, 'ErrImageNeverPull', 'error', 'image-off'],
  [POD, 'InvalidImageName', 'error', 'image-off'],
  [POD, 'ImageInspectError', 'error', 'image-off'],
  [POD, 'CreateContainerConfigError', 'error', 'file-alert'],
  [POD, 'CreateContainerError', 'error', 'file-alert'],
  [POD, 'RunContainerError', 'error', 'circle-x'],
  [POD, 'PreStartHookError', 'error', 'octagon'],
  [POD, 'PostStartHookError', 'error', 'octagon'],
  [POD, 'Signal:*', 'error', 'bolt-off'],
  [POD, 'ExitCode:*', 'error', 'octagon'],
  [POD, 'UnexpectedAdmissionError', 'error', 'octagon'],
  [POD, 'Evicted', 'warn', 'evicted'],
  [POD, 'OutOfcpu', 'warn', 'cpu-off'],
  [POD, 'OutOfmemory', 'warn', 'flame'],
  [POD, 'NodeAffinity', 'warn', 'ban'],
  [POD, 'Shutdown', 'warn', 'server-off'],
  [POD, 'NodeLost', 'warn', 'server-off'],
  [POD, 'ContainerStatusUnknown', 'unknown', 'help'],
  // A node's.
  [NODE, 'Ready', 'ok', 'circle-check'],
  [NODE, '*,SchedulingDisabled', 'warn', 'ban'],
  [NODE, 'NotReady,SchedulingDisabled', 'error', 'ban'],
  [NODE, 'NotReady', 'error', 'circle-x'],
  // A workload's health.
  [WORKLOADS, 'Healthy', 'ok', 'circle-check'],
  [WORKLOADS, 'Progressing', 'progress', 'spinner'],
  [WORKLOADS, 'Degraded', 'error', 'octagon'],
  [WORKLOADS, 'ReplicaFailure', 'error', 'circle-x'],
  [WORKLOADS, 'Paused', 'waiting', 'pause'],
  [WORKLOADS, 'Scaled to zero', 'done', 'sleep'],
  [[apps.v1.DaemonSet], 'No nodes', 'done', 'server-off'],
  // A job's, a cron job's.
  [JOB, 'Running', 'progress', 'spinner'],
  [JOB, 'Complete', 'done', 'circle-check'],
  [JOB, 'SuccessCriteriaMet', 'done', 'circle-check'],
  [JOB, 'Suspended', 'waiting', 'pause'],
  [JOB, 'FailureTarget', 'error', 'circle-x'],
  [CRONJOB, 'Active', 'progress', 'spinner'],
  [CRONJOB, 'Scheduled', 'ok', 'clock-pause'],
  [CRONJOB, 'Suspended', 'waiting', 'pause'],
  // Volumes and their claims; namespaces.
  [PVC, 'Bound', 'ok', 'circle-check'],
  [PVC, 'Pending', 'waiting', 'circle-dashed'],
  [PVC, 'Lost', 'error', 'link-off'],
  [PV, 'Available', 'ok', 'circle-dashed'],
  [PV, 'Bound', 'ok', 'circle-check'],
  [PV, 'Pending', 'waiting', 'circle-dashed'],
  [PV, 'Released', 'warn', 'link-off'],
  [NAMESPACE, 'Active', 'ok', 'circle-check'],
  // Certificate signing requests, API services, CRDs, autoscalers.
  [CSR, 'Pending', 'waiting', 'circle-dashed'],
  [CSR, 'Approved', 'progress', 'spinner'],
  [CSR, '*Issued', 'ok', 'circle-check'],
  [CSR, '*Denied*', 'error', 'ban'],
  [CSR, '*Failed*', 'error', 'circle-x'],
  [APISERVICE, 'Available', 'ok', 'circle-check'],
  [APISERVICE, 'MissingEndpoints', 'error', 'link-off'],
  [APISERVICE, '*', 'error', 'network-off'],
  [CRD, 'Established', 'ok', 'circle-check'],
  [CRD, 'NotEstablished', 'waiting', 'circle-dashed'],
  [CRD, 'NamesConflict', 'error', 'octagon'],
  [HPA, 'AbleToScale', 'ok', 'circle-check'],
  [HPA, 'ScalingLimited', 'warn', 'octagon'],
  [HPA, 'ScalingActive: False', 'error', 'circle-x'],
  [HPA, 'AbleToScale: False', 'error', 'circle-x'],
  // An event's type.
  [EVENT, 'Normal', 'done', 'circle-check'],
  [EVENT, 'Warning', 'warn', 'octagon'],
];

/** A look's name: core.status.<its kinds' first, or any>.<its words> (* as "any"). */
const nameOf = ([of, match]: Look) => `core.status.${of ? of[0].id : 'any'}.${match.replace(/\*/g, 'any')}`;

/** The core's looks, each a default another's of its name takes the place of. */
export function addStatusLooks(c: KubeContributor): void {
  for (const look of LOOKS) {
    const [of, match, tone, icon] = look;
    c.add('StatusLook', nameOf(look), { ...(of ? { target: { kinds: of.map((k) => k.id) } } : {}), match, tone, icon }, { fallback: true });
  }
}

/** Whether a look's words take these: as said, or as its pattern (* any run of them). */
const matches = (match: string, words: string) =>
  match.includes('*')
    ? new RegExp(
        `^${match
          .split('*')
          .map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
          .join('.*')}$`,
      ).test(words)
    : match === words;

/** The look of these words for a kind: as said before a pattern (the longer pattern first), a kind's own before every kind's, then by order. */
export function lookOf(looks: readonly Definition<StatusLookSpec>[], kind: KindInfo, words: string): StatusLookSpec | undefined {
  const rank = (l: StatusLookSpec) => [l.match.includes('*') ? 1 : 0, l.target?.kinds ? 0 : 1, -l.match.length, l.order ?? 500];
  const taken = looks.filter((d) => takes(d.spec.target, kind) && matches(d.spec.match, words)).map((d) => d.spec);
  const before = (a: StatusLookSpec, b: StatusLookSpec) => {
    const [x, y] = [rank(a), rank(b)];
    const i = x.findIndex((v, j) => v !== y[j]);
    return i < 0 ? 0 : x[i] - y[i];
  };
  return taken.sort(before)[0];
}

/** A state drawn as its look says (none: its words as they are); a mark, its icon only — what it says under the pointer (title: other words for it). */
export function StatusOf({ kind, words, mark = false, title }: { kind: KindInfo; words: string; mark?: boolean; title?: string }) {
  const looks = useDefinitions(StatusLook);
  const look = useMemo(() => lookOf(looks, kind, words), [looks, kind, words]);
  if (!look) return mark ? <Status tone="unknown" icon="help" title={title ?? words} /> : words;
  return (
    <Status tone={look.tone} icon={look.icon} title={title ?? (mark ? words : undefined)}>
      {mark ? undefined : words}
    </Status>
  );
}

/** A column's format of a state (its value, the first if many): drawn as its look says; none, "—". */
export const statusFormat = ([value]: readonly CellValue[], { kind }: { kind: KindInfo }) => {
  const words = Array.isArray(value) ? value[0] : value;
  return words === null || words === undefined || words === '' ? EMPTY : <StatusOf kind={kind} words={String(words)} />;
};
