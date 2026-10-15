import { define } from './define.ts';

/*
 * The states kinds are told by where kubectl tells one (a node's, a job's,
 * a claim's — as kubectl works it out), and where it tells none, worked out
 * of their status (a workload's health: Healthy, Progressing, Degraded…).
 * And any object's, as kstatus (sigs.k8s.io/cli-utils) works it out of its
 * conditions and generation — an operator's resources too: Current,
 * InProgress, Failed, Terminating (nothing to tell it by: "").
 */

/** Its conditions bound as conds, then what follows. */
const withConds = (body: string) => `cel.bind(conds, self.?status.?conditions.orValue([]), ${body})`;
/** One of its conditions is of this type and status. */
const is = (type: string, status = 'True') => `conds.exists(c, c.?type.orValue("") == "${type}" && c.?status.orValue("") == "${status}")`;
/** Its condition of this type's reason is this. */
const because = (type: string, reason: string) => `conds.exists(c, c.?type.orValue("") == "${type}" && c.?reason.orValue("") == "${reason}")`;
const DELETING = 'has(self.metadata.deletionTimestamp)';
/** Its controller has not seen its spec as it is yet. */
const UNSEEN = 'self.?status.?observedGeneration.orValue(0) < self.metadata.?generation.orValue(0)';
const n = (path: string, none: number) =>
  `self.${path
    .split('.')
    .map((k) => `?${k}`)
    .join('.')}.orValue(${none})`;

/**
 * A replicated workload's health: going, paused, its pods not to be made,
 * stuck, none wanted; rolling out (its controller not caught up, fewer
 * pods made of its spec as it is than it wants made so); not all up — when
 * its rollout is said done (a deployment's), degraded, else still coming
 * up (a new pod not ready yet: as kstatus, in progress); fine.
 */
const health = (
  kind: string,
  {
    desired,
    ready,
    updated,
    fresh = 'want',
    paused = 'false',
    done = 'false',
    none = 'Scaled to zero',
  }: { desired: string; ready: string; updated: string; fresh?: string; paused?: string; done?: string; none?: string },
) => ({
  kinds: [kind],
  type: 'string' as const,
  value: {
    cel: withConds(`cel.bind(want, ${desired}, cel.bind(up, ${ready}, cel.bind(made, ${updated}, cel.bind(wanted, ${fresh},
      ${DELETING} ? "Terminating"
      : ${paused} ? "Paused"
      : ${is('ReplicaFailure')} ? "ReplicaFailure"
      : ${because('Progressing', 'ProgressDeadlineExceeded')} ? "Degraded"
      : want == 0 ? "${none}"
      : ${UNSEEN} || made < wanted ? "Progressing"
      : up < want ? (${done} ? "Degraded" : "Progressing")
      : "Healthy"))))`),
  },
});

