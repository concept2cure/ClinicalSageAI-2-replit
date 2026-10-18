import { buildPrefixMap } from '<repo>/server/services/entitlements/api-prefix-map.ts';
import { LAUNCH_SURFACE_IDS } from '<repo>/shared/constants/launch-scope.ts';
const pm = buildPrefixMap();
const rows = [...pm.entries()].map(([p, s]) => [p, [...s].join(','), [...s].some(x => LAUNCH_SURFACE_IDS.has(x)) ? 'LAUNCH' : 'oos']);
rows.sort((a,b)=>a[0].localeCompare(b[0]));
for (const r of rows) console.log(r.join('\t'));
console.log('launch surfaces', [...LAUNCH_SURFACE_IDS].join(','));
