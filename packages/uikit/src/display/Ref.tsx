import type { ComponentChildren } from 'preact';
import { Icon } from './Icon';

/*
 * Another thing by its icon: its sort quiet (a kind: Node, ConfigMap), its
 * name — a link where it can be opened. Cut short with dots, never wider
 * than where it is (a table's cell).
 */
export function Ref({ icon, kind, href, title, children }: { icon: string; kind?: string; href?: string; title?: string; children: ComponentChildren }) {
  return (
    <span class="uk-ref">
      <Icon name={icon} />
      {kind && <small>{kind}</small>}
      {href ? (
        <a href={href} title={title}>
          {children}
        </a>
      ) : (
        <span title={title}>{children}</span>
      )}
    </span>
  );
}
