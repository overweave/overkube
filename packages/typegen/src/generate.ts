import type { ApiResource, GroupVersionKind, Schema, Snapshot } from './schema.ts';

/** A generated file: its path under the output folder and its text. */
export interface File {
  path: string;
  text: string;
}

export interface GenerateOptions {
  /**
   * For an addon's groups: the package with the built-in types
   * ("@overkube/kube-types"). What the groups' schemas use of them
   * (ObjectMeta, …) is imported from it rather than written again, and its
   * KindMap is extended with the groups' kinds. Without it: the built-in
   * types themselves.
   */
  builtin?: string;
  /**
   * Whether that package has a built-in type (module "meta/v1", name
   * "Duration"). One it lacks — an addon's API server can be built on newer
   * Kubernetes than the cluster's — is written with the addon's types
   * instead. Without it: the package is taken to have them all.
   */
  has?: (module: string, name: string) => boolean;
}

export interface Generated {
  files: File[];
  /** What the TypeScript does not say exactly (a construct written as unknown, a schema left out): one line each. */
  warnings: string[];
}

/**
 * Schemas whose id has no group and version (io.k8s.apimachinery.pkg.api.resource.Quantity):
 * written in place, not as types of their own.
 */
const INLINE: Record<string, string> = {
  'io.k8s.apimachinery.pkg.api.resource.Quantity': 'string',
  'io.k8s.apimachinery.pkg.util.intstr.IntOrString': 'number | string',
  'io.k8s.apimachinery.pkg.runtime.RawExtension': 'Record<string, unknown>',
};

/** The ids of the built-in schemas: Kubernetes' own, its API extensions' and its aggregator's. */
const BUILTIN = /^io\.k8s\.(?:api|apimachinery|apiextensions-apiserver|kube-aggregator)\./;

/** "io.k8s.api.apps.v1.Deployment" → { module: "apps/v1", name: "Deployment" }; "io.cert-manager.v1.Certificate" → cert-manager/v1. */
export function locate(id: string): { module: string; name: string } {
  const m = id.match(/\.([a-z0-9-]+)\.(v\d+(?:(?:alpha|beta)\d+)?)\.([A-Za-z0-9]+)$/);
  if (!m) throw new Error(`no group and version in schema ${id}`);
  return { module: `${m[1]}/${m[2]}`, name: m[3] };
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/** What every module of one run shares: the schemas, the options, the warnings. */
interface Run {
  schemas: Map<string, Schema>;
  options: GenerateOptions;
  warnings: Set<string>;
  /** Built-in schemas the package lacks that the output refers to: to be written with it. */
  missing: Set<string>;
}

/** Whether a schema's type comes from the built-in package rather than being written here. */
function imported(run: Run, id: string, target: { module: string; name: string }): boolean {
  const { builtin, has } = run.options;
  return Boolean(builtin && BUILTIN.test(id) && (!has || has(target.module, target.name)));
}

/** The schemas of every group-version, by id; each document repeats what it refers to (the first one, in path order, is taken). */
function collect(snapshot: Snapshot): Map<string, Schema> {
  const all = new Map<string, Schema>();
  for (const gv of [...snapshot.groupVersions].sort((a, b) => a.path.localeCompare(b.path))) {
    for (const [id, schema] of Object.entries(gv.openapi.components?.schemas ?? {})) if (!all.has(id)) all.set(id, schema);
  }
  return all;
}

/** Whether a schema says what shape a value has, rather than only checking one (a CRD's { required: [...] } in a oneOf). */
function shaped(s: Schema): boolean {
  return Boolean(
    s.$ref ||
      s.type ||
      s.properties ||
      s.items ||
      s.enum ||
      s.allOf?.some(shaped) ||
      s.oneOf?.some(shaped) ||
      s.anyOf?.some(shaped) ||
      s.additionalProperties !== undefined ||
      s['x-kubernetes-int-or-string'] ||
      s['x-kubernetes-preserve-unknown-fields'],
  );
}

/** A JSON value as a TypeScript literal type, or nothing for one that is not a primitive. */
function literal(value: unknown): string | undefined {
  if (value === null) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value !== 'string') return undefined;
  // JSON's escapes, in single quotes: a " no longer needs one, a ' does.
  return `'${JSON.stringify(value).slice(1, -1).replaceAll('\\"', '"').replaceAll("'", "\\'")}'`;
}

/** A type as a part of an intersection or an array: in parentheses when it is a union or an intersection. */
function grouped(type: string): string {
  return type.includes(' | ') || type.includes(' & ') ? `(${type})` : type;
}

