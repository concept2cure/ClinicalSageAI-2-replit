/**
 * A declaration that a submission's US sequences were filed outside the
 * platform, as stored and as signed (D7, W5, 2026-10-29;
 * docs/design/FILED_ELSEWHERE_BASELINE_2026-10-29.md).
 *
 * The reads and the digest live here, apart from the act
 * (filed-sequence-baseline.ts), because the signature's content binder
 * (part11/governed-target-binders.ts) imports them, and the binders are loaded
 * by signature-persistence.ts: anything heavier here would close an import
 * cycle at startup.
 *
 * Every committed row is signed: the database refuses one without its
 * signature at COMMIT (migrations/20261029g_submission_filed_baselines.sql).
 *
 * @module server/services/submission-service/filed-sequence-baseline-content
 */
import { createHash } from 'crypto';

export const FILED_BASELINE_TARGET_PREFIX = 'submission-filed-baseline';
export const FILED_BASELINE_DIGEST_RECIPE = 'filed-sequence-baseline/v1' as const;
/** The only region a declaration covers (the canonical code, region-identity.ts). */
export const FILED_BASELINE_REGION = 'US' as const;

export interface FiledBaseline {
  id: string;
  submissionId: number;
  region: typeof FILED_BASELINE_REGION;
  /** Sequences 0000 to this one were filed outside the platform. */
  lastFiledSequence: string;
  /** The one of them that opened the Original Application. */
  originalSequence: string;
  evidenceVaultDocumentId: string;
  evidenceSha256: string;
  reason: string;
  declaredBy: number;
  declaredAt: string;
}

export interface BaselineQueryable {
  query(text: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

function baselineOf(r: Record<string, unknown>): FiledBaseline {
  const at = r.declared_at;
  return {
    id: String(r.id),
    submissionId: Number(r.submission_id),
    region: FILED_BASELINE_REGION,
    lastFiledSequence: String(r.last_filed_sequence),
    originalSequence: String(r.original_sequence),
    evidenceVaultDocumentId: String(r.evidence_vault_document_id),
    evidenceSha256: String(r.evidence_sha256),
    reason: String(r.reason),
    declaredBy: Number(r.declared_by),
    declaredAt: at instanceof Date ? at.toISOString() : String(at),
  };
}

/** The submission's current declaration: its latest. Null when none was made. */
export async function readCurrentFiledBaseline(q: BaselineQueryable, organizationId: number, submissionId: number): Promise<FiledBaseline | null> {
  const { rows } = await q.query(
    `SELECT id::text AS id, submission_id, region, last_filed_sequence, original_sequence,
            evidence_vault_document_id::text AS evidence_vault_document_id, evidence_sha256, reason, declared_by, declared_at
       FROM public.submission_filed_baselines
      WHERE organization_id = $1 AND submission_id = $2 AND region = $3
      ORDER BY declared_at DESC, id DESC LIMIT 1`,
    [organizationId, submissionId, FILED_BASELINE_REGION],
  );
  return rows[0] ? baselineOf(rows[0]) : null;
}

export async function readFiledBaselineById(q: BaselineQueryable, organizationId: number, id: string): Promise<FiledBaseline | null> {
  const { rows } = await q.query(
    `SELECT id::text AS id, submission_id, region, last_filed_sequence, original_sequence,
            evidence_vault_document_id::text AS evidence_vault_document_id, evidence_sha256, reason, declared_by, declared_at
       FROM public.submission_filed_baselines WHERE organization_id = $1 AND id = $2::uuid`,
    [organizationId, id],
  );
  return rows[0] ? baselineOf(rows[0]) : null;
}

/**
 * sha256 over what the declarer attests: the submission and region, the
 * sequences filed elsewhere, the one that opened the Original Application, and
 * the evidence (the Vault document and the sha256 of its bytes). No reason,
 * declarer or time: those are the signature's own.
 */
export function filedBaselineDigest(b: Pick<FiledBaseline,
  'submissionId' | 'region' | 'lastFiledSequence' | 'originalSequence' | 'evidenceVaultDocumentId' | 'evidenceSha256'>): string {
  const content = [
    FILED_BASELINE_DIGEST_RECIPE, b.submissionId, b.region, b.lastFiledSequence, b.originalSequence,
    b.evidenceVaultDocumentId, b.evidenceSha256,
  ];
  return createHash('sha256').update(JSON.stringify(content)).digest('hex');
}
