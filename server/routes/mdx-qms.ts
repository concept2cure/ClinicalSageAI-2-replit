/**
 * QMS routes — 21 CFR 820 / QMSR (effective Feb 2026) + ISO 13485.
 * Covers document control, training records, supplier management,
 * internal audits, management reviews, nonconforming products.
 *
 *   GET    /api/mdx/qms/documents                      list controlled docs
 *   POST   /api/mdx/qms/documents                       create
 *   GET    /api/mdx/qms/documents/:id                   single
 *   PATCH  /api/mdx/qms/documents/:id                   partial update
 *   POST   /api/mdx/qms/documents/:id/approve           approve = Part 11 e-signature (password re-auth + meaning + reason) → effective
 *   POST   /api/mdx/qms/documents/:id/revise            open a controlled revision (reason required) → draft, next major version
 *   POST   /api/mdx/qms/documents/:id/retire            retire = Part 11 e-signature (same ceremony as approve) → retired
 *   POST   /api/mdx/qms/documents/:id/training-ack      user acknowledges training
 *   GET    /api/mdx/qms/training                        list training records
 *   GET    /api/mdx/qms/training/expiring               periodic refresh due
 *
 *   Suppliers, internal audits and nonconforming products: mdx-qms-records.ts.
 *
 *   GET    /api/mdx/qms/management-reviews              list reviews
 *   POST   /api/mdx/qms/management-reviews              create
 *   POST   /api/mdx/qms/management-reviews/:id/actions  record an action (P-48)
 *   POST   /api/mdx/qms/management-reviews/:id/actions/:n/close  close it, with a note
 *
 *   GET    /api/mdx/qms/changes                         change-control register
 *   POST   /api/mdx/qms/changes                          create change request
 *   GET    /api/mdx/qms/changes/summary                  register KPIs
 *   GET    /api/mdx/qms/changes/:id                      single change + links
 *   PATCH  /api/mdx/qms/changes/:id                      partial update
 *   POST   /api/mdx/qms/changes/:id/transition           controlled lifecycle move
 *   DELETE /api/mdx/qms/changes/:id                      soft-delete
 *   GET    /api/mdx/qms/changes/:id/links                list cross-references
 *   POST   /api/mdx/qms/changes/:id/links                link deviation/CAPA/validation/doc
 *   DELETE /api/mdx/qms/changes/:id/links/:linkId        remove a link
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { createScopedLogger } from '../utils/logger';
import {
  ok, created, clientError, orgRequired, notFoundInTenant, serverError,
} from '../lib/api-response';
import { requestPgClient, requestConnectable, type RequestSqlClient } from '../db/requestDb';
/*
 * WO-16C #133. The thirteen writes in this router that RECORD a 21 CFR Part 11
 * §11.10(e) row each did so with `void auditService.logAction({…})`, which
 * throws away the `AuditWriteResult` that call resolves. `logAction` never
 * rejects when persistence fails — deliberately, an audit-trail outage must not
 * break the user action it records — so the discarded value was the ONLY place
 * a lost row was visible: the returned record, the envelope and the QMS surface
 * came back byte-identical whether the §11.10(e) record existed or not.
 *
 * (Thirteen is the number of AUDITED writes, not of governed ones. The review of
 * this conversion counted nineteen governed writes in this file and found six
 * that record no §11.10(e) row at all — see the note above each of them. Those
 * are a separate gap from #133: nothing is discarded there because nothing is
 * written. The original wording here said "the thirteen governed writes", which
 * a reader would take as "every governed write in this router is audited", and
 * that sentence would have hidden the gap it sat above.)
 *
 * They now go through the shared `recordAuditRow`, and each route carries its
 * outcome out in the response envelope's `meta.auditTrail`. Every one of the
 * thirteen is a log BESIDE an already-committed write — the UPDATE/INSERT, or
 * the changeControl.service call, has returned before the audit row is
 * attempted — so none of them reverts its mutation over a lost log row: the
 * action stands and the caller is told. Each handler writes exactly one audit
 * row, so one unqualified `auditTrail` key per envelope names it unambiguously.
 *
 * `recordAuditRow` returns `{persisted, chained}` or `{persisted: false, code,
 * message}` and never the store's own text; that text goes to its log line,
 * keyed on the action and the resource id. `auditService` is reached through
 * that module, so it is no longer imported here directly.
 */
import { recordAuditRow } from '../services/audit/audit-write-outcome';
/*
 * VSR-001 F-3 (OQ-QMS-06). Approving a controlled document makes it effective,
 * which is a signed act (21 CFR Part 11 §11.50), so the approve route is the one
 * handler here that does NOT log beside a committed write: it re-authenticates
 * the signer (§11.200), checks signing authority (§11.10(g)), and then runs the
 * UPDATE, the chained ledger pair and the electronic_signatures row on one
 * transaction (services/qms/document-approval-signature). The §11.10(e) row is
 * inside that transaction, so `meta.auditTrail` on a 200 is always
 * {persisted: true, chained: true} — a lost row rolls the approval back instead.
 */
import { reverifySigner } from '../services/part11/reverify-signer';
import { signerReverificationDeps } from '../services/part11/reverify-signer-deps';
import { checkSigningAuthority } from '../services/part11/signing-authority-gate';
import {
  approveQmsDocumentSigned,
  retireQmsDocumentSigned,
  QmsApprovalRefusedError,
  QMS_DOCUMENT_APPROVAL_MEANING,
} from '../services/qms/document-approval-signature';
import { SOP_TEMPLATES } from '../services/qms/sopTemplates';
import {
  createChange, listChanges, getChange, updateChange, transitionChange, deleteChange,
  listLinks, listLinksForChanges, nextStatesOf, addLink, removeLink, changeControlSummary,
  CHANGE_TYPES, CHANGE_CLASSIFICATIONS, CHANGE_RISK_LEVELS, CHANGE_STATES,
  LINK_TYPES, LINK_RELATIONSHIPS,
  InvalidChangeTransitionError, ChangeApprovalRequiresSignatureError,
  type ChangeState,
} from '../services/qms/changeControl.service';
import { approveQmsChangeSigned } from '../services/qms/change-approval-signature';
import { clientIpOf } from '../utils/client-ip';
import { requireEditorAccess } from '../middleware/orgMembership';
import { governedReason } from './governed-reason';
import { createControlledQmsDocument, bindControlledQmsDocument, reviseControlledQmsDocument, updateControlledQmsDocument } from '../services/qms/controlled-document-service';
import { QmsContentRefusedError } from '../services/qms/controlled-document-content';
import { authoringPrincipalFromRequest, resolveAuthoringDocumentScope, decideAuthoringPermission } from '../services/authoring/authoring-permissions';
import type { CreateContext } from '../services/authoring/authoring-documents';
import { QmsSigningAdmissionRefused } from '../services/qms/current-signing-admission';
import { qmsTrainingAcknowledgementInputSchema, qmsControlledTextInputSchema } from '../../shared/qms/training';
import {
  acknowledgeQmsTraining, readQmsTrainingContext, readQmsTrainingCompliance, readQmsTrainingExpiring,
  QmsTrainingRefused, QmsTrainingCommitUnconfirmed,
} from '../services/qms/training';
import type { QmsDocumentRow } from '../services/qms/document-approval-signature';
import { saveQmsControlledText } from '../services/qms/training-controlled-text';
import { describeQmsTrainingDocument } from '../services/qms/training-content';
import { inForceSummary } from '../services/qms/in-force-release';
import {
  QMS_PERIODIC_REVIEW_CODE_STATUS, qmsPeriodicReviewBody, readQmsReviewSchedule, recordQmsPeriodicReview,
  type QmsReviewSchedule,
} from '../services/qms/periodic-review';
import { signedActAttempts, signGovernedAct } from './governed-signed-act';
import { schedulePeriodicReviewTask } from '../services/qms/periodic-review-task';
import { REVIEW_ACT_MEANINGS } from '../services/part11/signature-meanings';
import { mountQmsReviewRoute, qmsRouteRefusal } from './mdx-qms-review-route';
import { qmsApprovalPrecheck, qmsApprovalRoute, qmsRetirementRoute } from '../services/qms/qms-review-route';
import { readRouteRounds, type RouteRound } from '../services/review/review-route-standing';
import { notifyTaskEvent, type TaskEventNotice } from '../services/tasking/task-side-effects';
import { getOrgId, getUserId, qmsClient } from './mdx-qms-context';
import qmsRecordsRouter from './mdx-qms-records';

const router = Router();
const log = createScopedLogger('mdx-qms');

function trainingRefusalResponse(res: Response, error: QmsTrainingRefused) {
  if (error.status === 503) return res.status(503).json({
    error: 'The current approval signature could not be checked. Reload the document before trying again.',
    details: { code: error.code },
  });
  return clientError(res, error.status, error.message, { code: error.code });
}


