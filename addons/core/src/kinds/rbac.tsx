import { kinds, type ObjectOf } from '@overkube/kube-types';
import { type KubeContributor, kindRef, type ResourceProps, section } from '@overkube/sdk';
import { ObjectRef, useList, useSay } from '@overkube/sdk/preact';
import { Badge, Nothing, Ref, Section, Table } from '@overkube/uikit';
import { Refused, refused } from '../refused.tsx';
import { T } from '../texts.ts';
import { addRelated, picks, type Selector } from './shared.tsx';

/*
 * A role's, a binding's and a service account's own, in their views: a
 * role's rules (each resource — its group quiet, the names it is held to —
 * and the verbs allowed on it; a URL alike), none said so; a binding's
 * subjects (each by its kind's icon: a service account a link, a group, a
 * user) and its role; a service account's pull secrets and the pods that
 * run as it.
 */

const { Role, ClusterRole, RoleBinding, ClusterRoleBinding } = kinds.rbac.v1;
const { ServiceAccount } = kinds.core.v1;
type RoleObject = ObjectOf<typeof Role>;
type BindingObject = ObjectOf<typeof RoleBinding>;
type AccountObject = ObjectOf<typeof ServiceAccount>;

interface Line {
  key: string;
  resource: string;
  group?: string;
  only?: string[];
  url?: boolean;
  verbs: string[];
}

/** A role's rules as lines: each resource of each rule (each of its groups), each URL — its verbs. */
export function linesOf(role: RoleObject): Line[] {
  return (role.rules ?? []).flatMap((rule, i) => [
    ...(rule.resources ?? []).flatMap((resource) =>
      (rule.apiGroups?.length ? rule.apiGroups : ['']).map((group) => ({
        key: `${i}/${group}/${resource}`,
        resource,
        group,
        ...(rule.resourceNames?.length ? { only: rule.resourceNames } : {}),
        verbs: rule.verbs,
      })),
    ),
    ...(rule.nonResourceURLs ?? []).map((url) => ({ key: `${i}/url/${url}`, resource: url, url: true, verbs: rule.verbs })),
  ]);
}

/** Its rules (the core's section): one line each resource — its group quiet (the core's, none), the names it is held to; the verbs on it, each a badge (all: a warning). */
export function RoleRules({ object }: ResourceProps) {
  const say = useSay();
  const t = T.resource.view.rbac;
  const lines = linesOf(object as RoleObject);
  return (
    <Section title={say(t.rules)} part="rules">
      {lines.length ? (
        <Table
          plain
          rows={lines}
          rowKey={(l) => l.key}
          columns={[
            {
              id: 'resource',
              header: say(t.resource),
              width: 'minmax(160px, 2fr)',
              cell: (l) => (
                <span class="uk-line">
                  {l.resource === '*' ? <b>{say(t.allResources)}</b> : <span class="uk-mono">{l.resource}</span>}
                  {l.url && <span class="uk-quiet">{say(t.url)}</span>}
                  {l.group && <span class="uk-quiet">{l.group}</span>}
                  {l.only && <span class="uk-quiet">{say(t.only, { names: l.only.join(', ') })}</span>}
                </span>
              ),
            },
            {
              id: 'verbs',
              header: say(t.verbs),
              width: 'minmax(120px, 2fr)',
              cell: (l) => (
                <span class="uk-line">
                  {l.verbs.map((v) =>
                    v === '*' ? (
                      <Badge key={v} level="warn">
                        {say(t.allVerbs)}
                      </Badge>
                    ) : (
                      <Badge key={v}>{v}</Badge>
                    ),
                  )}
                </span>
              ),
            },
          ]}
        />
      ) : (
        <Nothing icon="shield">{say(t.none)}</Nothing>
      )}
    </Section>
  );
}

/** A binding's subjects (the core's section): each by its kind's icon — a service account a link — and its kind. */
export function Subjects({ object }: ResourceProps) {
  const say = useSay();
  const t = T.resource.view.rbac;
  const binding = object as BindingObject;
  const subjects = binding.subjects ?? [];
  return (
    <Section title={say(t.subjects)} part="subjects">
      <Table
        plain
        rows={subjects}
        rowKey={(s) => `${s.kind}/${s.namespace ?? ''}/${s.name}`}
        columns={[
          {
            id: 'name',
            header: say(t.name),
            width: 'minmax(160px, 2fr)',
            cell: (s) =>
              s.kind === 'ServiceAccount' ? (
                <ObjectRef kind="v1/ServiceAccount" name={s.name} namespace={s.namespace ?? binding.metadata?.namespace} quiet />
              ) : (
                <Ref icon={s.kind === 'Group' ? 'users' : 'user'}>{s.name}</Ref>
              ),
          },
          { id: 'kind', header: say(t.kind), width: 'minmax(96px, 1fr)', cell: (s) => (s.kind === 'ServiceAccount' && s.namespace ? `${s.kind} · ${s.namespace}` : s.kind) },
        ]}
      />
    </Section>
  );
}

