/**
 * AnA RI thread read endpoints.
 *
 * GET /api/ana-ri/threads/:threadId/timeline — the per-turn trace timeline:
 * which tools AnA ran each assistant turn and how her self-verification
 * grounding came out, projected from the hidden message metadata the stream
 * loop persists. Tenant-scoped; read-only.
 *
 * Mounted via {@link mountThreadRoutes}.
 *
 * @module server/routes/ana-ri/threads
 */

import type { Request, Response, Router } from 'express';

import { getPool } from '../../db.js';
import { buildTraceTimeline, type TimelineRow } from '../../services/ana/trace-timeline.js';
import { extractRequestContext, sendSuccess, sendError } from './shared.js';
import { requestPgClient } from '../../db/requestDb';
import { readOwnerPrivateBoundary } from '../../services/ana/run-control';
import { readOwnerPrivateThreadMessages } from '../../services/chat-thread-helpers';

/** Register thread read endpoints on the given router. */
export function mountThreadRoutes(router: Router): void {
  // ───────────────────────────────────────────────────────────────────────────
  // GET /api/ana-ri/threads/:threadId/timeline — tool-trace + grounding timeline
  // ───────────────────────────────────────────────────────────────────────────
  router.get('/threads/:threadId/timeline', async (req: Request, res: Response) => {
    const { orgId,userId } = extractRequestContext(req);
    if (orgId == null) {
      return sendError(res, 401, 'Organization context required', null, 'ORG_REQUIRED');
    }
    const threadId = String(req.params.threadId);

    try {
      const boundary=await readOwnerPrivateBoundary(requestPgClient(req),{organizationId:Number(orgId),threadId});
      if (boundary) {
        res.locals.ownerPrivateCapture=true;
        if (userId!==boundary.ownerUserId) return sendError(res,403,'This private conversation belongs to its owner.',null,'OWNER_PRIVATE_THREAD_DENIED');
        const messages=await readOwnerPrivateThreadMessages(requestPgClient(req),{threadId,organizationId:Number(orgId),userId});
        const timeline=buildTraceTimeline(messages as TimelineRow[]);
        return sendSuccess(res,{threadId,timeline},{count:timeline.length});
      }
      const pool = getPool();
      // Tenant scope: the thread must belong to the caller's organization.
      const owner = await pool.query(
        'SELECT 1 FROM chat_threads WHERE id = $1 AND organization_id = $2',
        [threadId, orgId]
      );
      if (owner.rowCount === 0) {
        return sendError(res, 404, 'Thread not found', null, 'THREAD_NOT_FOUND');
      }

      const { rows } = await pool.query(
        `SELECT id, role, metadata, created_at
           FROM chat_messages
          WHERE thread_id = $1
          ORDER BY created_at ASC
          LIMIT 1000`,
        [threadId]
      );

      const timeline = buildTraceTimeline(rows as TimelineRow[]);
      return sendSuccess(res, { threadId, timeline }, { count: timeline.length });
    } catch {
      return sendError(res,503,'The conversation timeline could not be securely read.',null,'THREAD_TIMELINE_UNAVAILABLE');
    }
  });
}
