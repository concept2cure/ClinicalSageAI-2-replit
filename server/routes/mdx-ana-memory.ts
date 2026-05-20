/**
 * AnA memory + conversation history surfaces. Read-mostly endpoints over
 * the existing client_memory_entries / project_memory_entries / chat_threads
 * / chat_messages tables; backs Surface 20 (AnA memory) and Surface 25 (AnA
 * conversation history) in the gap inventory.
 *
 *   GET    /api/mdx/ana/memory                    list curated memory atoms
 *   POST   /api/mdx/ana/memory/:id/verify         user verification (+ importance boost)
 *   POST   /api/mdx/ana/memory/:id/supersede      mark superseded by a new atom
 *
 *   GET    /api/mdx/ana/threads                   conversation threads list
 *   GET    /api/mdx/ana/threads/:threadId         single thread + messages
 *   POST   /api/mdx/ana/threads/:threadId/pin     pin/unpin a thread
 *
 * Tenant-scoped. Returns canonical envelope. The tables backing this
 * (client_memory_entries, project_memory_entries, chat_threads,
 * chat_messages) are existing — no migration needed.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';

import { createScopedLogger } from '../utils/logger';
import {
  ok, clientError, orgRequired, notFoundInTenant, serverError,
} from '../lib/api-response';
import { pool } from '../db';

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

/* ─── AnA memory atoms ──────────────────────────────────────── */

const memoryListQuery = z.object({
  category:    z.enum(['persona', 'regulatory', 'pipeline', 'competitive', 'operational', 'preference', 'history']).optional(),
  importance:  z.enum(['low', 'medium', 'high', 'critical']).optional(),
  status:      z.enum(['active', 'superseded', 'archived', 'rejected']).optional(),
  verified:    z.enum(['true', 'false']).optional(),
  limit:       z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(500)).optional(),
});

router.get('/ana/memory', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = memoryListQuery.safeParse(req.query);
  if (!parsed.success) return clientError(res, 422, 'Invalid query', parsed.error.flatten().fieldErrors);
  const { category, importance, status, verified, limit = 200 } = parsed.data;

  const filters: string[] = [`organization_id = $1`];
  const args: unknown[] = [orgId];
  if (category)   { args.push(category);   filters.push(`category = $${args.length}`); }
  if (importance) { args.push(importance); filters.push(`importance_level = $${args.length}`); }
  if (status)     { args.push(status);     filters.push(`status = $${args.length}`); }
  if (verified === 'true')  filters.push(`is_verified_by_user = true`);
  if (verified === 'false') filters.push(`is_verified_by_user = false`);
  args.push(limit);

  try {
    const { rows } = await pool.query(
      `SELECT id, profile_id, category, subcategory, title, content,
              source_document_name, confidence_score, importance_level,
              is_verified_by_user, verified_at, verified_by, status,
              superseded_by_id, extracted_at, extracted_by, created_at, updated_at
         FROM client_memory_entries
        WHERE ${filters.join(' AND ')}
        ORDER BY
          CASE importance_level WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
          updated_at DESC
        LIMIT $${args.length}`,
      args,
    );
    return ok(res, rows, { count: rows.length });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === '42P01') {
      /* client_memory_entries not provisioned yet — return empty rather
         than 500 so the surface still renders. */
      return ok(res, [], { count: 0 });
    }
    return serverError(res, log, 'list-memory', err);
  }
});

router.post('/ana/memory/:id/verify', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  const userId = getUserId(req);
  if (orgId === null) return orgRequired(res);
  if (userId === null) return clientError(res, 401, 'User context required');
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  /* Optional importance bump when the user explicitly verifies. */
  const bumpToHigh = req.body?.bumpImportance === true;

  try {
    const { rows } = await pool.query(
      `UPDATE client_memory_entries
          SET is_verified_by_user = true,
              verified_at = NOW(),
              verified_by = $3,
              importance_level = CASE WHEN $4 = true AND importance_level IN ('low','medium')
                                      THEN 'high'
                                      ELSE importance_level END,
              updated_at = NOW()
        WHERE id = $1 AND organization_id = $2
        RETURNING id, is_verified_by_user, importance_level`,
      [id, orgId, userId, bumpToHigh],
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Memory atom');
    return ok(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'verify-memory', err);
  }
});

