import { kinds } from '@overkube/kube-types';
import { kindRef, type SearchItem } from '@overkube/query';
import { describe, expect, it } from 'vitest';
import { answer, kindFirst, searchedKinds } from './search.ts';

/*
 * A search of every kind, as loosely as typed: words in a name (the best
 * first), a label selector, a kind's name first; the kinds it looks
 * through and how far it is.
 */

const { Pod, Service, Event, Node } = kinds.core.v1;
const { Deployment } = kinds.apps.v1;
// Two versions of one kind (HPA v2 and v1): once, as preferred (the first).
const KINDS = searchedKinds([Event, Node, Service, Deployment, Pod, kinds.autoscaling.v2.HorizontalPodAutoscaler, kinds.autoscaling.v1.HorizontalPodAutoscaler], kindRef);

const item = (name: string, namespace?: string, labels?: Record<string, string>): SearchItem => ({ name, ...(namespace ? { namespace } : {}), ...(labels ? { labels } : {}) });
const HAD: Record<string, SearchItem[]> = {
  'pods.v1': [item('web-1', 'shop', { app: 'web' }), item('web', 'shop', { app: 'web', tier: 'a' }), item('db-0', 'shop', { app: 'db' }), item('my-web', 'other')],
  'deployments.v1.apps': [item('web', 'shop', { app: 'web' })],
  'services.v1': [item('api', 'shop')],
  'nodes.v1': [item('kube-1')],
};
const search = (text: string, scope?: { namespaces: string[] }) =>
  answer({ text, ...(scope ? { scope } : {}) }, KINDS, kindRef, (k) =>
    kindRef(k) === 'nodes.v1'
      ? { error: { status: 403, code: 'Forbidden', message: 'no' } }
      : kindRef(k).startsWith('horizontal')
        ? { error: { status: 503, code: 'ServiceUnavailable', message: 'down' } }
        : { items: HAD[kindRef(k)] ?? [], truncated: kindRef(k) === 'services.v1' },
  );

describe('a search of every kind', () => {
  it('looks through those that may be listed, Events aside, the usual ones first', () => {
    expect(KINDS.map(kindRef)).toEqual(['pods.v1', 'deployments.v1.apps', 'services.v1', 'nodes.v1', 'horizontalpodautoscalers.v2.autoscaling']);
  });

  it('finds words in names, the best first (as typed, it starts with it, it is in it); the kinds by their best', () => {
    const found = search('web');
    expect(found.groups.map((g) => [g.kind, g.total, g.items.map((i) => i.name)])).toEqual([
      ['pods.v1', 3, ['web', 'web-1', 'my-web']],
      ['deployments.v1.apps', 1, ['web']],
    ]);
    // Refused apart from failed otherwise.
    expect([found.searched, found.kinds, found.denied, found.failed, found.truncated]).toEqual([5, 5, ['nodes.v1'], ['horizontalpodautoscalers.v2.autoscaling'], ['services.v1']]);
    expect(search('WEB 1').groups.map((g) => g.items.map((i) => i.name))).toEqual([['web-1']]);
    expect(search('web 1').words).toEqual(['web', '1']);
    expect(search('web', { namespaces: ['other'] }).groups.map((g) => [g.kind, g.total])).toEqual([['pods.v1', 1]]);
  });

  it('takes a label selector as kubectl does; a kind’s name first, of it only', () => {
    expect(search('app=web,tier in (a)').groups.map((g) => [g.kind, g.items.map((i) => i.name)])).toEqual([['pods.v1', ['web']]]);
    // As kubectl's: a key not had is not db, and has no tier.
    expect(search('app!=db,!tier').groups.map((g) => [g.kind, g.items.map((i) => i.name)])).toEqual([
      ['pods.v1', ['my-web', 'web-1']],
      ['deployments.v1.apps', ['web']],
      ['services.v1', ['api']],
    ]);
    expect([search('deploy web').groups.map((g) => g.kind), search('deploy web').only]).toEqual([['deployments.v1.apps'], 'deployments.v1.apps']);
    expect([search('po web').kinds, kindFirst('svc api', KINDS, kindRef).only, search('app=web').words]).toEqual([1, 'services.v1', []]);
  });

  it('asks nothing of nothing typed, nor of a word of one letter', () => {
    let asked = 0;
    const counting = (text: string) =>
      answer({ text }, KINDS, kindRef, () => {
        asked++;
        return { items: [] };
      });
    // Nothing on its way either (no kinds to look through: nothing said as searching).
    expect([counting('').searched, counting('').kinds, counting('  ').groups, counting('w').kinds, asked]).toEqual([0, 0, [], 0, 0]);
    counting('we');
    expect(asked).toBe(5);
  });
});
