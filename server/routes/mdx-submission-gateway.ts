/**
 * Submission gateway routes — single surface over FDA ESG, EMA CESP /
 * EUDAMED, and PMDA Gateway. Backs the kit's submission-transmittal
 * surface (UI brief at the bottom of this commit's response).
 *
 *   GET    /api/mdx/gateways                              list + per-org config status
 *   GET    /api/mdx/gateways/transmittals                 list transmittals
 *   GET    /api/mdx/gateways/transmittals/:id             single transmittal + findings
 *   POST   /api/mdx/gateways/:region/:gateway/transmit    transmit a package
 *   GET    /api/mdx/gateways/transmittals/:id/status      poll latest status
 *   GET    /api/mdx/gateways/transmittals/:id/ack         download ack as text/plain
 *   POST   /api/mdx/gateways/transmittals/:id/findings    record validator finding
 *   PATCH  /api/mdx/gateways/findings/:findingId/resolve  resolve a finding
 *
 * All responses use the canonical { data, meta? } envelope.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';

import { createScopedLogger } from '../utils/logger';
import {
  ok, created, clientError, orgRequired, notFoundInTenant, serverError,
} from '../lib/api-response';
import { pool } from '../db';
import {
  getGateway, listGateways, gatewayConfigurationStatus,
  CredentialError, GatewayError, TransportError, ValidationError,
  acknowledgementFilename,
  type Region, type GatewayName,
} from '../services/submission-gateways';
import {
  rollbackTransmittal,
  RollbackNotPermittedError,
} from '../services/submission-gateways/fda-esg';
import {
  executeGovernedTransmit,
  GovernedTransmitRefusal,
  GovernedTransmitInternalError,
  BUNDLE_FORMAT_SET,
  CONTENT_CHANGED_DURING_TRANSMIT,
} from '../services/submission-gateways/governed-transmit';
import { recordGovernedAction, verifyReauth } from './c2c/actions';

const router = Router();
const log = createScopedLogger('mdx-submission-gateway');

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

const REGION_SET   = ['fda', 'ema', 'pmda', 'ca'] as const;
const GATEWAY_SET  = ['esg', 'cesp', 'eudamed', 'pmda_gateway', 'hc_cesg'] as const;
const UUID_RE      = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* ─── GET /api/mdx/gateways ──────────────────────────────────────── */

router.get('/gateways', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const environment = req.query.environment === 'staging' ? 'staging' : 'production';
  try {
    const config = await gatewayConfigurationStatus(orgId, environment);
    const all = listGateways();
    return ok(res, all.map((g) => ({
      ...g,
      configured: config.find((c) => c.region === g.region && c.gateway === g.gateway)?.configured ?? false,
      environment,
    })));
  } catch (err) {
    return serverError(res, log, 'list-gateways', err);
  }
});

/* ─── GET /api/mdx/gateways/transmittals ─────────────────────────── */

const listQuery = z.object({
  program_id: z.string().regex(UUID_RE).optional(),
  region:     z.enum(REGION_SET).optional(),
  status:     z.string().optional(),
  limit:      z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(500)).optional(),
});

router.get('/gateways/transmittals', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) return clientError(res, 422, 'Invalid query', parsed.error.flatten().fieldErrors);
  const { program_id: pid, region, status, limit = 100 } = parsed.data;

  const filters: string[] = [`organization_id = $1`];
  const args: unknown[] = [orgId];
  if (pid)    { args.push(pid);    filters.push(`program_id = $${args.length}`); }
  if (region) { args.push(region); filters.push(`region = $${args.length}`); }
  if (status) { args.push(status); filters.push(`status = $${args.length}`); }
  args.push(limit);

  try {
    const { rows } = await pool.query(
      `SELECT id, organization_id, program_id, package_id, region, gateway, format,
              submission_type, transport, transmission_id, status, http_status,
              error_class, error_message, bundle_size_bytes, submitted_by, submitted_at,
              ack_received_at, completed_at, metadata
         FROM submission_transmittals
        WHERE ${filters.join(' AND ')}
        ORDER BY submitted_at DESC
        LIMIT $${args.length}`,
      args,
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) {
    return serverError(res, log, 'list-trans', err);
  }
});

/* ─── GET /api/mdx/gateways/transmittals/:id ─────────────────────── */

