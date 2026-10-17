import { describe, expect, it } from 'vitest';
import { type AccessResult, ALL_ALLOWED, allowed, grantsAny, ruleAllows } from './access.ts';

const pods = { verb: 'list', group: '', resource: 'pods' };

describe('ruleAllows', () => {
  it('matches as RBAC does: verbs, groups, resources, subresources, names', () => {
    expect(ruleAllows({ verbs: ['get', 'list'], apiGroups: [''], resources: ['pods'] }, pods)).toBe(true);
    expect(ruleAllows({ verbs: ['get'], apiGroups: [''], resources: ['pods'] }, pods)).toBe(false);
    expect(ruleAllows({ verbs: ['list'], apiGroups: ['apps'], resources: ['pods'] }, pods)).toBe(false);
    expect(ruleAllows({ verbs: ['*'], apiGroups: ['*'], resources: ['*'] }, { ...pods, subresource: 'log' })).toBe(true);
    // A resource is not its subresources; */log is every one's log.
    const log = { verb: 'get', group: '', resource: 'pods', subresource: 'log' };
    expect(ruleAllows({ verbs: ['get'], apiGroups: [''], resources: ['pods'] }, log)).toBe(false);
    expect(ruleAllows({ verbs: ['get'], apiGroups: [''], resources: ['pods/log'] }, log)).toBe(true);
    expect(ruleAllows({ verbs: ['get'], apiGroups: [''], resources: ['*/log'] }, log)).toBe(true);
    expect(ruleAllows({ verbs: ['get'], apiGroups: [''], resources: ['pods/*'] }, log)).toBe(false);
    // Named: only those objects (and never a list of all).
    const named = { verbs: ['get', 'list'], apiGroups: [''], resources: ['pods'], resourceNames: ['web'] };
    expect(ruleAllows(named, { ...pods, verb: 'get', name: 'web' })).toBe(true);
    expect(ruleAllows(named, { ...pods, verb: 'get', name: 'db' })).toBe(false);
    expect(ruleAllows(named, pods)).toBe(false);
    // Non-resource rules (no resources) allow no resource.
    expect(ruleAllows({ verbs: ['get'] }, pods)).toBe(false);
  });
});

describe('grantsAny', () => {
  it('says whether anything of the cluster is allowed, asking what one may do aside', () => {
    const self = { verbs: ['create'], apiGroups: ['authorization.k8s.io'], resources: ['selfsubjectrulesreviews'] };
    expect(grantsAny({ state: 'live', rules: [self] })).toBe(false);
    expect(grantsAny({ state: 'live', rules: [self, { verbs: ['get'], apiGroups: [''], resources: ['pods'] }] })).toBe(true);
    expect(grantsAny({ state: 'live', rules: [self], incomplete: true })).toBeUndefined();
    expect(grantsAny({ state: 'loading', rules: [] })).toBeUndefined();
  });
});

describe('allowed', () => {
  const live = (rules: AccessResult['rules'], incomplete?: boolean): AccessResult => ({ state: 'live', rules, ...(incomplete ? { incomplete } : {}) });
  it('says yes, no — or unknown: not had, failed, incomplete', () => {
    expect(allowed(live(ALL_ALLOWED), pods)).toBe(true);
    expect(allowed(live([]), pods)).toBe(false);
    expect(allowed(live([], true), pods)).toBeUndefined();
    expect(allowed(live(ALL_ALLOWED, true), pods)).toBe(true);
    expect(allowed({ state: 'loading', rules: [] }, pods)).toBeUndefined();
    expect(allowed({ state: 'error', rules: [], error: { code: 'x', message: 'x' } }, pods)).toBeUndefined();
    expect(allowed(undefined, pods)).toBeUndefined();
  });
});
