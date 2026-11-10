/**
 * P-92 (founder, 2026-11-02, "Allow both"; amended by P-108 1(b), 2026-11-08): a held FDA send is settled by a signed
 * act, either way. Recorded as received on FDA's Ack2 or Ack3, kept in the project's Vault; or released as not
 * received, on FDA's written confirmation, or on the platform's own proof that nothing left (E9: a bound AS2
 * transmittal with no AS2 identity; E9′: a bound legacy SFTP row, the coordinating session's B1 ruling).
 * Design: docs/evidence/RIM/2026-11-08-designs/p92-settle-held-fda-send.design.md, §3, §5 C1, §10.3, §10.4.
 *
 * The real precheck and act over the freeze-gate fixture, on PGlite. Every transmittal row is shaped as the gateway
 * writes it (fda-esg.ts:326-345, :668, :681, :687): an AS2 hold carries metadata.as2 { messageId, mic, environment },
 * and its transmission_id is the reply's identifier, deliberately different from the message ID.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const holder = vi.hoisted(() => ({ db: null as any, pglite: null as any }));
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

import { createIndPgliteDb, AUDIT_LOGS_PGLITE_DDL, applySequenceRemovalGuard, type IndPgliteDb } from '../../../db/pglite-harness';
import { ORG, USER, FREEZE_GATE_SEED_SQL, FREEZE_PROGRAM_ID, freezeGateHelpers } from './_freeze-gate-fixture';
import { precheckHeldSendSettlement, settleHeldSend, retireSequence, type HeldSendChoice } from '../submission-service';
import { retirementStatement } from '../filed-sequence-baseline';

let h: IndPgliteDb;
const ctx = { organizationId: ORG, userId: USER };
const AUTHOR = 4; // The sequence's creator: never its settler (separation of duties).
const OTHER_PROGRAM = '99999999-9999-4999-8999-999999999999';
const { sign } = freezeGateHelpers(() => h);
const q = (text: string, params?: unknown[]) => h.pglite.query(text, params) as Promise<{ rows: any[] }>;
const outcome = (p: Promise<unknown>) => p.then(() => null, (e: any) => e);
const REASON = 'FDA confirmed the outcome of this send in writing.';
const SHA = 'c'.repeat(64);

type HeldOpts = {
  transport?: 'as2' | 'sftp'; status?: string; as2Identity?: boolean; environment?: string | null; errorMessage?: string | null;
  recent?: boolean; httpStatus?: number | null; transmissionId?: string | null; verifiedReceipt?: 'received' | 'rejected';
  bound?: boolean; dispatchStatus?: string; submissionProgram?: string | null; twin?: boolean; bundleSizeBytes?: number;
};
let nextId = 9700;
const uuid = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
/** A sequence whose production send to FDA is held, with the transmittal the gateway left. */
async function held(opts: HeldOpts = {}) {
  const id = nextId++;
  const submissionId = id;
  const program = opts.submissionProgram === undefined ? FREEZE_PROGRAM_ID : opts.submissionProgram;
  await q(`INSERT INTO submissions (id, title, application_type, client_type, primary_region, organization_id, created_by, program_id)
           VALUES ($1, 'P-92 held send', 'ind', 'biotech', 'fda', ${ORG}, ${AUTHOR}, $2)`, [submissionId, program]);
  await q(`INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by, status, dispatch_status)
           VALUES ($1, $2, 'fda', '0000', ${ORG}, ${AUTHOR}, 'dispatched', 'pending')`, [id, submissionId]);
  const S = await sign(id, 'transmit', 'release', { environment: 'production' });
  const A = uuid(id);
  await q(`UPDATE ectd_sequences SET dispatch_status = $2, transmit_signature_action_id = $3, transmit_attempt_id = $4::uuid WHERE id = $1`,
    [id, opts.dispatchStatus ?? 'transmitting', S, A]);
  const messageId = `<msg-${id}@sponsor.example>`;
  const metadata: Record<string, unknown> = {
    ...(opts.environment === null ? {} : { environment: opts.environment ?? 'production' }),
    ...(opts.bound === false ? {} : { dispatchBinding: { organizationId: ORG, sequenceId: id, signatureActionId: S, attemptId: A, bundleSha256: SHA } }),
    ...((opts.as2Identity ?? (opts.transport ?? 'as2') === 'as2') ? { as2: { messageId, mic: 'mic==', environment: opts.environment ?? 'production' } } : {}),
    ...(opts.verifiedReceipt ? { as2Receipt: { verified: true, status: opts.verifiedReceipt, sha256: 'd'.repeat(64) } } : {}),
    leafManifest: [{ ctdSection: 'm2.3', fileName: 'qos.pdf', href: 'm2/qos.pdf', md5: 'e'.repeat(32), operation: 'new' }],
  };
  const insert = async () => (await q(`INSERT INTO submission_transmittals (organization_id, region, gateway, transport, status, metadata, bundle_sha256,
      transmission_id, error_message, http_status, submitted_at, updated_at, bundle_size_bytes)
    VALUES (${ORG}, 'fda', 'esg', $1, $2, $3::jsonb, $4, $5, $6, $7, now() - interval '3 days', now() - $8::interval, $9) RETURNING id`,
  [opts.transport ?? 'as2', opts.status ?? 'in_transit', JSON.stringify(metadata), SHA,
    opts.transmissionId === undefined ? `<reply-${id}@intermediary>` : opts.transmissionId,
    opts.errorMessage === undefined ? 'FDA ESG AS2 returned HTTP 502 after the whole bundle was sent; FDA may hold it.' : opts.errorMessage,
    opts.httpStatus ?? null, opts.recent ? '1 minute' : '2 days', opts.bundleSizeBytes ?? 1024])).rows[0].id as number;
  const transmittalId = await insert();
  if (opts.twin) await insert();
  return { id, submissionId, S, A, transmittalId, messageId };
}
/** A retained document in a project's Vault: by default this project's, recorded after the send. */
async function vaultDoc(opts: { org?: number; program?: string; createdAgo?: string; hash?: string } = {}) {
  const id = `b0000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}`;
  const hash = opts.hash ?? `${String(nextId).padStart(4, '0')}${'f'.repeat(60)}`;
  await q(`INSERT INTO vault.documents (id, organization_id, program_id, content_hash, created_by, created_at)
           VALUES ($1::uuid, $2, $3::uuid, $4, ${USER}, now() - $5::interval)`,
  [id, opts.org ?? ORG, opts.program ?? FREEZE_PROGRAM_ID, hash, opts.createdAgo ?? '1 day']);
  return { id, hash };
}
type Choice = { outcome: 'received' | 'not-received'; evidenceKind: string; evidenceDocumentId?: string };
/** The settlement signature, signed over what the precheck answered (as the dialog does), with the signer's reason. */
async function settleSig(seq: number, choice: Choice, payload: Record<string, unknown> = {}, meaning = 'responsibility') {
  const answer = await precheckHeldSendSettlement(seq, ctx, choice as HeldSendChoice);
  expect(answer.cleared, String(answer.refusal)).toBe(true);
  const hs = answer.heldSend!;
  const id = await sign(seq, 'held-send-settlement', meaning, {
    outcome: choice.outcome, transmittalId: hs.transmittalId, transmitAttemptId: hs.attemptId,
    evidence: hs.evidence, statement: hs.statement, ...payload,
  });
  await q(`UPDATE electronic_signatures SET signature_purpose = $2 WHERE (signature_manifest::jsonb ->> 'actionId') = $1`, [id, REASON]);
  return { id, statement: hs.statement as string };
}
const seqRow = async (id: number) =>
  (await q(`SELECT status, dispatch_status, transmit_signature_action_id AS s, transmit_attempt_id::text AS a FROM ectd_sequences WHERE id = $1`, [id])).rows[0];
