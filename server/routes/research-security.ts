/**
 * Research Security / COI API (add-on) — governed disclosure CRUD + review.
 * NOT-OD-26-017 / NSPM-33 / 42 CFR 50 Subpart F. Mounted at /api/research-security.
 * @module server/routes/research-security
 */
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { pool } from '../db';
import { recordGovernedAction } from './c2c/actions';
import { createDisclosureTx, reviewDisclosureTx, listDisclosures } from '../services/research-security/coi-service';
import { recordCoiDisclosure, recordCoiReview } from '../services/research-security-metrics';
import { setTenantContextTx } from '../services/tenant/governed-tenant-context';

const router = Router();
function uid(req: Request): number | null { const r = req as any; const x = r.userId ?? r.user?.id ?? r.user?.userId; const n = x == null ? NaN : Number(x); return Number.isFinite(n) ? n : null; }
function oid(req: Request): number | null { const r = req as any; const x = r.tenantId ?? r.organizationId ?? r.user?.organizationId ?? r.user?.tenantId; const n = x == null ? NaN : Number(x); return Number.isFinite(n) ? n : null; }
const CODE: Record<string, number> = { NOT_FOUND: 404, BAD_INPUT: 400 };
function fail(res: Response, err: unknown) { const c = (err as any)?.code; res.status(c && CODE[c] ? CODE[c] : 500).json({ error: { code: c ?? 'INTERNAL', message: err instanceof Error ? err.message : 'Request failed.' } }); }
const reason = z.string().trim().min(8);
async function governed(req: Request, res: Response, command: string, reasonText: string, run: (c: any, o: number, u: number) => Promise<{ target: string; payload?: Record<string, unknown>; body: Record<string, unknown> }>) {
  const u = uid(req), o = oid(req); if (!u || !o) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const c = await pool.connect();
  try { await c.query('BEGIN'); await setTenantContextTx(c, o); const { target, payload, body } = await run(c, o, u); const gov = await recordGovernedAction(c, { orgId: o, userId: u, command, target, reason: reasonText, payload, domain: 'research_security' }); await c.query('COMMIT'); res.status(201).json({ ...body, ...gov }); }
  catch (err) { await c.query('ROLLBACK').catch(() => undefined); fail(res, err); } finally { c.release(); }
}

const discSchema = z.object({
  personnelId: z.number().int().positive(),
  disclosureType: z.enum(['financial_interest', 'outside_activity', 'foreign_appointment', 'foreign_support', 'other_support', 'gift', 'intellectual_property', 'other']),
  entityName: z.string().min(1).max(300),
  country: z.string().max(80).optional(),
  description: z.string().max(4000).optional(),
  monetaryValue: z.union([z.number(), z.string()]).optional(),
  relatedToResearch: z.string().max(4000).optional(),
  disclosedDate: z.string().optional(),
  reason,
});
router.post('/disclosures', async (req, res) => { const p = discSchema.safeParse(req.body ?? {}); if (!p.success) return res.status(400).json({ error: { code: 'VALIDATION', details: p.error.flatten() } }); await governed(req, res, 'create', p.data.reason, async (c, o, u) => { const { id, foreignFlag } = await createDisclosureTx(c, o, u, p.data); recordCoiDisclosure(p.data.disclosureType, foreignFlag); return { target: `coi-disclosure:${id}`, payload: { type: p.data.disclosureType, foreignFlag }, body: { id, foreignFlag } }; }); });
router.get('/disclosures', async (req, res) => { const o = oid(req); if (!o) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } }); const pid = req.query.personnelId ? Number(req.query.personnelId) : undefined; try { res.json(await listDisclosures(o, Number.isFinite(pid) ? pid : undefined)); } catch (e) { fail(res, e); } });

const reviewSchema = z.object({ status: z.enum(['submitted', 'under_review', 'no_conflict', 'managed', 'conflict', 'denied']), managementPlan: z.string().max(4000).optional(), reason });
router.patch('/disclosures/:id/review', async (req, res) => { const id = Number(req.params.id); if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } }); const p = reviewSchema.safeParse(req.body ?? {}); if (!p.success) return res.status(400).json({ error: { code: 'VALIDATION', details: p.error.flatten() } }); await governed(req, res, 'resolve', p.data.reason, async (c, o, u) => { await reviewDisclosureTx(c, o, u, id, p.data); recordCoiReview(p.data.status); return { target: `coi-disclosure:${id}`, payload: { status: p.data.status }, body: { id, status: p.data.status } }; }); });

export default router;
