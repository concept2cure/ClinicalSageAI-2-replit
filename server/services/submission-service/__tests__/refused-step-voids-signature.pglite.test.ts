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
import { readFileSync } from 'node:fs';

const holder = vi.hoisted(() => ({
  db: null as any,
  pglite: null as any,
  gate: { cleared: true, blockers: [] as string[] },
  gw: { configured: true, sent: [] as Array<Record<string, unknown>> },
  /** The applicant each transmitted package's us-regional backbone names. */
  applicants: [] as string[],
  failBlockedAudit: false,
}));

vi.mock('../../../db', async () => {
  const { makeRequestDbClient } = await import('../../../../tests/golden-journeys/harness');
  // Production callers pass both SQL strings and pg query configs. Reuse the
  // canonical PGlite adapter rather than sending a config object to its parser.
  const run = (textOrConfig: unknown, params?: unknown[]) => {
    if (holder.failBlockedAudit && String(textOrConfig).includes('INSERT INTO audit_logs') && params?.[3] === 'TRANSMIT_BLOCKED') {
      throw new Error('PRIVATE_AUDIT_FAILURE_CANARY');
    }
    return makeRequestDbClient(holder.pglite).query(textOrConfig, params);
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
    transmit: async (req: { metadata?: Record<string, unknown>; bundle?: { path?: string } }) => {
      holder.gw.sent.push(req.metadata ?? {});
      if (req.bundle?.path) {
        const { readFile } = await import('node:fs/promises');
        const JSZip = (await import('jszip')).default;
        const zip = await JSZip.loadAsync(await readFile(req.bundle.path));
        const regionalName = Object.keys(zip.files).find((f) => f.endsWith('us-regional.xml'));
        const regional = regionalName ? await zip.file(regionalName)!.async('string') : '';
        holder.applicants.push(/<company-name>([^<]*)</.exec(regional)?.[1] ?? '(none)');
      }
      return { transmittalId: 900 + holder.gw.sent.length, transmissionId: `T-${holder.gw.sent.length}`, status: 'submitted' };
    },
  }),
}));

import { createIndPgliteDb, AUDIT_LOGS_PGLITE_DDL, type IndPgliteDb } from '../../../db/pglite-harness';
import { ORG, USER, FREEZE_GATE_SEED_SQL, FREEZE_SPONSOR_ID, freezeGateHelpers } from './_freeze-gate-fixture';
import { freezeSequence, transmitSequence, precheckGovernedStep } from '../submission-service';
import { deriveGovernedTargetBinding, persistGovernedSignSignature, BINDING_BASIS } from '../../part11/signature-persistence';
import { recordGovernedAction } from '../../../routes/c2c/actions';

