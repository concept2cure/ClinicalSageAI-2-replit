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
 *   POST   /api/mdx/qms/documents/:id/training-ack      user acknowledges training
 *   GET    /api/mdx/qms/training                        list training records
 *   GET    /api/mdx/qms/training/expiring               periodic refresh due
 *
 *   GET    /api/mdx/qms/suppliers                       list
 *   POST   /api/mdx/qms/suppliers                       create
 *   PATCH  /api/mdx/qms/suppliers/:id                   update
 *
 *   GET    /api/mdx/qms/internal-audits                 list audits
 *   POST   /api/mdx/qms/internal-audits                 create
 *   PATCH  /api/mdx/qms/internal-audits/:id             update
 *
 *   GET    /api/mdx/qms/management-reviews              list reviews
 *   POST   /api/mdx/qms/management-reviews              create
 *
 *   GET    /api/mdx/qms/nonconforming                   list NC products
 *   POST   /api/mdx/qms/nonconforming                   create
 *   PATCH  /api/mdx/qms/nonconforming/:id/disposition   set disposition
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
import { pool } from '../db';
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
import { verifySignerCredentials, defaultSignoffDeps } from '../services/ana-ri/governed-action-signoff';
import { resolveSignerOrgRole } from '../services/part11/resolve-signer-role';
import { isSigningAuthorized } from '../services/part11/signing-authority';
import {
  approveQmsDocumentSigned,
  QmsApprovalRefusedError,
  QMS_DOCUMENT_APPROVAL_MEANING,
} from '../services/qms/document-approval-signature';
import { SOP_TEMPLATES, getSopTemplate, type SopSection } from '../services/qms/sopTemplates';
import {
  createChange, listChanges, getChange, updateChange, transitionChange, deleteChange,
  listLinks, addLink, removeLink, changeControlSummary,
  CHANGE_TYPES, CHANGE_CLASSIFICATIONS, CHANGE_RISK_LEVELS, CHANGE_STATES,
  LINK_TYPES, LINK_RELATIONSHIPS,
  InvalidChangeTransitionError, SegregationOfDutiesError,
  type ChangeState,
} from '../services/qms/changeControl.service';
import { clientIpOf } from '../utils/client-ip';

const router = Router();
const log = createScopedLogger('mdx-qms');

function getOrgId(req: Request): number | null {
  const raw = (req as any).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}
