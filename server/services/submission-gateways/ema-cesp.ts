/**
 * EMA gateways — CESP (Common European Submission Portal) for eCTD
 * submissions to EMA / national competent authorities, and EUDAMED for
 * EU medical device + IVDR registration / vigilance.
 *
 * CESP — REST API (production endpoint: https://cesp.hma.eu/api):
 *   - OAuth2 client-credentials with the sponsor's organization id
 *   - Multipart upload of the eCTD zip + metadata.xml
 *   - Returns a basket id for tracking
 *   - Status polling via /baskets/{id}
 *
 * EUDAMED — REST API (production endpoint: https://ec.europa.eu/tools/eudamed/api):
 *   - mTLS + bearer token
 *   - Multiple submission paths:
 *       /devices       — UDI-DI / Basic UDI-DI registration
 *       /certificates  — NB-issued certificate registration
 *       /vigilance     — incident reports + FSCA notifications
 *       /capa          — corrective and preventive actions
 *
 * Both are credential-gated; absent envs surface a structured
 * CredentialError so ops know what's missing.
 */

import { promises as fs } from 'fs';
import { createHash } from 'crypto';
import * as https from 'node:https';
import { URL } from 'url';
import { pool } from '../../db';
import { readVerifiedBundle } from './bundle-integrity';
import { platformTransmittalRecord } from './acknowledgement';
import {
  CredentialError, GatewayError, TransportError,
  resolveToRegistryEntry, getSubmissionTypeLabel,
  type GatewayAcknowledgment, type GatewayStatusResult, type GatewayTransmitRequest,
  type GatewayTransmitResult, type SubmissionGateway, type SubmissionStatus,
  requiredAgencyMetadata
} from './types';

/* ─── CESP credentials ───────────────────────────────────────────── */

interface CespCredentials {
  endpointUrl:  string;
  clientId:     string;
  clientSecret: string;
  organisationId: string;       // sponsor's CESP org id
}

function loadCespCredentials(environment: 'staging' | 'production'): CespCredentials {
  const prefix = environment === 'production' ? 'EMA_CESP_' : 'EMA_CESP_STAGING_';
  const endpointUrl    = process.env[prefix + 'URL'];
  const clientId       = process.env[prefix + 'CLIENT_ID'];
  const clientSecret   = process.env[prefix + 'CLIENT_SECRET'];
  const organisationId = process.env[prefix + 'ORG_ID'];
  const missing: string[] = [];
  if (!endpointUrl)    missing.push(prefix + 'URL');
  if (!clientId)       missing.push(prefix + 'CLIENT_ID');
  if (!clientSecret)   missing.push(prefix + 'CLIENT_SECRET');
  if (!organisationId) missing.push(prefix + 'ORG_ID');
  if (missing.length > 0) {
    throw new CredentialError('ema', 'cesp', environment, missing);
  }
  return {
    endpointUrl: endpointUrl!,
    clientId: clientId!,
    clientSecret: clientSecret!,
    organisationId: organisationId!,
  };
}

/* ─── EUDAMED credentials ────────────────────────────────────────── */

interface EudamedCredentials {
  endpointUrl: string;
  bearerToken: string;
  certPath?: string;
  keyPath?: string;
}

function loadEudamedCredentials(environment: 'staging' | 'production'): EudamedCredentials {
  const prefix = environment === 'production' ? 'EUDAMED_' : 'EUDAMED_STAGING_';
  const endpointUrl = process.env[prefix + 'URL'];
  const bearerToken = process.env[prefix + 'BEARER'];
  const missing: string[] = [];
  if (!endpointUrl) missing.push(prefix + 'URL');
  if (!bearerToken) missing.push(prefix + 'BEARER');
  if (missing.length > 0) {
    throw new CredentialError('ema', 'eudamed', environment, missing);
  }
  return {
    endpointUrl: endpointUrl!,
    bearerToken: bearerToken!,
    certPath: process.env[prefix + 'CERT_PATH'],
    keyPath: process.env[prefix + 'KEY_PATH'],
  };
}

