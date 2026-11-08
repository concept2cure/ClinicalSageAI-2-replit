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
 *
 * F1 (row D7, 2026-11-01): a send to the agency's test environment is not a
 * filing. The last describe drives the REAL transmit guard (getGateway, which
 * stamps what a sequence transmit carried and for which attempt) and stubs only
 * the FDA ESG gateway's own transmit, which writes the transmittal row the guard
 * handed it. A staging send leaves the sequence 'pending' and its 0000 holds
 * back no later sequence as filed; a staging failure after the wire releases the
 * claim and voids its signature; the production send of the same sequence, with
 * a fresh signature, files it, and the filed fold reads that send's leaves.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const holder = vi.hoisted(() => ({
  db: null as any,
  pglite: null as any,
  gate: { cleared: true, blockers: [] as string[] },
  gw: { configured: true, sent: [] as Array<Record<string, unknown>> },
  /** The applicant each transmitted package's us-regional backbone names. */
  applicants: [] as string[],
  failBlockedAudit: false,
  /** On: the signature void reaches neither record (its signature row and its GOVERNED_SIGNATURE_VOIDED row both fail). */
  failVoid: false,
  /** On: the chained ECTD_TRANSMITTED row that records a send's result fails, so recording it rolls back. */
  failTransmittedAudit: false,
  /** On: transmit goes through the REAL guard to the FDA ESG gateway, whose own transmit the case stubs. */
  realGuard: false,
}));