router.get('/gateways/transmittals/:id', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  try {
    const { rows } = await pool.query(
      `SELECT * FROM submission_transmittals WHERE id = $1 AND organization_id = $2`,
      [id, orgId],
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Transmittal');
    const findings = await pool.query(
      `SELECT * FROM submission_validation_findings
        WHERE transmittal_id = $1 AND organization_id = $2
        ORDER BY (severity = 'error') DESC, (severity = 'warning') DESC, id`,
      [id, orgId],
    );
    return ok(res, { ...rows[0], findings: findings.rows });
  } catch (err) {
    return serverError(res, log, 'get-trans', err);
  }
});

/* ─── POST /api/mdx/gateways/:region/:gateway/transmit ───────────── */

const transmitBody = z.object({
  programId:      z.string().regex(UUID_RE).optional().nullable(),
  packageId:      z.number().int().positive().optional().nullable(),
  environment:    z.enum(['staging', 'production']).default('production'),
  submissionType: z.string().max(60).optional(),
  /**
   * DEPRECATED / DEV-ONLY (C2C-SUB-003). A caller-supplied descriptor names a
   * server filesystem path plus its own expected digest, so it is attacker-
   * controlled input upstream of every control. It is REFUSED whenever
   * `bundleTrustEnforced()` is true (i.e. anywhere but a declared local
   * development/test environment). Production callers must pass `packageId`
   * and let the tenant-scoped lookup below produce the descriptor.
   */
  bundle: z.object({
    path:        z.string().min(1),
    sha256:      z.string().regex(/^[0-9a-f]{64}$/i),
    sizeBytes:   z.number().int().nonnegative(),
    format:      z.enum(BUNDLE_FORMAT_SET),
    displayName: z.string().optional(),
  }).optional(),
  metadata: z.record(z.unknown()).optional(),
  reason: z.string().min(8, 'A reason of at least 8 characters is required.'),
  reauth: z
    .object({
      password: z.string().optional(),
      totp: z.string().optional(),
    })
    .optional(),
});

router.post('/gateways/:region/:gateway/transmit', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const userId = getUserId(req);
  const region = req.params.region as Region;
  const gateway = req.params.gateway as GatewayName;
  if (!REGION_SET.includes(region as typeof REGION_SET[number])) {
    return clientError(res, 422, `region must be one of: ${REGION_SET.join(', ')}`);
  }
  if (!GATEWAY_SET.includes(gateway as typeof GATEWAY_SET[number])) {
    return clientError(res, 422, `gateway must be one of: ${GATEWAY_SET.join(', ')}`);
  }
  const parsed = transmitBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  }
  const p = parsed.data;

  // Re-auth gate FIRST (high-risk sign).
  if (userId === null) return orgRequired(res);
  const reauthResult = await verifyReauth(userId, p.reauth);
  if (!reauthResult.ok) {
    res.setHeader('WWW-Authenticate', 'ReAuth required');
    return res.status(401).json({ error: reauthResult.error ?? 'REAUTH_REQUIRED' });
  }
  // Captured here, at the moment the human actually re-authenticated, and
  // handed to the gateway as this transmission's authorization. The gateway
  // layer now refuses any transmit that cannot name a human gate — see
  // TransmitAuthorization in server/services/submission-gateways/types.ts.
  const reauthVerifiedAt = new Date();

  try {
    const outcome = await executeGovernedTransmit({
      region,
      gateway,
      organizationId: orgId,
      userId,
      programId:      p.programId ?? null,
      packageId:      p.packageId ?? null,
      environment:    p.environment,
      submissionType: p.submissionType,
      metadata:       p.metadata,
      reason:         p.reason,
      reauthVerifiedAt,
      clientBundle:   p.bundle ?? null,
      recordGovernedAction,
      log,
      surface: 'submission-gateway',
    });
    /* The governed-action ledger write is the record that this transmission
       happened and who authorised it. executeGovernedTransmit already knows
       when that write failed — it sets `ledgerWriteFailed` and logs
       `transmit-ledger-write-failed-after-successful-transmit` — and the AnA
       command handler propagates it. This HTTP route destructured only
       `.result` and dropped the flag, so bytes could reach FDA ESG or the EMA
       gateway with NO ledger row and the caller would receive an ordinary 201.

       A real regulatory submission the tenant cannot evidence is not a
       submission they can defend, and the one thing worse than the missing row
       is not being told about it. The transmittal itself is real and is still
       returned — this reports the gap alongside it rather than failing a
       transmission that genuinely left the platform. */
    return created(res, {
      ...outcome.result,
      // The package content re-assessed after the send; a change that landed
      // while the bytes were leaving is said, never folded into a clean 201.
      contentAfterTransmit: outcome.contentAfterTransmit,
      ...(outcome.contentAfterTransmit === 'drift' ? { contentWarning: CONTENT_CHANGED_DURING_TRANSMIT } : {}),
      ...(outcome.ledgerWriteFailed
        ? {
            ledgerWriteFailed: true,
            ledgerWarning:
              'The transmission completed, but its governed-action ledger entry could not be written. Record this transmittal manually and raise it with your administrator before relying on the audit trail.',
          }
        : {}),
    });
  } catch (err: unknown) {
    // Honest pre-transmit refusals: nothing left the platform, so there is no
    // transmittal, no acknowledgement and no agency identifier to report.
    if (err instanceof GovernedTransmitRefusal) {
      return clientError(res, err.httpStatus, err.message, err.details);
    }
    if (err instanceof GovernedTransmitInternalError) {
      return serverError(res, log, err.stage, err.cause);
    }
    if (err instanceof CredentialError) {
      return clientError(res, 412, err.message);
    }
    if (err instanceof ValidationError) {
      return clientError(res, 422, err.message, { findings: err.findings });
    }
    if (err instanceof TransportError) {
      return clientError(res, 502, err.message);
    }
    if (err instanceof GatewayError) {
      return clientError(res, 502, err.message, { httpStatus: err.httpStatus, code: err.gatewayCode });
    }
    return serverError(res, log, 'transmit', err);
  }
});

