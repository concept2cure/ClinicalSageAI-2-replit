// Stage timings of GET /api/c2c/projects/:id/sources, in process, as org 5's author. Prints timings and counts only.
import { pool } from '../../../../server/db';
import { runWithTenantScope } from '../../../../server/db/tenantStore';
import { syncQualityProjectSources } from '../../../../server/services/clinical-regulatory-evidence/record-source';
import { getCurrentReadableSourceScope, requireSourceReadScopeStillCurrent } from '../../../../server/services/clinical-regulatory-evidence/source-read-access';
import { searchDataRoom, parseDataRoomQuery } from '../../../../server/services/clinical-regulatory-evidence/data-room-search';
import { summarizeSourceUsage } from '../../../../server/services/clinical-regulatory-evidence/source-usage.service';
import { gradeSources } from '../../../../server/services/clinical-regulatory-evidence/data-room-grade';
const PROGRAM = '5d669ca3-055f-48b1-9c34-364eb33ecb95';
const scope = { tenantId: '5', userId: '1', role: 'admin', source: 'cli' } as never;
const timed = async <T>(name: string, f: () => Promise<T>): Promise<T> => {
  const t = Date.now();
  try { const r = await f(); console.info(`${name.padEnd(34)} ${String(Date.now() - t).padStart(6)} ms`); return r; }
  catch (e) { console.info(`${name.padEnd(34)} ${String(Date.now() - t).padStart(6)} ms FAILED ${(e as { code?: string }).code ?? ''} ${(e as Error).message.slice(0, 120)}`); throw e; }
};
(() => runWithTenantScope(scope, async () => {
  const actor = { organizationId: 5, programId: PROGRAM, userId: 1 };
  for (let pass = 1; pass <= 2; pass++) {
    console.info(`— pass ${pass} —`);
    await timed('syncQualityProjectSources', () => syncQualityProjectSources(actor));
    const readable = await timed('getCurrentReadableSourceScope', () => getCurrentReadableSourceScope(pool, actor));
    console.info('  readable source ids', (readable as { sourceIds: number[] }).sourceIds.length);
    await timed('requireSourceReadScopeStillCurrent', () => requireSourceReadScopeStillCurrent(pool, actor, readable as never));
    const query = parseDataRoomQuery(PROGRAM, { limit: '200', offset: '0' });
    const page = await timed('searchDataRoom (all of the above +2 queries)', () => searchDataRoom(5, query, { userId: 1 }));
    console.info('  sources', page.sources.length, 'total', page.total);
    await timed('summarizeSourceUsage', () => summarizeSourceUsage(pool, 5, page.sources.map((s) => s.id), { userId: 1 }));
    await timed('gradeSources', () => gradeSources(pool as never, page.sources.map((s) => ({ ...s, organizationId: Number((s as { organizationId?: unknown }).organizationId) })) as never));
  }
  await pool.end();
}))().catch((e) => { console.info('profile failed', (e as Error).message.slice(0, 200)); process.exit(1); });
