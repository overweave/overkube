import { describe, expect, it } from 'vitest';
import { actingAs, identityError } from './identity.ts';

describe('identityError', () => {
  it('refuses what a header cannot carry, and the cluster’s own names', () => {
    expect(identityError({ user: 'alice@example.org', groups: ['admins'] })).toBeUndefined();
    for (const who of [
      { user: '', groups: [] },
      { user: 'al\nice', groups: [] },
      { user: 'алиса', groups: [] },
      { user: 'system:kube-controller-manager', groups: [] },
      { user: 'alice', groups: ['system:masters'] },
      { user: 'alice', groups: Array.from({ length: 65 }, (_, i) => `g${i}`) },
    ])
      expect(identityError(who), JSON.stringify(who)).toBeDefined();
  });
});

describe('actingAs', () => {
  const upstream = () => ({ server: 'https://kube:6443', ca: Buffer.from('ca'), cert: Buffer.from('cert'), key: Buffer.from('key'), token: 'gateways' });
  it('with one’s own token: the gateway’s credentials left out, where the API server is kept', () => {
    expect(actingAs(upstream, { user: 'u', groups: [], token: 'theirs' })()).toEqual({ server: 'https://kube:6443', ca: Buffer.from('ca'), token: 'theirs' });
  });
  it('else impersonating them with the gateway’s', () => {
    expect(actingAs(upstream, { user: 'alice', groups: ['admins'] })()).toMatchObject({
      token: 'gateways',
      cert: Buffer.from('cert'),
      impersonate: { user: 'alice', groups: ['admins'] },
    });
  });
  it('one with a token is not impersonated: the cluster’s own names are theirs to have', () => {
    expect(identityError({ user: 'system:serviceaccount:ops:viewer', groups: ['system:serviceaccounts'], token: 't' })).toBeUndefined();
    expect(identityError({ user: 'u', groups: [], token: 'a\nb' })).toBeDefined();
  });
});
