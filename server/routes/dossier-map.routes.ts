/**
 * Dossier map — CTD / eCTD module-map read for the v2 DossierMap surface.
 *
 * GET /api/dossier-map?projectId=<id> → ONE project's per-module (M1–M5) completeness +
 * readiness map, shaped to exactly the keys the v2 DossierMap grid renders ({ m, label,
 * pct, tone, sections }), assembled ENTIRELY from the real CTD section-tracking store
 * (project_sections + its parent projects) — the same table a tenant populates by
 * creating a regulatory project and working its sections through the authoring workflow.
 *
 * This is a project-readiness view, so `projectId` is REQUIRED and the read is scoped to
 * that single project (within the acting org); it never falls back to an org-wide roll-up
 * that would mix one program's readiness with another's. There is no seed-only blob: a
 * project with no tracked CTD sections returns an empty list and the surface renders its
 * own honest empty state. See server/services/dossier/dossier-map-view-assembler.ts.
 * Distinct from the artifact roll-up /api/dossier-readiness endpoint.
 *
 * ── `projectId` is a program UUID or a legacy integer (VSR-001 F-7, 2026-09-21) ──
 * The shell publishes the open program's `regulatory_programs` UUID and the surface
 * forwards it; this route accepted only an integer and `parseInt`'d whatever it got, so a
 * UUID whose leading characters are digits became an UNRELATED integer project id
 * (`6191805f-…` → 6191805; a 500 was observed) and any other UUID a 400. An identifier
 * is never parsed as a number. A UUID is resolved, org-scoped, through the one
 * program → PM-spine bridge (`projects.regulatory_program_id`,
 * services/c2c/program-project-anchor.ts): a program not in the acting org is 404; a
 * program with no anchor — a real, expected state (intake reports
 * `projectAnchorSkipped: NO_CLIENT_WORKSPACE`) — answers an EMPTY map whose `meta` says
 * `anchored:false`, so the surface can render "no section store for this program"
 * instead of "no sections yet". An integer still names a legacy `projects.id` directly.
 *
 * Org scoped; 403 without org context; 400 without a valid projectId; fails to an empty
 * list on 42P01 so an unprovisioned store never 500s.
 */
import { Router, type Request, type Response } from 'express';
import { requestDb, requestPgClient, type RequestSqlClient } from '../db/requestDb';
import { isUuid } from '../middleware/uuidParam';
import { resolveProgramProjectAnchor } from '../services/c2c/program-project-anchor';
import { assembleProjectDossierMap } from '../services/dossier/dossier-map-view-assembler.js';

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

/** A legacy integer project id: digits only, positive. "12abc" is NOT 12. */
function legacyProjectId(raw: string): number | null {
  if (!/^[1-9]\d*$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : null;
}

/** Does this program exist in the acting org? Org-scoped and soft-delete aware. */
async function programExists(
  db: RequestSqlClient,
  programId: string,
  orgId: number,
): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT id FROM regulatory_programs
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
      LIMIT 1`,
    [programId, orgId],
  );
  return rows.length > 0;
}

router.get('/', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res.status(403).json({ error: { code: 'ORG_REQUIRED', message: 'Organization context required.' } });
  }
  // Project-readiness read: an explicit project id is required. Never fall back to an
  // org-wide roll-up (that would contaminate one program's readiness with another's).
  const rawProject = typeof req.query.projectId === 'string' ? req.query.projectId.trim() : '';
  const programId = isUuid(rawProject) ? rawProject : null;
  const legacyId = programId === null ? legacyProjectId(rawProject) : null;
  if (programId === null && legacyId === null) {
    return res.status(400).json({
      error: {
        code: 'PROJECT_REQUIRED',
        message: 'A projectId query parameter is required: the program UUID, or a legacy integer project id.',
      },
    });
  }

  try {
    let projectId: number;
    if (programId !== null) {
      if (!(await programExists(requestPgClient(req), programId, orgId))) {
        return res
          .status(404)
          .json({ error: { code: 'PROGRAM_NOT_FOUND', message: 'Program not found in your organization.' } });
      }
      const anchor = await resolveProgramProjectAnchor(requestDb(req), {
        programId,
        orgId,
        context: 'server/routes/dossier-map.routes.ts',
      });
      if (anchor === null) {
        // The program is real; the store this map is assembled from is keyed by the
        // PM-spine project id and this program has none. Say so — the surface must not
        // read this as "the program's sections are all unauthored".
        return res.json({
          data: [],
          meta: {
            count: 0,
            source: 'project_sections',
            programId,
            projectId: null,
            anchored: false,
            reason: 'PROGRAM_UNANCHORED',
          },
        });
      }
      projectId = anchor;
    } else {
      projectId = legacyId as number;
    }

    const data = await assembleProjectDossierMap(orgId, projectId);
    return res.json({
      data,
      meta: {
        count: data.length,
        source: 'project_sections',
        projectId,
        ...(programId !== null ? { programId, anchored: true } : {}),
      },
    });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return res.json({ data: [], meta: { count: 0, pendingStore: true } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to read dossier map.' } });
  }
});

export default router;
