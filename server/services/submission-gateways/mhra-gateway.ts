/**
 * MHRA Gateway — UK Medicines and Healthcare products Regulatory Agency.
 * Implements the MHRA Product Submissions REST API for post-Brexit electronic
 * regulatory submissions (UK MAAs, CTAs, device conformity assessments under
 * UK MDR 2002 / UK IVDR 2022). Per the MHRA Guidance on Electronic Submissions
 * (2021) and the MHRA Product Licensing REST API specification.
 *
 * Transport: HTTPS POST with X-MHRA-API-Key + X-MHRA-Org-Id headers.
 * Optional mTLS for high-volume submitters (cert/key paths optional).
 * Package: ZIP with UK Module 1 (m1/uk/) for drug filings; or MHRA technical
 * documentation package for device filings.
 *
 * Honesty: throws CredentialError when MHRA credentials are absent — never
 * fabricates a receipt. Status falls back to last-known DB row when a live
 * poll cannot be performed.
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
import { httpsRequest, insertTransmittal, patchTransmittal, buildMultipart, sha256hex } from './rest-gateway-helpers';
import { platformTransmittalRecord } from './acknowledgement';

interface MhraCredentials {
  endpointUrl: string;
  apiKey: string;
  orgId: string;
  certPem?: string;
  keyPem?: string;
}

async function loadCreds(env: 'staging' | 'production'): Promise<MhraCredentials> {
  const p = env === 'production' ? 'MHRA_' : 'MHRA_STAGING_';
  const endpointUrl = process.env[p + 'URL'];
  const apiKey      = process.env[p + 'API_KEY'];
  const orgId       = process.env[p + 'ORG_ID'];
  const missing: string[] = [];
  if (!endpointUrl) missing.push(p + 'URL');
  if (!apiKey)      missing.push(p + 'API_KEY');
  if (!orgId)       missing.push(p + 'ORG_ID');
  if (missing.length > 0) throw new CredentialError('uk', 'mhra_gateway', env, missing);
  const certPath = process.env[p + 'CERT_PATH'];
  const keyPath  = process.env[p + 'KEY_PATH'];
  const [certPem, keyPem] = (certPath && keyPath)
    ? await Promise.all([fs.readFile(certPath, 'utf8'), fs.readFile(keyPath, 'utf8')])
    : [undefined, undefined];
  return { endpointUrl: endpointUrl!, apiKey: apiKey!, orgId: orgId!, certPem, keyPem };
}

export class MhraGateway implements SubmissionGateway {
  readonly region    = 'uk' as const;
  readonly gateway   = 'mhra_gateway' as const;
  readonly transport = 'rest' as const;

  async isConfigured(_orgId: number, env: 'staging' | 'production'): Promise<boolean> {
    try { await loadCreds(env); return true; }
    catch { return false; } // an unreadable cert or key is not 'configured'
  }

  async transmit(req: GatewayTransmitRequest): Promise<GatewayTransmitResult> {
    const entry = req.submissionType ? resolveToRegistryEntry(req.submissionType) : null;
    const normReq = entry ? { ...req, submissionType: entry.applicationType } : req;
    const agency = requiredAgencyMetadata(normReq);
    const id = await insertTransmittal('uk', 'mhra_gateway', 'ectd', normReq);
    try {
      const creds = await loadCreds(normReq.environment);
      await patchTransmittal(id, { status: 'in_transit' });
      const zipBuf = await readVerifiedBundle(normReq.bundle);
      const boundary = `----mhra-${Date.now()}`;
      const meta = Buffer.from(JSON.stringify({
        orgId: creds.orgId,
        dossierId: normReq.metadata?.applicationId ?? null,
        sequenceNumber: agency.sequenceNumber,
        submissionType: agency.submissionType,
        sha256: normReq.bundle.sha256,
      }), 'utf8');
      const body = buildMultipart(boundary, meta, zipBuf, 'ectd-uk.zip');
      const path = '/v1/submissions';
      const resp = await httpsRequest({
        method: 'POST',
        url: `${creds.endpointUrl.replace(/\/$/, '')}${path}`,
        headers: {
          'Content-Type':   `multipart/form-data; boundary=${boundary}`,
          'Content-Length': String(body.length),
          'X-MHRA-API-Key': creds.apiKey,
          'X-MHRA-Org-Id':  creds.orgId,
          'X-MHRA-Sha256':  sha256hex(body),
          'Accept':         'application/json',
        },
        body, certPem: creds.certPem, keyPem: creds.keyPem,
        errorPrefix: 'MHRA Gateway POST',
      });
      if (resp.httpStatus < 200 || resp.httpStatus >= 300) {
        await patchTransmittal(id, { status: 'rejected', httpStatus: resp.httpStatus,
          errorClass: 'gateway', errorMessage: `HTTP ${resp.httpStatus}: ${resp.body.toString('utf8').slice(0, 500)}` });
        throw new GatewayError(`MHRA returned HTTP ${resp.httpStatus}`, resp.httpStatus, null, resp.body.toString('utf8'));
      }
      let parsed: { receiptId?: string; submissionId?: string };
      try { parsed = JSON.parse(resp.body.toString('utf8')); }
      catch { throw new GatewayError('MHRA returned non-JSON success', resp.httpStatus, null, resp.body.toString('utf8')); }
      const receiptId = parsed.receiptId ?? parsed.submissionId ?? null;
      if (!receiptId) {
        // A 2xx whose body names no receipt is not an accepted submission. This
        // minted `mhra-<timestamp>` here, recorded the row as received with an
        // acknowledgement time from the platform clock, told the operator
        // "accepted. Receipt: mhra-…", and later polled the agency for a
        // receipt that never existed. CESP refuses the same case; so does this.
        await patchTransmittal(id, {
          status: 'rejected', httpStatus: resp.httpStatus,
          errorClass: 'gateway', errorMessage: 'Agency returned success with no receipt identifier in the body.',
        });
        throw new GatewayError('MHRA response missing a receipt identifier', resp.httpStatus, null, parsed);
      }
      await patchTransmittal(id, { status: 'received', transmissionId: receiptId,
        httpStatus: resp.httpStatus, ackReceivedAt: new Date() });
      return { transmittalId: id, transmissionId: receiptId, status: 'received', transport: 'rest',
        httpStatus: resp.httpStatus, ackReceivedAt: new Date(),
        message: `MHRA submission accepted. Receipt: ${receiptId}.` };
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
         FROM submission_transmittals WHERE id = $1 AND region = 'uk' AND gateway = 'mhra_gateway'`,
      [transmittalId],
    );
    if (rows.length === 0 || !rows[0].transmission_id)
      throw new GatewayError(`Transmittal ${transmittalId} not found`, 404, null, null);
    let pollError: string | null = 'The agency status poll did not complete.';
    try {
      const env = (rows[0].metadata?.environment as 'staging' | 'production' | undefined) ?? 'production';
      const creds = await loadCreds(env);
      const resp = await httpsRequest({
        method: 'GET',
        url: `${creds.endpointUrl.replace(/\/$/, '')}/v1/receipts/${encodeURIComponent(rows[0].transmission_id!)}`,
        headers: { 'X-MHRA-API-Key': creds.apiKey, 'X-MHRA-Org-Id': creds.orgId, 'Accept': 'application/json' },
        certPem: creds.certPem, keyPem: creds.keyPem,
        errorPrefix: 'MHRA status poll', timeoutMs: 60_000,
      });
      if (resp.httpStatus === 200) {
        const p = JSON.parse(resp.body.toString('utf8')) as { status?: string };
        const mapped: SubmissionStatus =
          p.status === 'validated' ? 'validation_passed'
          : p.status === 'rejected'  ? 'validation_failed'
          : p.status === 'accepted'  ? 'review_started'
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
         WHERE id = $1 AND region = 'uk' AND gateway = 'mhra_gateway'`, [transmittalId]);
    if (rows.length === 0)
      throw new GatewayError(`Transmittal ${transmittalId} not found`, 404, null, null);
    const r = rows[0];
        // Not an agency acknowledgement — this platform's own record of the
    // transmission, titled as such. See ./acknowledgement.ts.
    return platformTransmittalRecord({
      transmittalId,
      transmissionId: r.transmission_id,
      gatewayLabel: 'MHRA (mhra_gateway)',
      status: r.status,
      ackReceivedAt: r.ack_received_at,
      extra: { 'Receipt': r.transmission_id },
    });
  }
}
