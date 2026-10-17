#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { configOf } from './config.ts';
import { startServer } from './server.ts';

/* `overkube`: the server, as its environment configures it (config.ts); stopped by SIGTERM or SIGINT. */

// Its image's (OVERKUBE_VERSION, the tag it was built from), else its package's.
const version = process.env.OVERKUBE_VERSION || (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;

try {
  const running = await startServer(configOf(), { version });
  const stop = (signal: string) => {
    console.log(`[overkube] ${signal}: stopping`);
    void running.close().then(() => process.exit(0));
  };
  process.once('SIGTERM', () => stop('SIGTERM'));
  process.once('SIGINT', () => stop('SIGINT'));
} catch (err) {
  console.error(`[overkube] ${(err as Error).message}`);
  process.exit(1);
}
