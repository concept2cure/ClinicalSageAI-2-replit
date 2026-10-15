/** Actual service SQL with sequential admission changes after reservations.
 * Independent-session snapshot/lock proof lives in the opt-in D2 PG evidence.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDocumentDispositionService } from '../service';
import { createDispositionHarness, DISPOSITION_TEST_CLOCK, type DispositionHarness, type DispositionFixture } from './disposition-fixture';

let harness: DispositionHarness;
beforeAll(async () => { harness = await createDispositionHarness(); });
afterAll(async () => { await harness.close(); });

function confirmation(f: DispositionFixture, changed?: 'deleted' | 'owner' | 'lead') {
  const sqls: string[] = [];
  let injected = false;
  const query = async (sql: string, params?: unknown[]) => {
    sqls.push(sql);
    const result = await harness.pg.query(sql, params);
    if (changed && !injected && sql === 'LOCK TABLE public.document_data_dispositions IN SHARE ROW EXCLUSIVE MODE') {
      injected = true;
      const updates = { deleted: 'deleted_at=now()', owner: 'organization_id=organization_id+100000', lead: 'lead_user_id=99' };
      await harness.pg.query(`UPDATE regulatory_programs SET ${updates[changed]} WHERE id=$1 AND organization_id=$2`, [f.program, f.org]);
    }
    return { rows: result.rows };
  };
  const service = createDocumentDispositionService({
    db: { query, connect: async () => ({ query, release: () => undefined }) },
    audit: async (q, entry) => {
      const id = randomUUID();
      await q.query('INSERT INTO test_disposition_audit VALUES ($1,$2,$3)', [id, f.org, JSON.stringify(entry)]);
      return { id, sha256Chain: 'f'.repeat(64) };
    },
    enabled: () => true, tokenSecret: 'confirmation-freshness-test-secret-at-least-32-characters',
    clock: () => DISPOSITION_TEST_CLOCK,
  });
  const scope = { ...f.scope, orgRole: 'viewer' };
  return { sqls, service, scope, apply: async () => {
    const preview = await service.preview(scope);
    return service.apply({ ...scope, choice: 'keep_data', reason: 'Controlled fixture confirmation after reservations', previewToken: preview.previewToken });
  } };
}

describe('confirmation rechecks the current owned live program after reservations', () => {
  it.each(['deleted', 'owner', 'lead'] as const)('refuses a program %s change before any decision or audit is committed', async change => {
    const f = await harness.seed();
    // A lead change is relevant to a persisted member. The shared harness's
    // manager retains organization mutation authority independently of lead.
    await f.pg.query("UPDATE organization_users SET role='member' WHERE organization_id=$1 AND user_id=42", [f.org]);
    await expect(confirmation(f, change).apply()).rejects.toMatchObject({
      status: change === 'lead' ? 403 : 404, code: change === 'lead' ? 'FORBIDDEN' : 'PROJECT_NOT_FOUND',
    });
    expect(await f.records()).toEqual([]);
    expect(await f.audits()).toEqual([]);
  });

  it('preserves the authorized capture, impact and audit receipt with the program held through confirmation', async () => {
    const f = await harness.seed();
    const c = confirmation(f);
    expect((await c.apply()).disposition.choice).toBe('keep_data');
    expect(await f.records()).toHaveLength(1);
    expect(await f.audits()).toHaveLength(1);
    const programLock = c.sqls.findIndex(sql => sql.includes('pg_advisory_xact_lock'));
    const impact = c.sqls.findIndex(sql => sql.startsWith('LOCK TABLE public.authoring_citations'));
    const disposition = c.sqls.findIndex(sql => sql === 'LOCK TABLE public.document_data_dispositions IN SHARE ROW EXCLUSIVE MODE');
    const liveProgram = c.sqls.findIndex(sql => sql.includes('FROM regulatory_programs') && sql.endsWith('FOR SHARE'));
    expect(programLock).toBeLessThan(impact);
    expect(c.sqls[impact]).toContain('public.authoring_export_history');
    expect(impact).toBeLessThan(disposition);
    expect(disposition).toBeLessThan(liveProgram);
  });
});