/* ─── GET /api/mdx/gateways/transmittals/:id/status ──────────────── */

router.get('/gateways/transmittals/:id/status', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  try {
    const own = await pool.query<{ region: string; gateway: string }>(
      `SELECT region, gateway FROM submission_transmittals
        WHERE id = $1 AND organization_id = $2`,
      [id, orgId],
    );
    if (own.rows.length === 0) return notFoundInTenant(res, 'Transmittal');
    const gw = getGateway(own.rows[0].region as Region, own.rows[0].gateway as GatewayName);
    const result = await gw.checkStatus(id);
    return ok(res, result);
  } catch (err: unknown) {
    if (err instanceof CredentialError) return clientError(res, 412, err.message);
    if (err instanceof TransportError)  return clientError(res, 502, err.message);
    if (err instanceof GatewayError)    return clientError(res, 502, err.message);
    return serverError(res, log, 'status', err);
  }
});

/* ─── GET /api/mdx/gateways/transmittals/:id/ack ─────────────────── */

router.get('/gateways/transmittals/:id/ack', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  try {
    const own = await pool.query<{ region: string; gateway: string }>(
      `SELECT region, gateway FROM submission_transmittals
        WHERE id = $1 AND organization_id = $2`,
      [id, orgId],
    );
    if (own.rows.length === 0) return notFoundInTenant(res, 'Transmittal');
    const gw = getGateway(own.rows[0].region as Region, own.rows[0].gateway as GatewayName);
    const ack = await gw.downloadAcknowledgment(id);
    res.setHeader('Content-Type', ack.contentType);
    // The filename carries the provenance, because a downloaded file outlives
    // the page that served it — and the previous name, `ack-<id>.txt`, said
    // "acknowledgement" for a document this platform wrote about itself.
    res.setHeader('Content-Disposition', `attachment; filename="${acknowledgementFilename(ack)}"`);
    // Machine-readable for the surface, which decides what to tell the user.
    res.setHeader('X-Ack-Provenance', ack.provenance);
    return res.send(ack.buffer);
  } catch (err: unknown) {
    if (err instanceof GatewayError) return clientError(res, 502, err.message);
    return serverError(res, log, 'ack', err);
  }
});

/* ─── POST /api/mdx/gateways/transmittals/:id/rollback ───────────── */

const rollbackBody = z.object({
  reason: z.string().min(8, 'A rollback reason of at least 8 characters is required.'),
  reauth: z
    .object({
      password: z.string().optional(),
      totp: z.string().optional(),
    })
    .optional(),
});

