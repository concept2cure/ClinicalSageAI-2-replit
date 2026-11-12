/**
 * P-92 C3 (P-108 1(c); design §10.5 E (i), the coordinating session's ruling 2 of 2026-11-09): when FDA's verified answer
 * contradicts a signed settlement, a second signed act re-opens it, and FDA's answer is applied as the receipt path would
 * have written it had it arrived first. A release that FDA's positive MDN contradicts: the sequence 'sent' (its claim
 * restored from the send's binding), the transmittal 'received' with FDA's receipt. A "received" that FDA's negative MDN
 * contradicts: both 'rejected'. Both records stay: heldSendSettlement gains reopenedBy, set once.
 *
 * The real settlement, precheck and act over the freeze-gate fixture, on PGlite. FDA's contradicting answer is kept as
 * keepContradictingReceipt (fda-esg-receipts.ts) writes it.
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
vi.mock('../../submission-gateways/fda-esg-receipts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../submission-gateways/fda-esg-receipts')>();
  return {
    ...actual,
    readReopenFacts: async (...args: Parameters<typeof actual.readReopenFacts>) => {
      const facts = await actual.readReopenFacts(...args);
      const hook = holder.afterFirstFacts;
      if (hook) { holder.afterFirstFacts = null; await hook(); }
      return facts;
    },
  };
});

import { createIndPgliteDb, AUDIT_LOGS_PGLITE_DDL, applySequenceRemovalGuard, type IndPgliteDb } from '../../../db/pglite-harness';
import { ORG, USER, FREEZE_GATE_SEED_SQL, FREEZE_PROGRAM_ID, freezeGateHelpers } from './_freeze-gate-fixture';
import { precheckHeldSendSettlement, settleHeldSend, precheckHeldSendReopen, recordHeldSendReopen, type HeldSendChoice } from '../submission-service';

let h: IndPgliteDb;
const ctx = { organizationId: ORG, userId: USER };
const AUTHOR = 4; // The sequence's creator: never its settler (separation of duties).
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

const MDN_BODY = 'Disposition: automatic-action/MDN-sent-automatically; processed (walk stand-in)';
/** FDA's verified answer kept beside the settlement, as keepContradictingReceipt writes it. */
async function keep(transmittalId: number, status: 'received' | 'rejected', contradicts: 'received' | 'not-received', sha = '9'.repeat(64)) {
  const entry = { sha256: sha, bodyBase64: Buffer.from(MDN_BODY).toString('base64'), contentType: 'message/disposition-notification',
    receivedAt: '2026-11-08T10:00:00.000Z', verified: true, submittedBy: USER, source: 'agency-signed-upload', status, contradicts };
  await q(`UPDATE submission_transmittals SET metadata = jsonb_set(metadata, '{as2ReceiptHistory}', COALESCE(metadata->'as2ReceiptHistory', '[]'::jsonb) || $2::jsonb) WHERE id = $1`,
    [transmittalId, JSON.stringify([entry])]);
  return entry;
}
/** A held send released as not received (on the platform's own proof), with FDA's positive MDN kept against it. */
async function releasedButReceived() {
  const s = await held({ as2Identity: false, status: 'rejected' });
  const sig = await settleSig(s.id, { outcome: 'not-received', evidenceKind: 'platform-proof' });
  await settleHeldSend({ sequenceId: s.id, signatureActionId: sig.id, outcome: 'not-received' }, ctx);
  const entry = await keep(s.transmittalId, 'received', 'not-received');
  return { ...s, settlementSig: sig.id, entry };
}
/** A held send recorded as received on FDA's Ack2, with FDA's negative MDN kept against it. */
async function receivedButRefused() {
  const s = await held();
  const doc = await vaultDoc();
  const sig = await settleSig(s.id, { outcome: 'received', evidenceKind: 'ack2', evidenceDocumentId: doc.id });
  await settleHeldSend({ sequenceId: s.id, signatureActionId: sig.id, outcome: 'received' }, ctx);
  const entry = await keep(s.transmittalId, 'rejected', 'received');
  return { ...s, settlementSig: sig.id, entry };
}
/** The re-open signature, signed over what the precheck answered, with the signer's reason. */
async function reopenSig(seq: number, payload: Record<string, unknown> = {}, meaning = 'responsibility') {
  const answer = await precheckHeldSendReopen(seq, ctx);
  expect(answer.cleared, String(answer.refusal)).toBe(true);
  const r = answer.reopen!;
  const id = await sign(seq, 'held-send-reopen', meaning, {
    settlementSignatureActionId: r.settlementSignatureActionId, receiptSha256: r.receiptSha256, statement: r.statement, ...payload,
  });
  await q(`UPDATE electronic_signatures SET signature_purpose = $2 WHERE (signature_manifest::jsonb ->> 'actionId') = $1`, [id, REASON]);
  return { id, statement: r.statement as string };
}
const seqFull = async (id: number) =>
  (await q(`SELECT dispatch_status, transmit_signature_action_id AS s, transmit_attempt_id::text AS a FROM ectd_sequences WHERE id = $1`, [id])).rows[0];

