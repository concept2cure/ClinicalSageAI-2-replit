/**
 * Phase 6.6.D — Defense Packet BFF Route
 *
 * Endpoints:
 *   POST   /api/programs/:programId/predicate-intel/defense-packet          — Create packet
 *   GET    /api/programs/:programId/predicate-intel/defense-packet/:packetId — Get packet
 *   GET    /api/programs/:programId/predicate-intel/defense-packets          — List packets
 *   POST   /api/programs/:programId/predicate-intel/defense-packet/:packetId/staleness-check
 *   PATCH  /api/programs/:programId/predicate-intel/defense-packet/:packetId/status
 *
 * Each endpoint:
 *   1. Authenticates via JWT (authenticateToken)
 *   2. Validates program-org ownership (requireProgramAccess)
 *   3. Proxies to Shadow Service with X-Admin-Token
 *   4. Emits Part 11 audit events
 *
 * @phase 6.6.D
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
      error: 'Defense Packet service not configured',
      detail: 'REVIEW_ADMIN_TOKEN is not set',
    });
  }
  next();
}

async function requireProgramAccess(req: Request, res: Response, next: NextFunction) {
  const programId = req.params.programId;
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
      console.warn(`[defense-packet] IDOR blocked: org=${orgId} tried program=${programId}`);
      return res.status(403).json({
        error: 'Access denied',
        detail: 'You do not have access to this program',
      });
    }

    next();
  } catch (err: any) {
    console.error('[defense-packet] program access check failed:', err.message);
    return res.status(500).json({ error: 'Program access check failed', detail: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Shadow Service proxy
// ═══════════════════════════════════════════════════════════════════════════════

async function shadowFetch<T = unknown>(
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; data: T; raw?: string }> {
  const base = getShadowUrl().replace(/\/$/, '');
  const url = `${base}${path.startsWith('/') ? '' : '/'}${path}`;
  const token = getAdminToken();

  const opts: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Token': token,
    },
  };
  if (body && method !== 'GET') {
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(url, opts);
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
// POST /:programId/predicate-intel/defense-packet — Create Defense Packet
// ═══════════════════════════════════════════════════════════════════════════════

router.post(
  '/:programId/predicate-intel/defense-packet',
  requireConfigured,
  requireProgramAccess,
  async (req: Request, res: Response) => {
    const programId = req.params.programId;
    const userId = (req as any).user?.id || 'unknown';
    const organizationId = String((req as any).user?.organizationId || '');

    const {
      productCode = '',
      subjectDevice = {},
      predicateRecord = {},
      designControlIds = {},
      render = true,
    } = req.body;

    // ── Audit: DEFENSE_PACKET_CREATION_REQUESTED ──
    try {
      await logAuditEvent({
        category: 'document',
        severity: 'info',
        action: 'DEFENSE_PACKET_CREATION_REQUESTED',
        userId,
        organizationId,
        resourceType: 'defense_packet',
        resourceId: programId,
        success: true,
        metadata: {
          program_id: programId,
          predicate_k_number: predicateRecord?.k_number || predicateRecord?.kNumber || '',
          product_code: productCode,
          render,
        },
      });
    } catch (auditErr: any) {
      console.warn('[defense-packet] audit request event failed:', auditErr.message);
    }

    try {
      // ── Call Shadow → POST /predicate/device/defense-packet ──
      const shadowResult = await shadowFetch<{
        defense_packet_id: string;
        manifest_hash: string;
        defense_readiness_score: number;
        top_risks: string[];
        risk_codes_used: string[];
        tasks: unknown[];
        render_job_id: string | null;
        status: string;
        subject_hash: string;
        previous_packet_id: string | null;
        diff_summary: Record<string, unknown> | null;
      }>('POST', '/predicate/device/defense-packet', {
        program_id: programId,
        product_code: productCode,
        subject_device: subjectDevice,
        predicate_record: predicateRecord,
        design_control_ids: designControlIds,
        render,
        created_by_user_id: userId,
      });

      if (shadowResult.status !== 200) {
        // ── Audit: DEFENSE_PACKET_CREATION_FAILED ──
        try {
          await logAuditEvent({
            category: 'document',
            severity: 'error',
            action: 'DEFENSE_PACKET_CREATION_FAILED',
            userId,
            organizationId,
            resourceType: 'defense_packet',
            resourceId: programId,
            success: false,
            errorMessage: `Shadow returned ${shadowResult.status}`,
            metadata: {
              program_id: programId,
              shadow_status: shadowResult.status,
            },
          });
        } catch {
          /* best-effort */
        }

        return res.status(shadowResult.status >= 500 ? 502 : shadowResult.status).json({
          error: 'Defense packet creation failed',
          detail: typeof shadowResult.data === 'object' ? shadowResult.data : shadowResult.raw,
        });
      }

      const packet = shadowResult.data;

      // ── Audit: DEFENSE_PACKET_CREATED ──
      try {
        await logAuditEvent({
          category: 'document',
          severity: 'info',
          action: 'DEFENSE_PACKET_CREATED',
          userId,
          organizationId,
          resourceType: 'defense_packet',
          resourceId: packet.defense_packet_id,
          success: true,
          metadata: {
            program_id: programId,
            manifest_hash: packet.manifest_hash,
            defense_readiness_score: packet.defense_readiness_score,
            render_job_id: packet.render_job_id,
            status: packet.status,
            subject_hash: packet.subject_hash,
            risk_codes_used: packet.risk_codes_used,
            has_diff: !!packet.diff_summary,
          },
        });
      } catch {
        /* best-effort */
      }

      // ── Audit: DEFENSE_PACKET_RENDERED (if render was kicked) ──
      if (render && packet.render_job_id) {
        try {
          await logAuditEvent({
            category: 'document',
            severity: 'info',
            action: 'DEFENSE_PACKET_RENDER_STARTED',
            userId,
            organizationId,
            resourceType: 'defense_packet',
            resourceId: packet.defense_packet_id,
            success: true,
            metadata: {
              render_job_id: packet.render_job_id,
              manifest_hash: packet.manifest_hash,
            },
          });
        } catch {
          /* best-effort */
        }
      }

      return res.status(200).json(packet);
    } catch (err: any) {
      // ── Audit: DEFENSE_PACKET_CREATION_FAILED ──
      try {
        await logAuditEvent({
          category: 'document',
          severity: 'error',
          action: 'DEFENSE_PACKET_CREATION_FAILED',
          userId,
          organizationId,
          resourceType: 'defense_packet',
          resourceId: programId,
          success: false,
          errorMessage: err.message,
          metadata: { program_id: programId },
        });
      } catch {
        /* best-effort */
      }

      console.error('[defense-packet] creation failed:', err.message);
      return res.status(502).json({
        error: 'Shadow service unavailable',
        detail: err.message,
      });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// GET /:programId/predicate-intel/defense-packet/:packetId — Get packet by ID
// ═══════════════════════════════════════════════════════════════════════════════

router.get(
  '/:programId/predicate-intel/defense-packet/:packetId',
  requireConfigured,
  requireProgramAccess,
  async (req: Request, res: Response) => {
    const { packetId } = req.params;

    try {
      const result = await shadowFetch<{ packet: Record<string, unknown> }>(
        'GET',
        `/predicate/device/defense-packet/${packetId}`
      );

      if (result.status === 404) {
        return res.status(404).json({ error: 'Defense packet not found' });
      }
      if (result.status !== 200) {
        return res.status(result.status >= 500 ? 502 : result.status).json({
          error: 'Failed to retrieve defense packet',
          detail: result.data,
        });
      }

      return res.status(200).json(result.data);
    } catch (err: any) {
      console.error('[defense-packet] get failed:', err.message);
      return res.status(502).json({ error: 'Shadow service unavailable', detail: err.message });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// GET /:programId/predicate-intel/defense-packets — List packets for program
// ═══════════════════════════════════════════════════════════════════════════════

router.get(
  '/:programId/predicate-intel/defense-packets',
  requireConfigured,
  requireProgramAccess,
  async (req: Request, res: Response) => {
    const programId = req.params.programId;

    try {
      const result = await shadowFetch<{
        packets: Array<Record<string, unknown>>;
        count: number;
      }>('GET', `/predicate/device/defense-packets?program_id=${programId}`);

      if (result.status !== 200) {
        return res.status(result.status >= 500 ? 502 : result.status).json({
          error: 'Failed to list defense packets',
          detail: result.data,
        });
      }

      return res.status(200).json(result.data);
    } catch (err: any) {
      console.error('[defense-packet] list failed:', err.message);
      return res.status(502).json({ error: 'Shadow service unavailable', detail: err.message });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// POST /:programId/predicate-intel/defense-packet/:packetId/staleness-check
// ═══════════════════════════════════════════════════════════════════════════════

router.post(
  '/:programId/predicate-intel/defense-packet/:packetId/staleness-check',
  requireConfigured,
  requireProgramAccess,
  async (req: Request, res: Response) => {
    const { packetId, programId } = req.params;
    const userId = (req as any).user?.id || 'unknown';
    const organizationId = String((req as any).user?.organizationId || '');

    try {
      const result = await shadowFetch<{
        is_stale: boolean;
        reasons: string[];
        current_risk_vocab_hash: string;
        current_risk_code_map_version: string;
        packet_risk_vocab_hash: string;
        packet_risk_code_map_version: string;
      }>('POST', `/predicate/device/defense-packet/${packetId}/staleness-check`);

      if (result.status !== 200) {
        return res.status(result.status >= 500 ? 502 : result.status).json({
          error: 'Staleness check failed',
          detail: result.data,
        });
      }

      // Audit if stale
      if (result.data?.is_stale) {
        try {
          await logAuditEvent({
            category: 'compliance',
            severity: 'warning',
            action: 'DEFENSE_PACKET_STALE_DETECTED',
            userId,
            organizationId,
            resourceType: 'defense_packet',
            resourceId: packetId,
            success: true,
            metadata: {
              program_id: programId,
              reasons: result.data.reasons,
              current_risk_vocab_hash: result.data.current_risk_vocab_hash,
              packet_risk_vocab_hash: result.data.packet_risk_vocab_hash,
            },
          });
        } catch {
          /* best-effort */
        }
      }

      return res.status(200).json(result.data);
    } catch (err: any) {
      console.error('[defense-packet] staleness check failed:', err.message);
      return res.status(502).json({ error: 'Shadow service unavailable', detail: err.message });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// PATCH /:programId/predicate-intel/defense-packet/:packetId/status
// ═══════════════════════════════════════════════════════════════════════════════

router.patch(
  '/:programId/predicate-intel/defense-packet/:packetId/status',
  requireConfigured,
  requireProgramAccess,
  async (req: Request, res: Response) => {
    const { packetId, programId } = req.params;
    const userId = (req as any).user?.id || 'unknown';
    const organizationId = String((req as any).user?.organizationId || '');

    const { status, renderJobId, errorCode, errorDetail, stalenessReason } = req.body;
    if (!status) {
      return res.status(422).json({ error: 'status is required' });
    }

    try {
      const qs = new URLSearchParams({ status });
      if (renderJobId) qs.set('render_job_id', renderJobId);
      if (errorCode) qs.set('error_code', errorCode);
      if (errorDetail) qs.set('error_detail', errorDetail);
      if (stalenessReason) qs.set('staleness_reason', stalenessReason);

      const result = await shadowFetch<{ packet: Record<string, unknown> }>(
        'PATCH',
        `/predicate/device/defense-packet/${packetId}/status?${qs.toString()}`
      );

      if (result.status === 409) {
        return res.status(409).json({
          error: 'Invalid status transition',
          detail: result.data,
        });
      }
      if (result.status !== 200) {
        return res.status(result.status >= 500 ? 502 : result.status).json({
          error: 'Status update failed',
          detail: result.data,
        });
      }

      // ── Audit: DEFENSE_PACKET_STATUS_CHANGED ──
      try {
        await logAuditEvent({
          category: 'compliance',
          severity: status === 'FAILED' || status === 'STALE' ? 'warning' : 'info',
          action: `DEFENSE_PACKET_STATUS_${status}`,
          userId,
          organizationId,
          resourceType: 'defense_packet',
          resourceId: packetId,
          success: true,
          metadata: {
            program_id: programId,
            new_status: status,
            render_job_id: renderJobId,
          },
        });
      } catch {
        /* best-effort */
      }

      return res.status(200).json(result.data);
    } catch (err: any) {
      console.error('[defense-packet] status update failed:', err.message);
      return res.status(502).json({ error: 'Shadow service unavailable', detail: err.message });
    }
  }
);

export default router;
