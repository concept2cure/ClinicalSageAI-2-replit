/**
 * The database's own rule for removing a sequence (P-86):
 * migrations/20261109_ectd_sequence_removal_guard.sql, applied from disk on
 * PGlite over the freeze-gate fixture's signature tables.
 *
 * A removal (deleted_at set) stands at COMMIT only with its signed record: a
 * retirement's ECTD_SEQUENCE_RETIRED row naming a live 'retire' signature with
 * the meaning responsibility by the row's actor, or a filed-elsewhere
 * declaration whose signature names the removed number. A removed row is never
 * changed or restored, a sequence the agency may hold is never removed, and a
 * removal changes nothing else.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { createIndPgliteDb, AUDIT_LOGS_PGLITE_DDL, applySequenceRemovalGuard, type IndPgliteDb } from '../../../db/pglite-harness';
import { ORG, USER, FREEZE_GATE_SEED_SQL } from './_freeze-gate-fixture';
import { FILED_DISPATCH_STATUSES } from '../filed-dispatch';

const MIGRATION = new URL('../../../../migrations/20261109_ectd_sequence_removal_guard.sql', import.meta.url);
let h: IndPgliteDb;
const q = (text: string, params?: unknown[]) => h.pglite.query(text, params) as Promise<{ rows: any[] }>;
/** One transaction; the error it ended with, or null when it committed. */
async function tx(statements: string): Promise<Error | null> {
  try {
    await h.pglite.exec(`BEGIN; ${statements}; COMMIT;`);
    return null;
  } catch (e) {
    await h.pglite.exec('ROLLBACK').catch(() => undefined);
    return e as Error;
  }
}
let nextId = 9800;
async function sequence(dispatchStatus: string | null = 'pending'): Promise<number> {
  const id = nextId++;
  await q(`INSERT INTO submissions (id, title, application_type, client_type, primary_region, organization_id, created_by) VALUES ($1, 'guard', 'ind', 'biotech', 'fda', ${ORG}, 4)`, [id]);
  await q(`INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by, status, dispatch_status) VALUES ($1, $1, 'fda', '0000', ${ORG}, 4, 'dispatched', $2)`, [id, dispatchStatus]);
  return id;
}
const removed = async (id: number) => (await q(`SELECT deleted_at FROM ectd_sequences WHERE id = $1`, [id])).rows[0].deleted_at !== null;
/** The statements a retirement writes: its sign action and signature, its audit row, and the removal. */
function retirement(id: number, opts: { intent?: string; meaning?: string; actor?: number; extraSet?: string } = {}): string {
  const action = `ret-${id}-${opts.intent ?? 'retire'}-${opts.meaning ?? 'responsibility'}`;
  return `
    INSERT INTO c2c_ana_actions (id, org_id, command, target, state, proposed_by, payload)
      VALUES ('${action}', ${ORG}, 'sign', 'ectd-sequence:${id}', 'executed', ${USER}, '{"intent":"${opts.intent ?? 'retire'}"}');
    INSERT INTO electronic_signatures (organization_id, signed_target, signature_manifest, bound_payload_digest, binding_basis, is_valid, verification_status, signer_id, signature_meaning, signature_type)
      VALUES (${ORG}, 'ectd-sequence:${id}', '{"actionId":"${action}"}', 'd', 'ectd-sequence-leaf-manifest-sha256', true, 'valid', ${USER}, '${opts.meaning ?? 'responsibility'}', 'governed-action');
    INSERT INTO audit_logs (id, tenant_id, actor_id, action, table_name, record_id, new_values)
      VALUES (gen_random_uuid(), ${ORG}, ${opts.actor ?? USER}, 'ECTD_SEQUENCE_RETIRED', 'ectd_sequence', '${id}', '{"signatureActionId":"${action}"}');
    UPDATE ectd_sequences SET deleted_at = now(), updated_at = now()${opts.extraSet ?? ''} WHERE id = ${id}`;
}

beforeAll(async () => {
  h = await createIndPgliteDb({ submissionCore: true, leafSources: true, programSpine: true });
  await h.pglite.exec(AUDIT_LOGS_PGLITE_DDL);
  await h.pglite.exec(FREEZE_GATE_SEED_SQL);
  // The real table's manifest is json: the filed-elsewhere declaration's own guard (20261029g) reads it with ->.
  await h.pglite.exec(`ALTER TABLE electronic_signatures ALTER COLUMN signature_manifest TYPE json USING signature_manifest::json`);
  await applySequenceRemovalGuard(h.pglite);
}, 120_000);
afterAll(async () => { await h.close(); });