/** Writes the types of one module; collects what it needs from others. */
class Module {
  /** By import specifier ("../meta/v1.js", "@overkube/kube-types/meta/v1"): the names. */
  readonly imports = new Map<string, Set<string>>();
  /** By name: each type's text. */
  readonly types = new Map<string, string>();
  readonly name: string;
  readonly run: Run;

  constructor(name: string, run: Run) {
    this.name = name;
    this.run = run;
  }

  warn(at: string, what: string): void {
    this.run.warnings.add(`${at}: ${what}`);
  }

  /** A schema as a type expression; `at` says where it is, for the warnings. */
  type(schema: Schema, indent: string, at: string): string {
    const type = this.shape(schema, indent, at);
    return schema.nullable && type !== 'unknown' && !type.split(' | ').includes('null') ? `${type} | null` : type;
  }

  shape(schema: Schema, indent: string, at: string): string {
    if (schema.$ref) return this.ref(schema.$ref, at);
    if (schema['x-kubernetes-int-or-string']) return 'number | string';
    if (schema.not) this.warn(at, 'not: left out, the type says what the rest of the schema does');

    const all = (schema.allOf ?? []).filter(shaped);
    const alternatives = (schema.oneOf ?? schema.anyOf ?? []).filter(shaped);
    if (schema.type || schema.properties || schema.items) {
      if (all.length || alternatives.length) this.warn(at, 'allOf/oneOf/anyOf next to a type of its own: the own type is taken');
    } else if (all.length) {
      return all.length === 1 ? this.type(all[0], indent, at) : unique(all.map((s, i) => grouped(this.type(s, indent, `${at}.allOf[${i}]`)))).join(' & ');
    } else if (alternatives.length) {
      return unique(alternatives.map((s, i) => this.type(s, indent, `${at}.oneOf[${i}]`))).join(' | ');
    }

    if (schema.enum?.length) {
      const literals = schema.enum.map(literal);
      if (literals.every((l) => l !== undefined)) return unique(literals as string[]).join(' | ');
      this.warn(at, 'an enum of objects or lists: written as its type');
    }

    switch (schema.type) {
      case 'string':
        return 'string';
      case 'integer':
      case 'number':
        return 'number';
      case 'boolean':
        return 'boolean';
      case 'array':
        return `${schema.items ? grouped(this.type(schema.items, indent, `${at}[]`)) : 'unknown'}[]`;
      case 'object':
      case undefined:
        if (schema.properties) return this.object(schema, indent, at);
        if (schema.additionalProperties && schema.additionalProperties !== true) {
          return `Record<string, ${this.type(schema.additionalProperties, indent, `${at}{}`)}>`;
        }
        return schema.type === 'object' || schema.additionalProperties || schema['x-kubernetes-preserve-unknown-fields'] ? 'Record<string, unknown>' : 'unknown';
      default:
        this.warn(at, `type ${JSON.stringify(schema.type)}: written as unknown`);
        return 'unknown';
    }
  }

  /**
   * An object with properties: its fields, documented, optional unless
   * required; with any others it may have (additionalProperties, a CRD's
   * x-kubernetes-preserve-unknown-fields) as an index signature.
   */
  object(schema: Schema, indent: string, at: string): string {
    const inner = `${indent}  `;
    const required = new Set(schema.required ?? []);
    const fields = Object.entries(schema.properties ?? {}).map(([key, prop]) => {
      const name = IDENTIFIER.test(key) ? key : JSON.stringify(key);
      return `${doc(prop.description, inner)}${inner}${name}${required.has(key) ? '' : '?'}: ${this.type(prop, inner, `${at}.${key}`)};`;
    });
    if (schema.additionalProperties || schema['x-kubernetes-preserve-unknown-fields']) fields.push(`${inner}[key: string]: unknown;`);
    return `{\n${fields.join('\n')}\n${indent}}`;
  }

  ref(ref: string, at: string): string {
    const id = ref.replace('#/components/schemas/', '');
    if (INLINE[id]) return INLINE[id];
    if (!this.run.schemas.has(id)) {
      this.warn(at, `${ref} is not among the schemas: written as unknown`);
      return 'unknown';
    }
    let target: { module: string; name: string };
    try {
      target = locate(id);
    } catch {
      this.warn(at, `${id} has no group and version: written as unknown`);
      return 'unknown';
    }
    if (imported(this.run, id, target)) {
      this.use(`${this.run.options.builtin}/${target.module}`, target.name);
      return target.name;
    }
    if (this.run.options.builtin && BUILTIN.test(id)) this.run.missing.add(id);
    if (target.module !== this.name) this.use(relative(this.name, target.module), target.name);
    return target.name;
  }

  use(specifier: string, name: string): void {
    if (!this.imports.has(specifier)) this.imports.set(specifier, new Set());
    this.imports.get(specifier)?.add(name);
  }

