/**
 * Protocol-development authoring hub — protocol document read for the v2 surface.
 *
 * GET /api/protocol-dev → the org's in-development protocol(s), each shaped to the
 * PdevDoc contract the v2 ProtocolDev surface renders, assembled ENTIRELY from the
 * real normalized store (protocol_documents + every protocol_* child table) — the
 * same tables the /api/protocol-development CRUD routes and the AnA protocol tools
 * write. There is no legacy/seed fallback: an org with no protocols returns an empty
 * list and the surface renders its own honest empty state. See pdev-view-assembler.
 *
 * Org scoped; 403 without org context; fails to an empty list on 42P01 so an
 * unprovisioned store never 500s.
 */
import { Router, type Request, type Response } from 'express';
import { assembleOrgPdevDocs } from '../services/protocol-development/pdev-view-assembler.js';

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

router.get('/', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res.status(403).json({ error: { code: 'ORG_REQUIRED', message: 'Organization context required.' } });
  }
  try {
    const data = await assembleOrgPdevDocs(orgId);
    return res.json({ data, meta: { count: data.length, source: 'protocol_documents' } });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return res.json({ data: [], meta: { count: 0, pendingStore: true } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to read protocol.' } });
  }
});

export default router;
