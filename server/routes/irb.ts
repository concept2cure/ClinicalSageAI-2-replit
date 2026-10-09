/**
 * IRB / IEC API — Capability C2C-06
 *
 * Governed CRUD for human-subjects ethics submissions, sites (sIRB), consent
 * documents, committee determinations, amendments, and reportable events, plus
 * the four study facts the package manifest gates artifact slots on (children,
 * IND, PHI, recruitment material) -- recorded tri-state, so that "not recorded"
 * stays distinguishable from "the sponsor said no". Every mutation runs
 * BEGIN → Tx → recordGovernedAction → COMMIT, org-scoped from the verified
 * request context. Approval threads a provenance link to Module 5.
 * Mounted at /api/irb.
 *
 * @module server/routes/irb
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { pool } from '../db';
import { recordGovernedAction } from './c2c/actions';
import { setTenantContextTx } from '../services/tenant/governed-tenant-context';
import {
  createSubmissionTx,
  setSubmissionStatusTx,
  setSubmissionContextTx,
  IRB_CONTEXT_FIELDS,
  type IrbContextField,
  recordReviewTx,
  addSiteTx,
  addConsentDocumentTx,
  addAmendmentTx,
  addReportableEventTx,
  listSubmissions,
  getCompletenessInput,
  getPackageManifest,
  getLifecycleStatus,
} from '../services/irb/irb-service';
import { evaluateIrbCompleteness, recommendReviewType } from '../services/irb/irb-logic';
import { recordIrbSubmissionCreated, recordIrbApproval, recordIrbReportableEvent } from '../services/irb-metrics';

const router = Router();

/** The one place a clock enters this module. The engines take dates as inputs. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function resolveUserId(req: Request): number | null {
  const r = req as any;
  const raw = r.userId ?? r.user?.id ?? r.user?.userId;
  const n = raw == null ? NaN : typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}
function resolveOrgId(req: Request): number | null {
  const r = req as any;
  const raw = r.tenantId ?? r.organizationId ?? r.user?.organizationId ?? r.user?.tenantId;
  const n = raw == null ? NaN : typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}
const CODE_STATUS: Record<string, number> = { NOT_FOUND: 404, INVALID_STATE: 409, BAD_INPUT: 400 };
function fail(res: Response, err: unknown): void {
  const code = (err as { code?: string } | null)?.code;
  if (code && CODE_STATUS[code]) {
    res.status(CODE_STATUS[code]).json({ error: { code, message: err instanceof Error ? err.message : 'Request failed.' } });
    return;
  }
  res.status(500).json({ error: { code: 'INTERNAL', message: err instanceof Error ? err.message : 'Request failed.' } });
}
const reason = z.string().trim().min(8, 'Provide a reason of at least 8 characters.');

async function governed(
  req: Request,
  res: Response,
  command: string,
  reasonText: string,
  run: (client: any, orgId: number, userId: number) => Promise<{ target: string; payload?: Record<string, unknown>; body: Record<string, unknown> }>,
): Promise<void> {
  const userId = resolveUserId(req);
  const orgId = resolveOrgId(req);
  if (!userId || !orgId) {
    res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, orgId);
    const { target, payload, body } = await run(client, orgId, userId);
    const gov = await recordGovernedAction(client, { orgId, userId, command, target, reason: reasonText, payload, domain: 'irb' });
    await client.query('COMMIT');
    res.status(201).json({ ...body, ...gov });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    fail(res, err);
  } finally {
    client.release();
  }
}

const submissionSchema = z.object({
  protocolNumber: z.string().min(1).max(120),
  title: z.string().min(1).max(500),
  riskLevel: z.enum(['minimal', 'greater_than_minimal']),
  studyId: z.number().int().positive().optional(),
  submissionId: z.number().int().positive().optional(),
  involvesVulnerablePopulations: z.boolean().optional(),
  vulnerablePopulationProtections: z.string().max(4000).optional(),
  isSingleIrb: z.boolean().optional(),
  consentWaiverRequested: z.boolean().optional(),
  /*
   * ── The four package-manifest facts, TRI-STATE on the wire ───────────────
   *
   * `.optional()` and NOT `.default(false)`. Three answers have to reach the
   * database distinctly: true, false, and NOT SENT. `.default(false)` would
   * turn a request that simply omits the field into a sponsor's recorded
   * statement that the study does not run under an IND / involves no children
   * / touches no PHI, and the package manifest would then quietly drop Form
   * FDA 1572, the assent and the HIPAA authorization from what a board is
   * told it needs. Omitted must stay omitted all the way to a NULL column.
   * See migrations/20260922d_irb_submission_context.sql.
   */
  involvesChildren: z.boolean().optional(),
  isIndStudy: z.boolean().optional(),
  usesPhi: z.boolean().optional(),
  usesRecruitmentMaterial: z.boolean().optional(),
  reason,
});

