import { Tip } from '../overlays/Tip';
import { Badge } from '../status/Badge';

/*
 * A container's image: its registry and path quiet (cut short first), its
 * name, its tag apart (latest when it says none; a digest, its first
 * characters). In full under the pointer (its tip).
 */
export function Image({ image }: { image: string }) {
  const [named, digest] = image.split('@');
  const at = (named ?? '').lastIndexOf('/');
  const last = (named ?? '').slice(at + 1);
  const colon = last.lastIndexOf(':');
  const name = colon < 0 ? last : last.slice(0, colon);
  const tag = digest ? digest.replace(/^sha256:/, '').slice(0, 12) : colon < 0 ? 'latest' : last.slice(colon + 1);
  return (
    <Tip content={() => image}>
      <span class="uk-image">
        <span class="uk-image-from">{(named ?? '').slice(0, at + 1)}</span>
        <span class="uk-image-name">{name}</span>
        <Badge>{tag}</Badge>
      </span>
    </Tip>
  );
}
