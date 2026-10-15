/** Text as it is (YAML, a log), in a monospace block. */
export function Code({ children, id }: { children: string; id?: string }) {
  return (
    <pre class="uk-code" id={id}>
      {children}
    </pre>
  );
}