const DOC_TYPE = ['sop', 'wi', 'form', 'spec', 'policy', 'manual', 'protocol', 'curriculum'] as const;
const DOC_STATUS = ['draft', 'in_review', 'effective', 'superseded', 'retired'] as const;
/* The statuses a create or an edit may set. 'effective' is reached only by the
   signed approval below (VSR-001 F-3); 'retired' only by the signed retire
   route (P1-29 / DP-32), 'superseded' only by the revise route. The schemas
   admitted all five, so a create or a PATCH could make an SOP effective with no
   signature (new-code audit 2026-09-24, finding 1). */

/* ─── Documents ─────────────────────────────────────────────── */

const docListQuery = z.object({
  doc_type: z.enum(DOC_TYPE).optional(),
  status:   z.enum(DOC_STATUS).optional(),
  category: z.string().max(60).optional(),
});
/* ─── GET /api/mdx/qms/readiness ──────────────────────────────────────
   One compact quality-system readiness block for the MDX device shell.

   Every endpoint in this file was already consumed — but by
   client/src/concept2cure/quality/*, a different application from the
   MDX shell where device teams actually work a submission. A team could
   not see whether its suppliers were qualified, whether required
   training was current, or which audit findings threatened readiness
   without leaving for another app (docs/MDX_SURFACE_COVERAGE_FINDING.md).

   This endpoint derives counts only — it introduces no new writable
   surface and reuses the same tables the /qms/* CRUD above owns. All
   figures are organization-scoped and say so in meta.scope: the QMS is
   an org-level system (21 CFR 820 / QMSR does not run per submission),
   so labelling this per-programme would be the same header-vs-panel lie
   the MDX surfaces just had removed.

   Each block degrades independently on a missing table (42P01 —
   pre-migration tenants) to zeroed counts with `available: false`,
   never a 500 that blanks the panel. `available: false` matters: a
   tenant with no QMS tables must render "not tracked here yet", not
   "0 overdue" — a zero from an absent system reads as an all-clear. */

async function readinessBlock<T extends Record<string, unknown>>(req: Request, orgId: number, name: string, sql: string): Promise<T | null> {
    try {
      const { rows } = await qmsClient(req).query(sql, [orgId]);
      return (rows[0] as T) ?? null;
    } catch (err) {
      if ((err as { code?: string })?.code !== '42P01') {
        log.warn(`qms readiness block ${name} failed`, {
          err: err instanceof Error ? err.message : String(err),
        });
      }
      return null;
    }
}

/* Controlled documents for readiness, decided by the version in force
   (in-force-release.ts): `effective` counts the documents in force, including
   those whose successor is in draft or review (`under_revision`); `draft`
   counts working copies with nothing in force yet; `review_overdue` is the
   in-force versions past their next periodic review, after the last signed
   review of that version (periodic-review.ts). Only overdue reviews are a
   readiness problem. Null when the read fails, as the other blocks. */
