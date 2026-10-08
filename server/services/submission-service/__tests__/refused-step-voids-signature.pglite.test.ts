/**
 * A signature serves only the act it was given for (P-23, docs/LAUNCH_DEFINITION_OF_DONE.md, 2026-10-08).
 *
 * A signature collected for a freeze, dispatch or transmit that the server then
 * refuses is void, and it is never reused when the gate later clears. The QA walk
 * of 2026-10-08 (j6, docs/evidence/QA-2026-10-08/submission-center/) recorded a
 * freeze signature for a freeze the server refused at its dispatch gate. Nothing
 * spent it: the single-use check in Gate 1 reads the audit row a PERFORMED
 * transition writes, and a refused one writes none. Once the gate cleared, that
 * signature — given while the gate refused — would have frozen the sequence.
 *
 * Transmit also checks a typed application number against the program's
 * recorded one, as the eCTD export already does (assemble-from-core
 * exportApplicationId), and the precheck asks the same rule before anyone signs.
 *
 * Over PGlite with the REAL freezeSequence / transmitSequence / precheckGovernedStep,
 * the real Gate 1, the real assembler and the real chained audit writer. Only
 * the readiness assessor (so the gate can block, then clear) and the agency
 * gateway (so nothing leaves the process) are stubbed.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const holder = vi.hoisted(() => ({
  db: null as any,
  pglite: null as any,
  gate: { cleared: true, blockers: [] as string[] },
  gw: { configured: true, sent: [] as Array<Record<string, unknown>> },
}));

vi.mock('../../../db', () => {
  const run = async (sql: string, params?: unknown[]) => {
    const r = await holder.pglite.query(sql, params);
    return { ...r, rowCount: r.affectedRows ?? r.rows.length };
  };
  return {
    get db() { return holder.db; },
    pool: { query: run, connect: async () => ({ query: run, release: () => {} }) },
  };
});
vi.mock('../../ectd/assess-dispatch-readiness', () => ({
  assessSequenceDispatchReadiness: async () => {
    const verdict = { cleared: holder.gate.cleared, blockers: [...holder.gate.blockers] };
    return {
      gate: verdict, freezeGate: verdict, dispatchGateOnSigning: verdict,
      validationErrors: 0, unacknowledgedShadowCriticals: holder.gate.cleared ? 0 : 1,
    };
  },
}));
vi.mock('../../submission-gateways/index', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getGateway: () => ({
    isConfigured: async () => holder.gw.configured,
    transmit: async (req: { metadata?: Record<string, unknown> }) => {
      holder.gw.sent.push(req.metadata ?? {});
      return { transmittalId: 900 + holder.gw.sent.length, transmissionId: `T-${holder.gw.sent.length}`, status: 'submitted' };
    },
  }),
}));

import { createIndPgliteDb, AUDIT_LOGS_PGLITE_DDL, type IndPgliteDb } from '../../../db/pglite-harness';
import { ORG, USER, FREEZE_GATE_SEED_SQL, freezeGateHelpers } from './_freeze-gate-fixture';
import { freezeSequence, transmitSequence, precheckGovernedStep } from '../submission-service';

let h: IndPgliteDb;
const ctx = { organizationId: ORG, userId: USER };
const { sign, statusOf } = freezeGateHelpers(() => h);
const outcome = (p: Promise<unknown>) => p.then(() => null, (e: any) => e);
const PROGRAM = '0c000000-0000-4000-8000-0000000000c1';

const BLOCKED = 'Shadow Review: 1 unacknowledged critical finding.';

/** The electronic_signatures row a sign action persisted. */
const signatureRow = async (actionId: string) =>
  (await h.pglite.query(
    `SELECT is_valid, verification_status FROM electronic_signatures WHERE (signature_manifest::jsonb ->> 'actionId') = $1`,
    [actionId],
  )).rows[0] as { is_valid: boolean; verification_status: string };

/** The audit rows that name a signature, by action. */
const rowsNaming = async (actionId: string) =>
  (await h.pglite.query(
    `SELECT action, record_id, new_values::jsonb ->> 'step' AS step, new_values::jsonb ->> 'refusal' AS refusal
       FROM audit_logs WHERE (new_values::jsonb ->> 'signatureActionId') = $1 ORDER BY occurred_at, id`,
    [actionId],
  )).rows as Array<{ action: string; record_id: string; step: string | null; refusal: string | null }>;