function getUserId(req: Request): number | null {
  const raw = (req as any).user?.id;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

const DOC_TYPE = ['sop', 'wi', 'form', 'spec', 'policy', 'manual', 'protocol', 'curriculum'] as const;
const DOC_STATUS = ['draft', 'in_review', 'effective', 'superseded', 'retired'] as const;
const CRITICALITY = ['critical', 'major', 'minor'] as const;
const SUPPLIER_STATUS = ['pending', 'approved', 'conditional', 'revoked'] as const;
const AUDIT_STATUS = ['planned', 'in_progress', 'closed', 'cancelled'] as const;
const DISPOSITION = ['use_as_is', 'rework', 'regrade', 'scrap', 'return_to_supplier', 'pending'] as const;

/* ─── Documents ─────────────────────────────────────────────── */

const docListQuery = z.object({
  doc_type: z.enum(DOC_TYPE).optional(),
  status:   z.enum(DOC_STATUS).optional(),
  category: z.string().max(60).optional(),
});
const sopSectionSchema = z.object({
  key:   z.string().min(1).max(80),
  label: z.string().min(1).max(200),
  order: z.number().int().nonnegative().optional(),
  hint:  z.string().max(500).optional(),
});
const docCreate = z.object({
  docNumber:        z.string().min(1).max(60),
  title:            z.string().min(1).max(300),
  docType:          z.enum(DOC_TYPE),
  category:         z.string().max(60).optional().nullable(),
  version:          z.string().max(20).optional(),
  status:           z.enum(DOC_STATUS).optional(),
  effectiveDate:    z.string().date().optional().nullable(),
  nextReviewDate:   z.string().date().optional().nullable(),
  artifactId:       z.number().int().positive().optional().nullable(),
  templateKey:      z.string().max(80).optional().nullable(),
  sections:         z.array(sopSectionSchema).optional().nullable(),
  metadata:         z.record(z.unknown()).optional().nullable(),
});
const docPatch = docCreate.partial();

/** Bump to the next major version (e.g. '3.1' → '4.0'); defaults to '2.0'. */
function nextMajorVersion(v: string | null | undefined): string {
  const m = /^(\d+)/.exec(String(v ?? '').trim());
  const major = m ? parseInt(m[1], 10) : 1;
  return `${major + 1}.0`;
}

/** Build create-time metadata — seeds the section skeleton from a templateKey
 *  when the caller did not pass an explicit sections array. Returns null when
 *  there is nothing to store (so the column keeps its '{}' default). */
function buildCreateMetadata(p: z.infer<typeof docCreate>): Record<string, unknown> | null {
  const meta: Record<string, unknown> = { ...(p.metadata ?? {}) };
  if (p.templateKey) {
    meta.templateKey = p.templateKey;
    const tpl = getSopTemplate(p.templateKey);
    const sections: SopSection[] | undefined =
      (p.sections as SopSection[] | undefined) ?? tpl?.sections;
    if (sections) meta.sections = sections;
    if (tpl) meta.family = tpl.family;
  } else if (p.sections) {
    meta.sections = p.sections;
  }
  return Object.keys(meta).length > 0 ? meta : null;
}

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

router.get('/qms/readiness', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);

  /** Run one block's query; absent table → null (block unavailable). */
  const block = async <T extends Record<string, unknown>>(
    name: string,
    sql: string,
  ): Promise<T | null> => {
    try {
      const { rows } = await pool.query(sql, [orgId]);
      return (rows[0] as T) ?? null;
    } catch (err) {
      if ((err as { code?: string })?.code !== '42P01') {
        log.warn(`qms readiness block ${name} failed`, {
          err: err instanceof Error ? err.message : String(err),
        });
      }
      return null;
    }
  };

  try {
    const [docs, suppliers, training, audits, nonconforming] = await Promise.all([
      /* Controlled documents: effective set, and how many of those are
         past their scheduled periodic review. Drafts are counted so the
         panel can show work-in-flight, but only overdue reviews are a
         readiness problem. */
      block<{ effective: number; review_overdue: number; draft: number }>(
        'documents',
        `SELECT
            COUNT(*) FILTER (WHERE status = 'effective')::int AS effective,
            COUNT(*) FILTER (WHERE status = 'effective'
                               AND next_review_date IS NOT NULL
                               AND next_review_date < CURRENT_DATE)::int AS review_overdue,
            COUNT(*) FILTER (WHERE status IN ('draft','in_review'))::int AS draft
           FROM qms_documents
          WHERE organization_id = $1 AND deleted_at IS NULL`,
      ),
      /* Suppliers: the two readiness killers are an unapproved critical
         supplier and an overdue supplier audit. */
      block<{ total: number; critical_unapproved: number; audit_overdue: number }>(
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
      block<{ acknowledged: number; expired: number }>(
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
      block<{ open: number; open_major_findings: number }>(
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
      block<{ undispositioned: number }>(
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
          ? { available: true, effective: docs.effective, reviewOverdue: docs.review_overdue, draft: docs.draft }
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
    const { rows } = await pool.query(
      `SELECT * FROM qms_documents WHERE ${filters.join(' AND ')}
        ORDER BY doc_number`,
      args,
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) { return serverError(res, log, 'doc-list', err); }
});

router.post('/qms/documents', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = docCreate.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;
  try {
    const { rows } = await pool.query(
      `INSERT INTO qms_documents (
         organization_id, doc_number, title, doc_type, category, version, status,
         effective_date, next_review_date, author_id, artifact_id, metadata
       ) VALUES ($1,$2,$3,$4,$5,COALESCE($6,'1.0'),COALESCE($7,'draft'),$8,$9,$10,$11,COALESCE($12::jsonb,'{}'::jsonb))
       RETURNING *`,
      [
        orgId, p.docNumber, p.title, p.docType, p.category ?? null,
        p.version ?? null, p.status ?? null,
        p.effectiveDate ?? null, p.nextReviewDate ?? null, getUserId(req), p.artifactId ?? null,
        (() => { const m = buildCreateMetadata(p); return m ? JSON.stringify(m) : null; })(),
      ],
    );
    /* A controlled QMS document is the object this whole subsystem exists to
       govern, and its creation recorded no §11.10(e) row at all — found by the
       review of the #133 conversion of this file, which had nothing to convert
       here because nothing was written. Approve / revise / retire on the same
       document each record one. The INSERT is already committed, so this is a log
       beside it; `meta.auditTrail` says whether the log exists. */
    const auditTrail = await recordAuditRow({
      tenantId: orgId, userId: getUserId(req) ?? undefined,
      action: 'mdx.qms.document.create',
      resourceType: 'qms_document', resourceId: String(rows[0].id),
      details: { docNumber: p.docNumber, docType: p.docType, version: rows[0].version, status: rows[0].status },
    });
    return created(res, rows[0], { auditTrail });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === '23505') return clientError(res, 409, 'A document with that number already exists in this org');
    return serverError(res, log, 'doc-create', err);
  }
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

/* Periodic-review tracking — controlled docs whose next_review_date is overdue
   (flagged) or falls within `within` days. Must precede /documents/:id so the
   literal path is not captured as an id. */
router.get('/qms/documents/review-due', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const withinDays = Math.max(1, Math.min(365, Number(req.query.within) || 30));
  try {
    const { rows } = await pool.query(
      `SELECT *, (next_review_date < CURRENT_DATE) AS overdue
         FROM qms_documents
        WHERE organization_id = $1 AND deleted_at IS NULL
          AND status IN ('effective','in_review')
          AND next_review_date IS NOT NULL
          AND next_review_date < CURRENT_DATE + ($2 || ' days')::interval
        ORDER BY next_review_date ASC LIMIT 500`,
      [orgId, withinDays],
    );
    return ok(res, rows, { count: rows.length, withinDays });
  } catch (err) { return serverError(res, log, 'doc-review-due', err); }
});

router.get('/qms/documents/:id', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  try {
    const { rows } = await pool.query(
      `SELECT * FROM qms_documents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [id, orgId],
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Document');
    return ok(res, rows[0]);
  } catch (err) { return serverError(res, log, 'doc-get', err); }
});

router.patch('/qms/documents/:id', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  const parsed = docPatch.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const COL: Record<string, string> = {
    docNumber: 'doc_number', title: 'title', docType: 'doc_type',
    category: 'category', version: 'version', status: 'status',
    effectiveDate: 'effective_date', nextReviewDate: 'next_review_date',
    artifactId: 'artifact_id',
  };
  const setFrags: string[] = []; const args: unknown[] = [];
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue;
    const col = COL[k]; if (!col) continue;
    args.push(v); setFrags.push(`${col} = $${args.length}`);
  }
  if (setFrags.length === 0) return clientError(res, 422, 'No updatable fields in body');
  setFrags.push(`updated_at = NOW()`);
  args.push(id, orgId);
  try {
    const { rows } = await pool.query(
      `UPDATE qms_documents SET ${setFrags.join(', ')}
        WHERE id = $${args.length - 1} AND organization_id = $${args.length} AND deleted_at IS NULL
        RETURNING *`,
      args,
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Document');
    /* Editing a controlled document — including its status, effective date and
       next review date — recorded no §11.10(e) row, while approve / revise /
       retire on the same document each record one. Found by the review of the
       #133 conversion of this file, which had nothing to convert here because
       nothing was written. The UPDATE is already committed, so this is a log
       beside it; `meta.auditTrail` says whether the log exists. */
    const auditTrail = await recordAuditRow({
      tenantId: orgId, userId: getUserId(req) ?? undefined,
      action: 'mdx.qms.document.update',
      resourceType: 'qms_document', resourceId: String(id),
      details: { changedFields: Object.keys(parsed.data) },
    });
    return ok(res, rows[0], { auditTrail });
  } catch (err) { return serverError(res, log, 'doc-patch', err); }
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

function resolveIpAddress(req: Request): string | null {
  return clientIpOf(req);
}

/**
 * The two pre-transaction checks of an approval, in the order that keeps the
 * route from being a password oracle: §11.10(g) authority first, then the
 * §11.200 credential. Returns the verified factor set, or the refusal already
 * written to `res`.
 */
async function verifyApprovalSigner(
  req: Request,
  res: Response,
  userId: number,
  orgId: number,
  body: z.infer<typeof approveBody>,
): Promise<{ secondFactorVerified: boolean } | null> {
  const signerRole = await resolveSignerOrgRole(userId, orgId);
  if (!isSigningAuthorized(signerRole)) {
    clientError(
      res,
      403,
      'Your role does not permit approving a controlled document (21 CFR Part 11 §11.10(g)).',
      { code: 'QMS_NO_SIGNING_AUTHORITY' },
    );
    return null;
  }
  const signoff = await verifySignerCredentials(defaultSignoffDeps, {
    userId, password: body.password, mfaToken: body.mfaToken,
  });
  if (!signoff.verified) {
    clientError(
      res,
      401,
      signoff.error ?? 'Signer verification failed (21 CFR Part 11 §11.200).',
      { code: signoff.code ?? 'REAUTH_FAILED' },
    );
    return null;
  }
  // Attribution honesty: only the factors the verifier actually checked.
  return { secondFactorVerified: signoff.secondFactorVerified };
}

function approvalRefusal(res: Response, err: QmsApprovalRefusedError): Response {
  if (err.code === 'NOT_FOUND') return notFoundInTenant(res, 'Document');
  if (err.code === 'SELF_APPROVAL') return clientError(res, 403, err.message, { code: 'QMS_SELF_APPROVAL' });
  return clientError(res, 409, err.message, { code: 'QMS_INVALID_STATE' });
}

router.post('/qms/documents/:id/approve', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  const userId = getUserId(req);
  if (orgId === null) return orgRequired(res);
  if (userId === null) return clientError(res, 401, 'User context required');
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');

  const parsed = approveBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    return clientError(
      res,
      400,
      `Approval is an electronic signature and requires a password, the signature meaning '${QMS_DOCUMENT_APPROVAL_MEANING}' and a reason for change; missing or invalid: ${Object.keys(fieldErrors).join(', ')}`,
      { code: 'ESIGNATURE_COMPONENT_MISSING', fieldErrors },
    );
  }
  const body = parsed.data;

  let verified: { secondFactorVerified: boolean } | null;
  try {
    verified = await verifyApprovalSigner(req, res, userId, orgId, body);
  } catch (err) { return serverError(res, log, 'doc-approve-verify', err); }
  if (!verified) return res;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await approveQmsDocumentSigned(client, {
      orgId, userId, documentId: id,
      reason: body.reason,
      meaning: body.meaning,
      effectiveDate: body.effectiveDate ?? null,
      authenticationMethod: verified.secondFactorVerified ? 'password+totp' : 'password',
      secondFactorVerified: verified.secondFactorVerified,
      ipAddress: resolveIpAddress(req),
    });
    await client.query('COMMIT');
    return ok(res, result.document, {
      auditTrail: { persisted: true, chained: true },
      signature: result.signature,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (err instanceof QmsApprovalRefusedError) return approvalRefusal(res, err);
    return serverError(res, log, 'doc-approve', err);
  } finally {
    client.release();
  }
});

/* Change control — open a controlled revision. Bumps to the next major
   version, returns the document to draft, and clears the prior approval so it
   must be re-reviewed and re-approved. A reason for change is required and is
   captured in metadata + the audit trail (21 CFR Part 11). */
router.post('/qms/documents/:id/revise', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  const userId = getUserId(req);
  if (orgId === null) return orgRequired(res);
  if (userId === null) return clientError(res, 401, 'User context required');
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (!reason) return clientError(res, 422, 'A reason for change is required to open a revision');
  const explicitVersion = typeof req.body?.version === 'string' ? req.body.version.trim() : null;
  try {
    const cur = await pool.query<{ version: string }>(
      `SELECT version FROM qms_documents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [id, orgId],
    );
    if (cur.rows.length === 0) return notFoundInTenant(res, 'Document');
    const fromVersion = cur.rows[0].version;
    const newVersion = explicitVersion || nextMajorVersion(fromVersion);
    const { rows } = await pool.query(
      `UPDATE qms_documents
          SET status = 'draft',
              version = $3,
              approver_id = NULL,
              approved_at = NULL,
              metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                'lastRevision',
                jsonb_build_object('reason', $4::text, 'from', $5::text, 'at', NOW(), 'by', $6::int)
              ),
              updated_at = NOW()
        WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
          AND status IN ('effective','superseded','retired','in_review')
        RETURNING *`,
      [id, orgId, newVersion, reason, fromVersion, userId],
    );
    if (rows.length === 0) return clientError(res, 409, 'Document cannot be revised from its current state');
    /* WO-16C #133. Was `void auditService.logAction({…})`. The revision is
       committed by the UPDATE above — new version, approval cleared, and the
       reason-for-change written into `metadata.lastRevision` — so the document
       row keeps the reason either way. What was unobservable is whether the
       audit-trail copy of it landed; that is now `meta.auditTrail`. The
       revision is not rolled back over a lost row. */
    const auditTrail = await recordAuditRow({
      tenantId: orgId, userId: userId ?? undefined, action: 'mdx.qms.document.revise',
      resourceType: 'qms_document', resourceId: id,
      details: { reason, from: fromVersion, to: newVersion },
    });
    return ok(res, rows[0], { auditTrail });
  } catch (err) { return serverError(res, log, 'doc-revise', err); }
});

/* Retire a controlled document — terminal lifecycle state. Captures an
   optional reason in metadata + the audit trail. */
router.post('/qms/documents/:id/retire', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  const userId = getUserId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : null;
  try {
    const { rows } = await pool.query(
      `UPDATE qms_documents
          SET status = 'retired',
              metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                'retired', jsonb_build_object('reason', $3::text, 'at', NOW(), 'by', $4::int)
              ),
              updated_at = NOW()
        WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL AND status <> 'retired'
        RETURNING *`,
      [id, orgId, reason, userId],
    );
    if (rows.length === 0) return clientError(res, 409, 'Document not found, or already retired');
    /* WO-16C #133. Was `void auditService.logAction({…})`. Retirement is a
       terminal lifecycle state and the UPDATE above has already set it, so the
       row stands; `meta.auditTrail` says whether the §11.10(e) record of who
       retired it, and why, exists. */
    const auditTrail = await recordAuditRow({
      tenantId: orgId, userId: userId ?? undefined, action: 'mdx.qms.document.retire',
      resourceType: 'qms_document', resourceId: id, details: { reason },
    });
    return ok(res, rows[0], { auditTrail });
  } catch (err) { return serverError(res, log, 'doc-retire', err); }
});

router.post('/qms/documents/:id/training-ack', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  const userId = getUserId(req);
  if (orgId === null) return orgRequired(res);
  if (userId === null) return clientError(res, 401, 'User context required');
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  try {
    /* Tenant gate. */
    const doc = await pool.query<{ version: string }>(
      `SELECT version FROM qms_documents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [id, orgId],
    );
    if (doc.rows.length === 0) return notFoundInTenant(res, 'Document');
    const method = typeof req.body?.method === 'string' ? req.body.method : 'attestation';
    const quizScore = typeof req.body?.quizScore === 'number' ? Math.round(req.body.quizScore) : null;
    const { rows } = await pool.query(
      `INSERT INTO qms_training_records (
         organization_id, user_id, document_id, document_version,
         acknowledgment_method, quiz_score, expires_at
       ) VALUES ($1, $2, $3, $4, $5, $6, NOW() + INTERVAL '365 days')
       RETURNING *`,
      [orgId, userId, id, doc.rows[0].version, method, quizScore],
    );
    /* WO-16C #133. Was `void auditService.logAction({…})`. The acknowledgment
       itself is the `qms_training_records` row the INSERT above returns, so the
       training evidence survives a lost audit row; the audit row is the
       §11.10(e) log beside it. `meta.auditTrail` reports which of the two
       outcomes this request had. */
    const auditTrail = await recordAuditRow({
      tenantId: orgId, userId: userId ?? undefined, action: 'mdx.qms.training.acknowledge',
      resourceType: 'qms_document', resourceId: id, details: { method, quizScore },
    });
    return created(res, rows[0], { auditTrail });
  } catch (err) { return serverError(res, log, 'training-ack', err); }
});

router.get('/qms/training', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  try {
    const { rows } = await pool.query(
      `SELECT * FROM qms_training_records WHERE organization_id = $1
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
  try {
    const { rows } = await pool.query(
      `SELECT t.*, d.title AS document_title, d.doc_number
         FROM qms_training_records t
         JOIN qms_documents d ON d.id = t.document_id
        WHERE t.organization_id = $1
          AND t.expires_at IS NOT NULL
          AND t.expires_at < NOW() + ($2 || ' days')::interval
        ORDER BY t.expires_at ASC LIMIT 500`,
      [orgId, withinDays],
    );
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
    const { rows } = await pool.query(
      `WITH roster AS (
         SELECT COUNT(*)::int AS n FROM organization_users WHERE organization_id = $1
       ),
       acks AS (
         SELECT document_id,
                COUNT(DISTINCT user_id) FILTER (WHERE expires_at IS NULL OR expires_at > NOW())::int AS current,
                MAX(acknowledged_at) AS last_cycle
           FROM qms_training_records
          WHERE organization_id = $1
          GROUP BY document_id
       )
       SELECT d.id, d.doc_number, d.title,
              COALESCE(a.current, 0)::int AS current,
              (SELECT n FROM roster)      AS of,
              a.last_cycle
         FROM qms_documents d
         LEFT JOIN acks a ON a.document_id = d.id
        WHERE d.organization_id = $1 AND d.deleted_at IS NULL
          AND d.status = 'effective'
          AND d.doc_type IN ('sop','wi','manual','policy','protocol','curriculum')
        ORDER BY d.doc_number LIMIT 200`,
      [orgId],
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) { return serverError(res, log, 'training-compliance', err); }
});

/* ─── Suppliers ─────────────────────────────────────────────── */

const supplierCreate = z.object({
  supplierName:        z.string().min(1).max(300),
  supplierCode:        z.string().max(60).optional().nullable(),
  scope:               z.string().max(1000).optional().nullable(),
  criticality:         z.enum(CRITICALITY),
  approvalStatus:      z.enum(SUPPLIER_STATUS).optional(),
  approvalDate:        z.string().date().optional().nullable(),
  reapprovalDate:      z.string().date().optional().nullable(),
  qualityAgreementId:  z.number().int().positive().optional().nullable(),
  lastAuditDate:       z.string().date().optional().nullable(),
  nextAuditDate:       z.string().date().optional().nullable(),
  isoCertifications:   z.array(z.string()).optional().nullable(),
});
const supplierPatch = supplierCreate.partial();

router.get('/qms/suppliers', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const status = typeof req.query.status === 'string' && SUPPLIER_STATUS.includes(req.query.status as (typeof SUPPLIER_STATUS)[number])
    ? req.query.status : null;
  const filters: string[] = [`organization_id = $1`, `deleted_at IS NULL`];
  const args: unknown[] = [orgId];
  if (status) { args.push(status); filters.push(`approval_status = $${args.length}`); }
  try {
    const { rows } = await pool.query(
      `SELECT * FROM qms_suppliers WHERE ${filters.join(' AND ')}
        ORDER BY supplier_name`,
      args,
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) { return serverError(res, log, 'supp-list', err); }
});

router.post('/qms/suppliers', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = supplierCreate.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;
  try {
    const { rows } = await pool.query(
      `INSERT INTO qms_suppliers (
         organization_id, supplier_name, supplier_code, scope, criticality,
         approval_status, approval_date, reapproval_date, quality_agreement_id,
         last_audit_date, next_audit_date, iso_certifications
       ) VALUES ($1,$2,$3,$4,$5,COALESCE($6,'pending'),$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        orgId, p.supplierName, p.supplierCode ?? null, p.scope ?? null, p.criticality,
        p.approvalStatus ?? null, p.approvalDate ?? null, p.reapprovalDate ?? null,
        p.qualityAgreementId ?? null, p.lastAuditDate ?? null, p.nextAuditDate ?? null,
        p.isoCertifications ?? null,
      ],
    );
    /* WO-16C #133. Was `void auditService.logAction({…})`. The supplier row is
       inserted by the query above, so the qualification record stands; what the
       caller could not tell is whether the §11.10(e) entry naming who qualified
       a critical supplier landed with it. Now in `meta.auditTrail`. */
    const auditTrail = await recordAuditRow({
      tenantId: orgId, userId: getUserId(req) ?? undefined,
      action: 'mdx.qms.supplier.qualify',
      resourceType: 'qms_supplier', resourceId: rows[0]?.id,
      details: { supplierName: p.supplierName, criticality: p.criticality },
    });
    return created(res, rows[0], { auditTrail });
  } catch (err) { return serverError(res, log, 'supp-create', err); }
});

router.patch('/qms/suppliers/:id', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  const parsed = supplierPatch.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const COL: Record<string, string> = {
    supplierName: 'supplier_name', supplierCode: 'supplier_code', scope: 'scope',
    criticality: 'criticality', approvalStatus: 'approval_status',
    approvalDate: 'approval_date', reapprovalDate: 'reapproval_date',
    qualityAgreementId: 'quality_agreement_id', lastAuditDate: 'last_audit_date',
    nextAuditDate: 'next_audit_date', isoCertifications: 'iso_certifications',
  };
  const setFrags: string[] = []; const args: unknown[] = [];
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue;
    const col = COL[k]; if (!col) continue;
    args.push(v); setFrags.push(`${col} = $${args.length}`);
  }
  if (setFrags.length === 0) return clientError(res, 422, 'No updatable fields in body');
  setFrags.push(`updated_at = NOW()`);
  args.push(id, orgId);
  try {
    const { rows } = await pool.query(
      `UPDATE qms_suppliers SET ${setFrags.join(', ')}
        WHERE id = $${args.length - 1} AND organization_id = $${args.length} AND deleted_at IS NULL
        RETURNING *`,
      args,
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Supplier');
    /* A supplier's approval standing is a controlled QMS record, and changing it
       recorded no §11.10(e) row — while CREATING the same supplier, sixty lines
       above, has always recorded one. Found by the review of the #133 conversion
       of this file. The row is already committed, so this is a log beside it;
       `meta.auditTrail` says whether the log exists. */
    const auditTrail = await recordAuditRow({
      tenantId: orgId, userId: getUserId(req) ?? undefined,
      action: 'mdx.qms.supplier.update',
      resourceType: 'qms_supplier', resourceId: String(id),
      details: { changedFields: Object.keys(parsed.data) },
    });
    return ok(res, rows[0], { auditTrail });
  } catch (err) { return serverError(res, log, 'supp-patch', err); }
});

/* ─── Internal audits ───────────────────────────────────────── */

const auditCreate = z.object({
  auditNumber:    z.string().min(1).max(60),
  scope:          z.string().min(1).max(2000),
  auditStandard:  z.string().max(200).optional().nullable(),
  auditorTeam:    z.array(z.number().int().positive()).optional().nullable(),
  plannedDate:    z.string().date().optional().nullable(),
  status:         z.enum(AUDIT_STATUS).optional(),
});
const auditPatch = auditCreate.partial().extend({
  startedAt:      z.string().date().optional().nullable(),
  completedAt:    z.string().date().optional().nullable(),
  findingCount:   z.number().int().nonnegative().optional(),
  majorFindings:  z.number().int().nonnegative().optional(),
  minorFindings:  z.number().int().nonnegative().optional(),
  observations:   z.number().int().nonnegative().optional(),
});

router.get('/qms/internal-audits', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  try {
    const { rows } = await pool.query(
      `SELECT * FROM qms_internal_audits WHERE organization_id = $1
        ORDER BY planned_date DESC NULLS LAST, id DESC`,
      [orgId],
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) { return serverError(res, log, 'audit-list', err); }
});

router.post('/qms/internal-audits', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = auditCreate.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;
  try {
    const { rows } = await pool.query(
      `INSERT INTO qms_internal_audits (
         organization_id, audit_number, scope, audit_standard,
         auditor_lead_id, auditor_team, planned_date, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8,'planned'))
       RETURNING *`,
      [
        orgId, p.auditNumber, p.scope, p.auditStandard ?? null,
        getUserId(req), p.auditorTeam ?? null, p.plannedDate ?? null, p.status ?? null,
      ],
    );
    /* An internal audit is ISO 13485 §8.2.4 evidence and its creation recorded no
       §11.10(e) row. Found by the review of the #133 conversion of this file. The
       audit row is already committed, so this is a log beside it;
       `meta.auditTrail` says whether the log exists. */
    const auditTrail = await recordAuditRow({
      tenantId: orgId, userId: getUserId(req) ?? undefined,
      action: 'mdx.qms.internal_audit.create',
      resourceType: 'qms_internal_audit', resourceId: String(rows[0].id),
      details: { auditNumber: p.auditNumber, auditStandard: p.auditStandard ?? null, scope: p.scope },
    });
    return created(res, rows[0], { auditTrail });
  } catch (err) { return serverError(res, log, 'audit-create', err); }
});

router.patch('/qms/internal-audits/:id', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  const parsed = auditPatch.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const COL: Record<string, string> = {
    auditNumber: 'audit_number', scope: 'scope', auditStandard: 'audit_standard',
    auditorTeam: 'auditor_team', plannedDate: 'planned_date', startedAt: 'started_at',
    completedAt: 'completed_at', status: 'status', findingCount: 'finding_count',
    majorFindings: 'major_findings', minorFindings: 'minor_findings',
    observations: 'observations',
  };
  const setFrags: string[] = []; const args: unknown[] = [];
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue;
    const col = COL[k]; if (!col) continue;
    args.push(v); setFrags.push(`${col} = $${args.length}`);
  }
  if (setFrags.length === 0) return clientError(res, 422, 'No updatable fields in body');
  setFrags.push(`updated_at = NOW()`);
  args.push(id, orgId);
  try {
    const { rows } = await pool.query(
      `UPDATE qms_internal_audits SET ${setFrags.join(', ')}
        WHERE id = $${args.length - 1} AND organization_id = $${args.length}
        RETURNING *`,
      args,
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Audit');
    /* Changing an internal audit's findings or closure recorded no §11.10(e) row.
       Found by the review of the #133 conversion of this file. The row is already
       committed, so this is a log beside it; `meta.auditTrail` says whether it
       exists. */
    const auditTrail = await recordAuditRow({
      tenantId: orgId, userId: getUserId(req) ?? undefined,
      action: 'mdx.qms.internal_audit.update',
      resourceType: 'qms_internal_audit', resourceId: String(id),
      details: { changedFields: Object.keys(parsed.data) },
    });
    return ok(res, rows[0], { auditTrail });
  } catch (err) { return serverError(res, log, 'audit-patch', err); }
});

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
    const { rows } = await pool.query(
      `SELECT * FROM qms_management_reviews WHERE organization_id = $1
        ORDER BY review_date DESC`,
      [orgId],
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) { return serverError(res, log, 'mr-list', err); }
});

router.post('/qms/management-reviews', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = mrCreate.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;
  try {
    const { rows } = await pool.query(
      `INSERT INTO qms_management_reviews (
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
    });
    return created(res, rows[0], { auditTrail });
  } catch (err) { return serverError(res, log, 'mr-create', err); }
});

/* ─── Nonconforming products ────────────────────────────────── */

const ncCreate = z.object({
  ncNumber:       z.string().min(1).max(60),
  deviceName:     z.string().max(300).optional().nullable(),
  lotOrSerial:    z.string().max(120).optional().nullable(),
  source:         z.string().max(60).optional().nullable(),
  description:    z.string().min(1).max(4000),
});
const ncDispoBody = z.object({
  disposition:           z.enum(DISPOSITION),
  dispositionRationale:  z.string().max(4000).optional().nullable(),
});

router.get('/qms/nonconforming', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  try {
    const { rows } = await pool.query(
      `SELECT * FROM qms_nonconforming_products WHERE organization_id = $1
        ORDER BY detected_at DESC LIMIT 500`,
      [orgId],
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) { return serverError(res, log, 'nc-list', err); }
});

router.post('/qms/nonconforming', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = ncCreate.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;
  try {
    const { rows } = await pool.query(
      `INSERT INTO qms_nonconforming_products (
         organization_id, nc_number, device_name, lot_or_serial, source, description,
         detected_by, disposition
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,'pending')
       RETURNING *`,
      [
        orgId, p.ncNumber, p.deviceName ?? null, p.lotOrSerial ?? null,
        p.source ?? null, p.description, getUserId(req),
      ],
    );
    /* Recording a nonconforming product is §8.3 / 21 CFR 820.90 evidence, and it
       recorded no 21 CFR Part 11 §11.10(e) row at all — while the DISPOSITION of
       the same NCR, forty lines below, has always recorded one. Found by the
       review of the #133 conversion of this file, which had nothing to convert
       here because nothing was written. The NCR row is already committed, so this
       is a log beside it; `meta.auditTrail` says whether the log exists. */
    const auditTrail = await recordAuditRow({
      tenantId: orgId, userId: getUserId(req) ?? undefined,
      action: 'mdx.qms.nonconforming.create',
      resourceType: 'qms_nonconforming_product', resourceId: String(rows[0].id),
      details: { ncNumber: p.ncNumber, lotOrSerial: p.lotOrSerial ?? null, source: p.source ?? null },
    });
    return created(res, rows[0], { auditTrail });
  } catch (err) { return serverError(res, log, 'nc-create', err); }
});

router.patch('/qms/nonconforming/:id/disposition', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  const parsed = ncDispoBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  try {
    const { rows } = await pool.query(
      `UPDATE qms_nonconforming_products
          SET disposition = $3,
              disposition_rationale = $4,
              disposition_at = NOW(),
              updated_at = NOW()
        WHERE id = $1 AND organization_id = $2
        RETURNING *`,
      [id, orgId, parsed.data.disposition, parsed.data.dispositionRationale ?? null],
    );
    if (rows.length === 0) return notFoundInTenant(res, 'NC record');
    /* WO-16C #133. Was `void auditService.logAction({…})`. The disposition —
       scrap, rework, use-as-is — is already stamped on the NC row by the UPDATE
       above, so it is not reverted; `meta.auditTrail` reports whether the
       §11.10(e) record of who dispositioned the product exists. */
    const auditTrail = await recordAuditRow({
      tenantId: orgId, userId: getUserId(req) ?? undefined,
      action: 'mdx.qms.nonconforming.disposition',
      resourceType: 'qms_nonconforming_product', resourceId: id,
      details: { disposition: parsed.data.disposition },
    });
    return ok(res, rows[0], { auditTrail });
  } catch (err) { return serverError(res, log, 'nc-disposition', err); }
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
const changeTransition = z.object({
  to:                  z.enum(CHANGE_STATES),
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
    });
    return ok(res, rows, { count: rows.length });
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
    return ok(res, await changeControlSummary(orgId));
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
router.post('/qms/changes', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = changeCreate.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  try {
    const row = await createChange(orgId, { ...parsed.data, proposedBy: getUserId(req) });
    /* WO-16C #133. Was `void auditService.logAction({…})`. `createChange` has
       already inserted the change request and returned it, so the register entry
       stands; `meta.auditTrail` now says whether the §11.10(e) record of who
       raised it exists. */
    const auditTrail = await recordAuditRow({
      tenantId: orgId, userId: getUserId(req) ?? undefined,
      action: 'mdx.qms.change.create',
      resourceType: 'qms_change_control', resourceId: row.id,
      details: { changeNumber: row.change_number, classification: row.classification },
    });
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
    const change = await getChange(orgId, id);
    if (!change) return notFoundInTenant(res, 'Change');
    const links = await listLinks(orgId, id);
    return ok(res, { ...change, links });
  } catch (err) { return serverError(res, log, 'change-get', err); }
});

// Partial update (draft edits; not a lifecycle move — use /transition for that).
router.patch('/qms/changes/:id', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  const parsed = changePatch.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  try {
    const row = await updateChange(orgId, id, { ...parsed.data, assessedBy: getUserId(req) });
    if (!row) return notFoundInTenant(res, 'Change');
    /* WO-16C #133. Was `void auditService.logAction({…})`. `updateChange` has
       committed the edit and returned the row, so the edit is not undone here;
       `meta.auditTrail` reports whether the §11.10(e) record of it exists. */
    const auditTrail = await recordAuditRow({
      tenantId: orgId, userId: getUserId(req) ?? undefined,
      action: 'mdx.qms.change.update',
      resourceType: 'qms_change_control', resourceId: id,
    });
    return ok(res, row, { auditTrail });
  } catch (err) { return serverError(res, log, 'change-update', err); }
});

// Advance a change through the controlled lifecycle.
router.post('/qms/changes/:id/transition', async (req: Request, res: Response) => {
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
    });
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
      details: { to: parsed.data.to },
    });
    return ok(res, row, { auditTrail });
  } catch (err) {
    if (err instanceof InvalidChangeTransitionError) return clientError(res, 409, err.message);
    if (err instanceof SegregationOfDutiesError) return clientError(res, 422, err.message);
    return serverError(res, log, 'change-transition', err);
  }
});