async function readinessDocuments(req: Request, orgId: number): Promise<{ effective: number; under_revision: number; review_overdue: number; draft: number } | null> {
  try {
    const client = qmsClient(req);
    const { rows } = await client.query(`SELECT * FROM qms_documents WHERE organization_id = $1 AND deleted_at IS NULL
        AND status IN ('effective', 'draft', 'in_review')`, [orgId]);
    const schedule = await readQmsReviewSchedule(client, orgId, rows as QmsDocumentRow[]);
    const today = new Date().toISOString().slice(0, 10);
    const inForceRows = (rows as QmsDocumentRow[]).filter((row) => schedule.inForce.has(Number(row.id)));
    return {
      effective: inForceRows.length,
      under_revision: inForceRows.filter((row) => schedule.inForce.get(Number(row.id))?.underRevision).length,
      review_overdue: inForceRows.filter((row) => { const due = schedule.dueOf(row); return due !== null && due < today; }).length,
      draft: rows.length - inForceRows.length,
    };
  } catch (err) {
    log.warn('qms readiness block documents failed', { err: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

router.get('/qms/readiness', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  try { requestPgClient(req); }
  catch (err) { return serverError(res, log, 'qms-readiness-context', err); }


  try {
    const [docs, suppliers, training, audits, nonconforming] = await Promise.all([
      readinessDocuments(req, orgId),
      /* Suppliers: the two readiness killers are an unapproved critical
         supplier and an overdue supplier audit. */
      readinessBlock<{ total: number; critical_unapproved: number; audit_overdue: number }>(req, orgId,
        'suppliers',
        `SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE criticality = 'critical'
                               AND approval_status IS DISTINCT FROM 'approved')::int
              AS critical_unapproved,
            COUNT(*) FILTER (WHERE next_audit_date IS NOT NULL
                               AND next_audit_date < CURRENT_DATE)::int AS audit_overdue
           FROM qms_suppliers
          WHERE organization_id = $1 AND deleted_at IS NULL`,
      ),
      /* Training: expired acknowledgments. No invented "compliance %"
         — the tables cannot say who *should* have trained on what, only
         which existing acknowledgments have lapsed. */
      readinessBlock<{ acknowledged: number; expired: number }>(req, orgId,
        'training',
        `SELECT
            COUNT(*)::int AS acknowledged,
            COUNT(*) FILTER (WHERE expires_at IS NOT NULL AND expires_at < NOW())::int
              AS expired
           FROM qms_training_records
          WHERE organization_id = $1`,
      ),
      /* Internal audits: what is still open, and the major findings on
         those open audits — the ones a QMSR inspection would ask about
         first. */
      readinessBlock<{ open: number; open_major_findings: number }>(req, orgId,
        'audits',
        `SELECT
            COUNT(*) FILTER (WHERE status IS DISTINCT FROM 'completed')::int AS open,
            COALESCE(SUM(major_findings)
              FILTER (WHERE status IS DISTINCT FROM 'completed'), 0)::int
              AS open_major_findings
           FROM qms_internal_audits
          WHERE organization_id = $1`,
      ),
      /* Non-conforming product: undispositioned is the state in which
         non-conforming stock can still ship. */
      readinessBlock<{ undispositioned: number }>(req, orgId,
        'nonconforming',
        `SELECT COUNT(*) FILTER (WHERE disposition IS NULL)::int AS undispositioned
           FROM qms_nonconforming_products
          WHERE organization_id = $1`,
      ),
    ]);

    return ok(
      res,
      {
        documents: docs
          ? { available: true, effective: docs.effective, underRevision: docs.under_revision, reviewOverdue: docs.review_overdue, draft: docs.draft }
          : { available: false, effective: 0, reviewOverdue: 0, draft: 0 },
        suppliers: suppliers
          ? {
              available: true,
              total: suppliers.total,
              criticalUnapproved: suppliers.critical_unapproved,
              auditOverdue: suppliers.audit_overdue,
            }
          : { available: false, total: 0, criticalUnapproved: 0, auditOverdue: 0 },
        training: training
          ? { available: true, acknowledged: training.acknowledged, expired: training.expired }
          : { available: false, acknowledged: 0, expired: 0 },
        audits: audits
          ? { available: true, open: audits.open, openMajorFindings: audits.open_major_findings }
          : { available: false, open: 0, openMajorFindings: 0 },
        nonconforming: nonconforming
          ? { available: true, undispositioned: nonconforming.undispositioned }
          : { available: false, undispositioned: 0 },
      },
      { scope: 'organization' },
    );
  } catch (err) {
    return serverError(res, log, 'qms-readiness', err);
  }
});

/** A next review date as the task store takes it (YYYY-MM-DD); null when there is none or it is unreadable. */
function reviewDay(value: unknown): string | null {
  if (value == null || value === '') return null;
  const text = value instanceof Date ? (Number.isFinite(value.getTime()) ? value.toISOString() : '') : String(value);
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null;
}

/** Register metadata is org-visible; authored prose remains behind canonical object permissions. */
function qmsRegisterRow(row: Record<string, any>): Record<string, any> {
  const metadata = { ...(row.metadata ?? {}) }; delete metadata.authoringContent;
  return { ...row, metadata };
}

/**
 * A register row with its version in force, that version's last counted
 * periodic review, and `next_review_due`. `next_review_date` stays the row's
 * signed date: a review never rewrites it (periodic-review.ts).
 */
function scheduledRegisterRow(row: Record<string, any>, schedule: QmsReviewSchedule): Record<string, any> {
  const id = Number(row.id);
  return {
    ...qmsRegisterRow(row),
    in_force: inForceSummary(schedule.inForce.get(id)),
    periodic_review: schedule.reviews.get(id) ?? null,
    next_review_due: schedule.dueOf(row as QmsDocumentRow),
  };
}

router.get('/qms/documents', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = docListQuery.safeParse(req.query);
  if (!parsed.success) return clientError(res, 422, 'Invalid query', parsed.error.flatten().fieldErrors);
  const { doc_type, status, category } = parsed.data;
  const filters: string[] = [`organization_id = $1`, `deleted_at IS NULL`];
  const args: unknown[] = [orgId];
  if (doc_type) { args.push(doc_type); filters.push(`doc_type = $${args.length}`); }
  if (status)   { args.push(status);   filters.push(`status = $${args.length}`); }
  if (category) { args.push(category); filters.push(`category = $${args.length}`); }
  try {
    const client = qmsClient(req);
    const { rows } = await client.query(`SELECT * FROM qms_documents WHERE ${filters.join(' AND ')}
        ORDER BY doc_number`,
      args,
    );
    // A row under revision names the signed version still in force beside its
    // draft; each names its last counted periodic review and when it is next due.
    const schedule = await readQmsReviewSchedule(client, orgId, rows as QmsDocumentRow[]);
    const rounds = await registerRounds(client, orgId, rows);
    return ok(res, rows.map((row) => withRound(scheduledRegisterRow(row, schedule), rounds)), { count: rows.length });
  } catch (err) { return serverError(res, log, 'doc-list', err); }
});

/**
 * Each document's latest review route (RR4, §2.12): every member, their
 * outcome and the naming history, so the register shows the round. A route
 * read that fails is `review_route_unread` on every row, never "no route":
 * the register still lists its documents.
 */
async function registerRounds(client: ReturnType<typeof qmsClient>, orgId: number, rows: Array<Record<string, any>>): Promise<Map<string, RouteRound> | null> {
  try {
    return await readRouteRounds(client, { organizationId: orgId, subjectType: 'qms_document', subjectIds: rows.map((r) => String(r.id)) });
  } catch (err) {
    log.warn('qms register review routes could not be read', { err: err instanceof Error ? err.message : String(err) });
    return null;
  }
}
function withRound(row: Record<string, any>, rounds: Map<string, RouteRound> | null): Record<string, any> {
  return rounds === null ? { ...row, review_route: null, review_route_unread: true } : { ...row, review_route: rounds.get(String(row.id)) ?? null };
}

function qmsAuthoringContext(req: Request, orgId: number, userId: number): CreateContext {
  const email = typeof (req as any).user?.email === 'string' ? (req as any).user.email : null;
  const pool = requestConnectable(req);
  return { pool, tenantId: orgId, actor: { id: String(userId), email }, audit: {
    tenantId: orgId, actorId: String(userId), actorEmail: email ?? 'unknown', actorRole: String((req as any).user?.role ?? 'unknown'),
    ipAddress: clientIpOf(req) ?? 'unknown', userAgent: req.get('user-agent') ?? 'unknown', pool,
  } };
}
function qmsContentRefusal(res: Response, err: unknown): Response | null {
  if (!(err instanceof QmsContentRefusedError)) return null;
  if (err.status === 503) {
    log.error('Controlled document content could not be verified', { code: err.code });
    return res.status(503).json({error:'Controlled document content is temporarily unavailable. Retry after access is restored.',details:{code:err.code}});
  }
  return clientError(res, err.status, err.message, { code: err.code });
}

router.post('/qms/documents', requireEditorAccess, async (req: Request, res: Response) => {
  const orgId = getOrgId(req); const userId = getUserId(req);
  if (orgId === null) return orgRequired(res);
  if (userId === null) return clientError(res, 401, 'User context required');
  if (req.body?.metadata && Object.prototype.hasOwnProperty.call(req.body.metadata, 'controlledTextAuthorship')) return clientError(res, 422, 'Controlled-text authorship is recorded by the server and cannot be supplied during creation.');
  try {
    const row = await createControlledQmsDocument(qmsAuthoringContext(req, orgId, userId), req.body ?? {});
    return created(res, row, { auditTrail: { persisted: true, chained: true } });
  } catch (err: unknown) {
    const refusal = qmsContentRefusal(res, err); if (refusal) return refusal;
    if ((err as { code?: string }).code === '23505') return clientError(res, 409, 'A document with that number already exists in this org');
    return serverError(res, log, 'doc-create', err);
  }
});

router.post('/qms/documents/:id/bind', requireEditorAccess, async (req: Request, res: Response) => {
  const orgId = getOrgId(req); const userId = getUserId(req);
  if (orgId === null) return orgRequired(res);
  if (userId === null) return clientError(res, 401, 'User context required');
  const id = Number(req.params.id); if (!Number.isSafeInteger(id) || id <= 0) return clientError(res, 422, 'id must be a positive integer');
  try {
    return ok(res, await bindControlledQmsDocument(qmsAuthoringContext(req, orgId, userId), id, req.body), { auditTrail: { persisted: true, chained: true } });
  } catch (err) { return qmsContentRefusal(res, err) ?? serverError(res, log, 'doc-bind', err); }
});

router.get('/qms/documents/:id/editor', async (req: Request, res: Response) => {
  const orgId = getOrgId(req); if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id); if (!Number.isSafeInteger(id) || id <= 0) return clientError(res, 400, 'id must be a positive integer');
  try {
    const result = await qmsClient(req).query(`SELECT * FROM qms_documents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`, [Number(req.params.id), orgId]);
    const row = result.rows[0]; if (!row) return notFoundInTenant(res, 'Document');
    if (!row.authoring_document_id) return clientError(res, 409, 'This register entry has no editing copy. Bind this draft to its project before authoring.', { code: 'QMS_CONTENT_REQUIRED' });
    const scope = await resolveAuthoringDocumentScope(requestPgClient(req), orgId, row.authoring_document_id);
    const permission = await decideAuthoringPermission({ pool:requestPgClient(req), principal: authoringPrincipalFromRequest(req), scope, action: 'view' });
    if (!permission.allowed) return clientError(res, 403, 'You do not have permission to view this authored document.', { code: 'QMS_DOCUMENT_VIEW_DENIED' });
    const document = await qmsClient(req).query(`SELECT * FROM authoring_documents WHERE id = $1 AND tenant_id = $2`, [row.authoring_document_id, orgId]);
    if (!document.rows[0]) return notFoundInTenant(res, 'Authored document');
    return ok(res, { document: document.rows[0], programId: document.rows[0].client_program_id, qmsDocument: row });
  } catch (err) { return serverError(res, log, 'doc-editor', err); }
});

router.get('/qms/documents/:id/versions', async (req: Request, res: Response) => {
  const orgId = getOrgId(req); if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id); if (!Number.isSafeInteger(id) || id <= 0) return clientError(res, 400, 'id must be a positive integer');
  try {
    const parent = await qmsClient(req).query(`SELECT id FROM qms_documents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`, [id, orgId]);
    if (!parent.rows.length) return notFoundInTenant(res, 'Document');
    const rows = await qmsClient(req).query(`SELECT v.* FROM qms_document_versions v JOIN qms_documents d ON d.id = v.document_id AND d.organization_id = v.organization_id
      WHERE v.document_id = $1 AND v.organization_id = $2 AND d.deleted_at IS NULL ORDER BY v.approved_at DESC, v.id DESC`, [Number(req.params.id), orgId]);
    for (const row of rows.rows) {
      if (row.record_kind === 'legacy-registry' && !row.authoring_document_id) continue; // prior org-visible registry metadata only
      const scope = await resolveAuthoringDocumentScope(requestPgClient(req), orgId, row.authoring_document_id);
      const access = await decideAuthoringPermission({ pool:requestPgClient(req), principal: authoringPrincipalFromRequest(req), scope, action: 'view' });
      if (!access.allowed) return clientError(res, 403, 'You do not have permission to read this retained authored version.', { code: 'QMS_DOCUMENT_VIEW_DENIED' });
    }
    return ok(res, rows.rows);
  } catch (err) { return serverError(res, log, 'doc-versions', err); }
});

/* Quality-system template family — the controlled-document types a client
   builds their internal quality system from (Quality manual · Policy · SOP ·
   Work instruction · Form · Validation protocol · Training curriculum), each
   carrying the standard Purpose → Approval section skeleton. Server-curated. */
router.get('/qms/templates', (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  return ok(res, SOP_TEMPLATES, { count: SOP_TEMPLATES.length });
});

/* Periodic-review tracking — controlled docs whose next review is overdue
   (flagged) or falls within `within` days. The next review is the version in
   force's, after its last signed periodic review (periodic-review.ts), so it
   is decided here rather than in SQL. Must precede /documents/:id so the
   literal path is not captured as an id. */
const REVIEW_DUE_LIMIT = 500;
router.get('/qms/documents/review-due', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const withinDays = Math.max(1, Math.min(365, Number(req.query.within) || 30));
  try {
    const client = qmsClient(req);
    const { rows: candidates } = await client.query(`SELECT * FROM qms_documents
        WHERE organization_id = $1 AND deleted_at IS NULL AND status IN ('effective','in_review','draft')`,
      [orgId],
    );
    const schedule = await readQmsReviewSchedule(client, orgId, candidates as QmsDocumentRow[]);
    const today = new Date().toISOString().slice(0, 10);
    const horizon = new Date(Date.now() + withinDays * 86_400_000).toISOString().slice(0, 10);
    // A draft is due only as the revision of a version in force; a document
    // in review stays listed, as it was (in-force-release.ts).
    const rows = candidates
      .filter((row) => row.status !== 'draft' || schedule.inForce.has(Number(row.id)))
      .map((row) => ({ row, due: schedule.dueOf(row as QmsDocumentRow) }))
      .filter((entry): entry is { row: typeof entry.row; due: string } => entry.due !== null && entry.due < horizon)
      .sort((a, b) => a.due.localeCompare(b.due) || String(a.row.doc_number).localeCompare(String(b.row.doc_number)))
      .slice(0, REVIEW_DUE_LIMIT)
      .map(({ row, due }) => ({ ...scheduledRegisterRow(row, schedule), overdue: due < today }));
    return ok(res, rows, { count: rows.length, withinDays });
  } catch (err) { return serverError(res, log, 'doc-review-due', err); }
});