vi.mock('../../../db', async () => {
  const { makeRequestDbClient } = await import('../../../../tests/golden-journeys/harness');
  // Production callers pass both SQL strings and pg query configs. Reuse the
  // canonical PGlite adapter rather than sending a config object to its parser.
  const run = (textOrConfig: unknown, params?: unknown[]) => {
    if (holder.failBlockedAudit && String(textOrConfig).includes('INSERT INTO audit_logs') && params?.[3] === 'TRANSMIT_BLOCKED') {
      throw new Error('PRIVATE_AUDIT_FAILURE_CANARY');
    }
    if (holder.failVoid && (/UPDATE electronic_signatures\s+SET is_valid = false/.test(String(textOrConfig))
      || (String(textOrConfig).includes('INSERT INTO audit_logs') && params?.[3] === 'GOVERNED_SIGNATURE_VOIDED'))) {
      throw new Error('VOID_FAILURE_CANARY');
    }
    if (holder.failTransmittedAudit && String(textOrConfig).includes('INSERT INTO audit_logs') && params?.[3] === 'ECTD_TRANSMITTED') {
      throw new Error('TRANSMITTED_AUDIT_FAILURE_CANARY');
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
vi.mock('../../submission-gateways/index', async (orig) => {
  const real = await orig<Record<string, unknown> & { getGateway: (...a: unknown[]) => unknown }>();
  return {
  ...real,
  getGateway: (...args: unknown[]) => holder.realGuard ? real.getGateway(...args) : ({
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
  };
});
// The guard keeps the exact bytes before the wire (sent-package-archive.ts); in memory here.
vi.mock('../../storage', async () => (await import('../../submission-gateways/__tests__/sent-package-storage-stub')).storageModule);

import { createIndPgliteDb, AUDIT_LOGS_PGLITE_DDL, type IndPgliteDb } from '../../../db/pglite-harness';
import { ORG, USER, FREEZE_GATE_SEED_SQL, FREEZE_SPONSOR_ID, freezeGateHelpers } from './_freeze-gate-fixture';
import { freezeSequence, transmitSequence, precheckGovernedStep } from '../submission-service';
import { deriveGovernedTargetBinding, persistGovernedSignSignature, BINDING_BASIS } from '../../part11/signature-persistence';
import { recordGovernedAction } from '../../../routes/c2c/actions';
import { GatewayError } from '../../submission-gateways/types';
import { testSendHelpers, testSendSeedSql, AFTER_THE_WIRE } from './_test-send-fixture';

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
    -- The account a guarded send goes out under (gateway-accounts.ts); no row is the platform's.
    CREATE TABLE IF NOT EXISTS organization_gateway_accounts (organization_id INTEGER, region TEXT, gateway TEXT, environment TEXT,
      account_mode TEXT, sender_identifier TEXT, credentials_ciphertext TEXT, credential_fields JSONB, reason TEXT,
      updated_by INTEGER, updated_at TIMESTAMPTZ);
  `);
  await h.pglite.exec(testSendSeedSql(ORG, USER, PROGRAM));
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
    // F1 (D7): sent to the agency's test environment, so not filed: the
    // sequence stays 'pending' and can still be filed with the agency.
    expect(sent).toMatchObject({ transmitted: true, dispatchStatus: 'pending' });
    expect((await statusOf(61)).dispatch_status, 'a send to the test environment filed the sequence').toBe('pending');
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

/* F1 (row D7, 2026-11-01): a send to the agency's test environment is not a
   filing. The package spine already holds this (governed-transmit.ts
   recordTransmittedSequence, sweep F14: a non-production send records
   nothing); the sequence spine wrote 'sent' for a staging send, so the test
   send filed the very sequence production must file, every filed reader read
   it as on file, and resendRefusal refused the production send. These cases go
   through the REAL transmit guard; only the FDA ESG gateway's own transmit is
   stubbed, and it writes the transmittal row the guard handed it. */
const { stubEsgGateway, transmittalsOf, claimOf, filedState, voidContextOf, transmitTo } = testSendHelpers(() => h, ctx);
const resetTestSend = () => {
  holder.realGuard = false;
  vi.restoreAllMocks();
};

describe("a send to the agency's test environment is not a filing (F1, D7)", () => {
  afterEach(resetTestSend);

  it('a staging send leaves 0000 unfiled to every reader; a fresh signature files it in production, and the fold reads that send', async () => {
    holder.realGuard = true;
    const wire = stubEsgGateway();
    const testSig = await sign(167, 'transmit');
    const test = await transmitTo(167, testSig, 'staging');
    expect(test).toMatchObject({ transmitted: true, dispatchStatus: 'pending' });
    const [testRow] = await transmittalsOf(167);
    expect(testRow.metadata).toMatchObject({ environment: 'staging', dispatchBinding: { sequenceId: 167, signatureActionId: testSig } });
    // Only dispatch_status is written: the columns still name the attempt that went to the test environment.
    expect(await claimOf(167), 'a send to the test environment filed the sequence').toEqual({
      dispatch_status: 'pending', transmit_signature_action_id: testSig, transmit_attempt_id: testRow.metadata.dispatchBinding.attemptId,
    });

    // Not filed, to the fold and to the filing order: nothing is on file, and 0001, which files
    // the same document in the same section, still waits on 0000.
    const unfiled = await filedState(27);
    expect(unfiled.sequences.find((s) => s.sequenceNumber === '0000')).toEqual({ sequenceNumber: '0000', dispatchStatus: 'pending', filed: false, basis: null });
    expect(unfiled.leaves).toEqual([]);
    const held = await precheckGovernedStep(168, 'freeze', ctx);
    expect(held.refusal, 'a later sequence was judged against a test send as if it were on file').toMatch(/sequence 0000 is not yet filed/);

    // The test send spent its signature (P-23): it serves no filing.
    const reused = await outcome(transmitTo(167, testSig, 'production'));
    expect(reused).toMatchObject({ code: 'GOVERNED_REQUIRED', message: expect.stringMatching(/already authorized a governed transition/) });
    expect(wire).toHaveBeenCalledTimes(1);

    // The test send's record is made to differ, so which send the fold reads is visible.
    await h.pglite.query(`UPDATE submission_transmittals SET metadata = jsonb_set(metadata, '{leafManifest}', $2::jsonb) WHERE id = $1`, [
      testRow.id, JSON.stringify([{ ctdSection: '2.4', fileName: 'test-only.pdf', href: '0000/m2/24-nonclin-over/test-only.pdf', md5: 'f'.repeat(32), operation: 'new' }]),
    ]);

    const filingSig = await sign(167, 'transmit');
    const filing = await transmitTo(167, filingSig, 'production');
    expect(filing, 'the production send of a sequence that went to the test environment was refused').toMatchObject({ transmitted: true, dispatchStatus: 'sent' });
    const rows = await transmittalsOf(167);
    expect(rows).toHaveLength(2);
    const prod = rows[1];
    expect(prod.metadata).toMatchObject({ environment: 'production', dispatchBinding: { sequenceId: 167, signatureActionId: filingSig } });
    expect(prod.metadata.dispatchBinding.attemptId).not.toBe(testRow.metadata.dispatchBinding.attemptId);
    expect(await claimOf(167)).toEqual({ dispatch_status: 'sent', transmit_signature_action_id: filingSig, transmit_attempt_id: prod.metadata.dispatchBinding.attemptId });

    // The fold reads the PRODUCTION transmittal's leaves, never the test send's.
    const filed = await filedState(27);
    expect(filed.sequences.find((s) => s.sequenceNumber === '0000')).toEqual({ sequenceNumber: '0000', dispatchStatus: 'sent', filed: true, basis: 'transmit' });
    expect(prod.metadata.leafManifest.length).toBeGreaterThan(0);
    expect(filed.leaves.map((l) => [l.ctdSection, l.fileName])).toEqual(prod.metadata.leafManifest.map((l) => [l.ctdSection, l.fileName]));
    expect(filed.leaves.map((l) => l.fileName)).not.toContain('test-only.pdf');

    // Filed now: 0001 is no longer held back by 0000.
    expect((await precheckGovernedStep(168, 'freeze', ctx)).refusal ?? '').not.toMatch(/not yet filed/);

    // The record: one transmit row per send, each naming its environment, its own signature and
    // what it left the sequence at; the test send's says, in words, that it filed nothing.
    const transmits = await h.pglite.query(
      `SELECT new_values::jsonb ->> 'environment' AS environment, new_values::jsonb ->> 'signatureActionId' AS sig,
              new_values::jsonb ->> 'dispatchStatus' AS left_at, new_values::jsonb ->> 'testSend' AS test_send
         FROM audit_logs WHERE action = 'ECTD_TRANSMITTED' AND record_id = '167' ORDER BY occurred_at, id`,
    );
    expect(transmits.rows).toEqual([
      { environment: 'staging', sig: testSig, left_at: 'pending', test_send: expect.stringMatching(/A test send is not a filing/) },
      { environment: 'production', sig: filingSig, left_at: 'sent', test_send: null },
    ]);
  }, 120_000);

});

describe("a send that fails after the wire: a test send holds nothing, a production send stays held (F1, D7)", () => {
  afterEach(resetTestSend);

  it('a staging send that fails after the wire releases the claim and voids its signature; a fresh one files in production', async () => {
    holder.realGuard = true;
    stubEsgGateway('fails after the wire');
    const testSig = await sign(169, 'transmit');
    const failed = await outcome(transmitTo(169, testSig, 'staging'));
    expect(failed).toBeInstanceOf(GatewayError);
    // Released, not held: nothing a test environment holds is a filing.
    expect(await claimOf(169), 'a failed test send held the sequence').toEqual({ dispatch_status: 'pending', transmit_signature_action_id: null, transmit_attempt_id: null });
    expect(failed.message).toContain(AFTER_THE_WIRE);
    expect(failed.message, 'the person is not told the test send holds nothing').toMatch(/agency's test environment, which files nothing/);
    expect(failed.message).toMatch(/signature given for this transmit is now void/);
    // Void where every reader looks, and the void is the audit row of the attempt.
    expect(await signatureRow(testSig)).toEqual({ is_valid: false, verification_status: 'voided' });
    expect((await rowsNaming(testSig)).map((r) => [r.action, r.step])).toEqual([['GOVERNED_SIGNATURE_VOIDED', 'transmit']]);
    expect((await rowsNaming(testSig))[0].refusal).toContain(AFTER_THE_WIRE);
    // The void row says which send this was and that it filed nothing: a reviewer reading
    // "FDA may hold it" beside a released sequence sees it was the test environment.
    const [testRow] = await transmittalsOf(169);
    expect(await voidContextOf(testSig)).toEqual({
      environment: 'staging', transmit_attempt_id: testRow.metadata.dispatchBinding.attemptId,
      test_send: expect.stringMatching(/A test send is not a filing/),
    });

    // The signature the signer gave for a test send never files the sequence.
    vi.restoreAllMocks();
    const wire = stubEsgGateway();
    const reused = await outcome(transmitTo(169, testSig, 'production'));
    expect(reused, 'a test send signature was accepted for a filing').toMatchObject({
      code: 'GOVERNED_REQUIRED', message: expect.stringMatching(/given for a transmit the server refused, so it is void/),
    });
    expect(wire).not.toHaveBeenCalled();
    const filingSig = await sign(169, 'transmit');
    expect(await transmitTo(169, filingSig, 'production')).toMatchObject({ transmitted: true, dispatchStatus: 'sent' });
    expect((await claimOf(169)).dispatch_status).toBe('sent');
  }, 120_000);

  it('a production send that fails after the wire still holds the claim, and its signature is not voided', async () => {
    holder.realGuard = true;
    stubEsgGateway('fails after the wire');
    const filingSig = await sign(170, 'transmit');
    const failed = await outcome(transmitTo(170, filingSig, 'production'));
    expect(failed).toBeInstanceOf(GatewayError);
    expect(failed.message).not.toMatch(/test environment|now void/);
    const [row] = await transmittalsOf(170);
    // Unchanged: the agency may hold it, so a person resolves it (P-92 will settle it by a signed act).
    expect(await claimOf(170)).toEqual({ dispatch_status: 'transmitting', transmit_signature_action_id: filingSig, transmit_attempt_id: row.metadata.dispatchBinding.attemptId });
    expect(await signatureRow(filingSig)).toEqual({ is_valid: true, verification_status: 'valid' });
    expect(await rowsNaming(filingSig)).toEqual([]);
  }, 120_000);

});

describe('a test send whose void or record fails: the claim is released only once the signature is void (F1, D7, review 2026-11-08)', () => {
  afterEach(resetTestSend);

  it('a staging send that fails after the wire, whose signature cannot be voided, keeps its claim; that signature never files it', async () => {
    holder.realGuard = true;
    stubEsgGateway('fails after the wire');
    const testSig = await sign(171, 'transmit');
    holder.failVoid = true;
    let failed: any;
    try {
      failed = await outcome(transmitTo(171, testSig, 'staging'));
    } finally {
      holder.failVoid = false;
    }
    expect(failed).toBeInstanceOf(GatewayError);
    // The void reached no record, so the signature is still in force: the claim stays, as before F1.
    expect(await signatureRow(testSig)).toEqual({ is_valid: true, verification_status: 'valid' });
    expect(await rowsNaming(testSig)).toEqual([]);
    const [row] = await transmittalsOf(171);
    expect(await claimOf(171), 'a test send whose signature is still live released its claim').toEqual({
      dispatch_status: 'transmitting', transmit_signature_action_id: testSig, transmit_attempt_id: row.metadata.dispatchBinding.attemptId,
    });
    expect(failed.message).toMatch(/could not be marked void right now; do not reuse it/);
    expect(failed.message, 'the person was told the sequence is not held').not.toMatch(/the sequence is not held/);
    expect(failed.message).toMatch(/stays held as transmitting until a person resolves it/);

    // The live signature cannot take the sequence to production: the claim refuses it, and nothing is sent.
    vi.restoreAllMocks();
    const wire = stubEsgGateway();
    const reused = await outcome(transmitTo(171, testSig, 'production'));
    expect(reused, 'a test send signature filed the sequence').not.toMatchObject({ transmitted: true });
    expect(wire).not.toHaveBeenCalled();
    expect((await claimOf(171)).dispatch_status).toBe('transmitting');
  }, 120_000);

  it('a staging send the agency answered, whose result cannot be recorded, is released and its signature voided', async () => {
    holder.realGuard = true;
    stubEsgGateway();
    const testSig = await sign(172, 'transmit');
    holder.failTransmittedAudit = true;
    let failed: any;
    try {
      failed = await outcome(transmitTo(172, testSig, 'staging'));
    } finally {
      holder.failTransmittedAudit = false;
    }
    expect(String(failed?.message ?? failed)).toContain('TRANSMITTED_AUDIT_FAILURE_CANARY');
    // Recording rolled back, but a test send holds nothing: released, not left 'transmitting'.
    expect(await claimOf(172), 'a test send whose record failed held the sequence').toEqual({
      dispatch_status: 'pending', transmit_signature_action_id: null, transmit_attempt_id: null,
    });
    expect(failed.message).toMatch(/agency's test environment, which files nothing: the sequence is not held/);
    expect(await signatureRow(testSig)).toEqual({ is_valid: false, verification_status: 'voided' });
    expect((await rowsNaming(testSig)).map((r) => r.action)).toEqual(['GOVERNED_SIGNATURE_VOIDED']);
    const [row] = await transmittalsOf(172);
    expect(await voidContextOf(testSig)).toMatchObject({ environment: 'staging', transmit_attempt_id: row.metadata.dispatchBinding.attemptId });

    // A fresh signature files it in production.
    const filingSig = await sign(172, 'transmit');
    expect(await transmitTo(172, filingSig, 'production')).toMatchObject({ transmitted: true, dispatchStatus: 'sent' });
  }, 120_000);
});
