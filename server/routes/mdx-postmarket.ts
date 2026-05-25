/**
 * MDX Post-market vigilance surface route.
 *
 *   GET /api/mdx/postmarket   — signals + CAPAs + metrics (cross-program)
 *
 * Backs the kit Post-market surface (client usePostmarket). Returns the kit
 * payload { metrics, signals, capas, pmsPlan, trends } from the real
 * vigilance_events and capa_records tables, tenant-scoped via the program
 * join. pmsPlan/trends have no dedicated store yet → empty. Empty-safe.
 */

import { Router, Request, Response } from 'express';
import { createScopedLogger } from '../utils/logger';
import { ok, orgRequired, serverError } from '../lib/api-response';
import { pool } from '../db';

const router = Router();
const log = createScopedLogger('mdx-postmarket');

function getOrgId(req: Request): number | null {
  const raw = (req as any).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

interface SignalRow {
  id: string; program_code: string | null; kind: string | null;
  occurred_at: Date | string | null; payload: Record<string, unknown> | null;
  reason: string | null; actor: string | null;
}
interface CapaRow {
  id: string; capa_code: string | null; title: string | null;
  program_code: string | null; state: string | null; assigned_to: string | null;
  created_at: Date | string | null; risk_level: string | null; source_refs: unknown;
}

router.get('/postmarket', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  try {
    // vigilance_events are program-scoped; join regulatory_programs to enforce tenant.
    const sigRes = await pool.query<SignalRow>(
      `SELECT v.id, p.code AS program_code, v.kind, v.occurred_at, v.payload,
              v.reason, v.actor
         FROM vigilance_events v
         JOIN regulatory_programs p ON p.id::text = v.program_id::text
        WHERE p.organization_id = $1
        ORDER BY v.occurred_at DESC NULLS LAST
        LIMIT 500`,
      [orgId],
    ).catch((e) => { if ((e as { code?: string }).code === '42P01') return { rows: [] as SignalRow[] }; throw e; });

    const signals = sigRes.rows.map((r) => {
      const pl = r.payload ?? {};
      return {
        id: String(r.id),
        device: r.program_code ?? String((pl as Record<string, unknown>).device ?? ''),
        source: String((pl as Record<string, unknown>).source ?? r.kind ?? ''),
        opened: r.occurred_at ? new Date(r.occurred_at).toISOString() : '',
        severity: String((pl as Record<string, unknown>).severity ?? 'review'),
        kind: r.kind ?? '',
        count: Number((pl as Record<string, unknown>).count ?? 1),
        vs: String((pl as Record<string, unknown>).vs ?? '—'),
        summary: r.reason ?? String((pl as Record<string, unknown>).summary ?? ''),
        owner: r.actor ?? '',
        state: String((pl as Record<string, unknown>).state ?? 'investigate'),
      };
    });

    const capaRes = await pool.query<CapaRow>(
      `SELECT c.id, c.capa_code, c.title, p.code AS program_code, c.state,
              c.assigned_to, c.created_at, c.risk_level, c.source_refs
         FROM capa_records c
         LEFT JOIN regulatory_programs p ON p.id::text = c.program_id::text
        WHERE p.organization_id = $1 OR p.organization_id IS NULL
        ORDER BY c.created_at DESC NULLS LAST
        LIMIT 500`,
      [orgId],
    ).catch((e) => { if ((e as { code?: string }).code === '42P01') return { rows: [] as CapaRow[] }; throw e; });

    const capas = capaRes.rows.map((r) => ({
      id: r.capa_code ?? String(r.id),
      title: r.title ?? '',
      device: r.program_code ?? '',
      stage: r.state ?? 'open',
      owner: r.assigned_to ?? '',
      opened: r.created_at ? new Date(r.created_at).toISOString() : '',
      sla: '',
      critical: (r.risk_level ?? '').toLowerCase() === 'high' || (r.risk_level ?? '').toLowerCase() === 'critical',
      linked: Array.isArray(r.source_refs) ? (r.source_refs as string[]) : [],
    }));

    const critical = signals.filter((s) => s.severity === 'critical').length;
    const metrics = [
      { label: 'Open signals', metric: String(signals.length), meta: `${critical} critical`, tone: critical > 0 ? 'err' : 'ok' },
      { label: 'Open CAPAs', metric: String(capas.length), meta: `${capas.filter((c) => c.critical).length} critical` },
    ];

    return ok(res, { metrics, signals, capas, pmsPlan: [], trends: [] }, { count: signals.length });
  } catch (err) {
    return serverError(res, log, 'postmarket', err);
  }
});

export default router;
