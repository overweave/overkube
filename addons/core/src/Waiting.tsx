import { Skeleton } from '@overkube/uikit';
import { useEffect, useState } from 'preact/hooks';

/** Something on its way, where it will be: a few placeholders, said (for those who cannot see them) in words, once there to be read out. */
export function Waiting({ label, lines = 3 }: { label: string; lines?: number }) {
  const [said, setSaid] = useState('');
  useEffect(() => setSaid(label), [label]);
  return (
    <div class="uk-region">
      <span class="uk-sr-only" role="status">
        {said}
      </span>
      <Skeleton shape="block" height="96px" />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={`${90 - i * 18}%`} />
      ))}
    </div>
  );
}
