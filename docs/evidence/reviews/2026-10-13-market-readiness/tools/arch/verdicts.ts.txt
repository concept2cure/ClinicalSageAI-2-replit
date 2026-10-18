import fs from 'fs';
import { launchScopeApiVerdict } from '<repo>/server/services/entitlements/launch-scope-api.ts';
import { buildPrefixMap, NEVER_GATED, modulesForPath } from '<repo>/server/services/entitlements/api-prefix-map.ts';
const dir = '<scratch>/arch/';
const mounts = fs.readFileSync(dir + 'mounts.txt', 'utf8').split('\n').filter(Boolean);
const pm = buildPrefixMap();
const out: Record<string, string[]> = {};
for (const m of mounts) {
  const p = m.replace(/:[^/]+/g, 'x').replace(/\*.*$/, 'x');
  const v = launchScopeApiVerdict(p === '/api' ? '/api/' : p, pm, NEVER_GATED);
  const mods = modulesForPath(p, pm);
  (out[v] ||= []).push(`${m}${mods ? '  <- ' + [...mods].join(',') : ''}`);
}
for (const [k, v] of Object.entries(out)) console.log(`\n### ${k} (${v.length})\n` + v.join('\n'));
console.log('\nprefix map size', pm.size);
