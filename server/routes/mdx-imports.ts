/**
 * Legacy archive importer routes — backs the onboarding surface.
 *
 *   POST   /api/mdx/imports                                start a job
 *   GET    /api/mdx/imports                                list jobs
 *   GET    /api/mdx/imports/:id                            single job + files + findings
 *   PATCH  /api/mdx/imports/:id/files/:fileId              override a file's mapping
 *   POST   /api/mdx/imports/:id/approve                    materialize artifacts
 *   POST   /api/mdx/imports/:id/cancel                     discard
 *   POST   /api/mdx/imports/:id/findings/:findingId/resolve  resolve finding
 *
 * Tenant-scoped via getOrgId, canonical envelope, Zod-validated.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';

import { createScopedLogger } from '../utils/logger';
import {
  ok, created, clientError, orgRequired, notFoundInTenant, serverError,
} from '../lib/api-response';
import { pool } from '../db';
import { detectArchive } from '../services/legacy-importer/detector';

const router = Router();
const log = createScopedLogger('mdx-imports');

function getOrgId(req: Request): number | null {
  const raw = (req as any).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}
function getUserId(req: Request): number | null {
  const raw = (req as any).user?.id;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* ─── POST /imports — start a job ────────────────────────────── */

const createBody = z.object({
  sourcePath:       z.string().min(1).max(2000),
  sourceKind:       z.enum(['zip', 'folder', 'tar', 'rar']).optional(),
  sourceFilename:   z.string().max(500).optional().nullable(),
  programId:        z.string().regex(UUID_RE).optional().nullable(),
});

router.post('/imports', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = createBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;

  /* Create the job row up front in 'detecting' state so the caller can
     poll for progress. Detection runs synchronously below; for very
     large archives this should be moved to a background worker (out of
     scope for v1). */
  let jobId: number;
  try {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO import_jobs (
         organization_id, program_id, source_path, source_kind, source_filename,
         status, requested_by
       ) VALUES ($1, $2, $3, COALESCE($4, 'zip'), $5, 'detecting', $6)
       RETURNING id`,
      [
        orgId, p.programId ?? null, p.sourcePath, p.sourceKind ?? null,
        p.sourceFilename ?? null, getUserId(req),
      ],
    );
    jobId = rows[0].id;
  } catch (err) {
    return serverError(res, log, 'create', err);
  }

  /* Run detection. */
  try {
    const detected = await detectArchive(p.sourcePath);
    const mapped = detected.files.filter((f) => f.mappingConfidence >= 0.5).length;
    const skipped = detected.files.filter((f) => f.detectedKind !== 'leaf').length;
    /* Persist files. */
    for (const f of detected.files) {
      await pool.query(
        `INSERT INTO import_job_files (
           import_job_id, organization_id, relative_path, file_name, size_bytes,
           sha256, detected_kind, mapped_ctd_section, mapped_section_key,
           mapped_artifact_kind, mapping_confidence, mapping_source, status
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
           CASE WHEN $7 = 'leaf' AND $11 >= 0.5 THEN 'mapped'
                WHEN $7 = 'leaf'                THEN 'pending'
                ELSE 'skipped' END)`,
        [
          jobId, orgId, f.relativePath, f.fileName, f.sizeBytes, f.sha256,
          f.detectedKind, f.mappedCtdSection, f.mappedSectionKey,
          f.mappedArtifactKind, f.mappingConfidence, f.mappingSource,
        ],
      );
    }
    /* Persist findings. */
    for (const fnd of detected.findings) {
      await pool.query(
        `INSERT INTO import_job_findings (
           import_job_id, organization_id, severity, code, message, file_path
         ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [jobId, orgId, fnd.severity, fnd.code, fnd.message, fnd.filePath ?? null],
      );
    }
    /* Update job header. */
    const errorCount = detected.findings.filter((f) => f.severity === 'error').length;
    await pool.query(
      `UPDATE import_jobs
          SET detected_format = $2,
              detected_region = $3,
              detected_application_id = $4,
              detected_sequence = $5,
              detected_sponsor = $6,
              file_count = $7,
              mapped_count = $8,
              skipped_count = $9,
              error_count = $10,
              status = 'ready_for_review',
              updated_at = NOW()
        WHERE id = $1`,
      [
        jobId, detected.format, detected.region,
        detected.applicationId, detected.sequence, detected.sponsor,
        detected.files.length, mapped, skipped, errorCount,
      ],
    );

    const { rows: jobRows } = await pool.query(
      `SELECT * FROM import_jobs WHERE id = $1`, [jobId],
    );
    return created(res, jobRows[0]);
  } catch (err) {
    await pool.query(
      `UPDATE import_jobs SET status = 'failed', error_message = $2, updated_at = NOW() WHERE id = $1`,
      [jobId, err instanceof Error ? err.message : String(err)],
    ).catch(() => undefined);
    return serverError(res, log, 'detect', err);
  }
});

