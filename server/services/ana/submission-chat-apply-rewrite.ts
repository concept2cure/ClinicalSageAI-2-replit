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
import { saveChatMessage } from '../chat-thread-helpers.js';

const UNSUPPORTED_RATIO_BLOCK_THRESHOLD = parseFloat(
  process.env.ANA_REWRITE_UNSUPPORTED_BLOCK_RATIO ?? '0.3'
);
const PARAGRAPH_MIN_CHARS = parseInt(
  process.env.ANA_REWRITE_PARAGRAPH_MIN_CHARS ?? '80',
  10
);

export interface ParagraphVerification {
  index: number;
  charCount: number;
  citationCount: number;
  status: 'cited' | 'uncited' | 'header';
  preview: string;
}

export interface RewriteVerification {
  totalParagraphs: number;
  meaningfulParagraphs: number;
  unsupportedParagraphs: number;
  unsupportedRatio: number;
  paragraphs: ParagraphVerification[];
  flags: Array<{ rule: string; severity: 'warn' | 'block'; message: string }>;
}

export interface RewriteDiffStats {
  oldLineCount: number;
  newLineCount: number;
  oldCharCount: number;
  newCharCount: number;
  linesAdded: number;
  linesRemoved: number;
  linesUnchanged: number;
}

/**
 * Per-paragraph citation density check. The proposed content has already had
 * the model do its citation work at rewrite time, so this isn't a re-grounding
 * pass — it's a structural check: every meaningful paragraph (≥80 chars,
 * not a header) should have at least one [SRC-n] marker. Headers and short
 * stubs are exempt. This catches regressions where the model dropped a
 * citation between the rewrite proposal and the apply call.
 */
export function verifyProposedContent(content: string): RewriteVerification {
  const paragraphs = content.split(/\n\s*\n+/).map(p => p.trim()).filter(Boolean);
  const result: ParagraphVerification[] = paragraphs.map((para, index) => {
    const isHeader =
      /^#{1,6}\s/.test(para) ||
      /^§\s*\d/.test(para) ||
      (para.length < PARAGRAPH_MIN_CHARS && /:$|^[A-Z][^.]{0,80}$/.test(para));
    const charCount = para.length;
    const citationCount = (para.match(/\[SRC-\d+\]/g) || []).length;
    const meaningful = !isHeader && charCount >= PARAGRAPH_MIN_CHARS;
    const status: ParagraphVerification['status'] = isHeader
      ? 'header'
      : citationCount > 0
        ? 'cited'
        : 'uncited';
    const preview = para.length > 160 ? `${para.slice(0, 160)}…` : para;
    return {
      index,
      charCount,
      citationCount,
      status: meaningful ? status : 'header',
      preview,
    };
  });

  const meaningful = result.filter(r => r.status !== 'header');
  const unsupported = meaningful.filter(r => r.status === 'uncited');
  const unsupportedRatio =
    meaningful.length === 0 ? 0 : unsupported.length / meaningful.length;

  const flags: RewriteVerification['flags'] = [];
  if (unsupported.length > 0) {
    flags.push({
      rule: 'UNCITED_PARAGRAPHS',
      severity:
        unsupportedRatio >= UNSUPPORTED_RATIO_BLOCK_THRESHOLD ? 'block' : 'warn',
      message: `${unsupported.length} of ${meaningful.length} meaningful paragraph${meaningful.length === 1 ? '' : 's'} lack [SRC-n] citations`,
    });
  }
  if (meaningful.length === 0) {
    flags.push({
      rule: 'NO_MEANINGFUL_CONTENT',
      severity: 'warn',
      message: 'Proposed content contains no paragraphs ≥ minimum length',
    });
  }

  return {
    totalParagraphs: paragraphs.length,
    meaningfulParagraphs: meaningful.length,
    unsupportedParagraphs: unsupported.length,
    unsupportedRatio,
    paragraphs: result,
    flags,
  };
}

/**
 * Compute basic line-level diff stats. Cheap O(n+m) using line-set diffs —
 * not as precise as a true LCS-based diff, but good enough to surface
 * "16 lines changed" in the apply response. The UI / reviewer can run a
 * proper diff on the snapshotted prior version when needed.
 */
