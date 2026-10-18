import type { ComponentChildren } from 'preact';
import { Icon } from '../display/Icon';

/*
 * What was asked against what is (a certificate's spec against what its
 * Secret holds): a row each — its label (a check, or a cross where they
 * differ: the row tinted), the two sides; their heads as the caller says.
 * Narrow, each label over its two sides.
 */

export interface CompareRow {
  label: string;
  asked: ComponentChildren;
  holds: ComponentChildren;
  differs?: boolean;
}

export function Compare({ heads, rows }: { heads: readonly [string, string]; rows: readonly CompareRow[] }) {
  return (
    <div class="uk-compare-wrap">
      <table class="uk-compare">
        <thead>
          <tr>
            <th />
            <th scope="col">{heads[0]}</th>
            <th scope="col">{heads[1]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} data-differs={r.differs ? '' : undefined}>
              <th scope="row">
                <span>
                  <Icon name={r.differs ? 'x' : 'check'} />
                  {r.label}
                </span>
              </th>
              <td>{r.asked}</td>
              <td>{r.holds}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
