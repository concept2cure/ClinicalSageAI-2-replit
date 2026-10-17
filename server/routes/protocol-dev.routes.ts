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
import { assembleOrgPdevDocs, listPdevProtocolIndex, type ProtocolReadScope } from '../services/protocol-development/pdev-view-assembler.js';
import { requestPgClient } from '../db/requestDb';
import { withProtocolReadSnapshot } from '../services/protocol-development/protocol-signature-manifestation';

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

function validSelection(query: Request['query']): boolean {
  const { programId, documentId, view } = query;
  if ((programId !== undefined && (typeof programId !== 'string' || (programId !== 'unfiled' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(programId)))) ||
      (documentId !== undefined && (typeof documentId !== 'string' || !/^[1-9]\d*$/.test(documentId) || !Number.isSafeInteger(Number(documentId)))) ||
      (view !== undefined && view !== 'index')) {
    return false;
  }
  return true;
}

router.get('/', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res.status(403).json({ error: { code: 'ORG_REQUIRED', message: 'Organization context required.' } });
  }
  if (!validSelection(req.query)) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid protocol selection.' } });
  }
  const { programId, documentId, view } = req.query;
  const scope: ProtocolReadScope = {
    ...(programId ? { programId: programId as string } : {}),
    ...(documentId ? { documentId: Number(documentId) } : {}),
  };
  try {
    const executor = requestPgClient(req);
    const data = view === 'index' ? await listPdevProtocolIndex(orgId, scope, executor)
      : await withProtocolReadSnapshot(orgId, executor, client => assembleOrgPdevDocs(orgId, scope, client), { startOnIdleExecutor: true });
    return res.json({ data, meta: { count: data.length, source: 'protocol_documents' } });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return res.json({ data: [], meta: { count: 0, pendingStore: true } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to read protocol.' } });
  }
});

export default router;