describe("P-92 C3: a settlement FDA's verified answer contradicts is re-opened on that answer", () => {
  it('a release FDA received: the sequence is sent with its claim restored, the transmittal received with FDA\'s receipt', async () => {
    const s = await releasedButReceived();
    const pre = await precheckHeldSendReopen(s.id, ctx);
    expect(pre).toMatchObject({ step: 'held-send-reopen', cleared: true, refusal: null,
      reopen: { sequenceNumber: '0000', outcome: 'not-received', settlementSignatureActionId: s.settlementSig, receiptSha256: s.entry.sha256, signerRefusal: null } });
    expect(pre.reopen!.statement).toMatch(/^FDA's signed receipt for the send of sequence 0000 on .+ UTC, kept on 8 November 2026, shows that FDA received it\. /);
    expect(pre.reopen!.statement).toContain('Sequence 0000 is recorded as received by FDA: it is on file with FDA and is not sent again.');
    const sig = await reopenSig(s.id);
    const done = await recordHeldSendReopen({ sequenceId: s.id, signatureActionId: sig.id }, ctx);
    expect(done).toMatchObject({ reopened: true, sequenceId: s.id, outcome: 'not-received', dispatchStatus: 'sent', transmittalId: s.transmittalId });
    expect(await seqFull(s.id)).toEqual({ dispatch_status: 'sent', s: s.S, a: s.A });
    const t = (await q(`SELECT status, metadata, mdn_raw, ack_received_at FROM submission_transmittals WHERE id = $1`, [s.transmittalId])).rows[0];
    expect(t.status).toBe('received');
    expect(t.metadata.as2Receipt).toMatchObject({ sha256: s.entry.sha256, status: 'received', verified: true });
    expect(t.mdn_raw).toBe(MDN_BODY);
    expect(t.ack_received_at).not.toBeNull();
    expect(t.metadata.heldSendSettlement).toMatchObject({ outcome: 'not-received', reopenedBy: { userId: USER, signatureActionId: sig.id, receiptSha256: s.entry.sha256 } });
    // One chained row (toMatchObject on an array also matches its length).
    expect(await auditOf(s.id, 'ECTD_HELD_SEND_REOPENED'))
      .toMatchObject([{ reason: REASON, v: { meaning: 'responsibility', statement: sig.statement, signatureActionId: sig.id, outcome: 'not-received' } }]);
    // The signature is spent: used again it is refused, and that refusal never voids a signature that re-opened a settlement.
    expect(await outcome(recordHeldSendReopen({ sequenceId: s.id, signatureActionId: sig.id }, ctx))).toMatchObject({ code: 'GOVERNED_REQUIRED' });
    expect(await voided(sig.id)).toBe(false);
  }, 120_000);

  it('"received" FDA refused: the sequence and the transmittal are rejected, and both records stay', async () => {
    const s = await receivedButRefused();
    const pre = await precheckHeldSendReopen(s.id, ctx);
    expect(pre.reopen!.statement).toMatch(/^FDA's signed answer for the send of sequence 0000 on .+ UTC, kept on 8 November 2026, refuses it\. /);
    expect(pre.reopen!.statement).toContain('Sequence 0000 is recorded as rejected by FDA, and it can be sent again under a new signature.');
    const sig = await reopenSig(s.id);
    const done = await recordHeldSendReopen({ sequenceId: s.id, signatureActionId: sig.id }, ctx);
    expect(done).toMatchObject({ reopened: true, outcome: 'received', dispatchStatus: 'rejected' });
    expect(await seqFull(s.id)).toMatchObject({ dispatch_status: 'rejected' });
    const t = (await q(`SELECT status, metadata, mdn_raw FROM submission_transmittals WHERE id = $1`, [s.transmittalId])).rows[0];
    expect(t).toMatchObject({ status: 'rejected', mdn_raw: MDN_BODY, metadata: { as2Receipt: { sha256: s.entry.sha256, status: 'rejected', verified: true } } });
    expect(t.metadata.heldSendSettlement).toMatchObject({ outcome: 'received', kind: 'ack2', reopenedBy: { signatureActionId: sig.id } });
  }, 120_000);

  it('nothing to re-open: a settlement with no contradicting answer, and one already re-opened', async () => {
    const s = await held({ as2Identity: false, status: 'rejected' });
    const sig = await settleSig(s.id, { outcome: 'not-received', evidenceKind: 'platform-proof' });
    await settleHeldSend({ sequenceId: s.id, signatureActionId: sig.id, outcome: 'not-received' }, ctx);
    expect((await precheckHeldSendReopen(s.id, ctx)).refusal).toBe("Nothing FDA has answered contradicts a settlement of sequence 0000, so there is nothing to re-open. Nothing was changed.");
    const r = await releasedButReceived();
    await recordHeldSendReopen({ sequenceId: r.id, signatureActionId: (await reopenSig(r.id)).id }, ctx);
    expect((await precheckHeldSendReopen(r.id, ctx)).refusal).toContain('is already re-opened on FDA\'s answer');
  }, 120_000);

  it('a release whose sequence was sent again is not re-opened by an act: FDA may hold two copies', async () => {
    const s = await releasedButReceived();
    await q(`UPDATE ectd_sequences SET dispatch_status = 'transmitting', transmit_signature_action_id = 'sig-again', transmit_attempt_id = $2::uuid WHERE id = $1`,
      [s.id, 'b1000000-0000-4000-8000-000000000001']);
    const pre = await precheckHeldSendReopen(s.id, ctx);
    expect(pre.cleared).toBe(false);
    expect(pre.refusal).toContain('Sequence 0000 is no longer where its release left it');
    expect(pre.refusal).toContain('FDA may hold two copies of it');
  }, 120_000);

  it("the sequence's creator is told before signing", async () => {
    const s = await releasedButReceived();
    expect((await precheckHeldSendReopen(s.id, { organizationId: ORG, userId: AUTHOR })).reopen!.signerRefusal)
      .toBe('You created sequence 0000, so you cannot sign the re-opening of its settlement. Another person with signing authority signs it.');
  }, 120_000);

  it.each([
    ['another meaning', {}, 'approval', 'responsibility'],
    ['another settlement', { settlementSignatureActionId: 'sig-other' }, 'responsibility', 'another settlement'],
    ['another FDA answer', { receiptSha256: '1'.repeat(64) }, 'responsibility', "another of FDA's answers"],
    ['no statement', { statement: '' }, 'responsibility', 'no statement'],
  ])('Gate 1 refuses a signature with %s, and voids it', async (_label, payload, meaning, words) => {
    const s = await releasedButReceived();
    const sig = await reopenSig(s.id, payload, meaning);
    expect(await outcome(recordHeldSendReopen({ sequenceId: s.id, signatureActionId: sig.id }, ctx)))
      .toMatchObject({ code: 'GOVERNED_REQUIRED', message: expect.stringContaining(words) });
    expect(await voided(sig.id)).toBe(true);
    expect(await seqFull(s.id)).toMatchObject({ dispatch_status: 'pending' });
  }, 120_000);

  it('the statement is compared word for word: one character changed is refused', async () => {
    const s = await releasedButReceived();
    const pre = await precheckHeldSendReopen(s.id, ctx);
    const sig = await reopenSig(s.id, { statement: `${pre.reopen!.statement}.` });
    expect(await outcome(recordHeldSendReopen({ sequenceId: s.id, signatureActionId: sig.id }, ctx)))
      .toMatchObject({ code: 'GOVERNED_REQUIRED', message: expect.stringContaining('what it states is not what the record of sequence 0000 shows now') });
  }, 120_000);

  it('judged again under the lock: a sequence sent again after the first read is refused, the signature void', async () => {
    const s = await releasedButReceived();
    const sig = await reopenSig(s.id);
    holder.afterFirstFacts = async () => {
      await q(`UPDATE ectd_sequences SET dispatch_status = 'transmitting', transmit_signature_action_id = 'sig-again', transmit_attempt_id = $2::uuid WHERE id = $1`,
        [s.id, 'b1000000-0000-4000-8000-000000000002']);
    };
    const err = await outcome(recordHeldSendReopen({ sequenceId: s.id, signatureActionId: sig.id }, ctx));
    expect(holder.afterFirstFacts).toBeNull();
    expect(err).toMatchObject({ code: 'HELD_SEND_NOT_REOPENABLE', message: expect.stringContaining('no longer where its release left it') });
    expect(await voided(sig.id)).toBe(true);
  }, 120_000);

  it('a signature with no reason re-opens nothing', async () => {
    const s = await releasedButReceived();
    const sig = await reopenSig(s.id);
    await q(`UPDATE electronic_signatures SET signature_purpose = NULL WHERE (signature_manifest::jsonb ->> 'actionId') = $1`, [sig.id]);
    expect(await outcome(recordHeldSendReopen({ sequenceId: s.id, signatureActionId: sig.id }, ctx)))
      .toMatchObject({ code: 'GOVERNED_REQUIRED', message: expect.stringContaining('records no reason') });
    expect(await seqFull(s.id)).toMatchObject({ dispatch_status: 'pending' });
  }, 120_000);
});
