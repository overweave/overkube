import type { Addon } from '@overkube/sdk';

/** How the page is started: into which element, as which page (its query), and — a host's — where its gateway is, how it signs in, its own addons. */
export interface BootOptions {
  /** Where the shell is drawn. */
  element: HTMLElement;
  /** The page's query: ?safe, ?debug. */
  asked: URLSearchParams;
  /** Where the gateway is: /kube (overkube's server), or the host's own path. */
  gateway?: string;
  /** Headers every request to the gateway carries (a host's CSRF token, say). */
  headers?: () => Record<string, string>;
  /** Whether the page asks how one signs in here (GET /auth): false — the host signs in itself, the page drawn as it is (default true). */
  signIn?: boolean;
  /** The host's own addons, run beside the page's (addons.ts): their layer theirs — builtin, always on; addon, the user's to turn on. */
  addons?: readonly Addon[];
}
