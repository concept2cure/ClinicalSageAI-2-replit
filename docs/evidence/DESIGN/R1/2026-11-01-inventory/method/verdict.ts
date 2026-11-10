import fs from 'node:fs';
import { launchScopeApiVerdict } from '../../../../../../server/services/entitlements/launch-scope-api';
import { NEVER_GATED, buildPrefixMap, modulesForPath } from '../../../../../../server/services/entitlements/api-prefix-map';
const S = process.argv[2];
const rows = JSON.parse(fs.readFileSync(`${S}/matched.json`, 'utf8'));
const pm = buildPrefixMap();
for (const r of rows) {
  const p = r.path.replace(/:[A-Za-z_]\w*\??/g, 'x');
  r.prod = launchScopeApiVerdict(p, pm, NEVER_GATED);
  const s = modulesForPath(p.toLowerCase(), pm);
  r.claimedBy = s ? [...s] : [];
}
fs.writeFileSync(`${S}/verdict.json`, JSON.stringify(rows));
const c: Record<string, number> = {};
for (const r of rows) { const k = `${r.caller ? 'called' : 'uncalled'}/${r.prod}`; c[k] = (c[k] ?? 0) + 1; }
console.info(c);
