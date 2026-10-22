/**
 * The earlier CMC agency-question file (reg_questions): read-only history.
 *
 * ── What it was ──────────────────────────────────────────────────────────────
 * CMC / Module 3's own file of agency questions. A question was logged here,
 * assigned, sent for review, linked to an authoring draft and CLOSED, each by
 * a status update with no signature, no reason and no ledger row; the Module 3
 * board counted "information requests overdue" from it by its own rule.
 *
 * ── Why it is read-only (2026-10-19, rows D2 and D5) ─────────────────────────
 * Agency questions have one home: the letter they came in (decision P-38),
 * recorded in agency_communication_questions and worked in Communication and
 * Project home's Respond, where a response is approved by a Part 11 signature.
 * P-39 item 1 converges this file onto that record. Its writes are retired:
 * POST and PATCH answer 410 and issue no query, and the database refuses
 * writes for every role (migrations/20261019b_reg_questions_read_only.sql; the
 * runtime role holds SELECT only, APPEND_ONLY_TABLES). CMC reads the letters'
 * questions through GET /api/concept2cure/projects/:projectId/agency-questions
 * and opens each on its letter. Moving a row that is not closed onto a letter
 * is a governed act still owed (evidence README); until then a person records
 * the question on its letter by hand, and the row here keeps its status.
 *
 * ── What the read serves ─────────────────────────────────────────────────────
 *   GET /  — every row of the organisation (not only Module 3: the old POST
 *            refused other sections, so those rows predate it and still
 *            count), as stored: the status verbatim, the dates as the text the
 *            columns hold (`timestamp` and `date`, no time zone, so no
 *            conversion), and no closure date, because the row holds none. The
 *            counts come from the store, not the page; "not closed" is any
 *            status but CLOSED, compared without case, NULL included. The
 *            page is the first 200 rows, not closed first; the counts are of
 *            every row.
 *
 * Mounted at /api/cmc/agency-questions behind authenticateToken and the CMC
 * write-role gate (server/bootstrap/register-core-routes.ts).
 *
 * @module server/routes/cmc-agency-questions.routes
 */
import { Router, type Request, type Response } from 'express';

import { query as q } from '../db.js';
import { resolveOrgId } from '../types/auth-request.js';
import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('cmc-agency-questions');

const READ_ONLY = {
  code: 'CMC_QUESTION_FILE_READ_ONLY',
  message:
    'The CMC question file is read-only since 2026-10-19. Record agency questions on the letter they came in, ' +
    'in Communication, where each response is approved by signature. Nothing was written.',
} as const;

interface EarlierRow {
  id: number;
  question_text: string;
  section_reference: string | null;
  priority: string | null;
  severity: string | null;
  status: string | null;
  region: string | null;
  due_date: string | null;
  assigned_to: string | null;
  response_doc_id: string | null;
  recorded_on: string | null;
  last_changed_on: string | null;
}

/** What the row holds, named for the screen. Nothing is derived. */
function mapRow(r: EarlierRow) {
  return {
    id: r.id,
    question: r.question_text,
    sectionRef: r.section_reference,
    priority: r.priority,
    severity: r.severity,
    status: r.status,
    region: r.region,
    dueDate: r.due_date,
    assignedTo: r.assigned_to,
    responseDocId: r.response_doc_id ?? null,
    recordedOn: r.recorded_on,
    lastChangedOn: r.last_changed_on,
  };
}

function readOnly(_req: Request, res: Response) {
  return res.status(410).json({ success: false, error: { code: READ_ONLY.code, message: READ_ONLY.message } });
}

export default function createCmcAgencyQuestionRoutes(): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response) => {
    const tenantId = resolveOrgId(req);
    if (tenantId == null) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }
    try {
      const [page, counts] = await Promise.all([
        q(
          `select id, question_text, section_reference, priority, severity, status, region,
                  to_char(due_date, 'YYYY-MM-DD') as due_date, assigned_to, response_doc_id,
                  to_char(created_at, 'YYYY-MM-DD') as recorded_on,
                  to_char(updated_at, 'YYYY-MM-DD') as last_changed_on
             from reg_questions
            where organization_id = $1
            order by (upper(status) is distinct from 'CLOSED') desc, updated_at desc, id desc
            limit 200`,
          [tenantId],
        ),
        q(
          `select count(*)::int as total,
                  count(*) filter (where upper(status) is distinct from 'CLOSED')::int as not_closed
             from reg_questions
            where organization_id = $1`,
          [tenantId],
        ),
      ]);
      const rows = (page.rows as EarlierRow[]).map(mapRow);
      const c = (counts.rows[0] ?? {}) as { total?: number; not_closed?: number };
      const total = Number(c.total ?? rows.length);
      return res.json({
        success: true,
        data: rows,
        meta: { total, notClosed: Number(c.not_closed ?? 0), listed: rows.length, truncated: total > rows.length, provisioned: true },
      });
    } catch (err) {
      if ((err as { code?: string } | null)?.code === '42P01') {
        // The file was never created on this database: there is no history to show.
        return res.json({ success: true, data: [], meta: { total: 0, notClosed: 0, listed: 0, truncated: false, provisioned: false } });
      }
      logger.error('earlier agency-question file read failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return res.status(500).json({ success: false, error: 'The earlier CMC question file could not be read.' });
    }
  });

  // Retired 2026-10-19 (P-39 item 1). No query is issued.
  router.post('/', readOnly);
  router.patch('/:id', readOnly);

  return router;
}
