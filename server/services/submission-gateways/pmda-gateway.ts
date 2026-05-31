/**
 * PMDA Gateway — Japan's regulatory submission gateway operated by
 * Pharmaceuticals and Medical Devices Agency. Per the "Notification on
 * Electronic Common Technical Document" (2016, updated 2021) and the
 * PMDA Gateway System Operating Procedure (2022).
 *
 * Transport: HTTPS POST with mTLS, JSON metadata + zipped eCTD package
 * as multipart upload. PMDA also exposes a SOAP-based status query API
 * for legacy clients; we implement the REST path (preferred since 2022).
 *
 * Key differences from FDA ESG / EMA CESP:
 *   - Endpoint: https://gateway.pmda.go.jp/submission/v1/* (production)
 *               https://gateway-test.pmda.go.jp/submission/v1/* (staging)
 *   - Authentication: mTLS using a PMDA-issued client certificate
 *     (rotated annually) + an HMAC-SHA256 request signature
 *   - Package: eCTD-JP zip with Module 1 under m1/jp/ + jp-regional.xml
 *   - Multi-byte filenames + titles require UTF-8 with BOM in metadata
 *   - Pre-validation: PMDA runs their own validator after upload + emits
 *     a result via /receipts/{id}; ack types are 'receipt' (transport),
 *     'pre-check' (validation), and 'review-accepted' (final)
 */

import { promises as fs } from 'fs';
import { createHash, createHmac } from 'crypto';
import * as https from 'https';
import { URL } from 'url';
import { pool } from '../../db';
import { readVerifiedBundle } from './bundle-integrity';
import {
  CredentialError, GatewayError, TransportError,
  type GatewayAcknowledgment, type GatewayStatusResult, type GatewayTransmitRequest,
  type GatewayTransmitResult, type SubmissionGateway, type SubmissionStatus,
} from './types';

interface PmdaCredentials {
  endpointUrl:    string;
  applicantId:    string;        // PMDA-issued applicant id
  clientCertPem:  string;        // PMDA-issued client cert (annual rotation)
  clientKeyPem:   string;
  hmacSecret:     string;        // shared secret for request signing
}

async function loadPmdaCredentials(
  environment: 'staging' | 'production',
): Promise<PmdaCredentials> {
  const prefix = environment === 'production' ? 'PMDA_' : 'PMDA_STAGING_';
  const endpointUrl = process.env[prefix + 'URL'];
  const applicantId = process.env[prefix + 'APPLICANT_ID'];
  const certPath    = process.env[prefix + 'CERT_PATH'];
  const keyPath     = process.env[prefix + 'KEY_PATH'];
  const hmacSecret  = process.env[prefix + 'HMAC_SECRET'];
  const missing: string[] = [];
  if (!endpointUrl) missing.push(prefix + 'URL');
  if (!applicantId) missing.push(prefix + 'APPLICANT_ID');
  if (!certPath)    missing.push(prefix + 'CERT_PATH');
  if (!keyPath)     missing.push(prefix + 'KEY_PATH');
  if (!hmacSecret)  missing.push(prefix + 'HMAC_SECRET');
  if (missing.length > 0) {
    throw new CredentialError('pmda', 'pmda_gateway', environment, missing);
  }
  const [clientCertPem, clientKeyPem] = await Promise.all([
    fs.readFile(certPath!, 'utf8'),
    fs.readFile(keyPath!, 'utf8'),
  ]);
  return {
    endpointUrl: endpointUrl!,
    applicantId: applicantId!,
    clientCertPem, clientKeyPem,
    hmacSecret: hmacSecret!,
  };
}

/**
 * Build the PMDA HMAC signature string. Per the PMDA Gateway spec,
 * signature = HMAC-SHA256(secret, METHOD + '\n' + PATH + '\n' + DATE
 * + '\n' + SHA256(body)).
 */
function buildPmdaSignature(
  method: string, path: string, date: string, bodySha256: string, secret: string,
): string {
  const canonical = `${method}\n${path}\n${date}\n${bodySha256}`;
  return createHmac('sha256', secret).update(canonical).digest('hex');
}

interface PmdaResponse {
  httpStatus: number;
  body:       Buffer;
  headers:    Record<string, string | string[] | undefined>;
}

function postPmda(
  endpoint: string, headers: Record<string, string>, body: Buffer, creds: PmdaCredentials,
): Promise<PmdaResponse> {
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
    req.on('error', (err) => reject(new TransportError(`PMDA POST failed: ${err.message}`, err)));
    req.on('timeout', () => { req.destroy(); reject(new TransportError('PMDA POST timeout')); });
    req.write(body);
    req.end();
  });
}

function getPmda(
  endpoint: string, headers: Record<string, string>, creds: PmdaCredentials,
): Promise<PmdaResponse> {
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
    req.on('error', (err) => reject(new TransportError(`PMDA GET failed: ${err.message}`, err)));
    req.on('timeout', () => { req.destroy(); reject(new TransportError('PMDA GET timeout')); });
    req.end();
  });
}

async function createTransmittalRow(req: GatewayTransmitRequest): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO submission_transmittals (
       organization_id, program_id, package_id, region, gateway, format,
       submission_type, transport, bundle_path, bundle_sha256,
       bundle_size_bytes, status, submitted_by, metadata
     ) VALUES ($1, $2, $3, 'pmda', 'pmda_gateway', 'pmda_ectd', $4, 'rest', $5, $6, $7, 'pending', $8, $9)
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

export class PmdaGateway implements SubmissionGateway {
  readonly region    = 'pmda' as const;
  readonly gateway   = 'pmda_gateway' as const;
  readonly transport = 'rest' as const;

