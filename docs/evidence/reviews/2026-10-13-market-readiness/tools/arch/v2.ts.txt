import { launchScopeApiVerdict } from '<repo>/server/services/entitlements/launch-scope-api.ts';
import { buildPrefixMap, NEVER_GATED } from '<repo>/server/services/entitlements/api-prefix-map.ts';
import { UI_SURFACES } from '<repo>/shared/constants/ui-surface-registry.ts';
const pm = buildPrefixMap();
for (const p of ['/api/audit-trail/ledger', '/api/project-rules', '/api/project-home/12', '/api/vault/legal-holds', '/api/vault/documents/1', '/api/qms/x', '/api/esignature/sign', '/api/part11/x', '/api/audit/events', '/API/cmc/x'])
  console.log(p.padEnd(30), launchScopeApiVerdict(p, pm, NEVER_GATED));
for (const id of ['audit-trail', 'part11-console', 'tasks', 'project-home', 'vault', 'quality', 'qmp'])
  console.log(id, JSON.stringify(UI_SURFACES.find((s: any) => s.id === id)?.apiPrefixes));
