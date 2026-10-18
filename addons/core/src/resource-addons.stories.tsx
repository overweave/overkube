import { Badge, Icon, Ratio, Section } from '@overkube/uikit';
import { Ext, FLUX, mono, Pairs, ResourceSketch, Route, Row, ref, Stage, state } from './resource.sketch.tsx';

/*
 * What addons would add to a resource opened (a sketch: marked, not
 * connected) — each in the core's slots: its tab, its mark in the header,
 * its buttons, its sections. A shell, Flux, Traefik (Trivy's: trivy.sketch.stories).
 */

export default { title: 'core/resource/Addons', parameters: { controls: { disable: true } } };

/** The Flux addon's on what it manages (any kind): which Kustomization, its revision applied. */
export const FluxManaged = () => (
  <Stage>
    <ResourceSketch
      view={{
        kind: 'Deployment',
        name: 'coredns',
        namespace: 'kube-system',
        badge: (
          <Ext slot="resource.view.header" by="flux addon" inline>
            <Badge title="Managed by Kustomization flux-system/infrastructure, revision main@sha1:4f2a9c1">
              <Icon name="folder" /> flux · main@4f2a9c1
            </Badge>
          </Ext>
        ),
        summary: [
          ['Status', state('ok', 'circle-check', 'Healthy')],
          ['Ready', <Ratio value={2} of={2} />],
        ],
        own: FLUX,
      }}
    />
  </Stage>
);

/** An operator's resource (known by its CRD only): the core's view as for any kind — kstatus, conditions — and the Flux addon's section and buttons. */
export const Flux = () => (
  <Stage>
    <ResourceSketch
      view={{
        kind: 'Kustomization',
        name: 'infrastructure',
        namespace: 'flux-system',
        badge: (
          <Ext slot="resource.view.header" by="flux addon" inline>
            <Badge title="Applied revision main@sha1:4f2a9c1 — from GitRepository flux-system, 3m ago">
              <Icon name="folder" /> main@4f2a9c1
            </Badge>
          </Ext>
        ),
        actions: [
          ['Reconcile', 'refresh'],
          ['Suspend', 'pause'],
        ],
        summary: [
          ['Status', state('ok', 'circle-check', 'Current')],
          ['Ready', 'True'],
          ['Age', '40d'],
        ],
        own: (
          <Ext slot="resource.view.sections" by="flux addon">
            <Section title="Source">
              <Pairs
                pairs={[
                  ['From', ref('GitRepository', 'folder', 'flux-system')],
                  ['Revision', mono('main@sha1:4f2a9c1')],
                  ['Inventory', '42 objects'],
                ]}
              />
            </Section>
          </Ext>
        ),
        conditions: [['Ready', 'True', 'ReconciliationSucceeded · Applied revision: main@sha1:4f2a9c1', '3m']],
        events: [['Normal', 'ReconciliationSucceeded', 'Reconciliation finished in 1.2s, next run in 10m0s', '3m', 412]],
      }}
    />
  </Stage>
);

/** A Traefik IngressRoute (the traefik addon's): its routes drawn left to right — entry points, match, middlewares, services. */
export const Traefik = () => (
  <Stage>
    <ResourceSketch
      view={{
        kind: 'IngressRoute',
        name: 'shop',
        namespace: 'shop',
        summary: [
          ['Status', state('ok', 'circle-check', 'Current')],
          ['Entry points', 'websecure'],
          ['TLS', ref('', 'key', 'shop-tls')],
          ['Age', '12d'],
        ],
        own: (
          <Ext slot="resource.view.sections" by="traefik addon">
            <Section title="Routes">
              <div class="uk-rows">
                <Row
                  lead={
                    <Route entry={['websecure :443']} match="Host(`shop.example.com`)" middlewares={['redirect-www', 'compress']} to={ref('Service', 'network', 'web:80')} tls />
                  }
                />
                <Row
                  lead={
                    <Route
                      entry={['websecure :443']}
                      match="Host(`shop.example.com`) && PathPrefix(`/api`)"
                      middlewares={['rate-limit', 'auth-forward']}
                      to={ref('Service', 'network', 'api:8080')}
                      tls
                    />
                  }
                />
              </div>
            </Section>
          </Ext>
        ),
        related: [
          ['Middlewares', <span class="rv-line">{['redirect-www', 'compress', 'rate-limit', 'auth-forward'].map((m) => ref('', 'layers', m))}</span>],
          ['Certificate', ref('Certificate', 'shield', 'shop-tls')],
        ],
        events: [],
      }}
    />
  </Stage>
);

Flux.storyName = 'Addons - Flux';
FluxManaged.storyName = 'Addons - Flux (what it manages)';
Traefik.storyName = 'Addons - Traefik';