const transmittal = async (id: number) => (await q(`SELECT status, metadata, error_message, transmission_id FROM submission_transmittals WHERE id = $1`, [id])).rows[0];
const auditOf = async (seq: number, action: string) =>
  (await q(`SELECT reason, new_values::jsonb AS v FROM audit_logs WHERE table_name = 'ectd_sequence' AND record_id = $1 AND action = $2 ORDER BY id`, [String(seq), action])).rows;
const voided = async (sig: string) =>
  (await q(`SELECT 1 FROM audit_logs WHERE action = 'GOVERNED_SIGNATURE_VOIDED' AND new_values::jsonb ->> 'signatureActionId' = $1`, [sig])).rows.length > 0;

beforeAll(async () => {
  h = await createIndPgliteDb({ submissionCore: true, leafSources: true, programSpine: true });
  holder.db = h.db;
  holder.pglite = h.pglite;
  await h.pglite.exec(AUDIT_LOGS_PGLITE_DDL);
  await h.pglite.exec(FREEZE_GATE_SEED_SQL);
  await h.pglite.exec(`
    ALTER TABLE electronic_signatures ADD COLUMN IF NOT EXISTS signer_name TEXT, ADD COLUMN IF NOT EXISTS signed_at TIMESTAMP DEFAULT now(),
      ADD COLUMN IF NOT EXISTS signature_purpose TEXT;
    -- The real transmittal table's columns (migrations/20260509_submission_gateways.sql and its successors).
    ALTER TABLE submission_transmittals ADD COLUMN IF NOT EXISTS package_id INTEGER, ADD COLUMN IF NOT EXISTS program_id UUID,
      ADD COLUMN IF NOT EXISTS gateway TEXT, ADD COLUMN IF NOT EXISTS transport TEXT, ADD COLUMN IF NOT EXISTS status TEXT,
      ADD COLUMN IF NOT EXISTS bundle_sha256 TEXT, ADD COLUMN IF NOT EXISTS bundle_size_bytes BIGINT, ADD COLUMN IF NOT EXISTS transmission_id TEXT, ADD COLUMN IF NOT EXISTS error_message TEXT,
      ADD COLUMN IF NOT EXISTS error_class TEXT, ADD COLUMN IF NOT EXISTS http_status INTEGER, ADD COLUMN IF NOT EXISTS mdn_raw TEXT,
      ADD COLUMN IF NOT EXISTS ack_received_at TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now(), ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
    -- The project's Vault, as readVaultSource reads it (lifecycle-signature.ts).
    CREATE SCHEMA IF NOT EXISTS vault;
    CREATE TABLE IF NOT EXISTS vault.documents (id UUID PRIMARY KEY, organization_id INTEGER NOT NULL, program_id UUID,
      content_hash TEXT NOT NULL, created_by INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), deleted_at TIMESTAMPTZ);`);
  await h.pglite.exec(`CREATE OR REPLACE FUNCTION actor_name(p_user_id integer) RETURNS TABLE (name text, email text)
    LANGUAGE sql AS $$ SELECT 'Sam Settler'::text, 'sam@example.test'::text WHERE p_user_id = ${USER} $$;`);
  await applySequenceRemovalGuard(h.pglite);
}, 120_000);
afterAll(async () => { await h?.close(); });

