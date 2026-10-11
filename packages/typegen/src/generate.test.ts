import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { type File, generate, locate } from './generate.ts';
import type { Schema, Snapshot } from './schema.ts';

const ref = (id: string): Schema => ({ allOf: [{ $ref: `#/components/schemas/${id}` }] });
const META = 'io.k8s.apimachinery.pkg.apis.meta.v1';

/** A small cluster: one kind in apps/v1 using meta/v1 and the inline primitives. */
const snapshot: Snapshot = {
  kubernetes: 'v1.35.7',
  groupVersions: [
    {
      path: 'apis/apps/v1',
      openapi: {
        components: {
          schemas: {
            'io.k8s.api.apps.v1.Thing': {
              description: 'A thing. Not */ the end.',
              type: 'object',
              required: ['spec'],
              properties: {
                metadata: ref(`${META}.ObjectMeta`),
                spec: ref('io.k8s.api.apps.v1.ThingSpec'),
              },
              'x-kubernetes-group-version-kind': [{ group: 'apps', version: 'v1', kind: 'Thing' }],
            },
            'io.k8s.api.apps.v1.ThingSpec': {
              type: 'object',
              properties: {
                policy: { type: 'string', enum: ['Always', 'Never'] },
                port: ref('io.k8s.apimachinery.pkg.util.intstr.IntOrString'),
                memory: ref('io.k8s.apimachinery.pkg.api.resource.Quantity'),
                labels: { type: 'object', additionalProperties: { type: 'string' } },
                ids: { type: 'array', items: { type: 'integer' } },
                both: { type: 'array', items: { oneOf: [{ type: 'string' }, { type: 'number' }] } },
                anything: {},
                extra: { type: 'object', 'x-kubernetes-preserve-unknown-fields': true },
                legacy: { 'x-kubernetes-int-or-string': true },
                $ref: { type: 'string' },
                'x-list-type': { type: 'string' },
              },
            },
            [`${META}.ObjectMeta`]: { type: 'object', properties: { name: { type: 'string' } } },
            [`${META}.Time`]: { type: 'string', format: 'date-time' },
            'io.k8s.apimachinery.pkg.util.intstr.IntOrString': { oneOf: [{ type: 'integer' }, { type: 'string' }] },
            'io.k8s.apimachinery.pkg.api.resource.Quantity': { oneOf: [{ type: 'string' }, { type: 'number' }] },
          },
        },
      },
      resources: [
        { name: 'things', singularName: 'thing', namespaced: true, kind: 'Thing', verbs: ['get', 'list', 'watch'], shortNames: ['th'] },
        { name: 'things/status', namespaced: true, kind: 'Thing', verbs: ['get'] },
        { name: 'gadgets', singularName: 'gadget', namespaced: false, kind: 'Gadget', verbs: ['get'] },
      ],
    },
    {
      path: 'api/v1',
      openapi: {
        components: {
          schemas: {
            'io.k8s.api.core.v1.Pod': { type: 'object', properties: {}, 'x-kubernetes-group-version-kind': [{ group: '', version: 'v1', kind: 'Pod' }] },
            // meta's own carry the core group-version too.
            [`${META}.Status`]: { type: 'object', properties: {}, 'x-kubernetes-group-version-kind': [{ group: '', version: 'v1', kind: 'Status' }] },
          },
        },
      },
      resources: [{ name: 'pods', singularName: 'pod', namespaced: true, kind: 'Pod', verbs: ['list', 'watch'] }],
    },
  ],
};

