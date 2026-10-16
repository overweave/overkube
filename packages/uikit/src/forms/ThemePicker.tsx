import { Icon } from '../display/Icon';
import type { Tokens } from '../theme';

/*
 * Themes to choose from, each drawn small — the page's ground, a panel on
 * it, its rows, the accent (its tokens as given: whole, the kit's under a
 * theme's own) — its name under it; the one chosen ringed. Last, one more
 * to make (a dashed card: what it does under it).
 */

export interface ThemeChoice {
  key: string;
  title: string;
  tokens: Tokens;
}

export function ThemePicker({
  themes,
  value,
  onChange,
  label,
  more,
}: {
  themes: readonly ThemeChoice[];
  value: string;
  onChange: (key: string) => void;
  label: string;
  /** One more to make, last: what it does, done as pressed. */
  more?: { label: string; onClick: () => void };
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a group of toggles (ARIA), not a form's fieldset.
    <div class="uk-themes" role="group" aria-label={label}>
      {themes.map(({ key, title, tokens }) => (
        <button key={key} type="button" class="uk-theme" aria-pressed={key === value} onClick={() => onChange(key)}>
          <div class="uk-theme-small" style={{ background: tokens.bg, borderColor: tokens.border, borderRadius: tokens.radius }}>
            <i style={{ background: tokens.panel }} />
            <b style={{ background: tokens.panel }}>
              <i style={{ background: tokens.accent, width: '40%' }} />
              <i style={{ background: tokens.text, width: '80%' }} />
              <i style={{ background: tokens.muted, width: '60%' }} />
              <i style={{ background: tokens.muted, width: '70%' }} />
            </b>
          </div>
          {title}
        </button>
      ))}
      {more && (
        <button type="button" class="uk-theme" onClick={more.onClick}>
          <div class="uk-theme-small uk-theme-more">
            <Icon name="plus" />
          </div>
          {more.label}
        </button>
      )}
    </div>
  );
}
