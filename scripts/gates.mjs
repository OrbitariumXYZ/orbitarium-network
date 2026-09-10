#!/usr/bin/env node
/*
  Orbitarium build gates.  `npm run gates` must exit 0.

  Checks the built dist/ tree (run `npm run build` first).
  Five checks, each a pure function (content, ctx) -> string[] of failures:
    palette    no colour literal outside assets/css/tokens.css (+ favicon.svg, a pixel trace)
    addresses  every address-shaped string in rendered index.html maps to a STATED registry value
    links      every external href maps to a STATED registry url; inert social marks carry no href
    counts     every absent/unconfirmed slot renders the dash, never a written-in figure
    hygiene    no build-assistant fingerprints anywhere in tracked source

  Before the real files are checked, `selftest()` runs each gate against throwaway
  copy that SHOULD trip it, and fails loudly if any gate stays silent.  This file
  is excluded from the palette and hygiene scans because it necessarily contains
  both hex-shaped fixtures and the fingerprint patterns it searches for.
*/
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// Gates check the built output, not the source tree.
const BASE = join(ROOT, 'dist');
const SELF = 'scripts/gates.mjs';

if (!existsSync(BASE)) {
  console.error('dist/ not found — run `npm run build` first');
  process.exit(1);
}

const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const ADDR = /\b(?:0x[0-9a-fA-F]{6,}|[1-9A-HJ-NP-Za-km-z]{32,44})\b/g;
const HREF = /href\s*=\s*"([^"]*)"/gi;
const ISO_DATE = /\b20\d{2}-\d{2}-\d{2}\b/g;
const FINGERPRINTS = [
  'claude', 'anthropic', 'chatgpt', 'openai', 'copilot',
  'generated with', 'co-authored', 'co authored',
];

const registry = JSON.parse(readFileSync(join(BASE, 'data', 'registry.json'), 'utf8'));
const REC = registry.records;

function statedValuesFlat() {
  // every scalar string a STATED record vouches for (chain rpc, chain ids, a CA if it ever lands)
  const out = new Set();
  for (const [, r] of Object.entries(REC)) {
    if (r.state !== 'stated') continue;
    const walk = (v) => {
      if (v == null) return;
      if (typeof v === 'string' || typeof v === 'number') { out.add(String(v)); return; }
      if (Array.isArray(v)) return v.forEach(walk);
      if (typeof v === 'object') return Object.values(v).forEach(walk);
    };
    walk(r.value);
  }
  return out;
}

/* ---------- gates ---------- */

function gatePalette(content, ctx) {
  if (ctx.rel === 'assets/css/tokens.css' || ctx.rel === 'assets/favicon.svg' || ctx.rel === SELF) return [];
  if (!/\.(css|html|svg|js|mjs)$/.test(ctx.rel)) return [];
  const hits = content.match(HEX) || [];
  return hits.map((h) => `${ctx.rel}: colour literal ${h} outside tokens.css`);
}

function gateAddresses(html, ctx) {
  const errs = [];
  const stated = statedValuesFlat();
  const text = html.replace(/<[^>]+>/g, ' ');
  for (const m of text.match(ADDR) || []) {
    if (!stated.has(m)) errs.push(`${ctx.rel}: address-shaped "${m}" not vouched by any stated registry record`);
  }
  // the CA slot must exist, be anchored to the record, and — while absent — carry no href
  const ca = html.match(/<div class="ca[^"]*"[^>]*>[\s\S]*?<\/div>\s*<\/div>/);
  const caOpen = html.match(/<div class="ca[^"]*"[^>]*>/);
  if (!caOpen) {
    errs.push(`${ctx.rel}: contract-address slot (.ca) missing`);
  } else {
    const tag = caOpen[0];
    if (!/data-registry="contract_address"/.test(tag)) errs.push(`${ctx.rel}: .ca not anchored to data-registry="contract_address"`);
    const state = (tag.match(/data-state="([^"]+)"/) || [])[1];
    if (state !== REC.contract_address.state) errs.push(`${ctx.rel}: .ca data-state="${state}" != registry "${REC.contract_address.state}"`);
    if (state !== 'stated' && /href=/.test(ca ? ca[0] : '')) errs.push(`${ctx.rel}: .ca carries an href while contract_address is ${state}`);
  }
  return errs;
}