describe('P-92 T1–T3: received on FDA\'s Ack2 or Ack3, or released on FDA\'s letter', () => {
  it('T1 received on an Ack2: the sequence is sent with A kept; S is spent; the act is recorded with its reason', async () => {
    const s = await held();
    const doc = await vaultDoc();
    const sig = await settleSig(s.id, { outcome: 'received', evidenceKind: 'ack2', evidenceDocumentId: doc.id });
    const answer = await settleHeldSend({ sequenceId: s.id, signatureActionId: sig.id, outcome: 'received' }, ctx);
    expect(answer).toMatchObject({ settled: true, sequenceId: s.id, outcome: 'received', dispatchStatus: 'sent', transmittalId: s.transmittalId });
    expect(await seqRow(s.id)).toMatchObject({ status: 'dispatched', dispatch_status: 'sent', s: s.S, a: s.A });
    const t = await transmittal(s.transmittalId);
    expect(t.status).toBe('ack2_received');
    expect(t.metadata.heldSendSettlement).toMatchObject({ outcome: 'received', kind: 'ack2', vaultDocumentId: doc.id, sha256: doc.hash, verified: false, signatureActionId: sig.id });
    expect(t.metadata.dispatchBinding).toMatchObject({ attemptId: s.A });
    expect(t.metadata.as2).toMatchObject({ messageId: s.messageId });
    expect(t.error_message).toMatch(/HTTP 502/);
    const [spent] = await auditOf(s.id, 'ECTD_TRANSMITTED');
    expect(spent.v).toMatchObject({ signatureActionId: s.S, transmitAttemptId: s.A, source: 'held-send-settlement', status: 'ack2_received', settlementSignatureActionId: sig.id });
    const [settled] = await auditOf(s.id, 'ECTD_HELD_SEND_SETTLED');
    expect(settled.reason).toBe(REASON);
    expect(settled.v).toMatchObject({ outcome: 'received', signatureActionId: sig.id, transmitSignatureActionId: s.S, statement: sig.statement });
    // The identifier is our own AS2 Message-ID, never the reply's transmission_id.
    expect(sig.statement).toContain(s.messageId);
    expect(sig.statement).not.toContain(String(t.transmission_id));
  }, 120_000);

  it('T2 received on an Ack3: the sequence is acknowledged, the transmittal ack3_received', async () => {
    const s = await held();
    const doc = await vaultDoc();
    const sig = await settleSig(s.id, { outcome: 'received', evidenceKind: 'ack3', evidenceDocumentId: doc.id });
    await settleHeldSend({ sequenceId: s.id, signatureActionId: sig.id, outcome: 'received' }, ctx);
    expect((await seqRow(s.id)).dispatch_status).toBe('acknowledged');
    expect((await transmittal(s.transmittalId)).status).toBe('ack3_received');
  }, 120_000);

  it('T3 released on FDA\'s letter: pending, S and A cleared, the transmittal rejected (never rolled_back), S spent', async () => {
    const s = await held();
    const doc = await vaultDoc();
    const sig = await settleSig(s.id, { outcome: 'not-received', evidenceKind: 'fda-non-receipt-confirmation', evidenceDocumentId: doc.id });
    expect(sig.statement).toMatch(/files it twice/);
    await settleHeldSend({ sequenceId: s.id, signatureActionId: sig.id, outcome: 'not-received' }, ctx);
    expect(await seqRow(s.id)).toMatchObject({ dispatch_status: 'pending', s: null, a: null });
    expect((await transmittal(s.transmittalId)).status).toBe('rejected');
    const [spent] = await auditOf(s.id, 'ECTD_TRANSMITTED');
    expect(spent.v).toMatchObject({ signatureActionId: s.S, status: 'not-received', source: 'held-send-settlement' });
  }, 120_000);
});

