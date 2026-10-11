/** Text as it is (YAML, a log), in a monospace block. */
export function Code({ children }: { children: string }) {
  return <pre class="uk-code">{children}</pre>;
}
