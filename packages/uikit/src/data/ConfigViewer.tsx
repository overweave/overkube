import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { Button } from '../actions/Button';
import { Icon } from '../display/Icon';
import { Nothing } from '../display/Nothing';
import { Section } from '../layout/Section';
import { copyText } from '../lib/clipboard';
import { FILE_LABELS, File, type FileLabels } from './File';

/*
 * Keys and their values (a config map's data, a secret's), given as they
 * are: each key a file (by name) — its size, its text (cut at its first
 * lines), copied by a button; binary data said so, not shown. Its values
 * base64 (a secret's): read as text where they are, else binary. Secret:
 * each value hidden till shown, copied without being shown. None: said so.
 */

export interface ConfigViewerLabels extends FileLabels {
  /** Its section's title where there is none. */
  title: string;
  none: string;
  copy: string;
  show: string;
  hide: string;
  hidden: string;
  binary: string;
}

export const CONFIG_LABELS: ConfigViewerLabels = {
  ...FILE_LABELS,
  title: 'Data',
  none: 'No keys in it.',
  copy: 'Copy',
  show: 'Show',
  hide: 'Hide',
  hidden: 'Hidden',
  binary: 'Binary: not shown',
};

export interface ConfigViewerProps {
  /** Its keys' values: text — base64 where base64 says so. */
  data?: Readonly<Record<string, string>> | undefined;
  /** Its binary data's, base64 (a config map's binaryData). */
  binary?: Readonly<Record<string, string>> | undefined;
  /** Its data is base64 (a secret's). */
  base64?: boolean;
  /** Each value hidden till shown, copied without being shown. */
  secret?: boolean;
  /** Copied (a key's value): to say so. */
  onCopy?: (key: string) => void;
  labels?: ConfigViewerLabels;
  /** Which part of a view its sections are (where it lays them out). */
  part?: string;
}

/** A size of bytes: under a KiB as it is, else in binary units (1.5KiB). */
export function sizeOf(n: number): string {
  const units = ['B', 'KiB', 'MiB', 'GiB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return i === 0 ? `${n} B` : `${Math.round(v * 10) / 10}${units[i]}`;
}

/** Base64's bytes as text (UTF-8, a byte order mark kept: copied as it is); not text: undefined. */
export function textOf(base64: string): string | undefined {
  try {
    const raw = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(raw);
  } catch {
    return undefined;
  }
}

/** How many bytes base64 holds. */
const bytesOf = (base64: string) => Math.floor((base64.length * 3) / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);

interface Entry {
  name: string;
  /** Its text; binary: none. */
  text?: string;
  size: number;
}

/** Its entries, by name: text as it is (or from base64), binary said so. */
export function entriesOf({ data, binary, base64 = false }: Pick<ConfigViewerProps, 'data' | 'binary' | 'base64'>): Entry[] {
  const texts = Object.entries(data ?? {}).map(([name, value]): Entry => {
    if (!base64) return { name, text: value, size: new TextEncoder().encode(value).length };
    const text = textOf(value);
    return { name, ...(text === undefined ? {} : { text }), size: bytesOf(value) };
  });
  const bytes = Object.entries(binary ?? {}).map(([name, value]): Entry => ({ name, size: bytesOf(value) }));
  return [...texts, ...bytes].sort((a, b) => a.name.localeCompare(b.name));
}

function Key({
  entry,
  secret,
  onCopy,
  labels,
  part,
}: {
  entry: Entry;
  secret: boolean;
  onCopy?: ((key: string) => void) | undefined;
  labels: ConfigViewerLabels;
  part?: string | undefined;
}) {
  const [shown, setShown] = useState(!secret);
  const { name, text } = entry;
  const instead = (icon: string, words: string): ComponentChildren => (
    <>
      <Icon name={icon} />
      {words}
    </>
  );
  return (
    <File
      name={name}
      size={sizeOf(entry.size)}
      labels={labels}
      {...(part ? { part } : {})}
      actions={
        text !== undefined && (
          <>
            {secret && (
              <Button size="sm" variant="ghost" icon={shown ? 'eye-off' : 'eye'} onClick={() => setShown(!shown)}>
                {shown ? labels.hide : labels.show}
              </Button>
            )}
            <Button size="sm" variant="ghost" icon="copy" onClick={() => copyText(text).then((done) => done && onCopy?.(name))}>
              {labels.copy}
            </Button>
          </>
        )
      }
    >
      {text === undefined ? instead('file', labels.binary) : shown ? text : instead('eye-off', labels.hidden)}
    </File>
  );
}

export function ConfigViewer({ data, binary, base64 = false, secret = false, onCopy, labels = CONFIG_LABELS, part }: ConfigViewerProps) {
  const entries = entriesOf({ data, binary, base64 });
  if (!entries.length)
    return (
      <Section title={labels.title} {...(part ? { part } : {})}>
        <Nothing icon="file">{labels.none}</Nothing>
      </Section>
    );
  return (
    <>
      {entries.map((entry) => (
        <Key key={entry.name} entry={entry} secret={secret} onCopy={onCopy} labels={labels} part={part} />
      ))}
    </>
  );
}
