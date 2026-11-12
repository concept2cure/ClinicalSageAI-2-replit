/**
 * P-92 C4 (P-108 1(a); design §10.5 C, with the coordinating session's rulings of 2026-11-09): FDA's failed Ack3 after a
 * send recorded as received is recorded on the sequence by a signed act. FDA's Ack3 is a document in the project's Vault,
 * read FOR SHARE, its hash signed; the act refuses, and voids its signature, when the Ack3 is absent or its bytes
 * changed. The sequence becomes 'rejected' (no longer on file); its number rule is §10.5 D's, unchanged until FDA's
 * specification is quoted.
 *
 * The real precheck and act over the freeze-gate fixture, on PGlite, with the transmittal shaped as a received send
 * leaves it (the receipt path, or C1's "received" settlement): the sequence 'sent', its claim (S, A) kept.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const holder = vi.hoisted(() => ({ db: null as any, pglite: null as any, afterFirstFacts: null as null | (() => Promise<void>) }));
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

// The act's first read is taken as read, then the world changes before the read under the lock (as P-86's T7).
vi.mock('../../ectd/filed-sequence-rejection', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../ectd/filed-sequence-rejection')>();
  return {
    ...actual,
    readSequenceRejectionFacts: async (...args: Parameters<typeof actual.readSequenceRejectionFacts>) => {
      const facts = await actual.readSequenceRejectionFacts(...args);
      const hook = holder.afterFirstFacts;
      if (hook) { holder.afterFirstFacts = null; await hook(); }
      return facts;
    },
  };
});

import { createIndPgliteDb, AUDIT_LOGS_PGLITE_DDL, applySequenceRemovalGuard, type IndPgliteDb } from '../../../db/pglite-harness';
import { ORG, USER, FREEZE_GATE_SEED_SQL, FREEZE_PROGRAM_ID, freezeGateHelpers } from './_freeze-gate-fixture';
import { precheckTechnicalRejection, recordTechnicalRejection } from '../submission-service';

let h: IndPgliteDb;
const ctx = { organizationId: ORG, userId: USER };
const AUTHOR = 4; // The sequence's creator: never its signer (separation of duties).
const OTHER_PROGRAM = '99999999-9999-4999-8999-999999999999';
const { sign } = freezeGateHelpers(() => h);
const q = (text: string, params?: unknown[]) => h.pglite.query(text, params) as Promise<{ rows: any[] }>;
const outcome = (p: Promise<unknown>) => p.then(() => null, (e: any) => e);
const REASON = "FDA's Ack3 reports the center did not accept the sequence.";
const SHA = 'c'.repeat(64);

let nextId = 9900;
const uuid = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
type SentOpts = { dispatchStatus?: string; status?: string; environment?: string | null; claim?: boolean; twin?: boolean; submissionId?: number; number?: string };
/** A sequence whose production send to FDA is recorded as received: 'sent', its claim (S, A) kept, and the one transmittal
 *  bound to it, as the receipt path or C1's "received" settlement leaves them. */