router.post('/ana/memory/:id/supersede', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  const supersededBy = req.body?.supersededById;
  if (typeof supersededBy !== 'number' || !Number.isFinite(supersededBy)) {
    return clientError(res, 422, 'supersededById (number) is required');
  }
  try {
    const { rows } = await pool.query(
      `UPDATE client_memory_entries
          SET status = 'superseded',
              superseded_by_id = $3,
              updated_at = NOW()
        WHERE id = $1 AND organization_id = $2 AND status = 'active'
        RETURNING id, status, superseded_by_id`,
      [id, orgId, supersededBy],
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Memory atom (or not active)');
    return ok(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'supersede-memory', err);
  }
});

/* ─── Conversation threads + messages ───────────────────────── */

const threadListQuery = z.object({
  program_id: z.string().optional(),
  pinned:     z.enum(['true', 'false']).optional(),
  limit:      z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(500)).optional(),
});

router.get('/ana/threads', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = threadListQuery.safeParse(req.query);
  if (!parsed.success) return clientError(res, 422, 'Invalid query', parsed.error.flatten().fieldErrors);
  const { program_id: pid, pinned, limit = 100 } = parsed.data;

  const filters: string[] = [`organization_id = $1`];
  const args: unknown[] = [orgId];
  if (pid)    { args.push(pid);     filters.push(`metadata->>'programId' = $${args.length}`); }
  if (pinned === 'true')  filters.push(`(metadata->>'pinned')::boolean = true`);
  if (pinned === 'false') filters.push(`COALESCE((metadata->>'pinned')::boolean, false) = false`);
  args.push(limit);

  try {
    const { rows } = await pool.query(
      `SELECT id, user_id, organization_id, title, metadata, created_at, updated_at
         FROM chat_threads
        WHERE ${filters.join(' AND ')}
        ORDER BY (metadata->>'pinned')::boolean DESC NULLS LAST, updated_at DESC
        LIMIT $${args.length}`,
      args,
    );
    return ok(res, rows, { count: rows.length });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === '42P01' || code === '42703') {
      /* chat_threads not provisioned, or the metadata projections aren't
         present yet. Return empty so the surface still renders. */
      return ok(res, [], { count: 0 });
    }
    return serverError(res, log, 'list-threads', err);
  }
});

router.get('/ana/threads/:threadId', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const threadId = String(req.params.threadId);
  try {
    const { rows } = await pool.query(
      `SELECT * FROM chat_threads WHERE id = $1 AND organization_id = $2`,
      [threadId, orgId],
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Thread');
    const msgs = await pool.query(
      `SELECT id, role, content, metadata, created_at
         FROM chat_messages
        WHERE thread_id = $1
        ORDER BY created_at ASC
        LIMIT 1000`,
      [threadId],
    );
    return ok(res, { ...rows[0], messages: msgs.rows });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === '42P01') return notFoundInTenant(res, 'Thread');
    return serverError(res, log, 'get-thread', err);
  }
});

router.post('/ana/threads/:threadId/pin', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const threadId = String(req.params.threadId);
  const pinned = req.body?.pinned !== false; // default true unless explicitly false
  try {
    const { rows } = await pool.query(
      `UPDATE chat_threads
          SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{pinned}', to_jsonb($3::boolean)),
              updated_at = NOW()
        WHERE id = $1 AND organization_id = $2
        RETURNING id, metadata`,
      [threadId, orgId, pinned],
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Thread');
    return ok(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'pin-thread', err);
  }
});

export default router;