/* Record a periodic review: a signed act on the version in force (gap 5.2,
   docs/design/QMS_PERIODIC_REVIEW_SIGNED_2026-10-22.md). The reviewer
   attests "remains current" with the next date, or "revision required". It
   writes nothing to the row, whose date its approval signed; the review is
   the signature, bound to that release's content (the `qms-document`
   binder). */
router.post('/qms/documents/:id/periodic-review', signedActAttempts, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return clientError(res, 400, 'id must be a positive integer. Nothing was signed.');
  const parsed = qmsPeriodicReviewBody.safeParse({ outcome: req.body?.outcome, nextReviewDate: req.body?.nextReviewDate || undefined });
  if (!parsed.success) {
    const custom = parsed.error.issues.find((issue) => issue.code === 'custom')?.message;
    return clientError(res, 400, `${custom ?? 'The review needs an outcome (current or revision-required) and, for current, a next review date as YYYY-MM-DD.'} Nothing was signed.`,
      parsed.error.flatten().fieldErrors);
  }
  const target = `qms-document:${id}`;
  let recorded: Awaited<ReturnType<typeof recordQmsPeriodicReview>> | null = null;
  await signGovernedAct(req, res, {
    domain: 'qms',
    target,
    meanings: REVIEW_ACT_MEANINGS,
    codeStatus: QMS_PERIODIC_REVIEW_CODE_STATUS,
    run: async (client, orgId) => {
      recorded = await recordQmsPeriodicReview(client, orgId, id, parsed.data);
      const { act } = recorded;
      return { target, payload: act as unknown as Record<string, unknown>, body: { data: act } };
    },
    // The owner's task moves on: the next review, or a revision to make
    // (services/qms/periodic-review-task.ts). Best effort, after the commit.
    afterCommit: async (_result, orgId, userId) => {
      if (!recorded) return;
      const { act, document } = recorded;
      await schedulePeriodicReviewTask({
        organizationId: orgId, document, createdById: userId, closeAs: 'completed',
        ...(act.outcome === 'current'
          ? { kind: 'review', due: act.nextReviewDate }
          : { kind: 'revise', due: act.previousNextReviewDate }),
      });
    },
  });
});

