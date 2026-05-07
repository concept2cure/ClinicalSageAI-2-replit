/**
 * Apply a submission-chat rewrite to a Concept2Cure artifact.
 *
 * The submission-chat handler proposes a rewrite (e.g. "rewrite §4.1 for
 * EMA"); persisting it is a governed mutation that has to be:
 *   - explicitly confirmed by the user (a separate POST, never an auto-apply)
 *   - tenant-scoped (artifact must belong to the caller's organization)
 *   - reason-captured (21 CFR Part 11 — every change records WHY)
 *   - version-preserving (the prior content snapshots into
 *     concept2cure_artifact_versions before being overwritten)
 *   - audit-logged (regulatory_audit_logs UPDATE entry, GxP-relevant)
 *
 * The new artifact lands in status='draft'. Approval / lock is a separate
 * governance step that already exists — this service deliberately stops
 * short of it so a single click never produces a submission-ready document.
 *
 * @module server/services/ana/submission-chat-apply-rewrite
 */
import crypto from 'node:crypto';
import { pool } from '../../db.js';

export interface ApplyRewriteInput {
  artifactId: string;
  proposedContent: string;
  /** WHY the change is being made — required for 21 CFR Part 11 audit trail. */
  reasonForChange: string;
  /** Optional structured metadata captured alongside the rewrite. */
  sectionCode?: string | null;
  targetAgency?: string | null;
  rationale?: string | null;
  threadId?: string | null;
  /** Tenant + actor — populated from auth middleware in the route. */
  organizationId: number;
  userId: number;
  userName?: string | null;
  userRole?: string | null;
  ipAddress?: string | null;
}

export interface ApplyRewriteResult {
  artifactId: string;
  artifactPk: number;
  previousVersion: number;
  newVersion: number;
  status: 'draft';
  contentHash: string;
  versionSnapshotId: string;
  auditId: string;
}

const REASON_MIN_CHARS = 8;
const REASON_MAX_CHARS = 2000;
const CONTENT_MIN_CHARS = 8;
const CONTENT_MAX_CHARS = 200_000;

function fail(code: string, message: string): never {
  const err = new Error(message);
  (err as any).code = code;
  throw err;
}

