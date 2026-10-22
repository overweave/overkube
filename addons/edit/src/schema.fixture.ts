import type { KindSchema } from '@overkube/sdk';

/*
 * A Deployment's schema as a cluster's OpenAPI (v3) says it, cut short
 * (/openapi/v3/apis/apps/v1: $ref to its components, allOf of one) — what
 * the tests' and stories' cluster answers schema() with.
 */

type Schema = Record<string, unknown>;

const ref = (name: string, more: Schema = {}): Schema => ({ allOf: [{ $ref: `#/components/schemas/${name}` }], ...more });
const str = (description: string): Schema => ({ type: 'string', description });
const int = (description: string): Schema => ({ type: 'integer', description });
const map = (description: string): Schema => ({ type: 'object', additionalProperties: { type: 'string' }, description });

export const DEPLOYMENT_SCHEMA: KindSchema = {
  $ref: '#/components/schemas/Deployment',
  components: {
    schemas: {
      Deployment: {
        type: 'object',
        description: 'Deployment enables declarative updates for Pods and ReplicaSets.',
        properties: {
          apiVersion: str('APIVersion defines the versioned schema of this representation of an object.'),
          kind: str('Kind is a string value representing the REST resource this object represents.'),
          metadata: ref('ObjectMeta', { description: "Standard object's metadata." }),
          spec: ref('DeploymentSpec', { description: 'Specification of the desired behavior of the Deployment.' }),
          status: { type: 'object', 'x-kubernetes-preserve-unknown-fields': true, description: 'Most recently observed status of the Deployment.' },
        },
      },
      ObjectMeta: {
        type: 'object',
        properties: {
          name: str('Name must be unique within a namespace.'),
          namespace: str('Namespace defines the space within which each name must be unique.'),
          labels: map('Map of string keys and values that can be used to organize and categorize objects.'),
          annotations: map('Annotations is an unstructured key value map stored with a resource.'),
          uid: str('UID is the unique in time and space value for this object.'),
          resourceVersion: str('An opaque value that represents the internal version of this object.'),
          generation: int('A sequence number representing a specific generation of the desired state.'),
          creationTimestamp: str('A timestamp representing the server time when this object was created.'),
          ownerReferences: { type: 'array', items: { type: 'object', 'x-kubernetes-preserve-unknown-fields': true } },
        },
      },
      DeploymentSpec: {
        type: 'object',
        required: ['selector', 'template'],
        properties: {
          replicas: int('Number of desired pods. Defaults to 1.'),
          selector: { type: 'object', 'x-kubernetes-preserve-unknown-fields': true, description: 'Label selector for pods. It must match the pod template’s labels.' },
          template: ref('PodTemplateSpec', { description: 'Template describes the pods that will be created.' }),
          strategy: {
            type: 'object',
            description: 'The deployment strategy to use to replace existing pods with new ones.',
            properties: {
              type: { type: 'string', enum: ['Recreate', 'RollingUpdate'], description: 'Type of deployment. Default is RollingUpdate.' },
              rollingUpdate: {
                type: 'object',
                properties: {
                  maxSurge: { 'x-kubernetes-int-or-string': true, description: 'The maximum number of pods that can be scheduled above the desired number of pods.' },
                  maxUnavailable: { 'x-kubernetes-int-or-string': true, description: 'The maximum number of pods that can be unavailable during the update.' },
                },
              },
            },
          },
          minReadySeconds: int('Minimum number of seconds for which a newly created pod should be ready.'),
          revisionHistoryLimit: int('The number of old ReplicaSets to retain to allow rollback.'),
          progressDeadlineSeconds: int('The maximum time in seconds for a deployment to make progress before it is considered to be failed.'),
          paused: { type: 'boolean', description: 'Indicates that the deployment is paused.' },
        },
      },
      PodTemplateSpec: { type: 'object', properties: { metadata: ref('ObjectMeta'), spec: ref('PodSpec') } },
      PodSpec: {
        type: 'object',
        required: ['containers'],
        properties: {
          containers: { type: 'array', items: ref('Container'), description: 'List of containers belonging to the pod.' },
          initContainers: { type: 'array', items: ref('Container') },
          volumes: { type: 'array', items: { type: 'object', 'x-kubernetes-preserve-unknown-fields': true } },
          serviceAccountName: str('Name of the ServiceAccount to use to run this pod.'),
          nodeSelector: map('A selector which must be true for the pod to fit on a node.'),
          restartPolicy: { type: 'string', enum: ['Always', 'OnFailure', 'Never'], description: 'Restart policy for all containers within the pod.' },
          terminationGracePeriodSeconds: int('Optional duration in seconds the pod needs to terminate gracefully.'),
        },
      },
      Container: {
        type: 'object',
        required: ['name'],
        properties: {
          name: str('Name of the container specified as a DNS_LABEL.'),
          image: str('Container image name.'),
          imagePullPolicy: { type: 'string', enum: ['Always', 'IfNotPresent', 'Never'], description: 'Image pull policy.' },
          command: { type: 'array', items: { type: 'string' }, description: 'Entrypoint array. Not executed within a shell.' },
          args: { type: 'array', items: { type: 'string' }, description: 'Arguments to the entrypoint.' },
          env: {
            type: 'array',
            description: 'List of environment variables to set in the container.',
            items: {
              type: 'object',
              required: ['name'],
              properties: { name: str('Name of the environment variable.'), value: str('Its value.'), valueFrom: { type: 'object', 'x-kubernetes-preserve-unknown-fields': true } },
            },
          },
          envFrom: { type: 'array', items: { type: 'object', 'x-kubernetes-preserve-unknown-fields': true } },
          ports: {
            type: 'array',
            items: {
              type: 'object',
              required: ['containerPort'],
              properties: {
                name: str('A name for the port, an IANA_SVC_NAME.'),
                containerPort: int('Number of port to expose on the pod’s IP address.'),
                protocol: { type: 'string', enum: ['TCP', 'UDP', 'SCTP'] },
              },
            },
          },
          resources: {
            type: 'object',
            description: 'Compute resources required by this container.',
            properties: {
              requests: { type: 'object', additionalProperties: { 'x-kubernetes-int-or-string': true }, description: 'The minimum amount of compute resources required.' },
              limits: { type: 'object', additionalProperties: { 'x-kubernetes-int-or-string': true }, description: 'The maximum amount of compute resources allowed.' },
            },
          },
          volumeMounts: {
            type: 'array',
            items: {
              type: 'object',
              required: ['name', 'mountPath'],
              properties: { name: str('Must match the name of a volume.'), mountPath: str('Path within the container.'), readOnly: { type: 'boolean' } },
            },
          },
          livenessProbe: { type: 'object', 'x-kubernetes-preserve-unknown-fields': true },
          readinessProbe: { type: 'object', 'x-kubernetes-preserve-unknown-fields': true },
        },
      },
    },
  },
};
