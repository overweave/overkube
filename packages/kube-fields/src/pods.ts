import { define } from './define.ts';

/*
 * A pod's, beyond what every object has: where it is (a path); as kubectl
 * prints it — its status, how many of its containers are ready of how many
 * (sidecars counted), not ready, its restarts (CEL: the library's
 * podSummary, worked out once for each pod); what it refers to — the
 * secrets and config maps of its volumes (projected ones too, a CSI
 * volume's secret, the in-tree ones' — azureFile, cephfs, cinder,
 * flexVolume, iscsi, rbd, scaleIO, storageos), of every container's env (init and ephemeral ones too),
 * its image pull secrets; its claims (CEL).
 */
const kinds = ['pods.v1'];

/** Every container of a pod's spec (spec), init and ephemeral ones too. */
const containers = 'spec.?containers.orValue([]) + spec.?initContainers.orValue([]) + spec.?ephemeralContainers.orValue([])';

/** What a pod refers to of a kind: in its volumes (volume, projected), in its containers' envFrom and env (envFrom, env), more. */
const refs = (volume: string, projected: string, envFrom: string, env: string, more = '') => {
  // Filtered by the path with .? (there or not), taken by it plain.
  const at = (p: string) => p.replaceAll('.', '.?');
  return {
    cel: `cel.bind(spec, self.?spec.orValue({}), cel.bind(cs, ${containers}, cel.bind(vs, spec.?volumes.orValue([]),
    vs.filter(v, v.?${at(volume)}.hasValue()).map(v, v.${volume})
    + vs.filter(v, v.?projected.?sources.hasValue()).map(v, v.projected.sources.filter(s, s.?${at(projected)}.hasValue()).map(s, s.${projected})).flatten()
    + cs.map(c, c.?envFrom.orValue([]).filter(e, e.?${at(envFrom)}.hasValue()).map(e, e.${envFrom})).flatten()
    + cs.map(c, c.?env.orValue([]).filter(e, e.?valueFrom.?${at(env)}.hasValue()).map(e, e.valueFrom.${env})).flatten()${more})))`,
  };
};

export const PODS = define({
  'pods.v1.phase': { kinds, type: 'string', value: '.status.phase' },
  'pods.v1.node': { kinds, type: 'string', value: '.spec.nodeName' },
  'pods.v1.ip': { kinds, type: 'string', value: '.status.podIP' },
  'pods.v1.qos': { kinds, type: 'string', value: '.status.qosClass' },
  'pods.v1.started': { kinds, type: 'time', value: '.status.startTime' },
  'pods.v1.service-account': { kinds, type: 'string', value: '.spec.serviceAccountName' },
  'pods.v1.images': { kinds, type: 'string', many: true, value: '.spec.containers[*].image' },
  'pods.v1.status': { kinds, type: 'string', value: { cel: 'podSummary(self).reason' } },
  'pods.v1.containers': { kinds, type: 'number', value: { cel: 'podSummary(self).total' } },
  'pods.v1.ready': { kinds, type: 'number', value: { cel: 'podSummary(self).ready' } },
  'pods.v1.not-ready': { kinds, type: 'number', value: { cel: 'podSummary(self).total - podSummary(self).ready' } },
  'pods.v1.restarts': { kinds, type: 'number', value: { cel: 'podSummary(self).restarts' } },
  'pods.v1.secrets': {
    kinds,
    type: 'string',
    many: true,
    value: refs(
      'secret.secretName',
      'secret.name',
      'secretRef.name',
      'secretKeyRef.name',
      `
    + vs.filter(v, v.?csi.?nodePublishSecretRef.?name.hasValue()).map(v, v.csi.nodePublishSecretRef.name)
    + vs.filter(v, v.?azureFile.?secretName.hasValue()).map(v, v.azureFile.secretName)
    + ${['cephfs', 'cinder', 'flexVolume', 'iscsi', 'rbd', 'scaleIO', 'storageos'].map((t) => `vs.filter(v, v.?${t}.?secretRef.?name.hasValue()).map(v, v.${t}.secretRef.name)`).join('\n    + ')}
    + spec.?imagePullSecrets.orValue([]).filter(s, s.?name.hasValue()).map(s, s.name)`,
    ),
  },
  'pods.v1.configmaps': { kinds, type: 'string', many: true, value: refs('configMap.name', 'configMap.name', 'configMapRef.name', 'configMapKeyRef.name') },
  'pods.v1.pvcs': { kinds, type: 'string', many: true, value: '.spec.volumes[*].persistentVolumeClaim.claimName' },
});
