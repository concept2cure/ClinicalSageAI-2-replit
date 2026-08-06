#!/usr/bin/env node
/**
 * Does every /api path the client calls have a server route behind it?
 *
 * ── Why this exists ───────────────────────────────────────────────────────────
 * The repository already audits the opposite direction — `audit:orphaned-
 * endpoints` finds server routes nobody calls. Nothing asked the question that
 * costs a customer anything: which CLIENT CALLS have no server route.
 *
 * Asking it for the first time found twelve. /api/ind-checklist,
 * /api/program-journey, /api/market-access, /api/shadow-review, /api/labeling-pi,
 * /api/protocol-dev, /api/research-admin, /api/investigator-brochure,
 * /api/nonclinical-summary, /api/maa-module1, /api/labeling-smpc and
 * /api/cmc-changes were each written, each had a v2 surface calling them, and
 * each 404d in production because the registrar loaded them by variable
 * specifier and esbuild left them out of the bundle. Every one of those surfaces
 * fails closed to a fixture, so the product showed plausible sample data and no
 * error. Nothing in CI could see it.
 *
 * ── Why the comparison is at the PREFIX ───────────────────────────────────────
 * Two segments — /api/ind-checklist — not the full path. Exact matching would
 * have to reconcile `/api/c2c/projects/${id}/sections` against
 * `/api/c2c/projects/:id/sections` across template literals, string
 * concatenation and helper functions, and every mismatch it produced would be
 * noise. A missing MOUNT is the defect that actually ships, it is
 * unambiguous, and it is what all twelve were.
 *
 * The cost is real and worth stating: a client calling a path that exists at the
 * prefix but not at the leaf still 404s and this will not catch it. That is a
 * narrower, louder failure — one broken button, not a whole surface — and it is
 * the kind a route test catches.
 *
 * ── Why comments are stripped ─────────────────────────────────────────────────
 * The first run of this probe reported /api/communication-center as missing. It
 * is not: CommunicationCenter.tsx mentions the path in a comment explaining that
 * the LEGACY binding used it, and the module is registered from
 * server/routes/concept2cure.ts. A grep over raw source reports prose as if it
 * were code. Three separate instruments in this audit have now been wrong in
 * exactly that way, so this one strips comments and self-checks first.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

/** Blank comments without letting a `/*` inside a string open one. */
function stripComments(src) {
  const out = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      const start = i;
      i += 1;
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === q) { i += 1; break; }
        i += 1;
      }
      out.push(src.slice(start, i)); // literals are the subject here — keep them
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? n : end + 2;
      out.push(src.slice(i, stop).replace(/[^\n]/g, ' '));
      i = stop;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      const end = src.indexOf('\n', i);
      const stop = end < 0 ? n : end;
      out.push(' '.repeat(stop - i));
      i = stop;
      continue;
    }
    out.push(c);
    i += 1;
  }
  return out.join('');
}

// ── self-check: the instrument before its findings ───────────────────────────
{
  const cases = [
    ["const u = '/api/real';", ['/api/real'], 'a plain literal is a call'],
    ["// the legacy binding called '/api/legacy'", [], 'a line comment is not a call'],
    ["/* see '/api/old' */ const u = '/api/new';", ['/api/new'], 'a block comment is not a call'],
    ["const s = 'has /* inside'; const u = '/api/kept';", ['/api/kept'], 'a /* in a string opens nothing'],
  ];
  const RE = /['"`](\/api\/[A-Za-z0-9_\-./]*)/g;
  for (const [src, want, label] of cases) {
    const got = [...stripComments(src).matchAll(RE)].map((m) => m[1]);
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      console.error(`self-check FAILED — ${label}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
      process.exit(2);
    }
  }
}

function walk(dir, exts, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, exts, out);
    else if (exts.some((x) => e.name.endsWith(x))) out.push(p);
  }
  return out;
}

const prefix = (p, n = 2) => '/' + p.split('/').filter(Boolean).slice(0, n).join('/');

// ── server: every /api prefix that is mounted or declared ────────────────────
const serverPrefixes = new Set();
for (const f of walk(path.join(ROOT, 'server'), ['.ts', '.js'])) {
  if (f.includes('__tests__')) continue;
  const src = stripComments(fs.readFileSync(f, 'utf8'));
  for (const re of [
    /\.\s*use\s*\(\s*['"`](\/api\/[^'"`]*)/g, // app.use('/api/x', router)
    /path:\s*['"`](\/api\/[^'"`]*)/g, // mountAll({ path: '/api/x', … })
    /\.\s*(?:get|post|put|patch|delete|all)\s*\(\s*['"`](\/api\/[^'"`]*)/g,
  ]) {
    for (const m of src.matchAll(re)) serverPrefixes.add(prefix(m[1]));
  }
}

/*
 * Placeholders in documentation and generic helpers. These are not calls to a
 * real endpoint and never were; naming them here is cheaper and more honest than
 * a regex that tries to guess which string literals are examples.
 */
const DOC_PLACEHOLDERS = new Set(['/api/foo', '/api/x', '/api']);

// ── client: every /api literal ────────────────────────────────────────────────
const refs = new Map();
for (const f of walk(path.join(ROOT, 'client/src'), ['.ts', '.tsx'])) {
  if (f.includes('__tests__') || f.includes('/fixtures/')) continue;
  const src = stripComments(fs.readFileSync(f, 'utf8'));
  for (const m of src.matchAll(/['"`](\/api\/[A-Za-z0-9_\-./]*)/g)) {
    const k = prefix(m[1]);
    if (DOC_PLACEHOLDERS.has(k)) continue;
    if (!refs.has(k)) refs.set(k, new Set());
    refs.get(k).add(path.relative(ROOT, f));
  }
}

const missing = [...refs.entries()].filter(([k]) => !serverPrefixes.has(k)).sort();

console.log(
  `check-client-api-calls-resolve: ${refs.size} client /api prefixes, ` +
    `${serverPrefixes.size} server /api prefixes.`,
);

if (missing.length > 0) {
  console.error(`\n❌ ${missing.length} client /api prefix(es) with no server route:\n`);
  for (const [k, files] of missing) {
    console.error(`   ${k}`);
    for (const f of [...files].slice(0, 4)) console.error(`      called from ${f}`);
    if (files.size > 4) console.error(`      … and ${files.size - 4} more`);
  }
  console.error(
    `\nEach of these 404s for a real user. If the surface fails closed to a\n` +
      `fixture it will look like it is working, which is how twelve of them\n` +
      `survived until this check existed.\n`,
  );
  process.exit(1);
}

console.log('✅ every client /api call has a server route behind it.');