router.get('/qms/documents/:id', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  const userId = getUserId(req);
  if (orgId === null) return orgRequired(res);
  if (userId === null) return clientError(res, 401, 'User context required');
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return clientError(res, 422, 'id must be a positive integer');
  try {
    const client = requestPgClient(req);
    const { rows } = await client.query(
      `SELECT * FROM qms_documents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [id, orgId],
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Document');
    const training = await readQmsTrainingContext(client, { organizationId: orgId, userId, document: rows[0] as QmsDocumentRow });
    return ok(res, qmsRegisterRow(rows[0]), { training });
  } catch (err) {
    if (err instanceof QmsTrainingRefused) return trainingRefusalResponse(res, err);
    const contentRefusal = qmsContentRefusal(res, err); if (contentRefusal) return contentRefusal;
    return serverError(res, log, 'doc-get', err);
  }
});

function trainingWriteFailure(res: Response, error: unknown, operation: string, uncertainMessage: string): Response {
  if (error instanceof QmsTrainingRefused) return trainingRefusalResponse(res, error);
  const contentRefusal = qmsContentRefusal(res, error); if (contentRefusal) return contentRefusal;
  if (error instanceof QmsTrainingCommitUnconfirmed) return res.status(503).json({ error: uncertainMessage,
    details: { code: 'QMS_TRAINING_COMMIT_UNCONFIRMED' } });
  return serverError(res, log, operation, error);
}

async function saveControlledTextResponse(req: Request, res: Response, orgId: number, id: number) {
  const userId = getUserId(req);
  if (userId === null) return clientError(res, 401, 'User context required');
  if (!Number.isSafeInteger(id) || id <= 0) return clientError(res, 422, 'id must be a positive integer');
  const text = qmsControlledTextInputSchema.safeParse(req.body);
  if (!text.success) return clientError(res, 422, 'Invalid controlled text save', text.error.flatten().fieldErrors);
  try {
    const document = await saveQmsControlledText(requestPgClient(req), {
      organizationId: orgId, userId, documentId: id, input: text.data,
      ipAddress: clientIpOf(req) ?? undefined, userAgent: req.get('user-agent'),
    });
    return ok(res, document, { training: describeQmsTrainingDocument(document), auditTrail: { persisted: true, chained: true } });
  } catch (err) {
    return trainingWriteFailure(res, err, 'doc-controlled-text', 'The controlled text save could not be confirmed. Reload the document to check the saved text before trying again.');
  }
}

router.patch('/qms/documents/:id', requireEditorAccess, async (req: Request, res: Response) => {
  const orgId = getOrgId(req); const userId = getUserId(req);
  if (orgId === null) return orgRequired(res);
  if (userId === null) return clientError(res, 401, 'User context required');
  const id = Number(req.params.id); if (!Number.isSafeInteger(id) || id <= 0) return clientError(res, 422, 'id must be a positive integer');
  if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'controlledText')) return saveControlledTextResponse(req, res, orgId, id);
  try {
    // Sending for review names its route (RR4): its notices go out once the send has committed.
    const sink: { routeId?: string; notices: TaskEventNotice[] } = { notices: [] };
    const row = await updateControlledQmsDocument(qmsAuthoringContext(req, orgId, userId), id, req.body, sink);
    for (const n of sink.notices) notifyTaskEvent(n);
    return ok(res, row, { auditTrail: { persisted: true, chained: true }, ...(sink.routeId ? { routeId: sink.routeId } : {}) });
  } catch (err) { return qmsContentRefusal(res, err) ?? qmsRouteRefusal(res, err) ?? serverError(res, log, 'doc-patch', err); }
});

/* Approval = electronic signature. Body: { password, mfaToken?, meaning:
   'APPROVED', reason, effectiveDate? }. Refusals, in the order they are
   checked: 400 (a signature component is missing — named), 403 (the signer's
   org role carries no signing authority; checked BEFORE the credential so the
   route is not a password oracle for unauthorized callers), 401 (password /
   MFA did not verify), 404 (not in tenant), 409 (not draft/in_review),
   403 QMS_SELF_APPROVAL (author signing their own document, §11.10(d)). */
const approveBody = z.object({
  password: z.string().min(1, 'Password re-authentication is required (21 CFR Part 11 §11.200)'),
  mfaToken: z.string().optional(),
  meaning: z.literal(QMS_DOCUMENT_APPROVAL_MEANING, {
    errorMap: () => ({ message: `Signature meaning must be '${QMS_DOCUMENT_APPROVAL_MEANING}' (21 CFR Part 11 §11.50)` }),
  }),
  reason: z.string().trim().min(3, 'A reason for change of at least 3 characters is required').max(2000),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'effectiveDate must be YYYY-MM-DD').optional(),
});

/* Retirement = the same electronic signature (P1-29 / DP-32, security review
   2026-09-24): the approve body without effectiveDate, which a retirement does
   not set. The reason keeps the floor the whole governed surface applies
   (`governedReason`, 8), which 6582e3a3 set for this route on 2026-09-25;
   approve's own floor of 3 predates that rule and is left as it is here. */
const retireBody = approveBody.omit({ effectiveDate: true }).extend({ reason: governedReason });

/** §11.200(a)(1): the first signing presents every component. Names the ones that did not arrive. */
function esignatureComponentMissing(res: Response, act: 'Approval' | 'Retirement', fieldErrors: Record<string, unknown>): Response {
  return clientError(
    res,
    400,
    `${act} is an electronic signature and requires a password, the signature meaning '${QMS_DOCUMENT_APPROVAL_MEANING}' and a reason for change; missing or invalid: ${Object.keys(fieldErrors).join(', ')}`,
    { code: 'ESIGNATURE_COMPONENT_MISSING', fieldErrors },
  );
}

function resolveIpAddress(req: Request): string | null {
  return clientIpOf(req);
}

/**
 * The two pre-transaction checks of a signed QMS act, in the order that keeps
 * the route from being a password oracle: §11.10(g) authority first, then the
 * §11.200 credential. Returns the verified factor set, or the refusal already
 * written to `res`. `act` names the act in the authority refusal.
 */
async function verifyApprovalSigner(
  req: Request,
  res: Response,
  actor: { userId: number; orgId: number },
  body: Pick<z.infer<typeof approveBody>, 'password' | 'mfaToken'>,
  act = 'approving a controlled document',
): Promise<{ secondFactorVerified: boolean } | null> {
  const { userId, orgId } = actor;
  // The platform's one signing-authority policy (P-27, 2026-10-08). This
  // route keeps its own refusal code and sentence; a role that cannot be read
  // is the gate's 503 (it threw here before).
  const authority = await checkSigningAuthority(userId, orgId, requestPgClient(req));
  if (authority?.status === 403) {
    clientError(
      res,
      403,
      `Your role does not permit ${act} (21 CFR Part 11 §11.10(g)).`,
      { code: 'QMS_NO_SIGNING_AUTHORITY' },
    );
    return null;
  }
  if (authority) {
    // clientError's envelope; it takes no 5xx status.
    res.status(authority.status).json({ error: authority.message, details: { code: authority.code } });
    return null;
  }
  // The platform's one signing ceremony: password, enrolled second factor and
  // the account's lockout (services/part11/reverify-signer.ts).
  const signoff = await reverifySigner(
    userId,
    { password: body.password, mfaToken: body.mfaToken },
    signerReverificationDeps(requestPgClient(req)),
  );
  if (!signoff.ok) {
    clientError(res, signoff.status, signoff.error, { code: signoff.code });
    return null;
  }
  // Attribution honesty: only the factors the verifier actually checked.
  return { secondFactorVerified: signoff.secondFactorVerified };
}

function approvalRefusal(res: Response, err: QmsApprovalRefusedError, what: 'Document' | 'Change' = 'Document'): Response {
  if (err.code === 'NOT_FOUND') return notFoundInTenant(res, what);
  if (err.code === 'SELF_APPROVAL') return clientError(res, 403, err.message, { code: 'QMS_SELF_APPROVAL' });
  if (err.code === 'INVALID_AUTHORSHIP') return clientError(res, 409, err.message, { code: 'QMS_INVALID_AUTHORSHIP' });
  // Its own code: the remedy is to re-file the section, not to change the document's state.
  if (err.code === 'FILING_DIVERGED') return clientError(res, 409, err.message, { code: 'FILING_DIVERGED' });
  return clientError(res, 409, err.message, { code: 'QMS_INVALID_STATE' });
}

function signedQmsFailure(res: Response, error: unknown, operation: string, what: 'Document' | 'Change' = 'Document'): Response {
  if (error instanceof QmsApprovalRefusedError) return approvalRefusal(res, error, what);
  const routed = qmsRouteRefusal(res, error); if (routed) return routed;
  const refusal = qmsContentRefusal(res, error); if (refusal) return refusal;
  if (error instanceof QmsSigningAdmissionRefused) return res.status(error.status).json({ error: error.message, details: { code: error.code } });
  return serverError(res, log, operation, error);
}

/**
 * The approval's checks before its transaction: RR4 (B7) first — on a routed
 * document only its named approver, at their turn, approves, and anyone else
 * is refused before the credential is asked — then the signer's authority and
 * credential (verifyApprovalSigner). The refusal is already written when null.
 */
async function verifyRoutedApprovalSigner(
  req: Request, res: Response, actor: { userId: number; orgId: number; id: number }, body: z.infer<typeof approveBody>,
): Promise<{ secondFactorVerified: boolean } | null> {
  try {
    await qmsApprovalPrecheck(qmsClient(req), actor.orgId, actor.userId, actor.id);
  } catch (err) {
    if (!qmsRouteRefusal(res, err)) serverError(res, log, 'doc-approve-route', err);
    return null;
  }
  try {
    return await verifyApprovalSigner(req, res, actor, body);
  } catch (err) { serverError(res, log, 'doc-approve-verify', err); return null; }
}

router.post('/qms/documents/:id/approve', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  const userId = getUserId(req);
  if (orgId === null) return orgRequired(res);
  if (userId === null) return clientError(res, 401, 'User context required');
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');

  const parsed = approveBody.safeParse(req.body ?? {});
  if (!parsed.success) return esignatureComponentMissing(res, 'Approval', parsed.error.flatten().fieldErrors);
  const body = parsed.data;

  const verified = await verifyRoutedApprovalSigner(req, res, { userId, orgId, id }, body);
  if (!verified) return res;
  const notices: TaskEventNotice[] = [];

  let client: (RequestSqlClient & { release(error?: Error): void }) | null = null;
  let commitAttempted = false;
  let discardReason: Error | undefined;
  try {
    client = await requestConnectable(req).connect();
    await client.query('BEGIN');
    const result = await approveQmsDocumentSigned(client, {
      orgId, userId, documentId: id,
      reason: body.reason,
      meaning: body.meaning,
      effectiveDate: body.effectiveDate ?? null,
      authenticationMethod: verified.secondFactorVerified ? 'password+totp' : 'password',
      secondFactorVerified: verified.secondFactorVerified,
      ipAddress: resolveIpAddress(req),
      route: qmsApprovalRoute({ userId, reason: body.reason, notices }) as never,
    });
    commitAttempted = true;
    await client.query('COMMIT');
    for (const n of notices) notifyTaskEvent(n);
    // The version now in force is due on the date its approval signed; the
    // previous version's task, if any, ends with it. Best effort, after commit.
    await schedulePeriodicReviewTask({ organizationId: orgId, document: result.document, createdById: userId,
      kind: 'review', closeAs: 'completed', due: reviewDay(result.document.next_review_date) });
    return ok(res, result.document, {
      auditTrail: { persisted: true, chained: true },
      signature: result.signature,
    });
  } catch (err) {
    if (commitAttempted) {
      discardReason = err instanceof Error ? err : new Error('QMS signature commit unconfirmed');
      return res.status(503).json({
        error: 'The signature could not be confirmed. Reload this record and review its recorded signature before trying again.',
        details: { code: 'QMS_SIGNATURE_COMMIT_UNCONFIRMED', recordId: id, recoveryUrl: `/api/mdx/qms/documents/${id}` },
      });
    }
    await client?.query('ROLLBACK').catch(() => undefined);
    return signedQmsFailure(res, err, 'doc-approve', 'Document');
  } finally {
    client?.release(discardReason);
  }
});

/* Change control — open a controlled revision. Bumps to the next major
   version, returns the document to draft, and clears the prior approval so it
   must be re-reviewed and re-approved. A reason for change is required and is
   captured in metadata + the audit trail (21 CFR Part 11). */
router.post('/qms/documents/:id/revise', requireEditorAccess, async (req: Request, res: Response) => {
  const orgId = getOrgId(req); const userId = getUserId(req);
  if (orgId === null) return orgRequired(res);
  if (userId === null) return clientError(res, 401, 'User context required');
  const id = Number(req.params.id); if (!Number.isSafeInteger(id) || id <= 0) return clientError(res, 422, 'id must be a positive integer');
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  try {
    const row = await reviseControlledQmsDocument(qmsAuthoringContext(req, orgId, userId), id, reason, { programId: req.body?.programId, templateKey: req.body?.templateKey });
    return ok(res, row, { auditTrail: { persisted: true, chained: true } });
  } catch (err) { return qmsContentRefusal(res, err) ?? serverError(res, log, 'doc-revise', err); }
});

/* Retire a controlled document — the terminal lifecycle state, and an
   electronic signature (P1-29 / DP-32, security review 2026-09-24). Until
   2026-09-26 this was an editor-gated, autocommitted UPDATE with a reason, its
   audit row written afterwards: a session alone could end an effective SOP's
   use for everyone trained on it. It is now the approve ceremony against the
   service sibling `retireQmsDocumentSigned`. `requireEditorAccess` stays in
   front, as on every write here; the signing-authority check inside the
   ceremony is the stricter of the two. Body: { password, mfaToken?, meaning:
   'APPROVED', reason }. Refusals, in the order checked: 403 (not an editor),
   400 (a signature component missing — named), 403 QMS_NO_SIGNING_AUTHORITY
   (before the credential), 401/423 (the ceremony), 404 (not in tenant),
   409 QMS_INVALID_STATE (already retired). The UPDATE, the chained ledger pair
   and the signature row commit together or not at all, so `meta.auditTrail`
   on a 200 is always {persisted: true, chained: true}. */
router.post('/qms/documents/:id/retire', requireEditorAccess, async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  const userId = getUserId(req);
  if (orgId === null) return orgRequired(res);
  if (userId === null) return clientError(res, 401, 'User context required');
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');

  const parsed = retireBody.safeParse(req.body ?? {});
  if (!parsed.success) return esignatureComponentMissing(res, 'Retirement', parsed.error.flatten().fieldErrors);
  const body = parsed.data;

  let verified: { secondFactorVerified: boolean } | null;
  try {
    verified = await verifyApprovalSigner(req, res, { userId, orgId }, body, 'retiring a controlled document');
  } catch (err) { return serverError(res, log, 'doc-retire-verify', err); }
  if (!verified) return res;
  const notices: TaskEventNotice[] = [];

  let client: (RequestSqlClient & { release(error?: Error): void }) | null = null;
  let commitAttempted = false;
  let discardReason: Error | undefined;
  try {
    client = await requestConnectable(req).connect();
    await client.query('BEGIN');
    const result = await retireQmsDocumentSigned(client, {
      orgId, userId, documentId: id,
      reason: body.reason,
      meaning: body.meaning,
      authenticationMethod: verified.secondFactorVerified ? 'password+totp' : 'password',
      secondFactorVerified: verified.secondFactorVerified,
      ipAddress: resolveIpAddress(req),
      // RR4 (§2.9): retiring a document in review withdraws its open route on this transaction.
      route: qmsRetirementRoute({ userId, reason: body.reason, notices }) as never,
    });
    commitAttempted = true;
    await client.query('COMMIT');
    for (const n of notices) notifyTaskEvent(n);
    // A retired document has no next review: its open task is withdrawn with it.
    await schedulePeriodicReviewTask({ organizationId: orgId, document: result.document, createdById: userId,
      kind: 'review', closeAs: 'cancelled', due: null });
    return ok(res, result.document, {
      auditTrail: { persisted: true, chained: true },
      signature: result.signature,
    });
  } catch (err) {
    if (commitAttempted) {
      discardReason = err instanceof Error ? err : new Error('QMS signature commit unconfirmed');
      return res.status(503).json({
        error: 'The signature could not be confirmed. Reload this record and review its recorded signature before trying again.',
        details: { code: 'QMS_SIGNATURE_COMMIT_UNCONFIRMED', recordId: id, recoveryUrl: `/api/mdx/qms/documents/${id}` },
      });
    }
    await client?.query('ROLLBACK').catch(() => undefined);
    return signedQmsFailure(res, err, 'doc-retire', 'Document');
  } finally {
    client?.release(discardReason);
  }
});

router.post('/qms/documents/:id/training-ack', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  const userId = getUserId(req);
  if (orgId === null) return orgRequired(res);
  if (userId === null) return clientError(res, 401, 'User context required');
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return clientError(res, 422, 'id must be a positive integer');
  const parsed = qmsTrainingAcknowledgementInputSchema.safeParse(req.body);
  if (!parsed.success) return clientError(res, 422, 'An explicit personal acknowledgement of this revision is required.', parsed.error.flatten().fieldErrors);
  try {
    const result = await acknowledgeQmsTraining(requestPgClient(req), {
      organizationId: orgId, userId, documentId: id, input: parsed.data,
      ipAddress: clientIpOf(req) ?? undefined, userAgent: req.get('user-agent'),
    });
    if (result.alreadyAcknowledged) return ok(res, result.acknowledgement, { alreadyAcknowledged: true });
    return created(res, result.acknowledgement, { auditTrail: { persisted: true, chained: true } });
  } catch (err) {
    return trainingWriteFailure(res, err, 'training-ack', 'The acknowledgement could not be confirmed. Reload the document to check your record before trying again.');
  }
});

router.get('/qms/training', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  try {
    const { rows } = await qmsClient(req).query(`SELECT * FROM qms_training_records WHERE organization_id = $1
        ORDER BY acknowledged_at DESC LIMIT 500`,
      [orgId],
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) { return serverError(res, log, 'training-list', err); }
});

router.get('/qms/training/expiring', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const withinDays = Math.max(1, Math.min(365, Number(req.query.within) || 60));
  /* G10 (2026-10-29). Each active member whose current training on a release in
     force lapses within the window, read as coverage reads it. This listed every
     record with an expiry inside the window: a superseded version, a receipt
     its member had renewed, a departed member's. No client called it. */
  try {
    const rows = await readQmsTrainingExpiring(requestPgClient(req), orgId, withinDays);
    return ok(res, rows, { count: rows.length, withinDays });
  } catch (err) { return serverError(res, log, 'training-expiring', err); }
});

/* Read-and-understood compliance per controlled procedure. The denominator is
   the org roster (organization_users); the numerator is the distinct users with
   a current (non-expired) acknowledgment. Only effective, trainable doc types
   are counted — forms and specifications don't carry read-and-understood. */
router.get('/qms/training/compliance', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  try {
    const rows = await readQmsTrainingCompliance(requestPgClient(req), orgId);
    return ok(res, rows, { count: rows.length });
  } catch (err) { return serverError(res, log, 'training-compliance', err); }
});

/* The supplier, internal-audit and nonconformance routes (mdx-qms-records.ts). */
router.use(qmsRecordsRouter);

/* ─── Management reviews ────────────────────────────────────── */

const mrCreate = z.object({
  reviewDate:        z.string().date(),
  period:            z.string().min(1).max(40),
  attendees:         z.array(z.number().int().positive()).optional().nullable(),
  inputs:            z.record(z.unknown()).optional().nullable(),
  outputs:           z.record(z.unknown()).optional().nullable(),
  minutesArtifactId: z.number().int().positive().optional().nullable(),
});

router.get('/qms/management-reviews', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  try {
    const { rows } = await qmsClient(req).query(`SELECT * FROM qms_management_reviews WHERE organization_id = $1
        ORDER BY review_date DESC`,
      [orgId],
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) { return serverError(res, log, 'mr-list', err); }
});

router.post('/qms/management-reviews', requireEditorAccess, async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = mrCreate.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;
  try {
    const { rows } = await qmsClient(req).query(`INSERT INTO qms_management_reviews (
         organization_id, review_date, period, chair_id, attendees, inputs, outputs,
         minutes_artifact_id
       ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8)
       RETURNING *`,
      [
        orgId, p.reviewDate, p.period, getUserId(req),
        p.attendees ?? null,
        JSON.stringify(p.inputs ?? {}),
        JSON.stringify(p.outputs ?? {}),
        p.minutesArtifactId ?? null,
      ],
    );
    /* WO-16C #133. Was `void auditService.logAction({…})`. The management
       review row is committed by the INSERT above; the sign-off's §11.10(e)
       record is the log beside it, and `meta.auditTrail` now says whether that
       log exists. The review is not withdrawn over a lost row. */
    const auditTrail = await recordAuditRow({
      tenantId: orgId, userId: getUserId(req) ?? undefined,
      action: 'mdx.qms.management_review.signoff',
      resourceType: 'qms_management_review', resourceId: rows[0]?.id,
      details: { period: p.period },
    }, requestConnectable(req));
    return created(res, rows[0], { auditTrail });
  } catch (err) { return serverError(res, log, 'mr-create', err); }
});

/* A management review's actions (ICH Q10 §2.6, ISO 13485 §5.6.3): the decisions
   it took, each with an owner and a due date, kept in `outputs.actions` with no
   new table. Each action is numbered from 1 within its review, and the stored
   open/closed counts move with the array in the same UPDATE, so a count can
   never disagree with the actions it counts. Under the row lock UPDATE takes, a
   concurrent second action re-reads the array and takes the next number.
   Decision P-48; slice G9 of docs/design/PARITY_WEAVE_VEEVA_BASICS_2026-10-29.md. */
const mrActionBody = z.object({
  description: z.string().trim().min(1).max(2000),
  owner:       z.string().trim().max(200).optional().nullable(),
  dueDate:     z.string().date().optional().nullable(),
});
const mrActionCloseBody = z.object({ closureNote: governedReason });
/** The action as recorded: the same three fields go to the UPDATE and the audit row. */
const mrActionFields = (p: z.infer<typeof mrActionBody>) =>
  ({ description: p.description, owner: p.owner ?? null, dueDate: p.dueDate ?? null });
/** The number the UPDATE gave the appended action, for the audit row. */
const lastActionNumber = (row: { outputs?: unknown } | undefined): number | null =>
  (row?.outputs as { actions?: Array<{ n?: number }> } | null)?.actions?.at(-1)?.n ?? null;

router.post('/qms/management-reviews/:id/actions', requireEditorAccess, async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  const parsed = mrActionBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const action = mrActionFields(parsed.data);
  try {
    const { rows } = await qmsClient(req).query(`UPDATE qms_management_reviews SET
         outputs = jsonb_set(COALESCE(outputs, '{}'::jsonb), '{actions}',
           COALESCE(outputs->'actions', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
             'n', COALESCE(jsonb_array_length(outputs->'actions'), 0) + 1,
             'description', $3::text, 'owner', $4::text, 'dueDate', $5::text, 'state', 'open',
             'recordedBy', $6::int, 'recordedAt', now()))),
         open_action_count = COALESCE(open_action_count, 0) + 1,
         updated_at = now()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [id, orgId, action.description, action.owner, action.dueDate, getUserId(req)],
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Management review');
    const auditTrail = await recordAuditRow({
      tenantId: orgId, userId: getUserId(req) ?? undefined,
      action: 'mdx.qms.management_review.action.add',
      resourceType: 'qms_management_review', resourceId: String(id),
      details: { action: lastActionNumber(rows[0]), ...action },
    }, requestConnectable(req));
    return created(res, rows[0], { auditTrail });
  } catch (err) { return serverError(res, log, 'mr-action-add', err); }
});