beforeAll(async () => {
  h = await createIndPgliteDb({ submissionCore: true, leafSources: true, programSpine: true });
  holder.db = h.db;
  holder.pglite = h.pglite;
  await h.pglite.exec(AUDIT_LOGS_PGLITE_DDL);
  await h.pglite.exec(FREEZE_GATE_SEED_SQL);
  await h.pglite.query(
    `INSERT INTO regulatory_programs (id, organization_id, name, code, program_type, product_name, application_number)
     VALUES ($1, $2, 'Program C', 'C-1', 'ind', 'Gamma', 'IND-123456')`,
    [PROGRAM, ORG],
  );
  await h.pglite.exec(`
    INSERT INTO submissions (id, title, application_type, client_type, primary_region, organization_id, created_by, program_id) VALUES
      (20, 'P-23 freeze', 'ind', 'biotech', 'fda', ${ORG}, ${USER}, NULL),
      (21, 'P-23 transmit', 'ind', 'biotech', 'fda', ${ORG}, ${USER}, NULL),
      (22, 'P-23 application number', 'ind', 'biotech', 'fda', ${ORG}, ${USER}, '${PROGRAM}'),
      (23, 'P-23 another signer', 'ind', 'biotech', 'fda', ${ORG}, ${USER}, NULL);
    INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by, status, dispatch_status) VALUES
      (60, 20, 'fda', '0000', ${ORG}, ${USER}, 'validated', NULL),
      (61, 21, 'fda', '0000', ${ORG}, ${USER}, 'dispatched', 'pending'),
      (62, 22, 'fda', '0000', ${ORG}, ${USER}, 'dispatched', 'pending'),
      (63, 23, 'fda', '0000', ${ORG}, ${USER}, 'validated', NULL);
    INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by) VALUES
      (60, 'm2.5', 'Clinical Overview', 'new', 'coauthor_documents', 200, ${ORG}, ${USER}),
      (61, 'm2.3', 'Quality Overall Summary', 'new', 'coauthor_documents', 202, ${ORG}, ${USER}),
      (62, 'm2.3', 'Quality Overall Summary', 'new', 'coauthor_documents', 202, ${ORG}, ${USER}),
      (63, 'm2.5', 'Clinical Overview', 'new', 'coauthor_documents', 200, ${ORG}, ${USER});
  `);
}, 120_000);
afterAll(async () => { await h.close(); });

describe('a refused freeze voids the signature given for it', () => {
  it('refused at its gate, the signature is void; once the gate clears it is refused, and a fresh one freezes', async () => {
    holder.gate = { cleared: false, blockers: [BLOCKED] };
    const given = await sign(60, 'freeze');
    const refused = await outcome(freezeSequence(60, ctx, given));
    expect(refused).toMatchObject({ code: 'DISPATCH_BLOCKED', message: expect.stringContaining(BLOCKED) });

    // The gate clears. The signature given while it refused does not serve the
    // freeze now: P-23.
    holder.gate = { cleared: true, blockers: [] };
    const reused = await outcome(freezeSequence(60, ctx, given));
    expect(reused, 'a signature given for a refused freeze froze the sequence later').toMatchObject({
      code: 'GOVERNED_REQUIRED',
      message: expect.stringMatching(/given for a freeze the server refused, so it is void/),
    });
    expect((await statusOf(60)).status).toBe('validated');
    expect(refused.message, 'the refusal does not tell the signer their signature is spent').toMatch(/signature given for this freeze is now void/);

    // Taken out of force where every reader looks (isSignatureWithdrawn), with
    // the content it attested left as it was; and the void is on the ledger.
    expect(await signatureRow(given)).toEqual({ is_valid: false, verification_status: 'voided' });
    // The void is on the ledger, once: a refusal of a signature that is
    // already void records nothing more.
    expect(await rowsNaming(given)).toEqual([
      { action: 'GOVERNED_SIGNATURE_VOIDED', record_id: '60', step: 'freeze', refusal: expect.stringContaining(BLOCKED) },
    ]);

    const fresh = await sign(60, 'freeze');
    await freezeSequence(60, ctx, fresh);
    expect((await statusOf(60)).status).toBe('frozen');
    expect(await signatureRow(fresh)).toEqual({ is_valid: true, verification_status: 'valid' });
    expect((await rowsNaming(fresh)).map((r) => r.action)).toEqual(['SEQUENCE_FROZEN']);
  }, 120_000);

  it('a signature someone else names is not theirs to void', async () => {
    holder.gate = { cleared: false, blockers: [BLOCKED] };
    const mine = await sign(63, 'freeze');
    const other = { organizationId: ORG, userId: USER + 100 };
    const refused = await outcome(freezeSequence(63, other, mine));
    expect(refused).toMatchObject({ code: 'GOVERNED_REQUIRED', message: expect.stringMatching(/no executed sign action on this sequence by this actor/) });
    expect(refused.message).not.toMatch(/void/);
    expect(await signatureRow(mine)).toEqual({ is_valid: true, verification_status: 'valid' });
    expect(await rowsNaming(mine)).toEqual([]);
    holder.gate = { cleared: true, blockers: [] };
  }, 120_000);
});

