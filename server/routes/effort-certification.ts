/**
 * Effort Certification API (add-on) — governed CRUD + certify (2 CFR 200.430).
 * Mounted at /api/effort-certification.
 * @module server/routes/effort-certification
 */
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { pool } from '../db';
import { recordGovernedAction } from './c2c/actions';
import { createCertificationTx, addLineTx, certifyTx, loadStatement, listCertifications } from '../services/effort-certification/effort-service';
import { validateEffort } from '../services/effort-certification/effort-logic';

const router = Router();
function uid(req: Request): number | null { const r = req as any; const x = r.userId ?? r.user?.id ?? r.user?.userId; const n = x == null ? NaN : Number(x); return Number.isFinite(n) ? n : null; }
function oid(req: Request): number | null { const r = req as any; const x = r.tenantId ?? r.organizationId ?? r.user?.organizationId ?? r.user?.tenantId; const n = x == null ? NaN : Number(x); return Number.isFinite(n) ? n : null; }
const CODE: Record<string, number> = { NOT_FOUND: 404, INVALID_STATE: 409, BAD_INPUT: 400 };
function fail(res: Response, err: unknown) { const c = (err as any)?.code; res.status(c && CODE[c] ? CODE[c] : 500).json({ error: { code: c ?? 'INTERNAL', message: err instanceof Error ? err.message : 'Request failed.' } }); }
const reason = z.string().trim().min(8);
async function governed(req: Request, res: Response, command: string, reasonText: string, run: (c: any, o: number, u: number) => Promise<{ target: string; payload?: Record<string, unknown>; body: Record<string, unknown> }>) {
  const u = uid(req), o = oid(req); if (!u || !o) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const c = await pool.connect();
  try { await c.query('BEGIN'); const { target, payload, body } = await run(c, o, u); const gov = await recordGovernedAction(c, { orgId: o, userId: u, command, target, reason: reasonText, payload, domain: 'effort_certification' }); await c.query('COMMIT'); res.status(201).json({ ...body, ...gov }); }
  catch (err) { await c.query('ROLLBACK').catch(() => undefined); fail(res, err); } finally { c.release(); }
}

const certSchema = z.object({ personnelId: z.number().int().positive(), periodStart: z.string(), periodEnd: z.string(), reason });
router.post('/', async (req, res) => { const p = certSchema.safeParse(req.body ?? {}); if (!p.success) return res.status(400).json({ error: { code: 'VALIDATION', details: p.error.flatten() } }); await governed(req, res, 'create', p.data.reason, async (c, o, u) => { const { id } = await createCertificationTx(c, o, u, p.data); return { target: `effort-certification:${id}`, body: { id } }; }); });
router.get('/', async (req, res) => { const o = oid(req); if (!o) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } }); const pid = req.query.personnelId ? Number(req.query.personnelId) : undefined; try { res.json(await listCertifications(o, Number.isFinite(pid) ? pid : undefined)); } catch (e) { fail(res, e); } });

const lineSchema = z.object({ activityLabel: z.string().min(1).max(300), committedPct: z.number().min(0).max(100), actualPct: z.number().min(0).max(100), awardId: z.number().int().positive().optional(), reason });
router.post('/:id/lines', async (req, res) => { const id = Number(req.params.id); if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } }); const p = lineSchema.safeParse(req.body ?? {}); if (!p.success) return res.status(400).json({ error: { code: 'VALIDATION', details: p.error.flatten() } }); await governed(req, res, 'update', p.data.reason, async (c, o, u) => { const { id: lid } = await addLineTx(c, o, u, id, p.data); return { target: `effort-certification:${id}`, payload: { lineId: lid }, body: { certificationId: id, lineId: lid } }; }); });

router.get('/:id/validation', async (req, res) => { const o = oid(req); if (!o) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } }); const id = Number(req.params.id); if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } }); const c = await pool.connect(); try { const { lines } = await loadStatement(c, o, id); res.json(validateEffort(lines)); } catch (e) { fail(res, e); } finally { c.release(); } });

const certifySchema = z.object({ reason });
router.post('/:id/certify', async (req, res) => { const id = Number(req.params.id); if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } }); const p = certifySchema.safeParse(req.body ?? {}); if (!p.success) return res.status(400).json({ error: { code: 'VALIDATION', details: p.error.flatten() } }); await governed(req, res, 'sign', p.data.reason, async (c, o, u) => { const { contentHash, needsRecertification } = await certifyTx(c, o, u, id); return { target: `effort-certification:${id}`, payload: { contentHash, needsRecertification }, body: { id, status: 'certified', contentHash, needsRecertification } }; }); });

export default router;
