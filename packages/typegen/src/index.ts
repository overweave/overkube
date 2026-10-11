/** TypeScript types from a Kubernetes cluster's OpenAPI v3 schemas (the CLI: cli.ts). */
export { fetchGroups, fetchSnapshot } from './fetch.ts';
export { type File, type Generated, type GenerateOptions, generate, locate } from './generate.ts';
export type { ApiGroup, ApiResource, GroupVersionKind, OpenApiDocument, Schema, Snapshot } from './schema.ts';