/** An aggregated cluster role's sources (the core's section, where it has an aggregation rule): the cluster roles its selectors pick, each how many rules it gives; none, said so. */
export function Gathered({ object }: ResourceProps) {
  const say = useSay();
  const t = T.resource.view.rbac;
  const selectors = (object as RoleObject & { aggregationRule?: { clusterRoleSelectors?: Selector[] } }).aggregationRule?.clusterRoleSelectors ?? [];
  const answer = useList<RoleObject>({ kind: kindRef(ClusterRole), page: { offset: 0, limit: 1000 } });
  const roles = answer.items.flatMap((i) =>
    i.object && i.object.metadata?.name !== object.metadata?.name && selectors.some((s) => picks(s, i.object?.metadata?.labels)) ? [i.object] : [],
  );
  return (
    <Section title={say(t.gathered)} part="aggregation">
      {refused(answer) ? (
        <Refused kind={ClusterRole} error={answer.error} />
      ) : roles.length ? (
        <Table
          plain
          rows={roles}
          rowKey={(r) => r.metadata?.name ?? ''}
          columns={[
            {
              id: 'role',
              header: say(t.role),
              width: 'minmax(160px, 3fr)',
              cell: (r) => <ObjectRef kind="rbac.authorization.k8s.io/v1/ClusterRole" name={r.metadata?.name ?? ''} quiet />,
            },
            { id: 'rules', header: say(t.ruleCount), width: 'minmax(56px, 1fr)', cell: (r) => String(r.rules?.length ?? 0) },
          ]}
        />
      ) : (
        answer.state !== 'loading' && <Nothing icon="shield">{say(t.noneGathered)}</Nothing>
      )}
    </Section>
  );
}

/** Roles', bindings' and service accounts' in the core's view: rules, subjects; a binding's role, an account's pull secrets and pods. */
export function addRbac(c: KubeContributor): void {
  const t = T.resource.view.rbac;
  c.add('Fill', 'core.resource.view.role.rules', section({ kinds: [Role, ClusterRole], order: 10, render: RoleRules }));
  c.add('Fill', 'core.resource.view.role.aggregation', section({ kinds: [ClusterRole], order: 5, when: ({ object }) => object.aggregationRule !== undefined, render: Gathered }));
  c.add(
    'Fill',
    'core.resource.view.binding.subjects',
    section({ kinds: [RoleBinding, ClusterRoleBinding], order: 10, when: ({ object }) => (object.subjects?.length ?? 0) > 0, render: Subjects }),
  );
  addRelated<BindingObject>(c, ['binding', RoleBinding, ClusterRoleBinding], 'role', 100, t.role, (b) => [
    <ObjectRef kind={`rbac.authorization.k8s.io/v1/${b.roleRef.kind}`} name={b.roleRef.name} namespace={b.metadata?.namespace} />,
    b.roleRef.name,
  ]);
  addRelated<AccountObject>(c, ['serviceaccount', ServiceAccount], 'pull', 200, t.pullSecrets, (a) =>
    a.imagePullSecrets?.length
      ? [
          <span class="uk-refs">
            {a.imagePullSecrets.map((s) => (
              <ObjectRef key={s.name} kind="v1/Secret" name={s.name ?? ''} namespace={a.metadata?.namespace} quiet />
            ))}
          </span>,
          a.imagePullSecrets.map((s) => s.name).join(', '),
        ]
      : undefined,
  );
  // Its token secrets, as before tokens were projected (none now: said nothing).
  addRelated<AccountObject>(c, ['serviceaccount', ServiceAccount], 'tokens', 210, t.tokenSecrets, (a) =>
    a.secrets?.length
      ? [
          <span class="uk-refs">
            {a.secrets.map((s) => (
              <ObjectRef key={s.name} kind="v1/Secret" name={s.name ?? ''} namespace={a.metadata?.namespace} quiet />
            ))}
          </span>,
          a.secrets.map((s) => s.name).join(', '),
        ]
      : undefined,
  );
}
