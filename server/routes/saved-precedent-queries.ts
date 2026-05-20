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
 * Every response uses the canonical { data, meta? } / { error, details? }
 * envelopes via server/lib/api-response.ts. Mutations are validated
 * against Zod schemas on the way in; the global audit middleware writes
 * audit_logs entries on every successful 2xx response.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { and, desc, eq } from 'drizzle-orm';
import { savedPrecedentQueries } from '../../shared/schema';
import { createScopedLogger } from '../utils/logger';
import { resolveOrgId, resolveUserId } from '../types/auth-request';
import {
  ok,
  created,
  noContent,
  clientError,
  serverError,
  orgRequired,
  notFoundInTenant,
} from '../lib/api-response';

const router = Router();
const log = createScopedLogger('saved-precedent-queries');

/* ─── Zod schemas — validate every mutating body ──────────────────────
   The kit panel posts plain { label, query, scope } objects. Catch shape
   mismatches at the boundary so handlers downstream can trust the data.
   The pathway enum mirrors the closed-enum the kit's PrecedentSurface
   exposes; deviceClass + productCode are free strings (FDA classification
   strings vary by product type). */

const scopeSchema = z
  .object({
    deviceClass: z.string().max(32).optional(),
    productCode: z.string().max(16).optional(),
    pathway:     z.enum(['510k', 'pma', 'cer', 'de_novo']).optional(),
    dateFrom:    z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
    dateTo:      z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
    sources:     z.array(z.string().max(64)).max(8).optional(),
  })
  .strict()
  .nullable()
  .optional();

const createSchema = z
  .object({
    label: z.string().trim().min(1).max(120),
    query: z.string().trim().min(1).max(2_000),
    scope: scopeSchema,
  })
  .strict();

const patchSchema = z
  .object({
    label:   z.string().trim().min(1).max(120).optional(),
    query:   z.string().trim().min(1).max(2_000).optional(),
    scope:   scopeSchema,
    hits:    z.number().int().min(-1).max(100_000).optional(),
    refresh: z.boolean().optional(),
  })
  .strict();

const idParamSchema = z.coerce.number().int().positive();

router.get('/', async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrgId(req);
    if (orgId === null) return orgRequired(res);

    const rows = await db
      .select()
      .from(savedPrecedentQueries)
      .where(eq(savedPrecedentQueries.organizationId, orgId))
      .orderBy(desc(savedPrecedentQueries.updatedAt));

    return ok(
      res,
      rows.map((r) => ({
        id:        r.id,
        label:     r.label,
        query:     r.query,
        scope:     r.scope,
        hits:      r.hits,
        lastRunAt: r.lastRunAt ? r.lastRunAt.toISOString() : null,
        userId:    r.userId,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    );
  } catch (e) {
    return serverError(res, log, 'list', e);
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrgId(req);
    if (orgId === null) return orgRequired(res);
    const userId = resolveUserId(req);

    const parsed = createSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return clientError(res, 422, 'Validation failed', parsed.error.flatten().fieldErrors);
    }
    const { label, query, scope } = parsed.data;

    const [row] = await db
      .insert(savedPrecedentQueries)
      .values({
        organizationId: orgId,
        userId,
        label,
        query,
        scope: scope ?? null,
        hits: -1,
      })
      .returning();

    log.info('saved precedent query created', { orgId, userId, savedQueryId: row.id, label });
    return created(res, row);
  } catch (e) {
    return serverError(res, log, 'create', e);
  }
});

router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrgId(req);
    if (orgId === null) return orgRequired(res);

    const idParsed = idParamSchema.safeParse(req.params.id);
    if (!idParsed.success) return clientError(res, 422, 'id must be a positive integer');
    const id = idParsed.data;

    const parsed = patchSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return clientError(res, 422, 'Validation failed', parsed.error.flatten().fieldErrors);
    }
    const body = parsed.data;
    const updates: Partial<typeof savedPrecedentQueries.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (body.label !== undefined) updates.label = body.label;
    if (body.query !== undefined) updates.query = body.query;
    if (body.scope !== undefined) updates.scope = body.scope ?? null;
    if (body.hits  !== undefined) updates.hits  = body.hits;
    if (body.refresh === true)    updates.lastRunAt = new Date();

    const [row] = await db
      .update(savedPrecedentQueries)
      .set(updates)
      .where(and(eq(savedPrecedentQueries.id, id), eq(savedPrecedentQueries.organizationId, orgId)))
      .returning();
    if (!row) return notFoundInTenant(res, 'Saved query');

    log.info('saved precedent query updated', { orgId, savedQueryId: id, fields: Object.keys(body) });
    return ok(res, row);
  } catch (e) {
    return serverError(res, log, 'update', e);
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrgId(req);
    if (orgId === null) return orgRequired(res);

    const idParsed = idParamSchema.safeParse(req.params.id);
    if (!idParsed.success) return clientError(res, 422, 'id must be a positive integer');
    const id = idParsed.data;

    const [row] = await db
      .delete(savedPrecedentQueries)
      .where(and(eq(savedPrecedentQueries.id, id), eq(savedPrecedentQueries.organizationId, orgId)))
      .returning({ id: savedPrecedentQueries.id });
    if (!row) return notFoundInTenant(res, 'Saved query');

    log.info('saved precedent query removed', { orgId, savedQueryId: id });
    return noContent(res);
  } catch (e) {
    return serverError(res, log, 'delete', e);
  }
});

export default router;
