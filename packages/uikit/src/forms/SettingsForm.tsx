import { useMemo } from 'preact/hooks';
import { uid } from '../lib/focus';
import { Select } from './Select';
import { Switch } from './Switch';

/** A setting, as SettingsForm draws it (the SDK's Setting). */
export type FormSetting =
  | { type: 'boolean'; title: string; default?: boolean }
  | { type: 'number'; title: string; default?: number; min?: number; max?: number }
  | { type: 'string'; title: string; default?: string }
  | { type: 'select'; title: string; options: { value: string; title: string }[]; default?: string };

/** A form made from settings: each field labelled, each change given at once. */
export function SettingsForm({
  settings,
  values,
  onChange,
}: {
  settings: Record<string, FormSetting>;
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  const prefix = useMemo(() => uid('uk-setting'), []);
  return (
    <div class="uk-form">
      {Object.entries(settings).map(([key, s]) => {
        const id = `${prefix}-${key}`;
        const value = values[key] ?? s.default;
        return (
          <div class="uk-form-row" key={key}>
            {s.type === 'boolean' ? (
              <Switch checked={value === true} onChange={(on) => onChange(key, on)} label={s.title} />
            ) : (
              <>
                <label for={id}>{s.title}</label>
                {s.type === 'select' ? (
                  <Select label={s.title} options={s.options} value={value as string | undefined} onChange={(v) => onChange(key, v)} />
                ) : (
                  <input
                    id={id}
                    class="uk-input"
                    type={s.type === 'number' ? 'number' : 'text'}
                    min={s.type === 'number' ? s.min : undefined}
                    max={s.type === 'number' ? s.max : undefined}
                    value={value === undefined ? '' : String(value)}
                    onChange={(e) => {
                      const raw = (e.target as HTMLInputElement).value;
                      onChange(key, s.type === 'number' ? Number(raw) : raw);
                    }}
                  />
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
