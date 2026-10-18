import fs from 'fs'; import path from 'path';
import { LAUNCH_SURFACE_IDS } from '<repo>/shared/constants/launch-scope.ts';
const A = '<scratch>/arch/';
const edges = JSON.parse(fs.readFileSync(A + 'edges.json', 'utf8')); const loc = JSON.parse(fs.readFileSync(A + 'loc.json', 'utf8'));
const SV = 'client/src/concept2cure/v2/surfaceViews.ts';
const sv = fs.readFileSync('<repo>/' + SV, 'utf8');
const compFile: Record<string, string> = {};
for (const m of sv.matchAll(/const\s+(\w+)\s*=\s*lazy\w*\(\s*\(\)\s*=>\s*import\(\s*['"]([^'"]+)['"]/g)) {
  const base = path.normalize(path.join(path.dirname(SV), m[2]));
  for (const e of ['.tsx', '.ts', '.jsx', '/index.tsx', '/index.ts']) if (loc[base + e] !== undefined) { compFile[m[1]] = base + e; break; }
}
for (const m of sv.matchAll(/import\s+\{([^}]+)\}\s+from\s+['"](\.[^'"]+)['"]/g)) {
  const base = path.normalize(path.join(path.dirname(SV), m[2]));
  let f = ''; for (const e of ['.tsx', '.ts', '/index.tsx', '/index.ts']) if (loc[base + e] !== undefined) { f = base + e; break; }
  if (f) for (const n of m[1].split(',')) { const id = n.split(/\s+as\s+/).pop()!.trim(); if (id && !compFile[id]) compFile[id] = f; }
}
const surf: Record<string, string> = {};
for (const m of sv.matchAll(/(?:^|[\s,{])['"]?([a-z0-9][a-z0-9-]*)['"]?\s*:\s*\{\s*component:\s*(\w+)/gm)) if (compFile[m[2]]) surf[m[1]] = compFile[m[2]];
const reach = (root: string) => { const s = new Set<string>(); const st = [root]; while (st.length) { const f = st.pop()!; if (s.has(f) || f === SV) continue; s.add(f); for (const n of edges[f] || []) st.push(n); } return s; };
const L = new Set<string>(), O = new Set<string>();
for (const [id, f] of Object.entries(surf)) for (const x of reach(f)) (LAUNCH_SURFACE_IDS.has(id) ? L : O).add(x);
const shell = reach('client/src/main.tsx'); // includes everything via surfaceViews; recompute shell minus surfaceViews
const shellOnly = new Set<string>(); { const st = ['client/src/main.tsx']; while (st.length) { const f = st.pop()!; if (shellOnly.has(f) || f === SV) continue; shellOnly.add(f); for (const n of edges[f] || []) st.push(n); } }
const isT = (f: string) => /__tests__|\.test\.|\.spec\./.test(f);
const excl = [...O].filter(f => !L.has(f) && !shellOnly.has(f) && !isT(f));
const sum = (a: string[]) => a.reduce((x, f) => x + (loc[f] || 0), 0);
console.log('surfaces mapped', Object.keys(surf).length, 'launch', Object.keys(surf).filter(i => LAUNCH_SURFACE_IDS.has(i)).length);
console.log('client LOC reachable only from out-of-scope surfaces', sum(excl), 'files', excl.length);
console.log('client LOC reachable from launch surfaces or shell', sum([...new Set([...L, ...shellOnly])].filter(f => !isT(f))));
const byDir: Record<string, number> = {}; for (const f of excl) { const d = f.split('/').slice(0, 4).join('/'); byDir[d] = (byDir[d] || 0) + loc[f]; }
console.log(Object.entries(byDir).sort((a, b) => b[1] - a[1]).slice(0, 8));
const top = excl.sort((a, b) => loc[b] - loc[a]).slice(0, 8).map(f => `${loc[f]} ${f}`); console.log(top.join('\n'));
