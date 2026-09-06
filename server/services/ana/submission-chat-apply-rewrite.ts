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
import { resolveSignerIdentity } from '../part11/resolve-signer-identity.js';
import { getPool } from '../../db/runtime.js';
import { saveChatMessage } from '../chat-thread-helpers.js';
import { recordArtifactProvenanceBestEffort } from '../provenance/artifact-provenance';
import {
  getProposalById,
  markProposalApplied,
} from './submission-chat-proposal-store.js';
import { emit as emitMetric } from './submission-chat-metrics.js';
import { enforceAuthorLineage } from '../clinical-regulatory-evidence/lineage-gate.js';

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
  /**
   * Either proposedContent (direct) or proposalId (preferred — resolves to
   * a server-side proposal whose content_hash is already pinned). When both
   * are provided, the proposalId path wins and the supplied proposedContent
   * is used as a tamper-detect cross-check.
   */
  proposedContent?: string;
  proposalId?: string;
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
  /** Set when the apply was driven by a stored proposal. */
  proposalId: string | null;
}

const REASON_MIN_CHARS = 8;
const REASON_MAX_CHARS = 2000;
const CONTENT_MIN_CHARS = 8;
const CONTENT_MAX_CHARS = 200_000;

/**
 * Schedule a citation refresh for an artifact. Resolves the org's UUID
 * (needed for project-scoped retrieval) and runs the citation engine.
 * Fire-and-forget by design — failures only log; the apply that triggered
 * us is already durable.
 *
 * Resolves org UUID lazily here (single SELECT) so the apply path doesn't
 * have to thread the UUID all the way through the route → service chain.
 */
async function scheduleAutoCitationRun(args: {
  artifactId: string;
  organizationId: number;
  userId: number;
}): Promise<void> {
  try {
    const { rows } = await getPool().query(
      `SELECT uuid FROM organizations WHERE id = $1 LIMIT 1`,
      [args.organizationId]
    );
    const orgUuid = rows[0]?.uuid as string | undefined;
    const { runCitationEngine } = await import('./citation-engine.js');
    await runCitationEngine(args.artifactId, args.organizationId, {
      persist: true,
      organizationUuid: orgUuid,
      userId: args.userId,
    });
  } catch (err: any) {
    // Already logged at the call site; this catch keeps the unhandled-
    // rejection promise from leaking.
    if (err?.code !== '42P01') {
      console.warn(
        '[AnA auto-citation] background run failed:',
        err?.message || err
      );
    }
  }
}

function fail(code: string, message: string): never {
  const err = new Error(message);
  (err as any).code = code;
  throw err;
}

/**
 * Preview a rewrite without mutating the artifact. Runs the same verification
 * and diff calculations the apply path does, against the current artifact's
 * persisted content + status. This lets the UI show a quality score and
 * change magnitude before the user confirms — and lets the apply path stay
 * a single confirm-then-commit step rather than a multi-stage handshake.
 *
 * Returns null if the artifact is missing or org-mismatched (the route
 * surfaces 404 / 403 distinctly via the same code paths the apply uses).
 */
export interface PreviewRewriteInput {
  artifactId: string;
  /** Either proposedContent (direct) or proposalId (server-side proposal). */
  proposedContent?: string;
  proposalId?: string;
  organizationId: number;
}

export interface PreviewRewriteResult {
  artifactId: string;
  currentVersion: number;
  currentStatus: string;
  proposedContentHash: string;
  isNoOp: boolean;
  isLocked: boolean;
  requiresSignature: boolean;
  blocked: boolean;
  blockingReasons: Array<{ code: string; message: string }>;
  verification: RewriteVerification;
  diff: RewriteDiffStats;
}

