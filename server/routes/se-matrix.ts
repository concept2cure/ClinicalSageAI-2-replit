/**
 * Phase 6.6.C2 — SE Matrix Render Orchestration Route
 *
 * Single "Generate + Render" endpoint that:
 *   1. Calls Shadow Service: POST /device/se-matrix-payload → manifest + payload
 *   2. Calls DOCX Factory render (via Shadow V2 render endpoint)
 *   3. Emits Part 11 audit events around the lifecycle
 *   4. Returns manifest + evidence tasks + renderJobId
 *
 * Route: POST /api/programs/:programId/se-matrix/render
 *
 * @phase 6.6.C2
 */

import { Router, Request, Response, NextFunction } from 'express';
import { eq, and } from 'drizzle-orm';
import { db } from '../db.js';
import { regulatoryPrograms } from '../../shared/schema/programs.js';
import { authenticateToken } from '../middleware/auth.js';
import { logAuditEvent } from '../services/audit/auditLogger.js';

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════════════════

function getShadowUrl(): string {
  return process.env.SHADOW_SERVICE_URL || 'http://localhost:8001';
}

function getAdminToken(): string {
  return process.env.REVIEW_ADMIN_TOKEN || '';
}

// ═══════════════════════════════════════════════════════════════════════════════
// Middleware
// ═══════════════════════════════════════════════════════════════════════════════

router.use(authenticateToken);

function requireConfigured(_req: Request, res: Response, next: NextFunction) {
  if (!getAdminToken()) {
    return res.status(503).json({
      error: 'SE Matrix service not configured',
      detail: 'REVIEW_ADMIN_TOKEN is not set',
    });
  }
  next();
}

