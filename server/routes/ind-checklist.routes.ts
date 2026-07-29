/**
 * IND lifecycle checklist — per-org IND instance read.
 *
 * GET /api/ind-checklist → the org's IND checklist rows (21 CFR 312), each
 * shaped to exactly the keys the v2 IndLifecycle surface consumes
 * ({ code, drugName, productName, indication, sponsorName, submissionType,
 * targetReceiptOffsetDays, forms[], sections[] }). The `id` column rehydrates as
 * `code`; the two nested checklist arrays (forms, sections) rehydrate straight
 * from JSONB into IndlForm[] / IndlSection[]. Org scoped; 403 without org
 * context; fails closed to an empty list on 42P01 so an unprovisioned store
 * never 500s.
 */
import { Router, type Request, type Response } from 'express';
import { pool } from '../db';

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
    const { rows } = await pool.query(
      `SELECT id, drug_name, product_name, indication, sponsor_name,
              submission_type, target_receipt_offset_days, forms, sections
         FROM c2c_ind_checklist
        WHERE organization_id = $1
        ORDER BY seq, id`,
      [orgId],
    );
    const data = rows.map((r) => ({
      code: r.id,
      drugName: r.drug_name,
      productName: r.product_name,
      indication: r.indication,
      sponsorName: r.sponsor_name,
      submissionType: r.submission_type,
      targetReceiptOffsetDays: r.target_receipt_offset_days,
      forms: r.forms ?? [],
      sections: r.sections ?? [],
    }));
    return res.json({ data, meta: { count: data.length } });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return res.json({ data: [], meta: { count: 0, pendingStore: true } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to read IND checklist.' } });
  }
});

export default router;