export async function previewRewrite(
  input: PreviewRewriteInput
): Promise<PreviewRewriteResult> {
  if (!input.artifactId) fail('INVALID_REQUEST', 'artifactId is required');

  let previewContent: string;
  if (input.proposalId) {
    const proposal = await getProposalById(
      input.proposalId,
      input.organizationId
    );
    if (!proposal) {
      fail('PROPOSAL_NOT_FOUND', 'Proposal not found or not accessible');
    }
    if (proposal.artifactId !== input.artifactId) {
      fail(
        'PROPOSAL_ARTIFACT_MISMATCH',
        'Proposal references a different artifact'
      );
    }
    previewContent = proposal.proposedContent;
  } else if (input.proposedContent) {
    if (input.proposedContent.length < CONTENT_MIN_CHARS) {
      fail('INVALID_REQUEST', 'proposedContent is too short');
    }
    if (input.proposedContent.length > CONTENT_MAX_CHARS) {
      fail('INVALID_REQUEST', 'proposedContent exceeds the size limit');
    }
    previewContent = input.proposedContent;
  } else {
    fail('INVALID_REQUEST', 'proposedContent or proposalId is required');
  }

  const { rows } = await getPool().query(
    `SELECT artifact_id, organization_id, version, content, content_hash, status, metadata
       FROM concept2cure_artifacts
      WHERE artifact_id = $1
      LIMIT 1`,
    [input.artifactId]
  );
  if (rows.length === 0) fail('ARTIFACT_NOT_FOUND', `Artifact not found: ${input.artifactId}`);
  const row = rows[0];
  if (Number(row.organization_id) !== Number(input.organizationId)) {
    fail('ARTIFACT_ORG_MISMATCH', 'Artifact does not belong to this organization');
  }

  const contentHash = crypto
    .createHash('sha256')
    .update(previewContent)
    .digest('hex');
  const isNoOp = !!row.content_hash && row.content_hash === contentHash;
  const isLocked = row.status === 'locked' || row.status === 'approved';
  const requiresSignature =
    !!row.metadata && row.metadata.requiresSignature === true;

  const verification = verifyProposedContent(previewContent);
  const diff = computeRewriteDiffStats(
    typeof row.content === 'string' ? row.content : '',
    previewContent
  );

  const blockingReasons: PreviewRewriteResult['blockingReasons'] = [];
  if (isLocked) {
    blockingReasons.push({
      code: 'ARTIFACT_LOCKED',
      message: `Artifact is in status="${row.status}" — unlock or branch a draft first.`,
    });
  }
  if (isNoOp) {
    blockingReasons.push({
      code: 'REWRITE_NOOP',
      message: 'Proposed content is identical to the current version.',
    });
  }
  const blockingFlag = verification.flags.find(f => f.severity === 'block');
  if (blockingFlag) {
    blockingReasons.push({
      code: 'UNSUPPORTED_REWRITE',
      message: `${blockingFlag.message}. Apply will require acknowledgeUnsupported=true.`,
    });
  }

  return {
    artifactId: row.artifact_id,
    currentVersion: Number(row.version) || 1,
    currentStatus: row.status,
    proposedContentHash: contentHash,
    isNoOp,
    isLocked,
    requiresSignature,
    blocked: blockingReasons.length > 0,
    blockingReasons,
    verification,
    diff,
  };
}

