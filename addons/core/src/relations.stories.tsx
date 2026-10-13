import { css, type RelationGroup, Relations, Section } from '@overkube/uikit';

/* The relations concept (uikit's Relations) in a resource's view, as the core will show it: by hand, no logic yet. */

export default { title: 'core/relations (concept)' };

const item = (kind: string, name: string, state?: string, level?: 'ok' | 'warn' | 'error') => ({ kind, name, href: `#${kind}/${name}`, state, level });

function View({ title, groups }: { title: string; groups: RelationGroup[] }) {
  return (
    <div class="uk-root" style={{ padding: '16px', background: 'var(--uk-bg)', minHeight: '100%', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif' }}>
      <style>{css}</style>
      <div class="uk-modal-panel" style={{ width: '560px', maxHeight: 'none' }}>
        <header>
          <h2>{title}</h2>
        </header>
        <div class="uk-modal-body">
          <div class="uk-region uk-details">
            <Section title="Related">
              <Relations groups={groups} />
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}

export const APod = () => (
  <View
    title="Pod kube-system/coredns-75c7b7f4-b9mgn"
    groups={[
      { label: 'Controlled by', items: [item('ReplicaSet', 'coredns-75c7b7f4', '1/1 ready'), item('Deployment', 'coredns', '1/1 ready', 'ok')] },
      { label: 'Runs on', items: [item('Node', 'kube', 'Ready', 'ok')] },
      { label: 'Runs as', items: [item('ServiceAccount', 'coredns')] },
      { label: 'Config', items: [item('ConfigMap', 'coredns', 'volume config-volume'), item('ConfigMap', 'kube-root-ca.crt', 'token volume')] },
      { label: 'Selected by', items: [item('Service', 'kube-dns', 'ClusterIP :53')] },
    ]}
  />
);

export const ADeployment = () => (
  <View
    title="Deployment shop/web"
    groups={[
      {
        label: 'Runs',
        items: [
          item('Pod', 'web-7d4b9-lq7zp', 'CrashLoopBackOff · 4 restarts', 'warn'),
          item('Pod', 'web-7d4b9-2xk8q', 'Running', 'ok'),
          item('Pod', 'web-7d4b9-9fj2m', 'Running', 'ok'),
        ],
      },
      { label: 'Rollouts', items: [item('ReplicaSet', 'web-7d4b9', 'rev 3 · current · 3/3'), item('ReplicaSet', 'web-5c8f1', 'rev 2 · 0/0')] },
      { label: 'Reached through', items: [item('Service', 'web', 'ClusterIP :80')] },
      { label: 'Config', items: [item('ConfigMap', 'web-config', 'env'), item('Secret', 'web-db', 'env')] },
      { label: 'Scaled by', items: [item('HorizontalPodAutoscaler', 'web', 'cpu 45%/80% · 2–10')] },
    ]}
  />
);

export const AService = () => (
  <View
    title="Service shop/web"
    groups={[
      { label: 'Selects', items: [], none: 'no pod matches app=web — it answers nobody' },
      { label: 'Routed from', items: [item('Ingress', 'web', 'shop.example.com')] },
    ]}
  />
);
