/**
 * AnA agentic onboarding — proposal ingest (P2).
 *
 *   POST /api/onboarding/ingest   (multipart: field `file`)
 *
 * Reads ONE uploaded onboarding document and returns the values AnA could
 * verify from it, for a human to review. This route is deliberately READ-ONLY:
 * it touches no database and writes nothing. Its output is a set of
 * *suggestions*; committing any of them is a separate, governed, human-driven
 * step (see docs/architecture/ANA_ONBOARDING_P2P3_SPEC.md).
 *
 * Honesty posture:
 *  - The document buffer is held in memory for the duration of the request and
 *    is never persisted, so an onboarding upload does not silently become
 *    tenant data.
 *  - Every returned value carries a provenance excerpt that was VERIFIED to
 *    occur in the document (see services/onboarding/proposal-extraction.ts);
 *    unverifiable values are dropped and reported in `warnings`.
 *  - An unreadable or unsupported file yields an honest empty result with a
 *    warning — never a fabricated suggestion.
 *
 * File name note: deliberately NOT `onboarding-ingest.ts` — a basename shared
 * with shared/types/onboarding-ingest.ts trips the repo-health duplicate-
 * basename gate.
 *
 * @module routes/onboarding-proposals
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { eq } from 'drizzle-orm';
import { authMiddleware } from '../auth';
import { requestDb } from '../db/requestDb';
import { organizations } from '@shared/schema';
import auditService from '../services/auditService';
import { createScopedLogger } from '../utils/logger';
import { extractUploadedText } from '../services/projects/extract-text';
import { extractOnboardingProposals } from '../services/onboarding/proposal-extraction';
import { discardRun, resolveApprovals, saveRun } from '../services/onboarding/proposal-store';

const router = Router();
const log = createScopedLogger('onboarding-proposals');

/** Formats the upstream text extractor actually understands (PDF / DOCX / text). */
const ACCEPTED = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
  'text/markdown',
]);
const MAX_BYTES = 25 * 1024 * 1024; // platform upload limit

const upload = multer({
  storage: multer.memoryStorage(), // never written to disk
  limits: { fileSize: MAX_BYTES, files: 1 },
});

// Rate limit ahead of auth; extraction calls a model, so this is also a cost
// guard. express-rate-limit matches the repo convention and is recognized by
// the CodeQL missing-rate-limiting query.
const ingestRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many onboarding uploads. Please wait a moment.' },
});

router.use(ingestRateLimiter);
router.use(authMiddleware);

function callerOrgId(req: Request): number | null {
  const raw = (req as any).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}
function callerId(req: Request): number | null {
  const raw = (req as any).user?.id;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

router.post('/ingest', upload.single('file'), async (req: Request, res: Response) => {
  // Tenant context is required so an upload is always attributable, even though
  // this route stores nothing.
  if (callerOrgId(req) === null) {
    return res.status(400).json({ success: false, error: 'An organization context is required.' });
  }

  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file || !file.buffer?.length) {
    return res.status(400).json({ success: false, error: 'Attach a document to read.' });
  }
  if (!ACCEPTED.has(file.mimetype) && !/\.(pdf|docx?|txt|md)$/i.test(file.originalname || '')) {
    return res.status(415).json({
      success: false,
      error: 'That file type cannot be read yet. Upload a PDF, Word document, or plain text file.',
    });
  }

  try {
    const text = await extractUploadedText(file.buffer, file.mimetype, file.originalname || 'document');
    const result = await extractOnboardingProposals({ text, fileName: file.originalname || 'document' });
    // Record the server's OWN extraction so a later commit can re-read it
    // instead of trusting the client's copy (see services/onboarding/proposal-store).
    const runId = saveRun({ userId: callerId(req)!, organizationId: callerOrgId(req)! }, result);
    return res.json({ success: true, data: { ...result, runId } });
  } catch (err) {
    log.error('onboarding ingest failed', { err: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ success: false, error: 'Could not read that document.' });
  }
});

/* ── Governed commit ──────────────────────────────────────────────────────────
   Applies the proposals a human approved. The request may only NAME ids and
   supply human-edited values; value provenance, confidence and AnA's original
   extraction all come from the server's own record of what it proposed, so a
   caller cannot manufacture Part 11 evidence for an extraction that never
   happened. Org-admin gated, tenant-scoped through RLS, reason required,
   audited as "AnA on behalf of <user>". */

/** Org-profile columns onboarding may write — the one governed, audited target.
 *  Program/contact proposals are review-only: project creation is not audited,
 *  so onboarding never writes one (they are reported, never silently dropped). */
const ORG_PROFILE_COLUMN = new Map<string, 'name' | 'clientType' | 'industryMode'>([
  ['org_profile.name', 'name'],
  ['org_profile.clientType', 'clientType'],
  ['org_profile.industryMode', 'industryMode'],
]);
const VALID_CLIENT_TYPES = new Set(['medtech', 'biotech', 'pharma', 'diagnostics', 'cro', 'health']);

/** Mirrors organizations-routes.ts `profilePatchSchema`. Returns an error
 *  message when the value would be rejected by the canonical governed write,
 *  so this path can never persist profile data that one would refuse. */
