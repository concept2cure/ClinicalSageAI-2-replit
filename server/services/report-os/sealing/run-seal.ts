/**
 * Read a finalized run's seal back, and re-verify it (reporting review
 * 2026-10-01, Part 11 lens: "the report seal cannot be re-verified").
 *
 * Finalize stored only `{ seal, finalizedAt }`, over a render stamped with the
 * moment of sealing that nothing could reproduce, and nothing read it again:
 * tamper-evidence was claimed and could not be exercised. Finalize now stores
 * the exact sealed document beside its seal (routes/report-os.ts,
 * writeFinalize) and records `documentStored` on its chain row; this reads all
 * three records of the act back:
 *
 *   - the seal and the sealed document on the run's latest snapshot (mutable:
 *     the app role writes report_snapshots);
 *   - the `report_os.run_finalized` row on the append-only audit chain: the
 *     seal hash, sealing time, atom count, algorithm, canonicalizer, reason,
 *     meaning and prior status, bound to the row's payload_hash;
 *   - the electronic_signatures row for `report-run:<id>`: the signer's printed
 *     name, the time and the meaning (21 CFR 11.50).
 *
 * The chain row is the record of the act; the snapshot is checked against it.
 * Every field the read returns under "intact" is one that was checked: the
 * stored seal against the chain row field by field, the stored document by
 * recomputing its hash and its provenance atoms. A finalization recorded with
 * `documentStored` whose seal or document is now missing is a mismatch, not a
 * legacy record. A run whose status no longer says final while the chain
 * records its finalization is a mismatch too. Only a run sealed before the
 * document was stored, and whose stored seal agrees with what the chain
 * recorded, is "not verifiable"; a read that fails throws, so the caller
 * answers with an error, never a verdict.
 * The chain row is trusted only as far as the chain vouches for it: it must
 * hold a chain position, re-derive from its predecessor and, where the audit
 * HMAC key is configured, carry a valid seal (audit/chain-row.ts
 * verifySequencedRow). A row the app role could insert without the key is
 * therefore not the record. The finalization's electronic signature must exist
 * and must have signed the same seal hash. The run's status is read inside the
 * same transaction, after the chain, so a finalize committing between the two
 * reads is not mistaken for a rewrite.
 * (Adversarial reviews of this change, 2026-10-01: fifteen confirmed findings,
 * all addressed here.)
 *
 * @module server/services/report-os/sealing/run-seal
 */
import { createHash } from 'crypto';
import type { RenderedReport } from '../render/types';
import type { SealedRecord } from './types';
import { computeContentHash, extractProvenanceAtoms } from './seal';
import { readCanonVersion } from '../../../../shared/versioned-digest.js';
import { verifySequencedRow, type SequencedRowVerdict } from '../../audit/chain-row.js';

export type SealVerdict = 'intact' | 'mismatch' | 'not-verifiable';

export interface SealCheck {
  check: 'audit-chain' | 'stored-seal' | 'stored-document' | 'signature';
  ok: boolean;
  detail: string;
}

/** What the audit chain recorded about one finalization, and how far the chain vouches for the row. */
export interface ChainRecord {
  sealHash: string | null;
  sealedAt: string | null;
  atomCount: number | null;
  algorithm: string | null;
  canonVersion: number | null;
  /** Finalize recorded that it stored the sealed document (finalizations since 2026-10-01). */
  documentStored: boolean;
  /** The row's recorded content hashes to its payload_hash. */
  payloadBound: boolean;
  /** The row's place on the tenant's audit chain (audit/chain.ts verifySequencedRow). */
  chained: SequencedRowVerdict;
  occurredAt: string | null;
  reason: string | null;
  meaning: string | null;
  priorStatus: string | null;
}

/** The finalization's electronic signature (11.50), with the seal hash its manifest signed. */
export interface SignatureRecord {
  signerName: string | null;
  signedAt: string | null;
  meaning: string | null;
  signedSealHash: string | null;
}

