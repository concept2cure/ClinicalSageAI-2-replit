/**
 * Vault aggregator — backs Surface 1 (Workbench › Vault tab) of the
 * paying-client beta brief.
 *
 *   GET /api/mdx/vault?program_id=<UUID>   list artifacts for the program
 *   GET /api/mdx/vault/:artifactId         artifact metadata + linked sections
 *   GET /api/mdx/vault/:artifactId/versions  version history rows
 *
 * Reads from concept2cure_artifacts (existing table, see schema.ts:5276).
 * concept2cure_artifacts.project_id is the legacy projects.id (numeric).
 * Regulatory programs are uuid-keyed; the bridge between the two is
 * `projects.regulatory_program_id` (Document Identity Contract slice C1,
 * migrations/20260814_projects_regulatory_program_anchor.sql), so a
 * program_id request filters through it. Where that column has not been
 * applied yet the request is refused honestly (422) rather than 500-ing on
 * 42703 — which is exactly what this route used to do while its own comment
 * claimed the column had been "added by the MDX migration".
 * Listing without program_id returns every artifact in the org.
 *
 * All endpoints return the canonical { data, meta? } envelope. Tenant-
 * scoped via the caller's organizationId. Audit-logged for reads at the
 * service layer — the global mutation middleware doesn't see GETs.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';

import { createScopedLogger } from '../utils/logger';
import { ok, clientError, orgRequired, notFoundInTenant, serverError } from '../lib/api-response';
import { pool } from '../db';

const router = Router();
const log = createScopedLogger('mdx-vault');

function getOrgId(req: Request): number | null {
  const raw = (req as any).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const listQuerySchema = z.object({
  program_id: z.string().regex(UUID_RE).optional(),
  ctd_prefix: z.string().min(1).optional(),
  status:     z.enum(['draft', 'review', 'approved', 'locked']).optional(),
  limit:      z
    .string()
    .regex(/^\d+$/)
    .transform((s) => Number.parseInt(s, 10))
    .pipe(z.number().int().min(1).max(500))
    .optional(),
});

interface VaultRow {
  id:               number;
  artifact_id:      string;
  title:            string;
  type:             string;
  category:         string;
  ctd_section:      string | null;
  status:           string;
  version:          number;
  content_hash:     string | null;
  created_by_id:    number | null;
  created_at:       Date;
  updated_at:       Date;
  locked_at:        Date | null;
  metadata:         Record<string, unknown> | null;
}

/* ─── GET /api/mdx/vault — list ───────────────────────────────────── */