describe('P-92 E9 and E9′ (P-108 1(b), B1): released on the platform\'s own proof that nothing left', () => {
  it('a bound AS2 row with no AS2 identity is released on that proof; no document is cited; received is refused', async () => {
    const s = await held({ as2Identity: false, status: 'rejected' });
    const precheck = await precheckHeldSendSettlement(s.id, ctx, {});
    expect(precheck.heldSend!.platformProof).toBe('no-as2-message');
    expect(precheck.heldSend!.outcomes.received).toMatch(/never left the platform/);
    const sig = await settleSig(s.id, { outcome: 'not-received', evidenceKind: 'platform-proof' });
    expect(sig.statement).toMatch(/never left this platform: no AS2 message was formed for it/);
    expect(sig.statement).toMatch(/files it twice/);
    await settleHeldSend({ sequenceId: s.id, signatureActionId: sig.id, outcome: 'not-received' }, ctx);
    expect((await seqRow(s.id)).dispatch_status).toBe('pending');
    const [settled] = await auditOf(s.id, 'ECTD_HELD_SEND_SETTLED');
    expect(settled.v.evidence).toMatchObject({ kind: 'platform-proof', proof: 'no-as2-message', transmittalId: s.transmittalId });
    expect(settled.v.evidence.vaultDocumentId).toBeUndefined();
  }, 120_000);

  it('an AS2 row that formed its message is not released on platform proof: FDA\'s letter only', async () => {
    const s = await held();
    const answer = await precheckHeldSendSettlement(s.id, ctx, { outcome: 'not-received', evidenceKind: 'platform-proof' });
    expect(answer.cleared).toBe(false);
    expect(answer.refusal).toMatch(/an AS2 message was formed for it/);
    expect(answer.heldSend!.platformProof).toBeNull();
  }, 120_000);

  it('a bound legacy SFTP row with nothing that says bytes reached anyone is released on the never-shipped client (B1)', async () => {
    const s = await held({ transport: 'sftp', status: 'rejected', transmissionId: null });
    expect((await precheckHeldSendSettlement(s.id, ctx, {})).heldSend!.platformProof).toBe('sftp-client-never-shipped');
    const sig = await settleSig(s.id, { outcome: 'not-received', evidenceKind: 'platform-proof' });
    expect(sig.statement).toMatch(/no connection to FDA could be made for it: the platform never shipped the SFTP client/);
    expect(sig.statement).toMatch(/files it twice/);
    expect(sig.statement).not.toMatch(/cannot be sent as it is/);
    await settleHeldSend({ sequenceId: s.id, signatureActionId: sig.id, outcome: 'not-received' }, ctx);
    const [settled] = await auditOf(s.id, 'ECTD_HELD_SEND_SETTLED');
    expect(settled.v.evidence).toMatchObject({ kind: 'platform-proof', proof: 'sftp-client-never-shipped' });
  }, 120_000);

  it.each([
    ['the platform\'s own proof', { evidenceKind: 'platform-proof' as const }],
    ["FDA's letter", { evidenceKind: 'fda-non-receipt-confirmation' as const, doc: true }],
  ])('§10.3 A.2: releasing a legacy SFTP send over the launch ceiling on %s says the sequence cannot be sent as it is', async (_label, c) => {
    const s = await held({ transport: 'sftp', status: 'rejected', transmissionId: null, bundleSizeBytes: Math.round(1.27 * 1024 ** 3) });
    const evidenceDocumentId = 'doc' in c ? (await vaultDoc()).id : undefined;
    const sig = await settleSig(s.id, { outcome: 'not-received', evidenceKind: c.evidenceKind, evidenceDocumentId });
    expect(sig.statement).toContain(
      'Sequence 0000 cannot be sent as it is: the package is 1.27 GiB, and at launch Concept2Cure sends packages of up to 1 GiB to FDA.');
    expect(sig.statement).toMatch(/files it twice/);
    await settleHeldSend({ sequenceId: s.id, signatureActionId: sig.id, outcome: 'not-received' }, ctx);
    expect((await seqRow(s.id)).dispatch_status).toBe('pending');
  }, 120_000);

  it.each([
    ['a gateway message id', { transmissionId: '<sftp-reply>' }],
    ['a kept receipt', { verifiedReceipt: 'rejected' as const }],
    ['a received status', { status: 'received' }],
  ])('a legacy SFTP row with %s is not proven never sent', async (_label, extra) => {
    const s = await held({ transport: 'sftp', status: 'rejected', transmissionId: null, ...extra });
    const answer = await precheckHeldSendSettlement(s.id, ctx, { outcome: 'not-received', evidenceKind: 'platform-proof' });
    expect(answer.cleared).toBe(false);
  }, 120_000);

  it('an AS2 row never takes the SFTP proof: a signature naming another proof does not settle it, and is voided', async () => {
    const s = await held({ as2Identity: false, status: 'rejected' });
    const sig = await settleSig(s.id, { outcome: 'not-received', evidenceKind: 'platform-proof' },
      { evidence: { kind: 'platform-proof', proof: 'sftp-client-never-shipped', transmittalId: s.transmittalId } });
    const err = await outcome(settleHeldSend({ sequenceId: s.id, signatureActionId: sig.id, outcome: 'not-received' }, ctx));
    expect(err).toMatchObject({ code: 'GOVERNED_REQUIRED' });
    expect((await seqRow(s.id)).dispatch_status).toBe('transmitting');
    expect(await voided(sig.id)).toBe(true);
  }, 120_000);

  it('an SFTP row never takes the AS2 proof: a signature naming it does not settle it, and is voided', async () => {
    const s = await held({ transport: 'sftp', status: 'rejected', transmissionId: null });
    const sig = await settleSig(s.id, { outcome: 'not-received', evidenceKind: 'platform-proof' },
      { evidence: { kind: 'platform-proof', proof: 'no-as2-message', transmittalId: s.transmittalId } });
    const err = await outcome(settleHeldSend({ sequenceId: s.id, signatureActionId: sig.id, outcome: 'not-received' }, ctx));
    expect(err).toMatchObject({ code: 'GOVERNED_REQUIRED' });
    expect((await seqRow(s.id)).dispatch_status).toBe('transmitting');
    expect(await voided(sig.id)).toBe(true);
  }, 120_000);
});