function validateProfileValue(column: 'name' | 'clientType' | 'industryMode', value: string): string | null {
  if (column === 'clientType') {
    return VALID_CLIENT_TYPES.has(value.toLowerCase()) ? null : 'Unrecognized client type.';
  }
  if (column === 'name') {
    if (value.length < 2 || value.length > 120) return 'Organization name must be 2–120 characters.';
    return null;
  }
  if (value.length < 2 || value.length > 64) return 'Industry must be 2–64 characters.';
  return null;
}
const ADMIN_ROLES = new Set(['admin', 'owner', 'super_admin', 'platform_admin', 'business_admin']);

function isOrgAdmin(req: Request): boolean {
  const u = (req as any).user ?? {};
  if (ADMIN_ROLES.has(String(u.role ?? ''))) return true;
  return Array.isArray(u.roles) && u.roles.some((r: unknown) => ADMIN_ROLES.has(String(r)));
}

router.post('/commit', async (req: Request, res: Response) => {
  const orgId = callerOrgId(req);
  const userId = callerId(req);
  if (orgId === null || userId === null) {
    return res.status(400).json({ success: false, error: 'An organization context is required.' });
  }
  if (!isOrgAdmin(req)) {
    return res.status(403).json({ success: false, error: 'Organization admin access required.' });
  }

  const body = (req.body ?? {}) as { runId?: unknown; approvals?: unknown; reason?: unknown };
  const runId = typeof body.runId === 'string' ? body.runId : '';
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  const approvals = Array.isArray(body.approvals)
    ? (body.approvals as Array<{ id: string; value?: string | null }>)
    : [];

  // The reason is the human's own words — never synthesized on their behalf.
  if (reason.length < 3) {
    return res.status(400).json({ success: false, error: 'A reason for this change is required.' });
  }
  if (!runId || approvals.length === 0) {
    return res.status(400).json({ success: false, error: 'Nothing was approved to apply.' });
  }

  const outcome = resolveApprovals({ userId, organizationId: orgId }, runId, approvals);
  if (!outcome.ok) return res.status(410).json({ success: false, error: outcome.error });

  const applied: Array<{ targetField: string; ok: boolean; error?: string }> = [];
  const updates: Record<string, string> = {};
  const auditFields: Array<Record<string, unknown>> = [];

  for (const a of outcome.approvals) {
    const column = ORG_PROFILE_COLUMN.get(a.proposal.targetField);
    if (!column) {
      // Honest: reported as not applied, never silently written elsewhere.
      applied.push({
        targetField: a.proposal.targetField,
        ok: false,
        error: 'No governed write path for this field yet — carry it into setup manually.',
      });
      continue;
    }
    // Same constraints the governed PATCH /organizations/:id/profile enforces —
    // a human edit must not be able to put data into the shared organization
    // record through this path that the canonical path would reject.
    const invalid = validateProfileValue(column, a.value);
    if (invalid) {
      applied.push({ targetField: a.proposal.targetField, ok: false, error: invalid });
      continue;
    }
    updates[column] = column === 'clientType' ? a.value.toLowerCase() : a.value;
    applied.push({ targetField: a.proposal.targetField, ok: true });
    auditFields.push({
      targetField: a.proposal.targetField,
      value: a.value,
      humanEdited: a.humanEdited,
      // Provenance + confidence come from the SERVER's record, not the request.
      anaExtractedValue: a.proposal.extractedValue,
      provenance: a.proposal.provenance,
      confidence: a.proposal.confidence,
    });
  }

  if (Object.keys(updates).length === 0) {
    return res.json({
      success: true,
      data: { applied, writes: [], failures: applied.filter((a) => !a.ok).length, unknownIds: outcome.unknownIds },
    });
  }

  try {
    const rdb = requestDb(req);
    const [before] = await rdb
      .select({ name: organizations.name, clientType: organizations.clientType, industryMode: organizations.industryMode })
      .from(organizations)
      .where(eq(organizations.id, orgId));
    if (!before) return res.status(404).json({ success: false, error: 'Organization not found.' });

    const [updated] = await rdb
      .update(organizations)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(organizations.id, orgId))
      .returning({ name: organizations.name, clientType: organizations.clientType, industryMode: organizations.industryMode });

    await auditService.logAction({
      tenantId: String(orgId),
      userId: String(userId),
      action: 'data_modify',
      tableName: 'organizations',
      recordId: String(orgId),
      details: {
        orgAdminAction: 'onboarding.apply_proposals',
        // Attribution: AnA proposed, a named human approved.
        actorKind: 'ana_on_behalf_of_user',
        before,
        after: updated,
        fields: auditFields,
        reason,
      },
    });

    discardRun(runId); // nothing lingers after use
    return res.json({
      success: true,
      data: {
        applied,
        writes: ['organizations.profile'],
        failures: applied.filter((a) => !a.ok).length,
        unknownIds: outcome.unknownIds,
      },
    });
  } catch (err) {
    log.error('onboarding commit failed', { err: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ success: false, error: 'Could not apply those changes.' });
  }
});

export default router;
