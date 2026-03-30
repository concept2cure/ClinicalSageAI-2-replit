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
  const programId = req.params.programId as string;
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
  body?: unknown,
  options?: { responseType?: 'json' | 'arraybuffer'; timeoutMs?: number }
): Promise<{ status: number; data: T; raw?: string; headers: Record<string, string> }> {
  const base = getShadowUrl().replace(/\/$/, '');
  const url = `${base}${path.startsWith('/') ? '' : '/'}${path}`;
  const token = getAdminToken();

  const controller = new AbortController();
  const timeout = options?.timeoutMs ?? 60_000;
  const timer = setTimeout(() => controller.abort(), timeout);

  const opts: RequestInit = {
    method,
    signal: controller.signal,
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Token': token,
    },
  };
  if (body && method !== 'GET') {
    opts.body = JSON.stringify(body);
  }

  try {
    const res = await fetch(url, opts);

    // Collect response headers
    const resHeaders: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      resHeaders[key] = value;
    });

    // Binary response (ZIP downloads)
    if (options?.responseType === 'arraybuffer') {
      const buffer = await res.arrayBuffer();
      return { status: res.status, data: buffer as unknown as T, headers: resHeaders };
    }

    // JSON/text response (default)
    const text = await res.text();
    let data: T;
    try {
      data = JSON.parse(text) as T;
    } catch {
      data = text as unknown as T;
    }

    return { status: res.status, data, raw: text, headers: resHeaders };
  } finally {
    clearTimeout(timer);
  }
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
    const programId = req.params.programId as string;
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
    const { packetId } = req.params as Record<string, string>;

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
    const programId = req.params.programId as string;

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
    const { packetId, programId } = req.params as Record<string, string>;
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
    const { packetId, programId } = req.params as Record<string, string>;
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
    const programId = req.params.programId as string;
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
    const { manifestHash } = req.params as Record<string, string>;

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
    const { manifestHash } = req.params as Record<string, string>;

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
    const { manifestHash, programId } = req.params as Record<string, string>;
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
    const { packetId, programId } = req.params as Record<string, string>;
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
    const { programId } = req.params as Record<string, string>;
    const subjectHash = (req.query.subject_hash as string) || '';
    const userId = (req as any).user?.id || 'unknown';
    const organizationId = String((req as any).user?.organizationId || '');

    try {
      const result = await shadowFetch<Record<string, unknown>>(
        'GET',
        `/predicate/proof-pack?program_id=${encodeURIComponent(programId)}&subject_hash=${encodeURIComponent(subjectHash)}`
      );

      if (result.status !== 200) {
        return res.status(result.status).json(result.data);
      }

      // Part 11 audit event: PROOF_PACK_ACCESSED
      try {
        await logAuditEvent({
          category: 'compliance',
          severity: 'info',
          action: 'PROOF_PACK_ACCESSED',
          userId,
          organizationId,
          resourceType: 'proof_pack',
          resourceId: programId,
          success: true,
          metadata: {
            program_id: programId,
            subject_hash: subjectHash,
            accessed_at: new Date().toISOString(),
          },
        });
      } catch {
        /* best-effort audit */
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
    const { programId } = req.params as Record<string, string>;
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

// ═══════════════════════════════════════════════════════════════════════════════
// POST /:programId/predicate-intel/proof-pack/persist — G Persist Proof Pack
// ═══════════════════════════════════════════════════════════════════════════════

router.post(
  '/:programId/predicate-intel/proof-pack/persist',
  requireConfigured,
  requireProgramAccess,
  async (req: Request, res: Response) => {
    const { programId } = req.params as Record<string, string>;
    const userId = (req as any).user?.id || 'unknown';
    const { manifestHash, requestId } = req.body || {};

    if (!manifestHash) {
      return res.status(400).json({ error: 'manifestHash is required' });
    }

    const reqId = requestId || '';

    try {
      const result = await shadowFetch<Record<string, unknown>>(
        'POST',
        `/predicate/proof-pack/persist?program_id=${encodeURIComponent(programId)}&manifest_hash=${encodeURIComponent(manifestHash)}&user_id=${encodeURIComponent(userId)}&request_id=${encodeURIComponent(reqId)}`
      );

      if (result.status !== 200) {
        return res.status(result.status).json(result.data);
      }

      return res.status(200).json(result.data);
    } catch (err: any) {
      console.error('[defense-packet] proof-pack persist failed:', err.message);
      return res.status(502).json({ error: 'Shadow service unavailable', detail: err.message });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// GET /:programId/predicate-intel/proof-pack/:proofPackId/download — G ZIP Download
// ═══════════════════════════════════════════════════════════════════════════════

router.get(
  '/:programId/predicate-intel/proof-pack/:proofPackId/download',
  requireConfigured,
  requireProgramAccess,
  async (req: Request, res: Response) => {
    const { programId, proofPackId } = req.params as Record<string, string>;
    const userId = (req as any).user?.id || 'unknown';
    const organizationId = String((req as any).user?.organizationId || '');
    const requestId = (req.query.request_id as string) || '';

    try {
      // Audit: PROOF_PACK_DOWNLOADED — Part 11 event
      try {
        await logAuditEvent({
          category: 'compliance',
          severity: 'info',
          action: 'PROOF_PACK_DOWNLOADED',
          userId,
          organizationId,
          resourceType: 'proof_pack',
          resourceId: proofPackId,
          success: true,
          metadata: {
            program_id: programId,
            proof_pack_id: proofPackId,
            user_id: userId,
            downloaded_at: new Date().toISOString(),
          },
        });
      } catch {
        /* best-effort audit */
      }

      const result = await shadowFetch<ArrayBuffer>(
        'GET',
        `/predicate/proof-pack/${encodeURIComponent(proofPackId)}/download?program_id=${encodeURIComponent(programId)}&user_id=${encodeURIComponent(userId)}&request_id=${encodeURIComponent(requestId)}`,
        undefined,
        { responseType: 'arraybuffer' }
      );

      if (result.status !== 200) {
        // If not binary, try to parse as JSON error (409 BLOCKED / 409 CONTRACT_MISMATCH / 410 GONE)
        try {
          const errorData = JSON.parse(Buffer.from(result.data as any).toString('utf-8'));
          return res.status(result.status).json(errorData);
        } catch {
          return res.status(result.status).json({ error: 'Download failed' });
        }
      }

      const filename = `proof-pack-${proofPackId.slice(0, 12)}.zip`;
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      // Forward contract version header from Shadow
      const contractVersion = result.headers['x-contract-version'];
      if (contractVersion) {
        res.setHeader('X-Contract-Version', contractVersion);
      }
      const proofPackHash = result.headers['x-proof-pack-hash'];
      if (proofPackHash) {
        res.setHeader('X-Proof-Pack-Hash', proofPackHash);
      }
      return res.status(200).send(Buffer.from(result.data as any));
    } catch (err: any) {
      console.error('[defense-packet] proof-pack download failed:', err.message);
      return res.status(502).json({ error: 'Shadow service unavailable', detail: err.message });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// GET /:programId/predicate-intel/proof-pack/:proofPackId/verify — G Verify
// ═══════════════════════════════════════════════════════════════════════════════

router.get(
  '/:programId/predicate-intel/proof-pack/:proofPackId/verify',
  requireConfigured,
  requireProgramAccess,
  async (req: Request, res: Response) => {
    const { programId, proofPackId } = req.params as Record<string, string>;
    const requestId = (req.query.request_id as string) || '';

    try {
      const result = await shadowFetch<Record<string, unknown>>(
        'GET',
        `/predicate/proof-pack/${encodeURIComponent(proofPackId)}/verify?program_id=${encodeURIComponent(programId)}&request_id=${encodeURIComponent(requestId)}`
      );

      if (result.status !== 200) {
        return res.status(result.status).json(result.data);
      }

      return res.status(200).json(result.data);
    } catch (err: any) {
      console.error('[defense-packet] proof-pack verify failed:', err.message);
      return res.status(502).json({ error: 'Shadow service unavailable', detail: err.message });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// POST /:programId/predicate-intel/safety-signals/ingest — F.1 Ingest
// ═══════════════════════════════════════════════════════════════════════════════

router.post(
  '/:programId/predicate-intel/safety-signals/ingest',
  requireConfigured,
  requireProgramAccess,
  async (req: Request, res: Response) => {
    const { programId } = req.params as Record<string, string>;
    const { kNumber, signals } = req.body;

    if (!kNumber || !Array.isArray(signals)) {
      return res.status(400).json({ error: 'kNumber and signals[] required' });
    }

    try {
      const result = await shadowFetch<Record<string, unknown>>(
        'POST',
        '/predicate/safety-signals/ingest',
        { k_number: kNumber, signals }
      );

      if (result.status !== 200) {
        return res.status(result.status).json(result.data);
      }

      logAuditEvent({
        category: 'compliance',
        severity: 'info',
        action: 'SAFETY_SIGNALS_INGESTED',
        userId: (req as any).user?.id ?? 'system',
        organizationId: (req as any).user?.organizationId ?? '',
        resourceType: 'safety_signal',
        resourceId: programId,
        success: true,
        metadata: { kNumber, signals_count: signals.length, badge: (result.data as any).badge },
      });

      return res.status(200).json(result.data);
    } catch (err: any) {
      console.error('[defense-packet] safety-signals ingest failed:', err.message);
      return res.status(502).json({ error: 'Shadow service unavailable', detail: err.message });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// GET /:programId/predicate-intel/safety-signals/:kNumber/profile — F.1 Profile
// ═══════════════════════════════════════════════════════════════════════════════

router.get(
  '/:programId/predicate-intel/safety-signals/:kNumber/profile',
  requireConfigured,
  requireProgramAccess,
  async (req: Request, res: Response) => {
    const { programId, kNumber } = req.params as Record<string, string>;

    try {
      const result = await shadowFetch<Record<string, unknown>>(
        'GET',
        `/predicate/safety-signals/${encodeURIComponent(kNumber)}/profile?program_id=${encodeURIComponent(programId)}`
      );

      if (result.status !== 200) {
        return res.status(result.status).json(result.data);
      }

      return res.status(200).json(result.data);
    } catch (err: any) {
      console.error('[defense-packet] toxicity profile failed:', err.message);
      return res.status(502).json({ error: 'Shadow service unavailable', detail: err.message });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// GET /:programId/predicate-intel/lineage/:kNumber/graph — F.2 Lineage
// ═══════════════════════════════════════════════════════════════════════════════

router.get(
  '/:programId/predicate-intel/lineage/:kNumber/graph',
  requireConfigured,
  requireProgramAccess,
  async (req: Request, res: Response) => {
    const { programId, kNumber } = req.params as Record<string, string>;
    const maxDepth = (req.query.maxDepth as string) ?? '2';

    try {
      const result = await shadowFetch<Record<string, unknown>>(
        'GET',
        `/predicate/lineage/${encodeURIComponent(kNumber)}/graph?program_id=${encodeURIComponent(programId)}&max_depth=${maxDepth}`
      );

      if (result.status !== 200) {
        return res.status(result.status).json(result.data);
      }

      return res.status(200).json(result.data);
    } catch (err: any) {
      console.error('[defense-packet] lineage graph failed:', err.message);
      return res.status(502).json({ error: 'Shadow service unavailable', detail: err.message });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 7.0 — Document Render Proxies
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /:programId/predicate-intel/render — Create + execute render job
 */
router.post(
  '/:programId/predicate-intel/render',
  requireConfigured,
  requireProgramAccess,
  async (req: Request, res: Response) => {
    const userId = (req as any).user?.id || 'unknown';
    const { proofPackId, artifactType, requestId, idempotencyKey } = req.body || {};
    const programId = req.params.programId as string;

    if (!proofPackId || !artifactType) {
      return res.status(400).json({ error: 'proofPackId and artifactType are required' });
    }

    try {
      const result = await shadowFetch<Record<string, unknown>>('POST', '/render/jobs', {
        proof_pack_id: proofPackId,
        artifact_type: artifactType,
        user_id: userId,
        request_id: requestId || '',
        program_id: programId,
        idempotency_key: idempotencyKey || undefined,
      });

      if (result.status !== 200) {
        return res.status(result.status).json(result.data);
      }

      return res.status(200).json(result.data);
    } catch (err: any) {
      console.error('[defense-packet] render job failed:', err.message);
      return res.status(502).json({ error: 'Render service temporarily unavailable' });
    }
  }
);

/**
 * GET /:programId/predicate-intel/render/:renderJobId/download — Download rendered artifact
 */
router.get(
  '/:programId/predicate-intel/render/:renderJobId/download',
  requireConfigured,
  requireProgramAccess,
  async (req: Request, res: Response) => {
    const { renderJobId } = req.params as Record<string, string>;
    const programId = req.params.programId as string;
    const userId = (req as any).user?.id || 'unknown';

    try {
      const result = await shadowFetch<ArrayBuffer>(
        'GET',
        `/render/jobs/${encodeURIComponent(renderJobId)}/download?user_id=${encodeURIComponent(userId)}&program_id=${encodeURIComponent(programId)}`,
        undefined,
        { responseType: 'arraybuffer' }
      );

      if (result.status !== 200) {
        // Try to parse error from raw response
        try {
          const errBody = JSON.parse(
            new TextDecoder().decode(new Uint8Array(result.data as unknown as ArrayBuffer))
          );
          return res.status(result.status).json(errBody);
        } catch {
          return res.status(result.status).json({ error: 'Download failed' });
        }
      }

      // Forward headers
      const contentType = result.headers['content-type'] || 'application/octet-stream';
      const contentDisposition =
        result.headers['content-disposition'] || 'attachment; filename="artifact"';

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', contentDisposition);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'no-store');
      if (result.headers['x-render-job-id']) {
        res.setHeader('X-Render-Job-Id', result.headers['x-render-job-id']);
      }
      if (result.headers['x-artifact-hash']) {
        res.setHeader('X-Artifact-Hash', result.headers['x-artifact-hash']);
      }

      return res.status(200).send(Buffer.from(result.data as unknown as ArrayBuffer));
    } catch (err: any) {
      console.error('[defense-packet] render download failed:', err.message);
      return res.status(502).json({ error: 'Download service temporarily unavailable' });
    }
  }
);

/**
 * GET /:programId/predicate-intel/render/proof-pack/:proofPackId — List render jobs
 */
router.get(
  '/:programId/predicate-intel/render/proof-pack/:proofPackId',
  requireConfigured,
  requireProgramAccess,
  async (req: Request, res: Response) => {
    const { proofPackId, programId } = req.params as Record<string, string>;

    try {
      const result = await shadowFetch<Record<string, unknown>>(
        'GET',
        `/render/proof-pack/${encodeURIComponent(proofPackId)}?program_id=${encodeURIComponent(programId)}`
      );

      if (result.status !== 200) {
        return res.status(result.status).json(result.data);
      }

      return res.status(200).json(result.data);
    } catch (err: any) {
      console.error('[defense-packet] render list failed:', err.message);
      return res.status(502).json({ error: 'Render list service temporarily unavailable' });
    }
  }
);

export default router;
