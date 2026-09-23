/**
 * Review & Approval Board API route
 *
 * ONE read-only route, GET /api/review/board, that powers the Concept2Cure v2
 * "review" surface (client/src/concept2cure/v2/surfaces/Review.tsx). It is the
 * cross-document read model the authoring router lacks: the queue of documents
 * with open review work in the caller's organisation (optionally one program),
 * each with its review requests and verdicts, its approval chain, and the
 * comment thread of the selected document.
 *
 * ── The one store (VSR-001 F-6, decided 2026-09-21) ──────────────────────────
 * This board reads the AUTHORING review store, the store the Authoring launch
 * app writes through:
 *   authoring_reviews         review requests + verdicts   (POST /api/authoring/documents/:id/request-review,
 *                                                           POST /api/authoring/documents/:id/review)
 *   authoring_workflow_steps  the approval chain            (POST /api/authoring/docs/:id/submit,
 *                                                           advanced by POST /api/authoring/docs/:id/sign)
 *   authoring_comments        the thread                    (POST /api/authoring/sections/:id/comment,
 *                                                           PATCH /api/authoring/comments/:id)
 *   authoring_documents / authoring_sections / regulatory_programs — labels and the passage.
 *
 * It used to read `document_workflows` / `workflow_approvals` (the unified
 * workflow store) and carried five write routes of its own — change-request,
 * decision, delegate, comments, resolve — that wrote there. A review requested
 * in Authoring was invisible here, and a decision recorded here was invisible
 * in Authoring: two review stores, two state machines. The writes are GONE
 * from this module. Every decision the board records is one of the authoring
 * router's own transitions, called directly by the surface:
 *   approve / request changes / decline → POST /api/authoring/documents/:id/review
 *   comment                             → POST /api/authoring/sections/:sectionId/comment
 *   resolve                             → PATCH /api/authoring/comments/:commentId
 *   delegate                            → no such transition in the authoring workflow;
 *                                         a reviewer is added with POST /documents/:id/request-review
 * The board does NOT apply a 21 CFR §11.50 signature — signing stays on the
 * authoring e-sign / sign routes, PIN-verified and sealed against a frozen
 * version. The surface's header says so.
 *
 * The unified-workflow tables and their other consumers (ApprovalOrchestrator,
 * WorkflowService, DecisionLineageService, the GA demo seed) are untouched —
 * see docs/evidence/WK/2026-09-21/README.md for the consumer list.
 *
 * @module server/routes/review-board-routes
 */

import { Router, Request, Response } from 'express';

import { requestPgClient, MissingRequestDbContextError } from '../db/requestDb';
import { buildAuthoringReviewBoard, type ReviewScope } from '../services/review/authoring-review-board';
import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('review-board-routes');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Router Factory ─────────────────────────────────────────────────────────────

export default function createReviewBoardRoutes(): Router {
  const router = Router();

  function getOrgId(req: Request): number {
    const raw =
      (req as any).user?.organizationId ??
      (req as any).tenantContext?.organizationId ??
      (req as any).organizationId ??
      (req as any).tenantId;
    const n = Number(raw);
    if (raw == null || !Number.isFinite(n)) {
      throw new Error('REVIEW_NO_TENANT: Organization context required');
    }
    return n;
  }

  function getUserId(req: Request): string {
    return String((req as any).user?.userId ?? (req as any).user?.id ?? '');
  }

  function getUserEmail(req: Request): string | null {
    const e = (req as any).user?.email;
    return typeof e === 'string' && e ? e : null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /api/review/board
  //   scope=all|mine|requested  all: the organisation's open review work (default)
  //                             mine: awaiting my review, or at my sign-off step
  //                             requested: reviews I asked for
  //   programId=<uuid>          only documents bound to this regulatory program
  //   limit=1..100              queue cap (default 25)
  //   itemId=<document uuid>    whose comment thread to include (default: first)
  // ═══════════════════════════════════════════════════════════════════════════

  router.get('/board', async (req: Request, res: Response) => {
    let orgId: number;
    try {
      orgId = getOrgId(req);
    } catch {
      return res.status(403).json({ success: false, error: 'Organization context required' });
    }
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authenticated user required' });
    }

    // Honest query-param shaping (this is a read; no zod write-body validation).
    const scopeRaw = String(req.query.scope ?? 'all');
    const scope: ReviewScope = scopeRaw === 'mine' ? 'mine' : scopeRaw === 'requested' ? 'requested' : 'all';

    let programId: string | null = null;
    if (req.query.programId != null && String(req.query.programId) !== '') {
      const p = String(req.query.programId);
      if (!UUID_RE.test(p)) {
        return res.status(400).json({ success: false, error: 'programId must be a regulatory program id (UUID)' });
      }
      programId = p;
    }

    let limit = 25;
    if (req.query.limit != null) {
      const n = Number(req.query.limit);
      if (!Number.isInteger(n) || n < 1 || n > 100) {
        return res.status(400).json({ success: false, error: 'limit must be an integer between 1 and 100' });
      }
      limit = n;
    }
    const itemId = req.query.itemId != null && String(req.query.itemId) !== '' ? String(req.query.itemId) : null;

    try {
      // Request-scoped, RLS-enforcing client. The authoring tables have no
      // Drizzle definition (they exist only as SQL migrations), so the read
      // model runs raw SQL on the SAME request-pinned connection requestDb(req)
      // would use — never the shared pool, which carries no tenant session vars.
      const sql = requestPgClient(req);
      const board = await buildAuthoringReviewBoard({
        sql,
        orgId,
        userId,
        userEmail: getUserEmail(req),
        scope,
        programId,
        limit,
        itemId,
      });
      return res.json({ success: true, data: board });
    } catch (error: any) {
      if (error instanceof MissingRequestDbContextError) {
        return res.status(500).json({ success: false, error: 'REQUEST_DB_CONTEXT_REQUIRED' });
      }
      if (error?.code === '42P01' || error?.code === '42703') {
        logger.warn('authoring review tables not available; returning 503', { code: error.code });
        return res.status(503).json({ success: false, error: 'REVIEW_TABLES_MISSING' });
      }
      logger.error('review board error', { err: error instanceof Error ? error.message : String(error) });
      return res.status(500).json({ success: false, error: 'Failed to build review board' });
    }
  });

  return router;
}