async function sent(opts: SentOpts = {}) {
  const id = nextId++;
  const submissionId = opts.submissionId ?? id;
  if (!opts.submissionId) {
    await q(`INSERT INTO submissions (id, title, application_type, client_type, primary_region, organization_id, created_by, program_id)
             VALUES ($1, 'P-92 C4', 'ind', 'biotech', 'fda', ${ORG}, ${AUTHOR}, $2)`, [submissionId, FREEZE_PROGRAM_ID]);
  }
  await q(`INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by, status, dispatch_status)
           VALUES ($1, $2, 'fda', $3, ${ORG}, ${AUTHOR}, 'dispatched', 'pending')`, [id, submissionId, opts.number ?? '0000']);
  const S = await sign(id, 'transmit', 'release', { environment: 'production' });
  const A = uuid(id);
  await q(`UPDATE ectd_sequences SET dispatch_status = $2, transmit_signature_action_id = $3, transmit_attempt_id = $4::uuid WHERE id = $1`,
    [id, opts.dispatchStatus ?? 'sent', opts.claim === false ? null : S, opts.claim === false ? null : A]);
  const metadata = {
    ...(opts.environment === null ? {} : { environment: opts.environment ?? 'production' }),
    dispatchBinding: { organizationId: ORG, sequenceId: id, signatureActionId: S, attemptId: A, bundleSha256: SHA },
    as2: { messageId: `<msg-${id}@sponsor.example>`, mic: 'mic==', environment: opts.environment ?? 'production' },
    as2Receipt: { verified: true, status: 'received', sha256: 'd'.repeat(64) },
  };
  const insert = async () => (await q(`INSERT INTO submission_transmittals (organization_id, region, gateway, transport, status, metadata, bundle_sha256,
      transmission_id, submitted_at, updated_at, bundle_size_bytes)
    VALUES (${ORG}, 'fda', 'esg', 'as2', $1, $2::jsonb, $3, $4, now() - interval '3 days', now() - interval '2 days', 1024) RETURNING id`,
  [opts.status ?? 'received', JSON.stringify(metadata), SHA, `<reply-${id}@intermediary>`])).rows[0].id as number;
  const transmittalId = await insert();
  if (opts.twin) await insert();
  return { id, submissionId, S, A, transmittalId };
}
async function vaultDoc(opts: { org?: number; program?: string; createdAgo?: string; hash?: string } = {}) {
  const id = `b0000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}`;
  const hash = opts.hash ?? `${String(nextId).padStart(4, '0')}${'f'.repeat(60)}`;
  await q(`INSERT INTO vault.documents (id, organization_id, program_id, content_hash, created_by, created_at)
           VALUES ($1::uuid, $2, $3::uuid, $4, ${USER}, now() - $5::interval)`,
  [id, opts.org ?? ORG, opts.program ?? FREEZE_PROGRAM_ID, hash, opts.createdAgo ?? '1 day']);
  return { id, hash };
}
/** The rejection signature, signed over what the precheck answered (as the dialog does), with the signer's reason. */
async function rejectSig(seq: number, documentId: string, payload: Record<string, unknown> = {}, meaning = 'responsibility') {
  const answer = await precheckTechnicalRejection(seq, ctx, { evidenceDocumentId: documentId });
  expect(answer.cleared, String(answer.refusal)).toBe(true);
  const r = answer.rejection!;
  const id = await sign(seq, 'technical-rejection', meaning, {
    transmittalId: r.transmittalId, transmitAttemptId: r.attemptId, evidence: r.evidence, statement: r.statement, ...payload,
  });
  await q(`UPDATE electronic_signatures SET signature_purpose = $2 WHERE (signature_manifest::jsonb ->> 'actionId') = $1`, [id, REASON]);
  return { id, statement: r.statement as string };
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

describe('P-92 C4: FDA\'s failed Ack3 is recorded on the sequence by a signed act', () => {
  it('T1 the precheck states it; the act sets the sequence rejected, records the transmittal, and writes the chained row', async () => {
    const s = await sent();
    const doc = await vaultDoc();
    const pre = await precheckTechnicalRejection(s.id, ctx, { evidenceDocumentId: doc.id });
    expect(pre).toMatchObject({ step: 'technical-rejection', cleared: true, refusal: null,
      rejection: { sequenceNumber: '0000', transmittalId: s.transmittalId, attemptId: s.A, evidence: { kind: 'ack3', vaultDocumentId: doc.id, sha256: doc.hash } } });
    expect(pre.rejection!.statement).toMatch(/^FDA's Ack3 for the send of sequence 0000 on .+ UTC is the document chosen from this project's Vault\. It reports that the center did not accept sequence 0000\. Sequence 0000 is recorded as rejected by FDA: it is no longer on file with FDA\./);
    expect(pre.rejection!.statement).toContain("FDA's notice decides whether that number can be used again");
    const sig = await rejectSig(s.id, doc.id);
    const done = await recordTechnicalRejection({ sequenceId: s.id, signatureActionId: sig.id }, ctx);
    expect(done).toMatchObject({ recorded: true, sequenceId: s.id, sequenceNumber: '0000', dispatchStatus: 'rejected', transmittalId: s.transmittalId });
    expect(await seqRow(s.id)).toMatchObject({ dispatch_status: 'rejected', s: s.S, a: s.A });
    const t = await transmittal(s.transmittalId);
    expect(t.status).toBe('validation_failed');
    // The gateway's own error is left as it was: the rejection is said from its record, once, on both lists (walk, 2026-11-09).
    expect(t.error_message).toBeNull();
    expect(t.metadata.technicalRejection).toMatchObject({ sequence: '0000', recordedBy: USER, reason: REASON, signatureActionId: sig.id,
      evidence: { kind: 'ack3', vaultDocumentId: doc.id, sha256: doc.hash }, transmittalStatus: { previous: 'received', current: 'validation_failed' } });
    const rows = await auditOf(s.id, 'ECTD_TECHNICAL_REJECTION_RECORDED');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ reason: REASON, v: { meaning: 'responsibility', statement: sig.statement, signatureActionId: sig.id } });
    // Spent: the same signature records nothing a second time.
    expect(await outcome(recordTechnicalRejection({ sequenceId: s.id, signatureActionId: sig.id }, ctx))).toMatchObject({ code: 'GOVERNED_REQUIRED' });
  }, 120_000);

  it.each([
    ['acknowledged', { dispatchStatus: 'acknowledged' }, 'is recorded as accepted by FDA'],
    ['already rejected', { dispatchStatus: 'rejected' }, 'is already recorded as rejected by FDA'],
    ['not received', { dispatchStatus: 'pending' }, 'is not recorded as received by FDA'],
    ['a send with no claim', { claim: false }, 'before the platform bound each send to its signature'],
    ['a test send', { environment: 'staging' }, "went to FDA's test environment"],
    ['a send with no environment named', { environment: null }, 'Where sequence 0000 was sent is not recorded'],
    ['a transmission FDA\'s center accepted', { status: 'ack3_received' }, 'accepting sequence 0000'],
  ] as Array<[string, SentOpts, string]>)('R1-R3 refuse %s, before anyone signs, in words', async (_label, opts, words) => {
    const s = await sent(opts);
    const pre = await precheckTechnicalRejection(s.id, ctx, {});
    expect(pre.cleared).toBe(false);
    expect(pre.refusal).toContain(words);
    expect(pre.refusal).toMatch(/Nothing was changed\.$/);
  }, 120_000);

  it('R2 two transmittals bound to one attempt are "could not be checked", never a guess', async () => {
    const s = await sent({ twin: true });
    expect(await outcome(precheckTechnicalRejection(s.id, ctx, {}))).toMatchObject({ code: 'INVALID_STATE', message: expect.stringContaining('could not be checked') });
  }, 120_000);

  it('R4 latest only: a later sequence in flight or on file is recorded first', async () => {
    const s = await sent();
    await sent({ submissionId: s.submissionId, number: '0001' });
    const pre = await precheckTechnicalRejection(s.id, ctx, {});
    expect(pre.refusal).toContain('Sequence 0001, numbered after 0000, is in flight or on file with FDA');
  }, 120_000);

});

