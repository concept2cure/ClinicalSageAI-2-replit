/**
 * Market access & reimbursement — GET + POST /api/market-access.
 *
 * The org's payer/HTA positions, held in the REAL, org-scoped store
 * `market_access_positions` (market-access-service.ts — a live write path, not the
 * seed-only c2c_market_access blob), returned as the flat position rows the v2
 * MarketAccess surface renders ({ id, program, market, payer, mechanism, code,
 * status, decisionDate, note }). The surface derives its coverage KPIs and its
 * coding-strategy view from these rows — nothing is stored pre-aggregated.
 *
 *   GET  /api/market-access  → list the org's payer/HTA positions. Honest empty list.
 *   POST /api/market-access  → track a position (the real write path). Audited.
 *
 * Org scoped; 403 without org context. GET fails CLOSED to an honest empty list
 * (never 500, never fabricated) on a missing store (42P01), so an unprovisioned store
 * degrades gracefully.
 *
 * @module server/routes/market-access.routes
 */
import { Router, type Request, type Response } from 'express';
import {
  createMarketAccessPosition, listMarketAccessPositions, MarketAccessValidationError,
  type MarketAccessPositionRow,
} from '../services/market-access/market-access-service';
import auditService from '../services/auditService';

const router = Router();

function getOrgId(req: Request): number | null {
  const r = req as {
    tenantId?: unknown;
    organizationId?: unknown;
    tenantContext?: { organizationId?: unknown };
    user?: { organizationId?: unknown };
  };
  const raw =
    r.tenantId ?? r.organizationId ?? r.tenantContext?.organizationId ?? r.user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}

function getUserId(req: Request): number | null {
  const r = req as { userId?: unknown; user?: { id?: unknown } };
  const raw = r.userId ?? r.user?.id;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Project a stored row to exactly the keys the surface renders. */
function toView(row: MarketAccessPositionRow) {
  return {
    id: row.id,
    program: row.program,
    market: row.market,
    payer: row.payer,
    mechanism: row.mechanism ?? null,
    code: row.code ?? null,
    status: row.status,
    decisionDate: row.decision_date ?? null,
    note: row.note ?? null,
  };
}

router.get('/', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res.status(403).json({ error: { code: 'ORG_REQUIRED', message: 'Organization context required.' } });
  }
  try {
    const rows = await listMarketAccessPositions(orgId);
    const data = rows.map(toView);
    return res.json({ data, meta: { count: data.length, source: 'market_access_positions' } });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return res.json({ data: [], meta: { count: 0, pendingStore: true } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to read market access.' } });
  }
});

router.post('/', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res.status(403).json({ error: { code: 'ORG_REQUIRED', message: 'Organization context required.' } });
  }
  const userId = getUserId(req);
  const b = (req.body ?? {}) as Record<string, unknown>;
  try {
    const position = await createMarketAccessPosition(orgId, {
      program: String(b.program ?? ''),
      market: String(b.market ?? ''),
      payer: String(b.payer ?? ''),
      mechanism: b.mechanism != null ? String(b.mechanism) : null,
      code: b.code != null ? String(b.code) : null,
      status: b.status != null ? String(b.status) : null,
      decisionDate: b.decisionDate != null ? String(b.decisionDate) : null,
      note: b.note != null ? String(b.note) : null,
      createdBy: userId,
    });
    await auditService.logAction({
      organizationId: orgId,
      userId: userId ?? undefined,
      action: 'MARKET_ACCESS_POSITION_CREATED',
      resourceType: 'market_access_position',
      resourceId: position.id,
      details: { program: position.program, market: position.market, payer: position.payer, status: position.status },
    });
    return res.status(201).json({ data: toView(position), id: position.id });
  } catch (err) {
    if (err instanceof MarketAccessValidationError) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: err.message } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to create market-access position.' } });
  }
});

export default router;
