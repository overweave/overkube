import type { QueryError } from './model.ts';

/*
 * What the one signed in may do, as the cluster says it (RBAC's rules, its
 * SelfSubjectRulesReview: in a namespace, or of the whole cluster) — as
 * data, so a server could answer it as the page does; and whether a rule
 * of them allows something, as the API server's RBAC matches it. Not said
 * (on its way, failed, or the rules incomplete — another authorizer than
 * RBAC's): unknown, never no — the API server decides then.
 */

/** A rule: verbs on resources (resource/subresource) of API groups, all of them ('*'), or only those named. */
export interface AccessRule {
  verbs: readonly string[];
  apiGroups?: readonly string[];
  resources?: readonly string[];
  resourceNames?: readonly string[];
}

/** Whose rules: a namespace's (those of the cluster's too), or the cluster's alone (none). */
export interface AccessQuery {
  namespace?: string;
}

export interface AccessResult {
  state: 'loading' | 'live' | 'error';
  rules: readonly AccessRule[];
  /** Some of what is allowed is not in the rules (another authorizer): a rule missing says nothing. */
  incomplete?: boolean;
  error?: QueryError;
}

/** Something asked of the cluster: a verb on a resource (its subresource, one object of it by name), of an API group ('' the core's). */
export interface AccessAsk {
  verb: string;
  group: string;
  resource: string;
  subresource?: string;
  name?: string;
}

const has = (list: readonly string[] | undefined, value: string) => !!list && (list.includes('*') || list.includes(value));

/** Whether a rule allows it, as RBAC matches: '*', the resource, resource/subresource, any one's subresource ("*" then "/log"). */
export function ruleAllows(rule: AccessRule, ask: AccessAsk): boolean {
  if (!has(rule.verbs, ask.verb) || !has(rule.apiGroups, ask.group)) return false;
  const resources = rule.resources ?? [];
  const resource = ask.subresource ? `${ask.resource}/${ask.subresource}` : ask.resource;
  if (!resources.includes('*') && !resources.includes(resource) && !(ask.subresource && resources.includes(`*/${ask.subresource}`))) return false;
  return !rule.resourceNames?.length || (ask.name !== undefined && rule.resourceNames.includes(ask.name));
}

/** Whether the rules allow it: yes, no, or unknown (not had yet, failed, or incomplete and no rule says yes). */
export function allowed(result: AccessResult | undefined, ask: AccessAsk): boolean | undefined {
  if (result?.state !== 'live') return undefined;
  if (result.rules.some((r) => ruleAllows(r, ask))) return true;
  return result.incomplete ? undefined : false;
}

/** Groups whose rules everyone has (asking what one may do, who one is): no right to anything there. */
const SELF = new Set(['authorization.k8s.io', 'authentication.k8s.io']);

/** Whether the rules allow anything at all of the cluster's resources (beyond asking what one may do); undefined: not had yet, failed. */
export function grantsAny(result: AccessResult | undefined): boolean | undefined {
  if (result?.state !== 'live') return undefined;
  return result.rules.some((r) => (r.resources?.length ?? 0) > 0 && !(r.apiGroups ?? []).every((g) => SELF.has(g))) || (result.incomplete ? undefined : false);
}

/** Rules that allow everything: where no one says otherwise (in memory: a test's, a story's). */
export const ALL_ALLOWED: readonly AccessRule[] = [{ verbs: ['*'], apiGroups: ['*'], resources: ['*'] }];
