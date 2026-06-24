/**
 * Shared transport + DB primitives for REST-based submission gateways.
 *
 * The 8 non-ESG/CESP/PMDA/HC gateways (MHRA, NMPA, TGA, Swissmedic, ANVISA,
 * CDSCO, MFDS, HSA) all use HTTPS multipart POST with agency-specific auth
 * headers. This module provides the common primitives so each gateway file
 * stays focused on credential loading and auth construction.
 */

import { createHash, createHmac } from 'crypto';
import * as https from 'https';
import { URL } from 'url';
import { pool } from '../../db';
import { TransportError } from './types';
import type { GatewayTransmitRequest } from './types';

export interface HttpsResponse {
  httpStatus: number;
  body: Buffer;
}

/** Generic HTTPS request. Pass certPem + keyPem for mTLS; omit for API-key-only. */
export function httpsRequest(opts: {
  method: 'GET' | 'POST';
  url: string;
  headers: Record<string, string>;
  body?: Buffer;
  certPem?: string;
  keyPem?: string;
  timeoutMs?: number;
  errorPrefix: string;
}): Promise<HttpsResponse> {
  return new Promise((resolve, reject) => {
    const u = new URL(opts.url);
    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port ? Number(u.port) : 443,
        path: u.pathname + u.search,
        method: opts.method,
        headers: opts.headers,
        cert: opts.certPem,
        key: opts.keyPem,
        rejectUnauthorized: true,
        timeout: opts.timeoutMs ?? 300_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () =>
          resolve({ httpStatus: res.statusCode ?? 0, body: Buffer.concat(chunks) }),
        );
      },
    );
    req.on('error', (e) =>
      reject(new TransportError(`${opts.errorPrefix}: ${e.message}`, e)),
    );
    req.on('timeout', () => {
      req.destroy();
      reject(new TransportError(`${opts.errorPrefix} timeout`));
    });
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

/** HMAC-SHA256 canonical form used by PMDA-style gateways (MFDS, HSA, etc.). */
export function buildHmac(
  method: string,
  path: string,
  date: string,
  bodySha256: string,
  secret: string,
): string {
  return createHmac('sha256', secret)
    .update(`${method}\n${path}\n${date}\n${bodySha256}`)
    .digest('hex');
}

export function sha256hex(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

/** Insert a pending transmittal row; returns the new row id. */
export async function insertTransmittal(
  region: string,
  gateway: string,
  format: string,
  req: GatewayTransmitRequest,
): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO submission_transmittals (
       organization_id, program_id, package_id, region, gateway, format,
       submission_type, transport, bundle_path, bundle_sha256,
       bundle_size_bytes, status, submitted_by, metadata
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,'rest',$8,$9,$10,'pending',$11,$12)
     RETURNING id`,
    [
      req.organizationId,
      req.programId,
      req.packageId,
      region,
      gateway,
      format,
      req.submissionType ?? null,
      req.bundle.path,
      req.bundle.sha256,
      req.bundle.sizeBytes,
      req.userId,
      JSON.stringify(req.metadata ?? {}),
    ],
  );
  return rows[0].id;
}

const COL_MAP: Record<string, string> = {
  status: 'status',
  transmissionId: 'transmission_id',
  httpStatus: 'http_status',
  errorClass: 'error_class',
  errorMessage: 'error_message',
  ackReceivedAt: 'ack_received_at',
  completedAt: 'completed_at',
};

export async function patchTransmittal(
  id: number,
  patch: Record<string, unknown>,
): Promise<void> {
  const frags: string[] = [];
  const args: unknown[] = [];
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const col = COL_MAP[k];
    if (!col) continue;
    args.push(v);
    frags.push(`${col} = $${args.length}`);
  }
  if (frags.length === 0) return;
  frags.push('updated_at = NOW()');
  args.push(id);
  await pool.query(
    `UPDATE submission_transmittals SET ${frags.join(', ')} WHERE id = $${args.length}`,
    args,
  );
}

/** Build a standard multipart/form-data body (metadata JSON + ZIP package). */
export function buildMultipart(
  boundary: string,
  metadata: Buffer,
  zipBuf: Buffer,
  zipFilename: string,
): Buffer {
  return Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\nContent-Type: application/json; charset=utf-8\r\n\r\n`,
    ),
    metadata,
    Buffer.from(
      `\r\n--${boundary}\r\nContent-Disposition: form-data; name="package"; filename="${zipFilename}"\r\nContent-Type: application/zip\r\n\r\n`,
    ),
    zipBuf,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
}

/** Generic error-classification handler for gateway transmit catch blocks. */
export async function handleTransmitError(
  transmittalId: number,
  err: unknown,
  CredentialError: new (...args: unknown[]) => Error & { errorClass: string },
  TransportErrorCls: new (...args: unknown[]) => Error & { errorClass: string },
  GatewayErrorCls: new (...args: unknown[]) => Error & { errorClass: string },
): Promise<void> {
  if (err instanceof CredentialError) {
    await patchTransmittal(transmittalId, {
      status: 'rejected', errorClass: 'auth', errorMessage: (err as Error).message,
    });
  } else if (err instanceof TransportErrorCls) {
    await patchTransmittal(transmittalId, {
      status: 'rejected', errorClass: 'transport', errorMessage: (err as Error).message,
    });
  } else if (!(err instanceof GatewayErrorCls)) {
    await patchTransmittal(transmittalId, {
      status: 'rejected', errorClass: 'gateway',
      errorMessage: err instanceof Error ? err.message : String(err),
    });
  }
}
