/**
 * audit-trail-routes.ts
 * Express Router for all /api/audit/* and /api/audit-logs routes.
 * Extracted from server/index.ts for maintainability.
 *
 * Mount with:  app.use('/api', createAuditTrailRoutes(pool));
 */

import { Router } from 'express';
import type { Pool } from 'pg';
import type { Request, Response } from 'express';
import { requireAuthedOrgId } from '../utils/authedOrgId';

// ---------------------------------------------------------------------------
// Helper: derive the acting principal from the AUTHENTICATED request only.
//
// SECURITY (audit findings F3/F4): user_id, user_name, user_role and signed_by
// must come from the verified JWT principal (req.user), never from the request
// body. Accepting them from the body let any caller forge attribution on
// immutable 21 CFR Part 11 audit records (write an event "as" another user) and
// forge the signer of a signature. Identity is now sourced here and the body is
// ignored for these fields. If the body supplies a conflicting user id we log a
// security warning (mirroring getSecureOrgId) and keep the principal value.
// ---------------------------------------------------------------------------
function getActingPrincipal(req: Request) {
  const user = (req as any).user || {};
  const principalId = user.id ?? user.userId ?? null;

  // Telemetry only: never trust a body-supplied identity. Warn if it disagrees
  // with the authenticated principal so spoofing attempts are visible.
  const body = (req as any).body || {};
  const claimedId = body.userId ?? body.user_id ?? body.user?.id;
  if (
    claimedId != null &&
    principalId != null &&
    String(claimedId) !== String(principalId)
  ) {
    console.warn(
      `[SECURITY] audit-trail: body user id (${claimedId}) differs from ` +
        `authenticated principal (${principalId}). Body value ignored. path=${req.path}`
    );
  }

  return {
    // user_id column is integer; coerce, fall back to 0 only when truly absent.
    userId: principalId != null ? Number(principalId) || 0 : 0,
    userName: user.email || (req as any).userEmail || user.name || 'system',
    userRole: user.role || (req as any).userRole || 'user',
  };
}