export interface RunSealView {
  runId: number;
  sealed: boolean;
  /** The seal as the audit chain recorded it; the stored copy is checked against it. */
  seal: { algorithm: string | null; contentHash: string | null; atomCount: number | null; sealedAt: string | null } | null;
  /** When the finalization was recorded on the audit chain. */
  finalizedAt: string | null;
  /** The signature manifestation (11.50), from electronic_signatures. */
  signature: { signerName: string | null; signedAt: string | null; meaning: string | null } | null;
  /** What the chain row recorded about the act. */
  finalization: { reason: string | null; meaning: string | null; priorStatus: string | null } | null;
  verification: { verdict: SealVerdict; checks: SealCheck[] };
}

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
}

type RunRef = { id: number; organizationId: number };

const text = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const iso = (v: unknown): string | null => (v instanceof Date ? v.toISOString() : text(v));
function safeJson(v: string): unknown {
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}
const asObject = (v: unknown): Record<string, unknown> | null => {
  const parsed = typeof v === 'string' ? safeJson(v) : v;
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
};
const short = (hash: string | null) => (hash ? `${hash.slice(0, 12)}…` : 'none');

/** Why the chain's place for the row fails, or null when it holds. */
function chainedFailure(chained: SequencedRowVerdict): string | null {
  if (chained.link === 'unsequenced') return 'The finalization row holds no position on the audit chain, so the chain does not vouch for it.';
  if (chained.link === 'broken') return "The finalization row does not link to the organisation's audit chain.";
  if (chained.seal === 'absent') return 'The finalization row carries no audit HMAC seal although the key is configured.';
  if (chained.seal === 'invalid') return "The finalization row's audit HMAC seal does not verify.";
  return null;
}

/** The chain check: exactly one finalization, bound to its payload hash, on the chain, with a seal hash. */
function chainCheck(chain: ChainRecord | null, rows: number): SealCheck {
  const fail = (detail: string): SealCheck => ({ check: 'audit-chain', ok: false, detail });
  if (rows > 1) return fail(`The audit chain holds ${rows} finalizations of this run; a run is finalized once.`);
  if (rows === 0 || !chain) return fail('The audit chain holds no finalization of this run.');
  if (!chain.payloadBound) return fail("The finalization row's recorded content no longer matches its payload hash.");
  const chained = chainedFailure(chain.chained);
  if (chained) return fail(chained);
  if (!chain.sealHash) return fail('The finalization row records no seal hash.');
  const keyed = chain.chained.seal === 'valid'
    ? 'and its audit HMAC seal verifies'
    : 'but no audit HMAC key is configured here, so the link is not checked against a key held outside the database';
  return { check: 'audit-chain', ok: true, detail: `The audit chain records seal ${short(chain.sealHash)}; the row links to the organisation's audit chain, ${keyed}.` };
}

/** A check that was not run because the chain's record it is compared with did not verify. */
const notChecked = (check: SealCheck['check'], chain: SealCheck): SealCheck => ({
  check,
  ok: false,
  detail: `Not checked: there is no verified record on the audit chain to compare it with (${chain.detail.replace(/\.$/, '')}).`,
});

/** The stored seal against the chain's record of it, field by field. */
function sealCheck(seal: SealedRecord | null, chain: ChainRecord): SealCheck {
  if (!seal) return { check: 'stored-seal', ok: false, detail: 'No seal is stored with this run.' };
  const differs: string[] = [];
  if (chain.sealHash !== seal.contentHash) differs.push('hash');
  if (chain.sealedAt != null && chain.sealedAt !== seal.sealedAt) differs.push('sealing time');
  if (chain.atomCount != null && chain.atomCount !== seal.atomCount) differs.push('atom count');
  if (chain.algorithm != null && chain.algorithm !== seal.algorithm) differs.push('algorithm');
  if (chain.canonVersion != null && chain.canonVersion !== readCanonVersion(seal.canonVersion)) differs.push('canonicalizer');
  return differs.length > 0
    ? { check: 'stored-seal', ok: false, detail: `The stored seal's ${differs.join(', ')} differ from the audit chain's record.` }
    : { check: 'stored-seal', ok: true, detail: 'The stored seal agrees with the audit chain, field by field.' };
}