function gateLinks(html, ctx) {
  const errs = [];
  const stated = statedValuesFlat();
  let m;
  HREF.lastIndex = 0;
  while ((m = HREF.exec(html))) {
    const href = m[1].trim();
    if (href.startsWith('#') || href.startsWith('assets/') || href.startsWith('data/') || href === '') continue;
    if (/^https?:\/\//i.test(href)) {
      if (!stated.has(href)) errs.push(`${ctx.rel}: external href ${href} has no stated registry record`);
    } else {
      errs.push(`${ctx.rel}: unexpected href "${href}"`);
    }
  }
  // inert social marks: anchored to a record, and no href while not stated
  const marks = html.match(/<(?:span|a)[^>]*data-social="[^"]*"[^>]*>/g) || [];
  if (marks.length === 0) errs.push(`${ctx.rel}: no social marks found`);
  for (const tag of marks) {
    const key = (tag.match(/data-registry="([^"]+)"/) || [])[1];
    const state = (tag.match(/data-state="([^"]+)"/) || [])[1];
    if (!key || !REC[key]) { errs.push(`${ctx.rel}: social mark not anchored to a registry record`); continue; }
    if (state !== REC[key].state) errs.push(`${ctx.rel}: social mark ${key} data-state="${state}" != registry "${REC[key].state}"`);
    if (state !== 'stated' && /href=/.test(tag)) errs.push(`${ctx.rel}: social mark ${key} carries an href while ${state}`);
  }
  return errs;
}

function gateCounts(html, ctx) {
  const errs = [];
  // every element opening with data-state absent|unconfirmed: its slice up to the matching
  // shallow close must not contain bare digits (ISO dates and the stated chain strip aside)
  const re = /<([a-z0-9]+)[^>]*data-state="(absent|unconfirmed)"[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(html))) {
    let inner = m[3].replace(ISO_DATE, '').replace(/<[^>]+>/g, ' ');
    const digits = inner.match(/\d/g);
    if (digits) errs.push(`${ctx.rel}: ${m[2]} slot <${m[1]}> shows written-in figure(s) "${inner.trim().slice(0, 60)}"`);
  }
  return errs;
}

function gateHygiene(content, ctx) {
  if (ctx.rel === SELF) return [];
  const low = content.toLowerCase();
  return FINGERPRINTS.filter((f) => low.includes(f)).map((f) => `${ctx.rel}: build-assistant fingerprint "${f}"`);
}

/* ---------- runner ---------- */

const SKIP_DIRS = new Set(['node_modules', '.git', 'brand', 'reference', '.vscode']);
function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const rel = relative(BASE, p).split(sep).join('/');
    if (statSync(p).isDirectory()) { if (!SKIP_DIRS.has(name)) walk(p, acc); }
    else acc.push({ abs: p, rel });
  }
  return acc;
}

function selftest() {
  const bad = [
    ['palette', gatePalette('.x{color:#abcdef}', { rel: 'assets/css/site.css' })],
    ['addresses', gateAddresses('<p>0xdeadbeef0123456789abcdef</p><div class="ca" data-registry="contract_address" data-state="absent"><span>x</span></div>', { rel: 'index.html' })],
    ['links', gateLinks('<a href="https://not-in-registry.example">x</a><span data-social="x" data-registry="social_x" data-state="unconfirmed" href="https://x.com/x"></span>', { rel: 'index.html' })],
    ['counts', gateCounts('<div data-registry="pool_depth" data-state="absent">1234 available</div>', { rel: 'index.html' })],
    ['hygiene', gateHygiene('this page was built with Copilot assistance', { rel: 'README.md' })],
  ];
  const silent = bad.filter(([, errs]) => errs.length === 0).map(([n]) => n);
  if (silent.length) {
    console.error('SELFTEST FAILED — these gates did not trip on throwaway copy:', silent.join(', '));
    process.exit(1);
  }
  // and a clean fixture must pass every gate
  const cleanErrs = [
    ...gatePalette('.x{color:var(--ink)}', { rel: 'assets/css/site.css' }),
    ...gateHygiene('a plain readme line', { rel: 'README.md' }),
    ...gateCounts('<div data-registry="pool_depth" data-state="absent">&mdash; as of 2026-09-10</div>', { rel: 'index.html' }),
  ];
  if (cleanErrs.length) {
    console.error('SELFTEST FAILED — a gate tripped on clean copy:', cleanErrs);
    process.exit(1);
  }
  console.log('selftest ok — all five gates trip on bad copy, pass on clean');
}

function main() {
  selftest();
  const files = walk(BASE);
  const html = files.find((f) => f.rel === 'index.html');
  if (!html) { console.error('dist/index.html not found — run `npm run build`'); process.exit(1); }
  const htmlSrc = readFileSync(html.abs, 'utf8');

  let errors = [];
  errors = errors.concat(gateAddresses(htmlSrc, { rel: 'index.html' }));
  errors = errors.concat(gateLinks(htmlSrc, { rel: 'index.html' }));
  errors = errors.concat(gateCounts(htmlSrc, { rel: 'index.html' }));
  for (const f of files) {
    if (!/\.(css|html|svg|js|mjs|json|md|txt)$/.test(f.rel)) continue;
    const src = readFileSync(f.abs, 'utf8');
    errors = errors.concat(gatePalette(src, { rel: f.rel }));
    errors = errors.concat(gateHygiene(src, { rel: f.rel }));
  }

  if (errors.length) {
    console.error(`\nGATES FAILED (${errors.length}):`);
    for (const e of errors) console.error('  - ' + e);
    process.exit(1);
  }
  console.log('gates ok — palette, addresses, links, counts, hygiene all clean');
}

main();
