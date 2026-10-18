import { define } from './define.ts';

/*
 * What kubectl prints that is worked out of an object, not read off it: a
 * label selector as it writes one (app=web,tier in (a,b),!canary); a
 * workload's containers and images; a daemon set's node selector; how many
 * jobs a cron job runs, secrets an account has; an ingress's ports (80;
 * 443 with TLS); an autoscaler's targets (each metric now of its target:
 * cpu: 42%/70%, <unknown> not known yet); a quota's use of its requests and
 * its limits (pods: 4/50); a binding's users, groups, service accounts; a
 * pod's readiness gates met (1/2).
 */

/** A label selector at a path (spec.selector), as kubectl writes it: its requirements by key — a label key=value, an expression key in (a,b), key notin (a,b), key, !key (its values sorted). */
const selector = (path: string) =>
  `cel.bind(s, ${path}.orValue({}), cel.bind(l, s.?matchLabels.orValue({}), cel.bind(x, s.?matchExpressions.orValue([]), (l.map(k, k) + x.map(e, e.key)).distinct().sort().map(k, (k in l ? [k + '=' + l[k]] : []) + x.filter(e, e.key == k).map(e, e.operator == 'Exists' ? e.key : e.operator == 'DoesNotExist' ? '!' + e.key : e.key + ' ' + e.operator.lowerAscii() + ' (' + e.?values.orValue([]).sort().join(',') + ')')).flatten().join(','))))`;

/** A map's entries as key=value (by key). */
const pairs = (path: string) => `cel.bind(m, ${path}.orValue({}), m.map(k, k).sort().map(k, k + '=' + m[k]))`;

/**
 * An autoscaler's metrics, each as kubectl writes it: now of its target.
 * Now: the status's metric that is the same one (its type, and its name —
 * a resource's and container's; a metric's, its selector, an object's the
 * object it describes), the value its target is of (a share, an average, a
 * total) — none such, <unknown>. Its target: a share (42%), an average, a
 * total (none said, <auto>); an object's or an external one's average said
 * so ( (avg)). A resource's (a container's) its name first.
 */
const TARGETS = (() => {
  const target = (src: string) =>
    `cel.bind(t, m.${src}.target, t.type == 'Utilization' && has(t.averageUtilization) ? string(t.averageUtilization) + '%' : t.type == 'AverageValue' && has(t.averageValue) ? string(t.averageValue) : t.type == 'Value' && has(t.value) ? string(t.value) : '<auto>')`;
  const current = (src: string, same: string) =>
    `cel.bind(cs, now.filter(c, c.type == m.type && ${same}), size(cs) == 0 ? '<unknown>' : cel.bind(cur, cs[0].${src}.current, cel.bind(t, m.${src}.target, t.type == 'Utilization' ? (has(cur.averageUtilization) ? string(cur.averageUtilization) + '%' : '<unknown>') : t.type == 'AverageValue' ? (has(cur.averageValue) ? string(cur.averageValue) : '<unknown>') : has(cur.value) ? string(cur.value) : '<unknown>')))`;
  const pair = (src: string, same: string) => `(${current(src, same)}) + '/' + (${target(src)})`;
  /** The same metric by its name and selector (none: the same none). */
  const metric = (src: string) => `c.?${src}.?metric.?name.orValue('') == m.${src}.metric.name && c.?${src}.?metric.?selector.orValue({}) == m.${src}.metric.?selector.orValue({})`;
  const avg = (src: string) => ` + (m.${src}.target.type == 'AverageValue' ? ' (avg)' : '')`;
  return `cel.bind(now, self.?status.?currentMetrics.orValue([]), self.?spec.?metrics.orValue([]).map(m,
    m.type == 'Resource' ? m.resource.name + ': ' + ${pair('resource', "c.?resource.?name.orValue('') == m.resource.name")}
    : m.type == 'ContainerResource' ? m.containerResource.name + ': ' + ${pair('containerResource', "c.?containerResource.?name.orValue('') == m.containerResource.name && c.?containerResource.?container.orValue('') == m.containerResource.container")}
    : m.type == 'Pods' ? ${pair('pods', metric('pods'))}
    : m.type == 'Object' ? ${pair('object', `${metric('object')} && c.?object.?describedObject.?kind.orValue('') == m.object.describedObject.kind && c.?object.?describedObject.?name.orValue('') == m.object.describedObject.name`)}${avg('object')}
    : m.type == 'External' ? ${pair('external', metric('external'))}${avg('external')}
    : m.type))`;
})();

/** A quota's use of what it holds to, of those that are limits (or not): resource: used/hard, by name. */
const used = (limits: boolean) =>
  `cel.bind(h, self.?status.?hard.orValue({}), cel.bind(u, self.?status.?used.orValue({}), h.filter(k, ${limits ? '' : '!'}k.startsWith('limits.')).sort().map(k, k + ': ' + string(u[?k].orValue('0')) + '/' + string(h[k]))))`;