/** An addon's group as the cluster publishes it: a CRD's schemas, and the meta ones they use repeated beside them. */
const addon: Snapshot = {
  kubernetes: 'v1.35.7',
  groupVersions: [
    {
      path: 'apis/cert-manager.io/v1',
      openapi: {
        components: {
          schemas: {
            'io.cert-manager.v1.Certificate': {
              type: 'object',
              properties: {
                apiVersion: { type: 'string' },
                kind: { type: 'string' },
                metadata: ref(`${META}.ObjectMeta`),
                spec: {
                  type: 'object',
                  required: ['secretName'],
                  // A CRD's checks: shapes nothing.
                  oneOf: [{ required: ['dnsNames'] }, { required: ['ipAddresses'] }],
                  properties: {
                    secretName: { type: 'string' },
                    dnsNames: { type: 'array', items: { type: 'string' } },
                    duration: { type: 'string', nullable: true },
                    keySize: { type: 'integer', enum: [2048, 4096] },
                    renew: { type: 'boolean', enum: [true] },
                    config: { type: 'object', 'x-kubernetes-preserve-unknown-fields': true, properties: { mode: { type: 'string' } } },
                    limits: { type: 'object', additionalProperties: { anyOf: [{ type: 'integer' }, { type: 'string' }], 'x-kubernetes-int-or-string': true } },
                  },
                },
                status: { type: 'object', properties: { notAfter: { type: 'string', format: 'date-time' } } },
              },
              'x-kubernetes-group-version-kind': [{ group: 'cert-manager.io', version: 'v1', kind: 'Certificate' }],
            },
            [`${META}.ObjectMeta`]: { type: 'object', properties: { name: { type: 'string' } } },
            [`${META}.ListMeta`]: { type: 'object', properties: {} },
          },
        },
      },
      resources: [
        { name: 'certificates', singularName: 'certificate', namespaced: true, kind: 'Certificate', verbs: ['get', 'list', 'watch'], shortNames: ['cert'] },
        { name: 'certificates/status', namespaced: true, kind: 'Certificate', verbs: ['get'] },
      ],
    },
  ],
};

/** An aggregated API built on newer Kubernetes than the cluster: it uses a meta type the built-in package lacks. */
const metrics: Snapshot = {
  kubernetes: 'v1.35.7',
  groupVersions: [
    {
      path: 'apis/metrics.k8s.io/v1beta1',
      openapi: {
        components: {
          schemas: {
            'io.k8s.metrics.pkg.apis.metrics.v1beta1.PodMetrics': {
              type: 'object',
              required: ['window'],
              properties: { metadata: ref(`${META}.ObjectMeta`), window: ref(`${META}.Duration`), timestamp: ref(`${META}.Time`) },
              'x-kubernetes-group-version-kind': [{ group: 'metrics.k8s.io', version: 'v1beta1', kind: 'PodMetrics' }],
            },
            [`${META}.ObjectMeta`]: { type: 'object', properties: { name: { type: 'string' } } },
            [`${META}.Duration`]: { type: 'string' },
            [`${META}.Time`]: { type: 'string', format: 'date-time' },
            [`${META}.ShardInfo`]: { type: 'object', properties: { selector: { type: 'string' } } },
          },
        },
      },
      resources: [{ name: 'pods', singularName: '', namespaced: true, kind: 'PodMetrics', verbs: ['get', 'list'] }],
    },
  ],
};
const lacksDuration = { builtin: '@overkube/kube-types', has: (module: string, name: string) => !(module === 'meta/v1' && name === 'Duration') };

/** One construct per field, for what the types say of it. */
function shapes(properties: Record<string, Schema>, extra: Record<string, Schema> = {}) {
  return generate({
    kubernetes: 'v1.35.7',
    groupVersions: [{ path: 'apis/x.io/v1', openapi: { components: { schemas: { 'io.x.v1.Shape': { type: 'object', properties }, ...extra } } }, resources: [] }],
  });
}

const fileOf = (files: File[], path: string) => files.find((f) => f.path === path)?.text ?? '';
const file = (path: string) => fileOf(generate(snapshot).files, path);