// Soft-delete (retire) a change request.
router.delete('/qms/changes/:id', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  try {
    const removed = await deleteChange(orgId, id);
    if (!removed) return notFoundInTenant(res, 'Change');
    /* WO-16C #133. Was `void auditService.logAction({…})`. `deleteChange` has
       already stamped `deleted_at`, and it reported that it matched a row, so
       the soft-delete stands; `meta.auditTrail` now says whether the §11.10(e)
       record of who retired the change request exists. */
    const auditTrail = await recordAuditRow({
      tenantId: orgId, userId: getUserId(req) ?? undefined,
      action: 'mdx.qms.change.delete',
      resourceType: 'qms_change_control', resourceId: id,
    });
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
    const rows = await listLinks(orgId, id);
    return ok(res, rows, { count: rows.length });
  } catch (err) {
    if (isMissingStore(err)) return ok(res, [], { count: 0, pendingStore: true });
    return serverError(res, log, 'change-links-list', err);
  }
});

// Cross-references: link a change to a deviation / CAPA / validation / document.
router.post('/qms/changes/:id/links', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  const parsed = linkCreate.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  try {
    const change = await getChange(orgId, id);
    if (!change) return notFoundInTenant(res, 'Change');
    const row = await addLink(orgId, id, { ...parsed.data, createdBy: getUserId(req) });
    /* WO-16C #133. Was `void auditService.logAction({…})`. `addLink` has
       inserted the cross-reference and returned it, so the link stands;
       `meta.auditTrail` reports whether the §11.10(e) record of it exists. */
    const auditTrail = await recordAuditRow({
      tenantId: orgId, userId: getUserId(req) ?? undefined,
      action: 'mdx.qms.change.link',
      resourceType: 'qms_change_control', resourceId: id,
      details: { linkType: parsed.data.linkType, linkedRef: parsed.data.linkedRef },
    });
    return created(res, row, { auditTrail });
  } catch (err) { return serverError(res, log, 'change-link-add', err); }
});

// Cross-references: remove a link.
router.delete('/qms/changes/:id/links/:linkId', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  const linkId = Number(req.params.linkId);
  if (!Number.isFinite(id) || !Number.isFinite(linkId)) return clientError(res, 422, 'id must be numeric');
  try {
    const removed = await removeLink(orgId, id, linkId);
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
    });
    return ok(res, { id: linkId, deleted: true }, { auditTrail });
  } catch (err) { return serverError(res, log, 'change-link-remove', err); }
});

export default router;
