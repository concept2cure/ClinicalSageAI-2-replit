/**
 * Health Canada CESG — the Common Electronic Submissions Gateway operated by
 * Health Canada / Santé Canada for regulatory transactions (drugs and medical
 * devices). Per the Health Canada "Guidance Document: Preparation of Regulatory
 * Activities in the eCTD Format" and the CESG onboarding specification.
 *
 * Transport: HTTPS POST with mTLS, JSON metadata + a zipped eCTD package
 * (CA Module 1 under m1/ca/, ca-regional.xml backbone) as a multipart upload.
 * CESG historically also exposes an AS2 path shared with the FDA ESG technology
 * stack; we implement the REST path (the route Health Canada has been
 * modernising toward), mirroring the PMDA gateway so the dispatch layer stays
 * protocol-agnostic.
 *
 * Key facts:
 *   - Endpoint: https://cesg.hc-sc.gc.ca/submission/v1/* (production)
 *               https://cesg-test.hc-sc.gc.ca/submission/v1/* (staging)
 *   - Authentication: mTLS using a Health-Canada-issued client certificate
 *     plus an HMAC-SHA256 request signature (same canonical form as PMDA)
 *   - Package: CA eCTD zip with Module 1 under m1/ca/ + ca-regional.xml
 *   - Acks: 'receipt' (transport), 'pre-check' (validation), 'accepted' (final)
 *
 * Honesty: when CESG credentials aren't configured for the (org, environment)
 * the gateway throws CredentialError — never a fabricated receipt. Status and
 * acknowledgement reads fall back to last-known DB state when a live poll
 * cannot be performed.
 */

import { promises as fs } from 'fs';
import { createHash, createHmac } from 'crypto';
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
} from './types';

interface HcCredentials {
  endpointUrl:   string;
  companyId:     string;        // Health-Canada-issued company / dossier owner id
  clientCertPem: string;        // HC-issued client cert (periodic rotation)
  clientKeyPem:  string;
  hmacSecret:    string;        // shared secret for request signing
}

async function loadHcCredentials(
  environment: 'staging' | 'production',
): Promise<HcCredentials> {
  const prefix = environment === 'production' ? 'HC_CESG_' : 'HC_CESG_STAGING_';
  const endpointUrl = process.env[prefix + 'URL'];
  const companyId   = process.env[prefix + 'COMPANY_ID'];
  const certPath    = process.env[prefix + 'CERT_PATH'];
  const keyPath     = process.env[prefix + 'KEY_PATH'];
  const hmacSecret  = process.env[prefix + 'HMAC_SECRET'];
  const missing: string[] = [];
  if (!endpointUrl) missing.push(prefix + 'URL');
  if (!companyId)   missing.push(prefix + 'COMPANY_ID');
  if (!certPath)    missing.push(prefix + 'CERT_PATH');
  if (!keyPath)     missing.push(prefix + 'KEY_PATH');
  if (!hmacSecret)  missing.push(prefix + 'HMAC_SECRET');
  if (missing.length > 0) {
    throw new CredentialError('ca', 'hc_cesg', environment, missing);
  }
  const [clientCertPem, clientKeyPem] = await Promise.all([
    fs.readFile(certPath!, 'utf8'),
    fs.readFile(keyPath!, 'utf8'),
  ]);
  return {
    endpointUrl: endpointUrl!,
    companyId: companyId!,
    clientCertPem, clientKeyPem,
    hmacSecret: hmacSecret!,
  };
}

/**
 * Build the CESG HMAC signature. Per the CESG REST spec (aligned with PMDA's
 * scheme), signature = HMAC-SHA256(secret, METHOD + '\n' + PATH + '\n' + DATE
 * + '\n' + SHA256(body)).
 */
function buildHcSignature(
  method: string, path: string, date: string, bodySha256: string, secret: string,
): string {
  const canonical = `${method}\n${path}\n${date}\n${bodySha256}`;
  return createHmac('sha256', secret).update(canonical).digest('hex');
}

interface HcResponse {
  httpStatus: number;
  body:       Buffer;
  headers:    Record<string, string | string[] | undefined>;
}

function postHc(
  endpoint: string, headers: Record<string, string>, body: Buffer, creds: HcCredentials,
): Promise<HcResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint);
    const req = https.request({
      hostname: url.hostname,
      port:     url.port ? Number(url.port) : 443,
      path:     url.pathname + url.search,
      method:   'POST',
      headers,
      cert:     creds.clientCertPem,
      key:      creds.clientKeyPem,
      rejectUnauthorized: true,
      timeout:  300_000,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({
        httpStatus: res.statusCode ?? 0,
        body: Buffer.concat(chunks),
        headers: res.headers as Record<string, string | string[] | undefined>,
      }));
    });
    req.on('error', (err) => reject(new TransportError(`Health Canada CESG POST failed: ${err.message}`, err)));
    req.on('timeout', () => { req.destroy(); reject(new TransportError('Health Canada CESG POST timeout')); });
    req.write(body);
    req.end();
  });
}

