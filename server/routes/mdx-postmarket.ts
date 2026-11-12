/**
 * MDX Post-market vigilance surface route.
 *
 *   GET /api/mdx/postmarket                  — signals + CAPAs + metrics, the projects the caller can open
 *   GET /api/mdx/postmarket?program_id=<id>  — the same, for one project (P-122, 2026-11-10)
 *
 * Backs the kit Post-market surface (client usePostmarket). Returns the kit
 * payload { metrics, signals, capas, pmsPlan, trends } from the real
 * vigilance_events and capa_records tables, tenant-scoped via the program
 * join. pmsPlan/trends have no dedicated store yet → empty. Empty-safe.
 *
 * `meta.scope` says whose rows these are: 'program' for one project, which the
 * screen draws its panels for, or 'organization'. Until P-122 the read took no
 * project, so the screen hid its signal, CAPA-board, trend and PMS panels
 * (PostmarketSurface.tsx, 10bbeeeea). A named project is admitted as
 * Engineering admits one (mdx-engineering.ts, P-60): the caller's current
 * access to it (getCurrentAccessibleProgramScope), so another organisation's
 * project is 404, a private project the caller is not shared on is 403, and a
 * malformed id is 422, never an empty feed. Without a project the read is the
 * projects the caller can open; until P-122 it was every project of the
 * organisation, private ones included.
 */

import { Router, Request, Response } from 'express';
import { createScopedLogger } from '../utils/logger';
import { ok, clientError, orgRequired, serverError } from '../lib/api-response';
import { requestPgClient, MissingRequestDbContextError } from '../db/requestDb';
import { governedActorId } from '../middleware/orgMembership';
import {
  getCurrentAccessibleProgramScope, requireProgramScopeStillCurrent, ProgramReadAccessError,
} from '../services/c2c/current-program-access';

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get('/postmarket', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const named = req.query.program_id;
  if (named !== undefined && (typeof named !== 'string' || !UUID_RE.test(named))) {
    return clientError(res, 422, 'program_id must be a project id. Nothing was read.');
  }
  const programId = typeof named === 'string' ? named.toLowerCase() : null;
  try {
    /* The caller's current access: one project, or the projects they can open. A refusal answers before any row is
       read (ProgramReadAccessError below). */
    const q = requestPgClient(req);
    const identity = { organizationId: orgId, userId: governedActorId(req) ?? undefined, programId };
    const access = await getCurrentAccessibleProgramScope(q, identity);
    const programs = access.programIds;

    // vigilance_events are program-scoped; join regulatory_programs to enforce tenant.
    const sigRes = await q.query(
      `SELECT v.id, p.code AS program_code, v.kind, v.occurred_at, v.payload,
              v.reason, v.actor
         FROM vigilance_events v
         JOIN regulatory_programs p ON p.id::text = v.program_id::text
        WHERE p.organization_id = $1
          AND p.id::text = ANY($2::text[])
        ORDER BY v.occurred_at DESC NULLS LAST
        LIMIT 500`,
      [orgId, programs],
    ).then((r) => r as unknown as { rows: SignalRow[] })
      .catch((e) => { if ((e as { code?: string }).code === '42P01') return { rows: [] as SignalRow[] }; throw e; });

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

    /* capa_records carries no organization_id of its own — per its
       migration, tenancy is derived entirely by joining
       regulatory_programs.organization_id.

       This was previously a LEFT JOIN with `OR p.organization_id IS
       NULL`, which meant any CAPA whose text program_id failed to match
       a regulatory_programs row produced a NULL org and was returned to
       *every* tenant. An INNER JOIN is the only correct form here: a
       CAPA that cannot be attributed to a program in this organization
       must not be visible to it. Orphaned rows now surface nowhere
       rather than everywhere. */
    const capaRes = await q.query(
      `SELECT c.id, c.capa_code, c.title, p.code AS program_code, c.state,
              c.assigned_to, c.created_at, c.risk_level, c.source_refs
         FROM capa_records c
         JOIN regulatory_programs p ON p.id::text = c.program_id::text
        WHERE p.organization_id = $1
          AND p.id::text = ANY($2::text[])
        ORDER BY c.created_at DESC NULLS LAST
        LIMIT 500`,
      [orgId, programs],
    ).then((r) => r as unknown as { rows: CapaRow[] })
      .catch((e) => { if ((e as { code?: string }).code === '42P01') return { rows: [] as CapaRow[] }; throw e; });

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

    await requireProgramScopeStillCurrent(q, identity, access);
    return ok(res, { metrics, signals, capas, pmsPlan: [], trends: [] },
      { count: signals.length, scope: programId ? 'program' : 'organization' });
  } catch (err) {
    if (err instanceof ProgramReadAccessError) return res.status(err.status).json({ error: err.code, message: err.message });
    if (err instanceof MissingRequestDbContextError) return res.status(503).json({
      error: 'PROJECT_ACCESS_UNAVAILABLE', message: 'Current project access could not be verified. No surveillance data was supplied.',
    });
    return serverError(res, log, 'postmarket', err);
  }
});

export default router;