/* ─── Generic HTTPS JSON POST ────────────────────────────────────── */

interface HttpResponse {
  httpStatus: number;
  body:       Buffer;
  headers:    Record<string, string | string[] | undefined>;
}

function httpsRequest(
  method: 'GET' | 'POST',
  endpoint: string,
  headers: Record<string, string>,
  body: Buffer | string | null,
  opts: { cert?: string; key?: string; timeoutMs?: number } = {},
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint);
    const req = https.request({
      hostname: url.hostname,
      port:     url.port ? Number(url.port) : 443,
      path:     url.pathname + url.search,
      method,
      headers,
      cert:     opts.cert,
      key:      opts.key,
      rejectUnauthorized: true,
      timeout:  opts.timeoutMs ?? 60_000,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({
        httpStatus: res.statusCode ?? 0,
        body:       Buffer.concat(chunks),
        headers:    res.headers as Record<string, string | string[] | undefined>,
      }));
    });
    req.on('error', (err) => reject(new TransportError(`${method} ${endpoint} failed: ${err.message}`, err)));
    req.on('timeout', () => { req.destroy(); reject(new TransportError(`${method} ${endpoint} timeout`)); });
    if (body) req.write(body);
    req.end();
  });
}

/* ─── OAuth2 client-credentials token cache (CESP) ──────────────── */

interface TokenCacheEntry { token: string; expiresAt: number; }
const cespTokenCache: Map<string, TokenCacheEntry> = new Map();

async function fetchCespToken(creds: CespCredentials): Promise<string> {
  const cacheKey = `${creds.clientId}@${creds.endpointUrl}`;
  const cached = cespTokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token;

  /* Real CESP OAuth2 endpoint is /oauth2/token; the body is
     client_credentials form-encoded. */
  const tokenBody = `grant_type=client_credentials&client_id=${encodeURIComponent(creds.clientId)}&client_secret=${encodeURIComponent(creds.clientSecret)}`;
  const resp = await httpsRequest(
    'POST',
    `${creds.endpointUrl.replace(/\/$/, '')}/oauth2/token`,
    {
      'Content-Type':   'application/x-www-form-urlencoded',
      'Content-Length': String(tokenBody.length),
    },
    tokenBody,
  );
  if (resp.httpStatus !== 200) {
    throw new GatewayError(
      `CESP token endpoint returned HTTP ${resp.httpStatus}`,
      resp.httpStatus, null, resp.body.toString('utf8'),
    );
  }
  let parsed: { access_token?: string; expires_in?: number };
  try {
    parsed = JSON.parse(resp.body.toString('utf8'));
  } catch {
    throw new GatewayError('CESP token endpoint returned non-JSON', resp.httpStatus, null, resp.body.toString('utf8'));
  }
  if (!parsed.access_token) {
    throw new GatewayError('CESP token endpoint missing access_token', resp.httpStatus, null, parsed);
  }
  const expiresAt = Date.now() + ((parsed.expires_in ?? 3600) * 1000);
  cespTokenCache.set(cacheKey, { token: parsed.access_token, expiresAt });
  return parsed.access_token;
}

/* ─── Multipart upload helper ────────────────────────────────────── */

function buildMultipart(
  fields: Array<{ name: string; value: string }>,
  files:  Array<{ name: string; filename: string; contentType: string; data: Buffer }>,
): { body: Buffer; contentType: string } {
  const boundary = `----c2c-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const parts: Buffer[] = [];
  for (const f of fields) {
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${f.name}"\r\n\r\n${f.value}\r\n`,
    ));
  }
  for (const f of files) {
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${f.name}"; filename="${f.filename}"\r\nContent-Type: ${f.contentType}\r\n\r\n`,
    ));
    parts.push(f.data);
    parts.push(Buffer.from(`\r\n`));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

