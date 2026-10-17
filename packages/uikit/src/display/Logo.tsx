import { useMemo } from 'preact/hooks';
import { uid } from '../lib/focus';

/*
 * overkube's mark: a cube, its top a tile and a lighter one floating over
 * it — in the theme's accent (its faces lighter and darker of it: the
 * kit's styles), whatever the accent is. Hidden from a reader unless given
 * a title.
 */
export function Logo({ title }: { title?: string }) {
  // Its gradients' ids: its own, however many marks the page has.
  const ids = useMemo(() => ({ left: uid('uk-logo-left'), right: uid('uk-logo-right') }), []);
  const parts = (
    <>
      <defs>
        <linearGradient id={ids.left} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" class="uk-logo-left-0" />
          <stop offset="1" class="uk-logo-left-1" />
        </linearGradient>
        <linearGradient id={ids.right} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" class="uk-logo-right-0" />
          <stop offset="1" class="uk-logo-right-1" />
        </linearGradient>
      </defs>
      <g stroke-linejoin="round">
        <path
          d="M74.0,174.1 Q74.0,164.1 82.8,168.9 L168.5,215.6 Q179.0,221.3 179.0,233.3 L179.0,307.8 Q179.0,313.8 173.7,311.0 L88.0,264.3 Q74.0,256.6 74.0,240.6 Z"
          fill={`url(#${ids.left})`}
        />
        <path
          d="M297.0,174.1 Q297.0,164.1 288.2,168.9 L202.5,215.6 Q192.0,221.3 192.0,233.3 L192.0,307.8 Q192.0,313.8 197.3,311.0 L283.0,264.3 Q297.0,256.6 297.0,240.6 Z"
          fill={`url(#${ids.right})`}
        />
        <polygon class="uk-logo-top" points="101.5,158.5 185.5,114.5 269.5,158.5 185.5,202.5" stroke-width="15" />
        <polygon class="uk-logo-over" points="88.5,119.5 185.5,71.0 282.5,119.5 185.5,168.0" stroke-width="17" />
      </g>
    </>
  );
  return title ? (
    <svg class="uk-logo" viewBox="70 58 232 258" role="img">
      <title>{title}</title>
      {parts}
    </svg>
  ) : (
    <svg class="uk-logo" viewBox="70 58 232 258" aria-hidden="true">
      {parts}
    </svg>
  );
}
