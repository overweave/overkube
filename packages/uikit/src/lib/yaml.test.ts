import { describe, expect, it } from 'vitest';
import { toYaml } from './yaml';

describe('toYaml', () => {
  it('writes objects, lists and the strings YAML would misread quoted', () => {
    const yaml = toYaml({
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: { name: 'web', labels: { app: 'web', 'app.kubernetes.io/name': 'web' }, annotations: {} },
      spec: {
        containers: [{ name: 'web', image: 'nginx:1.27', ports: [{ containerPort: 80 }], args: ['--flag', 'yes', '', '8080'] }],
        nodeSelector: null,
      },
      data: { script: 'line one\nline two' },
    });
    expect(yaml).toBe(`apiVersion: v1
kind: Pod
metadata:
  name: web
  labels:
    app: web
    app.kubernetes.io/name: web
  annotations: {}
spec:
  containers:
    - name: web
      image: nginx:1.27
      ports:
        - containerPort: 80
      args:
        - "--flag"
        - "yes"
        - ""
        - "8080"
  nodeSelector: null
data:
  script: |-
    line one
    line two
`);
  });
});
