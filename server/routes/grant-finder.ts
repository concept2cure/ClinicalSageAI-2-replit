/**
 * Intelligent Grant Finder API — Capability C2C-14 (finder upgrade)
 *
 * The org funding profile + intelligent, explainable opportunity discovery over
 * Grants.gov. PUT the profile, GET ranked matches (transparent fit scores with
 * per-factor reasons), and record the strong ones into the pre-award pipeline.
 * Mutations are governed + audited; discovery is read-only. Mounted at
 * /api/grant-finder.
 *
 * @module server/routes/grant-finder
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { pool } from '../db';
import { recordGovernedAction } from './c2c/actions';
import { upsertFundingProfileTx, getFundingProfile, discoverOpportunities, recordMatchTx } from '../services/grants/grant-finder-service';
import { recordFundingProfileUpserted, recordOpportunityDiscovery } from '../services/grant-finder-metrics';
import { setTenantContextTx } from '../services/tenant/governed-tenant-context';

const router = Router();

function resolveUserId(req: Request): number | null {
  const r = req as any;
  const raw = r.userId ?? r.user?.id ?? r.user?.userId;
  const n = raw == null ? NaN : typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}
function resolveOrgId(req: Request): number | null {
  const r = req as any;
  const raw = r.tenantId ?? r.organizationId ?? r.user?.organizationId ?? r.user?.tenantId;
  const n = raw == null ? NaN : typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}
const CODE_STATUS: Record<string, number> = { NOT_FOUND: 404, BAD_INPUT: 400 };
function fail(res: Response, err: unknown): void {
  const code = (err as { code?: string } | null)?.code;
  if (code && CODE_STATUS[code]) {
    res.status(CODE_STATUS[code]).json({ error: { code, message: err instanceof Error ? err.message : 'Request failed.' } });
    return;
  }
  res.status(500).json({ error: { code: 'INTERNAL', message: err instanceof Error ? err.message : 'Request failed.' } });
}
const reason = z.string().trim().min(8, 'Provide a reason of at least 8 characters.');
const AGENCY = z.enum(['nih', 'nsf', 'barda', 'dod', 'cdc', 'arpa_h', 'foundation', 'industry', 'other']);
const MECHANISM = z.enum(['sbir', 'sttr', 'r01', 'r21', 'u01', 'p01', 'contract', 'cooperative_agreement', 'other']);

async function governed(
  req: Request,
  res: Response,
  command: string,
  reasonText: string,
  run: (client: any, orgId: number, userId: number) => Promise<{ target: string; payload?: Record<string, unknown>; body: Record<string, unknown> }>,
): Promise<void> {
  const userId = resolveUserId(req);
  const orgId = resolveOrgId(req);
  if (!userId || !orgId) {
    res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, orgId);
    const { target, payload, body } = await run(client, orgId, userId);
    const gov = await recordGovernedAction(client, { orgId, userId, command, target, reason: reasonText, payload, domain: 'grants' });
    await client.query('COMMIT');
    res.status(201).json({ ...body, ...gov });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    fail(res, err);
  } finally {
    client.release();
  }
}

// ─── Funding profile ─────────────────────────────────────────────────────────

const profileSchema = z.object({
  keywords: z.array(z.string().min(1).max(120)).max(50).optional(),
  agencies: z.array(AGENCY).max(20).optional(),
  mechanisms: z.array(MECHANISM).max(20).optional(),
  institutionType: z.string().max(60).optional(),
  minAward: z.number().nonnegative().optional(),
  maxAward: z.number().nonnegative().optional(),
  reason,
});
router.put('/profile', async (req, res) => {
  const parsed = profileSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId, userId) => {
    const { id } = await upsertFundingProfileTx(client, orgId, userId, parsed.data);
    recordFundingProfileUpserted();
    return { target: `grant-funding-profile:${id}`, body: { id } };
  });
});

router.get('/profile', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  try {
    const p = await getFundingProfile(orgId);
    if (!p) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No funding profile set for this organization.' } });
    res.json(p);
  } catch (err) { fail(res, err); }
});

// ─── Discovery (read-only, intelligent ranking) ──────────────────────────────

router.get('/discover', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const query = typeof req.query.query === 'string' ? req.query.query : undefined;
  const limit = req.query.limit ? Number(req.query.limit) : undefined;
  try {
    const result = await discoverOpportunities(orgId, { query, limit: Number.isFinite(limit) ? limit : undefined });
    const strong = result.matches.filter((m) => m.fitScore >= 70).length;
    recordOpportunityDiscovery(result.scored, strong);
    res.json(result);
  } catch (err) { fail(res, err); }
});

// ─── Record a match into the pre-award pipeline ──────────────────────────────

const recordSchema = z.object({
  externalId: z.string().min(1).max(120),
  opportunityNumber: z.string().min(1).max(120),
  title: z.string().min(1).max(500),
  fundingAgency: AGENCY,
  mechanism: MECHANISM.optional(),
  dueDate: z.string().optional(),
  reason,
});
router.post('/record', async (req, res) => {
  const parsed = recordSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'create', parsed.data.reason, async (client, orgId, userId) => {
    const { id } = await recordMatchTx(client, orgId, userId, parsed.data);
    return { target: `grant-opportunity:${id}`, payload: { externalId: parsed.data.externalId }, body: { id } };
  });
});

export default router;
