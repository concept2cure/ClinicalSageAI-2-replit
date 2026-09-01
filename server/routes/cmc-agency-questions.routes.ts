/**
 * Agency questions — the WRITE half of the correspondence loop.
 *
 * The board (cmc-module3-board.routes) reads reg_questions org-scoped and the
 * CMC surface triages, drafts responses, tasks and closes work from it — but
 * nothing in the product could WRITE the store. The only writers were a Gmail
 * ingest and a legacy IR router (server/api/cmc/regulatoryIR.ts) written
 * against a reg_questions shape this schema does not have (sub_id/q_id/
 * final_md…): every call it served failed, it carried no tenant scoping, and
 * its delete was "gated" by a client-controlled header. That router is
 * deleted in the same change that adds this one — the live table is the
 * canonical shape, and these are its governed writes.
 *
 * Mounted at /api/cmc/agency-questions behind authenticateToken.
 *   GET   /      — the file itself, org-scoped. ?status=CLOSED serves the
 *                  answered history (the record the board's open filter
 *                  deliberately leaves out — this is where "stays in the
 *                  record" becomes readable, before the next agency
 *                  interaction and at inspection).
 *   POST  /      — log a question the agency asked (org stamped from the
 *                  verified JWT, never the body; status starts OPEN).
 *   PATCH /:id   — triage updates: status / assignee / due date / priority /
 *                  section reference / response-draft link (responseDocId,
 *                  verified org-scoped against authoring_documents before it
 *                  is recorded). WHERE id AND organization_id — a row in
 *                  another org is a 404, indistinguishable from absent.
 * No DELETE, deliberately: an agency question is answered and closed, never
 * erased. CLOSED rows drop out of the board's open filter and stay in the
 * record.
 *
 * @module server/routes/cmc-agency-questions.routes
 */
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { query as q } from '../db.js';
import { getSecureOrgId } from '../utils/tenantContext.js';
import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('cmc-agency-questions');

/** Resolve the JWT-derived org id as the integer organization_id, or null. */
function resolveTenantId(req: Request): number | null {
  const orgId = getSecureOrgId(req);
  const tenantId = orgId == null ? NaN : Number(orgId);
  return Number.isFinite(tenantId) ? tenantId : null;
}

/** The lifecycle the board's open filter reads (OPEN/DRAFTED/IN_REVIEW = open). */
const STATUSES = ['OPEN', 'DRAFTED', 'IN_REVIEW', 'CLOSED'] as const;

/* This is the MODULE 3 correspondence file, and the board that serves it
   filters to Module 3 references — a question created here with a section
   from another module would be committed, confirmed, and then invisible in
   the only UI over the store. A provided reference must therefore be a
   Module 3 one (refusal beats vanishing); an ABSENT reference is legal and
   the board lists unsectioned rows alongside the sectioned ones. */
const M3_REF = /^m?3(\.|$)/i;

const createBody = z.object({
  questionText: z.string().trim().min(1, 'The question text is required').max(8000),
  sectionReference: z
    .string()
    .trim()
    .max(40)
    .regex(M3_REF, 'This is the Module 3 correspondence file — use a 3.x section reference, or leave it empty.')
    .optional(),
  region: z.string().trim().max(40).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  severity: z.enum(['MINOR', 'MAJOR', 'CRITICAL']).optional(),
  /** ISO date (the agency's response deadline). */
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dueDate must be YYYY-MM-DD').optional(),
  assignedTo: z.string().trim().max(200).optional(),
});

