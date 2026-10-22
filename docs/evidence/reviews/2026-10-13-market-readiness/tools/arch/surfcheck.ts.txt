import fs from 'fs';
import { launchScopeApiVerdict } from '<repo>/server/services/entitlements/launch-scope-api.ts';
import { buildPrefixMap, NEVER_GATED } from '<repo>/server/services/entitlements/api-prefix-map.ts';
const A = '<scratch>/arch/';
const edges = JSON.parse(fs.readFileSync(A + 'edges.json', 'utf8'));
const pm = buildPrefixMap();
const roots: Record<string, string> = {
  tasks: 'client/src/concept2cure/v2/surfaces/TaskBoard.tsx',
  vault: 'client/src/concept2cure/v2/surfaces/Vault.tsx',
};
const lic = fs.readFileSync('<repo>/client/src/concept2cure/v2/surfaceViews.ts', 'utf8').match(/const LicensingSurface\s*=\s*lazy\w*\(\s*\(\)\s*=>\s*import\(\s*['"]([^'"]+)['"]/);
if (lic) roots.licensing = 'client/src/concept2cure/v2/' + lic[1].replace('./', '') + '.tsx';
const SV = 'client/src/concept2cure/v2/surfaceViews.ts';
for (const [id, root] of Object.entries(roots)) {
  const seen = new Set<string>(); const st = [root];
  while (st.length) { const f = st.pop()!; if (seen.has(f) || f === SV) continue; seen.add(f); for (const n of edges[f] || []) st.push(n); }
  const bad = new Map<string, string[]>();
  for (const f of seen) {
    if (/__tests__|\.test\./.test(f) || !fs.existsSync('<repo>/' + f)) continue;
    const s = fs.readFileSync('<repo>/' + f, 'utf8');
    for (const m of s.matchAll(/['"`](\/api\/[A-Za-z0-9_\-/${}.:]+)/g)) {
      const p = m[1].replace(/\$\{[^}]*\}/g, 'x').replace(/[?].*$/, '');
      const v = launchScopeApiVerdict(p, pm, NEVER_GATED);
      if (v === 'unmapped' || v === 'out-of-scope') { const k = `${v} ${p}`; bad.set(k, [...(bad.get(k) || []), f.replace('client/src/concept2cure/', '')]); }
    }
  }
  console.log(`\n== ${id} (${root}) files=${seen.size}`);
  for (const [k, fs_] of bad) console.log('  ', k, '<-', [...new Set(fs_)].slice(0, 2).join(', '));
}