router.post('/qms/management-reviews/:id/actions/:n/close', requireEditorAccess, async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  const n = Number(req.params.n);
  if (!Number.isInteger(id) || !Number.isInteger(n)) return clientError(res, 422, 'id and action number must be numeric');
  const parsed = mrActionCloseBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, parsed.error.issues[0]?.message ?? 'Invalid body');
  try {
    /* Every reference is to the row being updated (m), never a second read of
       it, so under a concurrent close the re-check sees the action already
       closed and updates nothing. No open action numbered n, no update: closing
       twice, or a number that does not exist, is a 404. */
    const { rows } = await qmsClient(req).query(`UPDATE qms_management_reviews m SET
         outputs = jsonb_set(m.outputs, '{actions}', (
           SELECT jsonb_agg(CASE WHEN (e.a->>'n')::int = $3::int AND e.a->>'state' = 'open'
             THEN e.a || jsonb_build_object('state', 'closed', 'closedBy', $5::int, 'closedAt', now(), 'closureNote', $4::text)
             ELSE e.a END ORDER BY e.ord)
             FROM jsonb_array_elements(m.outputs->'actions') WITH ORDINALITY AS e(a, ord))),
         open_action_count = GREATEST(COALESCE(m.open_action_count, 0) - 1, 0),
         closed_action_count = COALESCE(m.closed_action_count, 0) + 1,
         updated_at = now()
       WHERE m.id = $1 AND m.organization_id = $2
         AND EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(m.outputs->'actions', '[]'::jsonb)) AS e(a)
                      WHERE (e.a->>'n')::int = $3::int AND e.a->>'state' = 'open')
       RETURNING m.*`,
      [id, orgId, n, parsed.data.closureNote, getUserId(req)],
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Open management-review action');
    const auditTrail = await recordAuditRow({
      tenantId: orgId, userId: getUserId(req) ?? undefined,
      action: 'mdx.qms.management_review.action.close',
      resourceType: 'qms_management_review', resourceId: String(id),
      details: { action: n, closureNote: parsed.data.closureNote },
    }, requestConnectable(req));
    return ok(res, rows[0], { auditTrail });
  } catch (err) { return serverError(res, log, 'mr-action-close', err); }
});

