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
  type Region, type GatewayName,
} from '../services/submission-gateways';
import { recordGovernedAction, verifyReauth } from './c2c/actions';
import { getBundle } from '../services/submission-bundle-storage';
import { promises as fsp } from 'fs';
import { dirname } from 'path';

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

/**
 * Rematerialize a bundle's local file from durable storage if it is missing.
 *
 * Bundles are local-first, but ephemeral containers can recycle between assemble
 * and transmit. If the local file at bundle.path is gone AND the descriptor
 * records a durable S3 copy, download it back to bundle.path before the gateway
 * reads it. No-op when the local file is present, when there is no storage
 * descriptor, or when provider is 'local'. A genuinely-missing local file with
 * no durable copy is left for the gateway's integrity gate to refuse (422).
 */
async function ensureBundleLocal(bundle: {
  path: string;
  storage?: { provider: 'local' } | { provider: 's3'; bucket: string; key: string };
}): Promise<void> {
  try {
    await fsp.access(bundle.path);
    return; // local file present — nothing to do
  } catch {
    // local file missing — fall through to durable rematerialization
  }
  if (bundle.storage?.provider !== 's3') return; // no durable copy to restore
  const buf = await getBundle(bundle.storage.key);
  await fsp.mkdir(dirname(bundle.path), { recursive: true });
  await fsp.writeFile(bundle.path, buf);
}

const REGION_SET   = ['fda', 'ema', 'pmda'] as const;
const GATEWAY_SET  = ['esg', 'cesp', 'eudamed', 'pmda_gateway'] as const;
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
  bundle: z.object({
    path:        z.string().min(1),
    sha256:      z.string().regex(/^[0-9a-f]{64}$/i),
    sizeBytes:   z.number().int().nonnegative(),
    format:      z.enum(['ectd', 'estar', 'eudamed_register', 'pmda_ectd']),
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

  // Resolve the bundle. An explicit `bundle` in the body always wins (back-compat).
  // Otherwise, if a `packageId` is provided, load the stored bundle descriptor that
  // the assemble endpoint persisted on c2c_submission_packages.metadata.bundle.
  let bundle: {
    path: string;
    sha256: string;
    sizeBytes: number;
    format: 'ectd' | 'estar' | 'eudamed_register' | 'pmda_ectd';
    displayName?: string;
    storage?: { provider: 'local' } | { provider: 's3'; bucket: string; key: string };
    validation?: { errorCount: number; warningCount?: number; infoCount?: number; findings?: unknown[] };
  } | null = p.bundle ?? null;

  if (!bundle && p.packageId != null) {
    try {
      const { rows } = await pool.query<{ metadata: any }>(
        `SELECT metadata FROM c2c_submission_packages
          WHERE id = $1 AND org_id = $2`,
        [p.packageId, orgId],
      );
      const stored = rows[0]?.metadata?.bundle;
      if (
        stored &&
        typeof stored.path === 'string' &&
        typeof stored.sha256 === 'string' &&
        typeof stored.sizeBytes === 'number' &&
        typeof stored.format === 'string'
      ) {
        bundle = {
          path:        stored.path,
          sha256:      stored.sha256,
          sizeBytes:   stored.sizeBytes,
          format:      stored.format,
          displayName: typeof stored.displayName === 'string' ? stored.displayName : undefined,
          // Carry the durable-storage descriptor (if any) so ensureBundleLocal can
          // rematerialize the local file after a container recycle. Not passed to
          // the gateway — the gateway contract stays path/sha256/sizeBytes/format.
          storage:     stored.storage && typeof stored.storage === 'object' ? stored.storage : undefined,
          // Carry internal eCTD structural validation findings (if any) so the
          // transmit hard-gate can block on error-severity findings.
          validation:  stored.validation && typeof stored.validation === 'object' ? stored.validation : undefined,
        };
      }
    } catch (err) {
      return serverError(res, log, 'transmit-load-bundle', err);
    }
  }

  if (!bundle) {
    return clientError(
      res,
      422,
      'No assembled bundle; call POST /api/submission-ops/packages/:packageId/assemble first.',
    );
  }

  // Internal eCTD structural-validation hard-gate. If the stored descriptor
  // recorded error-severity findings at assemble-time, refuse the transmit and
  // return the findings so the caller can re-assemble after fixing. Warnings do
  // NOT block. A missing `validation` field is treated as zero errors
  // (back-compat: explicit-bundle callers and pre-existing descriptors). This
  // runs AFTER the re-auth gate — governance order is unchanged. Note: this is
  // INTERNAL structural validation only, not an agency validator.
  const errorCount = bundle.validation?.errorCount ?? 0;
  if (errorCount > 0) {
    return clientError(
      res,
      422,
      `Bundle failed eCTD structural validation (${errorCount} error${errorCount === 1 ? '' : 's'}); re-assemble after fixing.`,
      { findings: bundle.validation?.findings ?? [] },
    );
  }

  // Rematerialize the local bundle file from durable storage if a container
  // recycle lost it since assembly. No-op for local-only descriptors.
  try {
    await ensureBundleLocal(bundle);
  } catch (err) {
    return serverError(res, log, 'transmit-rematerialize-bundle', err);
  }

  try {
    const gw = getGateway(region, gateway);
    const result = await gw.transmit({
      organizationId: orgId,
      userId,
      programId:      p.programId ?? null,
      packageId:      p.packageId ?? null,
      bundle: {
        path:        bundle.path,
        sha256:      bundle.sha256,
        sizeBytes:   bundle.sizeBytes,
        format:      bundle.format,
        displayName: bundle.displayName,
      },
      environment:    p.environment,
      submissionType: p.submissionType,
      metadata:       { ...(p.metadata ?? {}), environment: p.environment },
    });

    // Record the governed sign AFTER the external transmit succeeds. The
    // external transmit is irreversible, so if the ledger write fails we log
    // it and still return the transmit result (the gateway already accepted
    // the package). The transmittal row written by gw.transmit() remains the
    // authoritative external record in that edge case.
    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await recordGovernedAction(client, {
          orgId,
          userId,
          command: 'sign',
          target: `submission:${p.packageId ?? p.programId ?? 'pkg'}`,
          reason: p.reason,
          payload: {
            meaning: 'submission',
            region,
            gateway,
            bundleSha256: bundle.sha256,
            transactionId: (result as any)?.transactionId ?? null,
          },
          domain: 'mdx',
          surface: 'submission-gateway',
        });
        await client.query('COMMIT');
      } catch (ledgerErr) {
        try { await client.query('ROLLBACK'); } catch { /* noop */ }
        throw ledgerErr;
      } finally {
        client.release();
      }
    } catch (ledgerErr: any) {
      log.error('transmit-ledger-write-failed-after-successful-transmit', {
        message: ledgerErr?.message,
        region,
        gateway,
      });
    }

    return created(res, result);
  } catch (err: unknown) {
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
    res.setHeader('Content-Disposition', `attachment; filename="ack-${ack.transmissionId}.txt"`);
    return res.send(ack.buffer);
  } catch (err: unknown) {
    if (err instanceof GatewayError) return clientError(res, 502, err.message);
    return serverError(res, log, 'ack', err);
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