/** The document's hash and provenance atom count, or null when it is not a document these can be computed over. */
function measure(doc: RenderedReport, canon: ReturnType<typeof readCanonVersion>): { hash: string; atoms: number } | null {
  try {
    return { hash: computeContentHash(doc, canon), atoms: extractProvenanceAtoms(doc).length };
  } catch {
    return null;
  }
}

/** The stored document, re-hashed and its atoms recounted, against the chain's record of the seal. */
function documentCheck(doc: RenderedReport | null, chain: ChainRecord): SealCheck {
  if (!doc) return { check: 'stored-document', ok: false, detail: 'No sealed document is stored with this run, so its hash cannot be recomputed.' };
  const measured = measure(doc, readCanonVersion(chain.canonVersion));
  if (!measured) return { check: 'stored-document', ok: false, detail: 'The stored document is malformed: its hash cannot be computed.' };
  if (measured.hash !== chain.sealHash) return { check: 'stored-document', ok: false, detail: 'The stored document no longer hashes to the recorded seal.' };
  if (chain.atomCount != null && measured.atoms !== chain.atomCount) {
    return { check: 'stored-document', ok: false, detail: `The stored document carries ${measured.atoms} provenance atoms; the seal records ${chain.atomCount}.` };
  }
  return { check: 'stored-document', ok: true, detail: 'The stored document hashes to the recorded seal, and its provenance atoms match.' };
}

/** The finalization's signature: present, and its manifest signed the seal the chain recorded. */
function signatureCheck(sig: SignatureRecord | null, chain: ChainRecord): SealCheck {
  if (!sig) return { check: 'signature', ok: false, detail: 'No electronic signature is recorded for this finalization.' };
  if (sig.signedSealHash !== chain.sealHash) {
    return { check: 'signature', ok: false, detail: "The electronic signature's manifest does not name the seal the audit chain recorded." };
  }
  return { check: 'signature', ok: true, detail: 'The electronic signature signed the seal the audit chain recorded.' };
}

export interface StoredSealInput {
  seal: SealedRecord | null;
  sealedDocument: RenderedReport | null;
  /** The run's latest snapshot row exists (a seal missing from it was removed, not never written). */
  snapshotFound: boolean;
  chain: ChainRecord | null;
  chainRows: number;
  signature: SignatureRecord | null;
}

/** The verdict when the chain's record verified: what finalize recorded storing must all be there and agree. */
function verdictOnRecord(input: StoredSealInput, chain: ChainRecord, checks: SealCheck[]): SealVerdict {
  const [, s, d, g] = checks;
  if (chain.documentStored) return s.ok && d.ok && g.ok ? 'intact' : 'mismatch';
  // A finalization from before the document was stored: its seal was stored whenever a snapshot existed.
  if (input.seal ? !s.ok : input.snapshotFound) return 'mismatch';
  if (input.sealedDocument) return s.ok && d.ok ? 'intact' : 'mismatch';
  return 'not-verifiable';
}

/** PURE: the verdict over what was read. */
export function verifyStoredSeal(input: StoredSealInput): { verdict: SealVerdict; checks: SealCheck[] } {
  const c = chainCheck(input.chain, input.chainRows);
  if (!c.ok || !input.chain) {
    const checks = [c, notChecked('stored-seal', c), notChecked('stored-document', c), notChecked('signature', c)];
    // No recorded finalization at all: a stored document exists only since finalize began recording one,
    // so a document without a chain row is a mismatch; a bare seal predates both and cannot be verified.
    if (input.chainRows === 0) return { verdict: input.sealedDocument ? 'mismatch' : 'not-verifiable', checks };
    return { verdict: 'mismatch', checks };
  }
  const chain = input.chain;
  const checks = [c, sealCheck(input.seal, chain), documentCheck(input.sealedDocument, chain), signatureCheck(input.signature, chain)];
  return { verdict: verdictOnRecord(input, chain, checks), checks };
}