describe('a removal stands only with its signed record (G1, at COMMIT)', () => {
  it('refuses a bare removal at COMMIT, and the sequence stays live', async () => {
    const id = await sequence();
    const err = await tx(`UPDATE ectd_sequences SET deleted_at = now() WHERE id = ${id}`);
    expect(err?.message).toMatch(/^SEQUENCE_REMOVAL_UNRECORDED/);
    expect(await removed(id)).toBe(false);
  });

  it('admits a retirement recorded with its responsibility signature by the same actor', async () => {
    const id = await sequence();
    expect(await tx(retirement(id))).toBeNull();
    expect(await removed(id)).toBe(true);
  });

  it('refuses a retirement record that names a signature for another act, of another meaning, or by another person', async () => {
    for (const opts of [{ intent: 'freeze' }, { meaning: 'approval' }, { actor: 99 }]) {
      const id = await sequence();
      expect((await tx(retirement(id, opts)))?.message, JSON.stringify(opts)).toMatch(/^SEQUENCE_REMOVAL_UNRECORDED/);
      expect(await removed(id)).toBe(false);
    }
  });

  it("admits the filed-elsewhere declaration's removal of the draft its signature names", async () => {
    const id = await sequence(null);
    const baseline = '11111111-2222-4333-8444-' + String(id).padStart(12, '0');
    const act = { submissionId: String(id), lastFiledSequence: '0003', originalSequence: '0000', evidenceSha256: 'a'.repeat(64), removedDraftSequences: ['0000'] };
    const err = await tx(`
      INSERT INTO submission_filed_baselines (id, organization_id, submission_id, region, last_filed_sequence, original_sequence, evidence_vault_document_id, evidence_sha256, reason, declared_by)
        VALUES ('${baseline}', ${ORG}, ${id}, 'US', '0003', '0000', '${baseline}', '${'a'.repeat(64)}', 'Filed with another tool', ${USER});
      INSERT INTO electronic_signatures (organization_id, signed_target, signature_manifest, bound_payload_digest, binding_basis, is_valid, verification_status, signer_id, signature_meaning, signature_type)
        VALUES (${ORG}, 'submission-filed-baseline:${baseline}', '${JSON.stringify({ actionId: 'b-' + id, act })}', 'd', 'filed-sequence-baseline-content-sha256', true, 'valid', ${USER}, 'responsibility', 'governed-action');
      UPDATE ectd_sequences SET deleted_at = now(), updated_at = now() WHERE id = ${id}`);
    expect(err).toBeNull();
    expect(await removed(id)).toBe(true);
  });
});

describe('a removed row is final, and a sequence the agency may hold is never removed (G2)', () => {
  it('refuses restoring a removed sequence, and any edit of one', async () => {
    const id = await sequence();
    expect(await tx(retirement(id))).toBeNull();
    expect((await tx(`UPDATE ectd_sequences SET deleted_at = NULL WHERE id = ${id}`))?.message).toMatch(/^SEQUENCE_REMOVED_IMMUTABLE/);
    expect((await tx(`UPDATE ectd_sequences SET status = 'draft' WHERE id = ${id}`))?.message).toMatch(/^SEQUENCE_REMOVED_IMMUTABLE/);
    expect(await removed(id)).toBe(true);
  });

  it.each(['sent', 'acknowledged', 'transmitting'])('refuses removing a sequence that is %s, even with a record', async (status) => {
    const id = await sequence(status);
    expect((await tx(retirement(id)))?.message).toMatch(/^SEQUENCE_FILED_NOT_REMOVABLE/);
    expect(await removed(id)).toBe(false);
  });

  it('refuses a removal that also changes the row', async () => {
    const id = await sequence();
    expect((await tx(retirement(id, { extraSet: ", status = 'draft'" })))?.message).toMatch(/^SEQUENCE_REMOVAL_CHANGES_ROW/);
    expect(await removed(id)).toBe(false);
  });

  it("names exactly the filed statuses (filed-dispatch.ts) and a send in flight", () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    const listed = [...(/OLD\.dispatch_status IN \(([^)]*)\)/.exec(sql)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(listed).toEqual([...FILED_DISPATCH_STATUSES, 'transmitting']);
  });
});

describe('replay (Rule 1)', () => {
  it('applying the migration again leaves its two triggers, once each, still guarding', async () => {
    await applySequenceRemovalGuard(h.pglite);
    const t = await q(`SELECT tgname FROM pg_trigger WHERE tgname IN ('ectd_sequences_removal_guard', 'ectd_sequences_removal_recorded') ORDER BY tgname`);
    expect(t.rows.map((r) => r.tgname)).toEqual(['ectd_sequences_removal_guard', 'ectd_sequences_removal_recorded']);
    const id = await sequence();
    expect((await tx(`UPDATE ectd_sequences SET deleted_at = now() WHERE id = ${id}`))?.message).toMatch(/^SEQUENCE_REMOVAL_UNRECORDED/);
  });
});
