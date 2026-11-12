// Who asks "is this project the organization's" inside one scope computation: caller chains, counted.
import { pool } from '../../../../server/db';
import { runWithTenantScope } from '../../../../server/db/tenantStore';
import { syncQualityProjectSources } from '../../../../server/services/clinical-regulatory-evidence/record-source';
import { getCurrentReadableSourceScope } from '../../../../server/services/clinical-regulatory-evidence/source-read-access';
const PROGRAM = '5d669ca3-055f-48b1-9c34-364eb33ecb95';
const scope = { tenantId: '5', userId: '1', role: 'admin', source: 'cli' } as never;
(() => runWithTenantScope(scope, async () => {
  const chains = new Map<string, number>();
  Error.stackTraceLimit = 40;
  const q = { query: async (text: string, args?: unknown[]) => {
    if (text.includes('FROM regulatory_programs WHERE id = $1')) {
      const names = (new Error().stack ?? '').split('\n').slice(2).map((l) => /at (?:async )?([\w.$<>]+)/.exec(l)?.[1]).filter((n): n is string => !!n && !/^(Object|Promise|process|new|Module|node:)/.test(n));
      const chain = [...new Set(names)].slice(1, 6).join(' < ');
      chains.set(chain, (chains.get(chain) ?? 0) + 1);
    }
    return pool.query(text, args as never);
  } } as never;
  await syncQualityProjectSources({ organizationId: 5, programId: PROGRAM, userId: 1 });
  await getCurrentReadableSourceScope(q, { organizationId: 5, programId: PROGRAM, userId: 1 });
  for (const [chain, n] of [...chains.entries()].sort((a, b) => b[1] - a[1])) console.info(String(n).padStart(4), chain);
  const native = await pool.query(`SELECT count(*) FILTER (WHERE provenance->>'origin'='native_record_snapshot')::int AS native, count(*) FILTER (WHERE provenance->>'origin'='native_record_snapshot' AND is_current IS FALSE)::int AS superseded, count(*)::int AS total FROM cre_evidence_sources WHERE organization_id=5 AND client_program_id=$1 AND deleted_at IS NULL`, [PROGRAM]);
  console.info('sources', JSON.stringify(native.rows[0]));
  await pool.end();
}))().catch((e) => { console.info('profile failed', (e as Error).message.slice(0, 200)); process.exit(1); });