/** A binding's subjects of a kind: their names (a service account's namespace:name, as kubectl writes it). */
const subjects = (kind: string) =>
  `self.?subjects.orValue([]).filter(s, s.kind == '${kind}').map(s, ${kind === 'ServiceAccount' ? "s.?namespace.orValue('') + ':' + s.name" : 's.name'})`;

const WORKLOADS = ['deployments.v1.apps', 'statefulsets.v1.apps', 'daemonsets.v1.apps', 'replicasets.v1.apps', 'jobs.v1.batch'];
const BINDINGS = ['rolebindings.v1.rbac.authorization.k8s.io', 'clusterrolebindings.v1.rbac.authorization.k8s.io'];

export const PRINTERS = define({
  ...Object.fromEntries(
    WORKLOADS.flatMap((kind) => [
      [`${kind}.containers`, { kinds: [kind], type: 'string' as const, many: true, value: '.spec.template.spec.containers[*].name' }],
      [`${kind}.selector`, { kinds: [kind], type: 'string' as const, value: { cel: selector('self.?spec.?selector') } }],
    ]),
  ),
  'jobs.v1.batch.images': { kinds: ['jobs.v1.batch'], type: 'string', many: true, value: '.spec.template.spec.containers[*].image' },
  'cronjobs.v1.batch.containers': { kinds: ['cronjobs.v1.batch'], type: 'string', many: true, value: '.spec.jobTemplate.spec.template.spec.containers[*].name' },
  'cronjobs.v1.batch.images': { kinds: ['cronjobs.v1.batch'], type: 'string', many: true, value: '.spec.jobTemplate.spec.template.spec.containers[*].image' },
  'cronjobs.v1.batch.selector': { kinds: ['cronjobs.v1.batch'], type: 'string', value: { cel: selector('self.?spec.?jobTemplate.?spec.?selector') } },
  'cronjobs.v1.batch.active': { kinds: ['cronjobs.v1.batch'], type: 'number', value: { cel: 'size(self.?status.?active.orValue([]))' } },
  'daemonsets.v1.apps.nodeSelector': { kinds: ['daemonsets.v1.apps'], type: 'string', many: true, value: { cel: pairs('self.?spec.?template.?spec.?nodeSelector') } },
  'services.v1.selector': { kinds: ['services.v1'], type: 'string', value: { cel: `${pairs('self.?spec.?selector')}.join(',')` } },
  'ingresses.v1.networking.k8s.io.ports': {
    kinds: ['ingresses.v1.networking.k8s.io'],
    type: 'string',
    value: { cel: "size(self.?spec.?tls.orValue([])) > 0 ? '80, 443' : '80'" },
  },
  // A TLS entry with no hosts: for every host (the controller's default, as the API says).
  'ingresses.v1.networking.k8s.io.tls-any-host': {
    kinds: ['ingresses.v1.networking.k8s.io'],
    type: 'bool',
    value: { cel: 'self.?spec.?tls.orValue([]).exists(t, size(t.?hosts.orValue([])) == 0)' },
  },
  'serviceaccounts.v1.secrets': { kinds: ['serviceaccounts.v1'], type: 'number', value: { cel: 'size(self.?secrets.orValue([]))' } },
  'horizontalpodautoscalers.v2.autoscaling.targets': { kinds: ['horizontalpodautoscalers.v2.autoscaling'], type: 'string', many: true, value: { cel: TARGETS } },
  'resourcequotas.v1.request': { kinds: ['resourcequotas.v1'], type: 'string', many: true, value: { cel: used(false) } },
  'resourcequotas.v1.limit': { kinds: ['resourcequotas.v1'], type: 'string', many: true, value: { cel: used(true) } },
  'pods.v1.readinessGates': {
    kinds: ['pods.v1'],
    type: 'string',
    value: {
      cel: "cel.bind(g, self.?spec.?readinessGates.orValue([]), size(g) == 0 ? '' : string(size(g.filter(x, self.?status.?conditions.orValue([]).exists(c, c.type == x.conditionType && c.status == 'True')))) + '/' + string(size(g)))",
    },
  },
  ...Object.fromEntries(
    BINDINGS.flatMap((kind) => [
      [`${kind}.users`, { kinds: [kind], type: 'string' as const, many: true, value: { cel: subjects('User') } }],
      [`${kind}.groups`, { kinds: [kind], type: 'string' as const, many: true, value: { cel: subjects('Group') } }],
      [`${kind}.serviceAccounts`, { kinds: [kind], type: 'string' as const, many: true, value: { cel: subjects('ServiceAccount') } }],
    ]),
  ),
});
