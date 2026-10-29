/**
 * The caller's own relational profile: the notes AnA keeps about working with
 * them, read beside the conversation ("What AnA remembers",
 * client/src/concept2cure/v2/WhatAnaRemembers.tsx).
 *
 *   GET    /api/mdx/ana/memory/profile            the caller's own relational profile
 *                                                 (?project_id= for their notes on that project)
 *
 * Tenant-scoped. Returns canonical envelope.
 *
 * D2, fold of `ana-memory` into the conversation, 2026-10-29
 * (docs/evidence/D2-ONE-ANA/2026-10-29/fold-ana-memory/). This router used to
 * back the `ana-memory` screen as well: the memory-atom list (GET /ana/memory),
 * verify and supersede (POST /ana/memory/:id/verify, /supersede), and a thread
 * list, read and pin (GET /ana/threads, GET /ana/threads/:threadId, POST
 * /ana/threads/:threadId/pin). The screen was their only caller, and the
 * placement map carries none of them (.design/client-journey/FUNCTION_PARITY.md,
 * "From `ana-memory`": not real today), so they were deleted with it. Threads
 * are /api/chat/threads; pinning belongs there if it is wanted.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';

import { createScopedLogger } from '../utils/logger';
import { ok, clientError, orgRequired, serverError } from '../lib/api-response';
import { pool } from '../db';
import { admitAnaProjectScope, AnaProjectScopeError, type AdmittedAnaProjectScope } from '../services/ana/project-scope-admission';

const router = Router();
const log = createScopedLogger('mdx-ana-memory');

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

/**
 * The caller's own relational profile: the notes AnA keeps about how to work
 * with this person, read into every turn by loadRelationalOverlay
 * (server/services/ana-ri/relational-profile-service.ts, which also writes
 * them). Read-only. The conversation's "What AnA remembers" panel reads it
 * (client/src/concept2cure/v2/WhatAnaRemembers.tsx).
 *
 *   no project_id     the user-level row (project_id IS NULL): `meta.scope 'user'`.
 *   ?project_id=<ref> the caller's row for that project, the one a turn held in
 *                     it reads: `meta.scope 'project'` with the admitted
 *                     `projectId` and `projectRef`. The ref is a program UUID
 *                     or an integer project id, as the stream's `project_id` is,
 *                     and is admitted by the stream's own admission
 *                     (admitAnaProjectScope) before anything is read. Its
 *                     refusal is answered with its own status and code.
 *
 * user_id is the session's and no parameter names a user, so another person's
 * notes are never read. Null data is "AnA has formed no notes yet"; an absent
 * store says so in `meta.pendingStore` rather than answering that same null
 * (D2, fold ana-memory into the conversation, 2026-10-29).
 */
const profileQuery = z.object({ project_id: z.string().trim().min(1).max(100).optional() });

router.get('/ana/memory/profile', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  const userId = getUserId(req);
  if (orgId === null) return orgRequired(res);
  if (userId === null) return clientError(res, 401, 'User context required');
  const parsed = profileQuery.safeParse(req.query);
  if (!parsed.success) return clientError(res, 422, 'Invalid query', parsed.error.flatten().fieldErrors);

  if (parsed.data.project_id === undefined) {
    try {
      /* organization_id lives in the SQL literal so the tenant-isolation CI gate
         can verify the scope statically. project_id IS NULL = the user-level
         profile (how AnA works with this person anywhere). */
      const { rows } = await pool.query(
        `SELECT interaction_count, last_interaction_at, profile_summary,
                tone_calibration, emotional_signals, acknowledged_mistakes
           FROM ana_relational_profiles
          WHERE organization_id = $1 AND user_id = $2 AND project_id IS NULL
          LIMIT 1`,
        [orgId, userId],
      );
      return ok(res, rows[0] ?? null, { scope: 'user' });
    } catch (err: unknown) {
      if ((err as { code?: string }).code === '42P01') return ok(res, null, { scope: 'user', pendingStore: true });
      return serverError(res, log, 'get-relational-profile', err);
    }
  }

  let admitted: AdmittedAnaProjectScope;
  try {
    admitted = await admitAnaProjectScope(pool, { organizationId: orgId, userId, projectRef: parsed.data.project_id });
  } catch (err: unknown) {
    if (err instanceof AnaProjectScopeError) return res.status(err.status).json({ error: err.message, code: err.code });
    return serverError(res, log, 'admit-relational-profile-project', err);
  }
  if (admitted.projectId === null) return clientError(res, 400, 'Choose a valid project identifier.');
  const scope = { scope: 'project', projectId: admitted.projectId, projectRef: admitted.projectRef };
  try {
    const { rows } = await pool.query(
      `SELECT interaction_count, last_interaction_at, profile_summary,
              tone_calibration, emotional_signals, acknowledged_mistakes
         FROM ana_relational_profiles
        WHERE organization_id = $1 AND user_id = $2 AND project_id = $3
        LIMIT 1`,
      [orgId, userId, admitted.projectId],
    );
    return ok(res, rows[0] ?? null, scope);
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '42P01') return ok(res, null, { ...scope, pendingStore: true });
    return serverError(res, log, 'get-project-relational-profile', err);
  }
});

export default router;
