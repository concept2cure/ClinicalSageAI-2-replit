/**
 * Phase 6.6.D — Defense Packet BFF Route
 *
 * Endpoints:
 *   POST   /api/programs/:programId/predicate-intel/defense-packet          — Create packet (DB-backed)
 *   GET    /api/programs/:programId/predicate-intel/defense-packet/:packetId — Get packet
 *   GET    /api/programs/:programId/predicate-intel/defense-packets          — List packets
 *   POST   /api/programs/:programId/predicate-intel/defense-packet/:packetId/staleness-check
 *   PATCH  /api/programs/:programId/predicate-intel/defense-packet/:packetId/status
 *   POST   /api/programs/:programId/predicate-intel/defense-packet/build    — Build (deterministic, 6.6.D1)
 *   GET    /api/programs/:programId/predicate-intel/defense-packet/:hash/export.json  — Export JSON (6.6.D1)
 *   GET    /api/programs/:programId/predicate-intel/defense-packet/:hash/export.csv   — Export CSV (6.6.D1)
 *   POST   /api/programs/:programId/predicate-intel/defense-packet/:hash/submission-gate (6.6.D1)
 *
 * Each endpoint:
 *   1. Authenticates via JWT (authenticateToken)
 *   2. Validates program-org ownership (requireProgramAccess)
 *   3. Proxies to Shadow Service with X-Admin-Token
 *   4. Emits Part 11 audit events
 *
 * @phase 6.6.D1
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

type PacketAuditMetadata = {
  manifest_hash?: string;
  packet_id?: string;
  risk_code_map_version?: string;
  risk_vocab_hash?: string;
};

async function fetchPacketAuditMetadata(manifestHash: string): Promise<PacketAuditMetadata> {
  try {
    const result = await shadowFetch<Record<string, unknown>>(
      'GET',
      `/predicate/device/defense-packet/${manifestHash}/export.json`
    );
    if (result.status !== 200 || !result.data || typeof result.data !== 'object') {
      return {};
    }

    const packet = result.data as Record<string, unknown>;
    return {
      manifest_hash: (packet.manifest_hash as string) || manifestHash,
      packet_id: (packet.packet_id as string) || manifestHash,
      risk_code_map_version: packet.risk_code_map_version as string,
      risk_vocab_hash: packet.risk_vocab_hash as string,
    };
  } catch {
    return {};
  }
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
              user_id: userId,
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
      const auditMeta = packet?.manifest_hash
        ? await fetchPacketAuditMetadata(packet.manifest_hash)
        : {};

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
            user_id: userId,
            manifest_hash: packet.manifest_hash,
            packet_id: auditMeta.packet_id,
            risk_code_map_version: auditMeta.risk_code_map_version,
            risk_vocab_hash: auditMeta.risk_vocab_hash,
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
              program_id: programId,
              user_id: userId,
              packet_id: auditMeta.packet_id || packet.defense_packet_id,
              render_job_id: packet.render_job_id,
              manifest_hash: packet.manifest_hash,
              risk_code_map_version: auditMeta.risk_code_map_version,
              risk_vocab_hash: auditMeta.risk_vocab_hash,
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
          metadata: { program_id: programId, user_id: userId },
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
              user_id: userId,
              packet_id: packetId,
              manifest_hash: packetId,
              reasons: result.data.reasons,
              risk_code_map_version: result.data.packet_risk_code_map_version,
              risk_vocab_hash: result.data.packet_risk_vocab_hash,
              current_risk_vocab_hash: result.data.current_risk_vocab_hash,
              current_risk_code_map_version: result.data.current_risk_code_map_version,
              packet_risk_vocab_hash: result.data.packet_risk_vocab_hash,
              packet_risk_code_map_version: result.data.packet_risk_code_map_version,
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

// ═══════════════════════════════════════════════════════════════════════════════
// POST /:programId/predicate-intel/defense-packet/build — Build (deterministic, 6.6.D1)
// ═══════════════════════════════════════════════════════════════════════════════

router.post(
  '/:programId/predicate-intel/defense-packet/build',
  requireConfigured,
  requireProgramAccess,
  async (req: Request, res: Response) => {
    const programId = req.params.programId;
    const userId = (req as any).user?.id || 'unknown';
    const organizationId = String((req as any).user?.organizationId || '');

    const {
      productCode = '',
      subjectDevice = {},
      selectedPredicate = {},
      designControlIds = {},
    } = req.body;

    try {
      const shadowResult = await shadowFetch<{
        defense_packet: Record<string, unknown>;
        submission_gate: Record<string, unknown>;
      }>('POST', '/predicate/device/defense-packet/build', {
        program_id: programId,
        product_code: productCode,
        subject_device: subjectDevice,
        selected_predicate: selectedPredicate,
        design_control_ids: designControlIds,
      });

      if (shadowResult.status !== 200) {
        return res.status(shadowResult.status >= 500 ? 502 : shadowResult.status).json({
          error: 'Defense packet build failed',
          detail: shadowResult.data,
        });
      }

      // ── Audit: DEFENSE_PACKET_CREATED ──
      try {
        const packet = (shadowResult.data as any)?.defense_packet || {};
        await logAuditEvent({
          category: 'document',
          severity: 'info',
          action: 'DEFENSE_PACKET_CREATED',
          userId,
          organizationId,
          resourceType: 'defense_packet',
          resourceId: packet.packet_id || programId,
          success: true,
          metadata: {
            program_id: programId,
            user_id: userId,
            packet_id: packet.packet_id,
            manifest_hash: packet.manifest_hash,
            readiness_score: packet.readiness_score,
            risk_code_map_version: packet.risk_code_map_version,
            risk_vocab_hash: packet.risk_vocab_hash,
            task_count: (packet.tasks || []).length,
            status: packet.status,
          },
        });
      } catch {
        /* best-effort */
      }

      // ── Audit: DEFENSE_PACKET_BLOCKED if gating blocks ──
      const gate = (shadowResult.data as any)?.submission_gate;
      if (gate && !gate.allowed) {
        try {
          const packet = (shadowResult.data as any)?.defense_packet || {};
          await logAuditEvent({
            category: 'compliance',
            severity: 'warning',
            action: 'DEFENSE_PACKET_BLOCKED',
            userId,
            organizationId,
            resourceType: 'defense_packet',
            resourceId: (shadowResult.data as any)?.defense_packet?.packet_id || programId,
            success: true,
            metadata: {
              program_id: programId,
              user_id: userId,
              packet_id: packet.packet_id,
              manifest_hash: packet.manifest_hash,
              risk_code_map_version: packet.risk_code_map_version,
              risk_vocab_hash: packet.risk_vocab_hash,
              blocking_task_ids: gate.blocking_task_ids,
              blocking_risk_codes: gate.blocking_risk_codes,
              reason: gate.reason,
            },
          });
        } catch {
          /* best-effort */
        }
      }

      return res.status(200).json(shadowResult.data);
    } catch (err: any) {
      console.error('[defense-packet] build failed:', err.message);
      return res.status(502).json({ error: 'Shadow service unavailable', detail: err.message });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// GET /:programId/predicate-intel/defense-packet/:hash/export.json — Export JSON
// ═══════════════════════════════════════════════════════════════════════════════

router.get(
  '/:programId/predicate-intel/defense-packet/:manifestHash/export.json',
  requireConfigured,
  requireProgramAccess,
  async (req: Request, res: Response) => {
    const { manifestHash } = req.params;

    try {
      const result = await shadowFetch<Record<string, unknown>>(
        'GET',
        `/predicate/device/defense-packet/${manifestHash}/export.json`
      );

      if (result.status === 404) {
        return res.status(404).json({ error: 'Defense packet not found' });
      }
      if (result.status !== 200) {
        return res.status(result.status >= 500 ? 502 : result.status).json({
          error: 'Export failed',
          detail: result.data,
        });
      }

      res.setHeader('Content-Type', 'application/json');
      return res.status(200).json(result.data);
    } catch (err: any) {
      console.error('[defense-packet] json export failed:', err.message);
      return res.status(502).json({ error: 'Shadow service unavailable', detail: err.message });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// GET /:programId/predicate-intel/defense-packet/:hash/export.csv — Export CSV
// ═══════════════════════════════════════════════════════════════════════════════

router.get(
  '/:programId/predicate-intel/defense-packet/:manifestHash/export.csv',
  requireConfigured,
  requireProgramAccess,
  async (req: Request, res: Response) => {
    const { manifestHash } = req.params;

    try {
      const result = await shadowFetch<string>(
        'GET',
        `/predicate/device/defense-packet/${manifestHash}/export.csv`
      );

      if (result.status === 404) {
        return res.status(404).json({ error: 'Defense packet not found' });
      }
      if (result.status !== 200) {
        return res.status(result.status >= 500 ? 502 : result.status).json({
          error: 'CSV export failed',
          detail: result.raw,
        });
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=defense-packet-${manifestHash.slice(0, 12)}.csv`
      );
      return res.status(200).send(result.raw);
    } catch (err: any) {
      console.error('[defense-packet] csv export failed:', err.message);
      return res.status(502).json({ error: 'Shadow service unavailable', detail: err.message });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// POST /:programId/predicate-intel/defense-packet/:hash/submission-gate — Gate Check
// ═══════════════════════════════════════════════════════════════════════════════

router.post(
  '/:programId/predicate-intel/defense-packet/:manifestHash/submission-gate',
  requireConfigured,
  requireProgramAccess,
  async (req: Request, res: Response) => {
    const { manifestHash, programId } = req.params;
    const userId = (req as any).user?.id || 'unknown';
    const organizationId = String((req as any).user?.organizationId || '');

    try {
      const result = await shadowFetch<{
        allowed: boolean;
        blocking_task_ids: string[];
        blocking_risk_codes: string[];
        missing_evidence_refs: string[];
        recommended_next_actions: string[];
        override_available: boolean;
        reason: string;
      }>('POST', `/predicate/device/defense-packet/${manifestHash}/submission-gate`);

      if (result.status === 404) {
        return res.status(404).json({ error: 'Defense packet not found' });
      }
      if (result.status !== 200) {
        return res.status(result.status >= 500 ? 502 : result.status).json({
          error: 'Submission gate check failed',
          detail: result.data,
        });
      }

      // ── Audit: gate result ──
      if (result.data && !result.data.allowed) {
        try {
          const auditMeta = await fetchPacketAuditMetadata(manifestHash);
          await logAuditEvent({
            category: 'compliance',
            severity: 'warning',
            action: 'DEFENSE_PACKET_BLOCKED',
            userId,
            organizationId,
            resourceType: 'defense_packet',
            resourceId: manifestHash,
            success: true,
            metadata: {
              program_id: programId,
              user_id: userId,
              packet_id: auditMeta.packet_id || manifestHash,
              manifest_hash: auditMeta.manifest_hash || manifestHash,
              risk_code_map_version: auditMeta.risk_code_map_version,
              risk_vocab_hash: auditMeta.risk_vocab_hash,
              blocking_task_ids: result.data.blocking_task_ids,
              blocking_risk_codes: result.data.blocking_risk_codes,
              reason: result.data.reason,
            },
          });
        } catch {
          /* best-effort */
        }
      }

      return res.status(200).json(result.data);
    } catch (err: any) {
      console.error('[defense-packet] submission gate failed:', err.message);
      return res.status(502).json({ error: 'Shadow service unavailable', detail: err.message });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// POST /:programId/predicate-intel/defense-packet/:packetId/waive-task — Waive a task (Part 11)
// ═══════════════════════════════════════════════════════════════════════════════

router.post(
  '/:programId/predicate-intel/defense-packet/:packetId/waive-task',
  requireConfigured,
  requireProgramAccess,
  async (req: Request, res: Response) => {
    const { packetId, programId } = req.params;
    const userId = (req as any).user?.id || 'unknown';
    const organizationId = String((req as any).user?.organizationId || '');

    const { taskId, waiverReason } = req.body;
    if (!taskId || !waiverReason) {
      return res.status(422).json({ error: 'taskId and waiverReason are required' });
    }

    // ── Audit: DEFENSE_TASK_WAIVED — Part 11 audit event ──
    try {
      const auditMeta = await fetchPacketAuditMetadata(packetId);
      await logAuditEvent({
        category: 'compliance',
        severity: 'warning',
        action: 'DEFENSE_TASK_WAIVED',
        userId,
        organizationId,
        resourceType: 'defense_packet',
        resourceId: packetId,
        success: true,
        metadata: {
          program_id: programId,
          user_id: userId,
          packet_id: auditMeta.packet_id || packetId,
          manifest_hash: auditMeta.manifest_hash || packetId,
          risk_code_map_version: auditMeta.risk_code_map_version,
          risk_vocab_hash: auditMeta.risk_vocab_hash,
          task_id: taskId,
          waiver_reason: waiverReason,
          waived_by: userId,
          waived_at: new Date().toISOString(),
        },
      });
    } catch (auditErr: any) {
      console.warn('[defense-packet] waive audit event failed:', auditErr.message);
    }

    return res.status(200).json({
      task_id: taskId,
      waiver_recorded: true,
      waiver_reason: waiverReason,
      waived_by: userId,
      waived_at: new Date().toISOString(),
    });
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// GET /:programId/predicate-intel/proof-pack — E1 Defense Proof Pack
// ═══════════════════════════════════════════════════════════════════════════════

router.get(
  '/:programId/predicate-intel/proof-pack',
  requireConfigured,
  requireProgramAccess,
  async (req: Request, res: Response) => {
    const { programId } = req.params;
    const subjectHash = (req.query.subject_hash as string) || '';

    try {
      const result = await shadowFetch<Record<string, unknown>>(
        'GET',
        `/predicate/proof-pack?program_id=${encodeURIComponent(programId)}&subject_hash=${encodeURIComponent(subjectHash)}`
      );

      if (result.status !== 200) {
        return res.status(result.status).json(result.data);
      }

      return res.status(200).json(result.data);
    } catch (err: any) {
      console.error('[defense-packet] proof-pack failed:', err.message);
      return res.status(502).json({ error: 'Shadow service unavailable', detail: err.message });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// POST /:programId/predicate-intel/replay-determinism — E2 Replay Determinism
// ═══════════════════════════════════════════════════════════════════════════════

router.post(
  '/:programId/predicate-intel/replay-determinism',
  requireConfigured,
  requireProgramAccess,
  async (req: Request, res: Response) => {
    const { programId } = req.params;
    const userId = (req as any).user?.id || 'unknown';
    const organizationId = String((req as any).user?.organizationId || '');

    try {
      // Audit: DETERMINISM_REPLAY — Part 11 event
      try {
        await logAuditEvent({
          category: 'compliance',
          severity: 'info',
          action: 'DETERMINISM_REPLAY',
          userId,
          organizationId,
          resourceType: 'defense_packet',
          resourceId: req.body?.originalManifestHash || 'unknown',
          success: true,
          metadata: {
            program_id: programId,
            user_id: userId,
            original_manifest_hash: req.body?.originalManifestHash,
            replayed_at: new Date().toISOString(),
          },
        });
      } catch {
        /* best-effort audit */
      }

      const result = await shadowFetch<Record<string, unknown>>(
        'POST',
        '/predicate/replay-determinism',
        req.body
      );

      if (result.status !== 200) {
        return res.status(result.status).json(result.data);
      }

      return res.status(200).json(result.data);
    } catch (err: any) {
      console.error('[defense-packet] replay-determinism failed:', err.message);
      return res.status(502).json({ error: 'Shadow service unavailable', detail: err.message });
    }
  }
);

export default router;