let h: IndPgliteDb;
const ctx = { organizationId: ORG, userId: USER };
const { sign, statusOf } = freezeGateHelpers(() => h);
const outcome = (p: Promise<unknown>) => p.then(() => null, (e: any) => e);
const PROGRAM = '0c000000-0000-4000-8000-0000000000c1';
// QA 2026-10-08 (j6): the application number a package names is the one its
// project records — submission 21's is IND-000061 — and the applicant is the
// organisation's recorded name.
const PROGRAM_61 = '0c000000-0000-4000-8000-0000000000c0';
const PROGRAM_UNNUMBERED = '0c000000-0000-4000-8000-0000000000c2';
const SPONSOR = 'Concept2Cure Therapeutics';

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
  h = await createIndPgliteDb({ submissionCore: true, leafSources: true, programSpine: true, shadowReview: true });
  holder.db = h.db;
  holder.pglite = h.pglite;
  await h.pglite.exec(AUDIT_LOGS_PGLITE_DDL);
  // The real audit service also writes this append-only store; console fallback
  // cannot stand in for the durable evidence a refused signature requires.
  await h.pglite.exec(readFileSync(new URL('../../../../db/migrations/20260813_audit_tamper_proof_log.sql', import.meta.url), 'utf8'));
  await h.pglite.exec(FREEZE_GATE_SEED_SQL);
  // Keep the existing minimal seeds, but exercise the real canonical ledger
  // and signature writer in the exact-byte case below. No password/MFA or
  // signer-authority ceremony is claimed by this component fixture.
  await h.pglite.exec(`
    CREATE TABLE IF NOT EXISTS users (id integer PRIMARY KEY,name text,email text,title text);
    CREATE TABLE IF NOT EXISTS organization_users (user_id integer,organization_id integer,role text);
    INSERT INTO users VALUES (${USER},'Fixture Package Reviewer','reviewer@example.test','Regulatory Reviewer');
    INSERT INTO organization_users VALUES (${USER},${ORG},'approver');
    ALTER TABLE c2c_ana_actions ADD COLUMN domain text,ADD COLUMN surface text,ADD COLUMN risk text,
      ADD COLUMN agentic_mode text,ADD COLUMN proposed_at timestamptz,ADD COLUMN decided_at timestamptz,
      ADD COLUMN decided_by integer,ADD COLUMN decision_reason text,ADD COLUMN executed_at timestamptz,
      ADD COLUMN audit_row_id text,ADD COLUMN idempotency_key text;
    ALTER TABLE electronic_signatures ADD COLUMN document_id integer,ADD COLUMN version_id integer,
      ADD COLUMN signature_type text,ADD COLUMN signature_purpose text,ADD COLUMN signature_level text,
      ADD COLUMN signer_id integer,ADD COLUMN signer_name text,ADD COLUMN signer_title text,ADD COLUMN signer_email text,
      ADD COLUMN authentication_method text,ADD COLUMN authentication_timestamp timestamptz,
      ADD COLUMN second_factor_verified boolean,ADD COLUMN signature_hash text,ADD COLUMN signature_meaning text,
      ADD COLUMN compliance_statement text,ADD COLUMN legal_disclaimer text,ADD COLUMN ip_address text,
      ADD COLUMN device_info text,ADD COLUMN signed_at timestamptz DEFAULT now();
  `);
  await h.pglite.query(`INSERT INTO organizations (id, name) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`, [ORG, SPONSOR]);
  await h.pglite.query(
    `INSERT INTO regulatory_programs (id, organization_id, name, code, program_type, product_name, application_number)
     VALUES ($1, $2, 'Program C', 'C-1', 'ind', 'Gamma', '123456'),
            ($3, $2, 'Program C0', 'C-0', 'ind', 'Gamma-0', '000061'),
            ($4, $2, 'Program C2', 'C-2', 'ind', 'Gamma-2', NULL)`,
    [PROGRAM, ORG, PROGRAM_61, PROGRAM_UNNUMBERED],
  );
  await h.pglite.exec(`
    UPDATE regulatory_programs SET applicant_sponsor_id = '${FREEZE_SPONSOR_ID}' WHERE id IN ('${PROGRAM}', '${PROGRAM_61}', '${PROGRAM_UNNUMBERED}');
    INSERT INTO submissions (id, title, application_type, client_type, primary_region, organization_id, created_by, program_id) VALUES
      (20, 'P-23 freeze', 'ind', 'biotech', 'fda', ${ORG}, ${USER}, '${PROGRAM}'),
      (21, 'P-23 transmit', 'ind', 'biotech', 'fda', ${ORG}, ${USER}, '${PROGRAM_61}'),
      (22, 'P-23 application number', 'ind', 'biotech', 'fda', ${ORG}, ${USER}, '${PROGRAM}'),
      (23, 'P-23 another signer', 'ind', 'biotech', 'fda', ${ORG}, ${USER}, NULL),
      (24, 'j6 no number recorded', 'ind', 'biotech', 'fda', ${ORG}, ${USER}, '${PROGRAM_UNNUMBERED}'),
      (25, 'j6 not anchored', 'ind', 'biotech', 'fda', ${ORG}, ${USER}, NULL),
      (26, 'j6 applicant', 'ind', 'biotech', 'fda', ${ORG}, ${USER}, '${PROGRAM}');
    INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by, status, dispatch_status) VALUES
      (60, 20, 'fda', '0000', ${ORG}, ${USER}, 'validated', NULL),
      (61, 21, 'fda', '0000', ${ORG}, ${USER}, 'dispatched', 'pending'),
      (62, 22, 'fda', '0000', ${ORG}, ${USER}, 'dispatched', 'pending'),
      (63, 23, 'fda', '0000', ${ORG}, ${USER}, 'validated', NULL),
      (64, 24, 'fda', '0000', ${ORG}, ${USER}, 'dispatched', 'pending'),
      (65, 25, 'fda', '0000', ${ORG}, ${USER}, 'dispatched', 'pending'),
      (66, 26, 'fda', '0000', ${ORG}, ${USER}, 'dispatched', 'pending');
    INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by) VALUES
      (60, 'm2.5', 'Clinical Overview', 'new', 'coauthor_documents', 200, ${ORG}, ${USER}),
      (61, 'm2.3', 'Quality Overall Summary', 'new', 'coauthor_documents', 202, ${ORG}, ${USER}),
      (62, 'm2.3', 'Quality Overall Summary', 'new', 'coauthor_documents', 202, ${ORG}, ${USER}),
      (63, 'm2.5', 'Clinical Overview', 'new', 'coauthor_documents', 200, ${ORG}, ${USER}),
      (64, 'm2.3', 'Quality Overall Summary', 'new', 'coauthor_documents', 202, ${ORG}, ${USER}),
      (65, 'm2.3', 'Quality Overall Summary', 'new', 'coauthor_documents', 202, ${ORG}, ${USER}),
      (66, 'm2.3', 'Quality Overall Summary', 'new', 'coauthor_documents', 202, ${ORG}, ${USER});
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
    const notSent = await transmitSequence({ sequenceId: 61, ctx, signatureActionId: given, environment: 'staging', applicationId: '000061' });
    expect(notSent).toMatchObject({ transmitted: false, reason: 'gateway_not_configured' });

    holder.gw.configured = true;
    const reused = await outcome(transmitSequence({ sequenceId: 61, ctx, signatureActionId: given, environment: 'staging', applicationId: '000061' }));
    expect(reused, 'a signature given for a transmit that sent nothing sent the package later').toMatchObject({
      code: 'GOVERNED_REQUIRED',
      message: expect.stringMatching(/given for a transmit the server refused, so it is void/),
    });
    expect(holder.gw.sent).toEqual([]);
    expect(notSent).toMatchObject({ signatureVoided: true });
    expect(await signatureRow(given)).toEqual({ is_valid: false, verification_status: 'voided' });
    expect((await rowsNaming(given)).filter(r => r.action === 'GOVERNED_SIGNATURE_VOIDED')).toHaveLength(1);
    expect((await rowsNaming(given)).filter(r => r.action === 'TRANSMIT_BLOCKED')).toHaveLength(2);

    const fresh = await sign(61, 'transmit');
    const sent = await transmitSequence({ sequenceId: 61, ctx, signatureActionId: fresh, environment: 'staging', applicationId: '000061' });
    expect(sent).toMatchObject({ transmitted: true, dispatchStatus: 'sent' });
    expect(holder.gw.sent).toHaveLength(1);
    expect(await signatureRow(fresh)).toEqual({ is_valid: true, verification_status: 'valid' });
  }, 120_000);
});

/** Real ledger + canonical signature persistence, with explicitly fixture-only authentication. */
async function approveFixturePackage(sequenceId: number): Promise<string> {
  const q = { query: (text: string, params?: unknown[]) => h.pglite.query(text, params) as Promise<{ rows: any[] }> };
  const target = `ectd-sequence:${sequenceId}`, payload = { meaning: 'approval', intent: 'transmit' };
  await q.query('BEGIN');
  try {
    const ledger = await recordGovernedAction(q, { orgId: ORG, userId: USER, command: 'sign', target,
      reason: 'Fixture reviewer approves this exact package manifest.', payload });
    await persistGovernedSignSignature(q, { orgId: ORG, userId: USER, target, ...ledger, payload,
      reason: 'Fixture reviewer approves this exact package manifest.', requiredBasis: BINDING_BASIS.ECTD_SEQUENCE_LEAF_MANIFEST,
      authenticationMethod: 'fixture_binding_only', secondFactorVerified: false, occurredAt: new Date() });
    await q.query('COMMIT');
    return ledger.actionId;
  } catch (error) { await q.query('ROLLBACK'); throw error; }
}

describe('an exact one-byte package change voids approval and durably blocks transmission', () => {
  it('retains the approved SHA and writes both canonical audit events with no package prose or wire call', async () => {
    holder.gw = { configured: true, sent: [] }; holder.gate = { cleared: true, blockers: [] };
    await h.pglite.query(`INSERT INTO ectd_sequences (id,submission_id,region,sequence_number,organization_id,created_by,status,dispatch_status)
      VALUES (67,20,'fda','0001',$1,$2,'dispatched','pending')`, [ORG, USER]);
    await h.pglite.query(`INSERT INTO submission_leaves (sequence_id,section_code,title,lifecycle_op,document_table,document_id,organization_id,created_by)
      VALUES (67,'m2.5','RESTRICTED_TITLE_CANARY_A','new','coauthor_documents',200,$1,$2)`, [ORG, USER]);
    const q = { query: (text: string, params?: unknown[]) => h.pglite.query(text, params) as Promise<{ rows: any[] }> };
    const before = await deriveGovernedTargetBinding(q, 'ectd-sequence:67', ORG), given = await approveFixturePackage(67);
    const rowBefore = (await q.query('SELECT signature_hash,signature_manifest,bound_payload_digest FROM electronic_signatures WHERE signature_manifest::jsonb->>\'actionId\'=$1', [given])).rows[0];
    await q.query("UPDATE submission_leaves SET title='RESTRICTED_TITLE_CANARY_B' WHERE sequence_id=67");
    const original = Buffer.from('RESTRICTED_TITLE_CANARY_A'), changed = Buffer.from('RESTRICTED_TITLE_CANARY_B');
    expect(original.length).toBe(changed.length); expect([...original].filter((byte, index) => byte !== changed[index])).toHaveLength(1);
    const after = await deriveGovernedTargetBinding(q, 'ectd-sequence:67', ORG);
    expect(after.digest).not.toBe(before.digest);
    expect(await outcome(transmitSequence({ sequenceId: 67, ctx, signatureActionId: given, environment: 'staging', applicationId: '123456' })))
      .toMatchObject({ code: 'GOVERNED_REQUIRED', message: expect.stringMatching(/sequence changed after it was signed/) });
    expect(holder.gw.sent).toEqual([]); expect(await statusOf(67)).toEqual({ status: 'dispatched', dispatch_status: 'pending' });
    expect(await signatureRow(given)).toEqual({ is_valid: false, verification_status: 'voided' });
    expect((await q.query('SELECT signature_hash,signature_manifest,bound_payload_digest FROM electronic_signatures WHERE signature_manifest::jsonb->>\'actionId\'=$1', [given])).rows[0]).toEqual(rowBefore);
    const records = await q.query(`SELECT tenant_id,user_id,action,new_values,sha256_chain FROM audit_logs
      WHERE table_name='ectd_sequence' AND record_id='67' AND new_values::jsonb->>'signatureActionId'=$1`, [given]);
    expect(records.rows.map(row => row.action).sort()).toEqual(['GOVERNED_SIGNATURE_VOIDED', 'TRANSMIT_BLOCKED']);
    const blocked = records.rows.find(row => row.action === 'TRANSMIT_BLOCKED')!;
    expect(blocked).toMatchObject({ tenant_id: ORG, user_id: USER, sha256_chain: expect.stringMatching(/^[a-f0-9]{64}$/),
      new_values: { programId: PROGRAM, approvedSha256: before.digest, currentSha256: after.digest,
        reasonCode: 'approved_package_changed', transmitted: false } });
    expect(JSON.stringify(records.rows)).not.toContain('RESTRICTED_TITLE_CANARY');
    expect((await q.query("SELECT action FROM audit_logs WHERE ana_action_id=$1", [given])).rows).toEqual([{ action: 'c2c.work.sign' }]);
  }, 120_000);
  it('keeps the release blocked and returns a static audit refusal when the chained blocked-event INSERT fails', async () => {
    holder.gw = { configured: true, sent: [] }; holder.gate = { cleared: true, blockers: [] };
    await h.pglite.query(`INSERT INTO ectd_sequences (id,submission_id,region,sequence_number,organization_id,created_by,status,dispatch_status)
      VALUES (68,20,'fda','0002',$1,$2,'dispatched','pending')`, [ORG, USER]);
    await h.pglite.query(`INSERT INTO submission_leaves (sequence_id,section_code,title,lifecycle_op,document_table,document_id,organization_id,created_by)
      VALUES (68,'m2.5','Package A','new','coauthor_documents',200,$1,$2)`, [ORG, USER]);
    const given = await approveFixturePackage(68);
    await h.pglite.query("UPDATE submission_leaves SET title='Package B' WHERE sequence_id=68");
    holder.failBlockedAudit = true;
    let failure: unknown;
    try { failure = await outcome(transmitSequence({ sequenceId: 68, ctx, signatureActionId: given, environment: 'staging', applicationId: '123456' })); }
    finally { holder.failBlockedAudit = false; }
    expect(failure).toMatchObject({ code: 'AUDIT_UNCONFIRMED', message: expect.stringMatching(/Transmission remains blocked/) });
    expect(String((failure as Error).message)).not.toContain('PRIVATE_AUDIT_FAILURE_CANARY');
    expect(holder.gw.sent).toEqual([]); expect(await statusOf(68)).toEqual({ status: 'dispatched', dispatch_status: 'pending' });
    expect(await signatureRow(given)).toEqual({ is_valid: false, verification_status: 'voided' });
    expect((await rowsNaming(given)).map(row => row.action)).toEqual(['GOVERNED_SIGNATURE_VOIDED']);
  }, 120_000);
});

describe('transmit checks the typed application number against the program record', () => {
  it('the precheck refuses a number that contradicts the record, before anyone signs', async () => {
    holder.gw = { configured: true, sent: [] };
    const pre = await precheckGovernedStep(62, 'transmit', ctx, { environment: 'staging', applicationId: '999999' });
    expect(pre.cleared).toBe(false);
    expect(pre.refusal).toMatch(/"999999" does not match the program's recorded application number "123456"/);
    const matching = await precheckGovernedStep(62, 'transmit', ctx, { environment: 'staging', applicationId: '123456' });
    expect(matching).toMatchObject({ cleared: true, refusal: null });
  }, 120_000);

  it('a contradicting number is refused 409, nothing is sent, and its signature is void; the recorded number transmits', async () => {
    holder.gw = { configured: true, sent: [] };
    const given = await sign(62, 'transmit');
    const refused = await outcome(transmitSequence({ sequenceId: 62, ctx, signatureActionId: given, environment: 'staging', applicationId: '999999' }));
    expect(refused, 'transmit sent a package under a number the program record contradicts').toMatchObject({
      code: 'APPLICATION_NUMBER_MISMATCH',
      message: expect.stringMatching(/"999999" does not match the program's recorded application number "123456"/),
    });
    expect(holder.gw.sent).toEqual([]);
    expect(await signatureRow(given)).toEqual({ is_valid: false, verification_status: 'voided' });
    expect((await statusOf(62)).dispatch_status).toBe('pending');

    const fresh = await sign(62, 'transmit');
    const sent = await transmitSequence({ sequenceId: 62, ctx, signatureActionId: fresh, environment: 'staging', applicationId: ' 123456 ' });
    expect(sent).toMatchObject({ transmitted: true });
    expect(holder.gw.sent).toEqual([expect.objectContaining({ applicationId: '123456' })]);
  }, 120_000);
});

/* QA 2026-10-08 (j6): the sequence transmit sent no sponsor name, so the
   package it would send named "UNASSIGNED (organization N)" as the applicant;
   and a project with no recorded number accepted any typed one. A package names
   the organisation's recorded name and ONLY the project's recorded number, or
   it is not sent — refused by name, before the gateway, its signature void. */
describe('transmit names the applicant and the application from the record', () => {
  it('the package sent names the organisation as the applicant, never a placeholder', async () => {
    holder.gw = { configured: true, sent: [] };
    holder.applicants = [];
    const given = await sign(66, 'transmit');
    const sent = await transmitSequence({ sequenceId: 66, ctx, signatureActionId: given, environment: 'staging', applicationId: '123456' });
    expect(sent).toMatchObject({ transmitted: true });
    expect(holder.applicants).toEqual([SPONSOR]);
  }, 120_000);

  it.each([
    [64, /its project records no agency application number/],
    [65, /not anchored to a project/],
  ])('sequence %i, with no recorded number: the precheck says so before anyone signs, and transmit is refused by name, nothing sent, its signature void', async (seqId, says) => {
    holder.gw = { configured: true, sent: [] };
    const pre = await precheckGovernedStep(seqId, 'transmit', ctx, { environment: 'staging', applicationId: 'IND-000064' });
    expect(pre.cleared).toBe(false);
    expect(pre.refusal).toMatch(says);
    const given = await sign(seqId, 'transmit');
    const refused = await outcome(
      transmitSequence({ sequenceId: seqId, ctx, signatureActionId: given, environment: 'staging', applicationId: 'IND-000064' }),
    );
    expect(refused, 'a package was sent under a number no record holds').toMatchObject({
      code: 'PACKAGE_IDENTITY_MISSING',
      message: expect.stringMatching(says),
    });
    expect(refused.message).toMatch(/Nothing was sent\./);
    expect(holder.gw.sent).toEqual([]);
    expect(await signatureRow(given)).toEqual({ is_valid: false, verification_status: 'voided' });
    expect((await statusOf(seqId)).dispatch_status).toBe('pending');
  }, 120_000);
});