/* ─── Change control (ICH Q10 §3.2.3 / EU GMP Annex 15 / 21 CFR 820.30·820.70) ──
   The governed change-management register + its cross-references to deviations,
   CAPAs, validation protocols and controlled documents. Lifecycle is a state
   machine (changeControl.service CHANGE_TRANSITIONS); approval enforces
   segregation of duties; every transition writes a 21 CFR Part 11 audit entry.
   Reads fail CLOSED to an honest empty list when the store is not yet
   provisioned (42P01) so the surface shows its typed fixtures, never a 500. */

const changeCreate = z.object({
  changeNumber:             z.string().min(1).max(60),
  title:                    z.string().min(1).max(300),
  description:              z.string().max(8000).optional().nullable(),
  changeType:               z.enum(CHANGE_TYPES).optional(),
  classification:           z.enum(CHANGE_CLASSIFICATIONS).optional(),
  riskLevel:                z.enum(CHANGE_RISK_LEVELS).optional().nullable(),
  reason:                   z.string().max(4000).optional().nullable(),
  impactAssessment:         z.string().max(8000).optional().nullable(),
  implementationPlan:       z.string().max(8000).optional().nullable(),
  targetImplementationDate: z.string().date().optional().nullable(),
  qmsDocumentId:            z.number().int().positive().optional().nullable(),
  metadata:                 z.record(z.unknown()).optional().nullable(),
});
const changePatch = z.object({
  title:                    z.string().min(1).max(300).optional(),
  description:              z.string().max(8000).optional().nullable(),
  changeType:               z.enum(CHANGE_TYPES).optional(),
  classification:           z.enum(CHANGE_CLASSIFICATIONS).optional(),
  riskLevel:                z.enum(CHANGE_RISK_LEVELS).optional().nullable(),
  reason:                   z.string().max(4000).optional().nullable(),
  impactAssessment:         z.string().max(8000).optional().nullable(),
  implementationPlan:       z.string().max(8000).optional().nullable(),
  targetImplementationDate: z.string().date().optional().nullable(),
  qmsDocumentId:            z.number().int().positive().optional().nullable(),
});
/* A lifecycle move states its reason (21 CFR 11.10(e)), recorded on the audit
   row (QA walk 2026-10-08, J8: the AnA tool for the same move required one; this
   route took none, so the native Advance control had nothing to record). */
const changeTransition = z.object({
  to:                  z.enum(CHANGE_STATES),
  reason:              governedReason,
  effectivenessReview: z.string().max(8000).optional().nullable(),
});
const changeListQuery = z.object({
  status:      z.enum(CHANGE_STATES).optional(),
  change_type: z.enum(CHANGE_TYPES).optional(),
});
const linkCreate = z.object({
  linkType:     z.enum(LINK_TYPES),
  linkedRef:    z.string().min(1).max(120),
  linkedLabel:  z.string().max(300).optional().nullable(),
  linkedId:     z.number().int().positive().optional().nullable(),
  relationship: z.enum(LINK_RELATIONSHIPS).optional(),
  note:         z.string().max(2000).optional().nullable(),
});

/** True for a "relation does not exist" error — the store is not yet provisioned. */
function isMissingStore(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === '42P01';
}

// List the change-control register (optionally filtered by status / type).
router.get('/qms/changes', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = changeListQuery.safeParse(req.query);
  if (!parsed.success) return clientError(res, 422, 'Invalid query', parsed.error.flatten().fieldErrors);
  try {
    const rows = await listChanges(orgId, {
      status: parsed.data.status,
      changeType: parsed.data.change_type,
    }, requestPgClient(req));
    /* Each change carries its cross-references (one org-scoped read for the
       whole register) and the lifecycle moves its state allows — the surface
       rendered "0 links" for every change and could only hand a move to AnA
       (QA walk 2026-10-08, J8). `implementation_overdue` is the database's
       verdict against CURRENT_DATE (changeControl.service). */
    const links = await listLinksForChanges(orgId, rows.map((r) => r.id), requestPgClient(req));
    const register = rows.map((r) => ({
      ...r,
      links: links.get(Number(r.id)) ?? [],
      next_states: nextStatesOf(r.status),
    }));
    return ok(res, register, { count: register.length });
  } catch (err) {
    if (isMissingStore(err)) return ok(res, [], { count: 0, pendingStore: true });
    return serverError(res, log, 'change-list', err);
  }
});

// Register summary (KPIs for the Change Control surface).
router.get('/qms/changes/summary', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  try {
    return ok(res, await changeControlSummary(orgId, requestPgClient(req)));
  } catch (err) {
    if (isMissingStore(err)) {
      return ok(res, {
        total: 0, open: 0, awaitingApproval: 0, inImplementation: 0,
        awaitingVerification: 0, closed: 0, overdueImplementation: 0, byStatus: {},
      }, { pendingStore: true });
    }
    return serverError(res, log, 'change-summary', err);
  }
});

// Create a change request.
/* DP-60 (2026-10-01): change-control writes carry the editor gate the
   document, supplier, audit and nonconformance writes carry (P1-31). A viewer
   could open, edit, transition and delete a change record and its links; only
   the approve step (a signature with its own authority check) refused it. */
router.post('/qms/changes', requireEditorAccess, async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = changeCreate.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  try {
    const row = await createChange(orgId, { ...parsed.data, proposedBy: getUserId(req) }, requestPgClient(req));
    /* WO-16C #133. Was `void auditService.logAction({…})`. `createChange` has
       already inserted the change request and returned it, so the register entry
       stands; `meta.auditTrail` now says whether the §11.10(e) record of who
       raised it exists. */
    const auditTrail = await recordAuditRow({
      tenantId: orgId, userId: getUserId(req) ?? undefined,
      action: 'mdx.qms.change.create',
      resourceType: 'qms_change_control', resourceId: row.id,
      details: { changeNumber: row.change_number, classification: row.classification },
    }, requestConnectable(req));
    return created(res, row, { auditTrail });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23505') {
      return clientError(res, 409, 'A change with that number already exists in this org');
    }
    return serverError(res, log, 'change-create', err);
  }
});

// Single change + its cross-references.
router.get('/qms/changes/:id', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  try {
    const change = await getChange(orgId, id, requestPgClient(req));
    if (!change) return notFoundInTenant(res, 'Change');
    const links = await listLinks(orgId, id, requestPgClient(req));
    return ok(res, { ...change, links });
  } catch (err) { return serverError(res, log, 'change-get', err); }
});