  add(id: string, name: string, schema: Schema): void {
    const body = schema.properties ? this.object(schema, '', id) : null;
    this.types.set(
      name,
      body ? `${doc(schema.description, '')}export interface ${name} ${body}` : `${doc(schema.description, '')}export type ${name} = ${this.type(schema, '', id)};`,
    );
  }

  text(header: string): string {
    // The package's imports, then the relative ones; each sorted.
    const imports = [...this.imports]
      .sort(([a], [b]) => Number(a.startsWith('.')) - Number(b.startsWith('.')) || a.localeCompare(b))
      .map(([specifier, names]) => `import type { ${[...names].sort().join(', ')} } from '${specifier}';`);
    const types = [...this.types.keys()].sort().map((name) => this.types.get(name));
    return [header, ...imports, ...(imports.length ? [''] : []), types.join('\n\n'), ''].join('\n');
  }
}

/** The import path from one module (core/v1) to another (meta/v1): "../meta/v1.js". */
function relative(from: string, to: string): string {
  return `${'../'.repeat(from.split('/').length - 1)}${to}.js`;
}

function header(snapshot: Snapshot, options: GenerateOptions): string {
  // The descriptions are the schemas' authors' text: said whose, under what license.
  if (!options.builtin)
    return `// Generated by @overkube/typegen from Kubernetes ${snapshot.kubernetes}'s OpenAPI v3 schemas. Do not edit.\n// Descriptions: Copyright The Kubernetes Authors, Apache License 2.0.\n`;
  const groupVersions = unique(snapshot.groupVersions.map((gv) => gv.path.replace(/^apis\//, ''))).sort();
  return `// Generated by @overkube/typegen from the OpenAPI v3 schemas of ${groupVersions.join(', ')} on Kubernetes ${snapshot.kubernetes}. Do not edit.\n// Descriptions: their schemas' authors', under their licenses.\n`;
}

/** A description as JSDoc. */
function doc(description: string | undefined, indent: string): string {
  if (!description?.trim()) return '';
  const lines = description.trim().replaceAll('*/', '*\\/').split('\n');
  return `${indent}/**\n${lines.map((l) => `${indent} *${l ? ` ${l}` : ''}`).join('\n')}\n${indent} */\n`;
}

function unique(list: string[]): string[] {
  return [...new Set(list)];
}

/**
 * The types of a cluster's schemas, one file per group-version module
 * (core/v1.ts, apps/v1.ts, cert-manager/v1.ts, …), and its kinds table
 * (kinds.ts). The same snapshot, in whatever order the cluster listed it,
 * gives the same files.
 */
export function generate(snapshot: Snapshot, options: GenerateOptions = {}): Generated {
  const run: Run = { schemas: collect(snapshot), options, warnings: new Set(), missing: new Set() };
  const modules = new Map<string, Module>();
  const names = new Map<string, string>();
  const write = (id: string) => {
    let target: { module: string; name: string };
    try {
      target = locate(id);
    } catch {
      run.warnings.add(`${id}: no group and version in its id: left out`);
      return;
    }
    const taken = names.get(`${target.module}/${target.name}`);
    if (taken) {
      if (taken !== id) run.warnings.add(`${id}: ${target.module} has a ${target.name} already (${taken}): left out`);
      return;
    }
    names.set(`${target.module}/${target.name}`, id);
    if (!modules.has(target.module)) modules.set(target.module, new Module(target.module, run));
    modules.get(target.module)?.add(id, target.name, run.schemas.get(id) as Schema);
  };
  for (const id of [...run.schemas.keys()].sort()) if (!INLINE[id] && !(options.builtin && BUILTIN.test(id))) write(id);
  // The built-in ones the package lacks, and what they refer to in turn.
  const done = new Set<string>();
  for (let next = [...run.missing]; next.length; next = [...run.missing].filter((id) => !done.has(id))) {
    for (const id of next.sort()) {
      done.add(id);
      run.warnings.add(`${id}: not in ${options.builtin}: written here`);
      write(id);
    }
  }
  const top = header(snapshot, options);
  const files = [...modules.values()].sort((a, b) => a.name.localeCompare(b.name)).map((m) => ({ path: `${m.name}.ts`, text: m.text(top) }));
  files.push(kindsFile(snapshot, run, top));
  return { files, warnings: [...run.warnings].sort() };
}

/** What a kind is in the API: where its objects are listed and watched, and what can be done to them. */
interface KindEntry {
  group: string;
  version: string;
  kind: string;
  plural: string;
  singular: string;
  namespaced: boolean;
  verbs: string[];
  shortNames?: string[];
  categories?: string[];
}

/**
 * The kinds the cluster serves (discovery), grouped as the type modules are —
 * kinds.apps.v1.Deployment — and KindMap from "apps/v1/Deployment" to its
 * type (KubeObject for a kind without a schema). For an addon's groups:
 * their own kinds table, and the built-in package's KindMap extended with
 * their kinds.
 */
function kindsFile(snapshot: Snapshot, run: Run, top: string): File {
  const { builtin } = run.options;
  // The module of each group-version, from the kinds' own schemas: networking.k8s.io/v1 → networking/v1.
  const moduleOf = new Map<string, string>();
  const typed = new Set<string>();
  for (const [id, schema] of run.schemas) {
    const gvks = schema['x-kubernetes-group-version-kind'];
    if (gvks?.length !== 1 || INLINE[id] || (builtin && BUILTIN.test(id))) continue;
    let module: string;
    try {
      ({ module } = locate(id));
    } catch {
      continue;
    }
    // meta/v1's own (Status, WatchEvent) say group "", version v1 too: not the core group's module.
    if (module.startsWith('meta/')) continue;
    moduleOf.set(`${gvks[0].group}/${gvks[0].version}`, module);
    typed.add(key(gvks[0]));
  }

  const entries: { module: string; entry: KindEntry }[] = [];
  for (const gv of snapshot.groupVersions) {
    const [group, version] = gv.path === 'api/v1' ? ['', 'v1'] : gv.path.replace(/^apis\//, '').split('/');
    const module = moduleOf.get(`${group}/${version}`) ?? `${group.split('.')[0]}/${version}`;
    for (const r of gv.resources.filter((r: ApiResource) => !r.name.includes('/'))) {
      entries.push({
        module,
        entry: {
          group,
          version,
          kind: r.kind,
          plural: r.name,
          singular: r.singularName || r.kind.toLowerCase(),
          namespaced: r.namespaced,
          verbs: r.verbs,
          ...(r.shortNames?.length ? { shortNames: r.shortNames } : {}),
          ...(r.categories?.length ? { categories: r.categories } : {}),
        },
      });
    }
  }
  entries.sort((a, b) => a.module.localeCompare(b.module) || a.entry.kind.localeCompare(b.entry.kind));

  const used = unique(entries.filter((e) => typed.has(key(e.entry))).map((e) => e.module));
  const alias = (module: string) => module.replace(/[^a-z0-9]/gi, '_');
  const imports = used.map((m) => `import type * as ${alias(m)} from './${m}.js';`);
  if (entries.some((e) => !typed.has(key(e.entry)))) imports.unshift(`import type { KubeObject } from '${builtin ?? '../object.js'}';`);

  // kinds.<group>.<version>.<Kind>
  const tree = new Map<string, Map<string, KindEntry[]>>();
  for (const { module, entry } of entries) {
    const [g, v] = module.split('/');
    if (!tree.has(g)) tree.set(g, new Map());
    const versions = tree.get(g) as Map<string, KindEntry[]>;
    if (!versions.has(v)) versions.set(v, []);
    versions.get(v)?.push(entry);
  }
  const kinds = [...tree]
    .map(
      ([g, versions]) =>
        `  ${IDENTIFIER.test(g) ? g : JSON.stringify(g)}: {\n${[...versions]
          .map(([v, list]) => `    ${v}: {\n${list.map((e) => `      ${e.kind}: ${JSON.stringify({ id: key(e), ...e })},`).join('\n')}\n    },`)
          .join('\n')}\n  },`,
    )
    .join('\n');
  const map = (indent: string) =>
    entries.map(({ module, entry }) => `${indent}'${key(entry)}': ${typed.has(key(entry)) ? `${alias(module)}.${entry.kind}` : 'KubeObject'};`).join('\n');

  const text = [
    top,
    ...imports,
    '',
    '/** Every kind the cluster serves, by its module: kinds.apps.v1.Deployment. */',
    `export const kinds = {\n${kinds}\n} as const;`,
    '',
    ...(builtin
      ? [
          `/** The type of each kind's objects, by its id, added to ${builtin}'s KindMap: ObjectOf works for these kinds too. */`,
          `declare module '${builtin}/kinds' {\n  interface KindMap {\n${map('    ')}\n  }\n}`,
        ]
      : ['/** The type of each kind\'s objects, by its id ("apps/v1/Deployment"). */', `export interface KindMap {\n${map('  ')}\n}`]),
    '',
  ].join('\n');
  return { path: 'kinds.ts', text };
}

/** "v1/Pod", "apps/v1/Deployment": apiVersion and kind. */
function key({ group, version, kind }: GroupVersionKind): string {
  return `${group ? `${group}/` : ''}${version}/${kind}`;
}
