/**
 * IVDR Evidence Binder + Pack Builder Routes
 *
 * Provides:
 *   1. Evidence Binder CRUD (claims + evidence links + approval flow)
 *   2. Pack Build (job queue + readiness check + history + details + download)
 *   3. Audit event emission for every mutation
 *
 * All endpoints enforce:
 *   - Server-derived org (never from client)
 *   - Permission-gated (ivdr:read / ivdr:write / ivdr:approve / ivdr:export)
 *   - Append-only audit trail
 *   - Soft-delete for evidence (removed_at, not DELETE)
 *
 * @module routes/ivdr-binder-routes
 * @version 1.0.0
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { streamVersion } from '../services/vaultService';

export default function createIVDRBinderRoutes(pool: Pool): Router {
  const router = Router();

  // ── Server-side org extraction ─────────────────────────────────────────────
  function getServerOrgId(req: Request): number {
    const fromTenant = (req as any).tenantId;
    const fromContext = (req as any).tenantContext?.organizationId;
    const orgId = fromTenant || fromContext;
    if (!orgId) {
      throw new Error('IVDR_NO_TENANT: organization context is missing from session');
    }
    const n = typeof orgId === 'string' ? Number(orgId) : orgId;
    if (!Number.isInteger(n) || n <= 0) {
      throw new Error('IVDR_BAD_TENANT: invalid organization ID in session');
    }
    return n;
  }

  function getUserId(req: Request): string {
    return (req as any).userId || (req as any).user?.id || 'system';
  }

  // ── Safe error response ────────────────────────────────────────────────────
  function safeError(res: Response, error: any, code: string, label: string): Response {
    if (error?.code === '42P01') {
      console.warn(`[IVDR-Binder] ${label}: table not found — denying until migrated`);
      return res.status(503).json({
        error: 'IVDR tables not yet provisioned — run migrations',
        code: 'IVDR_NOT_PROVISIONED',
      });
    }
    if (error?.message?.includes('IVDR_BAD_TENANT')) {
      return res
        .status(403)
        .json({ error: 'Invalid organization context', code: 'IVDR_BAD_TENANT' });
    }
    if (error?.message?.includes('IVDR_NO_TENANT')) {
      return res
        .status(403)
        .json({ error: 'Organization context required', code: 'IVDR_NO_TENANT' });
    }
    console.error(`[IVDR-Binder] ${label}:`, error);
    return res.status(500).json({ error: `${label} failed`, code });
  }

  // ── Permission helpers ─────────────────────────────────────────────────────
  function requirePerm(
    req: Request,
    res: Response,
    perm: string,
    code: string,
    label: string
  ): boolean {
    const perms: Set<string> = (req as any).ivdrPermissions || new Set();
    if (!perms.has('*') && !perms.has(perm)) {
      res.status(403).json({ error: label, code });
      return false;
    }
    return true;
  }

  // ── Audit event emitter ────────────────────────────────────────────────────
  async function emitAuditEvent(
    req: Request,
    orgId: number,
    projectId: string,
    userId: string,
    eventType: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    try {
      const userName =
        (req as any).user?.displayName ||
        (req as any).user?.username ||
        (req as any).user?.email ||
        userId;
      const numericUserId = Number(userId) || 0;
      const now = new Date();
      await pool.query(
        `INSERT INTO audit_events
           (organization_id, event_type, entity_type, entity_id, user_id, user_name, metadata, "timestamp", created_at)
         VALUES ($1, $2, 'ivdr_binder', 0, $3, $4, $5::json, $6, $6)`,
        [orgId, eventType, numericUserId, userName, JSON.stringify({ ...payload, projectId }), now]
      );
    } catch (err) {
      // Audit failures are logged but never block the primary operation
      console.error(`[IVDR-Binder] Audit emit failed for ${eventType}:`, err);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // EVIDENCE BINDER — CLAIMS
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/ivdr/binder
   * List all claims + evidence for a project.
   * Requires: ivdr:read
   */
  router.get('/binder', async (req: Request, res: Response) => {
    try {
      const orgId = getServerOrgId(req);
      const projectId = req.query.projectId as string;
      if (!projectId) {
        return res
          .status(400)
          .json({ error: 'projectId query parameter is required', code: 'BINDER_INVALID_INPUT' });
      }

      const claimsResult = await pool.query(
        `SELECT id, claim_key, title, description, status, required_for_pack,
                pack_scope, owner_user_id, approved_at, approved_by_user_id,
                approval_reason, updated_at
         FROM ivdr_binder_claims
         WHERE organization_id = $1 AND project_id = $2
         ORDER BY created_at ASC`,
        [orgId, projectId]
      );

      // Fetch evidence for all claims in one query
      const claimIds = claimsResult.rows.map((r: any) => r.id);
      let evidenceRows: any[] = [];
      if (claimIds.length > 0) {
        const evidenceResult = await pool.query(
          `SELECT id, claim_id, vault_file_id, vault_version_id,
                  excerpt_start, excerpt_end, excerpt_hash_sha256, excerpt_preview,
                  notes, removed_at
           FROM ivdr_binder_evidence
           WHERE claim_id = ANY($1)
           ORDER BY created_at ASC`,
          [claimIds]
        );
        evidenceRows = evidenceResult.rows;
      }

      // Group evidence by claim
      const evidenceByClaimId = new Map<string, any[]>();
      for (const ev of evidenceRows) {
        const list = evidenceByClaimId.get(ev.claim_id) || [];
        list.push({
          id: ev.id,
          vaultFileId: ev.vault_file_id,
          vaultVersionId: ev.vault_version_id,
          excerptStart: ev.excerpt_start,
          excerptEnd: ev.excerpt_end,
          excerptHashSha256: ev.excerpt_hash_sha256,
          excerptPreview: ev.excerpt_preview,
          notes: ev.notes,
          removedAt: ev.removed_at,
        });
        evidenceByClaimId.set(ev.claim_id, list);
      }

      const claims = claimsResult.rows.map((row: any) => ({
        id: row.id,
        claimKey: row.claim_key,
        title: row.title,
        description: row.description,
        status: row.status,
        requiredForPack: row.required_for_pack,
        packScope: row.pack_scope,
        ownerUserId: row.owner_user_id,
        approvedAt: row.approved_at,
        approvedByUserId: row.approved_by_user_id,
        approvalReason: row.approval_reason,
        updatedAt: row.updated_at,
        evidence: evidenceByClaimId.get(row.id) || [],
      }));

      return res.json({ projectId, claims });
    } catch (error) {
      return safeError(res, error, 'BINDER_LIST_FAILED', 'List binder claims');
    }
  });

  /**
   * POST /api/ivdr/binder/claim
   * Create or update a binder claim.
   * Requires: ivdr:write
   */
  router.post('/binder/claim', async (req: Request, res: Response) => {
    try {
      if (
        !requirePerm(
          req,
          res,
          'ivdr:write',
          'IVDR_WRITE_DENIED',
          'Binder write requires ivdr:write'
        )
      )
        return;

      const orgId = getServerOrgId(req);
      const userId = getUserId(req);
      const {
        projectId,
        claimKey,
        title,
        description,
        requiredForPack = false,
        packScope = 'IVDR_TECHDOC',
        ownerUserId,
        status = 'DRAFT',
      } = req.body;

      if (!projectId) {
        return res
          .status(400)
          .json({ error: 'projectId is required', code: 'BINDER_INVALID_INPUT' });
      }

      if (!claimKey || !title) {
        return res
          .status(400)
          .json({ error: 'claimKey and title are required', code: 'BINDER_INVALID_INPUT' });
      }

      // Upsert: if claim_key already exists for this org+project, update it
      const result = await pool.query(
        `INSERT INTO ivdr_binder_claims
           (organization_id, project_id, claim_key, title, description,
            status, required_for_pack, pack_scope, owner_user_id,
            created_by_user_id, updated_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
         ON CONFLICT (organization_id, project_id, claim_key) DO UPDATE SET
           title = EXCLUDED.title,
           description = EXCLUDED.description,
           status = CASE
             WHEN ivdr_binder_claims.status = 'APPROVED' THEN ivdr_binder_claims.status
             ELSE EXCLUDED.status
           END,
           required_for_pack = EXCLUDED.required_for_pack,
           pack_scope = EXCLUDED.pack_scope,
           owner_user_id = EXCLUDED.owner_user_id,
           updated_at = now(),
           updated_by_user_id = EXCLUDED.updated_by_user_id
         RETURNING id, (xmax = 0) AS is_insert`,
        [
          orgId,
          projectId,
          claimKey,
          title,
          description || null,
          status,
          requiredForPack,
          packScope,
          ownerUserId || null,
          userId,
        ]
      );

      const claimId = result.rows[0].id;
      const isNew = result.rows[0].is_insert;

      await emitAuditEvent(
        req,
        orgId,
        projectId,
        userId,
        isNew ? 'BINDER_CLAIM_CREATED' : 'BINDER_CLAIM_UPDATED',
        {
          claimId,
          claimKey,
          title,
          status,
          requiredForPack,
        }
      );

      return res.json({ claimId });
    } catch (error) {
      return safeError(res, error, 'BINDER_CLAIM_UPSERT_FAILED', 'Create/update binder claim');
    }
  });

  /**
   * POST /api/ivdr/binder/claim/:claimId/evidence
   * Attach evidence (vault doc + optional excerpt) to a claim.
   * Requires: ivdr:write
   */
  router.post('/binder/claim/:claimId/evidence', async (req: Request, res: Response) => {
    try {
      if (
        !requirePerm(
          req,
          res,
          'ivdr:write',
          'IVDR_WRITE_DENIED',
          'Evidence attach requires ivdr:write'
        )
      )
        return;

      const orgId = getServerOrgId(req);
      const userId = getUserId(req);
      const { claimId } = req.params;
      const {
        projectId,
        vaultFileId,
        vaultVersionId,
        excerptStart,
        excerptEnd,
        excerptHashSha256,
        excerptPreview,
        notes,
      } = req.body;

      if (!vaultFileId || !vaultVersionId) {
        return res.status(400).json({
          error: 'vaultFileId and vaultVersionId are required',
          code: 'BINDER_INVALID_INPUT',
        });
      }

      // Verify claim exists and belongs to this org
      const claimCheck = await pool.query(
        `SELECT id FROM ivdr_binder_claims WHERE id = $1 AND organization_id = $2`,
        [claimId, orgId]
      );
      if (claimCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Claim not found', code: 'BINDER_CLAIM_NOT_FOUND' });
      }

      const result = await pool.query(
        `INSERT INTO ivdr_binder_evidence
           (organization_id, project_id, claim_id, vault_file_id, vault_version_id,
            excerpt_start, excerpt_end, excerpt_hash_sha256, excerpt_preview,
            notes, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id`,
        [
          orgId,
          projectId,
          claimId,
          vaultFileId,
          vaultVersionId,
          excerptStart ?? null,
          excerptEnd ?? null,
          excerptHashSha256 || null,
          excerptPreview || null,
          notes || null,
          userId,
        ]
      );

      const evidenceId = result.rows[0].id;

      await emitAuditEvent(req, orgId, projectId, userId, 'BINDER_EVIDENCE_ATTACHED', {
        claimId,
        evidenceId,
        vaultFileId,
        vaultVersionId,
        hasExcerpt: !!(excerptStart !== undefined && excerptEnd !== undefined),
      });

      return res.json({ evidenceId });
    } catch (error) {
      return safeError(res, error, 'BINDER_EVIDENCE_ATTACH_FAILED', 'Attach evidence');
    }
  });

  /**
   * POST /api/ivdr/binder/evidence/:evidenceId/remove
   * Soft-delete evidence (marks removed_at, never physical delete).
   * Requires: ivdr:write
   */
  router.post('/binder/evidence/:evidenceId/remove', async (req: Request, res: Response) => {
    try {
      if (
        !requirePerm(
          req,
          res,
          'ivdr:write',
          'IVDR_WRITE_DENIED',
          'Evidence removal requires ivdr:write'
        )
      )
        return;

      const orgId = getServerOrgId(req);
      const userId = getUserId(req);
      const { evidenceId } = req.params;
      const { projectId, reason } = req.body;

      if (!projectId) {
        return res
          .status(400)
          .json({ error: 'projectId is required', code: 'BINDER_INVALID_INPUT' });
      }

      if (!reason) {
        return res
          .status(400)
          .json({ error: 'Removal reason is required', code: 'BINDER_INVALID_INPUT' });
      }

      const result = await pool.query(
        `UPDATE ivdr_binder_evidence
         SET removed_at = NOW(), removed_by_user_id = $3, removal_reason = $4
         WHERE id = $1 AND organization_id = $2 AND removed_at IS NULL
         RETURNING claim_id`,
        [evidenceId, orgId, userId, reason]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'Evidence not found or already removed',
          code: 'BINDER_EVIDENCE_NOT_FOUND',
        });
      }

      await emitAuditEvent(req, orgId, projectId, userId, 'BINDER_EVIDENCE_REMOVED', {
        evidenceId,
        claimId: result.rows[0].claim_id,
        reason,
      });

      return res.json({ ok: true });
    } catch (error) {
      return safeError(res, error, 'BINDER_EVIDENCE_REMOVE_FAILED', 'Remove evidence');
    }
  });

  /**
   * POST /api/ivdr/binder/claim/:claimId/approve
   * Approve a binder claim (requires evidence + ivdr:approve).
   */
  router.post('/binder/claim/:claimId/approve', async (req: Request, res: Response) => {
    try {
      if (
        !requirePerm(
          req,
          res,
          'ivdr:approve',
          'IVDR_APPROVE_DENIED',
          'Claim approval requires ivdr:approve'
        )
      )
        return;

      const orgId = getServerOrgId(req);
      const userId = getUserId(req);
      const { claimId } = req.params;
      const { projectId, reason } = req.body;

      if (!projectId) {
        return res
          .status(400)
          .json({ error: 'projectId is required', code: 'BINDER_INVALID_INPUT' });
      }

      // Check evidence exists (at least 1 non-removed)
      const evidenceCheck = await pool.query(
        `SELECT COUNT(*) AS cnt FROM ivdr_binder_evidence
         WHERE claim_id = $1 AND organization_id = $2 AND removed_at IS NULL`,
        [claimId, orgId]
      );
      const evidenceCount = parseInt(evidenceCheck.rows[0].cnt, 10);
      if (evidenceCount === 0) {
        return res.status(409).json({
          error: 'Cannot approve a claim with no evidence attached',
          code: 'BINDER_NO_EVIDENCE',
        });
      }

      const result = await pool.query(
        `UPDATE ivdr_binder_claims
         SET status = 'APPROVED', approved_at = NOW(), approved_by_user_id = $3,
             approval_reason = $4, updated_at = NOW(), updated_by_user_id = $3
         WHERE id = $1 AND organization_id = $2
         RETURNING claim_key`,
        [claimId, orgId, userId, reason || null]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Claim not found', code: 'BINDER_CLAIM_NOT_FOUND' });
      }

      await emitAuditEvent(req, orgId, projectId, userId, 'BINDER_CLAIM_APPROVED', {
        claimId,
        claimKey: result.rows[0].claim_key,
        reason,
        evidenceCount,
      });

      return res.json({ ok: true, status: 'APPROVED', approvedAt: new Date().toISOString() });
    } catch (error) {
      return safeError(res, error, 'BINDER_APPROVE_FAILED', 'Approve claim');
    }
  });

  /**
   * POST /api/ivdr/binder/claim/:claimId/revoke
   * Revoke approval (moves back to IN_REVIEW). Requires ivdr:approve.
   */
  router.post('/binder/claim/:claimId/revoke', async (req: Request, res: Response) => {
    try {
      if (
        !requirePerm(
          req,
          res,
          'ivdr:approve',
          'IVDR_APPROVE_DENIED',
          'Claim revocation requires ivdr:approve'
        )
      )
        return;

      const orgId = getServerOrgId(req);
      const userId = getUserId(req);
      const { claimId } = req.params;
      const { projectId, reason } = req.body;

      if (!projectId) {
        return res
          .status(400)
          .json({ error: 'projectId is required', code: 'BINDER_INVALID_INPUT' });
      }

      if (!reason) {
        return res
          .status(400)
          .json({ error: 'Revocation reason is required', code: 'BINDER_INVALID_INPUT' });
      }

      const result = await pool.query(
        `UPDATE ivdr_binder_claims
         SET status = 'IN_REVIEW', approved_at = NULL, approved_by_user_id = NULL,
             approval_reason = NULL, updated_at = NOW(), updated_by_user_id = $3
         WHERE id = $1 AND organization_id = $2 AND status = 'APPROVED'
         RETURNING claim_key`,
        [claimId, orgId, userId]
      );

      if (result.rows.length === 0) {
        return res
          .status(404)
          .json({ error: 'Claim not found or not approved', code: 'BINDER_NOT_APPROVED' });
      }

      await emitAuditEvent(req, orgId, projectId, userId, 'BINDER_CLAIM_REVOKED', {
        claimId,
        claimKey: result.rows[0].claim_key,
        reason,
      });

      return res.json({ ok: true, status: 'IN_REVIEW' });
    } catch (error) {
      return safeError(res, error, 'BINDER_REVOKE_FAILED', 'Revoke claim');
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // PACK BUILD — READINESS + JOBS + HISTORY + DETAILS + DOWNLOAD
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/ivdr/packs/readiness
   * Check if a project is ready for pack build.
   */
  router.get('/packs/readiness', async (req: Request, res: Response) => {
    try {
      const orgId = getServerOrgId(req);
      const projectId = req.query.projectId as string;
      if (!projectId) {
        return res
          .status(400)
          .json({ error: 'projectId query parameter is required', code: 'BINDER_INVALID_INPUT' });
      }
      const packType = (req.query.packType as string) || 'IVDR_TECHDOC';

      // Get required claims for this pack type
      const claimsResult = await pool.query(
        `SELECT id, claim_key, title, status, required_for_pack
         FROM ivdr_binder_claims
         WHERE organization_id = $1 AND project_id = $2
           AND required_for_pack = TRUE
           AND (pack_scope = $3 OR pack_scope = 'BOTH')
         ORDER BY created_at ASC`,
        [orgId, projectId, packType]
      );

      const requiredClaims = claimsResult.rows;
      const approvedCount = requiredClaims.filter((c: any) => c.status === 'APPROVED').length;
      const blockedCount = requiredClaims.filter((c: any) => c.status === 'BLOCKED').length;

      const reasons: Array<{ code: string; claimKey: string }> = [];
      for (const claim of requiredClaims) {
        if (claim.status !== 'APPROVED') {
          reasons.push({
            code: claim.status === 'BLOCKED' ? 'BINDER_CLAIM_BLOCKED' : 'BINDER_CLAIM_NOT_APPROVED',
            claimKey: claim.claim_key,
          });
        }
      }

      // Check if any required claims have evidence
      for (const claim of requiredClaims) {
        if (claim.status === 'APPROVED') {
          const evCheck = await pool.query(
            `SELECT COUNT(*) AS cnt FROM ivdr_binder_evidence
             WHERE claim_id = $1 AND removed_at IS NULL`,
            [claim.id]
          );
          if (parseInt(evCheck.rows[0].cnt, 10) === 0) {
            reasons.push({ code: 'MISSING_EVIDENCE', claimKey: claim.claim_key });
          }
        }
      }

      return res.json({
        projectId,
        packType,
        ready: reasons.length === 0 && requiredClaims.length > 0,
        reasons,
        requiredClaims: { total: requiredClaims.length, approved: approvedCount },
        blockedClaims: blockedCount,
      });
    } catch (error) {
      return safeError(res, error, 'PACK_READINESS_FAILED', 'Check pack readiness');
    }
  });

  /**
   * POST /api/ivdr/packs/build
   * Queue a pack build job. Requires ivdr:export.
   * Returns 202 with jobId.
   */
  router.post('/packs/build', async (req: Request, res: Response) => {
    try {
      if (
        !requirePerm(
          req,
          res,
          'ivdr:export',
          'IVDR_EXPORT_DENIED',
          'Pack build requires ivdr:export'
        )
      )
        return;

      const orgId = getServerOrgId(req);
      const userId = getUserId(req);
      const {
        projectId,
        packType = 'IVDR_TECHDOC',
        outputs = ['MANIFEST'],
        useLatestApprovedOnly = true,
        signBuild = false,
      } = req.body;

      if (!projectId) {
        return res
          .status(400)
          .json({ error: 'projectId is required', code: 'BINDER_INVALID_INPUT' });
      }

      // Insert job
      const result = await pool.query(
        `INSERT INTO ivdr_pack_build_jobs
           (organization_id, project_id, pack_type, requested_by_user_id,
            outputs, use_latest_approved, sign_build)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
         RETURNING id`,
        [
          orgId,
          projectId,
          packType,
          userId,
          JSON.stringify(outputs),
          useLatestApprovedOnly,
          signBuild,
        ]
      );

      const jobId = result.rows[0].id;

      await emitAuditEvent(req, orgId, projectId, userId, 'PACK_BUILD_REQUESTED', {
        jobId,
        packType,
        outputs,
        useLatestApprovedOnly,
      });

      return res.status(202).json({ jobId, status: 'QUEUED' });
    } catch (error) {
      return safeError(res, error, 'PACK_BUILD_QUEUE_FAILED', 'Queue pack build');
    }
  });

  /**
   * GET /api/ivdr/packs/build/jobs/:jobId
   * Poll job status.
   */
  router.get('/packs/build/jobs/:jobId', async (req: Request, res: Response) => {
    try {
      const orgId = getServerOrgId(req);
      const { jobId } = req.params;

      const result = await pool.query(
        `SELECT id, project_id, pack_type, status,
                requested_at, started_at, completed_at,
                output_pack_id, error_code, error_label
         FROM ivdr_pack_build_jobs
         WHERE id = $1 AND organization_id = $2`,
        [jobId, orgId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Job not found', code: 'PACK_JOB_NOT_FOUND' });
      }

      const job = result.rows[0];
      return res.json({
        jobId: job.id,
        projectId: job.project_id,
        packType: job.pack_type,
        status: job.status,
        requestedAt: job.requested_at,
        startedAt: job.started_at,
        completedAt: job.completed_at,
        outputPackId: job.output_pack_id,
        error: job.error_code ? { code: job.error_code, label: job.error_label } : null,
      });
    } catch (error) {
      return safeError(res, error, 'PACK_JOB_STATUS_FAILED', 'Get job status');
    }
  });

  /**
   * GET /api/ivdr/packs
   * List pack history for a project.
   */
  router.get('/packs', async (req: Request, res: Response) => {
    try {
      const orgId = getServerOrgId(req);
      const projectId = req.query.projectId as string;
      if (!projectId) {
        return res
          .status(400)
          .json({ error: 'projectId query parameter is required', code: 'BINDER_INVALID_INPUT' });
      }
      const packType = req.query.packType as string;

      let query = `SELECT id, pack_type, pack_version, status, created_at,
                          created_by_user_id, manifest_hash_sha256, snapshot_hash_sha256,
                          manifest_vault_file_id, pdf_vault_file_id, docx_vault_file_id, zip_vault_file_id,
                          has_warnings, warnings_jsonb
                   FROM ivdr_packs
                   WHERE organization_id = $1 AND project_id = $2`;
      const params: any[] = [orgId, projectId];

      if (packType) {
        query += ` AND pack_type = $3`;
        params.push(packType);
      }

      query += ' ORDER BY pack_version DESC';

      const result = await pool.query(query, params);

      const packs = result.rows.map((row: any) => ({
        packId: row.id,
        packType: row.pack_type,
        packVersion: row.pack_version,
        status: row.status,
        createdAt: row.created_at,
        createdByUserId: row.created_by_user_id,
        manifestHashSha256: row.manifest_hash_sha256,
        snapshotHashSha256: row.snapshot_hash_sha256,
        hasWarnings: row.has_warnings || false,
        warnings: row.warnings_jsonb || null,
        downloads: {
          manifest: !!row.manifest_vault_file_id,
          pdf: !!row.pdf_vault_file_id,
          docx: !!row.docx_vault_file_id,
          zip: !!row.zip_vault_file_id,
        },
      }));

      return res.json({ projectId, packs });
    } catch (error) {
      return safeError(res, error, 'PACK_LIST_FAILED', 'List packs');
    }
  });

  /**
   * GET /api/ivdr/packs/:packId
   * Pack details (includes snapshot + artifacts).
   */
  router.get('/packs/:packId', async (req: Request, res: Response) => {
    try {
      const orgId = getServerOrgId(req);
      const { packId } = req.params;

      const packResult = await pool.query(
        `SELECT id, pack_type, pack_version, status, created_at,
                manifest_hash_sha256, snapshot_hash_sha256,
                manifest_vault_file_id, manifest_vault_version_id,
                pdf_vault_file_id, pdf_vault_version_id,
                docx_vault_file_id, docx_vault_version_id,
                zip_vault_file_id, zip_vault_version_id,
                has_warnings, warnings_jsonb,
                manifest_sha256, manifest_size_bytes,
                pdf_sha256, pdf_size_bytes,
                docx_sha256, docx_size_bytes,
                zip_sha256, zip_size_bytes
         FROM ivdr_packs
         WHERE id = $1 AND organization_id = $2`,
        [packId, orgId]
      );

      if (packResult.rows.length === 0) {
        return res.status(404).json({ error: 'Pack not found', code: 'PACK_NOT_FOUND' });
      }

      const pack = packResult.rows[0];

      // Get snapshot
      const snapResult = await pool.query(
        `SELECT snapshot_json, snapshot_hash_sha256
         FROM ivdr_pack_snapshots
         WHERE pack_id = $1`,
        [packId]
      );

      const artifacts: Array<{
        type: string;
        vaultFileId: string | null;
        vaultVersionId: string | null;
        hashSha256: string;
        sizeBytes: number | null;
      }> = [];
      if (pack.pdf_vault_file_id)
        artifacts.push({
          type: 'PDF',
          vaultFileId: pack.pdf_vault_file_id,
          vaultVersionId: pack.pdf_vault_version_id,
          hashSha256: pack.pdf_sha256 || '',
          sizeBytes: pack.pdf_size_bytes ? Number(pack.pdf_size_bytes) : null,
        });
      if (pack.docx_vault_file_id)
        artifacts.push({
          type: 'DOCX',
          vaultFileId: pack.docx_vault_file_id,
          vaultVersionId: pack.docx_vault_version_id,
          hashSha256: pack.docx_sha256 || '',
          sizeBytes: pack.docx_size_bytes ? Number(pack.docx_size_bytes) : null,
        });
      if (pack.zip_vault_file_id)
        artifacts.push({
          type: 'ZIP',
          vaultFileId: pack.zip_vault_file_id,
          vaultVersionId: pack.zip_vault_version_id,
          hashSha256: pack.zip_sha256 || '',
          sizeBytes: pack.zip_size_bytes ? Number(pack.zip_size_bytes) : null,
        });

      return res.json({
        packId: pack.id,
        packType: pack.pack_type,
        packVersion: pack.pack_version,
        status: pack.status,
        createdAt: pack.created_at,
        hasWarnings: pack.has_warnings || false,
        warnings: pack.warnings_jsonb || null,
        manifest: {
          vaultFileId: pack.manifest_vault_file_id,
          vaultVersionId: pack.manifest_vault_version_id,
          hashSha256: pack.manifest_hash_sha256,
          sha256: pack.manifest_sha256 || null,
          sizeBytes: pack.manifest_size_bytes ? Number(pack.manifest_size_bytes) : null,
        },
        artifacts,
        snapshot:
          snapResult.rows.length > 0
            ? {
                snapshotHashSha256: snapResult.rows[0].snapshot_hash_sha256,
                snapshotJson: snapResult.rows[0].snapshot_json,
              }
            : null,
      });
    } catch (error) {
      return safeError(res, error, 'PACK_DETAIL_FAILED', 'Get pack details');
    }
  });

  /**
   * GET /api/ivdr/packs/:packId/download
   * Download pack artifact (logs audit event).
   * Query params: format=pdf|docx|zip|manifest
   * Requires: ivdr:read
   */
  router.get('/packs/:packId/download', async (req: Request, res: Response) => {
    try {
      const orgId = getServerOrgId(req);
      const userId = getUserId(req);
      const { packId } = req.params;
      const format = (req.query.format as string) || 'manifest';

      const packResult = await pool.query(
        `SELECT id, project_id, pack_type, pack_version, status,
                manifest_hash_sha256, snapshot_hash_sha256,
                manifest_vault_version_id,
                pdf_vault_version_id,
                docx_vault_version_id,
                zip_vault_version_id
         FROM ivdr_packs
         WHERE id = $1 AND organization_id = $2`,
        [packId, orgId]
      );

      if (packResult.rows.length === 0) {
        return res.status(404).json({ error: 'Pack not found', code: 'PACK_NOT_FOUND' });
      }

      const pack = packResult.rows[0];

      // Log download event
      await emitAuditEvent(req, orgId, pack.project_id, userId, 'PACK_DOWNLOADED', {
        packId,
        packVersion: pack.pack_version,
        format,
      });

      // For now, return the manifest JSON from the snapshot
      if (format === 'manifest') {
        // Try vault first, fall back to snapshot table
        if (pack.manifest_vault_version_id) {
          const vaultResult = await streamVersion(pack.manifest_vault_version_id);
          if (vaultResult) {
            res.setHeader('Content-Type', vaultResult.mime);
            res.setHeader('Content-Length', String(vaultResult.sizeBytes));
            res.setHeader('Content-Disposition', `attachment; filename="${vaultResult.filename}"`);
            res.setHeader('X-Content-SHA256', vaultResult.sha256);
            return vaultResult.stream.pipe(res);
          }
        }

        const snapResult = await pool.query(
          `SELECT snapshot_json FROM ivdr_pack_snapshots WHERE pack_id = $1`,
          [packId]
        );

        if (snapResult.rows.length === 0) {
          return res
            .status(404)
            .json({ error: 'Manifest not available', code: 'PACK_NO_MANIFEST' });
        }

        res.setHeader('Content-Type', 'application/json');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="IVDR_Pack_v${pack.pack_version}_manifest.json"`
        );
        return res.send(JSON.stringify(snapResult.rows[0].snapshot_json, null, 2));
      }

      // PDF / DOCX / ZIP — stream from vault
      const vaultVersionMap: Record<string, string | null> = {
        pdf: pack.pdf_vault_version_id,
        docx: pack.docx_vault_version_id,
        zip: pack.zip_vault_version_id,
      };

      const vaultVersionId = vaultVersionMap[format];
      if (!vaultVersionId) {
        return res.status(404).json({
          error: `${format.toUpperCase()} artifact not yet generated for this pack`,
          code: 'PACK_ARTIFACT_NOT_AVAILABLE',
        });
      }

      const vaultResult = await streamVersion(vaultVersionId);
      if (!vaultResult) {
        return res.status(404).json({
          error: `${format.toUpperCase()} artifact file not found in vault`,
          code: 'PACK_ARTIFACT_MISSING',
        });
      }

      res.setHeader('Content-Type', vaultResult.mime);
      res.setHeader('Content-Length', String(vaultResult.sizeBytes));
      res.setHeader('Content-Disposition', `attachment; filename="${vaultResult.filename}"`);
      res.setHeader('X-Content-SHA256', vaultResult.sha256);
      return vaultResult.stream.pipe(res);
    } catch (error) {
      return safeError(res, error, 'PACK_DOWNLOAD_FAILED', 'Download pack');
    }
  });

  return router;
}
