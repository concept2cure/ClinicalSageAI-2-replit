/**
 * MDX Audit Log surface route.
 *
 *   GET /api/mdx/audit   — tenant-scoped audit events + filter registries + KPIs
 *
 * Backs the kit Audit Log surface (client useAudit). Returns the surface's
 * exact payload shape { events, actions, resources, kpis } computed from the
 * real audit_logs table (tenant-scoped on tenant_id). Empty-safe: an empty
 * table yields empty arrays + zeroed KPIs rather than a 404/500.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { createScopedLogger } from '../utils/logger';
import { ok, clientError, orgRequired, serverError } from '../lib/api-response';
import { pool } from '../db';

const router = Router();
const log = createScopedLogger('mdx-audit');

function getOrgId(req: Request): number | null {
  const raw = (req as any).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

const listQuery = z.object({
  action:   z.string().max(60).optional(),
  resource: z.string().max(60).optional(),
  actor:    z.string().max(120).optional(),
  program:  z.string().max(120).optional(),
  from:     z.string().optional(),
  to:       z.string().optional(),
  limit:    z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(1000)).optional(),
});

interface AuditRow {
  id: number | string;
  user_id: number | null;
  actor_name: string | null;
  action: string | null;
  table_name: string | null;
  record_id: string | null;
  new_values: Record<string, unknown> | null;
  created_at: Date | string | null;
}

router.get('/audit', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) return clientError(res, 422, 'Invalid query', parsed.error.flatten().fieldErrors);
  const { action, resource, actor, program, from, to, limit = 200 } = parsed.data;

  const filters = ['al.tenant_id = $1'];
  const args: unknown[] = [orgId];
  if (action)   { args.push(action);   filters.push(`al.action = $${args.length}`); }
  if (resource) { args.push(resource); filters.push(`al.table_name = $${args.length}`); }
  if (actor)    { args.push(actor);    filters.push(`al.user_id::text = $${args.length}`); }
  // Phase 9 connection-pass §3: cross-program surfaces accept an optional
  // program filter. Audit events anchor to a program when the record id or
  // the new_values payload references the program code.
  if (program)  {
    args.push(`%${program}%`);
    filters.push(`(al.record_id ILIKE $${args.length} OR al.new_values::text ILIKE $${args.length})`);
  }
  if (from)     { args.push(from);     filters.push(`al.created_at >= $${args.length}`); }
  if (to)       { args.push(to);       filters.push(`al.created_at <= $${args.length}`); }
  args.push(limit);

  try {
    const { rows } = await pool.query<AuditRow>(
      `SELECT al.id, al.user_id, al.action, al.table_name, al.record_id,
              al.new_values, al.created_at,
              COALESCE(u.name, u.email) AS actor_name
         FROM audit_logs al
         LEFT JOIN users u ON u.id = al.user_id
        WHERE ${filters.join(' AND ')}
        ORDER BY al.created_at DESC
        LIMIT $${args.length}`,
      args,
    );

    const events = rows.map((r) => {
      const nv = r.new_values ?? {};
      return {
        id: `A-${r.id}`,
        when: r.created_at ? new Date(r.created_at).toISOString() : '',
        actor: r.user_id != null ? `u-${r.user_id}` : 'system',
        actorName: r.actor_name ?? (r.user_id != null ? `User ${r.user_id}` : 'system'),
        role: String((nv as Record<string, unknown>).role ?? ''),
        action: r.action ?? '',
        resource: r.table_name ?? '',
        target: r.record_id ?? '',
        resourceId: r.record_id ?? '',
        reason: String((nv as Record<string, unknown>).reason ?? ''),
        sha: String((nv as Record<string, unknown>).sha ?? ''),
        prev: String((nv as Record<string, unknown>).prev ?? ''),
        chain: 'ok',
      };
    });

    // Derive filter registries + KPIs from the live rows (no fixtures).
    const actionSet = new Map<string, number>();
    const resourceSet = new Map<string, number>();
    for (const e of events) {
      if (e.action) actionSet.set(e.action, (actionSet.get(e.action) ?? 0) + 1);
      if (e.resource) resourceSet.set(e.resource, (resourceSet.get(e.resource) ?? 0) + 1);
    }
    const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
    const actions = [...actionSet.keys()].map((id) => ({ id, label: cap(id) }));
    const resources = [...resourceSet.keys()].map((id) => ({ id, label: cap(id) }));

    const today = events.filter((e) => e.when && e.when.slice(0, 10) === new Date().toISOString().slice(0, 10));
    const signings = today.filter((e) => e.action === 'sign').length;
    const kpis = [
      { label: 'Events today', metric: String(today.length), meta: `${events.length} in window` },
      { label: 'Signings today', metric: String(signings), meta: 'Part 11 e-signature events' },
      { label: 'Distinct actors', metric: String(new Set(events.map((e) => e.actor)).size), meta: 'In current window' },
    ];

    return ok(res, { events, actions, resources, kpis }, { count: events.length });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === '42P01') return ok(res, { events: [], actions: [], resources: [], kpis: [] }, { count: 0 });
    return serverError(res, log, 'list-audit', err);
  }
});

export default router;
