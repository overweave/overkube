import { css, Status } from '@overkube/uikit';
import { useEffect } from 'preact/hooks';
import { LOOKS } from './statuses.tsx';

/*
 * How the core shows states (its StatusLooks): every kind's it knows, and
 * any object's — each its words (* any run of them), its tone and icon.
 */

export default { title: 'core/Statuses', parameters: { controls: { disable: true } } };

/** Every look of the core's, by the kinds it is for. */
export const Looks = () => {
  useEffect(() => {
    if (document.getElementById('overkube-css')) return;
    document.head.appendChild(Object.assign(document.createElement('style'), { id: 'overkube-css', textContent: css }));
  }, []);
  const groups = [...new Set(LOOKS.map(([of]) => (of ? of.map((k) => k.kind).join(', ') : 'Any object')))];
  return (
    <div
      class="uk-root"
      style={{
        padding: '24px',
        background: 'var(--uk-bg)',
        minHeight: '100vh',
        columns: '300px',
        columnGap: '24px',
        fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
      }}
    >
      {groups.map((g) => (
        <section key={g} class="uk-panel" style={{ breakInside: 'avoid', marginBottom: '16px', padding: '12px 16px', display: 'grid', gap: '10px' }}>
          <b>{g}</b>
          {LOOKS.filter(([of]) => (of ? of.map((k) => k.kind).join(', ') : 'Any object') === g).map(([, match, tone, icon]) => (
            <Status key={match} tone={tone} icon={icon} title={tone}>
              {match}
            </Status>
          ))}
        </section>
      ))}
    </div>
  );
};
