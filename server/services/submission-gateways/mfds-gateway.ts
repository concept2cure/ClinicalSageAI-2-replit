/**
 * MFDS dBio Gateway — South Korea's Ministry of Food and Drug Safety.
 * Implements the dBio (Digital Bioinformatics) system REST API for electronic
 * regulatory submissions: new drugs (KFDA form), biosimilars, medical devices
 * (GMP, 510k-equivalent), IVDs, and cosmetics. Per the MFDS Notice No. 2021-71
 * and the dBio Gateway Technical Specification (2022).
 *
 * Transport: HTTPS POST with mTLS (MFDS-issued client cert) + HMAC-SHA256
 * request signature. Same canonical HMAC form as PMDA and Health Canada.
 * Package: ZIP with CTD/eCTD structure; KR-specific Module 1 (m1/kr/).
 *
 * Honesty: throws CredentialError when MFDS credentials are absent — never
 * fabricates a receipt. Status falls back to last-known DB row on poll failure.
 */

import { promises as fs } from 'fs';
import { pool } from '../../db';
import { readVerifiedBundle } from './bundle-integrity';
import {
  CredentialError, GatewayError, TransportError,
  resolveToRegistryEntry,
  type GatewayAcknowledgment, type GatewayStatusResult, type GatewayTransmitRequest,
  type GatewayTransmitResult, type SubmissionGateway, type SubmissionStatus,
  requiredAgencyMetadata
} from './types';
import { httpsRequest, insertTransmittal, patchTransmittal, buildMultipart, buildHmac, sha256hex } from './rest-gateway-helpers';
import { platformTransmittalRecord } from './acknowledgement';

interface MfdsCredentials {
  endpointUrl: string;
  companyId: string;
  clientCertPem: string;
  clientKeyPem: string;
  hmacSecret: string;
}

async function loadCreds(env: 'staging' | 'production'): Promise<MfdsCredentials> {
  const p = env === 'production' ? 'MFDS_' : 'MFDS_STAGING_';
  const endpointUrl = process.env[p + 'URL'];
  const companyId   = process.env[p + 'COMPANY_ID'];
  const certPath    = process.env[p + 'CERT_PATH'];
  const keyPath     = process.env[p + 'KEY_PATH'];
  const hmacSecret  = process.env[p + 'HMAC_SECRET'];
  const missing: string[] = [];
  if (!endpointUrl)  missing.push(p + 'URL');
  if (!companyId)    missing.push(p + 'COMPANY_ID');
  if (!certPath)     missing.push(p + 'CERT_PATH');
  if (!keyPath)      missing.push(p + 'KEY_PATH');
  if (!hmacSecret)   missing.push(p + 'HMAC_SECRET');
  if (missing.length > 0) throw new CredentialError('kr', 'mfds_dbio', env, missing);
  const [clientCertPem, clientKeyPem] = await Promise.all([
    fs.readFile(certPath!, 'utf8'),
    fs.readFile(keyPath!, 'utf8'),
  ]);
  return { endpointUrl: endpointUrl!, companyId: companyId!, clientCertPem, clientKeyPem, hmacSecret: hmacSecret! };
}

export class MfdsGateway implements SubmissionGateway {
  readonly region    = 'kr' as const;
  readonly gateway   = 'mfds_dbio' as const;
  readonly transport = 'rest' as const;

  async isConfigured(_orgId: number, env: 'staging' | 'production'): Promise<boolean> {
    try { await loadCreds(env); return true; }
    catch { return false; } // an unreadable cert or key is not 'configured'
  }

  async transmit(req: GatewayTransmitRequest): Promise<GatewayTransmitResult> {
    const entry = req.submissionType ? resolveToRegistryEntry(req.submissionType) : null;
    const normReq = entry ? { ...req, submissionType: entry.applicationType } : req;
    const agency = requiredAgencyMetadata(normReq);
    const id = await insertTransmittal('kr', 'mfds_dbio', 'ectd', normReq);
    try {
      const creds = await loadCreds(normReq.environment);
      await patchTransmittal(id, { status: 'in_transit' });
      const zipBuf = await readVerifiedBundle(normReq.bundle);
      const boundary = `----mfds-${Date.now()}`;
      const meta = Buffer.from(JSON.stringify({
        companyId: creds.companyId,
        documentNumber: normReq.metadata?.applicationId ?? null,
        sequenceNumber: agency.sequenceNumber,
        submissionType: agency.submissionType,
        sha256: normReq.bundle.sha256,
      }), 'utf8');
      const body = buildMultipart(boundary, meta, zipBuf, 'ectd-kr.zip');
      const path = '/submission/v1/submissions';
      const date = new Date().toUTCString();
      const bodySha = sha256hex(body);
      const signature = buildHmac('POST', path, date, bodySha, creds.hmacSecret);
      const resp = await httpsRequest({
        method: 'POST',
        url: `${creds.endpointUrl.replace(/\/$/, '')}${path}`,
        headers: {
          'Content-Type':    `multipart/form-data; boundary=${boundary}`,
          'Content-Length':  String(body.length),
          'X-MFDS-Company':  creds.companyId,
          'X-MFDS-Date':     date,
          'X-MFDS-Signature': signature,
          'X-MFDS-Sha256':   bodySha,
          'Accept':          'application/json',
        },
        body, certPem: creds.clientCertPem, keyPem: creds.clientKeyPem,
        errorPrefix: 'MFDS dBio Gateway POST',
      });
      if (resp.httpStatus < 200 || resp.httpStatus >= 300) {
        await patchTransmittal(id, { status: 'rejected', httpStatus: resp.httpStatus,
          errorClass: 'gateway', errorMessage: `HTTP ${resp.httpStatus}: ${resp.body.toString('utf8').slice(0, 500)}` });
        throw new GatewayError(`MFDS dBio returned HTTP ${resp.httpStatus}`, resp.httpStatus, null, resp.body.toString('utf8'));
      }
      let parsed: { receiptId?: string; submissionId?: string;접수번호?: string };
      try { parsed = JSON.parse(resp.body.toString('utf8')); }
      catch { throw new GatewayError('MFDS dBio returned non-JSON success', resp.httpStatus, null, resp.body.toString('utf8')); }
      const receiptId = parsed.receiptId ?? parsed.submissionId ?? parsed['접수번호'] ?? null;
      if (!receiptId) {
        // A 2xx whose body names no receipt is not an accepted submission. This
        // minted `mfds-<timestamp>` here, recorded the row as received with an
        // acknowledgement time from the platform clock, told the operator
        // "accepted. Receipt: mfds-…", and later polled the agency for a
        // receipt that never existed. CESP refuses the same case; so does this.
        await patchTransmittal(id, {
          status: 'rejected', httpStatus: resp.httpStatus,
          errorClass: 'gateway', errorMessage: 'Agency returned success with no receipt identifier in the body.',
        });
        throw new GatewayError('MFDS response missing a receipt identifier', resp.httpStatus, null, parsed);
      }
      await patchTransmittal(id, { status: 'received', transmissionId: receiptId,
        httpStatus: resp.httpStatus, ackReceivedAt: new Date() });
      return { transmittalId: id, transmissionId: receiptId, status: 'received', transport: 'rest',
        httpStatus: resp.httpStatus, ackReceivedAt: new Date(),
        message: `MFDS dBio submission accepted. Receipt: ${receiptId}.` };
    } catch (err: unknown) {
      if (err instanceof CredentialError) {
        await patchTransmittal(id, { status: 'rejected', errorClass: 'auth', errorMessage: (err as Error).message });
      } else if (err instanceof TransportError) {
        await patchTransmittal(id, { status: 'rejected', errorClass: 'transport', errorMessage: (err as Error).message });
      } else if (!(err instanceof GatewayError)) {
        await patchTransmittal(id, { status: 'rejected', errorClass: 'gateway',
          errorMessage: err instanceof Error ? err.message : String(err) });
      }
      throw err;
    }
  }

