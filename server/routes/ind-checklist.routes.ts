/**
 * IND lifecycle checklist — per-org IND instance read for the v2 surface.
 *
 * GET /api/ind-checklist → the org's IND application(s), each shaped to exactly the
 * keys the v2 IndLifecycle surface consumes ({ code, drugName, productName, indication,
 * sponsorName, submissionType, targetReceiptDate, forms[], sections[] }), assembled
 * ENTIRELY from the real, org-scoped eCTD submission core (submissions + ectd_sequences
 * + submission_leaves + coauthor_documents) — the same tables the submission service and
 * the eCTD co-authoring flow write. There is no legacy/seed blob and no fallback: an org
 * with no IND returns an empty list and the surface renders its own honest empty state.
 * See ind-checklist-view-assembler.
 *
 * Org scoped; 403 without org context; fails to an empty list on 42P01 so an
 * unprovisioned store never 500s.
 */
import { Router, type Request, type Response } from 'express';
import { assembleOrgIndChecklists } from '../services/ind-lifecycle/ind-checklist-view-assembler.js';

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
    const data = await assembleOrgIndChecklists(orgId);
    return res.json({ data, meta: { count: data.length, source: 'submissions' } });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return res.json({ data: [], meta: { count: 0, pendingStore: true } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to read IND checklist.' } });
  }
});

export default router;