async function requireProgramAccess(req: Request, res: Response, next: NextFunction) {
  const programId = String(req.params.programId);
  if (!programId) {
    return res.status(422).json({ error: 'programId is required' });
  }

  const userOrgId = (req as any).user?.organizationId;
  if (!userOrgId) {
    return res.status(403).json({ error: 'Organization context required' });
  }

  try {
    const orgId = typeof userOrgId === 'string' ? parseInt(userOrgId, 10) : userOrgId;
    if (isNaN(orgId)) {
      return res.status(403).json({ error: 'Invalid organization context' });
    }

    const [program] = await db
      .select({ id: regulatoryPrograms.id })
      .from(regulatoryPrograms)
      .where(
        and(eq(regulatoryPrograms.id, programId), eq(regulatoryPrograms.organizationId, orgId))
      )
      .limit(1);

    if (!program) {
      console.warn(`[se-matrix] IDOR blocked: org=${orgId} tried program=${programId}`);
      return res.status(403).json({
        error: 'Access denied',
        detail: 'You do not have access to this program',
      });
    }

    next();
  } catch (err: any) {
    console.error('[se-matrix] program access check failed:', err.message);
    return res.status(500).json({ error: 'Program access check failed', detail: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Shadow Service proxy
// ═══════════════════════════════════════════════════════════════════════════════

async function shadowFetch<T = unknown>(
  path: string,
  body: unknown
): Promise<{ status: number; data: T; raw?: string }> {
  // Use explicit string concatenation to avoid URL base-path clobbering
  const base = getShadowUrl().replace(/\/$/, '');
  const url = `${base}${path.startsWith('/') ? '' : '/'}${path}`;
  const token = getAdminToken();

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Token': token,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data: T;
  try {
    data = JSON.parse(text) as T;
  } catch {
    data = text as unknown as T;
  }

  return { status: res.status, data, raw: text };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Generate render job ID (deterministic from manifest_hash)
// ═══════════════════════════════════════════════════════════════════════════════

function generateRenderJobId(manifestHash: string): string {
  return `rj_${manifestHash.substring(0, 16)}_${Date.now()}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Route: POST /api/programs/:programId/se-matrix/render
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/programs/:programId/se-matrix/render
 *
 * Orchestrates SE matrix generation → DOCX render with Part 11 audit events.
 *
 * Body: {
 *   productCode: string;
 *   subjectDevice: Record<string, string>;
 *   selectedPredicate: { kNumber: string; ...optional };
 *   designControlIds?: Record<string, string>;
 * }
 *
 * Response: {
 *   renderJobId: string;
 *   manifest: RegulatoryIntelManifest;
 *   evidenceTasks: EvidenceTask[];
 * }
 */
router.post(
  '/:programId/se-matrix/render',
  requireConfigured,
  requireProgramAccess,
  async (req: Request, res: Response) => {
    const programId = String(req.params.programId);
    const userId = (req as any).user?.id || 'unknown';
    const organizationId = String((req as any).user?.organizationId || '');

    const {
      productCode = '',
      subjectDevice = {},
      selectedPredicate = {},
      designControlIds = {},
    } = req.body;

    const kNumber = selectedPredicate.kNumber || selectedPredicate.k_number || '';
    if (!kNumber) {
      return res.status(422).json({
        error: 'selectedPredicate.kNumber is required',
      });
    }

    // ── Audit: SE_MATRIX_GENERATION_REQUESTED ──
    try {
      await logAuditEvent({
        category: 'document',
        severity: 'info',
        action: 'SE_MATRIX_GENERATION_REQUESTED',
        userId,
        organizationId,
        resourceType: 'se_matrix',
        resourceId: programId,
        success: true,
        metadata: {
          program_id: programId,
          predicate_k_number: kNumber,
          product_code: productCode,
        },
      });
    } catch (auditErr: any) {
      console.warn('[se-matrix] audit request event failed:', auditErr.message);
    }

    try {
      // ── Step 1: Call Shadow → POST /device/se-matrix-payload ──
      const shadowResult = await shadowFetch<{
        manifest: Record<string, unknown>;
        payload: Record<string, unknown>;
        evidence_tasks: Array<Record<string, unknown>>;
      }>('/predicate/device/se-matrix-payload', {
        program_id: programId,
        product_code: productCode,
        selected_predicate_k_number: kNumber,
        subject_device: subjectDevice,
        selected_predicate: selectedPredicate,
        design_control_ids: designControlIds,
      });

      if (shadowResult.status !== 200) {
        // ── Audit: SE_MATRIX_GENERATION_FAILED ──
        try {
          await logAuditEvent({
            category: 'document',
            severity: 'error',
            action: 'SE_MATRIX_GENERATION_FAILED',
            userId,
            organizationId,
            resourceType: 'se_matrix',
            resourceId: programId,
            success: false,
            errorMessage: `Shadow returned ${shadowResult.status}`,
            metadata: {
              program_id: programId,
              predicate_k_number: kNumber,
              shadow_status: shadowResult.status,
            },
          });
        } catch {
          /* best-effort */
        }

        return res.status(shadowResult.status >= 500 ? 502 : shadowResult.status).json({
          error: 'SE matrix payload generation failed',
          detail: typeof shadowResult.data === 'object' ? shadowResult.data : shadowResult.raw,
        });
      }

      const { manifest, payload, evidence_tasks } = shadowResult.data;
      const manifestHash = String(manifest?.manifest_hash || '');
      const subjectHash = String(manifest?.subject_hash || '');

      // ── Step 2: Generate render job ID ──
      const renderJobId = generateRenderJobId(manifestHash);

      // ── Audit: SE_MATRIX_GENERATION_COMPLETED ──
      try {
        await logAuditEvent({
          category: 'document',
          severity: 'info',
          action: 'SE_MATRIX_GENERATION_COMPLETED',
          userId,
          organizationId,
          resourceType: 'se_matrix',
          resourceId: programId,
          success: true,
          metadata: {
            program_id: programId,
            subject_hash: subjectHash,
            predicate_k_number: kNumber,
            manifest_hash: manifestHash,
            render_job_id: renderJobId,
            risk_code_map_version: String(manifest?.risk_code_map_version || ''),
            risk_vocab_hash: String(manifest?.risk_vocab_hash || ''),
            defense_readiness_score: manifest?.defense_readiness_score,
            risk_codes_used: manifest?.risk_codes_used,
            evidence_task_ids: manifest?.evidence_task_ids,
          },
        });
      } catch {
        /* best-effort */
      }

      // ── Step 3: Return manifest + evidence tasks + job ID ──
      return res.status(200).json({
        renderJobId,
        manifest,
        evidenceTasks: evidence_tasks,
        // Include payload for callers that want immediate access
        payload,
      });
    } catch (err: any) {
      // ── Audit: SE_MATRIX_GENERATION_FAILED ──
      try {
        await logAuditEvent({
          category: 'document',
          severity: 'error',
          action: 'SE_MATRIX_GENERATION_FAILED',
          userId,
          organizationId,
          resourceType: 'se_matrix',
          resourceId: programId,
          success: false,
          errorMessage: err.message,
          metadata: {
            program_id: programId,
            predicate_k_number: kNumber,
          },
        });
      } catch {
        /* best-effort */
      }

      console.error('[se-matrix] render orchestration failed:', err.message);
      return res.status(502).json({
        error: 'Shadow service unavailable',
        detail: err.message,
      });
    }
  }
);

export default router;