// Partial update (draft edits; not a lifecycle move — use /transition for that).
router.patch('/qms/changes/:id', requireEditorAccess, async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  const parsed = changePatch.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  try {
    const row = await updateChange(orgId, id, { ...parsed.data, assessedBy: getUserId(req) }, requestPgClient(req));
    if (!row) return notFoundInTenant(res, 'Change');
    /* WO-16C #133. Was `void auditService.logAction({…})`. `updateChange` has
       committed the edit and returned the row, so the edit is not undone here;
       `meta.auditTrail` reports whether the §11.10(e) record of it exists. */
    const auditTrail = await recordAuditRow({
      tenantId: orgId, userId: getUserId(req) ?? undefined,
      action: 'mdx.qms.change.update',
      resourceType: 'qms_change_control', resourceId: id,
    }, requestConnectable(req));
    return ok(res, row, { auditTrail });
  } catch (err) { return serverError(res, log, 'change-update', err); }
});

// Advance a change through the controlled lifecycle.
router.post('/qms/changes/:id/transition', requireEditorAccess, async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  const userId = getUserId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  const parsed = changeTransition.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  try {
    const row = await transitionChange(orgId, id, parsed.data.to as ChangeState, {
      userId, effectivenessReview: parsed.data.effectivenessReview,
    }, requestPgClient(req));
    if (!row) return notFoundInTenant(res, 'Change');
    /* WO-16C #133. Was `void auditService.logAction({…})`, on the change-control
       register's own lifecycle route — including the segregation-of-duties-checked
       step into `approved`. `transitionChange` has already stamped the new status
       (and the approver, on that step), so the move stands and is not rolled
       back; `meta.auditTrail` now says whether the record of it was written.

       `transitionChange` throws both refusals before this point, so the 409 and
       422 arms below have no audit outcome to carry and none is claimed — which
       also means no refused transition is recorded anywhere in this file.

       (Two corrections to an earlier version of this comment, both from the
       review of this conversion. It called this "the one route in this file whose
       §11.10(e) row is the record of a controlled lifecycle move": the document
       approve / revise / retire routes above are lifecycle moves too, and the
       retire route's own comment says so. And "is the record of the move" would
       make this rule-2's exception, owing a 503 — it is not, as this comment's
       own next clause says, because transitionChange has already stamped the
       status. Both were false, and a false sentence inside a fabrication fix is
       the same defect in prose.) */
    const auditTrail = await recordAuditRow({
      tenantId: orgId, userId: userId ?? undefined,
      action: 'mdx.qms.change.transition',
      resourceType: 'qms_change_control', resourceId: id,
      reason: parsed.data.reason,
      details: { from: row.from_status, to: parsed.data.to },
    }, requestConnectable(req));
    return ok(res, row, { auditTrail });
  } catch (err) {
    if (err instanceof InvalidChangeTransitionError) return clientError(res, 409, err.message);
    // 428: the approval exists, through the signed route below (DP-31 / P1-28).
    if (err instanceof ChangeApprovalRequiresSignatureError) {
      return clientError(res, 428, err.message, { code: err.code });
    }
    return serverError(res, log, 'change-transition', err);
  }
});

/* Approval of a change = electronic signature (security review 2026-09-24,
   DP-31; plan P1-28). The same body, ceremony and refusals as the controlled-
   document approval above: 400 for a missing component, 403 without signing
   authority (checked before the credential), 401 when the password or code does
   not verify, 404 outside the tenant, 409 unless the change is under
   assessment, 403 QMS_SELF_APPROVAL for the proposer. On success the approval
   stamp, the chained ledger row and one signature bound to the change's content
   digest commit together (services/qms/change-approval-signature.ts). */
router.post('/qms/changes/:id/approve', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  const userId = getUserId(req);
  if (orgId === null) return orgRequired(res);
  if (userId === null) return clientError(res, 401, 'User context required');
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');

  const parsed = approveBody.safeParse(req.body ?? {});
  if (!parsed.success) return esignatureComponentMissing(res, 'Approval', parsed.error.flatten().fieldErrors);
  const body = parsed.data;

  let verified: { secondFactorVerified: boolean } | null;
  try {
    verified = await verifyApprovalSigner(req, res, { userId, orgId }, body);
  } catch (err) { return serverError(res, log, 'change-approve-verify', err); }
  if (!verified) return res;

  let client: (RequestSqlClient & { release(error?: Error): void }) | null = null;
  let commitAttempted = false;
  let discardReason: Error | undefined;
  try {
    client = await requestConnectable(req).connect();
    await client.query('BEGIN');
    const result = await approveQmsChangeSigned(client, {
      orgId, userId, changeId: id,
      reason: body.reason,
      meaning: body.meaning,
      authenticationMethod: verified.secondFactorVerified ? 'password+totp' : 'password',
      secondFactorVerified: verified.secondFactorVerified,
      ipAddress: resolveIpAddress(req),
    });
    commitAttempted = true;
    await client.query('COMMIT');
    return ok(res, result.change, {
      auditTrail: { persisted: true, chained: true },
      signature: result.signature,
    });
  } catch (err) {
    if (commitAttempted) {
      discardReason = err instanceof Error ? err : new Error('QMS signature commit unconfirmed');
      return res.status(503).json({
        error: 'The signature could not be confirmed. Reload this record and review its recorded signature before trying again.',
        details: { code: 'QMS_SIGNATURE_COMMIT_UNCONFIRMED', recordId: id, recoveryUrl: `/api/mdx/qms/changes/${id}` },
      });
    }
    await client?.query('ROLLBACK').catch(() => undefined);
    return signedQmsFailure(res, err, 'change-approve', 'Change');
  } finally {
    client?.release(discardReason);
  }
});

// Soft-delete (retire) a change request.
router.delete('/qms/changes/:id', requireEditorAccess, async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  try {
    const removed = await deleteChange(orgId, id, requestPgClient(req));
    if (!removed) return notFoundInTenant(res, 'Change');
    /* WO-16C #133. Was `void auditService.logAction({…})`. `deleteChange` has
       already stamped `deleted_at`, and it reported that it matched a row, so
       the soft-delete stands; `meta.auditTrail` now says whether the §11.10(e)
       record of who retired the change request exists. */
    const auditTrail = await recordAuditRow({
      tenantId: orgId, userId: getUserId(req) ?? undefined,
      action: 'mdx.qms.change.delete',
      resourceType: 'qms_change_control', resourceId: id,
    }, requestConnectable(req));
    return ok(res, { id, deleted: true }, { auditTrail });
  } catch (err) { return serverError(res, log, 'change-delete', err); }
});

// Cross-references: list.
router.get('/qms/changes/:id/links', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  try {
    const rows = await listLinks(orgId, id, requestPgClient(req));
    return ok(res, rows, { count: rows.length });
  } catch (err) {
    if (isMissingStore(err)) return ok(res, [], { count: 0, pendingStore: true });
    return serverError(res, log, 'change-links-list', err);
  }
});

// Cross-references: link a change to a deviation / CAPA / validation / document.
router.post('/qms/changes/:id/links', requireEditorAccess, async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  const parsed = linkCreate.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  try {
    const change = await getChange(orgId, id, requestPgClient(req));
    if (!change) return notFoundInTenant(res, 'Change');
    const row = await addLink(orgId, id, { ...parsed.data, createdBy: getUserId(req) }, requestPgClient(req));
    /* WO-16C #133. Was `void auditService.logAction({…})`. `addLink` has
       inserted the cross-reference and returned it, so the link stands;
       `meta.auditTrail` reports whether the §11.10(e) record of it exists. */
    const auditTrail = await recordAuditRow({
      tenantId: orgId, userId: getUserId(req) ?? undefined,
      action: 'mdx.qms.change.link',
      resourceType: 'qms_change_control', resourceId: id,
      details: { linkType: parsed.data.linkType, linkedRef: parsed.data.linkedRef },
    }, requestConnectable(req));
    return created(res, row, { auditTrail });
  } catch (err) { return serverError(res, log, 'change-link-add', err); }
});

// Cross-references: remove a link.
router.delete('/qms/changes/:id/links/:linkId', requireEditorAccess, async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  const linkId = Number(req.params.linkId);
  if (!Number.isFinite(id) || !Number.isFinite(linkId)) return clientError(res, 422, 'id must be numeric');
  try {
    const removed = await removeLink(orgId, id, linkId, requestPgClient(req));
    if (!removed) return notFoundInTenant(res, 'Link');
    /* WO-16C #133. Was `void auditService.logAction({…})`. The link row is
       already deleted by `removeLink`, which reported that it matched one, so
       the removal stands and the §11.10(e) record beside it is the only thing
       left to report — `meta.auditTrail`. */
    const auditTrail = await recordAuditRow({
      tenantId: orgId, userId: getUserId(req) ?? undefined,
      action: 'mdx.qms.change.unlink',
      resourceType: 'qms_change_control', resourceId: id,
      details: { linkId },
    }, requestConnectable(req));
    return ok(res, { id: linkId, deleted: true }, { auditTrail });
  } catch (err) { return serverError(res, log, 'change-link-remove', err); }
});

// The review route's acts on a controlled document (RR4): services/qms/qms-review-route.ts.
mountQmsReviewRoute(router);

export default router;
