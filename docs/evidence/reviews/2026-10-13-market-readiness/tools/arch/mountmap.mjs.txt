// Map each /api mount in bootstrap/startup files to its imported module file, then
// compute LOC exclusively reachable through mounts refused in production.
import fs from 'fs';
import path from 'path';
const ROOT = '<repo>';
const OUT = path.dirname(new URL(import.meta.url).pathname);
const edges = JSON.parse(fs.readFileSync(path.join(OUT, 'edges.json'), 'utf8'));
const loc = JSON.parse(fs.readFileSync(path.join(OUT, 'loc.json'), 'utf8'));
const verdictLines = fs.readFileSync(path.join(OUT, 'verdicts.txt'), 'utf8').split('\n');
const verdictOf = {};
let cur = null;
for (const l of verdictLines) {
  const m = l.match(/^### (\S+)/);
  if (m) { cur = m[1]; continue; }
  if (!l.startsWith('/api')) continue;
  verdictOf[l.split('  <-')[0].trim()] = cur;
}
const fileSet = new Set(Object.keys(loc));
function resolve(from, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.normalize(path.join(path.dirname(from), spec));
  const c = [base];
  const ext = path.extname(base);
  if (['.js', '.mjs', '.cjs', '.jsx'].includes(ext)) c.push(base.slice(0, -ext.length) + '.ts', base.slice(0, -ext.length) + '.tsx');
  for (const e of ['.ts', '.tsx', '.js', '.mjs', '.jsx']) c.push(base + e);
  for (const e of ['.ts', '.tsx', '.js']) c.push(path.join(base, 'index' + e));
  return c.find((x) => fileSet.has(x)) || null;
}
const files = fs.readdirSync(path.join(ROOT, 'server/bootstrap')).filter((f) => f.endsWith('.ts')).map((f) => 'server/bootstrap/' + f)
  .concat(fs.readdirSync(path.join(ROOT, 'server/startup')).filter((f) => f.endsWith('.ts')).map((f) => 'server/startup/' + f));
const mounts = []; // {path, file(bootstrap), line, modules:[files]}
for (const bf of files) {
  const s = fs.readFileSync(path.join(ROOT, bf), 'utf8');
  const idToFile = {};
  for (const m of s.matchAll(/import\s+([\w$]+)\s*(?:,\s*\{([^}]*)\})?\s*from\s*['"]([^'"]+)['"]/g)) {
    const f = resolve(bf, m[3]); if (!f) continue;
    idToFile[m[1]] = f;
    if (m[2]) for (const n of m[2].split(',')) { const id = n.split(/\s+as\s+/).pop().trim(); if (id) idToFile[id] = f; }
  }
  for (const m of s.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    const f = resolve(bf, m[2]); if (!f) continue;
    for (const n of m[1].split(',')) { const id = n.replace(/^type\s+/, '').split(/\s+as\s+/).pop().trim(); if (id) idToFile[id] = f; }
  }
  for (const m of s.matchAll(/(?:const|let)\s+(\{[^}]*\}|[\w$]+)\s*=\s*await\s+import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const f = resolve(bf, m[2]); if (!f) continue;
    if (m[1].startsWith('{')) for (const n of m[1].slice(1, -1).split(',')) { const id = n.split(':').pop().trim(); if (id) idToFile[id] = f; }
    else idToFile[m[1]] = f;
  }
  const lines = s.split('\n');
  lines.forEach((line, i) => {
    let p = null;
    let m = line.match(/app\.(?:use|get|post|put|patch|delete|all)\(\s*['"](\/api[^'"]*)['"]/);
    if (m) p = m[1];
    const m2 = line.match(/path:\s*['"](\/api[^'"]*)['"]/);
    if (!p && m2) p = m2[1];
    if (!p) return;
    // identifiers on this line (and the next one for wrapped calls)
    const text = line + ' ' + (lines[i + 1] || '');
    const mods = new Set();
    for (const id of text.match(/[A-Za-z_$][\w$]*/g) || []) if (idToFile[id]) mods.add(idToFile[id]);
    mounts.push({ path: p, bootstrap: `${bf}:${i + 1}`, modules: [...mods], verdict: verdictOf[p] || '?' });
  });
}
fs.writeFileSync(path.join(OUT, 'mountmap.json'), JSON.stringify(mounts, null, 1));
const refused = (v) => v === 'out-of-scope' || v === 'unmapped';
const refusedMods = new Set(), keptMods = new Set();
for (const m of mounts) for (const f of m.modules) (refused(m.verdict) ? refusedMods : keptMods).add(f);
// modules only mounted at refused prefixes
const onlyRefused = [...refusedMods].filter((f) => !keptMods.has(f));
function reach(roots, blocked) {
  const seen = new Set(); const st = [...roots];
  while (st.length) { const f = st.pop(); if (seen.has(f) || blocked.has(f)) continue; seen.add(f); for (const n of edges[f] || []) st.push(n); }
  return seen;
}
const all = reach(['server/index.ts'], new Set());
const without = reach(['server/index.ts'], new Set(onlyRefused));
const isTest = (f) => /(__tests__|__mocks__|\.test\.|\.spec\.)/.test(f);
const exclusive = [...all].filter((f) => !without.has(f) && !isTest(f));
const sum = (a) => a.reduce((x, f) => x + (loc[f] || 0), 0);
const allLoc = sum([...all].filter((f) => !isTest(f)));
console.log('mount entries', mounts.length, 'with module resolved', mounts.filter((m) => m.modules.length).length);
console.log('verdict counts', Object.entries(mounts.reduce((a, m) => ((a[m.verdict] = (a[m.verdict] || 0) + 1), a), {})));
console.log('modules only mounted at refused prefixes', onlyRefused.length);
console.log('reachable server-graph LOC', allLoc, 'exclusive to refused mounts', sum(exclusive), (100 * sum(exclusive) / allLoc).toFixed(1) + '%', 'files', exclusive.length);
const byDir = {};
for (const f of exclusive) { const d = f.split('/').slice(0, 3).join('/'); byDir[d] = (byDir[d] || 0) + loc[f]; }
console.log(Object.entries(byDir).sort((a, b) => b[1] - a[1]).slice(0, 30));
fs.writeFileSync(path.join(OUT, 'exclusive-refused.txt'), exclusive.sort().map((f) => `${loc[f]}\t${f}`).join('\n'));