export async function applyRewrite(
  input: ApplyRewriteInput
): Promise<ApplyRewriteResult> {
  if (!input.artifactId) fail('INVALID_REQUEST', 'artifactId is required');

  // ── Resolve content. Two paths:
  //   - proposalId  → fetch from the proposal store, validate org + status,
  //                   refuse if expired / already applied / superseded; use
  //                   stored content (tamper-evident).
  //   - proposedContent → direct path (kept for non-chat callers and as a
  //                   fallback when the store is unavailable).
  // When both are provided, the proposalId wins and proposedContent is used
  // as a cross-check against the stored content_hash.
  let resolvedProposalId: string | null = null;
  let newContent: string;

  if (input.proposalId) {
    const proposal = await getProposalById(
      input.proposalId,
      input.organizationId
    );
    if (!proposal) {
      fail(
        'PROPOSAL_NOT_FOUND',
        'Proposal not found or not accessible to this organization'
      );
    }
    if (proposal.artifactId !== input.artifactId) {
      fail(
        'PROPOSAL_ARTIFACT_MISMATCH',
        'Proposal references a different artifact'
      );
    }
    if (proposal.status === 'applied') {
      fail('PROPOSAL_ALREADY_APPLIED', 'Proposal has already been applied');
    }
    if (proposal.status === 'superseded') {
      fail(
        'PROPOSAL_SUPERSEDED',
        'A newer proposal for this artifact has superseded this one'
      );
    }
    if (proposal.status === 'expired') {
      fail('PROPOSAL_EXPIRED', 'Proposal has expired');
    }
    if (
      proposal.expiresAt &&
      new Date(proposal.expiresAt).getTime() < Date.now()
    ) {
      fail('PROPOSAL_EXPIRED', 'Proposal has expired');
    }
    if (input.proposedContent) {
      // Cross-check the client-supplied content against the stored hash.
      const clientHash = crypto
        .createHash('sha256')
        .update(input.proposedContent)
        .digest('hex');
      if (clientHash !== proposal.contentHash) {
        fail(
          'PROPOSAL_HASH_MISMATCH',
          'Supplied proposedContent does not match the stored proposal hash'
        );
      }
    }
    resolvedProposalId = proposal.id;
    newContent = proposal.proposedContent;
  } else {
    if (!input.proposedContent || input.proposedContent.length < CONTENT_MIN_CHARS) {
      fail('INVALID_REQUEST', 'proposedContent or proposalId is required');
    }
    if (input.proposedContent.length > CONTENT_MAX_CHARS) {
      fail('INVALID_REQUEST', 'proposedContent exceeds the size limit');
    }
    newContent = input.proposedContent;
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

  const client = await getPool().connect();
  const now = new Date();
  const contentHash = crypto.createHash('sha256').update(newContent).digest('hex');

  try {
    await client.query('BEGIN');

    // ── Who is doing this, resolved once, before anything is written ────
    // Both the §11.10(e) audit row (`user_name`) and the §11.50 signature
    // (`signer_name`) are NOT NULL, and that is why this file used to invent
    // `user-${id}` for one and `user-${id}@unknown.local` for the other. A
    // column that forbids null is not a reason to write something in its place.
    //
    // A GxP-relevant data change with no attributable actor should not be
    // recorded at all, so this throws and the transaction rolls back. The route
    // above already requires an authenticated tenant, so reaching here with an
    // unattributable signer means something upstream is broken — precisely when
    // inventing an actor is least defensible.
    const actor = await resolveSignerIdentity(
      client,
      input.userId,
      input.organizationId,
      'rewrite_apply',
    );
    const auditUserName = actor.name;

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
    //
    // HISTORY (2026-08-14). This statement named `title`, `status`,
    // `created_by` and `metadata` — none of which exist on
    // concept2cure_artifact_versions — and omitted `organization_id` and
    // `content_hash`, both NOT NULL. It raised 42703 inside this transaction,
    // so the whole apply rolled back: POST /api/ana/submission-chat/apply-rewrite
    // returned 500 for every call on any migration-provisioned database. No
    // test covered this module, which is how it survived.
    //
    // The columns below are the intersection of BOTH lineages of this table
    // (migrations/0000_sweet_joseph.sql and
    // db/migrations/20260311_concept2cure_artifacts.sql). `updated_at` is
    // deliberately NOT written even though the drizzle definition declares it:
    // neither SQL migration creates that column, so writing it would fail on
    // exactly the databases this fix exists to serve.
    const predecessorContent = typeof row.content === 'string' ? row.content : '';
    const snapshotResult = await client.query(
      `INSERT INTO concept2cure_artifact_versions
         (artifact_id, organization_id, version, content, content_hash,
          change_description, created_by_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        row.id,
        input.organizationId,
        row.version || 1,
        predecessorContent,
        // Digest of the PREDECESSOR's own bytes — the row being preserved.
        // Storing the incoming content's hash here would label the superseded
        // version with the digest of the text that replaced it.
        crypto.createHash('sha256').update(predecessorContent, 'utf8').digest('hex'),
        `Superseded by AnA submission-chat rewrite (new content ${contentHash.slice(0, 12)}…)`,
        input.userId,
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

    /* Lineage in the same transaction as the overwrite (ledger L160): the
       rewrite carries no parked Data Room sources, so every clause of the new
       text is recorded as the acting user's assertion, and a gap rolls the
       rewrite back with its snapshot. */
    await enforceAuthorLineage(
      client,
      input.organizationId,
      { documentTable: 'concept2cure_artifacts', documentId: String(row.id) },
      newContent,
      String(input.userId),
    );

    /* ── 2b. A version row for the NEW content ─────────────────────────────
       Without this the ledger holds only superseded states: the artifact's
       CURRENT content had no row of its own, so there was nothing for a
       signature to point at. That is why the e-signature below linked
       `artifact_version_id` to the PREDECESSOR snapshot while its own comment
       claimed it was "bound to the NEW version row" — an inspector following
       the link landed on the text that had just been replaced.

       Now the new version is recorded and the signature points at it. The
       UNIQUE(artifact_id, version) constraint is satisfied because the
       predecessor snapshot above carries row.version and this carries
       row.version + 1. */
    const newVersionResult = await client.query(
      `INSERT INTO concept2cure_artifact_versions
         (artifact_id, organization_id, version, content, content_hash,
          change_description, created_by_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        row.id,
        input.organizationId,
        newVersion,
        newContent,
        contentHash,
        reason || 'AnA submission-chat rewrite',
        input.userId,
      ]
    );
    const newVersionRowId = String(newVersionResult.rows[0].id);

    // Uniform provenance: a submission-chat rewrite is an 'edit' event, in the
    // rewrite transaction. Best-effort via SAVEPOINT so a provenance hiccup rolls
    // back only itself — it never blocks the rewrite nor poisons the transaction
    // the e-signature step below runs in.
    await recordArtifactProvenanceBestEffort(client, {
      artifactId: row.id,
      organizationId: input.organizationId,
      eventType: 'edit',
      eventAction: 'rewrite',
      actorId: input.userId,
      details: { source: 'submission_chat_rewrite', version: newVersion, threadId: input.threadId ?? null },
      backendService: 'ana/submission-chat-apply-rewrite',
    });

    // ── 3. Optional Part 11 e-signature, bound to the NEW version row.
    // The signature hash combines meaning + signer + timestamp + content, and
    // `artifact_version_id` now resolves to the row holding that same content
    // (step 2b) rather than to the predecessor snapshot — following the link
    // and recomputing the hash must land on the same bytes, or the signature
    // attests to one version while pointing at another.
    let signatureId: string | null = null;
    if (hasSignature && input.signature) {
      // §11.50 printed name — RESOLVED from the membership record on this same
      // transaction, never taken from the caller and never synthesised. This
      // used to fall back to `user-${id}` and `user-${id}@unknown.local`, which
      // are not a person's name, and the signature hash below is computed over
      // the email — so a signature hashed over an invented address could not be
      // re-derived from the real signer and verification would report a
      // mismatch that reads as tampering. If the signer is not attributable in
      // this org, resolveSignerIdentity throws and the whole transaction rolls
      // back: no signature, and no applied rewrite claiming to carry one.
      const signerName = actor.name;
      const signerEmail = actor.email;
      // §11.200 authentication method: what the signer's session actually used.
      // Defaulting an undeclared method to 'session' asserted a control that may
      // not have been applied; an unstated method is recorded as unstated.
      const authMethod = input.signature.authenticationMethod ?? null;
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
          newVersionRowId,
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
        auditUserName,
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
          proposalId: resolvedProposalId,
        }),
      ]
    );

    await client.query('COMMIT');

    // ── Mark the proposal as applied, linking it to the audit + version
    // chain. Idempotent; missing-table and not-pending are silent no-ops.
    if (resolvedProposalId) {
      try {
        await markProposalApplied(
          resolvedProposalId,
          auditId,
          parseInt(versionSnapshotId, 10) || 0
        );
      } catch (err: any) {
        // Non-fatal: the apply is durable regardless. Log so we notice.
        console.warn(
          '[AnA submission-chat apply-rewrite] proposal-applied marker failed:',
          err?.message
        );
      }
    }

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

    // ── 6. Auto-citation refresh. The artifact's content just changed,
    // so any prior citations are now stale. Fire-and-forget a background
    // run so the next reader sees fresh citations without an explicit
    // POST /citations/run call. Failure here is non-fatal: the apply is
    // durable; readers will see isStale=true until the run lands.
    //
    // Disabled when ANA_REWRITE_AUTO_CITE_DISABLED=true so deployments
    // can opt out (e.g. when running expensive RAG pipelines under
    // tight budgets).
    const autoCiteDisabled = ['1', 'true', 'yes', 'on'].includes(
      (process.env.ANA_REWRITE_AUTO_CITE_DISABLED || '').toLowerCase()
    );
    if (!autoCiteDisabled) {
      void scheduleAutoCitationRun({
        artifactId: row.artifact_id,
        organizationId: input.organizationId,
        userId: input.userId,
      }).catch(err =>
        console.warn(
          '[AnA submission-chat apply-rewrite] auto-citation schedule failed:',
          err?.message || err
        )
      );
    }

    emitMetric({
      name: 'submission_chat.apply',
      artifactId: row.artifact_id,
      projectId: row.project_id ?? null,
      organizationId: input.organizationId,
      threadId: input.threadId ?? null,
      proposalId: resolvedProposalId,
      previousVersion: Number(row.version) || 1,
      newVersion,
      signed: !!signatureId,
      signatureRequired: !!requiresSignature,
      acknowledgeUnsupported: !!input.acknowledgeUnsupported,
      unsupportedRatio: verification.unsupportedRatio,
      linesAdded: diff.linesAdded,
      linesRemoved: diff.linesRemoved,
      linesUnchanged: diff.linesUnchanged,
      hasContradictionsAddressed:
        typeof input.rationale === 'string' &&
        /contradict/i.test(input.rationale),
    });

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
      proposalId: resolvedProposalId,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