describe('locate', () => {
  it('turns a schema id into its module and name', () => {
    expect(locate('io.k8s.api.apps.v1.Deployment')).toEqual({ module: 'apps/v1', name: 'Deployment' });
    expect(locate(`${META}.ObjectMeta`)).toEqual({ module: 'meta/v1', name: 'ObjectMeta' });
    expect(locate('io.k8s.metrics.pkg.apis.metrics.v1beta1.PodMetrics')).toEqual({ module: 'metrics/v1beta1', name: 'PodMetrics' });
    expect(locate('io.cert-manager.v1.Certificate')).toEqual({ module: 'cert-manager/v1', name: 'Certificate' });
    expect(() => locate('io.k8s.something.Odd')).toThrow('no group and version');
  });
});

describe('generate: the built-in types', () => {
  it('writes one module per group-version and the kinds table, with a header', () => {
    expect(generate(snapshot).files.map((f) => f.path)).toEqual(['apps/v1.ts', 'core/v1.ts', 'meta/v1.ts', 'kinds.ts']);
    expect(file('apps/v1.ts')).toMatch(/^\/\/ Generated by @overkube\/typegen from Kubernetes v1\.35\.7's/);
    expect(generate(snapshot).warnings).toEqual([]);
  });

  it('imports what it uses from other modules', () => {
    expect(file('apps/v1.ts')).toContain("import type { ObjectMeta } from '../meta/v1.js';");
  });

  it('keeps required fields required, the rest optional, and documents them', () => {
    const apps = file('apps/v1.ts');
    expect(apps).toContain('/**\n * A thing. Not *\\/ the end.\n */\nexport interface Thing {');
    expect(apps).toContain('  spec: ThingSpec;');
    expect(apps).toContain('  metadata?: ObjectMeta;');
  });

  it('writes the Kubernetes shapes as TypeScript', () => {
    const apps = file('apps/v1.ts');
    expect(apps).toContain("  policy?: 'Always' | 'Never';");
    expect(apps).toContain('  port?: number | string;');
    expect(apps).toContain('  memory?: string;');
    expect(apps).toContain('  labels?: Record<string, string>;');
    expect(apps).toContain('  ids?: number[];');
    expect(apps).toContain('  both?: (string | number)[];');
    expect(apps).toContain('  anything?: unknown;');
    expect(apps).toContain('  extra?: Record<string, unknown>;');
    expect(apps).toContain('  legacy?: number | string;');
    expect(apps).toContain('  $ref?: string;');
    expect(apps).toContain('  "x-list-type"?: string;');
  });

  it('writes a schema without properties as a type alias, and leaves the inline ones out', () => {
    expect(file('meta/v1.ts')).toContain('export type Time = string;');
    expect(file('meta/v1.ts')).not.toContain('Quantity');
  });

  it('lists each kind by its module, without subresources', () => {
    const kinds = file('kinds.ts');
    expect(kinds).toContain('Thing: {"id":"apps/v1/Thing","group":"apps","version":"v1","kind":"Thing","plural":"things"');
    expect(kinds).toContain('"shortNames":["th"]');
    expect(kinds).not.toContain('things/status');
  });

  it('maps each kind to its type, or to KubeObject when it has no schema', () => {
    const kinds = file('kinds.ts');
    expect(kinds).toContain("import type * as apps_v1 from './apps/v1.js';");
    expect(kinds).toContain("  'apps/v1/Thing': apps_v1.Thing;");
    expect(kinds).toContain("  'apps/v1/Gadget': KubeObject;");
    expect(kinds).toContain("import type { KubeObject } from '../object.js';");
    expect(kinds).toContain('export interface KindMap {');
  });

  it('puts the core group under core, though meta types claim its group-version too', () => {
    const kinds = file('kinds.ts');
    expect(kinds).toContain('  core: {\n    v1: {\n      Pod: {"id":"v1/Pod","group":"","version":"v1"');
    expect(kinds).toContain("  'v1/Pod': core_v1.Pod;");
  });
});

describe('generate: an addon’s groups', () => {
  const { files, warnings } = generate(addon, { builtin: '@overkube/kube-types' });

  it('writes its own modules only, importing the built-in types from the package', () => {
    expect(files.map((f) => f.path)).toEqual(['cert-manager/v1.ts', 'kinds.ts']);
    const cm = fileOf(files, 'cert-manager/v1.ts');
    expect(cm).toMatch(/^\/\/ Generated by @overkube\/typegen from the OpenAPI v3 schemas of cert-manager\.io\/v1 on Kubernetes v1\.35\.7\./);
    expect(cm).toContain("import type { ObjectMeta } from '@overkube/kube-types/meta/v1';");
    expect(warnings).toEqual([]);
  });

  it('extends the package’s KindMap with its kinds', () => {
    const kinds = fileOf(files, 'kinds.ts');
    expect(kinds).toContain('  "cert-manager": {\n    v1: {\n      Certificate: {"id":"cert-manager.io/v1/Certificate"');
    expect(kinds).toContain("declare module '@overkube/kube-types/kinds' {\n  interface KindMap {\n    'cert-manager.io/v1/Certificate': cert_manager_v1.Certificate;\n  }\n}");
    expect(kinds).not.toContain('export interface KindMap');
  });

  it('takes a CRD’s own shape over the checks next to it', () => {
    const cm = fileOf(files, 'cert-manager/v1.ts');
    expect(cm).toContain('    secretName: string;');
    expect(cm).toContain('    dnsNames?: string[];');
  });
});

describe('generate: an addon using a built-in type the package lacks', () => {
  const { files, warnings } = generate(metrics, lacksDuration);

  it('writes that one with the addon’s types, and imports the rest', () => {
    expect(files.map((f) => f.path)).toEqual(['meta/v1.ts', 'metrics/v1beta1.ts', 'kinds.ts']);
    expect(fileOf(files, 'meta/v1.ts')).toContain('export type Duration = string;');
    expect(fileOf(files, 'meta/v1.ts')).not.toContain('ShardInfo');
    const m = fileOf(files, 'metrics/v1beta1.ts');
    expect(m).toContain("import type { ObjectMeta, Time } from '@overkube/kube-types/meta/v1';\nimport type { Duration } from '../meta/v1.js';");
    expect(warnings).toEqual([`${META}.Duration: not in @overkube/kube-types: written here`]);
  });

  it('keeps meta out of the kinds', () => {
    expect(fileOf(files, 'kinds.ts')).toContain("'metrics.k8s.io/v1beta1/PodMetrics': metrics_v1beta1.PodMetrics;");
  });
});

describe('generate: schema constructs', () => {
  it('writes several allOf as an intersection, and oneOf/anyOf as a union', () => {
    const { files } = shapes(
      {
        both: { allOf: [{ $ref: '#/components/schemas/io.x.v1.A' }, { $ref: '#/components/schemas/io.x.v1.B' }] },
        either: { anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
        mixed: { allOf: [{ oneOf: [{ type: 'string' }, { type: 'number' }] }, { $ref: '#/components/schemas/io.x.v1.A' }] },
      },
      { 'io.x.v1.A': { type: 'object', properties: { a: { type: 'string' } } }, 'io.x.v1.B': { type: 'object', properties: { b: { type: 'string' } } } },
    );
    const x = fileOf(files, 'x/v1.ts');
    expect(x).toContain('  both?: A & B;');
    expect(x).toContain('  either?: string | string[];');
    expect(x).toContain('  mixed?: (string | number) & A;');
  });

  it('writes enums of any primitive, escaped, and nullable as | null', () => {
    const x = fileOf(
      shapes({
        quote: { type: 'string', enum: ["it's", 'say "hi"', 'back\\slash', 'new\nline'] },
        size: { type: 'integer', enum: [1, 2.5] },
        flag: { type: 'boolean', enum: [false] },
        maybe: { type: 'string', nullable: true },
        maybeOne: { type: 'string', enum: ['a', null], nullable: true },
        list: { type: 'array', nullable: true, items: { type: 'string', nullable: true } },
      }).files,
      'x/v1.ts',
    );
    expect(x).toContain(`  quote?: 'it\\'s' | 'say "hi"' | 'back\\\\slash' | 'new\\nline';`);
    expect(x).toContain('  size?: 1 | 2.5;');
    expect(x).toContain('  flag?: false;');
    expect(x).toContain('  maybe?: string | null;');
    expect(x).toContain("  maybeOne?: 'a' | null;");
    expect(x).toContain('  list?: (string | null)[] | null;');
  });

  it('keeps an object’s other fields when it has some (additionalProperties, preserve-unknown-fields)', () => {
    const x = fileOf(
      shapes({
        open: { type: 'object', properties: { name: { type: 'string' } }, additionalProperties: { type: 'string' } },
        kept: { type: 'object', 'x-kubernetes-preserve-unknown-fields': true, properties: { name: { type: 'string' } } },
        closed: { type: 'object', properties: { name: { type: 'string' } } },
      }).files,
      'x/v1.ts',
    );
    expect(x).toContain('  open?: {\n    name?: string;\n    [key: string]: unknown;\n  };');
    expect(x).toContain('  kept?: {\n    name?: string;\n    [key: string]: unknown;\n  };');
    expect(x).toContain('  closed?: {\n    name?: string;\n  };');
  });

  it('warns of what it cannot say, and says unknown there', () => {
    const { files, warnings } = shapes(
      {
        odd: { type: 'file' },
        missing: { $ref: '#/components/schemas/io.x.v1.Missing' },
        negated: { type: 'string', not: { enum: ['x'] } },
        objects: { type: 'object', enum: [{ a: 1 }] },
        both: { type: 'string', oneOf: [{ type: 'number' }] },
      },
      { 'io.x.Unversioned': { type: 'string' } },
    );
    const x = fileOf(files, 'x/v1.ts');
    expect(x).toContain('  odd?: unknown;');
    expect(x).toContain('  missing?: unknown;');
    expect(x).toContain('  negated?: string;');
    expect(x).toContain('  objects?: Record<string, unknown>;');
    expect(x).toContain('  both?: string;');
    expect(warnings).toEqual([
      'io.x.Unversioned: no group and version in its id: left out',
      'io.x.v1.Shape.both: allOf/oneOf/anyOf next to a type of its own: the own type is taken',
      'io.x.v1.Shape.missing: #/components/schemas/io.x.v1.Missing is not among the schemas: written as unknown',
      'io.x.v1.Shape.negated: not: left out, the type says what the rest of the schema does',
      'io.x.v1.Shape.objects: an enum of objects or lists: written as its type',
      'io.x.v1.Shape.odd: type "file": written as unknown',
    ]);
  });
});

/** The same cluster listed in another order: group-versions, schemas, resources. */
function reordered(s: Snapshot): Snapshot {
  return {
    kubernetes: s.kubernetes,
    groupVersions: [...s.groupVersions].reverse().map((gv) => ({
      path: gv.path,
      openapi: { components: { schemas: Object.fromEntries(Object.entries(gv.openapi.components?.schemas ?? {}).reverse()) } },
      resources: [...gv.resources].reverse(),
    })),
  };
}

describe('generate: determinism', () => {
  it('gives the same files for the same cluster, whatever order it listed things in', () => {
    expect(generate(reordered(snapshot))).toEqual(generate(snapshot));
    expect(generate(reordered(addon), { builtin: '@overkube/kube-types' })).toEqual(generate(addon, { builtin: '@overkube/kube-types' }));
    expect(generate(reordered(metrics), lacksDuration)).toEqual(generate(metrics, lacksDuration));
  });
});

/** Compile files in a folder of their own; the TypeScript errors, as text. */
function compile(files: Record<string, string>, paths: Record<string, string[]> = {}): string[] {
  const dir = mkdtempSync(join(tmpdir(), 'uk-typegen-'));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  const program = ts.createProgram(
    Object.keys(files).map((p) => join(dir, p)),
    {
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      allowImportingTsExtensions: true,
      types: [],
      paths,
    },
  );
  return ts.getPreEmitDiagnostics(program).map((d) => `${d.file ? `${d.file.fileName.slice(dir.length + 1)}: ` : ''}${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`);
}

const KUBE_TYPES = new URL('../../kube-types/src/', import.meta.url).pathname;
const REAL_KUBE_TYPES = { '@overkube/kube-types': [join(KUBE_TYPES, 'index.ts')], '@overkube/kube-types/*': [join(KUBE_TYPES, 'gen/*')] };

describe('generate: the output compiles', () => {
  it('the built-in types, with the package around them', () => {
    const gen = Object.fromEntries(generate(snapshot).files.map((f) => [`src/gen/${f.path}`, f.text]));
    const errors = compile({
      ...gen,
      'src/object.ts': readFileSync(join(KUBE_TYPES, 'object.ts'), 'utf8'),
      'src/use.ts': [
        "import type { KindMap } from './gen/kinds.js';",
        "const thing: KindMap['apps/v1/Thing'] = { spec: { policy: 'Always', port: 80 }, metadata: { name: 'a' } };",
        '// @ts-expect-error: a policy it does not have',
        "const bad: KindMap['apps/v1/Thing'] = { spec: { policy: 'Sometimes' } };",
        'export { bad, thing };',
      ].join('\n'),
    });
    expect(errors).toEqual([]);
  });

  it('an addon’s types, against the real @overkube/kube-types, with ObjectOf knowing its kinds', () => {
    const gen = Object.fromEntries(generate(addon, { builtin: '@overkube/kube-types' }).files.map((f) => [`gen/${f.path}`, f.text]));
    const errors = compile(
      {
        ...gen,
        'use.ts': [
          "import type { ObjectOf } from '@overkube/kube-types';",
          "import { kinds } from './gen/kinds.js';",
          "type Certificate = ObjectOf<(typeof kinds)['cert-manager']['v1']['Certificate']>;",
          "const cert: Certificate = { metadata: { name: 'web' }, spec: { secretName: 'web-tls', keySize: 4096, duration: null, config: { any: 1 } } };",
          '// @ts-expect-error: the secret is a name',
          'const bad: Certificate = { spec: { secretName: 1 } };',
          "const plural: 'certificates' = kinds['cert-manager'].v1.Certificate.plural;",
          'export { bad, cert, plural };',
        ].join('\n'),
      },
      REAL_KUBE_TYPES,
    );
    expect(errors).toEqual([]);
  });

  it('an aggregated API’s, with the meta type the real package lacks written beside it', () => {
    // The real package's meta/v1, asked as the CLI asks it.
    const meta = readFileSync(join(KUBE_TYPES, 'gen/meta/v1.ts'), 'utf8');
    const has = (module: string, name: string) => module === 'meta/v1' && new RegExp(`^export (interface|type) ${name}\\b`, 'm').test(meta);
    const { files } = generate(metrics, { builtin: '@overkube/kube-types', has });
    expect(files.map((f) => f.path)).toContain('meta/v1.ts');
    const gen = Object.fromEntries(files.map((f) => [`gen/${f.path}`, f.text]));
    const errors = compile(
      {
        ...gen,
        'use.ts': [
          "import type { ObjectOf } from '@overkube/kube-types';",
          "import type { kinds } from './gen/kinds.js';",
          "const m: ObjectOf<(typeof kinds)['metrics']['v1beta1']['PodMetrics']> = { window: '30s', timestamp: '2026-10-09T00:00:00Z' };",
          'export { m };',
        ].join('\n'),
      },
      REAL_KUBE_TYPES,
    );
    expect(errors).toEqual([]);
  });
});