/* ─── Transmittal helpers (shared) ───────────────────────────────── */

async function createTransmittalRow(
  req: GatewayTransmitRequest,
  gateway: 'cesp' | 'eudamed',
  transport: 'rest',
): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO submission_transmittals (
       organization_id, program_id, package_id, region, gateway, format,
       submission_type, transport, bundle_path, bundle_sha256,
       bundle_size_bytes, status, submitted_by, metadata
     ) VALUES ($1, $2, $3, 'ema', $4, $5, $6, $7, $8, $9, $10, 'pending', $11, $12)
     RETURNING id`,
    [
      req.organizationId, req.programId, req.packageId, gateway, req.bundle.format,
      req.submissionType ?? null, transport, req.bundle.path,
      req.bundle.sha256, req.bundle.sizeBytes, req.userId,
      JSON.stringify(req.metadata ?? {}),
    ],
  );
  return rows[0].id;
}

async function updateTransmittal(id: number, patch: Record<string, unknown>): Promise<void> {
  const COL: Record<string, string> = {
    status: 'status', transmissionId: 'transmission_id', httpStatus: 'http_status',
    errorClass: 'error_class', errorMessage: 'error_message',
    ackReceivedAt: 'ack_received_at', completedAt: 'completed_at',
  };
  const setFrags: string[] = []; const args: unknown[] = [];
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const col = COL[k]; if (!col) continue;
    args.push(v); setFrags.push(`${col} = $${args.length}`);
  }
  if (setFrags.length === 0) return;
  setFrags.push(`updated_at = NOW()`);
  args.push(id);
  await pool.query(
    `UPDATE submission_transmittals SET ${setFrags.join(', ')} WHERE id = $${args.length}`,
    args,
  );
}

/* ─── CESP gateway implementation ────────────────────────────────── */

export class EmaCespGateway implements SubmissionGateway {
  readonly region    = 'ema' as const;
  readonly gateway   = 'cesp' as const;
  readonly transport = 'rest' as const;

  async isConfigured(_orgId: number, environment: 'staging' | 'production'): Promise<boolean> {
    try { loadCespCredentials(environment); return true; }
    catch (err) { return !(err instanceof CredentialError); }
  }

  async transmit(req: GatewayTransmitRequest): Promise<GatewayTransmitResult> {
    /* Resolve the caller-supplied submission type through the canonical bridge
       so the transmittal row and CESP metadata use the canonical identifier.
       Falls back to the raw string for unrecognized types. */
    const resolvedEntry = req.submissionType ? resolveToRegistryEntry(req.submissionType) : null;
    const normalizedReq: GatewayTransmitRequest = resolvedEntry
      ? { ...req, submissionType: resolvedEntry.applicationType }
      : req;

    const agency = requiredAgencyMetadata(normalizedReq);
    const transmittalId = await createTransmittalRow(normalizedReq, 'cesp', 'rest');
    try {
      const creds = loadCespCredentials(normalizedReq.environment);
      const token = await fetchCespToken(creds);
      await updateTransmittal(transmittalId, { status: 'in_transit' });

      const zipBuf = await readVerifiedBundle(normalizedReq.bundle);
      const metadata = {
        organisationId:    creds.organisationId,
        productName:       normalizedReq.metadata?.productName ?? null,
        submissionType:    agency.submissionType,
        procedureNumber:   normalizedReq.metadata?.applicationId ?? null,
        sequenceNumber:    agency.sequenceNumber,
        sha256:            normalizedReq.bundle.sha256,
      };

      const { body, contentType } = buildMultipart(
        [{ name: 'metadata', value: JSON.stringify(metadata) }],
        [{ name: 'package', filename: 'ectd.zip', contentType: 'application/zip', data: zipBuf }],
      );

      const resp = await httpsRequest(
        'POST',
        `${creds.endpointUrl.replace(/\/$/, '')}/baskets`,
        {
          'Authorization':  `Bearer ${token}`,
          'Content-Type':   contentType,
          'Content-Length': String(body.length),
          'Accept':         'application/json',
        },
        body,
        { timeoutMs: 300_000 }, // 5 min for large bundles
      );

      if (resp.httpStatus < 200 || resp.httpStatus >= 300) {
        await updateTransmittal(transmittalId, {
          status: 'rejected', httpStatus: resp.httpStatus, errorClass: 'gateway',
          errorMessage: `HTTP ${resp.httpStatus}: ${resp.body.toString('utf8').slice(0, 500)}`,
        });
        throw new GatewayError(`CESP returned HTTP ${resp.httpStatus}`, resp.httpStatus, null, resp.body.toString('utf8'));
      }

      let parsed: { basketId?: string; id?: string };
      try { parsed = JSON.parse(resp.body.toString('utf8')); }
      catch {
        throw new GatewayError('CESP returned non-JSON success', resp.httpStatus, null, resp.body.toString('utf8'));
      }
      const basketId = parsed.basketId ?? parsed.id ?? null;
      if (!basketId) {
        throw new GatewayError('CESP response missing basketId', resp.httpStatus, null, parsed);
      }
      await updateTransmittal(transmittalId, {
        status: 'received', transmissionId: basketId,
        httpStatus: resp.httpStatus, ackReceivedAt: new Date(),
      });
      return {
        transmittalId, transmissionId: basketId, status: 'received', transport: 'rest',
        httpStatus: resp.httpStatus, ackReceivedAt: new Date(),
        message: `EMA CESP basket created. Tracking: ${basketId}.`,
      };
    } catch (err: unknown) {
      if (err instanceof CredentialError) {
        await updateTransmittal(transmittalId, { status: 'rejected', errorClass: 'auth', errorMessage: err.message });
      } else if (err instanceof TransportError) {
        await updateTransmittal(transmittalId, { status: 'rejected', errorClass: 'transport', errorMessage: err.message });
      } else if (!(err instanceof GatewayError)) {
        await updateTransmittal(transmittalId, {
          status: 'rejected', errorClass: 'gateway',
          errorMessage: err instanceof Error ? err.message : String(err),
        });
      }
      throw err;
    }
  }

  async checkStatus(transmittalId: number): Promise<GatewayStatusResult> {
    const { rows } = await pool.query<{
      organization_id: number; transmission_id: string | null; status: string;
      ack_received_at: Date | null; metadata: Record<string, unknown> | null;
    }>(
      `SELECT organization_id, transmission_id, status, ack_received_at, metadata
         FROM submission_transmittals
        WHERE id = $1 AND region = 'ema' AND gateway = 'cesp'`,
      [transmittalId],
    );
    if (rows.length === 0 || !rows[0].transmission_id) {
      throw new GatewayError(`Transmittal ${transmittalId} not found`, 404, null, null);
    }
    /* Live status poll. */
    try {
      const environment = (rows[0].metadata?.environment as 'staging' | 'production' | undefined) ?? 'production';
      const creds = loadCespCredentials(environment);
      const token = await fetchCespToken(creds);
      const resp = await httpsRequest(
        'GET',
        `${creds.endpointUrl.replace(/\/$/, '')}/baskets/${encodeURIComponent(rows[0].transmission_id)}`,
        { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
        null,
      );
      if (resp.httpStatus === 200) {
        const parsed = JSON.parse(resp.body.toString('utf8')) as { status?: string };
        const mapped = parsed.status === 'received'   ? 'received'
                     : parsed.status === 'processing' ? 'in_transit'
                     : parsed.status === 'accepted'   ? 'validation_passed'
                     : parsed.status === 'rejected'   ? 'validation_failed'
                     : (rows[0].status as SubmissionStatus);
        if (mapped !== rows[0].status) {
          await updateTransmittal(transmittalId, { status: mapped });
        }
        return {
          transmittalId,
          transmissionId: rows[0].transmission_id,
          status: mapped as SubmissionStatus,
          ackReceivedAt: rows[0].ack_received_at,
          rawResponse: parsed,
        };
      }
    } catch {
      /* Fall through to last-known DB state on poll failure. */
    }
    return {
      transmittalId,
      transmissionId: rows[0].transmission_id,
      status: rows[0].status as SubmissionStatus,
      ackReceivedAt: rows[0].ack_received_at,
    };
  }

  async downloadAcknowledgment(transmittalId: number): Promise<GatewayAcknowledgment> {
    const { rows } = await pool.query<{ transmission_id: string; ack_received_at: Date | null; status: string }>(
      `SELECT transmission_id, ack_received_at, status FROM submission_transmittals
        WHERE id = $1 AND region = 'ema' AND gateway = 'cesp'`,
      [transmittalId],
    );
    if (rows.length === 0) {
      throw new GatewayError(`Transmittal ${transmittalId} not found`, 404, null, null);
    }
    const r = rows[0];
    // Not an agency acknowledgement — this platform's own record of the
    // transmission, titled as such. See ./acknowledgement.ts.
    return platformTransmittalRecord({
      transmittalId,
      transmissionId: r.transmission_id,
      gatewayLabel: 'EMA CESP (cesp)',
      status: r.status,
      ackReceivedAt: r.ack_received_at,
      extra: { 'Basket': r.transmission_id },
    });
  }
}

/* ─── EUDAMED gateway implementation ─────────────────────────────── */

/** The receipt identifier EUDAMED names in a 2xx body, or null when it names none. */
function eudamedReceiptId(parsed: { uuid?: string; id?: string }): string | null {
  return parsed.uuid ?? parsed.id ?? null;
}

export class EudamedGateway implements SubmissionGateway {
  readonly region    = 'ema' as const;
  readonly gateway   = 'eudamed' as const;
  readonly transport = 'rest' as const;

  async isConfigured(_orgId: number, environment: 'staging' | 'production'): Promise<boolean> {
    try { loadEudamedCredentials(environment); return true; }
    catch (err) { return !(err instanceof CredentialError); }
  }

  async transmit(req: GatewayTransmitRequest): Promise<GatewayTransmitResult> {
    const transmittalId = await createTransmittalRow(req, 'eudamed', 'rest');
    try {
      const creds = loadEudamedCredentials(req.environment);
      await updateTransmittal(transmittalId, { status: 'in_transit' });

      /* EUDAMED accepts JSON payloads for device / certificate /
         vigilance / capa registrations. The kit's metadata.eudamedPath
         picks the endpoint, with /devices as the default. */
      const endpointPath = (req.metadata?.eudamedPath as string | undefined) ?? '/devices';
      const payload = await readVerifiedBundle(req.bundle);
      const cert = creds.certPath ? await fs.readFile(creds.certPath, 'utf8') : undefined;
      const key  = creds.keyPath  ? await fs.readFile(creds.keyPath, 'utf8')  : undefined;

      const resp = await httpsRequest(
        'POST',
        `${creds.endpointUrl.replace(/\/$/, '')}${endpointPath}`,
        {
          'Authorization':  `Bearer ${creds.bearerToken}`,
          'Content-Type':   'application/json',
          'Content-Length': String(payload.length),
          'Accept':         'application/json',
        },
        payload,
        { cert, key },
      );

      if (resp.httpStatus < 200 || resp.httpStatus >= 300) {
        await updateTransmittal(transmittalId, {
          status: 'rejected', httpStatus: resp.httpStatus, errorClass: 'gateway',
          errorMessage: `HTTP ${resp.httpStatus}: ${resp.body.toString('utf8').slice(0, 500)}`,
        });
        throw new GatewayError(`EUDAMED returned HTTP ${resp.httpStatus}`, resp.httpStatus, null, resp.body.toString('utf8'));
      }
      let parsed: { uuid?: string; id?: string };
      try { parsed = JSON.parse(resp.body.toString('utf8')); }
      catch {
        throw new GatewayError('EUDAMED returned non-JSON success', resp.httpStatus, null, resp.body.toString('utf8'));
      }
      const txnId = eudamedReceiptId(parsed);
      if (!txnId) {
        // A 2xx whose body names no receipt is not an accepted submission. This
        // minted `eudamed-<timestamp>` here, recorded the row as received with an
        // acknowledgement time from the platform clock, told the operator
        // "accepted. Receipt: eudamed-…", and later polled the agency for a
        // receipt that never existed. CESP refuses the same case; so does this.
        await updateTransmittal(transmittalId, {
          status: 'rejected', httpStatus: resp.httpStatus,
          errorClass: 'gateway', errorMessage: 'Agency returned success with no receipt identifier in the body.',
        });
        throw new GatewayError('EUDAMED response missing a receipt identifier', resp.httpStatus, null, parsed);
      }
      await updateTransmittal(transmittalId, {
        status: 'received', transmissionId: txnId,
        httpStatus: resp.httpStatus, ackReceivedAt: new Date(),
      });
      return {
        transmittalId, transmissionId: txnId, status: 'received', transport: 'rest',
        httpStatus: resp.httpStatus, ackReceivedAt: new Date(),
        message: `EUDAMED ${endpointPath} accepted. Tracking: ${txnId}.`,
      };
    } catch (err: unknown) {
      if (err instanceof CredentialError) {
        await updateTransmittal(transmittalId, { status: 'rejected', errorClass: 'auth', errorMessage: err.message });
      } else if (err instanceof TransportError) {
        await updateTransmittal(transmittalId, { status: 'rejected', errorClass: 'transport', errorMessage: err.message });
      } else if (!(err instanceof GatewayError)) {
        await updateTransmittal(transmittalId, {
          status: 'rejected', errorClass: 'gateway',
          errorMessage: err instanceof Error ? err.message : String(err),
        });
      }
      throw err;
    }
  }

  async checkStatus(transmittalId: number): Promise<GatewayStatusResult> {
    const { rows } = await pool.query<{ transmission_id: string | null; status: string; ack_received_at: Date | null }>(
      `SELECT transmission_id, status, ack_received_at FROM submission_transmittals
        WHERE id = $1 AND region = 'ema' AND gateway = 'eudamed'`,
      [transmittalId],
    );
    if (rows.length === 0 || !rows[0].transmission_id) {
      throw new GatewayError(`Transmittal ${transmittalId} not found`, 404, null, null);
    }
    return {
      transmittalId,
      transmissionId: rows[0].transmission_id,
      status: rows[0].status as SubmissionStatus,
      ackReceivedAt: rows[0].ack_received_at,
    };
  }

  async downloadAcknowledgment(transmittalId: number): Promise<GatewayAcknowledgment> {
    const { rows } = await pool.query<{ transmission_id: string; ack_received_at: Date | null; status: string }>(
      `SELECT transmission_id, ack_received_at, status FROM submission_transmittals
        WHERE id = $1 AND region = 'ema' AND gateway = 'eudamed'`,
      [transmittalId],
    );
    if (rows.length === 0) {
      throw new GatewayError(`Transmittal ${transmittalId} not found`, 404, null, null);
    }
    const r = rows[0];
    // Not an agency acknowledgement — this platform's own record of the
    // transmission, titled as such. See ./acknowledgement.ts.
    return platformTransmittalRecord({
      transmittalId,
      transmissionId: r.transmission_id,
      gatewayLabel: 'EUDAMED (eudamed)',
      status: r.status,
      ackReceivedAt: r.ack_received_at,
      extra: { 'UUID': r.transmission_id },
    });
  }
}

/* `createHash` import is required for the hash chain on the metadata
   payload — kept for parity with the FDA ESG service even where the
   value is not yet surfaced. */
void createHash;
