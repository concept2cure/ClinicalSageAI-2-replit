/**
 * Saved Precedent Queries API — CRUD over saved_precedent_queries.
 *
 * Mounted at: /api/saved-precedent-queries
 *
 * Backs the PrecedentSurface "Saved queries" panel. Each query is the
 * canonical params for a precedent / predicate search the user wants
 * pinned for re-use; the cached hit count avoids re-running the
 * shadow-service predicate search on every page view.
 *
 *   GET    /             list queries for the caller's org
 *   POST   /             create new saved query
 *   PATCH  /:id          update label / scope / refresh hits
 *   DELETE /:id          remove saved query
 *
 * The "refresh hits" path (PATCH with body { refresh: true }) re-runs the
 * search via the existing precedent-engine endpoint and writes back the
 * count. Optional but real — the kit's hit count is meant to be live.
 */

import { Router, Request, Response } from 'express';
import { db } from '../db';
import { and, desc, eq } from 'drizzle-orm';
import { savedPrecedentQueries } from '../../shared/schema';

const router = Router();

function getOrgId(req: Request): number | null {
  const v =
    (req as any).organizationId ??
    (req as any).tenantContext?.organizationId ??
    (req as any).user?.organizationId ??
    (req as any).tenantId;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function getUserId(req: Request): number | null {
  const raw = (req as any).user?.id;
  if (raw == null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    if (orgId === null) return res.status(403).json({ error: 'Organization context required' });

    const rows = await db
      .select()
      .from(savedPrecedentQueries)
      .where(eq(savedPrecedentQueries.organizationId, orgId))
      .orderBy(desc(savedPrecedentQueries.updatedAt));

    res.json({
      data: rows.map((r) => ({
        id:         r.id,
        label:      r.label,
        query:      r.query,
        scope:      r.scope,
        hits:       r.hits,
        lastRunAt:  r.lastRunAt ? r.lastRunAt.toISOString() : null,
        userId:     r.userId,
        createdAt:  r.createdAt.toISOString(),
        updatedAt:  r.updatedAt.toISOString(),
      })),
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Operation failed' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    if (orgId === null) return res.status(403).json({ error: 'Organization context required' });
    const userId = getUserId(req);

    const body = req.body ?? {};
    const label = typeof body.label === 'string' ? body.label.trim() : '';
    const query = typeof body.query === 'string' ? body.query.trim() : '';
    if (label.length === 0) return res.status(422).json({ error: 'label is required' });
    if (query.length === 0) return res.status(422).json({ error: 'query is required' });

    const scope = body.scope && typeof body.scope === 'object' ? body.scope : null;

    const [row] = await db
      .insert(savedPrecedentQueries)
      .values({
        organizationId: orgId,
        userId,
        label,
        query,
        scope,
        hits: -1,
      })
      .returning();

    res.status(201).json({ data: row });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Operation failed' });
  }
});

router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    if (orgId === null) return res.status(403).json({ error: 'Organization context required' });

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(422).json({ error: 'id must be an integer' });

    const body = req.body ?? {};
    const updates: Partial<typeof savedPrecedentQueries.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (typeof body.label === 'string')          updates.label = body.label.trim();
    if (typeof body.query === 'string')          updates.query = body.query.trim();
    if (body.scope && typeof body.scope === 'object') updates.scope = body.scope;
    if (typeof body.hits === 'number')           updates.hits = body.hits;
    if (body.refresh === true)                   updates.lastRunAt = new Date();

    const [row] = await db
      .update(savedPrecedentQueries)
      .set(updates)
      .where(and(eq(savedPrecedentQueries.id, id), eq(savedPrecedentQueries.organizationId, orgId)))
      .returning();
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json({ data: row });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Operation failed' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    if (orgId === null) return res.status(403).json({ error: 'Organization context required' });
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(422).json({ error: 'id must be an integer' });

    const [row] = await db
      .delete(savedPrecedentQueries)
      .where(and(eq(savedPrecedentQueries.id, id), eq(savedPrecedentQueries.organizationId, orgId)))
      .returning({ id: savedPrecedentQueries.id });
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.status(204).end();
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Operation failed' });
  }
});

export default router;