export function computeRewriteDiffStats(
  oldContent: string,
  newContent: string
): RewriteDiffStats {
  const oldLines = oldContent.split(/\r?\n/);
  const newLines = newContent.split(/\r?\n/);

  // Multiset diff: counts how many copies of each line are in each side, then
  // takes the symmetric differences. Equal lines that appear in both sides
  // count as "unchanged" up to min(count_old, count_new).
  const counts = new Map<string, { o: number; n: number }>();
  for (const line of oldLines) {
    const e = counts.get(line) ?? { o: 0, n: 0 };
    e.o += 1;
    counts.set(line, e);
  }
  for (const line of newLines) {
    const e = counts.get(line) ?? { o: 0, n: 0 };
    e.n += 1;
    counts.set(line, e);
  }
  let linesAdded = 0;
  let linesRemoved = 0;
  let linesUnchanged = 0;
  for (const { o, n } of counts.values()) {
    linesUnchanged += Math.min(o, n);
    if (o > n) linesRemoved += o - n;
    if (n > o) linesAdded += n - o;
  }

  return {
    oldLineCount: oldLines.length,
    newLineCount: newLines.length,
    oldCharCount: oldContent.length,
    newCharCount: newContent.length,
    linesAdded,
    linesRemoved,
    linesUnchanged,
  };
}

/**
 * 21 CFR Part 11 electronic signature payload. Captured at the moment the
 * rewrite is applied so the signature is bound to the new artifact_version_id
 * the apply produces. Two of the three "what makes this a Part 11 signature"
 * elements are explicit here — meaning + signer identity. Authentication is
 * delegated to the upstream auth middleware (the user is already token-
 * authenticated when the route runs); the manifest records the method.
 */