router.post('/gateways/transmittals/:id/rollback', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const userId = getUserId(req);
  if (userId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  const parsed = rollbackBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  }
  const { reason, reauth } = parsed.data;

  // Re-auth gate — rollback is a high-risk governed action (`transmittal_rollback`
  // is in HIGH_RISK_COMMANDS). Mirrors the transmit handler's gate.
  const reauthResult = await verifyReauth(userId, reauth);
  if (!reauthResult.ok) {
    res.setHeader('WWW-Authenticate', 'ReAuth required');
    return res.status(401).json({ error: reauthResult.error ?? 'REAUTH_REQUIRED' });
  }

  // Tenant gate. Also identifies the region/gateway so non-FDA transmittals
  // (which don't currently have a rollback implementation) get a clean 422
  // rather than a misleading 404 from the FDA-specific helper.
  try {
    const own = await pool.query<{ region: string; gateway: string }>(
      `SELECT region, gateway FROM submission_transmittals
        WHERE id = $1 AND organization_id = $2`,
      [id, orgId],
    );
    if (own.rows.length === 0) return notFoundInTenant(res, 'Transmittal');
    if (own.rows[0].region !== 'fda' || own.rows[0].gateway !== 'esg') {
      return clientError(
        res, 422,
        `Rollback is currently implemented for FDA ESG only; transmittal ${id} is ${own.rows[0].region}/${own.rows[0].gateway}.`,
      );
    }

    const result = await rollbackTransmittal({
      transmittalId:  id,
      organizationId: orgId,
      actorUserId:    userId,
      reason,
      recordGovernedAction,
    });
    return ok(res, result);
  } catch (err: unknown) {
    if (err instanceof RollbackNotPermittedError) {
      return clientError(res, 409, err.message, {
        transmittalId: err.transmittalId,
        status: err.currentStatus,
      });
    }
    if (err instanceof GatewayError) {
      // GatewayError from rollbackTransmittal is the row-not-found case
      // (404). Other GatewayError shapes shouldn't surface here, so map to 502.
      return clientError(res, err.httpStatus === 404 ? 404 : 502, err.message);
    }
    return serverError(res, log, 'transmit-rollback', err);
  }
});

/* ─── POST /api/mdx/gateways/transmittals/:id/findings ───────────── */

const findingBody = z.object({
  validator:   z.enum(['fda_evalidator', 'ema_validator', 'pmda_precheck', 'lorenz', 'globalsubmit', 'internal']),
  severity:    z.enum(['error', 'warning', 'info']),
  ruleId:      z.string().max(60).optional().nullable(),
  ruleTitle:   z.string().max(200).optional().nullable(),
  message:     z.string().min(1).max(2000),
  filePath:    z.string().max(500).optional().nullable(),
  lineNumber:  z.number().int().nonnegative().optional().nullable(),
});

router.post('/gateways/transmittals/:id/findings', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  const parsed = findingBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);

  /* Tenant gate. */
  const own = await pool.query(
    `SELECT 1 FROM submission_transmittals WHERE id = $1 AND organization_id = $2`,
    [id, orgId],
  );
  if (own.rows.length === 0) return notFoundInTenant(res, 'Transmittal');

  const p = parsed.data;
  try {
    const { rows } = await pool.query(
      `INSERT INTO submission_validation_findings (
         transmittal_id, organization_id, validator, severity, rule_id,
         rule_title, message, file_path, line_number
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        id, orgId, p.validator, p.severity, p.ruleId ?? null,
        p.ruleTitle ?? null, p.message, p.filePath ?? null, p.lineNumber ?? null,
      ],
    );
    return created(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'add-finding', err);
  }
});

/* ─── PATCH /api/mdx/gateways/findings/:findingId/resolve ────────── */

const resolveBody = z.object({
  resolutionNote: z.string().max(2000).optional(),
});

router.patch('/gateways/findings/:findingId/resolve', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.findingId);
  if (!Number.isFinite(id)) return clientError(res, 422, 'findingId must be numeric');
  const parsed = resolveBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);

  try {
    const { rows } = await pool.query(
      `UPDATE submission_validation_findings
          SET resolved        = true,
              resolved_at     = NOW(),
              resolved_by     = $3,
              resolution_note = $4
        WHERE id = $1 AND organization_id = $2
        RETURNING *`,
      [id, orgId, getUserId(req), parsed.data.resolutionNote ?? null],
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Finding');
    return ok(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'resolve-finding', err);
  }
});

export default router;