/* ─── GET /imports ────────────────────────────────────────── */

router.get('/imports', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const status = typeof req.query.status === 'string' ? req.query.status : null;
  const filters: string[] = [`organization_id = $1`];
  const args: unknown[] = [orgId];
  if (status) { args.push(status); filters.push(`status = $${args.length}`); }
  try {
    const { rows } = await pool.query(
      `SELECT id, source_filename, detected_format, detected_region,
              detected_application_id, status, file_count, mapped_count,
              skipped_count, error_count, artifacts_created, created_at, updated_at
         FROM import_jobs WHERE ${filters.join(' AND ')}
        ORDER BY created_at DESC LIMIT 200`,
      args,
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) { return serverError(res, log, 'list', err); }
});

/* ─── GET /imports/:id ────────────────────────────────────── */

router.get('/imports/:id', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  try {
    const { rows } = await pool.query(
      `SELECT * FROM import_jobs WHERE id = $1 AND organization_id = $2`,
      [id, orgId],
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Import job');
    const [files, findings] = await Promise.all([
      pool.query(
        `SELECT * FROM import_job_files
          WHERE import_job_id = $1 ORDER BY status, relative_path LIMIT 2000`,
        [id],
      ),
      pool.query(
        `SELECT * FROM import_job_findings
          WHERE import_job_id = $1 ORDER BY (severity = 'error') DESC, (severity = 'warning') DESC, id`,
        [id],
      ),
    ]);
    return ok(res, { ...rows[0], files: files.rows, findings: findings.rows });
  } catch (err) { return serverError(res, log, 'get', err); }
});

/* ─── PATCH /imports/:id/files/:fileId — override mapping ──── */

const patchFileBody = z.object({
  mappedCtdSection:    z.string().max(40).optional().nullable(),
  mappedSectionKey:    z.string().max(120).optional().nullable(),
  mappedArtifactKind:  z.string().max(60).optional().nullable(),
  status:              z.enum(['pending', 'mapped', 'skipped']).optional(),
});

router.patch('/imports/:id/files/:fileId', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const jobId = Number(req.params.id);
  const fileId = Number(req.params.fileId);
  if (!Number.isFinite(jobId) || !Number.isFinite(fileId)) return clientError(res, 422, 'numeric ids required');
  const parsed = patchFileBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);

  const COL: Record<string, string> = {
    mappedCtdSection: 'mapped_ctd_section', mappedSectionKey: 'mapped_section_key',
    mappedArtifactKind: 'mapped_artifact_kind', status: 'status',
  };
  const setFrags: string[] = []; const args: unknown[] = [];
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue;
    const col = COL[k]; if (!col) continue;
    args.push(v); setFrags.push(`${col} = $${args.length}`);
  }
  /* Manual override → mark mapping_source='manual' and confidence=1.0. */
  setFrags.push(`mapping_source = 'manual'`, `mapping_confidence = 1.00`);
  if (setFrags.length === 0) return clientError(res, 422, 'No updatable fields');
  args.push(fileId, jobId, orgId);
  try {
    const { rows } = await pool.query(
      `UPDATE import_job_files SET ${setFrags.join(', ')}
        WHERE id = $${args.length - 2} AND import_job_id = $${args.length - 1}
          AND organization_id = $${args.length}
        RETURNING *`,
      args,
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Import file');
    return ok(res, rows[0]);
  } catch (err) { return serverError(res, log, 'patch-file', err); }
});

/* ─── POST /imports/:id/approve — materialize artifacts ───── */

