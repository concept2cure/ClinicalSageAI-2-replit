/**
 * Non-US MAA Module-1 readiness — persisted assembled-components + live assessment.
 *
 * The v2 MaaCockpit shows the region-accurate required eCTD Module-1 components
 * for a market and which the sponsor has assembled. This route persists the
 * assembled set per org+market (`c2c_maa_module1_components`) and computes
 * readiness on read via the deterministic `assessRegionalModule1` engine — so
 * the cockpit reflects real assembled-vs-missing state, not a static checklist.
 *
 *   GET  /api/maa-module1/:market → { requirements, provided[], assessment }
 *   POST /api/maa-module1/:market → toggle a component assembled/not, returns the
 *                                   refreshed assessment.
 *
 * Org-scoped; 403 without org; 404 for an unmodeled market; fails closed to the
 * empty-provided assessment on a missing store (42P01, meta.pendingStore).
 */
import { Router, type Request, type Response } from 'express';
import { pool } from '../db';
import {
  assessRegionalModule1,
  getRegionalModule1Requirements,
  type RegulatoryMarket,
} from '../services/global-ri/regional-module1-requirements';

const router = Router();

function getOrgId(req: Request): number | null {
  const r = req as {
    tenantId?: unknown;
    organizationId?: unknown;
    tenantContext?: { organizationId?: unknown };
    user?: { organizationId?: unknown };
  };
  const raw = r.tenantId ?? r.organizationId ?? r.tenantContext?.organizationId ?? r.user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Validate + normalize the :market param against the modeled markets. */
function resolveMarket(raw: string): RegulatoryMarket | null {
  const market = String(raw || '').toUpperCase() as RegulatoryMarket;
  return getRegionalModule1Requirements(market).length > 0 ? market : null;
}

function buildPayload(market: RegulatoryMarket, provided: string[]) {
  const requirements = getRegionalModule1Requirements(market);
  const assessment = assessRegionalModule1({ market, providedComponents: provided });
  return {
    market,
    requirements,
    provided,
    assessment: {
      ready: assessment.ready,
      missing: assessment.missing,
      findings: assessment.findings,
      counts: assessment.counts,
    },
  };
}

router.get('/:market', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res.status(403).json({ error: { code: 'ORG_REQUIRED', message: 'Organization context required.' } });
  }
  const market = resolveMarket(req.params.market);
  if (!market) {
    return res.status(404).json({ error: { code: 'UNKNOWN_MARKET', message: `No Module 1 requirements modeled for market "${req.params.market}".` } });
  }
  try {
    const { rows } = await pool.query(
      `SELECT component_code FROM c2c_maa_module1_components
        WHERE organization_id = $1 AND market = $2 AND status = 'assembled'`,
      [orgId, market],
    );
    const provided = rows.map((r) => String(r.component_code));
    return res.json({ data: buildPayload(market, provided), meta: { count: provided.length } });
  } catch (err) {
    // Fail closed to the honest empty-provided assessment (all required missing).
    const pendingStore = (err as { code?: string })?.code === '42P01';
    return res.json({ data: buildPayload(market, []), meta: { count: 0, pendingStore } });
  }
});

router.post('/:market', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res.status(403).json({ error: { code: 'ORG_REQUIRED', message: 'Organization context required.' } });
  }
  const market = resolveMarket(req.params.market);
  if (!market) {
    return res.status(404).json({ error: { code: 'UNKNOWN_MARKET', message: `No Module 1 requirements modeled for market "${req.params.market}".` } });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const componentCode = typeof body.componentCode === 'string' ? body.componentCode.trim() : '';
  const assembled = body.assembled === true || body.assembled === 'true';
  // The component must be a real required component for this market.
  const known = getRegionalModule1Requirements(market).some((c) => c.code === componentCode);
  if (!componentCode || !known) {
    return res.status(400).json({ error: { code: 'INVALID_BODY', message: 'componentCode must be a required component for this market.' } });
  }

  try {
    if (assembled) {
      await pool.query(
        `INSERT INTO c2c_maa_module1_components (organization_id, market, component_code, status, updated_at)
         VALUES ($1, $2, $3, 'assembled', now())
         ON CONFLICT (organization_id, market, component_code)
         DO UPDATE SET status = 'assembled', updated_at = now()`,
        [orgId, market, componentCode],
      );
    } else {
      await pool.query(
        `DELETE FROM c2c_maa_module1_components
          WHERE organization_id = $1 AND market = $2 AND component_code = $3`,
        [orgId, market, componentCode],
      );
    }
    const { rows } = await pool.query(
      `SELECT component_code FROM c2c_maa_module1_components
        WHERE organization_id = $1 AND market = $2 AND status = 'assembled'`,
      [orgId, market],
    );
    const provided = rows.map((r) => String(r.component_code));
    return res.status(200).json({ data: buildPayload(market, provided), meta: { updated: true } });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return res.status(503).json({ error: { code: 'PENDING_STORE', message: 'MAA Module 1 store is not provisioned yet.' } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to update MAA Module 1 component.' } });
  }
});

export default router;
