/**
 * Submission-chat rewrite proposal store.
 *
 * Persists rewrite proposals server-side so the proposal → apply chain is
 * durable, auditable, and tamper-evident:
 *   - confirm_apply ("apply that") resolves to the latest pending proposal
 *     for the thread+artifact instead of trusting the client to re-send the
 *     payload.
 *   - apply-rewrite can take a proposalId in lieu of proposedContent; the
 *     stored content_hash is verified against the content used at apply
 *     time, so any tampering on the way through the client is detected.
 *   - applied proposals are marked with the audit_id + version_id they
 *     produced, so the audit chain reads end-to-end.
 *   - older pending proposals for the same artifact are auto-superseded
 *     when a new one lands, so a stale proposal can't be applied late.
 *   - expires_at bounds proposal lifetime (default 24h).
 *
 * Tolerates table-not-found (42P01) so dev/test envs without the migration
 * still work — the chat path stays functional but proposals don't persist.
 *
 * @module server/services/ana/submission-chat-proposal-store
 */
import crypto from 'node:crypto';
import { pool } from '../../db.js';

export type ProposalStatus = 'pending' | 'applied' | 'superseded' | 'expired';

export interface RewriteProposalRecord {
  id: string;
  threadId: string;
  artifactId: string;
  artifactPk: number;
  organizationId: number;
  projectId: number;
  sectionCode: string | null;
  targetAgency: string | null;
  rationale: string | null;
  proposedContent: string;
  contentHash: string;
  status: ProposalStatus;
  appliedAuditId: string | null;
  appliedVersionId: number | null;
  appliedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
  createdBy: number | null;
  claimVerification: unknown;
  claimStatusCounts: unknown;
}

function rowToRecord(row: any): RewriteProposalRecord {
  return {
    id: row.id,
    threadId: row.thread_id,
    artifactId: row.artifact_id,
    artifactPk: row.artifact_pk,
    organizationId: row.organization_id,
    projectId: row.project_id,
    sectionCode: row.section_code,
    targetAgency: row.target_agency,
    rationale: row.rationale,
    proposedContent: row.proposed_content,
    contentHash: row.content_hash,
    status: row.status,
    appliedAuditId: row.applied_audit_id,
    appliedVersionId: row.applied_version_id,
    appliedAt: row.applied_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    createdBy: row.created_by,
    claimVerification: row.claim_verification,
    claimStatusCounts: row.claim_status_counts,
  };
}

function isMissingTable(err: any): boolean {
  return err?.code === '42P01';
}

export interface PersistRewriteProposalInput {
  threadId: string;
  artifactId: string;
  artifactPk: number;
  organizationId: number;
  projectId: number;
  sectionCode?: string | null;
  targetAgency?: string | null;
  rationale?: string | null;
  proposedContent: string;
  claimVerification?: unknown;
  claimStatusCounts?: unknown;
  createdBy?: number | null;
  /** Override the default 24h TTL (in milliseconds). */
  ttlMs?: number;
}

export interface PersistedProposalHandle {
  id: string;
  contentHash: string;
  expiresAt: Date;
  supersededIds: string[];
}

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Persist a new pending proposal. Atomically supersedes any other pending
 * proposals for the same artifact so a stale "apply that" can't pick the
 * wrong proposal. Returns the new proposal id + content hash + ids of
 * proposals that were superseded.
 */