/** The seal and sealed document on the run's latest snapshot, and whether that snapshot exists. */
export async function readSealedDocument(
  q: Queryable,
  run: RunRef,
): Promise<{ seal: SealedRecord | null; sealedDocument: RenderedReport | null; snapshotFound: boolean }> {
  const { rows } = await q.query(
    `SELECT snapshot_metadata FROM report_snapshots
      WHERE run_id = $1 AND organization_id = $2 AND is_latest = true
      ORDER BY id DESC LIMIT 1`,
    [run.id, run.organizationId],
  );
  const meta = asObject(rows[0]?.snapshot_metadata);
  const seal = asObject(meta?.seal) as SealedRecord | null;
  const doc = asObject(meta?.sealedDocument) as RenderedReport | null;
  return {
    seal: seal && typeof seal.contentHash === 'string' ? seal : null,
    sealedDocument: doc && Array.isArray((doc as { sections?: unknown }).sections) ? doc : null,
    snapshotFound: rows.length > 0,
  };
}

/** Every finalization row the chain holds for the run (at most a few), read as the chain wrote it. */
async function readChainRows(q: Queryable, run: RunRef): Promise<Array<Record<string, unknown>>> {
  const { rows } = await q.query(
    `SELECT new_values::text AS nv, payload_hash, occurred_at, tenant_id, action, actor_id, target,
            sha256_chain, hmac_seal, chain_seq
       FROM audit_logs
      WHERE tenant_id = $1 AND record_id = $2 AND action = 'report_os.run_finalized'
      ORDER BY occurred_at ASC LIMIT 5`,
    [run.organizationId, String(run.id)],
  );
  return rows;
}

/** One finalization row as a ChainRecord, its place on the chain verified. */
async function toChainRecord(q: Queryable, row: Record<string, unknown>): Promise<ChainRecord> {
  const raw = typeof row.nv === 'string' ? row.nv : '';
  const d = asObject(raw) ?? {};
  const chained = await verifySequencedRow(q, {
    action: String(row.action ?? ''),
    actor_id: num(row.actor_id),
    target: text(row.target),
    payload_hash: text(row.payload_hash),
    occurred_at: row.occurred_at instanceof Date ? row.occurred_at : String(row.occurred_at ?? ''),
    tenant_id: (row.tenant_id as number | string | null) ?? null,
    sha256_chain: text(row.sha256_chain),
    hmac_seal: text(row.hmac_seal),
    chain_seq: (row.chain_seq as number | string | null) ?? null,
  });
  return {
    sealHash: text(d.sealHash),
    sealedAt: text(d.sealedAt),
    atomCount: num(d.atomCount),
    algorithm: text(d.algorithm),
    canonVersion: num(d.canonVersion),
    documentStored: d.documentStored === true,
    payloadBound: raw !== '' && createHash('sha256').update(raw, 'utf8').digest('hex') === row.payload_hash,
    chained,
    occurredAt: iso(row.occurred_at),
    reason: text(d.reason),
    meaning: text(d.meaning),
    priorStatus: text(d.priorStatus),
  };
}

/** The run's status as this transaction now sees it, or null when the run is gone. */
async function readRunStatus(q: Queryable, run: RunRef): Promise<string | null> {
  const { rows } = await q.query('SELECT status FROM report_runs WHERE id = $1 AND organization_id = $2', [run.id, run.organizationId]);
  return text(rows[0]?.status);
}

/** The finalization's current signature row, with the seal hash its manifest signed. */
async function readSignature(q: Queryable, run: RunRef): Promise<SignatureRecord | null> {
  const { rows } = await q.query(
    `SELECT signer_name, signed_at, signature_meaning, signature_manifest::text AS manifest FROM electronic_signatures
      WHERE organization_id = $1 AND signed_target = $2 AND superseded_by IS NULL
      ORDER BY signed_at DESC LIMIT 1`,
    [run.organizationId, `report-run:${run.id}`],
  );
  const sig = rows[0];
  if (!sig) return null;
  const act = asObject(asObject(sig.manifest)?.act);
  return { signerName: text(sig.signer_name), signedAt: iso(sig.signed_at), meaning: text(sig.signature_meaning), signedSealHash: text(act?.sealHash) };
}