router.post('/submissions', async (req, res) => {
  const parsed = submissionSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'create', parsed.data.reason, async (client, orgId, userId) => {
    const { id } = await createSubmissionTx(client, orgId, userId, parsed.data);
    recordIrbSubmissionCreated(parsed.data.riskLevel);
    return { target: `irb-submission:${id}`, payload: { riskLevel: parsed.data.riskLevel }, body: { id } };
  });
});

router.get('/submissions', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const submissionId = req.query.submissionId ? Number(req.query.submissionId) : undefined;
  try {
    res.json(await listSubmissions(orgId, Number.isFinite(submissionId) ? submissionId : undefined));
  } catch (err) {
    fail(res, err);
  }
});

const statusSchema = z.object({
  status: z.enum(['draft', 'submitted', 'under_review', 'modifications_required', 'approved', 'deferred', 'disapproved', 'suspended', 'closed', 'expired']),
  reason,
});

router.patch('/submissions/:id/status', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = statusSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'transition', parsed.data.reason, async (client, orgId) => {
    await setSubmissionStatusTx(client, orgId, id, parsed.data.status);
    return { target: `irb-submission:${id}`, payload: { status: parsed.data.status }, body: { id, status: parsed.data.status } };
  });
});

/*
 * Recording the four facts on an existing submission.
 *
 * `.nullable().optional()` on every field, and `.strict()` so a typo is a 400
 * rather than a silent no-op: ABSENT means "leave this fact as it was" and
 * explicit `null` means "retract it back to NOT RECORDED". Those are different
 * instructions and a sponsor needs both — a fact answered in error has to be
 * retractable, and the manifest must then return to `undetermined` rather than
 * carrying a stale claim to a board. Nothing here defaults; a field this
 * request does not mention is not a field this request answers.
 */
const contextSchema = z
  .object({
    involvesChildren: z.boolean().nullable().optional(),
    isIndStudy: z.boolean().nullable().optional(),
    usesPhi: z.boolean().nullable().optional(),
    usesRecruitmentMaterial: z.boolean().nullable().optional(),
    reason,
  })
  .strict();

router.patch('/submissions/:id/context', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = contextSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  /* Picked by name rather than by spreading everything-but-reason: the
     service distinguishes a field that is ABSENT from one that is `null`, so
     what reaches it has to be exactly the facts this request mentioned. */
  const facts: Partial<Record<IrbContextField, boolean | null>> = {};
  for (const [field] of IRB_CONTEXT_FIELDS) {
    if (field in parsed.data) facts[field] = parsed.data[field] ?? null;
  }
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId) => {
    const out = await setSubmissionContextTx(client, orgId, id, facts);
    return { target: `irb-submission:${id}`, payload: { recorded: out.recorded }, body: out };
  });
});

const reviewSchema = z.object({
  reviewType: z.enum(['exempt', 'expedited', 'full_board']),
  outcome: z.enum(['approved', 'modifications_required', 'deferred', 'disapproved']),
  conditions: z.string().max(4000).optional(),
  determinationDate: z.string().optional(),
  reason,
});

router.post('/submissions/:id/reviews', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = reviewSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, parsed.data.outcome === 'approved' ? 'sign' : 'resolve', parsed.data.reason, async (client, orgId, userId) => {
    const result = await recordReviewTx(client, orgId, userId, id, parsed.data);
    if (parsed.data.outcome === 'approved') recordIrbApproval(parsed.data.reviewType);
    return { target: `irb-submission:${id}`, payload: { outcome: parsed.data.outcome, expirationDate: result.expirationDate, provenanceLinkId: result.provenanceLinkId }, body: { id, ...result } };
  });
});

