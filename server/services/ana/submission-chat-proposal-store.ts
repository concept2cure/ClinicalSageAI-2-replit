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

export interface ListProposalsOptions {
  threadId?: string;
  artifactId?: string;
  status?: ProposalStatus | ProposalStatus[];
  limit?: number;
  offset?: number;
}

/**
 * List proposals for a given org, optionally filtered by thread / artifact /
 * status. Caps limit at 100 to avoid runaway queries; default 25.
 */
export async function listProposals(
  organizationId: number,
  options: ListProposalsOptions = {}
): Promise<{ rows: RewriteProposalRecord[]; total: number }> {
  const filters: string[] = ['organization_id = $1'];
  const params: any[] = [organizationId];
  let n = 1;
  if (options.threadId) {
    n += 1;
    filters.push(`thread_id = $${n}`);
    params.push(options.threadId);
  }
  if (options.artifactId) {
    n += 1;
    filters.push(`artifact_id = $${n}`);
    params.push(options.artifactId);
  }
  if (options.status) {
    const statuses = Array.isArray(options.status)
      ? options.status
      : [options.status];
    n += 1;
    filters.push(`status = ANY($${n}::text[])`);
    params.push(statuses);
  }
  const where = `WHERE ${filters.join(' AND ')}`;
  const limit = Math.max(1, Math.min(options.limit ?? 25, 100));
  const offset = Math.max(0, options.offset ?? 0);

  try {
    const [rowsResult, countResult] = await Promise.all([
      pool.query(
        `SELECT *
           FROM ana_submission_chat_proposals
           ${where}
          ORDER BY created_at DESC
          LIMIT ${limit} OFFSET ${offset}`,
        params
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c
           FROM ana_submission_chat_proposals
           ${where}`,
        params
      ),
    ]);
    return {
      rows: rowsResult.rows.map(rowToRecord),
      total: countResult.rows[0]?.c ?? 0,
    };
  } catch (err: any) {
    if (isMissingTable(err)) return { rows: [], total: 0 };
    throw err;
  }
}

export interface ProposalLinkage {
  proposal: RewriteProposalRecord;
  audit: {
    auditId: string;
    timestamp: Date;
    userName: string;
    changeReason: string | null;
    metadata: any;
  } | null;
  artifactVersion: {
    id: number;
    version: number;
    contentHash: string | null;
    createdAt: Date;
  } | null;
  signature: {
    signatureId: string;
    signerName: string;
    signerEmail: string;
    signatureMeaning: string | null;
    signedAt: Date;
    secondFactorVerified: boolean;
  } | null;
}

/**
 * Fetch a proposal plus everything it links to: the audit row produced by
 * the apply, the artifact version it became, and the e-signature (if any).
 * Returns null when the proposal isn't found or is cross-tenant.
 */
export async function getProposalWithLinkage(
  proposalId: string,
  organizationId: number
): Promise<ProposalLinkage | null> {
  const proposal = await getProposalById(proposalId, organizationId);
  if (!proposal) return null;

  let audit: ProposalLinkage['audit'] = null;
  if (proposal.appliedAuditId) {
    try {
      const { rows } = await pool.query(
        `SELECT audit_id, timestamp, user_name, change_reason, metadata
           FROM regulatory_audit_logs
          WHERE audit_id = $1
            AND organization_id = $2
          LIMIT 1`,
        [proposal.appliedAuditId, organizationId]
      );
      if (rows.length > 0) {
        audit = {
          auditId: rows[0].audit_id,
          timestamp: rows[0].timestamp,
          userName: rows[0].user_name,
          changeReason: rows[0].change_reason,
          metadata: rows[0].metadata,
        };
      }
    } catch (err: any) {
      if (!isMissingTable(err)) {
        console.warn(
          '[AnA proposal-store] audit linkage load failed:',
          err?.message
        );
      }
    }
  }

  let artifactVersion: ProposalLinkage['artifactVersion'] = null;
  if (proposal.appliedVersionId) {
    try {
      const { rows } = await pool.query(
        `SELECT id, version, content_hash, created_at
           FROM concept2cure_artifact_versions
          WHERE id = $1
            AND organization_id = $2
          LIMIT 1`,
        [proposal.appliedVersionId, organizationId]
      );
      if (rows.length > 0) {
        artifactVersion = {
          id: rows[0].id,
          version: rows[0].version,
          contentHash: rows[0].content_hash,
          createdAt: rows[0].created_at,
        };
      }
    } catch (err: any) {
      if (!isMissingTable(err)) {
        console.warn(
          '[AnA proposal-store] artifact-version linkage load failed:',
          err?.message
        );
      }
    }
  }

  let signature: ProposalLinkage['signature'] = null;
  if (proposal.appliedVersionId) {
    try {
      const { rows } = await pool.query(
        `SELECT signature_id, signer_name, signer_email,
                signature_meaning, signed_at, second_factor_verified
           FROM concept2cure_signatures
          WHERE artifact_version_id = $1
            AND organization_id = $2
            AND status = 'active'
          ORDER BY signed_at DESC
          LIMIT 1`,
        [proposal.appliedVersionId, organizationId]
      );
      if (rows.length > 0) {
        signature = {
          signatureId: rows[0].signature_id,
          signerName: rows[0].signer_name,
          signerEmail: rows[0].signer_email,
          signatureMeaning: rows[0].signature_meaning,
          signedAt: rows[0].signed_at,
          secondFactorVerified: !!rows[0].second_factor_verified,
        };
      }
    } catch (err: any) {
      if (!isMissingTable(err)) {
        console.warn(
          '[AnA proposal-store] signature linkage load failed:',
          err?.message
        );
      }
    }
  }

  return { proposal, audit, artifactVersion, signature };
}

/**
 * Janitor: mark every pending proposal whose expires_at has passed as
 * 'expired'. Optionally scoped to a single organization. Returns the count
 * of rows updated. Safe to call repeatedly; idempotent.
 */
export async function sweepExpiredProposals(
  scope: { organizationId?: number } = {}
): Promise<{ expired: number }> {
  try {
    const params: any[] = [];
    let where = `status = 'pending' AND expires_at < NOW()`;
    if (scope.organizationId) {
      params.push(scope.organizationId);
      where += ` AND organization_id = $${params.length}`;
    }
    const result = await pool.query(
      `UPDATE ana_submission_chat_proposals
          SET status = 'expired'
        WHERE ${where}
        RETURNING id`,
      params
    );
    return { expired: result.rows.length };
  } catch (err: any) {
    if (isMissingTable(err)) return { expired: 0 };
    throw err;
  }
}