/**
 * The chain's finalization rows and the run's status, read in that order: a
 * finalize commits both together, so a status of final read after the chain
 * found nothing means the finalize committed in between, and the chain is
 * read again.
 */
async function readChainThenStatus(q: Queryable, run: RunRef) {
  let rows = await readChainRows(q, run);
  const status = await readRunStatus(q, run);
  if (status === 'final' && rows.length === 0) rows = await readChainRows(q, run);
  return { rows, status };
}

/** A run the chain records as finalized, whose status no longer says final. */
const statusContradicts = (status: string | null): SealCheck => ({
  check: 'audit-chain',
  ok: false,
  detail: `The audit chain records this run as finalized, but the run is now marked "${status ?? 'missing'}".`,
});

interface SealRecordRead {
  status: string | null;
  chain: ChainRecord | null;
  stored: Awaited<ReturnType<typeof readSealedDocument>> | null;
  signature: SignatureRecord | null;
  verification: { verdict: SealVerdict; checks: SealCheck[] };
}

/** Everything the seal readers return, read in one transaction and verified. Throws when a read fails. */
async function readSealRecord(q: Queryable, run: RunRef): Promise<SealRecordRead> {
  const { rows, status } = await readChainThenStatus(q, run);
  if (status !== 'final') {
    const verification = rows.length > 0
      ? { verdict: 'mismatch' as const, checks: [statusContradicts(status)] }
      : { verdict: 'not-verifiable' as const, checks: [] };
    return { status, chain: null, stored: null, signature: null, verification };
  }
  const chain = rows.length === 1 ? await toChainRecord(q, rows[0]) : null;
  const stored = await readSealedDocument(q, run);
  const signature = await readSignature(q, run);
  const verification = verifyStoredSeal({ ...stored, chain, chainRows: rows.length, signature });
  return { status, chain, stored, signature, verification };
}

/** The view of what was read: only what the chain recorded is returned as the seal. */
function viewOf(run: RunRef, r: SealRecordRead): RunSealView {
  const chain = r.chain;
  return {
    runId: run.id,
    sealed: r.status === 'final',
    seal: chain ? { algorithm: chain.algorithm, contentHash: chain.sealHash, atomCount: chain.atomCount, sealedAt: chain.sealedAt } : null,
    finalizedAt: chain?.occurredAt ?? null,
    signature: r.signature ? { signerName: r.signature.signerName, signedAt: r.signature.signedAt, meaning: r.signature.meaning } : null,
    finalization: chain ? { reason: chain.reason, meaning: chain.meaning, priorStatus: chain.priorStatus } : null,
    verification: r.verification,
  };
}

/** Read a run's seal, its chain row and its signature, and verify them. Throws when a read fails. */
export async function readRunSeal(q: Queryable, run: RunRef): Promise<RunSealView> {
  return viewOf(run, await readSealRecord(q, run));
}

/**
 * The stored sealed document of a run with its verdict, for a reader that
 * shows the document (GET /runs/:id/rendered): it is shown as sealed only when
 * it verifies. A run not marked final has no sealed document; it is a mismatch
 * when the chain records it as finalized, else not verifiable.
 */
export async function readVerifiedSealedDocument(
  q: Queryable,
  run: RunRef,
): Promise<{ verdict: SealVerdict; document: RenderedReport | null }> {
  const r = await readSealRecord(q, run);
  return { verdict: r.verification.verdict, document: r.stored?.sealedDocument ?? null };
}

/** The seal view and the verified sealed document together, for the PDF export. */
export async function readSealForExport(
  q: Queryable,
  run: RunRef,
): Promise<{ view: RunSealView; document: RenderedReport | null }> {
  const r = await readSealRecord(q, run);
  return { view: viewOf(run, r), document: r.verification.verdict === 'intact' ? (r.stored?.sealedDocument ?? null) : null };
}
