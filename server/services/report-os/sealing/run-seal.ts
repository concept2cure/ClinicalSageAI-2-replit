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
 * (Adversarial review of this change, 2026-10-01: ten confirmed findings, all
 * addressed here.)
 *
 * @module server/services/report-os/sealing/run-seal
 */
import { createHash } from 'crypto';
import type { RenderedReport } from '../render/types';
import type { SealedRecord } from './types';
import { computeContentHash, extractProvenanceAtoms } from './seal';
import { readCanonVersion } from '../../../../shared/versioned-digest.js';

export type SealVerdict = 'intact' | 'mismatch' | 'not-verifiable';

export interface SealCheck {
  check: 'audit-chain' | 'stored-seal' | 'stored-document';
  ok: boolean;
  detail: string;
}

/** What the audit chain recorded about one finalization. */
export interface ChainRecord {
  sealHash: string | null;
  sealedAt: string | null;
  atomCount: number | null;
  algorithm: string | null;
  canonVersion: number | null;
  /** Finalize recorded that it stored the sealed document (finalizations since 2026-10-01). */
  documentStored: boolean;
  /** The row's recorded content hashes to its payload_hash, which the chain links. */
  payloadBound: boolean;
  occurredAt: string | null;
  reason: string | null;
  meaning: string | null;
  priorStatus: string | null;
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

/** The chain check: exactly one finalization, bound to its payload hash, with a seal hash. */
function chainCheck(chain: ChainRecord | null, rows: number): SealCheck {
  if (rows > 1) {
    return { check: 'audit-chain', ok: false, detail: `The audit chain holds ${rows} finalizations of this run; a run is finalized once.` };
  }
  if (rows === 0 || !chain) return { check: 'audit-chain', ok: false, detail: 'The audit chain holds no finalization of this run.' };
  if (!chain.payloadBound) {
    return { check: 'audit-chain', ok: false, detail: "The finalization row's recorded content no longer matches its payload hash." };
  }
  if (!chain.sealHash) return { check: 'audit-chain', ok: false, detail: 'The finalization row records no seal hash.' };
  return {
    check: 'audit-chain',
    ok: true,
    detail: `The audit chain records seal ${short(chain.sealHash)}; the row's content matches its payload hash, and the chain link itself is verified by the audit-trail integrity report.`,
  };
}

/** The stored seal against the chain's record of it, field by field. */
function sealCheck(seal: SealedRecord | null, chain: ChainRecord | null): SealCheck {
  if (!seal) return { check: 'stored-seal', ok: false, detail: 'No seal is stored with this run.' };
  if (!chain) return { check: 'stored-seal', ok: false, detail: 'There is no recorded finalization to check the stored seal against.' };
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

/** The seal to check a document against: the chain's record when there is one, else the stored seal. */
function recordedSeal(seal: SealedRecord | null, chain: ChainRecord | null) {
  if (chain) return { hash: chain.sealHash, canon: readCanonVersion(chain.canonVersion), atoms: chain.atomCount };
  if (seal) return { hash: seal.contentHash, canon: readCanonVersion(seal.canonVersion), atoms: seal.atomCount };
  return null;
}

/** The stored document, re-hashed and its atoms recounted, against the recorded seal. */
function documentCheck(doc: RenderedReport | null, seal: SealedRecord | null, chain: ChainRecord | null): SealCheck {
  if (!doc) return { check: 'stored-document', ok: false, detail: 'No sealed document is stored with this run, so its hash cannot be recomputed.' };
  const recorded = recordedSeal(seal, chain);
  if (!recorded?.hash) return { check: 'stored-document', ok: false, detail: 'There is no recorded seal hash to check the stored document against.' };
  if (computeContentHash(doc, recorded.canon) !== recorded.hash) {
    return { check: 'stored-document', ok: false, detail: 'The stored document no longer hashes to the recorded seal.' };
  }
  const atoms = extractProvenanceAtoms(doc).length;
  const recordedAtoms = recorded.atoms;
  if (recordedAtoms != null && atoms !== recordedAtoms) {
    return { check: 'stored-document', ok: false, detail: `The stored document carries ${atoms} provenance atoms; the seal records ${recordedAtoms}.` };
  }
  return { check: 'stored-document', ok: true, detail: 'The stored document hashes to the recorded seal, and its provenance atoms match.' };
}

/** PURE: the verdict over what was read. */
export function verifyStoredSeal(input: {
  seal: SealedRecord | null;
  sealedDocument: RenderedReport | null;
  chain: ChainRecord | null;
  chainRows: number;
}): { verdict: SealVerdict; checks: SealCheck[] } {
  const { seal, sealedDocument, chain, chainRows } = input;
  const c = chainCheck(chain, chainRows);
  const s = sealCheck(seal, c.ok ? chain : null);
  const d = documentCheck(sealedDocument, seal, c.ok ? chain : null);
  const checks = [c, s, d];

  if (chainRows === 0) {
    // No recorded finalization. A stored document only exists since finalize
    // began recording one, so a document without a chain row is a mismatch; a
    // bare seal is a run sealed before either existed, and cannot be verified.
    return { verdict: sealedDocument ? 'mismatch' : 'not-verifiable', checks };
  }
  if (!c.ok) return { verdict: 'mismatch', checks };
  if (chain!.documentStored) {
    // Finalize recorded storing the document: anything missing was removed.
    return { verdict: s.ok && d.ok ? 'intact' : 'mismatch', checks };
  }
  // A finalization from before the document was stored.
  if (seal && !s.ok) return { verdict: 'mismatch', checks };
  if (sealedDocument) return { verdict: s.ok && d.ok ? 'intact' : 'mismatch', checks };
  return { verdict: 'not-verifiable', checks };
}

/** The seal and sealed document stored with a final run, or nulls when none were. */
export async function readSealedDocument(
  q: Queryable,
  run: { id: number; organizationId: number },
): Promise<{ seal: SealedRecord | null; sealedDocument: RenderedReport | null }> {
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
  };
}

/** Every finalization row the chain holds for the run (at most a few), read as the chain wrote it. */
async function readChainRecords(q: Queryable, run: { id: number; organizationId: number }): Promise<ChainRecord[]> {
  const { rows } = await q.query(
    `SELECT new_values::text AS nv, payload_hash, occurred_at FROM audit_logs
      WHERE tenant_id = $1 AND record_id = $2 AND action = 'report_os.run_finalized'
      ORDER BY occurred_at ASC LIMIT 5`,
    [run.organizationId, String(run.id)],
  );
  return rows.map((row) => {
    const raw = typeof row.nv === 'string' ? row.nv : '';
    const d = asObject(raw) ?? {};
    return {
      sealHash: text(d.sealHash),
      sealedAt: text(d.sealedAt),
      atomCount: num(d.atomCount),
      algorithm: text(d.algorithm),
      canonVersion: num(d.canonVersion),
      documentStored: d.documentStored === true,
      payloadBound: raw !== '' && createHash('sha256').update(raw, 'utf8').digest('hex') === row.payload_hash,
      occurredAt: iso(row.occurred_at),
      reason: text(d.reason),
      meaning: text(d.meaning),
      priorStatus: text(d.priorStatus),
    };
  });
}

/** The stored seal and document, the chain's record, and the verdict over them. */
async function loadAndVerify(q: Queryable, run: { id: number; organizationId: number }) {
  const stored = await readSealedDocument(q, run);
  const chainRows = await readChainRecords(q, run);
  const chain = chainRows.length === 1 ? chainRows[0] : null;
  const verification = verifyStoredSeal({
    seal: stored.seal,
    sealedDocument: stored.sealedDocument,
    chain,
    chainRows: chainRows.length,
  });
  return { stored, chain, verification };
}

/**
 * For a run not marked final: the chain check when the chain nonetheless
 * records a finalization of it, else null. The app role can write
 * report_runs.status, so a status rewritten after finalizing would otherwise
 * hide the act and let the run be re-rendered from live data as if never sealed.
 */
async function finalizedButNotFinal(q: Queryable, run: { id: number; organizationId: number; status: string }): Promise<SealCheck | null> {
  const rows = await readChainRecords(q, run);
  if (rows.length === 0) return null;
  return {
    check: 'audit-chain',
    ok: false,
    detail: `The audit chain records this run as finalized, but the run is now marked "${run.status}".`,
  };
}

/** Read a run's seal, its chain row and its signature, and verify them. Throws when a read fails. */
export async function readRunSeal(
  q: Queryable,
  run: { id: number; organizationId: number; status: string },
): Promise<RunSealView> {
  if (run.status !== 'final') {
    const contradiction = await finalizedButNotFinal(q, run);
    return {
      runId: run.id,
      sealed: false,
      seal: null,
      finalizedAt: null,
      signature: null,
      finalization: null,
      verification: contradiction ? { verdict: 'mismatch', checks: [contradiction] } : { verdict: 'not-verifiable', checks: [] },
    };
  }

  const { chain, verification } = await loadAndVerify(q, run);
  const signed = await q.query(
    `SELECT signer_name, signed_at, signature_meaning FROM electronic_signatures
      WHERE organization_id = $1 AND signed_target = $2 AND superseded_by IS NULL
      ORDER BY signed_at DESC LIMIT 1`,
    [run.organizationId, `report-run:${run.id}`],
  );
  const sig = signed.rows[0];

  return {
    runId: run.id,
    sealed: true,
    seal: chain
      ? { algorithm: chain.algorithm, contentHash: chain.sealHash, atomCount: chain.atomCount, sealedAt: chain.sealedAt }
      : null,
    finalizedAt: chain?.occurredAt ?? null,
    signature: sig
      ? { signerName: text(sig.signer_name), signedAt: iso(sig.signed_at), meaning: text(sig.signature_meaning) }
      : null,
    finalization: chain ? { reason: chain.reason, meaning: chain.meaning, priorStatus: chain.priorStatus } : null,
    verification,
  };
}

/**
 * The stored sealed document of a run with its verdict, for a reader that
 * shows the document (GET /runs/:id/rendered): it is shown as sealed only when
 * it verifies. A run not marked final has no sealed document; it is a mismatch
 * when the chain records it as finalized, else not verifiable.
 */
export async function readVerifiedSealedDocument(
  q: Queryable,
  run: { id: number; organizationId: number; status: string },
): Promise<{ verdict: SealVerdict; document: RenderedReport | null }> {
  if (run.status !== 'final') {
    return { verdict: (await finalizedButNotFinal(q, run)) ? 'mismatch' : 'not-verifiable', document: null };
  }
  const { stored, verification } = await loadAndVerify(q, run);
  return { verdict: verification.verdict, document: stored.sealedDocument };
}
