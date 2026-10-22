import type { Schema } from './schema';

/* A kind's schema as a cluster's OpenAPI says it (a Deployment's, cut short: $ref to its components, allOf of one), and a good text of it — for the tests and the stories. */

const ref = (name: string) => ({ allOf: [{ $ref: `#/components/schemas/${name}` }] });
export const DEPLOYMENT: Schema = {
  ...ref('Deployment'),
  components: {
    schemas: {
      Deployment: {
        type: 'object',
        properties: {
          apiVersion: { type: 'string' },
          kind: { type: 'string' },
          metadata: ref('ObjectMeta'),
          spec: { ...ref('DeploymentSpec'), description: 'Specification of the desired behavior of the Deployment.' },
        },
      },
      ObjectMeta: {
        type: 'object',
        properties: { name: { type: 'string' }, labels: { type: 'object', additionalProperties: { type: 'string' } } },
      },
      DeploymentSpec: {
        type: 'object',
        required: ['selector', 'template'],
        properties: {
          replicas: { type: 'integer', description: 'Number of desired pods.' },
          paused: { type: 'boolean' },
          selector: { type: 'object', 'x-kubernetes-preserve-unknown-fields': true },
          strategy: { type: 'object', properties: { type: { type: 'string', enum: ['Recreate', 'RollingUpdate'] } } },
          template: { type: 'object', properties: { spec: { type: 'object', properties: { containers: { type: 'array', items: ref('Container') } } } } },
        },
      },
      Container: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          image: { type: 'string' },
          ports: { type: 'array', items: { type: 'object', properties: { containerPort: { type: 'integer' } } } },
        },
      },
    },
  },
};

export const GOOD = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  labels:
    app: api
spec:
  replicas: 2
  selector:
    matchLabels:
      app: api
  template:
    spec:
      containers:
        - name: api
          image: api:1
`;
