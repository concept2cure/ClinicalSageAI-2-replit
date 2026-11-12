// Which statements the readable-source scope runs, how often, and for how long. Prints statement heads and timings only.
import { pool } from '../../../../server/db';
import { runWithTenantScope } from '../../../../server/db/tenantStore';
import { getCurrentReadableSourceScope } from '../../../../server/services/clinical-regulatory-evidence/source-read-access';
const PROGRAM = '5d669ca3-055f-48b1-9c34-364eb33ecb95';
const scope = { tenantId: '5', userId: '1', role: 'admin', source: 'cli' } as never;
(() => runWithTenantScope(scope, async () => {
  const seen = new Map<string, { n: number; ms: number }>();
  const q = { query: async (text: string, args?: unknown[]) => {
    const head = text.replace(/\s+/g, ' ').trim().slice(0, 110);
    const t = Date.now();
    try { return await pool.query(text, args as never); }
    finally { const e = seen.get(head) ?? { n: 0, ms: 0 }; e.n += 1; e.ms += Date.now() - t; seen.set(head, e); }
  } } as never;
  for (let pass = 1; pass <= 2; pass++) {
    seen.clear();
    const t = Date.now();
    const r = await getCurrentReadableSourceScope(q, { organizationId: 5, programId: PROGRAM, userId: 1 });
    console.info(`— pass ${pass}: ${Date.now() - t} ms, ${r.sourceIds.length} readable, ${[...seen.values()].reduce((a, e) => a + e.n, 0)} statements —`);
    for (const [head, e] of [...seen.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, 14)) console.info(`${String(e.n).padStart(5)} × ${String(e.ms).padStart(6)} ms  ${head}`);
  }
  await pool.end();
}))().catch((e) => { console.info('profile failed', (e as Error).message.slice(0, 200)); process.exit(1); });
