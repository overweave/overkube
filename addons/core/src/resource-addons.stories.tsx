import { Badge, Button, Icon, Ratio, Section, Segmented } from '@overkube/uikit';
import { useState } from 'preact/hooks';
import { Chart, Containers, Ext, FLUX, LAYOUTS, link, mono, Pairs, ResourceSketch, Route, Row, RUNNING, ref, Stage, series, state, Table, type Vuln } from './resource.sketch.tsx';

/*
 * What addons would add to a resource opened (a sketch: marked, not
 * connected) — each in the core's slots: its tab, its mark in the header,
 * its buttons, its sections. Logs and a shell, metrics from Prometheus,
 * Flux, Traefik, cert-manager, Trivy.
 */

export default { title: 'core/resource/Addons', parameters: { controls: { disable: true } } };

/** The logs addon's: a pod's log (its tab: which container, follow, time, wrap, search; its lines numbered, a warning's and an error's in their colours); a shell in its header; on each container, its logs and a shell (Overview). */
export const Logs = () => (
  <Stage>
    <ResourceSketch
      view={{
        kind: 'Pod',
        name: 'coredns-75c7b7f4-b9mgn',
        namespace: 'kube-system',
        at: 'logs',
        header: [['Shell', 'enter']],
        tabs: [['Logs', 'file', 'logs addon']],
        summary: [
          ['Status', RUNNING],
          ['Ready', <Ratio value={1} of={1} />],
        ],
        own: (
          <Containers
            actions
            list={[
              {
                name: 'wait-for-api',
                role: 'init',
                image: 'busybox:1.37',
                state: ['done', 'circle-check', 'Completed'],
                ready: false,
                restarts: 0,
                ports: [],
                cpu: [],
                memory: ['16Mi'],
              },
              {
                name: 'coredns',
                image: 'registry.k8s.io/coredns/coredns:v1.12.0',
                state: ['ok', 'circle-play', 'Running'],
                ready: true,
                restarts: 5,
                ports: ['53/UDP', '53/TCP', '9153/TCP'],
                cpu: ['100m'],
                memory: ['70Mi', '170Mi'],
              },
            ]}
          />
        ),
      }}
    />
  </Stage>
);

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

