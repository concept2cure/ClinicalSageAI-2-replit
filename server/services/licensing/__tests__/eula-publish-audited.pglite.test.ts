/**
 * Publishing an agreement version takes a reason and writes a sealed audit row,
 * with what was superseded and what replaced it, in the same transaction as the
 * supersede and the insert (F1, 2026-11-10: ADM-01, IAM-ADM-02).
 *
 * Until 2026-11-10 publishAgreement took no reason and wrote no audit row: the
 * only trace of who replaced the terms every user must accept was created_by.
 */
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ pg: null as PGlite | null, statements: [] as string[] }));
vi.mock('../../../db.js', () => {
  const query = async (sql: string, args?: unknown[]) => {
    h.statements.push(sql);
    if (!h.pg) return { rows: [] };
    if (!args && sql.includes(';')) return (await h.pg.exec(sql)).at(-1) ?? { rows: [] };
    return h.pg.query(sql, args);
  };
  return { pool: { query, connect: async () => ({ query, release: () => undefined }) } };
});

import { AUDIT_LOGS_PGLITE_DDL } from '../../../db/pglite-harness';
import { verifyAuditChain, type PoolClient } from '../../audit/chain';
import { publishAgreement } from '../eula-service';

const OLD = '40000000-0000-4000-8000-000000000001';
const REASON = 'Annual legal review of the licence terms';

beforeAll(async () => {
  vi.stubEnv('AUDIT_HMAC_KEY', 'synthetic-eula-audit-key-only-for-local-tests');
  h.pg = new PGlite();
  await h.pg.exec(await readFile('db/migrations/20260621_intelligent_licensing_eula.sql', 'utf8'));
  await h.pg.exec(AUDIT_LOGS_PGLITE_DDL);
  await h.pg.exec(await readFile('migrations/20260921_audit_logs_chain_seq.sql', 'utf8'));
});
beforeEach(async () => {
  await h.pg!.exec(`ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS eula_publish_audit_unavailable;
    DELETE FROM audit_logs; DELETE FROM license_acceptances; DELETE FROM license_agreements;`);
  await h.pg!.query(
    `INSERT INTO license_agreements(id,agreement_key,version,title,body,scope,status) VALUES ($1,'dpa','1','Data Processing Agreement','Old terms.','organization','active')`,
    [OLD],
  );
  h.statements.length = 0;
});
afterAll(async () => { await h.pg?.close(); vi.unstubAllEnvs(); });

const publish = (over: Record<string, unknown> = {}) =>
  publishAgreement({
    agreementKey: 'dpa', version: '2', title: 'Data Processing Agreement', body: 'New terms.',
    scope: 'organization', createdBy: '1', actorUserId: 1, reason: REASON, ...over,
  } as Parameters<typeof publishAgreement>[0]);

describe('publishAgreement', () => {
  it('writes one sealed audit row with the reason, the superseded version and the new one, before COMMIT', async () => {
    const published = await publish();
    const audits = await h.pg!.query<{ tenant_id: number; user_id: number; action: string; record_id: string; reason: string; new_values: any; hmac_seal: string }>('SELECT * FROM audit_logs');
    expect(audits.rows).toHaveLength(1);
    const row = audits.rows[0];
    expect(row).toMatchObject({ tenant_id: 0, user_id: 1, action: 'license_agreement_published', record_id: published.id, reason: REASON });
    expect(row.new_values.agreementKey).toBe('dpa');
    expect(row.new_values.before).toEqual([expect.objectContaining({ id: OLD, version: '1', contentHash: expect.stringMatching(/^[a-f0-9]{64}$/) })]);
    expect(row.new_values.after).toEqual(expect.objectContaining({ id: published.id, version: '2', scope: 'organization', required: true, contentHash: expect.stringMatching(/^[a-f0-9]{64}$/) }));
    expect(row.hmac_seal).toMatch(/^[a-f0-9]{64}$/);
    expect((await verifyAuditChain(h.pg! as unknown as PoolClient, { tenantId: 0 })).ok).toBe(true);
    const commit = h.statements.lastIndexOf('COMMIT');
    expect(h.statements.findIndex(s => /INSERT INTO audit_logs/.test(s))).toBeLessThan(commit);
    const states = await h.pg!.query<{ id: string; status: string }>(`SELECT id, status FROM license_agreements ORDER BY version`);
    expect(states.rows).toEqual([{ id: OLD, status: 'superseded' }, { id: published.id, status: 'active' }]);
  });

  it('refuses a missing or too-short reason before any write', async () => {
    for (const reason of [undefined, '', ' x ']) {
      await expect(publish({ reason }), String(reason)).rejects.toMatchObject({ statusCode: 400, code: 'AGREEMENT_PUBLISH_REASON_REQUIRED' });
    }
    expect(h.statements.some(s => /UPDATE license_agreements|INSERT INTO license_agreements|INSERT INTO audit_logs/.test(s))).toBe(false);
  });

  it('an audit row that cannot be written rolls the publish back: the old version stays active', async () => {
    await h.pg!.exec('ALTER TABLE audit_logs ADD CONSTRAINT eula_publish_audit_unavailable CHECK(false) NOT VALID');
    await expect(publish()).rejects.toThrow();
    const states = await h.pg!.query<{ id: string; status: string }>('SELECT id, status FROM license_agreements');
    expect(states.rows).toEqual([{ id: OLD, status: 'active' }]);
    expect((await h.pg!.query('SELECT * FROM audit_logs')).rows).toHaveLength(0);
    expect(h.statements).toContain('ROLLBACK');
    expect(h.statements).not.toContain('COMMIT');
  });

  it('a first version (nothing superseded) is audited with before: []', async () => {
    const published = await publish({ agreementKey: 'baa', title: 'Business Associate Agreement' });
    const audits = await h.pg!.query<{ new_values: any }>('SELECT new_values FROM audit_logs');
    expect(audits.rows[0].new_values.before).toEqual([]);
    expect(audits.rows[0].new_values.after.id).toBe(published.id);
  });
});