const siteSchema = z.object({ siteName: z.string().min(1).max(300), principalInvestigator: z.string().max(300).optional(), localContext: z.string().max(4000).optional(), reason });
router.post('/submissions/:id/sites', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = siteSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId, userId) => {
    const { id: sid } = await addSiteTx(client, orgId, userId, id, parsed.data);
    return { target: `irb-submission:${id}`, payload: { siteId: sid }, body: { irbSubmissionId: id, siteId: sid } };
  });
});

const consentSchema = z.object({ documentName: z.string().min(1).max(300), version: z.string().max(30).optional(), reason });
router.post('/submissions/:id/consent-documents', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = consentSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId, userId) => {
    const { id: cid } = await addConsentDocumentTx(client, orgId, userId, id, parsed.data);
    return { target: `irb-submission:${id}`, payload: { consentDocId: cid }, body: { irbSubmissionId: id, consentDocId: cid } };
  });
});

const amendmentSchema = z.object({ description: z.string().min(1).max(4000), substantive: z.boolean(), reason });
router.post('/submissions/:id/amendments', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = amendmentSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId, userId) => {
    const { id: aid } = await addAmendmentTx(client, orgId, userId, id, parsed.data);
    return { target: `irb-submission:${id}`, payload: { amendmentId: aid, substantive: parsed.data.substantive }, body: { irbSubmissionId: id, amendmentId: aid } };
  });
});

const eventSchema = z.object({
  eventType: z.enum(['unanticipated_problem', 'serious_adverse_event', 'protocol_deviation', 'noncompliance', 'other']),
  description: z.string().min(1).max(4000),
  reportedDate: z.string().optional(),
  reason,
});
router.post('/submissions/:id/reportable-events', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = eventSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId, userId) => {
    const { id: eid } = await addReportableEventTx(client, orgId, userId, id, parsed.data);
    recordIrbReportableEvent(parsed.data.eventType);
    return { target: `irb-submission:${id}`, payload: { eventId: eid, eventType: parsed.data.eventType }, body: { irbSubmissionId: id, eventId: eid } };
  });
});

/* The package manifest (docs/design/IRB_SUBMISSION.md step 3): which artifacts
   a board expects of THIS submission, and which its linked Submission Center
   submission actually carries. Read-only; it records no governed action,
   because reading a manifest is not one. It decides nothing about the study --
   per D4 it may find an artifact absent, and may not decide whether the
   research is approvable. */
router.get('/submissions/:id/package-manifest', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  try { res.json(await getPackageManifest(orgId, id)); } catch (err) { fail(res, err); }
});

/**
 * The approval lifecycle. Read-only; no governed action, because reading a
 * status is not one.
 *
 * `asOf` (YYYY-MM-DD) is accepted so a caller can ask what will be true on a
 * given date -- the engine has no clock and takes the date as an argument, so
 * the boundary is here. An unparseable value is refused rather than quietly
 * replaced with today: answering a question about 2027 with today's answer is
 * worse than refusing it.
 */
router.get('/submissions/:id/lifecycle', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const raw = typeof req.query.asOf === 'string' ? req.query.asOf.trim() : '';
  if (raw && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'asOf must be an ISO date (YYYY-MM-DD).' } });
  }
  try { res.json(await getLifecycleStatus(orgId, id, raw || todayIso())); } catch (err) { fail(res, err); }
});

router.get('/submissions/:id/completeness', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const client = await pool.connect();
  try {
    const input = await getCompletenessInput(client, orgId, id);
    const completeness = evaluateIrbCompleteness(input);
    const rec = recommendReviewType({ riskLevel: input.riskLevel });
    /* `continuingReview` used to be served here from continuingReviewStatus,
       which returns two booleans and so cannot say "unknown": a full-board
       approval with no approval date recorded came back expired: false, and an
       approval that had actually LAPSED read as current because nobody typed a
       date. It is replaced rather than supplemented -- nothing consumed the old
       field, and leaving a misleading value on the API beside an honest one is
       how the misleading one gets read. */
    const { status: lifecycle } = await getLifecycleStatus(orgId, id, todayIso());
    res.json({ completeness, lifecycle, recommendedReview: rec });
  } catch (err) {
    fail(res, err);
  } finally {
    client.release();
  }
});

export default router;