  async isConfigured(_orgId: number, environment: 'staging' | 'production'): Promise<boolean> {
    try { await loadPmdaCredentials(environment); return true; }
    catch (err) { return !(err instanceof CredentialError); }
  }

  async transmit(req: GatewayTransmitRequest): Promise<GatewayTransmitResult> {
    const transmittalId = await createTransmittalRow(req);
    try {
      const creds = await loadPmdaCredentials(req.environment);
      await updateTransmittal(transmittalId, { status: 'in_transit' });

      const zipBuf = await readVerifiedBundle(req.bundle);
      const boundary = `----c2c-pmda-${Date.now()}`;
      const metaPart = Buffer.from(
        '﻿' + JSON.stringify({
          applicantId:     creds.applicantId,
          applicationId:   req.metadata?.applicationId ?? null,
          sequenceNumber:  req.metadata?.sequence ?? '0001',
          submissionType:  req.submissionType ?? 'initial',
          productName:     req.metadata?.productName ?? null,
          sha256:          req.bundle.sha256,
        }),
        'utf8',
      );
      const parts: Buffer[] = [
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\nContent-Type: application/json; charset=utf-8\r\n\r\n`),
        metaPart,
        Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="package"; filename="ectd-jp.zip"\r\nContent-Type: application/zip\r\n\r\n`),
        zipBuf,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ];
      const body = Buffer.concat(parts);

      const path = '/submission/v1/submissions';
      const date = new Date().toUTCString();
      const bodySha = createHash('sha256').update(body).digest('hex');
      const signature = buildPmdaSignature('POST', path, date, bodySha, creds.hmacSecret);

      const headers = {
        'Content-Type':       `multipart/form-data; boundary=${boundary}`,
        'Content-Length':     String(body.length),
        'X-PMDA-Applicant':   creds.applicantId,
        'X-PMDA-Date':        date,
        'X-PMDA-Signature':   signature,
        'X-PMDA-Sha256':      bodySha,
        'Accept':             'application/json',
        'Accept-Language':    'ja-JP, en-US',
      };

      const resp = await postPmda(
        `${creds.endpointUrl.replace(/\/$/, '')}${path}`, headers, body, creds,
      );

      if (resp.httpStatus < 200 || resp.httpStatus >= 300) {
        await updateTransmittal(transmittalId, {
          status: 'rejected', httpStatus: resp.httpStatus, errorClass: 'gateway',
          errorMessage: `HTTP ${resp.httpStatus}: ${resp.body.toString('utf8').slice(0, 500)}`,
        });
        throw new GatewayError(`PMDA returned HTTP ${resp.httpStatus}`, resp.httpStatus, null, resp.body.toString('utf8'));
      }
      let parsed: { receiptId?: string; submissionId?: string };
      try { parsed = JSON.parse(resp.body.toString('utf8')); }
      catch {
        throw new GatewayError('PMDA returned non-JSON success', resp.httpStatus, null, resp.body.toString('utf8'));
      }
      const receiptId = parsed.receiptId ?? parsed.submissionId ?? `pmda-${Date.now()}`;
      await updateTransmittal(transmittalId, {
        status: 'received', transmissionId: receiptId,
        httpStatus: resp.httpStatus, ackReceivedAt: new Date(),
      });
      return {
        transmittalId, transmissionId: receiptId, status: 'received', transport: 'rest',
        httpStatus: resp.httpStatus, ackReceivedAt: new Date(),
        message: `PMDA Gateway submission accepted. Receipt: ${receiptId}.`,
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
        WHERE id = $1 AND region = 'pmda' AND gateway = 'pmda_gateway'`,
      [transmittalId],
    );
    if (rows.length === 0 || !rows[0].transmission_id) {
      throw new GatewayError(`Transmittal ${transmittalId} not found`, 404, null, null);
    }
    /* Live status poll via /receipts/{id}. */
    try {
      const env = (rows[0].metadata?.environment as 'staging' | 'production' | undefined) ?? 'production';
      const creds = await loadPmdaCredentials(env);
      const date = new Date().toUTCString();
      const path = `/submission/v1/receipts/${encodeURIComponent(rows[0].transmission_id)}`;
      const sig = buildPmdaSignature('GET', path, date, '', creds.hmacSecret);
      const resp = await getPmda(
        `${creds.endpointUrl.replace(/\/$/, '')}${path}`,
        {
          'X-PMDA-Applicant': creds.applicantId,
          'X-PMDA-Date':      date,
          'X-PMDA-Signature': sig,
          'Accept':           'application/json',
        },
        creds,
      );
      if (resp.httpStatus === 200) {
        const parsed = JSON.parse(resp.body.toString('utf8')) as { status?: string };
        const mapped: SubmissionStatus =
            parsed.status === 'received'           ? 'received'
          : parsed.status === 'pre_check_passed'   ? 'validation_passed'
          : parsed.status === 'pre_check_failed'   ? 'validation_failed'
          : parsed.status === 'review_accepted'    ? 'review_started'
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
      /* Fall through. */
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
        WHERE id = $1 AND region = 'pmda' AND gateway = 'pmda_gateway'`,
      [transmittalId],
    );
    if (rows.length === 0) {
      throw new GatewayError(`Transmittal ${transmittalId} not found`, 404, null, null);
    }
    const r = rows[0];
    const text = `PMDA Gateway Acknowledgement\nReceipt: ${r.transmission_id}\nStatus: ${r.status}\nReceived: ${r.ack_received_at?.toISOString() ?? 'pending'}\n`;
    return {
      transmittalId, transmissionId: r.transmission_id,
      contentType: 'text/plain', buffer: Buffer.from(text, 'utf8'),
      receivedAt: r.ack_received_at ?? new Date(),
    };
  }
}