/** A pod's metrics (the metrics addon's tab, from Prometheus: cAdvisor, kube-state-metrics): CPU and memory against what it asks for and may use, network, restarts — over a range. */
export const Metrics = () => {
  function Metrics() {
    const [range, setRange] = useState('1h');
    return (
      <Ext slot="resource.view.tabs" by="metrics addon · Prometheus">
        <Section title="Usage">
          <div class="rv-log-tools">
            <Segmented label="Range" value={range} onChange={setRange} options={['15m', '1h', '6h', '24h', '7d'].map((r) => ({ value: r, label: r }))} />
            <span class="rv-quiet">from Prometheus · container_cpu_usage_seconds_total, container_memory_working_set_bytes</span>
          </div>
          <div class="rv-charts">
            <Chart
              title="CPU"
              unit="m"
              points={series(14, 6, 1)}
              max={200}
              lines={[
                ['requests', 100, 'var(--uk-info)'],
                ['limit', 180, 'var(--uk-warn)'],
              ]}
            />
            <Chart
              title="Memory"
              unit="Mi"
              points={series(44, 5, 2)}
              max={180}
              lines={[
                ['requests', 70, 'var(--uk-info)'],
                ['limit', 170, 'var(--uk-warn)'],
              ]}
            />
            <Chart title="Network in" unit="KiB/s" points={series(22, 12, 3)} max={60} />
            <Chart title="Network out" unit="KiB/s" points={series(9, 5, 4)} max={60} />
          </div>
        </Section>
      </Ext>
    );
  }
  return (
    <Stage>
      <div class="uk-modal-panel">
        <header>
          <h2 class="rv-title">
            Pod coredns-75c7b7f4-b9mgn <small>kube-system</small>
          </h2>
          <Segmented label="Layout" value="right" onChange={() => {}} options={LAYOUTS} />
          <Button variant="ghost" icon="x" aria-label="Close" />
        </header>
        <div class="rv-tabs" role="tablist">
          {[
            ['Overview', 'grid'],
            ['Events', 'activity'],
            ['Logs', 'file'],
            ['Metrics', 'activity'],
            ['YAML', 'file'],
          ].map(([label, icon]) => (
            <button key={label} type="button" role="tab" class={`rv-tab${['Logs', 'Metrics'].includes(label) ? ' rv-ext-tab' : ''}`} aria-selected={label === 'Metrics'}>
              <Icon name={icon} />
              {label}
            </button>
          ))}
        </div>
        <div class="uk-modal-body">
          <Metrics />
        </div>
      </div>
    </Stage>
  );
};

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
        header: [
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

/** A cert-manager Certificate (its addon's): its life (valid from, renewed at, now, valid to), what it is for, how it was issued (issuer → request → order → challenge). */
export const CertManager = () => (
  <Stage>
    <ResourceSketch
      view={{
        kind: 'Certificate',
        name: 'shop-tls',
        namespace: 'shop',
        badge: (
          <Ext slot="resource.view.header" by="cert-manager addon" inline>
            <Badge level="ok" title="Valid till 2027-01-12 — renewed on 2026-12-13 (in 59 days)">
              <Icon name="shield" /> 89 days left
            </Badge>
          </Ext>
        ),
        header: [['Renew now', 'refresh']],
        summary: [
          ['Status', state('ok', 'circle-check', 'Ready')],
          ['Issuer', ref('ClusterIssuer', 'shield', 'letsencrypt-prod')],
          ['Secret', ref('', 'key', 'shop-tls')],
          ['Renews', 'in 59 days'],
        ],
        own: (
          <Ext slot="resource.view.sections" by="cert-manager addon">
            <Section title="Validity">
              <div class="rv-life">
                <div class="rv-life-track">
                  <i style={{ width: '100%' }} />
                  <span class="rv-life-mark" style={{ left: '34%' }} title="Now" />
                  <span class="rv-life-mark" data-kind="renew" style={{ left: '67%' }} title="Renewed then" />
                </div>
                <div class="rv-life-labels">
                  <span>From 2026-10-14</span>
                  <span>Now</span>
                  <span>Renewal 2026-12-13</span>
                  <span>Till 2027-01-12</span>
                </div>
                <Pairs
                  pairs={[
                    ['For', <span class="rv-line">{['shop.example.com', 'www.shop.example.com'].map((d) => mono(d))}</span>],
                    ['Key', 'ECDSA P-256'],
                  ]}
                />
              </div>
            </Section>
            <Section title="How it was issued">
              <div class="uk-rows">
                <Row
                  lead={
                    <>
                      {ref('ClusterIssuer', 'shield', 'letsencrypt-prod')} {state('ok', 'circle-check', 'Ready')}
                    </>
                  }
                  end="ACME, HTTP-01"
                />
                <Row
                  lead={
                    <>
                      {ref('CertificateRequest', 'file', 'shop-tls-1')} {state('ok', 'circle-check', 'Issued')}
                    </>
                  }
                  end="3d ago"
                />
                <Row
                  lead={
                    <>
                      {ref('Order', 'file', 'shop-tls-1-2847')} {state('ok', 'circle-check', 'valid')}
                    </>
                  }
                  end="3d ago"
                />
                <Row
                  lead={
                    <>
                      {ref('Challenge', 'globe', 'shop.example.com')} {state('done', 'circle-check', 'valid')}
                    </>
                  }
                  end="3d ago"
                  under="HTTP-01: /.well-known/acme-challenge/… answered"
                />
              </div>
            </Section>
          </Ext>
        ),
        conditions: [['Ready', 'True', 'Ready · Certificate is up to date and has not expired', '3d']],
        events: [['Normal', 'Issuing', 'The certificate has been successfully issued', '3d']],
      }}
    />
  </Stage>
);

/** A deployment, with Trivy's reports (the trivy addon's): how vulnerable in its header; each image's vulnerabilities, the worst first. */
export const Trivy = () => (
  <Stage>
    <ResourceSketch
      view={{
        kind: 'Deployment',
        name: 'api',
        namespace: 'shop',
        badge: (
          <Ext slot="resource.view.header" by="trivy addon" inline>
            <Badge level="error" title="Trivy, scanned 2h ago: 2 critical, 5 high, 11 medium, 23 low — in ghcr.io/acme/api:1.8.2">
              <Icon name="shield" /> 2 critical · 5 high
            </Badge>
          </Ext>
        ),
        tabs: [['Vulnerabilities', 'shield', 'trivy addon']],
        summary: [
          ['Status', state('ok', 'circle-check', 'Healthy')],
          ['Ready', <Ratio value={3} of={3} />],
          ['Image', mono('ghcr.io/acme/api:1.8.2')],
          ['Age', '21d'],
        ],
        own: (
          <Ext slot="resource.view.sections" by="trivy addon">
            <Section title="Vulnerabilities">
              <div class="uk-rows">
                <Row lead={<b class="rv-mono">ghcr.io/acme/api:1.8.2</b>} end="scanned 2h ago">
                  <div class="uk-row-more rv-sev">
                    <span data-sev="critical">
                      <b>2</b>critical
                    </span>
                    <span data-sev="high">
                      <b>5</b>high
                    </span>
                    <span data-sev="medium">
                      <b>11</b>medium
                    </span>
                    <span data-sev="low">
                      <b>23</b>low
                    </span>
                  </div>
                  <div class="uk-row-more">
                    <Table
                      head={['ID', 'Severity', 'Package', 'Installed', 'Fixed in']}
                      rows={(
                        [
                          ['CVE-2025-29923', 'critical', 'openssl', '3.0.13', '3.0.16'],
                          ['CVE-2025-22869', 'critical', 'golang.org/x/crypto', '0.31.0', '0.35.0'],
                          ['CVE-2025-30204', 'high', 'github.com/golang-jwt/jwt/v5', '5.2.1', '5.2.2'],
                        ] as Vuln[]
                      ).map(([id, sev, pkg, installed, fixed]) => [
                        id,
                        link(id),
                        state(sev === 'medium' ? 'warn' : sev === 'low' ? 'done' : 'error', 'octagon', sev),
                        mono(pkg),
                        mono(installed),
                        mono(fixed),
                      ])}
                    />
                  </div>
                </Row>
              </div>
            </Section>
          </Ext>
        ),
        conditions: [['Available', 'True', 'MinimumReplicasAvailable', '21d']],
        events: [],
      }}
    />
  </Stage>
);

Logs.storyName = 'Addons - Logs';
Metrics.storyName = 'Addons - Metrics';
Flux.storyName = 'Addons - Flux';
FluxManaged.storyName = 'Addons - Flux (what it manages)';
Traefik.storyName = 'Addons - Traefik';
CertManager.storyName = 'Addons - cert-manager';
Trivy.storyName = 'Addons - Trivy';