export async function persistRewriteProposal(
  input: PersistRewriteProposalInput
): Promise<PersistedProposalHandle | null> {
  const contentHash = crypto
    .createHash('sha256')
    .update(input.proposedContent)
    .digest('hex');
  const ttlMs = input.ttlMs ?? DEFAULT_TTL_MS;
  const expiresAt = new Date(Date.now() + ttlMs);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Supersede any existing pending proposals for the same artifact in the
    // same org. Different threads pointing at the same artifact also collapse
    // to the latest proposal — the audit chain still records each one.
    const supersedeResult = await client.query(
      `UPDATE ana_submission_chat_proposals
          SET status = 'superseded'
        WHERE artifact_id = $1
          AND organization_id = $2
          AND status = 'pending'
        RETURNING id`,
      [input.artifactId, input.organizationId]
    );

    const insertResult = await client.query(
      `INSERT INTO ana_submission_chat_proposals (
         thread_id, artifact_id, artifact_pk, organization_id, project_id,
         section_code, target_agency, rationale, proposed_content, content_hash,
         claim_verification, claim_status_counts, created_by, expires_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING id, content_hash, expires_at`,
      [
        input.threadId,
        input.artifactId,
        input.artifactPk,
        input.organizationId,
        input.projectId,
        input.sectionCode ?? null,
        input.targetAgency ?? null,
        input.rationale ?? null,
        input.proposedContent,
        contentHash,
        input.claimVerification != null
          ? JSON.stringify(input.claimVerification)
          : null,
        input.claimStatusCounts != null
          ? JSON.stringify(input.claimStatusCounts)
          : null,
        input.createdBy ?? null,
        expiresAt,
      ]
    );

    await client.query('COMMIT');

    return {
      id: insertResult.rows[0].id,
      contentHash: insertResult.rows[0].content_hash,
      expiresAt: insertResult.rows[0].expires_at,
      supersededIds: supersedeResult.rows.map((r: any) => r.id),
    };
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    if (isMissingTable(err)) return null;
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Look up the latest still-pending proposal for a (thread, artifact) pair.
 * Returns null when no pending proposal exists, the table is missing, or
 * the proposal has expired (in which case it's also marked expired).
 */
export async function getActiveProposalForThreadArtifact(
  threadId: string,
  artifactId: string,
  organizationId: number
): Promise<RewriteProposalRecord | null> {
  try {
    const { rows } = await pool.query(
      `SELECT *
         FROM ana_submission_chat_proposals
        WHERE thread_id = $1
          AND artifact_id = $2
          AND organization_id = $3
          AND status = 'pending'
        ORDER BY created_at DESC
        LIMIT 1`,
      [threadId, artifactId, organizationId]
    );
    if (rows.length === 0) return null;
    const record = rowToRecord(rows[0]);
    if (record.expiresAt && new Date(record.expiresAt).getTime() < Date.now()) {
      // Lazy-expire so getActiveProposal never returns a TTL'd one.
      await pool
        .query(
          `UPDATE ana_submission_chat_proposals
              SET status = 'expired'
            WHERE id = $1 AND status = 'pending'`,
          [record.id]
        )
        .catch(() => {});
      return null;
    }
    return record;
  } catch (err: any) {
    if (isMissingTable(err)) return null;
    throw err;
  }
}

/**
 * Fetch a specific proposal by id, scoped to the caller's organization.
 * Returns null when not found, org-mismatched, or table missing — callers
 * use that to surface PROPOSAL_NOT_FOUND distinctly from other errors.
 */
export async function getProposalById(
  proposalId: string,
  organizationId: number
): Promise<RewriteProposalRecord | null> {
  try {
    const { rows } = await pool.query(
      `SELECT *
         FROM ana_submission_chat_proposals
        WHERE id = $1
          AND organization_id = $2
        LIMIT 1`,
      [proposalId, organizationId]
    );
    return rows.length === 0 ? null : rowToRecord(rows[0]);
  } catch (err: any) {
    if (isMissingTable(err)) return null;
    throw err;
  }
}

/**
 * Mark a proposal as applied, linking the audit row and the new artifact
 * version it produced. Idempotent: if already applied, returns false but
 * doesn't error.
 */
export async function markProposalApplied(
  proposalId: string,
  appliedAuditId: string,
  appliedVersionId: number
): Promise<boolean> {
  try {
    const result = await pool.query(
      `UPDATE ana_submission_chat_proposals
          SET status = 'applied',
              applied_audit_id = $2,
              applied_version_id = $3,
              applied_at = NOW()
        WHERE id = $1
          AND status = 'pending'
        RETURNING id`,
      [proposalId, appliedAuditId, appliedVersionId]
    );
    return result.rows.length > 0;
  } catch (err: any) {
    if (isMissingTable(err)) return false;
    throw err;
  }
}