router.get('/vault', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return clientError(res, 422, 'Invalid query', parsed.error.flatten().fieldErrors);
  }
  const { program_id: programId, ctd_prefix: ctdPrefix, status, limit = 200 } = parsed.data;

  /* The project ↔ regulatory_program bridge. HISTORY (2026-08-13): the comment
     here claimed `projects.regulatory_program_id` "was added by the MDX
     migration" while NO migration created it, so this filter raised 42703 and
     every program-scoped Vault request 500'd; it was changed to refuse with a
     422 until the column was real. It is real now (slice C1 of the Document
     Identity Contract) and the filter is restored — but the 422 stays as the
     runtime fallback below, because a deploy can run this code against a
     database that has not had the migration applied yet, and "cannot filter"
     is the honest answer there. What must never come back is returning the
     whole org's artifacts as if they were one program's.

     EXISTS rather than a JOIN: an artifact must not be duplicated or dropped
     by the bridge, and the org predicate is repeated on `projects` so a
     mis-anchored row (the anchor is deliberately FK-free — see the migration)
     can never pull another tenant's project into the predicate. */
  /* a.organization_id lives in the SQL literal below (not this array) so the
     tenant-isolation CI gate can verify the scope statically. */
  const filters: string[] = [`a.status != 'archived'`];
  const args: unknown[] = [orgId];
  if (programId) {
    args.push(programId);
    filters.push(
      `EXISTS (SELECT 1 FROM projects p
                WHERE p.id = a.project_id
                  AND p.organization_id = a.organization_id
                  AND p.regulatory_program_id = $${args.length}::uuid)`,
    );
  }
  if (ctdPrefix) {
    args.push(`${ctdPrefix}%`);
    filters.push(`a.ctd_section ILIKE $${args.length}`);
  }
  if (status) {
    args.push(status);
    filters.push(`a.status = $${args.length}`);
  }
  args.push(limit);

  try {
    const { rows } = await pool.query<VaultRow>(
      `SELECT a.id, a.artifact_id, a.title, a.type, a.category, a.ctd_section, a.status,
              a.version, a.content_hash, a.created_by_id, a.created_at, a.updated_at,
              a.locked_at, a.metadata
         FROM concept2cure_artifacts a
        WHERE a.organization_id = $1 AND ${filters.join(' AND ')}
        ORDER BY a.updated_at DESC
        LIMIT $${args.length}`,
      args,
    );

    /* Group by family for the kit's library list. The family is derived
       from ctd_section ('1' → 'Module 1', etc.) with a default bucket
       for artifacts that have no ctd_section assigned. */
    const familyOf = (ctd: string | null): string => {
      if (!ctd) return 'Working files';
      const first = ctd.trim().charAt(0);
      if (first >= '1' && first <= '5') return `Module ${first}`;
      if (/cover/i.test(ctd)) return 'Cover letters';
      if (/form/i.test(ctd)) return 'Forms';
      return 'Working files';
    };

    return ok(
      res,
      rows.map((r) => ({
        id:           r.id,
        artifactId:   r.artifact_id,
        title:        r.title,
        type:         r.type,
        category:     r.category,
        family:       familyOf(r.ctd_section),
        ctdSection:   r.ctd_section,
        status:       r.status,
        version:      r.version,
        contentHash:  r.content_hash,
        createdById:  r.created_by_id,
        createdAt:    r.created_at,
        updatedAt:    r.updated_at,
        lockedAt:     r.locked_at,
        eSig:         Boolean((r.metadata as { eSig?: unknown } | null)?.eSig),
      })),
      { count: rows.length },
    );
  } catch (err) {
    /* Fail closed on an un-migrated database: 42703 (undefined_column) can
       only reach here from the program filter above, and the honest answer is
       the one this route already gave for the year the column was phantom —
       "cannot be filtered", not a 500, and never the unfiltered org list. */
    if (programId && (err as { code?: string })?.code === '42703') {
      log.warn(
        'projects.regulatory_program_id absent — program-scoped vault listing refused ' +
          '(apply migrations/20260814_projects_regulatory_program_anchor.sql)',
        { orgId },
      );
      return clientError(
        res,
        422,
        'Program-scoped vault listing is unavailable',
        {
          program_id: [
            'Artifacts cannot be filtered by regulatory program in this environment: ' +
              'the project-to-program anchor column has not been applied to this database. ' +
              "Listing without program_id returns this organization's artifacts.",
          ],
        },
      );
    }
    return serverError(res, log, 'list-vault', err);
  }
});

/* ─── GET /api/mdx/vault/:artifactId ──────────────────────────────── */

router.get('/vault/:artifactId', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const artifactId = String(req.params.artifactId);

  try {
    const { rows } = await pool.query(
      // Deliberately no join to `projects`. This endpoint used to select
      // p.regulatory_program_id unconditionally while the column was phantom,
      // so it 500'd on EVERY request; the join went with it. The column is
      // real now (slice C1), but nothing in this response consumed it, and
      // re-adding a join for an unread field would reintroduce a 42703 on any
      // database that has not applied the migration. It stays out until a
      // caller actually needs it.
      `SELECT a.*
         FROM concept2cure_artifacts a
        WHERE a.organization_id = $1
          AND (a.id::text = $2 OR a.artifact_id = $2)
        LIMIT 1`,
      [orgId, artifactId],
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Artifact');
    return ok(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'get-artifact', err);
  }
});

/* ─── GET /api/mdx/vault/:artifactId/versions ─────────────────────── */

router.get('/vault/:artifactId/versions', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const artifactId = String(req.params.artifactId);

  try {
    /* Look up the numeric id from either form (artifact_xxx external id
       or numeric pk), then pull the version rows. The version table is
       concept2cure_artifact_versions (foundation migration; columns
       `version` / `change_description`) — aliased here to the response
       shape the client selectors already consume. */
    const idResult = await pool.query<{ id: number }>(
      `SELECT id FROM concept2cure_artifacts
        WHERE organization_id = $1 AND (id::text = $2 OR artifact_id = $2)
        LIMIT 1`,
      [orgId, artifactId],
    );
    if (idResult.rows.length === 0) return notFoundInTenant(res, 'Artifact');
    const id = idResult.rows[0].id;

    const versions = await pool.query(
      `SELECT id, version AS version_number, change_description AS change_summary,
              content_hash, created_at, created_by_id
         FROM concept2cure_artifact_versions
        WHERE artifact_id = $1 AND organization_id = $2
        ORDER BY version DESC`,
      [id, orgId],
    );
    return ok(res, versions.rows, { count: versions.rowCount ?? 0 });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === '42P01') {
      /* The version-table is in a separate migration; if missing, return
         empty list rather than 500 so the kit's surface still renders. */
      return ok(res, [], { count: 0 });
    }
    return serverError(res, log, 'list-versions', err);
  }
});

export default router;