export interface ApplyRewriteSignature {
  /** What the signer is attesting to (e.g. "I have reviewed and approve this rewrite"). */
  meaning: string;
  /** Optional override; defaults to the authenticated user's name. */
  signerName?: string | null;
  /** Optional override; defaults to the authenticated user's email. */
  signerEmail?: string | null;
  /** "password" | "sso" | "mfa" | "session" — defaults to "session". */
  authenticationMethod?: 'password' | 'sso' | 'mfa' | 'session';
  /** Optional second-factor flag. */
  secondFactorVerified?: boolean;
}

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
  /**
   * Optional Part 11 signature. Required when the artifact's metadata flags
   * requiresSignature=true; otherwise recorded if supplied, omitted if not.
   */
  signature?: ApplyRewriteSignature | null;
  /**
   * When the verification pass blocks on uncited paragraphs, the user can
   * explicitly acknowledge the warning to proceed. The acknowledgment is
   * audit-logged so it's defensible later.
   */
  acknowledgeUnsupported?: boolean;
  /** Tenant + actor — populated from auth middleware in the route. */
  organizationId: number;
  userId: number;
  userName?: string | null;
  userEmail?: string | null;
  userRole?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
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
  signatureId: string | null;
  signed: boolean;
  verification: RewriteVerification;
  diff: RewriteDiffStats;
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
              version, content, content_hash, title, status, ctd_section, metadata
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

    // ── Part 11 gate: artifacts marked requiresSignature MUST be signed.
    // Other artifacts may be signed optionally; the signature still gets
    // recorded and bound to the new version when supplied.
    const requiresSignature =
      row.metadata && row.metadata.requiresSignature === true;
    const hasSignature =
      !!input.signature && typeof input.signature.meaning === 'string' &&
      input.signature.meaning.trim().length >= 8;
    if (requiresSignature && !hasSignature) {
      fail(
        'SIGNATURE_REQUIRED',
        'This artifact requires an electronic signature on every rewrite. Provide signature.meaning attesting to the change.'
      );
    }

    // No-op detection: same hash → don't churn versions or audit.
    if (row.content_hash && row.content_hash === contentHash) {
      fail('REWRITE_NOOP', 'Proposed content is identical to the current version');
    }

    // ── Pre-apply verification: every meaningful paragraph should be cited.
    // Block if too many lack [SRC-n] markers, unless the user has explicitly
    // acknowledged the warning (acknowledgement is audit-logged below).
    const verification = verifyProposedContent(newContent);
    const blockingFlag = verification.flags.find(f => f.severity === 'block');
    if (blockingFlag && !input.acknowledgeUnsupported) {
      fail(
        'UNSUPPORTED_REWRITE',
        `${blockingFlag.message}. Set acknowledgeUnsupported=true to proceed.`
      );
    }

    const diff = computeRewriteDiffStats(
      typeof row.content === 'string' ? row.content : '',
      newContent
    );

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

    // ── 3. Optional Part 11 e-signature, bound to the NEW version row.
    // The signature hash combines meaning + signer + timestamp + content
    // so a recorded signature is immutably tied to a specific version.
    let signatureId: string | null = null;
    if (hasSignature && input.signature) {
      const signerName =
        input.signature.signerName?.trim() ||
        input.userName ||
        `user-${input.userId}`;
      const signerEmail =
        input.signature.signerEmail?.trim() ||
        input.userEmail ||
        `user-${input.userId}@unknown.local`;
      const authMethod = input.signature.authenticationMethod ?? 'session';
      const signatureSeed = [
        signerEmail,
        input.signature.meaning,
        contentHash,
        now.toISOString(),
      ].join('|');
      const signatureHash = crypto
        .createHash('sha256')
        .update(signatureSeed)
        .digest('hex');
      signatureId = `sig_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      await client.query(
        `INSERT INTO concept2cure_signatures (
           signature_id, artifact_id, artifact_version_id, organization_id,
           signature_type, signature_purpose, signature_meaning,
           signer_id, signer_name, signer_email, signer_role,
           authentication_method, authentication_timestamp,
           second_factor_verified, signature_hash, signature_manifest,
           ip_address, device_info, status, signed_at, created_at, updated_at
         ) VALUES (
           $1,$2,$3,$4,'electronic','rewrite_apply',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'active',$17,$17,$17
         )`,
        [
          signatureId,
          row.id,
          versionSnapshotId,
          input.organizationId,
          input.signature.meaning,
          input.userId,
          signerName,
          signerEmail,
          input.userRole ?? 'regulatory',
          authMethod,
          now,
          input.signature.secondFactorVerified ?? false,
          signatureHash,
          JSON.stringify({
            source: 'submission_chat_apply_rewrite',
            newVersion,
            previousVersion: Number(row.version) || 1,
            contentHash,
            previousContentHash: row.content_hash ?? null,
            reasonForChange: reason,
            threadId: input.threadId ?? null,
          }),
          input.ipAddress ?? null,
          JSON.stringify({ userAgent: input.userAgent ?? null }),
          now,
        ]
      );
    }

    // ── 4. Audit log entry — UPDATE, GxP-relevant, reason captured ─────
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
          signed: !!signatureId,
          signatureId,
          signatureRequired: !!requiresSignature,
          verification: {
            totalParagraphs: verification.totalParagraphs,
            meaningfulParagraphs: verification.meaningfulParagraphs,
            unsupportedParagraphs: verification.unsupportedParagraphs,
            unsupportedRatio: verification.unsupportedRatio,
            flags: verification.flags,
          },
          diff,
          acknowledgeUnsupported: !!input.acknowledgeUnsupported,
        }),
      ]
    );

    await client.query('COMMIT');

    // ── 5. Post a system note into the thread so the next submission-chat
    // turn sees that the rewrite was applied. Best-effort, outside the
    // transaction — the rewrite is durable regardless.
    if (input.threadId) {
      const note =
        `[apply] Rewrite v${Number(row.version) || 1}→v${newVersion} of ${row.artifact_id}` +
        ` applied. status=draft, audit_id=${auditId}` +
        (signatureId ? `, signature_id=${signatureId}` : ', signed=false') +
        (input.sectionCode || row.ctd_section
          ? `, section=${input.sectionCode ?? row.ctd_section}`
          : '') +
        (input.targetAgency ? `, agency=${input.targetAgency}` : '') +
        `. Reason: ${reason}`;
      try {
        await saveChatMessage(input.threadId, 'assistant', note, 'system');
      } catch (e: any) {
        if (e?.code !== '42P01') {
          console.warn(
            '[AnA submission-chat apply-rewrite] thread-note persist failed:',
            e?.message
          );
        }
      }
    }

    return {
      artifactId: row.artifact_id,
      artifactPk: row.id,
      previousVersion: Number(row.version) || 1,
      newVersion,
      status: 'draft',
      contentHash,
      versionSnapshotId,
      auditId,
      signatureId,
      signed: !!signatureId,
      verification,
      diff,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