router.post('/imports/:id/approve', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  const userId = getUserId(req);
  if (orgId === null) return orgRequired(res);
  if (userId === null) return clientError(res, 401, 'User context required');
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');

  const projectId = typeof req.body?.projectId === 'number' ? req.body.projectId : null;
  if (projectId === null) {
    return clientError(res, 422, 'projectId (number) is required so artifacts can be attached');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const own = await client.query<{ status: string }>(
      `SELECT status FROM import_jobs WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
      [id, orgId],
    );
    if (own.rows.length === 0) {
      await client.query('ROLLBACK');
      return notFoundInTenant(res, 'Import job');
    }
    if (own.rows[0].status !== 'ready_for_review') {
      await client.query('ROLLBACK');
      return clientError(res, 409, `Import is not in ready_for_review state (current: ${own.rows[0].status})`);
    }
    await client.query(
      `UPDATE import_jobs SET status = 'approving', updated_at = NOW() WHERE id = $1`,
      [id],
    );

    /* For every file with status='mapped', insert a concept2cure_artifact
       row pointing at the imported leaf. Tenant + project on the new row.
       Artifact title comes from the mapped artifact_kind or file name. */
    const files = await client.query<{
      id: number; relative_path: string; file_name: string;
      mapped_ctd_section: string | null; mapped_artifact_kind: string | null;
      sha256: string | null;
    }>(
      `SELECT id, relative_path, file_name, mapped_ctd_section,
              mapped_artifact_kind, sha256
         FROM import_job_files
        WHERE import_job_id = $1 AND status = 'mapped'`,
      [id],
    );
    let created = 0;
    for (const f of files.rows) {
      try {
        const artifactRes = await client.query<{ id: number }>(
          `INSERT INTO concept2cure_artifacts (
             artifact_id, project_id, organization_id, type, category, title,
             content, content_hash, ctd_section, status, created_by_id, metadata
           ) VALUES (
             $1, $2, $3, 'imported', 'document', $4, '', $5, $6, 'draft', $7,
             jsonb_build_object('importJobId', $8, 'sourcePath', $9, 'artifactKind', $10)
           )
           RETURNING id`,
          [
            `import-${id}-${f.id}`, projectId, orgId,
            f.mapped_artifact_kind ? f.mapped_artifact_kind.replace(/_/g, ' ') + ' — ' + f.file_name : f.file_name,
            f.sha256, f.mapped_ctd_section, userId,
            id, f.relative_path, f.mapped_artifact_kind,
          ],
        );
        await client.query(
          `UPDATE import_job_files SET artifact_id = $1, status = 'imported' WHERE id = $2`,
          [artifactRes.rows[0].id, f.id],
        );
        created++;
      } catch (innerErr: unknown) {
        await client.query(
          `UPDATE import_job_files SET status = 'error', error_message = $1 WHERE id = $2`,
          [innerErr instanceof Error ? innerErr.message : String(innerErr), f.id],
        );
      }
    }

    await client.query(
      `UPDATE import_jobs
          SET status = 'completed',
              approved_by = $2,
              approved_at = NOW(),
              artifacts_created = $3,
              updated_at = NOW()
        WHERE id = $1`,
      [id, userId, created],
    );
    await client.query('COMMIT');
    const { rows } = await pool.query(
      `SELECT * FROM import_jobs WHERE id = $1`, [id],
    );
    return ok(res, rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return serverError(res, log, 'approve', err);
  } finally {
    client.release();
  }
});

/* ─── POST /imports/:id/cancel ───────────────────────────── */

router.post('/imports/:id/cancel', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  try {
    const { rows } = await pool.query(
      `UPDATE import_jobs
          SET status = 'cancelled', updated_at = NOW()
        WHERE id = $1 AND organization_id = $2
          AND status IN ('pending', 'detecting', 'ready_for_review')
        RETURNING *`,
      [id, orgId],
    );
    if (rows.length === 0) {
      return clientError(res, 409, 'Import not found, or not cancellable in current state');
    }
    return ok(res, rows[0]);
  } catch (err) { return serverError(res, log, 'cancel', err); }
});

/* ─── POST /imports/:id/findings/:findingId/resolve ──────── */

router.post('/imports/:id/findings/:findingId/resolve', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const findingId = Number(req.params.findingId);
  if (!Number.isFinite(findingId)) return clientError(res, 422, 'findingId must be numeric');
  const note = typeof req.body?.resolutionNote === 'string' ? req.body.resolutionNote : null;
  try {
    const { rows } = await pool.query(
      `UPDATE import_job_findings
          SET resolved = true, resolution_note = $3
        WHERE id = $1 AND organization_id = $2
        RETURNING *`,
      [findingId, orgId, note],
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Finding');
    return ok(res, rows[0]);
  } catch (err) { return serverError(res, log, 'resolve-finding', err); }
});

export default router;
