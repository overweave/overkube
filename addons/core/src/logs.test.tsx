import { kinds } from '@overkube/kube-types';
import { cleanup, kubeWorld, make } from '@overkube/testkit';
import { renderPage } from '@overkube/testkit/preact';
import { fireEvent } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import core from './index.tsx';

/*
 * A log's tab, a pod's and a workload's (before the YAML): their containers'
 * lines put together by time, whose each is said when there are several;
 * picked by pod and container, by level, by what is looked for.
 */

afterEach(cleanup);

const { Pod } = kinds.core.v1;
const { Deployment } = kinds.apps.v1;

const pod = (name: string) =>
  make(Pod, {
    metadata: { name, namespace: 'shop', labels: { app: 'web' } },
    spec: {
      containers: [
        { name: 'app', image: 'nginx' },
        { name: 'envoy', image: 'envoy' },
      ],
    },
    status: { phase: 'Running', containerStatuses: [{ name: 'app', image: 'nginx', imageID: '', ready: true, restartCount: 1, state: { running: {} } }] },
  });

function world() {
  const w = kubeWorld();
  w.addon(core);
  for (const name of ['web-a1', 'web-b2']) w.cluster.add(Pod, pod(name));
  w.cluster.add(Deployment, make(Deployment, { metadata: { name: 'web', namespace: 'shop' }, spec: { selector: { matchLabels: { app: 'web' } }, template: {} } }));
  w.cluster.log('shop', 'web-a1', 'app', 'GET / 200');
  w.cluster.log('shop', 'web-a1', 'envoy', 'cds: updated');
  w.cluster.log('shop', 'web-b2', 'app', '[error] upstream timed out');
  w.cluster.log('shop', 'web-a1', 'app', '[warn] buffered');
  return w;
}

/** The page with an object open, its Logs tab chosen. */
function opened(path: string) {
  const page = renderPage(world(), path);
  const tabs = [...document.querySelectorAll<HTMLButtonElement>('.uk-modal [role="tab"]')];
  page.act(() => tabs.find((t) => t.textContent === 'Logs')?.click());
  const lines = () => [...document.querySelectorAll('.uk-log-line')].map((l) => [l.querySelector('em')?.textContent, l.querySelector('span')?.textContent]);
  const click = (text: string) =>
    page.act(() => ([...document.querySelectorAll<HTMLButtonElement>('.uk-modal button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement).click());
  return { page, tabs, lines, click };
}

describe('a log’s tab', () => {
  it('is a pod’s, before its YAML: its containers’ lines by time, whose each is said', () => {
    const { tabs, lines } = opened('/k/pods.v1?open=pods.v1/shop/web-a1');
    expect(tabs.slice(-3).map((t) => t.textContent)).toEqual(['Logs', 'Map', 'YAML']);
    expect(lines()).toEqual([
      ['app', 'GET / 200'],
      ['envoy', 'cds: updated'],
      ['app', '[warn] buffered'],
    ]);
  });

  it('is a workload’s: its pods (its selector’s), picked by pod and container; by level, by what is looked for', () => {
    const { page, lines, click } = opened('/k/deployments.v1.apps?open=deployments.v1.apps/shop/web');
    expect(lines().map(([who]) => who)).toEqual(['a1/app', 'a1/envoy', 'b2/app', 'a1/app']);
    click('Errors');
    expect(lines()).toEqual([['b2/app', '[error] upstream timed out']]);
    click('Warnings');
    expect(lines().map(([, text]) => text)).toEqual(['[warn] buffered']);
    click('All');
    // One pod only: its own lines (its two containers: whose said).
    page.act(() => (document.querySelector('.uk-gp-trigger') as HTMLButtonElement).click());
    page.act(() => ([...document.querySelectorAll<HTMLButtonElement>('.uk-gp-row[data-head]')].find((b) => b.textContent?.includes('web-b2')) as HTMLButtonElement).click());
    expect(lines()).toEqual([['b2/app', '[error] upstream timed out']]);
    page.act(() =>
      (
        [...document.querySelectorAll<HTMLButtonElement>('.uk-gp-row[data-child]')].find(
          (b) => b.textContent?.startsWith('app') && b.closest('.uk-gp-group')?.textContent?.includes('web-a1'),
        ) as HTMLButtonElement
      ).click(),
    );
    expect(lines().map(([, text]) => text)).toEqual(['GET / 200', '[error] upstream timed out', '[warn] buffered']);
    const find = document.querySelector('.uk-query-plain') as HTMLInputElement;
    page.act(() => fireEvent.input(find, { target: { value: 'GET' } }));
    expect([lines().map(([, text]) => text), document.querySelector('.uk-query-count')?.textContent, document.querySelector('.uk-log-line mark')?.textContent]).toEqual([
      ['GET / 200'],
      '1 of 3',
      'GET',
    ]);
  });
});