describe("P-92 C4: FDA's Ack3, the signature and the locks", () => {
  it.each([
    ['absent from the Vault', async () => ({ id: 'b0000000-0000-4000-8000-000000009999' })],
    ["another project's", () => vaultDoc({ program: OTHER_PROGRAM })],
    ["another organization's", () => vaultDoc({ org: 999 })],
    ['older than the send', () => vaultDoc({ createdAgo: '10 days' })],
  ])('R5 the Ack3 %s is refused before signing', async (_label, make) => {
    const s = await sent();
    const doc = await make();
    const pre = await precheckTechnicalRejection(s.id, ctx, { evidenceDocumentId: doc.id });
    expect(pre.cleared).toBe(false);
    expect(pre.refusal).toMatch(/FDA's Ack3 for sequence 0000 must be a document in this project's Vault, recorded after the send|was in the Vault before this send was made/);
  }, 120_000);

  it("R5 a document that already settled the send is not FDA's Ack3 for its rejection", async () => {
    const s = await sent();
    const doc = await vaultDoc();
    await q(`UPDATE submission_transmittals SET metadata = metadata || jsonb_build_object('heldSendSettlement', jsonb_build_object('outcome', 'received', 'kind', 'ack2', 'vaultDocumentId', $2::text, 'sha256', $3::text)) WHERE id = $1`,
      [s.transmittalId, doc.id, doc.hash]);
    const pre = await precheckTechnicalRejection(s.id, ctx, { evidenceDocumentId: doc.id });
    expect(pre.refusal).toContain('already settled or rejected a send of sequence 0000');
  }, 120_000);

  it('the Ack3 bytes changed after the statement was read: refused, the signature void, nothing recorded', async () => {
    const s = await sent();
    const doc = await vaultDoc();
    const sig = await rejectSig(s.id, doc.id);
    await q(`UPDATE vault.documents SET content_hash = $2 WHERE id = $1::uuid`, [doc.id, 'e'.repeat(64)]);
    const err = await outcome(recordTechnicalRejection({ sequenceId: s.id, signatureActionId: sig.id }, ctx));
    expect(err).toMatchObject({ code: 'GOVERNED_REQUIRED', message: expect.stringContaining('The chosen document changed after it was quoted') });
    expect(await voided(sig.id)).toBe(true);
    expect(await seqRow(s.id)).toMatchObject({ dispatch_status: 'sent' });
    expect((await transmittal(s.transmittalId)).metadata.technicalRejection).toBeUndefined();
  }, 120_000);

  it('the Ack3 deleted after signing: refused under the act, the signature void', async () => {
    const s = await sent();
    const doc = await vaultDoc();
    const sig = await rejectSig(s.id, doc.id);
    await q(`UPDATE vault.documents SET deleted_at = now() WHERE id = $1::uuid`, [doc.id]);
    const err = await outcome(recordTechnicalRejection({ sequenceId: s.id, signatureActionId: sig.id }, ctx));
    expect(err).toMatchObject({ code: 'TECHNICAL_REJECTION_NOT_RECORDABLE', message: expect.stringContaining("must be a document in this project's Vault") });
    expect(await voided(sig.id)).toBe(true);
    expect(await seqRow(s.id)).toMatchObject({ dispatch_status: 'sent' });
  }, 120_000);

  it("R6 the sequence's creator is told before signing, and the creator's signature is refused", async () => {
    const s = await sent();
    const doc = await vaultDoc();
    const pre = await precheckTechnicalRejection(s.id, { organizationId: ORG, userId: AUTHOR }, { evidenceDocumentId: doc.id });
    expect(pre.rejection!.signerRefusal).toBe('You created sequence 0000, so you cannot sign the record of its technical rejection. Another person with signing authority signs it.');
    const sig = await rejectSig(s.id, doc.id);
    expect(await outcome(recordTechnicalRejection({ sequenceId: s.id, signatureActionId: sig.id }, { organizationId: ORG, userId: AUTHOR })))
      .toMatchObject({ code: expect.stringMatching(/FORBIDDEN|GOVERNED_REQUIRED/) });
    expect(await seqRow(s.id)).toMatchObject({ dispatch_status: 'sent' });
  }, 120_000);

  it.each([
    ['another meaning', {}, 'approval', 'responsibility'],
    ['another transmission', { transmittalId: 1 }, 'responsibility', 'another transmission'],
    ['another kind of evidence', { evidence: { kind: 'ack2' } }, 'responsibility', 'evidence'],
    ['no statement', { statement: '' }, 'responsibility', 'no statement'],
  ])('Gate 1 refuses a signature with %s, and voids it', async (_label, payload, meaning, words) => {
    const s = await sent();
    const doc = await vaultDoc();
    const sig = await rejectSig(s.id, doc.id, payload, meaning);
    const err = await outcome(recordTechnicalRejection({ sequenceId: s.id, signatureActionId: sig.id }, ctx));
    expect(err).toMatchObject({ code: 'GOVERNED_REQUIRED', message: expect.stringContaining(words) });
    expect(await voided(sig.id)).toBe(true);
  }, 120_000);

  it('the signed statement is compared word for word: one character changed is refused', async () => {
    const s = await sent();
    const doc = await vaultDoc();
    const pre = await precheckTechnicalRejection(s.id, ctx, { evidenceDocumentId: doc.id });
    const sig = await rejectSig(s.id, doc.id, { statement: `${pre.rejection!.statement}.` });
    expect(await outcome(recordTechnicalRejection({ sequenceId: s.id, signatureActionId: sig.id }, ctx)))
      .toMatchObject({ code: 'GOVERNED_REQUIRED', message: expect.stringContaining('what it states or cites is not what the record of sequence 0000 shows now') });
  }, 120_000);

  it("R7 FDA's kept answer refusing a send recorded as received is decided first (C3)", async () => {
    const s = await sent();
    await q(`UPDATE submission_transmittals SET metadata = metadata || jsonb_build_object('as2ReceiptHistory', $2::jsonb) WHERE id = $1`,
      [s.transmittalId, JSON.stringify([{ sha256: '8'.repeat(64), verified: true, status: 'rejected', contradicts: 'received' }])]);
    const pre = await precheckTechnicalRejection(s.id, ctx, {});
    expect(pre.refusal).toContain("FDA's signed answer refusing this send of sequence 0000 is kept and not yet decided");
  }, 120_000);

  it('the facts are judged again under the lock: a sequence acknowledged after the first read is refused, the signature void', async () => {
    const s = await sent();
    const doc = await vaultDoc();
    const sig = await rejectSig(s.id, doc.id);
    // After the act's first read (which sees 'sent'), before its read under the lock.
    holder.afterFirstFacts = async () => { await q(`UPDATE ectd_sequences SET dispatch_status = 'acknowledged' WHERE id = $1`, [s.id]); };
    const err = await outcome(recordTechnicalRejection({ sequenceId: s.id, signatureActionId: sig.id }, ctx));
    expect(holder.afterFirstFacts).toBeNull();
    expect(err).toMatchObject({ code: 'TECHNICAL_REJECTION_NOT_RECORDABLE', message: expect.stringContaining('is recorded as accepted by FDA') });
    expect(await voided(sig.id)).toBe(true);
  }, 120_000);

  it('a signature with no reason records nothing', async () => {
    const s = await sent();
    const doc = await vaultDoc();
    const sig = await rejectSig(s.id, doc.id);
    await q(`UPDATE electronic_signatures SET signature_purpose = NULL WHERE (signature_manifest::jsonb ->> 'actionId') = $1`, [sig.id]);
    expect(await outcome(recordTechnicalRejection({ sequenceId: s.id, signatureActionId: sig.id }, ctx)))
      .toMatchObject({ code: 'GOVERNED_REQUIRED', message: expect.stringContaining('records no reason') });
    expect(await seqRow(s.id)).toMatchObject({ dispatch_status: 'sent' });
  }, 120_000);
});
