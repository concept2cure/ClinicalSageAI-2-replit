#!/usr/bin/env node
/**
 * Two routers under one prefix must not define the same method+path.
 *
 * ── Why this exists ───────────────────────────────────────────────────────────
 * `ci:audit-route-mounts` catches duplicate mounts at the TOP level — two
 * `app.get('/api/health')` calls, where Express keeps the first and the second is
 * dead. Six of those were found in register-platform-routes.ts, and two of them
 * had lost their auth gate in the copy that won.
 *
 * That audit cannot see one level deeper. `app.use('/api/mdx', a)` and
 * `app.use('/api/mdx', b)` is legitimate router composition — each router handles
 * a different sub-path — so the audit only warns. But if `a` and `b` BOTH define
 * `GET /programs`, Express keeps a's and b's is unreachable, with exactly the
 * same silence: no error, no type failure, no test, and a route that answers with
 * the wrong handler.
 *
 * 21 prefixes in this repo carry more than one router, and the audit emits 8
 * warnings about it against a `--max-warnings 0` threshold. That made the nightly
 * job permanently red over a signal nobody could act on, because "these two
 * routers share a prefix" is not by itself a defect.
 *
 * This check answers the question the warning was gesturing at. Prefix sharing is
 * allowed; a genuine collision inside a shared prefix is not. At the time it was
 * written the answer was zero — which is what makes raising the warning threshold
 * to the measured count defensible rather than a shrug.
 *
 * ── Scope, honestly ───────────────────────────────────────────────────────────
 * Reads `mountAll` entries in server/bootstrap/*.ts and the `router.METHOD('/x')`
 * declarations in the modules they name. It will NOT see:
 *   • routers mounted by a bare `app.use(prefix, x)` outside a mountAll entry;
 *   • paths built at runtime rather than written as string literals;
 *   • sub-routers a router mounts internally.
 * So a clean result means "no collision among the statically declared routes of
 * co-mounted routers", not "no collision anywhere". Stating the limit is the
 * point — a check whose blind spots are undocumented gets trusted past them.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const BOOTSTRAP = path.join(ROOT, 'server/bootstrap');

/**
 * Blank comments without letting a `/*` inside a string open one.
 *
 * The same state machine as routes-reach-the-bundle.test.ts, and for the same
 * reason: a regex stripper was blinded by a `/*` in prose and hid 273 lines of
 * register-inline-routes.ts, which is where twelve broken route families were
 * sitting.
 */
function stripComments(src) {
  const out = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      out.push(q);
      i += 1;
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === q) { i += 1; break; }
        out.push(src[i] === '\n' ? '\n' : src[i]);
        i += 1;
      }
      out.push(q);
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
    ["router.get('/a', h)", ["GET /a"], 'a plain route'],
    ["// router.get('/dead', h)\nrouter.post('/b', h)", ["POST /b"], 'a commented-out route is not a route'],
    ["/* see router.get('/x') */ router.put('/c', h)", ["PUT /c"], 'prose mentioning a route is not a route'],
  ];
  const RE = /\brouter\s*\.\s*(get|post|put|patch|delete|all)\s*\(\s*'([^']*)'/g;
  for (const [src, want, label] of cases) {
    const got = [...stripComments(src).matchAll(RE)].map((m) => `${m[1].toUpperCase()} ${m[2] || '/'}`);
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      console.error(`self-check FAILED — ${label}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
      process.exit(2);
    }
  }
}

function resolveSpecifier(spec) {
  const base = path.normalize(path.join('server/bootstrap', spec));
  const candidates = base.endsWith('.js')
    ? [`${base.slice(0, -3)}.ts`, `${base.slice(0, -3)}.tsx`, base]
    : [`${base}.ts`, base, `${base}.js`];
  return candidates.find((c) => fs.existsSync(path.join(ROOT, c))) ?? null;
}

const mounts = new Map(); // prefix -> Set("file::ident")
const importsOf = new Map(); // bootstrap file -> { ident: specifier }

for (const file of fs.readdirSync(BOOTSTRAP).filter((f) => f.endsWith('.ts'))) {
  const src = stripComments(fs.readFileSync(path.join(BOOTSTRAP, file), 'utf8'));
  const imports = {};
  for (const m of src.matchAll(/^\s*import\s+([A-Za-z_$][\w$]*)\s+from\s+'(\.\.\/routes\/[^']+)'/gm)) {
    imports[m[1]] = m[2];
  }
  importsOf.set(file, imports);
  // mountAll({ path: '/api/x', router: y }) — the shared helper.
  for (const m of src.matchAll(/\{\s*path:\s*'([^']+)'\s*,\s*router:\s*([A-Za-z_$][\w$]*)/g)) {
    if (!mounts.has(m[1])) mounts.set(m[1], new Set());
    mounts.get(m[1]).add(`${file}::${m[2]}`);
  }
  // app.use('/api/x', y) and app.use('/api/x', mw, y) — the direct form, which
  // is where most co-mounting actually happens (/api/mdx carries 31 routers).
  // Omitting it would have made this check's clean result mean far less than it
  // appears to: the mountAll form covers only three prefixes.
  for (const m of src.matchAll(
    /\bapp\s*\.\s*use\s*\(\s*'(\/api\/[^']*)'\s*,\s*(?:[A-Za-z_$][\w$]*\s*,\s*)*([A-Za-z_$][\w$]*)\s*\)/g,
  )) {
    if (!mounts.has(m[1])) mounts.set(m[1], new Set());
    mounts.get(m[1]).add(`${file}::${m[2]}`);
  }
}

const shared = [...mounts.entries()].filter(([, s]) => s.size > 1);
const ROUTE = /\brouter\s*\.\s*(get|post|put|patch|delete|all)\s*\(\s*'([^']*)'/g;

const collisions = [];
let routersRead = 0;

for (const [prefix, idents] of shared) {
  const byPath = new Map(); // "GET /x" -> Set(file)
  for (const key of idents) {
    const [file, ident] = key.split('::');
    const spec = (importsOf.get(file) || {})[ident];
    if (!spec) continue;
    const real = resolveSpecifier(spec);
    if (!real) continue;
    routersRead += 1;
    const src = stripComments(fs.readFileSync(path.join(ROOT, real), 'utf8'));
    for (const m of src.matchAll(ROUTE)) {
      const k = `${m[1].toUpperCase()} ${m[2] || '/'}`;
      if (!byPath.has(k)) byPath.set(k, new Set());
      byPath.get(k).add(real);
    }
  }
  for (const [k, files] of byPath) {
    if (files.size > 1) collisions.push({ prefix, route: k, files: [...files] });
  }
}

console.log(
  `check-route-collisions: ${shared.length} prefixes carry more than one router; ` +
    `${routersRead} routers read.`,
);

if (collisions.length > 0) {
  console.error(`\n❌ ${collisions.length} route(s) defined twice under one prefix:\n`);
  for (const c of collisions) {
    console.error(`   ${c.prefix}  ${c.route}`);
    for (const f of c.files) console.error(`      ${f}`);
  }
  console.error(
    `\nExpress keeps the FIRST handler registered for a method+path. The others are\n` +
      `unreachable — no error, no type failure, and a route that answers with the\n` +
      `wrong handler. Give one of them a distinct path, or merge them.\n`,
  );
  process.exit(1);
}

console.log('✅ no route is defined twice under a shared prefix.');