export const STATUS = define({
  'nodes.v1.status': {
    kinds: ['nodes.v1'],
    type: 'string',
    value: {
      cel: withConds(`(${is('Ready')} ? "Ready" : ${is('Ready', 'False')} ? "NotReady" : "Unknown")
        + (self.?spec.?unschedulable.orValue(false) ? ",SchedulingDisabled" : "")`),
    },
  },
  'deployments.v1.apps.health': health('deployments.v1.apps', {
    desired: n('spec.replicas', 1),
    ready: n('status.availableReplicas', 0),
    updated: n('status.updatedReplicas', 0),
    paused: 'self.?spec.?paused.orValue(false)',
    // Its rollout said done (its new replica set available): not all up now is a fault, not a rollout.
    done: because('Progressing', 'NewReplicaSetAvailable'),
  }),
  'statefulsets.v1.apps.health': health('statefulsets.v1.apps', {
    desired: n('spec.replicas', 1),
    ready: n('status.readyReplicas', 0),
    updated: n('status.updatedReplicas', 0),
    // Made of its spec as it is, as many as its strategy wants: those at or past its partition; on delete, none (they are made as they go).
    fresh: `self.?spec.?updateStrategy.?type.orValue("RollingUpdate") == "OnDelete" ? 0
      : cel.bind(part, ${n('spec.updateStrategy.rollingUpdate.partition', 0)}, part >= want ? 0 : want - part)`,
  }),
  'daemonsets.v1.apps.health': health('daemonsets.v1.apps', {
    desired: n('status.desiredNumberScheduled', 0),
    ready: n('status.numberAvailable', 0),
    updated: n('status.updatedNumberScheduled', 0),
    // No node it should run on (its selector, its tolerations): not scaled — nothing to run on.
    none: 'No nodes',
  }),
  'replicasets.v1.apps.health': health('replicasets.v1.apps', {
    desired: n('spec.replicas', 1),
    ready: n('status.readyReplicas', 0),
    updated: n('status.replicas', 0),
  }),
  // As kubectl tells a job (1.30): going, done, given up on, paused, about to be done or to fail, at work.
  'jobs.v1.batch.status': {
    kinds: ['jobs.v1.batch'],
    type: 'string',
    value: {
      cel: withConds(`${DELETING} ? "Terminating"
        : ${is('Complete')} ? "Complete"
        : ${is('Failed')} ? "Failed"
        : ${is('Suspended')} ? "Suspended"
        : ${is('SuccessCriteriaMet')} ? "SuccessCriteriaMet"
        : ${is('FailureTarget')} ? "FailureTarget"
        : "Running"`),
    },
  },
  'cronjobs.v1.batch.status': {
    kinds: ['cronjobs.v1.batch'],
    type: 'string',
    value: {
      cel: `${DELETING} ? "Terminating" : self.?spec.?suspend.orValue(false) ? "Suspended" : size(self.?status.?active.orValue([])) > 0 ? "Active" : "Scheduled"`,
    },
  },
  'persistentvolumeclaims.v1.status': {
    kinds: ['persistentvolumeclaims.v1'],
    type: 'string',
    value: { cel: `${DELETING} ? "Terminating" : self.?status.?phase.orValue("Pending")` },
  },
  'persistentvolumes.v1.status': {
    kinds: ['persistentvolumes.v1'],
    type: 'string',
    value: { cel: `${DELETING} ? "Terminating" : self.?status.?phase.orValue("Pending")` },
  },
  // As kubectl tells one: Approved, Denied, Failed (as many as there are), Issued once signed; none of these, Pending.
  'certificatesigningrequests.v1.certificates.k8s.io.status': {
    kinds: ['certificatesigningrequests.v1.certificates.k8s.io'],
    type: 'string',
    value: {
      cel: withConds(`cel.bind(said, [${['Approved', 'Denied', 'Failed'].map((t) => `conds.exists(c, c.?type.orValue("") == "${t}") ? "${t}" : ""`).join(', ')},
          size(self.?status.?certificate.orValue("")) > 0 ? "Issued" : ""].filter(w, w != ""),
        size(said) == 0 ? "Pending" : size(said) == 1 ? said[0] : size(said) == 2 ? said[0] + "," + said[1] : size(said) == 3 ? said[0] + "," + said[1] + "," + said[2] : said[0] + "," + said[1] + "," + said[2] + "," + said[3])`),
    },
  },
  'apiservices.v1.apiregistration.k8s.io.status': {
    kinds: ['apiservices.v1.apiregistration.k8s.io'],
    type: 'string',
    value: {
      cel: withConds(`${is('Available')} ? "Available"
        : cel.bind(why, conds.filter(c, c.?type.orValue("") == "Available").map(c, c.?reason.orValue("")), size(why) > 0 && why[0] != "" ? why[0] : "Unavailable")`),
    },
  },
  'customresourcedefinitions.v1.apiextensions.k8s.io.status': {
    kinds: ['customresourcedefinitions.v1.apiextensions.k8s.io'],
    type: 'string',
    value: {
      cel: withConds(`${DELETING} ? "Terminating" : ${is('NamesAccepted', 'False')} ? "NamesConflict" : ${is('Established')} ? "Established" : "NotEstablished"`),
    },
  },
  'horizontalpodautoscalers.v2.autoscaling.status': {
    kinds: ['horizontalpodautoscalers.v2.autoscaling'],
    type: 'string',
    value: {
      // Not able to scale, its metrics not had, held at its bounds; able to scale (said so); nothing said yet: not known.
      cel: withConds(`${is('AbleToScale', 'False')} ? "AbleToScale: False"
        : ${is('ScalingActive', 'False')} ? "ScalingActive: False"
        : ${is('ScalingLimited')} ? "ScalingLimited"
        : ${is('AbleToScale')} ? "AbleToScale"
        : "Unknown"`),
    },
  },
});

/** Any object's state, as kstatus works it out: every kind's (an operator's too). */
export const HEALTH = define({
  // kstatus: going; stuck (Stalled); getting there (Reconciling, its spec not yet seen, not Ready); as asked (Ready, or conditions none of these); no conditions: "".
  'core.health': {
    type: 'string',
    value: {
      cel: withConds(`${DELETING} ? "Terminating"
        : ${is('Stalled')} ? "Failed"
        : ${is('Reconciling')} || (self.?status.?observedGeneration.hasValue() && ${UNSEEN}) ? "InProgress"
        : ${is('Ready')} ? "Current"
        : ${is('Ready', 'False')} ? "InProgress"
        : size(conds) > 0 ? "Current"
        : ""`),
    },
  },
});
