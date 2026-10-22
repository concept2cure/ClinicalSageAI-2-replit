// Approximate import graph for C2C. Read-only. Usage: node graph.mjs <repoRoot> <outDir>
import fs from 'fs';
import path from 'path';

const ROOT = process.argv[2] || '<repo>';
const OUT = process.argv[3] || path.dirname(new URL(import.meta.url).pathname);
const SCAN_DIRS = ['server', 'shared', 'client/src', 'scripts', 'agents', 'services', 'workers', 'database', 'db'];
const EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const SKIP = /(^|\/)(node_modules|dist|\.git)(\/|$)/;

function walk(dir, acc) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    const rel = path.relative(ROOT, p);
    if (SKIP.test(rel)) continue;
    if (e.isDirectory()) walk(p, acc);
    else if (EXTS.includes(path.extname(e.name))) acc.push(rel);
  }
  return acc;
}

const files = [];
for (const d of SCAN_DIRS) walk(path.join(ROOT, d), files);
const fileSet = new Set(files);
const loc = {};
const src = {};
for (const f of files) {
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  src[f] = s;
  loc[f] = s.split('\n').length;
}

// Strip comments crudely (block + line) to avoid matching specifiers in comments.
function stripComments(s) {
  // Mini tokenizer: blanks out comments, keeps strings/template literals, skips regex literals heuristically.
  let out = '';
  let i = 0;
  const n = s.length;
  let lastSig = '';
  while (i < n) {
    const c = s[i], d = s[i + 1];
    if (c === '/' && d === '/') { while (i < n && s[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { const j = s.indexOf('*/', i + 2); const end = j < 0 ? n : j + 2; out += s.slice(i, end).replace(/[^\n]/g, ' '); i = end; continue; }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < n && s[j] !== c) { if (s[j] === '\\') j++; else if (c !== '`' && s[j] === '\n') break; j++; }
      out += s.slice(i, j + 1); i = j + 1; lastSig = c; continue;
    }
    if (c === '/' && (lastSig === '' || '(,=:[!&|?{};+-*%<>~^'.includes(lastSig) || /\b(return|typeof|case|in|of)$/.test(out.slice(-8)))) {
      let j = i + 1, inClass = false;
      while (j < n && s[j] !== '\n') { if (s[j] === '\\') { j += 2; continue; } if (s[j] === '[') inClass = true; else if (s[j] === ']') inClass = false; else if (s[j] === '/' && !inClass) break; j++; }
      if (j < n && s[j] === '/') { out += ' '.repeat(j + 1 - i); i = j + 1; lastSig = ')'; continue; }
    }
    out += c;
    if (!/\s/.test(c)) lastSig = c;
    i++;
  }
  return out;
}

const RE = [
  /\bimport\s+(?:type\s+)?[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*['"]([^'"]+)['"]/g,
  /\bexport\s+(?:type\s+)?[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"`]([^'"`$]+)['"`]\s*\)/g,
  /\brequire\s*\(\s*['"`]([^'"`$]+)['"`]\s*\)/g,
  /\brequire\.resolve\s*\(\s*['"`]([^'"`$]+)['"`]\s*\)/g,
  /new\s+URL\(\s*['"`](\.[^'"`$]+)['"`]\s*,\s*import\.meta\.url/g,
];
const TYPE_ONLY = /\bimport\s+type\s/;

function resolveSpec(from, spec) {
  let base;
  if (spec.startsWith('.')) base = path.join(path.dirname(from), spec);
  else if (spec.startsWith('@/')) base = path.join('client/src', spec.slice(2));
  else if (spec.startsWith('@shared/')) base = path.join('shared', spec.slice(8));
  else if (spec.startsWith('shared/')) base = path.join('shared', spec.slice(7));
  else if (spec.startsWith('/') && fileSet.has(spec.slice(1))) base = spec.slice(1);
  else return { external: spec };
  base = path.normalize(base);
  const cands = [base];
  const ext = path.extname(base);
  if (['.js', '.jsx', '.mjs', '.cjs'].includes(ext)) {
    const stem = base.slice(0, -ext.length);
    cands.push(stem + '.ts', stem + '.tsx', stem + '.mts');
  }
  for (const e of EXTS) cands.push(base + e);
  for (const e of EXTS) cands.push(path.join(base, 'index' + e));
  for (const c of cands) if (fileSet.has(c)) return { file: c };
  return { unresolved: base };
}

const edges = {};
const externals = {}; // pkg -> Set(files)
const unresolved = [];
for (const f of files) {
  const s = stripComments(src[f]);
  const out = new Set();
  for (const re of RE) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(s))) {
      const spec = m[1];
      const r = resolveSpec(f, spec);
      if (r.file) out.add(r.file);
      else if (r.external) {
        if (spec.startsWith('node:')) continue;
        const pkg = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
        (externals[pkg] ||= new Set()).add(f);
      } else unresolved.push([f, spec]);
    }
  }
  edges[f] = [...out];
}

function reach(roots) {
  const seen = new Set();
  const stack = roots.filter((r) => fileSet.has(r));
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    for (const n of edges[f] || []) if (!seen.has(n)) stack.push(n);
  }
  return seen;
}

const isTest = (f) => /(__tests__|__mocks__|\.test\.|\.spec\.|\/tests?\/|\.stories\.)/.test(f);
const serverRoots = ['server/index.ts'];
const clientRoots = ['client/src/main.tsx'];
const rS = reach(serverRoots);
const rC = reach(clientRoots);
const all = new Set([...rS, ...rC]);

// Everything referenced by package.json scripts (non-test) as extra roots, reported separately
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const scriptRefs = new Set();
for (const [k, v] of Object.entries(pkg.scripts)) {
  for (const m of v.matchAll(/((?:server|scripts|shared|client)\/[\w./@-]+\.(?:ts|mjs|js|cjs|tsx))/g)) scriptRefs.add(m[1]);
}
const rScripts = reach([...scriptRefs]);

function summarize(prefix, reachable) {
  const fs_ = files.filter((f) => f.startsWith(prefix + '/'));
  const prod = fs_.filter((f) => !isTest(f));
  const r = prod.filter((f) => reachable.has(f));
  const sum = (a) => a.reduce((x, f) => x + loc[f], 0);
  return {
    prefix,
    files_all: fs_.length,
    loc_all: sum(fs_),
    files_nontest: prod.length,
    loc_nontest: sum(prod),
    files_reachable: r.length,
    loc_reachable: sum(r),
    pct_files: +(100 * r.length / prod.length).toFixed(1),
    pct_loc: +(100 * sum(r) / sum(prod)).toFixed(1),
  };
}

const summary = [
  summarize('server', rS),
  summarize('server/services', rS),
  summarize('server/routes', rS),
  summarize('shared', all),
  summarize('client/src', rC),
  summarize('client/src/concept2cure', rC),
];

// Unreachable by directory (depth 3 for server, 4 for client)
function dirAgg(prefix, reachable, depth) {
  const agg = {};
  for (const f of files) {
    if (!f.startsWith(prefix + '/') || isTest(f)) continue;
    const parts = f.split('/');
    const d = parts.slice(0, Math.min(depth, parts.length - 1)).join('/');
    const a = (agg[d] ||= { dir: d, files: 0, loc: 0, rfiles: 0, rloc: 0 });
    a.files++; a.loc += loc[f];
    if (reachable.has(f)) { a.rfiles++; a.rloc += loc[f]; }
  }
  return Object.values(agg).map((a) => ({ ...a, dead_loc: a.loc - a.rloc })).sort((x, y) => y.dead_loc - x.dead_loc);
}

const routeFiles = files.filter((f) => f.startsWith('server/routes/') && !isTest(f));
const routeUnreached = routeFiles.filter((f) => !rS.has(f)).map((f) => ({ f, loc: loc[f] })).sort((a, b) => b.loc - a.loc);

// External packages: server-reachable vs client-reachable importer counts
const extOut = {};
for (const [p, set] of Object.entries(externals)) {
  const arr = [...set];
  extOut[p] = {
    importers: arr.length,
    server: arr.filter((f) => f.startsWith('server/')).length,
    server_reach: arr.filter((f) => rS.has(f)).length,
    client: arr.filter((f) => f.startsWith('client/')).length,
    client_reach: arr.filter((f) => rC.has(f)).length,
    shared: arr.filter((f) => f.startsWith('shared/')).length,
    scripts: arr.filter((f) => f.startsWith('scripts/')).length,
    scripts_reach: arr.filter((f) => rScripts.has(f)).length,
    sample_reach: arr.filter((f) => all.has(f)).slice(0, 5),
  };
}

fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 1));
fs.writeFileSync(path.join(OUT, 'dead-dirs-server.json'), JSON.stringify(dirAgg('server', rS, 3), null, 1));
fs.writeFileSync(path.join(OUT, 'dead-dirs-server-d4.json'), JSON.stringify(dirAgg('server', rS, 4), null, 1));
fs.writeFileSync(path.join(OUT, 'dead-dirs-client.json'), JSON.stringify(dirAgg('client/src', rC, 4), null, 1));
fs.writeFileSync(path.join(OUT, 'dead-dirs-shared.json'), JSON.stringify(dirAgg('shared', all, 2), null, 1));
fs.writeFileSync(path.join(OUT, 'routes-unreached.json'), JSON.stringify(routeUnreached, null, 1));
fs.writeFileSync(path.join(OUT, 'externals.json'), JSON.stringify(extOut, null, 1));
fs.writeFileSync(path.join(OUT, 'unresolved.json'), JSON.stringify(unresolved.filter(([f]) => !isTest(f)), null, 1));
fs.writeFileSync(path.join(OUT, 'reach-server.txt'), [...rS].sort().join('\n'));
fs.writeFileSync(path.join(OUT, 'reach-client.txt'), [...rC].sort().join('\n'));
fs.writeFileSync(path.join(OUT, 'script-roots.txt'), [...scriptRefs].sort().join('\n'));
fs.writeFileSync(path.join(OUT, 'edges.json'), JSON.stringify(edges));
fs.writeFileSync(path.join(OUT, 'loc.json'), JSON.stringify(loc));
console.log(JSON.stringify(summary, null, 1));
console.log('route files', routeFiles.length, 'unreached', routeUnreached.length, 'unreached loc', routeUnreached.reduce((a, b) => a + b.loc, 0));
console.log('unresolved (nontest)', unresolved.filter(([f]) => !isTest(f)).length);
console.log('scanned files', files.length);
