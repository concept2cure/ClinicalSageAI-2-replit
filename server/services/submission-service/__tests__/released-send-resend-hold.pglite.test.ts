/**
 * P-92 §3.3 (P-108 1(c)): a production send released as not received, which FDA's verified receipt then shows it
 * received, is not sent again until that is settled.
 *
 * The release and FDA's late receipt are written here as the settlement and the receipt path leave them;
 * held-send-settlement.pglite.test.ts and fda-esg-receipts.pglite.test.ts prove those acts. Here the transmit readiness
 * reads them before anyone signs, and the REAL transmit's claim reads them again under the sequence lock: it is the
 * only check the transmit itself makes. Before these cases no test reached either call (the mutation runs of
 * docs/evidence/D7-HELD-SEND-SETTLEMENT/2026-11-09/03-mutations, M26 and M27).
 *
 * The pattern is launch-sequence-size.pglite.test.ts's: real PGlite and the real assembler over the freeze-gate seed,
 * with the readiness gate cleared and the gateway configured, so the only thing the cases vary is the release.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ db: null as any, pglite: null as any, sent: 0 }));
vi.mock('../../../db', () => {
  const query = async (raw: string | { text: string; values?: unknown[] }, params?: unknown[]) => {
    const text = typeof raw === 'string' ? raw : raw.text;
    const values = params ?? (typeof raw === 'string' ? undefined : raw.values);
    const result = await h.pglite.query(text, values);
    return { ...result, rowCount: result.affectedRows ?? result.rows.length };
  };
  return { get db() { return h.db; }, pool: { query, connect: async () => ({ query, release: () => undefined }) } };
});
vi.mock('../../ectd/assess-dispatch-readiness', () => {
  const clear = { cleared: true, blockers: [] as string[] };
  return { assessSequenceDispatchReadiness: async () => ({
    gate: clear, freezeGate: clear, dispatchGateOnSigning: clear, validationErrors: 0, unacknowledgedShadowCriticals: 0,
  }) };
});
// Every route is configured and its transport available; a send that reached the gateway would be counted.
vi.mock('../../submission-gateways/index', async (original) => ({
  ...await original<object>(),
  getGateway: () => ({ isConfigured: async () => true, transmit: async () => { h.sent += 1; throw new Error('the gateway was reached'); } }),
  gatewayTransportReadiness: async () => ({ implementation: 'available', reason: null }),
}));

import { createIndPgliteDb, AUDIT_LOGS_PGLITE_DDL, type IndPgliteDb } from '../../../db/pglite-harness';
import { FREEZE_GATE_SEED_SQL, FREEZE_PROGRAM_ID, ORG, USER, freezeGateHelpers } from './_freeze-gate-fixture';
import { precheckGovernedStep, transmitSequence } from '../submission-service';

const ctx = { organizationId: ORG, userId: USER };
let db: IndPgliteDb;
let nextId = 9400;
const q = (text: string, params?: unknown[]) => db.pglite.query(text, params) as Promise<{ rows: any[] }>;
const { sign } = freezeGateHelpers(() => db);
const outcome = (p: Promise<unknown>) => p.then(() => null, (e: any) => e);
const HELD = "FDA's signed receipt shows it already received sequence 0000's send of 3 November 2026 at 14:05 UTC, which was released as not received. Sequence 0000 is not sent again.";

/** A dispatched FDA sequence of its own submission whose production send was released as not received; with
 *  `contradicted`, FDA's verified receipt for that send is kept against the release. */
async function released(contradicted: boolean): Promise<number> {
  const id = nextId++;
  await q(`INSERT INTO submissions (id, title, application_type, client_type, primary_region, organization_id, created_by, program_id, application_number)
    VALUES ($1, 'P-92 released send', 'ind', 'pharma', 'fda', $2, $3, $4, '123456')`, [id, ORG, USER, FREEZE_PROGRAM_ID]);
  await q(`INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by, status, dispatch_status, frozen_at)
    VALUES ($1, $1, 'fda', '0000', $2, $3, 'dispatched', 'pending', '2026-10-01T12:00:00Z')`, [id, ORG, USER]);
  await q(`INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by)
    VALUES ($1, 'm2.5', 'Clinical Overview', 'new', 'coauthor_documents', 200, $2, $3)`, [id, ORG, USER]);
  const settlement = { outcome: 'not-received', kind: 'fda-non-receipt-confirmation', verified: false, settledAt: '2026-11-04T09:00:00.000Z',
    signatureActionId: 'act_settlement', sequenceNumber: '0000', sentAt: '2026-11-03T14:05:00.000Z' };
  const kept = contradicted ? [{ sha256: 'd'.repeat(64), verified: true, status: 'received', source: 'agency-signed-upload', contradicts: 'not-received' }] : [];
  await q(`INSERT INTO submission_transmittals (organization_id, region, metadata) VALUES ($1, 'fda', $2::jsonb)`, [ORG, JSON.stringify({
    environment: 'production', heldSendSettlement: settlement, as2ReceiptHistory: kept,
    dispatchBinding: { organizationId: ORG, sequenceId: id, signatureActionId: 'act_first_send', attemptId: '0b000000-0000-4000-8000-0000000000f1', bundleSha256: 'c'.repeat(64) },
  })]);
  return id;
}

beforeAll(async () => {
  db = await createIndPgliteDb({ submissionCore: true, leafSources: true, programSpine: true, shadowReview: true });
  h.db = db.db; h.pglite = db.pglite;
  await db.pglite.exec(AUDIT_LOGS_PGLITE_DDL);
  await db.pglite.exec(FREEZE_GATE_SEED_SQL);
  await q('ALTER TABLE submissions ADD COLUMN IF NOT EXISTS application_number TEXT');
}, 120_000);
afterAll(async () => { await db?.close(); });

describe("a send released as not received that FDA's receipt shows it received is not sent again (P-92 §3.3)", () => {
  it('the transmit precheck says so before anyone signs; a release FDA has not contradicted is not held', async () => {
    const held = await released(true);
    expect((await precheckGovernedStep(held, 'transmit', ctx, { environment: 'production', applicationId: '123456' })).refusal).toContain(HELD);
    const free = await released(false);
    expect((await precheckGovernedStep(free, 'transmit', ctx, { environment: 'production', applicationId: '123456' })).refusal ?? '').not.toMatch(/released as not received/);
  }, 120_000);

  it('a transmit signed anyway is refused at the claim: nothing is claimed or sent, and its signature is void', async () => {
    const id = await released(true);
    const given = await sign(id, 'transmit', 'approval', { environment: 'production' });
    const refused = await outcome(transmitSequence({ sequenceId: id, ctx, signatureActionId: given, environment: 'production', applicationId: '123456' }));
    expect(refused).toMatchObject({ code: 'DISPATCH_BLOCKED', message: expect.stringContaining(HELD) });
    expect(h.sent).toBe(0);
    expect((await q('SELECT status, dispatch_status, transmit_signature_action_id FROM ectd_sequences WHERE id = $1', [id])).rows[0])
      .toEqual({ status: 'dispatched', dispatch_status: 'pending', transmit_signature_action_id: null });
    expect((await q(`SELECT is_valid, verification_status FROM electronic_signatures WHERE (signature_manifest::jsonb ->> 'actionId') = $1`, [given])).rows[0])
      .toEqual({ is_valid: false, verification_status: 'voided' });
  }, 120_000);
});