describe('P-92 T4: what keeps a held send from being settled, in words, with nothing changed', () => {
  const refused = async (seq: number, choice: Partial<Choice>, sentence: RegExp) => {
    const answer = await precheckHeldSendSettlement(seq, ctx, choice as HeldSendChoice);
    expect(answer.cleared).toBe(false);
    expect(String(answer.refusal ?? (choice.outcome ? answer.heldSend?.outcomes[choice.outcome] : ''))).toMatch(sentence);
  };
  it('E1: nothing held; a legacy claim with no recorded signature or attempt', async () => {
    const pending = await held({ dispatchStatus: 'pending' });
    await refused(pending.id, {}, /has no held send to settle/);
    const legacy = await held();
    await q(`UPDATE ectd_sequences SET transmit_signature_action_id = NULL, transmit_attempt_id = NULL WHERE id = $1`, [legacy.id]);
    await refused(legacy.id, {}, /before the platform bound each send to its signature/);
  }, 120_000);
  it('E2: no bound FDA transmission (H8); two bound rows fail closed', async () => {
    await refused((await held({ bound: false })).id, {}, /No FDA transmission is recorded for sequence 0000's held send/);
    const twins = await held({ twin: true });
    expect(await outcome(precheckHeldSendSettlement(twins.id, ctx, {}))).toMatchObject({ code: 'INVALID_STATE' });
  }, 120_000);
  it('E3: a held send to FDA\'s test environment is not settled here', async () => {
    await refused((await held({ environment: 'staging' })).id, {}, /went to FDA's test environment/);
  }, 120_000);
  it('E4: FDA\'s verified answer already kept refuses both outcomes, and points at recording it', async () => {
    for (const status of ['received', 'rejected'] as const) {
      const s = await held({ verifiedReceipt: status });
      const answer = await precheckHeldSendSettlement(s.id, ctx, {});
      expect(answer.cleared).toBe(false);
      expect(answer.refusal).toMatch(/FDA's signed answer to this send is already kept on the platform/);
      expect(answer.heldSend!.receiptUpload).toBe(true);
    }
  }, 120_000);
  it('E5: a send that may still be in progress is not settled; after the quiet period it may be released', async () => {
    const live = await held({ recent: true, errorMessage: null });
    await refused(live.id, {}, /may still be in progress/);
    const quiet = await held({ errorMessage: null });
    expect((await precheckHeldSendSettlement(quiet.id, ctx, {})).heldSend!.outcomes['not-received']).toBeNull();
  }, 120_000);
  it('E5b: received needs a send that left; FDA\'s endpoint refusing it at the time (4xx) is not received', async () => {
    const refusedAtTheTime = await held({ status: 'rejected', httpStatus: 403 });
    const answer = await precheckHeldSendSettlement(refusedAtTheTime.id, ctx, {});
    expect(answer.heldSend!.outcomes.received).toMatch(/refused this send when it was made/);
    expect(answer.heldSend!.outcomes['not-received']).toBeNull();
    // A send whose AS2 message was formed but whose row never left 'pending' did not leave either.
    const neverLeft = await held({ status: 'pending' });
    const pending = await precheckHeldSendSettlement(neverLeft.id, ctx, {});
    expect(pending.heldSend!.outcomes.received).toMatch(/never left the platform, so an FDA acknowledgement cannot be for it/);
    expect(pending.heldSend!.outcomes['not-received']).toBeNull();
  }, 120_000);
});

describe('P-92 T4: the document, the kind and the signer', () => {
  const docRefusal = async (doc: { id: string }, sentence: RegExp, seq?: number) => {
    const s = seq ?? (await held()).id;
    const answer = await precheckHeldSendSettlement(s, ctx, { outcome: 'received', evidenceKind: 'ack2', evidenceDocumentId: doc.id });
    expect(answer.cleared).toBe(false);
    expect(answer.refusal).toMatch(sentence);
  };
  it('E6: another organisation\'s or another project\'s document is not a retained document of this project', async () => {
    await docRefusal(await vaultDoc({ org: ORG + 1 }), /not a retained document in this project's Vault/);
    await docRefusal(await vaultDoc({ program: OTHER_PROGRAM }), /not a retained document in this project's Vault/);
  }, 120_000);
  it('E6: a document in the Vault before the send was made cannot be FDA\'s answer to it', async () => {
    await docRefusal(await vaultDoc({ createdAgo: '5 days' }), /was in the Vault before this send was made/);
  }, 120_000);
  it('E6: a document that settled another send of the same sequence cannot settle this one', async () => {
    const s = await held();
    const doc = await vaultDoc();
    const sig = await settleSig(s.id, { outcome: 'not-received', evidenceKind: 'fda-non-receipt-confirmation', evidenceDocumentId: doc.id });
    await settleHeldSend({ sequenceId: s.id, signatureActionId: sig.id, outcome: 'not-received' }, ctx);
    // A second attempt of the same sequence, held again.
    const S2 = await sign(s.id, 'transmit', 'release', { environment: 'production' });
    const A2 = uuid(s.id + 50_000);
    await q(`UPDATE ectd_sequences SET dispatch_status = 'transmitting', transmit_signature_action_id = $2, transmit_attempt_id = $3::uuid WHERE id = $1`, [s.id, S2, A2]);
    await q(`INSERT INTO submission_transmittals (organization_id, region, gateway, transport, status, metadata, bundle_sha256, error_message, submitted_at, updated_at)
             VALUES (${ORG}, 'fda', 'esg', 'as2', 'in_transit', $1::jsonb, $2, 'after the wire', now() - interval '3 days', now() - interval '2 days')`,
    [JSON.stringify({ environment: 'production', dispatchBinding: { organizationId: ORG, sequenceId: s.id, signatureActionId: S2, attemptId: A2, bundleSha256: SHA }, as2: { messageId: '<two>', mic: 'm', environment: 'production' } }), SHA]);
    await docRefusal(doc, /already settled another send of sequence 0000/, s.id);
  }, 120_000);
  it('E7: an Ack2 does not release a send; FDA\'s non-receipt letter does not record it as received', async () => {
    const s = await held();
    const doc = await vaultDoc();
    expect(await outcome(precheckHeldSendSettlement(s.id, ctx, { outcome: 'not-received', evidenceKind: 'ack2', evidenceDocumentId: doc.id })))
      .toMatchObject({ code: 'VALIDATION' });
  }, 120_000);
  it('E8: the sequence\'s creator is told before signing that they cannot settle its send', async () => {
    const s = await held();
    const answer = await precheckHeldSendSettlement(s.id, { organizationId: ORG, userId: AUTHOR }, {});
    expect(answer.heldSend!.signerRefusal).toMatch(/You created sequence 0000, so you cannot sign the settlement of its held send/);
  }, 120_000);
  it('E8: the meaning is responsibility only', async () => {
    const s = await held();
    const doc = await vaultDoc();
    const sig = await settleSig(s.id, { outcome: 'received', evidenceKind: 'ack2', evidenceDocumentId: doc.id }, {}, 'approval');
    expect(await outcome(settleHeldSend({ sequenceId: s.id, signatureActionId: sig.id, outcome: 'received' }, ctx)))
      .toMatchObject({ code: 'GOVERNED_REQUIRED' });
    expect((await seqRow(s.id)).dispatch_status).toBe('transmitting');
  }, 120_000);
});

describe('P-92 T5 and T9: the signature binds what was settled, and is spent once', () => {
  it('T5 a statement altered by one character is refused, and the signature is voided', async () => {
    const s = await held();
    const doc = await vaultDoc();
    const first = await settleSig(s.id, { outcome: 'received', evidenceKind: 'ack2', evidenceDocumentId: doc.id });
    const altered = await settleSig(s.id, { outcome: 'received', evidenceKind: 'ack2', evidenceDocumentId: doc.id }, { statement: `${first.statement} ` });
    expect(await outcome(settleHeldSend({ sequenceId: s.id, signatureActionId: altered.id, outcome: 'received' }, ctx))).toMatchObject({ code: 'GOVERNED_REQUIRED' });
    expect(await voided(altered.id)).toBe(true);
    expect((await seqRow(s.id)).dispatch_status).toBe('transmitting');
  }, 120_000);
  it('T5 a signature for another attempt does not settle this one; nor one for the other outcome', async () => {
    const s = await held();
    const doc = await vaultDoc();
    const other = await settleSig(s.id, { outcome: 'received', evidenceKind: 'ack2', evidenceDocumentId: doc.id }, { transmitAttemptId: uuid(1) });
    expect(await outcome(settleHeldSend({ sequenceId: s.id, signatureActionId: other.id, outcome: 'received' }, ctx))).toMatchObject({ code: 'GOVERNED_REQUIRED' });
    const received = await settleSig(s.id, { outcome: 'received', evidenceKind: 'ack2', evidenceDocumentId: doc.id });
    expect(await outcome(settleHeldSend({ sequenceId: s.id, signatureActionId: received.id, outcome: 'not-received' }, ctx))).toMatchObject({ code: 'GOVERNED_REQUIRED' });
  }, 120_000);
  it('T9 a repeated request after success is refused, and the signature that performed the act is not voided', async () => {
    const s = await held();
    const doc = await vaultDoc();
    const sig = await settleSig(s.id, { outcome: 'received', evidenceKind: 'ack2', evidenceDocumentId: doc.id });
    await settleHeldSend({ sequenceId: s.id, signatureActionId: sig.id, outcome: 'received' }, ctx);
    expect(await outcome(settleHeldSend({ sequenceId: s.id, signatureActionId: sig.id, outcome: 'received' }, ctx))).not.toBeNull();
    expect(await voided(sig.id)).toBe(false);
    expect(await auditOf(s.id, 'ECTD_HELD_SEND_SETTLED')).toHaveLength(1);
  }, 120_000);
});

describe('P-92 with P-86 (P-108 2(a)): a released send is not a bound production send', () => {
  it.each([
    ['on FDA\'s letter', {} as HeldOpts, 'fda-non-receipt-confirmation'],
    ['on the platform\'s own proof', { as2Identity: false, status: 'rejected' } as HeldOpts, 'platform-proof'],
  ])('a sequence whose held send was released %s can be retired', async (_label, opts, kind) => {
    const s = await held(opts);
    const doc = kind === 'platform-proof' ? undefined : await vaultDoc();
    const sig = await settleSig(s.id, { outcome: 'not-received', evidenceKind: kind, evidenceDocumentId: doc?.id });
    await settleHeldSend({ sequenceId: s.id, signatureActionId: sig.id, outcome: 'not-received' }, ctx);
    const retireSig = await sign(s.id, 'retire', 'responsibility', { notFiledElsewhere: true, statement: retirementStatement('0000') });
    await q(`UPDATE electronic_signatures SET signature_purpose = 'A corrected 0000 replaces it.' WHERE (signature_manifest::jsonb ->> 'actionId') = $1`, [retireSig]);
    const retired = await retireSequence({ sequenceId: s.id, signatureActionId: retireSig }, ctx);
    expect(retired).toMatchObject({ retired: true, sequenceId: s.id });
  }, 120_000);

  it('a held send not yet settled still keeps the sequence', async () => {
    const s = await held();
    const retireSig = await sign(s.id, 'retire', 'responsibility', { notFiledElsewhere: true, statement: retirementStatement('0000') });
    await q(`UPDATE electronic_signatures SET signature_purpose = 'x x x x x x' WHERE (signature_manifest::jsonb ->> 'actionId') = $1`, [retireSig]);
    expect(await outcome(retireSequence({ sequenceId: s.id, signatureActionId: retireSig }, ctx))).toMatchObject({
      code: 'SEQUENCE_NOT_RETIRABLE',
      // §10.3 A.5: once the door is on the Dispatch tab (C2), check 2b names it.
      message: expect.stringContaining("Record the agency's receipt, settle the held send from the Dispatch tab, or wait for the send to settle, then look again."),
    });
  }, 120_000);
});