const patchBody = z
  .object({
    status: z.enum(STATUSES).optional(),
    /** Guard against acting on a stale row: when provided, the update applies
     *  only while the question still holds this status — a concurrent close
     *  answers 409 instead of being silently reopened. */
    expectedStatus: z.enum(STATUSES).optional(),
    sectionReference: z
      .string()
      .trim()
      .max(40)
      .regex(M3_REF, 'This is the Module 3 correspondence file — use a 3.x section reference, or clear it.')
      .nullable()
      .optional(),
    region: z.string().trim().max(40).nullable().optional(),
    priority: z.enum(['low', 'medium', 'high']).optional(),
    severity: z.enum(['MINOR', 'MAJOR', 'CRITICAL']).optional(),
    dueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'dueDate must be YYYY-MM-DD')
      .nullable()
      .optional(),
    assignedTo: z.string().trim().max(200).nullable().optional(),
    /** The authoring document holding the drafted response. Verified against
     *  the caller's org before it is linked — a dangling or cross-org id
     *  would render an "Open draft" door that opens nothing. */
    responseDocId: z.string().uuid('responseDocId must be a document id').nullable().optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), {
    message: 'At least one field to update is required',
  });

interface RegQuestionRow {
  id: number;
  question_text: string;
  section_reference: string | null;
  priority: string | null;
  severity: string | null;
  status: string;
  region: string | null;
  due_date: string | Date | null;
  assigned_to: string | null;
  response_doc_id: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

/** The same camelCase shape the board's correspondence rows use. */
function mapRow(r: RegQuestionRow) {
  return {
    id: r.id,
    question: r.question_text,
    sectionRef: r.section_reference,
    priority: r.priority,
    severity: r.severity,
    status: r.status,
    region: r.region,
    dueDate: r.due_date ? new Date(r.due_date).toISOString() : null,
    assignedTo: r.assigned_to,
    responseDocId: r.response_doc_id ?? null,
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
    updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null,
  };
}

export default function createCmcAgencyQuestionRoutes(): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response) => {
    const tenantId = resolveTenantId(req);
    if (tenantId == null) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }
    // ?status filters to one lifecycle state; omitted serves the whole file.
    // An unknown status is a refusal, not an empty list pretending to be one.
    const status = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : undefined;
    if (status !== undefined && !(STATUSES as readonly string[]).includes(status)) {
      return res.status(400).json({
        success: false,
        error: `status must be one of ${STATUSES.join(', ')}`,
      });
    }
    try {
      const params: unknown[] = [tenantId];
      let statusClause = '';
      if (status !== undefined) {
        params.push(status);
        statusClause = ` and status = $${params.length}`;
      }
      const { rows } = await q(
        `select id, question_text, section_reference, priority, severity, status,
                region, due_date, assigned_to, response_doc_id, created_at, updated_at
           from reg_questions
          where organization_id = $1${statusClause}
            and (section_reference ilike '3.%' or section_reference ilike 'm3%'
                 or section_reference is null)
          order by updated_at desc, id desc
          limit 100`,
        params,
      );
      return res.json({ success: true, data: (rows as RegQuestionRow[]).map(mapRow) });
    } catch (err) {
      logger.error('agency-question list failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return res
        .status(500)
        .json({ success: false, error: 'The correspondence file could not be read.' });
    }
  });

  router.post('/', async (req: Request, res: Response) => {
    const tenantId = resolveTenantId(req);
    if (tenantId == null) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }
    const parsed = createBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message ?? 'Invalid request body',
        details: parsed.error.issues,
      });
    }
    const b = parsed.data;
    try {
      const { rows } = await q(
        `insert into reg_questions
           (organization_id, question_text, section_reference, region, priority,
            severity, status, due_date, assigned_to)
         values ($1, $2, $3, $4, coalesce($5, 'medium'), coalesce($6, 'MAJOR'),
                 'OPEN', $7, $8)
         returning id, question_text, section_reference, priority, severity,
                   status, region, due_date, assigned_to, response_doc_id,
                   created_at, updated_at`,
        [
          tenantId,
          b.questionText,
          b.sectionReference ?? null,
          b.region ?? null,
          b.priority ?? null,
          b.severity ?? null,
          b.dueDate ?? null,
          b.assignedTo ?? null,
        ],
      );
      return res.status(201).json({ success: true, data: mapRow(rows[0] as RegQuestionRow) });
    } catch (err) {
      logger.error('agency-question create failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return res
        .status(500)
        .json({ success: false, error: 'The agency question could not be recorded.' });
    }
  });

  router.patch('/:id', async (req: Request, res: Response) => {
    const tenantId = resolveTenantId(req);
    if (tenantId == null) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid question id' });
    }
    const parsed = patchBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message ?? 'Invalid request body',
        details: parsed.error.issues,
      });
    }
    const b = parsed.data;
    // Build the SET list only from fields the caller actually sent, so a
    // triage update never nulls what it did not mention.
    const sets: string[] = [];
    const params: unknown[] = [];
    const set = (col: string, val: unknown) => {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };
    if (b.status !== undefined) set('status', b.status);
    if (b.sectionReference !== undefined) set('section_reference', b.sectionReference);
    if (b.region !== undefined) set('region', b.region);
    if (b.priority !== undefined) set('priority', b.priority);
    if (b.severity !== undefined) set('severity', b.severity);
    if (b.dueDate !== undefined) set('due_date', b.dueDate);
    if (b.assignedTo !== undefined) set('assigned_to', b.assignedTo);
    if (b.responseDocId !== undefined) {
      if (b.responseDocId !== null) {
        // The link is a DOOR the card renders — verify it opens before it is
        // recorded. authoring_documents.tenant_id is the same integer org
        // space as reg_questions.organization_id, so a cross-org id fails
        // here rather than becoming a dead "Open draft". WRITE-TIME only (no
        // FK — the authoring tables are ensure-DDL'd lazily): a document
        // deleted later leaves the id dangling, and the editor's deep-link
        // then states an honest miss instead of opening anything.
        try {
          const doc = await q(
            `select 1 from authoring_documents where id = $1 and tenant_id = $2`,
            [b.responseDocId, tenantId],
          );
          if (doc.rows.length === 0) {
            return res.status(400).json({
              success: false,
              error: 'That response draft could not be found in this organization — nothing was linked.',
            });
          }
        } catch (err) {
          logger.error('response-doc verification failed', {
            error: err instanceof Error ? err.message : String(err),
          });
          return res.status(500).json({
            success: false,
            error: 'The response draft could not be verified, so nothing was linked.',
          });
        }
      }
      set('response_doc_id', b.responseDocId);
    }
    if (sets.length === 0) {
      // expectedStatus alone is a guard, not an update — and an empty SET list
      // would be malformed SQL answered as a 500.
      return res.status(400).json({ success: false, error: 'At least one field to update is required' });
    }
    params.push(id, tenantId);
    const idParam = params.length - 1;
    const orgParam = params.length;
    let statusGuard = '';
    if (b.expectedStatus !== undefined) {
      params.push(b.expectedStatus);
      statusGuard = ` and status = $${params.length}`;
    }
    try {
      const { rows } = await q(
        `update reg_questions
            set ${sets.join(', ')}, updated_at = now()
          where id = $${idParam} and organization_id = $${orgParam}${statusGuard}
          returning id, question_text, section_reference, priority, severity,
                    status, region, due_date, assigned_to, response_doc_id,
                    created_at, updated_at`,
        params,
      );
      if (rows.length === 0) {
        // With a status guard, distinguish "the row moved on" from "no such
        // row": acting on a stale status must not read as a vanished question.
        if (b.expectedStatus !== undefined) {
          const still = await q(
            `select status from reg_questions where id = $1 and organization_id = $2`,
            [id, tenantId],
          );
          if (still.rows.length > 0) {
            return res.status(409).json({
              success: false,
              error: `The question is ${String((still.rows[0] as { status: string }).status)} now — it changed since this screen loaded. Nothing was updated.`,
            });
          }
        }
        // Another org's row and a nonexistent row answer identically.
        return res.status(404).json({ success: false, error: 'Question not found' });
      }
      return res.json({ success: true, data: mapRow(rows[0] as RegQuestionRow) });
    } catch (err) {
      logger.error('agency-question update failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return res
        .status(500)
        .json({ success: false, error: 'The agency question could not be updated.' });
    }
  });

  return router;
}