export async function applyRewrite(
  input: ApplyRewriteInput
): Promise<ApplyRewriteResult> {
  if (!input.artifactId) fail('INVALID_REQUEST', 'artifactId is required');
  if (!input.proposedContent || input.proposedContent.length < CONTENT_MIN_CHARS) {
    fail('INVALID_REQUEST', 'proposedContent is too short');
  }
  if (input.proposedContent.length > CONTENT_MAX_CHARS) {
    fail('INVALID_REQUEST', 'proposedContent exceeds the size limit');
  }
  const reason = (input.reasonForChange || '').trim();
  if (reason.length < REASON_MIN_CHARS) {
    fail(
      'REASON_REQUIRED',
      'reasonForChange is required and must explain WHY the rewrite is being applied'
    );
  }
  if (reason.length > REASON_MAX_CHARS) {
    fail('INVALID_REQUEST', 'reasonForChange exceeds the size limit');
  }

  const client = await pool.connect();
  const now = new Date();
  const newContent = input.proposedContent;
  const contentHash = crypto.createHash('sha256').update(newContent).digest('hex');

  try {
    await client.query('BEGIN');

    // ── Lock the artifact row to prevent concurrent rewrites racing ─────
    const cur = await client.query(
      `SELECT id, artifact_id, project_id, organization_id,
              version, content, content_hash, title, status, ctd_section
         FROM concept2cure_artifacts
        WHERE artifact_id = $1
        FOR UPDATE`,
      [input.artifactId]
    );

    if (cur.rows.length === 0) {
      fail('ARTIFACT_NOT_FOUND', `Artifact not found: ${input.artifactId}`);
    }
    const row = cur.rows[0];

    if (Number(row.organization_id) !== Number(input.organizationId)) {
      fail(
        'ARTIFACT_ORG_MISMATCH',
        'Artifact does not belong to this organization'
      );
    }
    if (row.status === 'locked' || row.status === 'approved') {
      fail(
        'ARTIFACT_LOCKED',
        `Cannot rewrite artifact in status="${row.status}". Unlock or branch a new draft first.`
      );
    }

    // No-op detection: same hash → don't churn versions or audit.
    if (row.content_hash && row.content_hash === contentHash) {
      fail('REWRITE_NOOP', 'Proposed content is identical to the current version');
    }

    // ── 1. Snapshot the current version BEFORE overwriting ─────────────
    const snapshotResult = await client.query(
      `INSERT INTO concept2cure_artifact_versions
         (artifact_id, version, content, title, status, created_by, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        row.id,
        row.version || 1,
        row.content,
        row.title,
        row.status,
        input.userId,
        JSON.stringify({
          source: 'submission_chat_rewrite_predecessor',
          predecessorOf: contentHash,
        }),
      ]
    );
    const versionSnapshotId = String(snapshotResult.rows[0].id);

    // ── 2. Overwrite the artifact, bump version, force status=draft ─────
    const newVersion = (Number(row.version) || 1) + 1;
    await client.query(
      `UPDATE concept2cure_artifacts
          SET content = $2,
              content_hash = $3,
              version = $4,
              status = 'draft',
              metadata = COALESCE(metadata, '{}'::jsonb) || $5::jsonb,
              updated_at = NOW()
        WHERE id = $1`,
      [
        row.id,
        newContent,
        contentHash,
        newVersion,
        JSON.stringify({
          lastRewrite: {
            at: now.toISOString(),
            by: input.userId,
            via: 'submission_chat',
            threadId: input.threadId ?? null,
            sectionCode: input.sectionCode ?? row.ctd_section ?? null,
            targetAgency: input.targetAgency ?? null,
            rationale: input.rationale ?? null,
            reasonForChange: reason,
            previousVersion: Number(row.version) || 1,
            previousContentHash: row.content_hash ?? null,
          },
        }),
      ]
    );

    // ── 3. Audit log entry — UPDATE, GxP-relevant, reason captured ─────
    // change_reason is the canonical 21 CFR Part 11 column for the WHY.
    const auditId = `audit_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    await client.query(
      `INSERT INTO regulatory_audit_logs (
         audit_id, organization_id, entity_type, entity_id, action, action_category,
         previous_value, new_value, change_reason, user_id, user_name, user_role,
         ip_address, is_gxp_relevant, timestamp, metadata, created_at, updated_at
       ) VALUES ($1,$2,'artifact',$3,'UPDATE','data-change',$4,$5,$6,$7,$8,$9,$10,TRUE,$11,$12,$11,$11)`,
      [
        auditId,
        input.organizationId,
        input.artifactId,
        JSON.stringify({
          version: Number(row.version) || 1,
          contentHash: row.content_hash ?? null,
          status: row.status,
        }),
        JSON.stringify({
          version: newVersion,
          contentHash,
          status: 'draft',
        }),
        reason,
        input.userId,
        input.userName ?? `user-${input.userId}`,
        input.userRole ?? 'regulatory',
        input.ipAddress ?? 'ip-not-captured',
        now,
        JSON.stringify({
          source: 'submission_chat_rewrite',
          threadId: input.threadId ?? null,
          sectionCode: input.sectionCode ?? row.ctd_section ?? null,
          targetAgency: input.targetAgency ?? null,
          rationale: input.rationale ?? null,
          versionSnapshotId,
        }),
      ]
    );

    await client.query('COMMIT');

    return {
      artifactId: row.artifact_id,
      artifactPk: row.id,
      previousVersion: Number(row.version) || 1,
      newVersion,
      status: 'draft',
      contentHash,
      versionSnapshotId,
      auditId,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