  async checkStatus(transmittalId: number): Promise<GatewayStatusResult> {
    const { rows } = await pool.query<{
      transmission_id: string | null; status: string; ack_received_at: Date | null;
      metadata: Record<string, unknown> | null;
    }>(
      `SELECT transmission_id, status, ack_received_at, metadata
         FROM submission_transmittals WHERE id = $1 AND region = 'kr' AND gateway = 'mfds_dbio'`,
      [transmittalId],
    );
    if (rows.length === 0 || !rows[0].transmission_id)
      throw new GatewayError(`Transmittal ${transmittalId} not found`, 404, null, null);
    let pollError: string | null = 'The agency status poll did not complete.';
    try {
      const env = (rows[0].metadata?.environment as 'staging' | 'production' | undefined) ?? 'production';
      const creds = await loadCreds(env);
      const path = `/submission/v1/receipts/${encodeURIComponent(rows[0].transmission_id!)}`;
      const date = new Date().toUTCString();
      const sig = buildHmac('GET', path, date, '', creds.hmacSecret);
      const resp = await httpsRequest({
        method: 'GET',
        url: `${creds.endpointUrl.replace(/\/$/, '')}${path}`,
        headers: { 'X-MFDS-Company': creds.companyId, 'X-MFDS-Date': date,
          'X-MFDS-Signature': sig, 'Accept': 'application/json' },
        certPem: creds.clientCertPem, keyPem: creds.clientKeyPem,
        errorPrefix: 'MFDS status poll', timeoutMs: 60_000,
      });
      if (resp.httpStatus === 200) {
        const p = JSON.parse(resp.body.toString('utf8')) as { status?: string };
        const mapped: SubmissionStatus =
          p.status === 'received'       ? 'received'
          : p.status === 'pre_check_ok'   ? 'validation_passed'
          : p.status === 'pre_check_fail' ? 'validation_failed'
          : p.status === 'accepted'       ? 'review_started'
          : (rows[0].status as SubmissionStatus);
        if (mapped !== rows[0].status) await patchTransmittal(transmittalId, { status: mapped });
        return { transmittalId, transmissionId: rows[0].transmission_id!, status: mapped,
          source: 'agency',
          ackReceivedAt: rows[0].ack_received_at, rawResponse: p };
      }
    } catch (err) { pollError = err instanceof Error ? err.message : String(err); }
    return { transmittalId, transmissionId: rows[0].transmission_id!,
      source: 'stored', pollError,
      status: rows[0].status as SubmissionStatus, ackReceivedAt: rows[0].ack_received_at };
  }

  async downloadAcknowledgment(transmittalId: number): Promise<GatewayAcknowledgment> {
    const { rows } = await pool.query<{ transmission_id: string; ack_received_at: Date | null; status: string }>(
      `SELECT transmission_id, ack_received_at, status FROM submission_transmittals
         WHERE id = $1 AND region = 'kr' AND gateway = 'mfds_dbio'`, [transmittalId]);
    if (rows.length === 0)
      throw new GatewayError(`Transmittal ${transmittalId} not found`, 404, null, null);
    const r = rows[0];
        // Not an agency acknowledgement — this platform's own record of the
    // transmission, titled as such. See ./acknowledgement.ts.
    return platformTransmittalRecord({
      transmittalId,
      transmissionId: r.transmission_id,
      gatewayLabel: 'MFDS dBio (mfds_dbio)',
      status: r.status,
      ackReceivedAt: r.ack_received_at,
      extra: { 'Receipt': r.transmission_id },
    });
  }
}
