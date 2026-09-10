#!/usr/bin/env node
/*
  Orbitarium build — no transform, just a clean copy of what ships.
  Wipes dist/ and recreates it with index.html, assets/ and data/.
  `npm run gates` then checks dist/, not the source tree.
*/
import { rmSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

const items = ['index.html', 'assets', 'data'];
for (const name of items) {
  const src = join(ROOT, name);
  if (!existsSync(src)) {
    console.error(`build: missing ${name}`);
    process.exit(1);
  }
  cpSync(src, join(DIST, name), { recursive: true });
  console.log(`  + ${name}`);
}

console.log('build ok -> dist/');