describe('a transmit that sent nothing voids the signature given for it', () => {
  it('with no gateway credentials nothing is sent and the signature is void; once credentials exist it is refused, and a fresh one transmits', async () => {
    holder.gw = { configured: false, sent: [] };
    const given = await sign(61, 'transmit');
    const notSent = await transmitSequence({ sequenceId: 61, ctx, signatureActionId: given, environment: 'staging', applicationId: 'IND-000061' });
    expect(notSent).toMatchObject({ transmitted: false, reason: 'gateway_not_configured' });

    holder.gw.configured = true;
    const reused = await outcome(transmitSequence({ sequenceId: 61, ctx, signatureActionId: given, environment: 'staging', applicationId: 'IND-000061' }));
    expect(reused, 'a signature given for a transmit that sent nothing sent the package later').toMatchObject({
      code: 'GOVERNED_REQUIRED',
      message: expect.stringMatching(/given for a transmit the server refused, so it is void/),
    });
    expect(holder.gw.sent).toEqual([]);
    expect(notSent).toMatchObject({ signatureVoided: true });
    expect(await signatureRow(given)).toEqual({ is_valid: false, verification_status: 'voided' });
    expect((await rowsNaming(given)).map((r) => [r.action, r.step])).toEqual([['GOVERNED_SIGNATURE_VOIDED', 'transmit']]);

    const fresh = await sign(61, 'transmit');
    const sent = await transmitSequence({ sequenceId: 61, ctx, signatureActionId: fresh, environment: 'staging', applicationId: 'IND-000061' });
    expect(sent).toMatchObject({ transmitted: true, dispatchStatus: 'sent' });
    expect(holder.gw.sent).toHaveLength(1);
    expect(await signatureRow(fresh)).toEqual({ is_valid: true, verification_status: 'valid' });
  }, 120_000);
});

describe('transmit checks the typed application number against the program record', () => {
  it('the precheck refuses a number that contradicts the record, before anyone signs', async () => {
    holder.gw = { configured: true, sent: [] };
    const pre = await precheckGovernedStep(62, 'transmit', ctx, { environment: 'staging', applicationId: 'IND-999999' });
    expect(pre.cleared).toBe(false);
    expect(pre.refusal).toMatch(/"IND-999999" does not match the program's recorded application number "IND-123456"/);
    const matching = await precheckGovernedStep(62, 'transmit', ctx, { environment: 'staging', applicationId: 'IND-123456' });
    expect(matching).toMatchObject({ cleared: true, refusal: null });
  }, 120_000);

  it('a contradicting number is refused 409, nothing is sent, and its signature is void; the recorded number transmits', async () => {
    holder.gw = { configured: true, sent: [] };
    const given = await sign(62, 'transmit');
    const refused = await outcome(transmitSequence({ sequenceId: 62, ctx, signatureActionId: given, environment: 'staging', applicationId: 'IND-999999' }));
    expect(refused, 'transmit sent a package under a number the program record contradicts').toMatchObject({
      code: 'APPLICATION_NUMBER_MISMATCH',
      message: expect.stringMatching(/"IND-999999" does not match the program's recorded application number "IND-123456"/),
    });
    expect(holder.gw.sent).toEqual([]);
    expect(await signatureRow(given)).toEqual({ is_valid: false, verification_status: 'voided' });
    expect((await statusOf(62)).dispatch_status).toBe('pending');

    const fresh = await sign(62, 'transmit');
    const sent = await transmitSequence({ sequenceId: 62, ctx, signatureActionId: fresh, environment: 'staging', applicationId: ' IND-123456 ' });
    expect(sent).toMatchObject({ transmitted: true });
    expect(holder.gw.sent).toEqual([expect.objectContaining({ applicationId: 'IND-123456' })]);
  }, 120_000);
});