function getHc(
  endpoint: string, headers: Record<string, string>, creds: HcCredentials,
): Promise<HcResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint);
    const req = https.request({
      hostname: url.hostname,
      port:     url.port ? Number(url.port) : 443,
      path:     url.pathname + url.search,
      method:   'GET',
      headers,
      cert:     creds.clientCertPem,
      key:      creds.clientKeyPem,
      rejectUnauthorized: true,
      timeout:  60_000,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({
        httpStatus: res.statusCode ?? 0,
        body: Buffer.concat(chunks),
        headers: res.headers as Record<string, string | string[] | undefined>,
      }));
    });
    req.on('error', (err) => reject(new TransportError(`Health Canada CESG GET failed: ${err.message}`, err)));
    req.on('timeout', () => { req.destroy(); reject(new TransportError('Health Canada CESG GET timeout')); });
    req.end();
  });
}

async function createTransmittalRow(req: GatewayTransmitRequest): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO submission_transmittals (
       organization_id, program_id, package_id, region, gateway, format,
       submission_type, transport, bundle_path, bundle_sha256,
       bundle_size_bytes, status, submitted_by, metadata
     ) VALUES ($1, $2, $3, 'ca', 'hc_cesg', 'ectd', $4, 'rest', $5, $6, $7, 'pending', $8, $9)
     RETURNING id`,
    [
      req.organizationId, req.programId, req.packageId,
      req.submissionType ?? null,
      req.bundle.path, req.bundle.sha256, req.bundle.sizeBytes, req.userId,
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

export class HealthCanadaGateway implements SubmissionGateway {
  readonly region    = 'ca' as const;
  readonly gateway   = 'hc_cesg' as const;
  readonly transport = 'rest' as const;

  async isConfigured(_orgId: number, environment: 'staging' | 'production'): Promise<boolean> {
    try { await loadHcCredentials(environment); return true; }
    catch (err) { return !(err instanceof CredentialError); }
  }

  async transmit(req: GatewayTransmitRequest): Promise<GatewayTransmitResult> {
    /* Resolve the caller-supplied submission type through the canonical bridge
       so the transmittal row and CESG metadata use the canonical identifier.
       Falls back to the raw string for unrecognized types. */
    const resolvedEntry = req.submissionType ? resolveToRegistryEntry(req.submissionType) : null;
    const normalizedReq: GatewayTransmitRequest = resolvedEntry
      ? { ...req, submissionType: resolvedEntry.applicationType }
      : req;

    const transmittalId = await createTransmittalRow(normalizedReq);
    try {
      const creds = await loadHcCredentials(normalizedReq.environment);
      await updateTransmittal(transmittalId, { status: 'in_transit' });

      const zipBuf = await readVerifiedBundle(normalizedReq.bundle);
      const boundary = `----c2c-hccesg-${Date.now()}`;
      const metaPart = Buffer.from(
        JSON.stringify({
          companyId:      creds.companyId,
          dossierId:      normalizedReq.metadata?.applicationId ?? normalizedReq.metadata?.dossierId ?? null,
          sequenceNumber: normalizedReq.metadata?.sequence ?? '0000',
          submissionType: normalizedReq.submissionType ?? 'initial',
          productName:    normalizedReq.metadata?.productName ?? null,
          sha256:         normalizedReq.bundle.sha256,
        }),
        'utf8',
      );
      const parts: Buffer[] = [
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\nContent-Type: application/json; charset=utf-8\r\n\r\n`),
        metaPart,
        Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="package"; filename="ectd-ca.zip"\r\nContent-Type: application/zip\r\n\r\n`),
        zipBuf,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ];
      const body = Buffer.concat(parts);

      const path = '/submission/v1/submissions';
      const date = new Date().toUTCString();
      const bodySha = createHash('sha256').update(body).digest('hex');
      const signature = buildHcSignature('POST', path, date, bodySha, creds.hmacSecret);

      const headers = {
        'Content-Type':     `multipart/form-data; boundary=${boundary}`,
        'Content-Length':   String(body.length),
        'X-HC-Company':     creds.companyId,
        'X-HC-Date':        date,
        'X-HC-Signature':   signature,
        'X-HC-Sha256':      bodySha,
        'Accept':           'application/json',
        'Accept-Language':  'en-CA, fr-CA',
      };

      const resp = await postHc(
        `${creds.endpointUrl.replace(/\/$/, '')}${path}`, headers, body, creds,
      );

      if (resp.httpStatus < 200 || resp.httpStatus >= 300) {
        await updateTransmittal(transmittalId, {
          status: 'rejected', httpStatus: resp.httpStatus, errorClass: 'gateway',
          errorMessage: `HTTP ${resp.httpStatus}: ${resp.body.toString('utf8').slice(0, 500)}`,
        });
        throw new GatewayError(`Health Canada CESG returned HTTP ${resp.httpStatus}`, resp.httpStatus, null, resp.body.toString('utf8'));
      }
      let parsed: { receiptId?: string; submissionId?: string };
      try { parsed = JSON.parse(resp.body.toString('utf8')); }
      catch {
        throw new GatewayError('Health Canada CESG returned non-JSON success', resp.httpStatus, null, resp.body.toString('utf8'));
      }
      const receiptId = parsed.receiptId ?? parsed.submissionId ?? null;
      if (!receiptId) {
        // A 2xx whose body names no receipt is not an accepted submission. This
        // minted `hc-<timestamp>` here, recorded the row as received with an
        // acknowledgement time from the platform clock, told the operator
        // "accepted. Receipt: hc-…", and later polled the agency for a
        // receipt that never existed. CESP refuses the same case; so does this.
        await updateTransmittal(transmittalId, {
          status: 'rejected', httpStatus: resp.httpStatus,
          errorClass: 'gateway', errorMessage: 'Agency returned success with no receipt identifier in the body.',
        });
        throw new GatewayError('HC response missing a receipt identifier', resp.httpStatus, null, parsed);
      }
      await updateTransmittal(transmittalId, {
        status: 'received', transmissionId: receiptId,
        httpStatus: resp.httpStatus, ackReceivedAt: new Date(),
      });
      return {
        transmittalId, transmissionId: receiptId, status: 'received', transport: 'rest',
        httpStatus: resp.httpStatus, ackReceivedAt: new Date(),
        message: `Health Canada CESG submission accepted. Receipt: ${receiptId}.`,
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
      transmission_id: string | null; status: string; ack_received_at: Date | null;
      metadata: Record<string, unknown> | null;
    }>(
      `SELECT transmission_id, status, ack_received_at, metadata FROM submission_transmittals
        WHERE id = $1 AND region = 'ca' AND gateway = 'hc_cesg'`,
      [transmittalId],
    );
    if (rows.length === 0 || !rows[0].transmission_id) {
      throw new GatewayError(`Transmittal ${transmittalId} not found`, 404, null, null);
    }
    /* Live status poll via /receipts/{id}. */
    try {
      const env = (rows[0].metadata?.environment as 'staging' | 'production' | undefined) ?? 'production';
      const creds = await loadHcCredentials(env);
      const date = new Date().toUTCString();
      const path = `/submission/v1/receipts/${encodeURIComponent(rows[0].transmission_id)}`;
      const sig = buildHcSignature('GET', path, date, '', creds.hmacSecret);
      const resp = await getHc(
        `${creds.endpointUrl.replace(/\/$/, '')}${path}`,
        {
          'X-HC-Company':   creds.companyId,
          'X-HC-Date':      date,
          'X-HC-Signature': sig,
          'Accept':         'application/json',
        },
        creds,
      );
      if (resp.httpStatus === 200) {
        const parsed = JSON.parse(resp.body.toString('utf8')) as { status?: string };
        const mapped: SubmissionStatus =
            parsed.status === 'received'           ? 'received'
          : parsed.status === 'pre_check_passed'   ? 'validation_passed'
          : parsed.status === 'pre_check_failed'   ? 'validation_failed'
          : parsed.status === 'accepted'           ? 'review_started'
          : (rows[0].status as SubmissionStatus);
        if (mapped !== rows[0].status) {
          await updateTransmittal(transmittalId, { status: mapped });
        }
        return {
          transmittalId,
          transmissionId: rows[0].transmission_id,
          status: mapped,
          ackReceivedAt: rows[0].ack_received_at,
          rawResponse: parsed,
        };
      }
    } catch {
      /* Fall through to last-known DB state. */
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
        WHERE id = $1 AND region = 'ca' AND gateway = 'hc_cesg'`,
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
      gatewayLabel: 'Health Canada CESG (hc_cesg)',
      status: r.status,
      ackReceivedAt: r.ack_received_at,
      extra: { 'Receipt': r.transmission_id },
    });
  }
}