// ---------------------------------------------------------------------------
// Helper: build WHERE clause + run query against audit_events
// ---------------------------------------------------------------------------
async function queryAuditEvents(
  pool: Pool,
  orgId: number,
  queryParams: any,
  limitVal = 10,
  offsetVal = 0
) {
  // Tenant scope is mandatory and always sourced from the authenticated org,
  // never from user-supplied query params. Sourcing it from req.query.org_id
  // let any authenticated caller read another org's audit trail (or omit it
  // and read every org's) — a cross-tenant IDOR on 21 CFR Part 11 data.
  // The organization_id predicate lives in the SQL literal below (not in this
  // array) so the tenant-isolation CI gate can verify it statically.
  const conditions: string[] = [];
  const params: any[] = [orgId];
  let idx = 2;

  if (queryParams.event_type) {
    conditions.push(`event_type = $${idx++}`);
    params.push(String(queryParams.event_type));
  }
  if (queryParams.user_id || queryParams.userId) {
    conditions.push(`user_id = $${idx++}`);
    params.push(parseInt(String(queryParams.user_id || queryParams.userId)));
  }
  if (queryParams.entity_id || queryParams.entityId) {
    conditions.push(`entity_id = $${idx++}`);
    params.push(parseInt(String(queryParams.entity_id || queryParams.entityId)));
  }
  if (queryParams.entity_type || queryParams.entityType) {
    conditions.push(`entity_type = $${idx++}`);
    params.push(String(queryParams.entity_type || queryParams.entityType));
  }
  if (queryParams.start_date || queryParams.startDate) {
    conditions.push(`timestamp >= $${idx++}`);
    params.push(new Date(String(queryParams.start_date || queryParams.startDate)));
  }
  if (queryParams.end_date || queryParams.endDate) {
    conditions.push(`timestamp <= $${idx++}`);
    params.push(new Date(String(queryParams.end_date || queryParams.endDate)));
  }
  if (queryParams.search) {
    conditions.push(
      `(user_name ILIKE $${idx} OR event_type ILIKE $${idx} OR entity_type ILIKE $${idx})`
    );
    params.push(`%${String(queryParams.search)}%`);
    idx++;
  }

  const extraWhere = conditions.length > 0 ? ` AND ${conditions.join(' AND ')}` : '';

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM audit_events WHERE organization_id = $1${extraWhere}`,
    params
  );
  const total = countResult.rows[0]?.total || 0;

  params.push(limitVal);
  params.push(offsetVal);
  const result = await pool.query(
    `SELECT id, organization_id, event_type, entity_type, entity_id, user_id, user_name, user_role,
            ip_address, timestamp, reason, comments, regulatory_significant, gxp_relevant, metadata,
            record_hash, previous_hash, sequence_number, created_at
     FROM audit_events WHERE organization_id = $1${extraWhere} ORDER BY timestamp DESC LIMIT $${idx++} OFFSET $${idx++}`,
    params
  );

  return { rows: result.rows, total };
}

// ---------------------------------------------------------------------------
// Helper: format a DB row into API response shape
// ---------------------------------------------------------------------------
function formatAuditRow(row: any) {
  const action = (row.event_type || '').split('.').pop()?.toUpperCase() || 'VIEW';
  return {
    id: `AUDIT-${row.id}`,
    userId: String(row.user_id || ''),
    user_id: String(row.user_id || ''),
    userName: row.user_name || 'System',
    userRole: row.user_role || '',
    action,
    actionType: action.charAt(0) + action.slice(1).toLowerCase(),
    event_type: row.event_type || '',
    severity: row.regulatory_significant ? 'warning' : 'info',
    component: row.entity_type || 'System',
    entityId: row.entity_id != null ? String(row.entity_id) : null,
    entityType: row.entity_type || null,
    details: row.reason || row.comments || `${action} on ${row.entity_type || 'entity'}`,
    description: row.reason || row.comments || `${action} on ${row.entity_type || 'entity'}`,
    ipAddress: row.ip_address || '',
    region: 'US',
    org_id: String(row.organization_id || ''),
    project_id: String(row.entity_id || ''),
    timestamp: row.timestamp || row.created_at,
    metadata: row.metadata ?? null,
    // Hash chain fields for Part 11 chain integrity display
    hash: row.record_hash || null,
    sequenceNumber: row.sequence_number ?? null,
    previousHash: row.previous_hash || null,
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
export function createAuditTrailRoutes(pool: Pool): Router {
  const router = Router();

  // GET /api/audit/logs — paginated audit logs
  router.get('/audit/logs', async (req: Request, res: Response) => {
    try {
      const guard = requireAuthedOrgId(req, res);
      if (!guard.ok) return;
      const limit = Math.max(1, parseInt(String(req.query.limit || '10'), 10));
      const offset = Math.max(0, parseInt(String(req.query.offset || '0'), 10));
      const { rows, total } = await queryAuditEvents(pool, guard.orgId, req.query, limit, offset);

      return res.json({
        logs: rows.map(formatAuditRow),
        total,
        limit,
        offset,
      });
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
      return res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
  });

  // GET /api/audit-logs — legacy alias with page/pageSize
  router.get('/audit-logs', async (req: Request, res: Response) => {
    try {
      const guard = requireAuthedOrgId(req, res);
      if (!guard.ok) return;
      const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
      const pageSize = Math.max(1, parseInt(String(req.query.pageSize || '10'), 10));
      const offset = (page - 1) * pageSize;
      const { rows, total } = await queryAuditEvents(pool, guard.orgId, req.query, pageSize, offset);

      return res.json({
        logs: rows.map(formatAuditRow),
        totalCount: total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      });
    } catch (error) {
      console.error('Failed to fetch legacy audit logs:', error);
      return res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
  });

  // GET /api/audit/events — event listing
  router.get('/audit/events', async (req: Request, res: Response) => {
    try {
      const guard = requireAuthedOrgId(req, res);
      if (!guard.ok) return;
      const { rows, total } = await queryAuditEvents(pool, guard.orgId, req.query, 50, 0);
      return res.json({
        success: true,
        events: rows.map((row: any) => ({
          eventId: row.id,
          eventType: row.event_type,
          severity: row.regulatory_significant ? 'warning' : 'info',
          timestamp: row.timestamp,
          actor: {
            userId: row.user_id,
            userName: row.user_name,
          },
          target: {
            component: row.entity_type,
            projectId: row.entity_id,
          },
          details: row.reason || row.comments || '',
        })),
        total,
      });
    } catch (error) {
      console.error('Failed to fetch audit events:', error);
      return res.status(500).json({ error: 'Failed to fetch audit events' });
    }
  });

  // POST /api/audit/events — create audit event
  router.post('/audit/events', async (req: Request, res: Response) => {
    try {
      const guard = requireAuthedOrgId(req, res);
      if (!guard.ok) return;
      const body = req.body || {};
      // F3: identity is sourced from the authenticated principal, never the body.
      const principal = getActingPrincipal(req);

      // F10: a regulatory/GxP-significant event must carry a reason-for-change.
      const regulatorySignificant = body.regulatorySignificant || false;
      const gxpRelevant = body.gxpRelevant || false;
      const reason = body.reason || body.details || null;
      if ((regulatorySignificant || gxpRelevant) && (!reason || String(reason).trim() === '')) {
        return res.status(400).json({
          error: 'reason is required for regulatory_significant or gxp_relevant audit events',
        });
      }

      const result = await pool.query(
        `INSERT INTO audit_events (organization_id, event_type, entity_type, entity_id, user_id, user_name, user_role, ip_address, timestamp, reason, metadata, regulatory_significant, gxp_relevant, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, $10, $11, $12, NOW()) RETURNING id`,
        [
          guard.orgId,
          body.eventType || body.event_type || 'general',
          body.entityType || body.entity_type || 'system',
          body.entityId || body.entity_id || 0,
          principal.userId,
          principal.userName,
          principal.userRole,
          body.ipAddress || body.ip_address || req.ip || '',
          reason,
          JSON.stringify(body.metadata || body.payload || {}),
          regulatorySignificant,
          gxpRelevant,
        ]
      );
      return res.status(201).json({
        success: true,
        eventId: result.rows[0].id,
        receivedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to record audit event:', error);
      return res.status(500).json({ error: 'Failed to record audit event' });
    }
  });

  // POST /api/audit/events/batch — batch create (up to 50)
  router.post('/audit/events/batch', async (req: Request, res: Response) => {
    try {
      const guard = requireAuthedOrgId(req, res);
      if (!guard.ok) return;
      const { events } = req.body || {};
      if (!Array.isArray(events) || events.length === 0) {
        return res.status(400).json({ error: 'events array is required and must not be empty' });
      }

      // Limit batch size to prevent abuse
      const batch = events.slice(0, 50);
      // F3: every event in the batch is attributed to the authenticated
      // principal — per-event userId/userName/userRole from the body are ignored.
      const principal = getActingPrincipal(req);
      const results: { eventId: number; action: string }[] = [];
      const skipped: { index: number; reason: string }[] = [];
      // Distinct from a validation-skip: an actual INSERT failure means a
      // (default GxP-relevant) event was NOT recorded. Tracked so the batch is
      // reported as partial/failed rather than a clean success.
      let insertFailures = 0;

      for (let i = 0; i < batch.length; i++) {
        const evt = batch[i];
        // F10: regulatory/GxP-significant events must carry a reason-for-change.
        // Batch defaults gxp_relevant to true, so this is enforced unless the
        // event explicitly opts out of both flags.
        const regulatorySignificant = evt.regulatorySignificant || false;
        const gxpRelevant = evt.gxpRelevant !== undefined ? evt.gxpRelevant : true;
        const reason = evt.reason || null;
        if ((regulatorySignificant || gxpRelevant) && (!reason || String(reason).trim() === '')) {
          skipped.push({ index: i, reason: 'reason required for regulatory/GxP-significant event' });
          continue;
        }
        try {
          const result = await pool.query(
            `INSERT INTO audit_events (organization_id, event_type, entity_type, entity_id, user_id, user_name, user_role, ip_address, timestamp, reason, metadata, regulatory_significant, gxp_relevant, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, $10, $11, $12, NOW()) RETURNING id`,
            [
              guard.orgId,
              evt.eventType || evt.action || 'general',
              evt.entityType || 'document',
              evt.entityId || 0,
              principal.userId,
              principal.userName,
              principal.userRole,
              req.ip || '',
              reason,
              JSON.stringify(evt.metadata || evt.details || {}),
              regulatorySignificant,
              gxpRelevant,
            ]
          );
          results.push({ eventId: result.rows[0].id, action: evt.eventType || evt.action || '' });
        } catch (err) {
          // Do NOT silently drop the event. Record the failure in `skipped` so
          // results.length + skipped.length === total always holds, and count it
          // as an insert failure so the response reports a partial/failed batch
          // rather than 201 success — a GxP event lost with no client signal is
          // an §11.10(e) gap.
          console.error('Failed to insert batch audit event:', err);
          skipped.push({
            index: i,
            reason: 'insert_failed: ' + (err instanceof Error ? err.message : String(err)),
          });
          insertFailures++;
        }
      }

      const partial = insertFailures > 0;
      return res.status(partial ? 207 : 201).json({
        success: !partial,
        partial,
        insertFailures,
        inserted: results.length,
        skipped: skipped.length,
        skippedDetails: skipped,
        total: batch.length,
        receivedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to process batch audit events:', error);
      return res.status(500).json({ error: 'Failed to process batch audit events' });
    }
  });

  // POST /api/audit/signatures — record a NON-AUTHORITATIVE signature marker
  //
  // F4 remediation — choice (b): this endpoint is made NON-AUTHORITATIVE rather
  // than routed through the real e-signature flow.
  //
  // Why (b) and not (a): the compliant signing logic lives in the
  // POST /api/esignature/sign *route handler* (server/routes/esignature.ts),
  // not in a reusable exported function — it re-verifies password + MFA, binds a
  // SHA-256 hash over document/version/meaning, and persists to
  // `electronic_signatures`, failing closed. There is no importable function to
  // call here without copying that logic (and its password/MFA inputs, which
  // this endpoint's body shape and callers do not supply). Re-implementing
  // re-auth here would duplicate the trust-critical path and risk drift.
  //
  // So this endpoint NO LONGER mints an authoritative "signed" 21 CFR Part 11
  // signature. It:
  //   * rejects any attempt to claim signature_status 'signed' (forgery) — the
  //     only way to obtain a 'signed' status is the real flow at
  //     POST /api/esignature/sign;
  //   * sources signed_by/user_id from the authenticated principal, never the
  //     body (F3);
  //   * writes the event with signature_status 'unverified' so it is clearly a
  //     non-binding marker, not a legal signature.
  router.post('/audit/signatures', async (req: Request, res: Response) => {
    try {
      const guard = requireAuthedOrgId(req, res);
      if (!guard.ok) return;
      const body = req.body || {};
      const principal = getActingPrincipal(req);

      // Forgery guard: a caller may not assert a binding 'signed' status here.
      const claimedStatus = body.signatureStatus || body.signature_status;
      if (claimedStatus && String(claimedStatus).toLowerCase() === 'signed') {
        return res.status(403).json({
          success: false,
          error: 'FORGERY_REJECTED',
          message:
            'This endpoint cannot mint an authoritative 21 CFR Part 11 signature. ' +
            'Use POST /api/esignature/sign, which re-verifies password + MFA and ' +
            'binds a content hash. Records created here are non-authoritative markers.',
        });
      }

      // Non-authoritative marker. signed_by is the authenticated principal's
      // identity, never a body-supplied value (F3). Status is 'unverified'.
      const signerLabel = principal.userName;
      const result = await pool.query(
        `INSERT INTO audit_events (organization_id, event_type, entity_type, entity_id, user_id, user_name, ip_address, timestamp,
         signature_status, signed_by, signed_date, signature_meaning, reason, metadata, regulatory_significant, gxp_relevant, created_at)
         VALUES ($1, 'signature.create', $2, $3, $4, $5, $6, NOW(), 'unverified', $7, NOW(), $8, $9, $10, true, true, NOW()) RETURNING id`,
        [
          guard.orgId,
          body.entityType || 'document',
          body.entityId || 0,
          principal.userId,
          principal.userName,
          req.ip || '',
          signerLabel,
          body.meaning || 'Signature marker (non-authoritative)',
          body.reason || null,
          JSON.stringify({
            signatureType: 'non-authoritative-marker',
            authoritative: false,
            note: 'Created via /api/audit/signatures; not a verified 21 CFR Part 11 e-signature.',
            ...body.metadata,
          }),
        ]
      );

      return res.status(201).json({
        success: true,
        authoritative: false,
        signatureId: `SIG_${result.rows[0].id}`,
        record: {
          signatureId: `SIG_${result.rows[0].id}`,
          entityType: body.entityType || 'document',
          entityId: body.entityId || 0,
          signedBy: signerLabel,
          signatureStatus: 'unverified',
          reason: body.reason,
          timestamp: new Date().toISOString(),
        },
        message:
          'Recorded a non-authoritative signature marker. For a binding 21 CFR Part 11 ' +
          'signature use POST /api/esignature/sign.',
      });
    } catch (error) {
      console.error('Failed to record audit signature:', error);
      return res.status(500).json({ error: 'Failed to record audit signature' });
    }
  });

  // GET /api/audit/signatures/:signatureId/verify — verify signature
  router.get('/audit/signatures/:signatureId/verify', async (req: Request, res: Response) => {
    try {
      const guard = requireAuthedOrgId(req, res);
      if (!guard.ok) return;
      const sigId = String(req.params.signatureId).replace('SIG_', '');
      const result = await pool.query(
        `SELECT id, entity_type, entity_id, signed_by, signed_date, signature_meaning, reason, signature_status
         FROM audit_events WHERE id = $1 AND organization_id = $2 AND event_type = 'signature.create'`,
        [parseInt(sigId) || 0, guard.orgId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          verified: false,
          message: 'Signature not found',
        });
      }

      const row = result.rows[0];
      return res.json({
        success: true,
        verified: row.signature_status === 'signed',
        signature: {
          signatureId: `SIG_${row.id}`,
          entityType: row.entity_type,
          entityId: String(row.entity_id),
          signedBy: row.signed_by,
          reason: row.reason,
          timestamp: row.signed_date,
        },
      });
    } catch (error) {
      console.error('Failed to verify audit signature:', error);
      return res.status(500).json({ error: 'Failed to verify audit signature' });
    }
  });

  // GET /api/audit — paginated audit with pagination object
  router.get('/audit', async (req: Request, res: Response) => {
    try {
      const guard = requireAuthedOrgId(req, res);
      if (!guard.ok) return;
      const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
      const limit = Math.max(1, parseInt(String(req.query.limit || '10'), 10));
      const offset = (page - 1) * limit;
      const { rows, total } = await queryAuditEvents(pool, guard.orgId, req.query, limit, offset);

      return res.json({
        logs: rows.map(formatAuditRow),
        pagination: {
          page,
          limit,
          total,
          pages: Math.max(1, Math.ceil(total / limit)),
        },
      });
    } catch (error) {
      console.error('Failed to fetch audit entries:', error);
      return res.status(500).json({ error: 'Failed to fetch audit entries' });
    }
  });

  // GET /api/audit/export — signed export (CSV/JSON)
  router.get('/audit/export', async (req: Request, res: Response) => {
    try {
      const orgGuard = requireAuthedOrgId(req, res);
      if (!orgGuard.ok) return;
      // Use signed export service for tamper-evident audit packages
      const { generateSignedAuditExport } = await import('../services/audit/signedAuditExport.js');
      const format = (req.query.format === 'json' ? 'json' : 'csv') as 'csv' | 'json';
      const userId = (req as any).userId || (req as any).user?.id || 'unknown';
      const userName = (req as any).user?.name || (req as any).user?.email || String(userId);

      const signedExport = await generateSignedAuditExport(pool, {
        organizationId: orgGuard.orgId,
        startDate: req.query.start_date ? String(req.query.start_date) : undefined,
        endDate: req.query.end_date ? String(req.query.end_date) : undefined,
        eventType: req.query.event_type ? String(req.query.event_type) : undefined,
        userId: req.query.user_id ? parseInt(String(req.query.user_id), 10) : undefined,
        format,
        exportedBy: userName,
        exportedByRole: (req as any).userRole || (req as any).user?.role || 'unknown',
        ipAddress: req.ip || 'unknown',
      });

      // Set integrity headers so the manifest travels with the download
      res.setHeader('Content-Type', signedExport.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${signedExport.filename}"`);
      res.setHeader('X-Audit-Export-Id', signedExport.manifest.exportId);
      res.setHeader('X-Audit-Data-Hash', signedExport.manifest.dataHash);
      res.setHeader('X-Audit-Signature', signedExport.signature);
      res.setHeader('X-Audit-Chain-Status', signedExport.manifest.chainIntegrity.status);
      res.setHeader('X-Audit-Row-Count', String(signedExport.manifest.rowCount));
      return res.send(signedExport.data);
    } catch (error) {
      console.error('Failed to export audit logs:', error);
      return res.status(500).json({ error: 'Failed to export audit logs' });
    }
  });

  /**
   * GET /api/audit/export/signed
   * Full signed export — returns JSON bundle with data + manifest + signature.
   * This is the inspection-ready endpoint: an inspector can independently verify
   * the HMAC signature and data hash to confirm nothing was tampered.
   */
  router.get('/audit/export/signed', async (req: Request, res: Response) => {
    try {
      const orgGuard = requireAuthedOrgId(req, res);
      if (!orgGuard.ok) return;
      const { generateSignedAuditExport } = await import('../services/audit/signedAuditExport.js');
      const format = (req.query.format === 'csv' ? 'csv' : 'json') as 'csv' | 'json';
      const userId = (req as any).userId || (req as any).user?.id || 'unknown';
      const userName = (req as any).user?.name || (req as any).user?.email || String(userId);

      const signedExport = await generateSignedAuditExport(pool, {
        organizationId: orgGuard.orgId,
        startDate: req.query.start_date ? String(req.query.start_date) : undefined,
        endDate: req.query.end_date ? String(req.query.end_date) : undefined,
        eventType: req.query.event_type ? String(req.query.event_type) : undefined,
        userId: req.query.user_id ? parseInt(String(req.query.user_id), 10) : undefined,
        format,
        exportedBy: userName,
        exportedByRole: (req as any).userRole || (req as any).user?.role || 'unknown',
        ipAddress: req.ip || 'unknown',
      });

      res.json({
        success: true,
        export: {
          data: signedExport.data,
          manifest: signedExport.manifest,
          signature: signedExport.signature,
          verification: {
            instruction:
              'To verify: compute HMAC-SHA256 of the canonical manifest JSON using the server signing key, then compare to the signature field. Also verify SHA-256(data) === manifest.dataHash.',
            algorithm: 'HMAC-SHA256',
            hashAlgorithm: 'SHA-256',
          },
        },
      });
    } catch (error) {
      console.error('Failed to generate signed audit export:', error);
      return res.status(500).json({ error: 'Failed to generate signed audit export' });
    }
  });

  /**
   * POST /api/audit/export/verify
   * Verify a previously exported audit package.
   * Accepts { data, manifest, signature } and confirms integrity.
   */
  router.post('/audit/export/verify', async (req: Request, res: Response) => {
    try {
      const { verifySignedAuditExport } = await import('../services/audit/signedAuditExport.js');
      const { data, manifest, signature } = req.body;

      if (!data || !manifest || !signature) {
        return res.status(400).json({ error: 'data, manifest, and signature are required' });
      }

      const result = verifySignedAuditExport(data, manifest, signature);
      res.json({
        success: true,
        verification: {
          valid: result.valid,
          errors: result.errors,
          verifiedAt: new Date().toISOString(),
          compliance: {
            standard: '21 CFR Part 11 §11.10(e)',
            description: result.valid
              ? 'Export integrity verified — data has not been modified since generation'
              : 'INTEGRITY FAILURE — export data or manifest has been tampered with',
          },
        },
      });
    } catch (error) {
      console.error('Failed to verify audit export:', error);
      return res.status(500).json({ error: 'Failed to verify audit export' });
    }
  });

  /**
   * GET /api/audit/chain-monitor/status
   * Returns the current status of the background chain integrity monitor.
   */
  router.get('/audit/chain-monitor/status', async (_req: Request, res: Response) => {
    try {
      const { getChainMonitorStatus } = await import('../services/audit/chainIntegrityMonitor.js');
      const status = getChainMonitorStatus();
      res.json({ success: true, data: status });
    } catch (error) {
      // §11.10(e): the chain-integrity monitor's status IS compliance evidence.
      // Reporting `success: true, status: 'not_started'` when the status could
      // not be read told an auditor "the monitor is idle" when the truth was
      // "we could not determine whether the monitor is running at all" — the
      // two are not the same claim, and only one of them is honest. Fail with a
      // real status so the unknown state is visible instead of assumed benign.
      console.error(
        'Failed to read audit chain-monitor status:',
        error instanceof Error ? error.message : String(error),
      );
      return res.status(500).json({
        success: false,
        error: 'Failed to read chain integrity monitor status',
      });
    }
  });

  /**
   * POST /api/audit/chain-monitor/check
   * Trigger an on-demand chain integrity check.
   */
  router.post('/audit/chain-monitor/check', async (_req: Request, res: Response) => {
    try {
      const { runOnDemandCheck } = await import('../services/audit/chainIntegrityMonitor.js');
      const status = await runOnDemandCheck();
      res.json({ success: true, data: status });
    } catch (err: any) {
      res.status(500).json({ error: 'Chain integrity check failed', details: err.message });
    }
  });

  // IMMUTABILITY POLICY: Audit records are append-only per 21 CFR Part 11.
  // Bulk-delete is disabled. Audit events cannot be modified or deleted.
  router.post('/audit/bulk-delete', async (_req: Request, res: Response) => {
    return res.status(403).json({
      error: 'IMMUTABILITY_VIOLATION',
      message:
        'Audit records are immutable per 21 CFR Part 11 compliance. ' +
        'Deletion of audit trail events is prohibited. ' +
        'Records can only be appended, never modified or deleted.',
      policy: 'append-only',
    });
  });

  return router;
}
