/**
 * NMPA Gateway — China's National Medical Products Administration.
 * Implements the CDE (Center for Drug Evaluation) electronic submission portal
 * for regulatory submissions to NMPA: CTD-formatted drugs, Class III medical
 * devices, IVD registrations. Per the NMPA Electronic CTD Submission Technical
 * Guidelines (2021) and the CIMS (Common Interface for Medical Submissions) API.
 *
 * Transport: HTTPS POST with Bearer token authentication.
 * Package: ZIP bundle with CTD structure in CN-specific Module 1 (m1/cn/).
 * Bilingual metadata (ZH/EN) is required for Module 1 cover page.
 *
 * Honesty: throws CredentialError when NMPA credentials are absent — never
 * fabricates a receipt. Status falls back to last-known DB row on poll failure.
 */

import { pool } from '../../db';
import { readVerifiedBundle } from './bundle-integrity';
import {
  CredentialError, GatewayError, TransportError,
  resolveToRegistryEntry,
  type GatewayAcknowledgment, type GatewayStatusResult, type GatewayTransmitRequest,
  type GatewayTransmitResult, type SubmissionGateway, type SubmissionStatus,
} from './types';
import { httpsRequest, insertTransmittal, patchTransmittal, buildMultipart, sha256hex } from './rest-gateway-helpers';
import { platformTransmittalRecord } from './acknowledgement';

interface NmpaCredentials {
  endpointUrl: string;
  bearerToken: string;
  companyId: string;
}

function loadCreds(env: 'staging' | 'production'): NmpaCredentials {
  const p = env === 'production' ? 'NMPA_' : 'NMPA_STAGING_';
  const endpointUrl  = process.env[p + 'URL'];
  const bearerToken  = process.env[p + 'TOKEN'];
  const companyId    = process.env[p + 'COMPANY_ID'];
  const missing: string[] = [];
  if (!endpointUrl)  missing.push(p + 'URL');
  if (!bearerToken)  missing.push(p + 'TOKEN');
  if (!companyId)    missing.push(p + 'COMPANY_ID');
  if (missing.length > 0) throw new CredentialError('cn', 'nmpa_gateway', env, missing);
  return { endpointUrl: endpointUrl!, bearerToken: bearerToken!, companyId: companyId! };
}

export class NmpaGateway implements SubmissionGateway {
  readonly region    = 'cn' as const;
  readonly gateway   = 'nmpa_gateway' as const;
  readonly transport = 'rest' as const;

  async isConfigured(_orgId: number, env: 'staging' | 'production'): Promise<boolean> {
    try { loadCreds(env); return true; }
    catch (e) { return !(e instanceof CredentialError); }
  }

  async transmit(req: GatewayTransmitRequest): Promise<GatewayTransmitResult> {
    const entry = req.submissionType ? resolveToRegistryEntry(req.submissionType) : null;
    const normReq = entry ? { ...req, submissionType: entry.applicationType } : req;
    const id = await insertTransmittal('cn', 'nmpa_gateway', 'ectd', normReq);
    try {
      const creds = loadCreds(normReq.environment);
      await patchTransmittal(id, { status: 'in_transit' });
      const zipBuf = await readVerifiedBundle(normReq.bundle);
      const boundary = `----nmpa-${Date.now()}`;
      const meta = Buffer.from(JSON.stringify({
        companyId: creds.companyId,
        registrationNumber: normReq.metadata?.applicationId ?? null,
        sequenceNumber: normReq.metadata?.sequence ?? '0000',
        submissionType: normReq.submissionType ?? 'initial',
        sha256: normReq.bundle.sha256,
      }), 'utf8');
      const body = buildMultipart(boundary, meta, zipBuf, 'ectd-cn.zip');
      const path = '/api/v1/submissions';
      const resp = await httpsRequest({
        method: 'POST',
        url: `${creds.endpointUrl.replace(/\/$/, '')}${path}`,
        headers: {
          'Content-Type':      `multipart/form-data; boundary=${boundary}`,
          'Content-Length':    String(body.length),
          'Authorization':     `Bearer ${creds.bearerToken}`,
          'X-NMPA-Company':    creds.companyId,
          'X-NMPA-Sha256':     sha256hex(body),
          'Accept':            'application/json',
        },
        body, errorPrefix: 'NMPA Gateway POST',
      });
      if (resp.httpStatus < 200 || resp.httpStatus >= 300) {
        await patchTransmittal(id, { status: 'rejected', httpStatus: resp.httpStatus,
          errorClass: 'gateway', errorMessage: `HTTP ${resp.httpStatus}: ${resp.body.toString('utf8').slice(0, 500)}` });
        throw new GatewayError(`NMPA returned HTTP ${resp.httpStatus}`, resp.httpStatus, null, resp.body.toString('utf8'));
      }
      let parsed: { receiptId?: string; submissionId?: string; taskId?: string };
      try { parsed = JSON.parse(resp.body.toString('utf8')); }
      catch { throw new GatewayError('NMPA returned non-JSON success', resp.httpStatus, null, resp.body.toString('utf8')); }
      const receiptId = parsed.receiptId ?? parsed.submissionId ?? parsed.taskId ?? null;
      if (!receiptId) {
        // A 2xx whose body names no receipt is not an accepted submission. This
        // minted `nmpa-<timestamp>` here, recorded the row as received with an
        // acknowledgement time from the platform clock, told the operator
        // "accepted. Receipt: nmpa-…", and later polled the agency for a
        // receipt that never existed. CESP refuses the same case; so does this.
        await patchTransmittal(id, {
          status: 'rejected', httpStatus: resp.httpStatus,
          errorClass: 'gateway', errorMessage: 'Agency returned success with no receipt identifier in the body.',
        });
        throw new GatewayError('NMPA response missing a receipt identifier', resp.httpStatus, null, parsed);
      }
      await patchTransmittal(id, { status: 'received', transmissionId: receiptId,
        httpStatus: resp.httpStatus, ackReceivedAt: new Date() });
      return { transmittalId: id, transmissionId: receiptId, status: 'received', transport: 'rest',
        httpStatus: resp.httpStatus, ackReceivedAt: new Date(),
        message: `NMPA/CDE submission accepted. Receipt: ${receiptId}.` };
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
         FROM submission_transmittals WHERE id = $1 AND region = 'cn' AND gateway = 'nmpa_gateway'`,
      [transmittalId],
    );
    if (rows.length === 0 || !rows[0].transmission_id)
      throw new GatewayError(`Transmittal ${transmittalId} not found`, 404, null, null);
    try {
      const env = (rows[0].metadata?.environment as 'staging' | 'production' | undefined) ?? 'production';
      const creds = loadCreds(env);
      const resp = await httpsRequest({
        method: 'GET',
        url: `${creds.endpointUrl.replace(/\/$/, '')}/api/v1/submissions/${encodeURIComponent(rows[0].transmission_id!)}`,
        headers: { 'Authorization': `Bearer ${creds.bearerToken}`, 'Accept': 'application/json' },
        errorPrefix: 'NMPA status poll', timeoutMs: 60_000,
      });
      if (resp.httpStatus === 200) {
        const p = JSON.parse(resp.body.toString('utf8')) as { status?: string };
        const mapped: SubmissionStatus =
          p.status === 'accepted'  ? 'validation_passed'
          : p.status === 'rejected'  ? 'validation_failed'
          : p.status === 'reviewing' ? 'review_started'
          : (rows[0].status as SubmissionStatus);
        if (mapped !== rows[0].status) await patchTransmittal(transmittalId, { status: mapped });
        return { transmittalId, transmissionId: rows[0].transmission_id!, status: mapped,
          ackReceivedAt: rows[0].ack_received_at, rawResponse: p };
      }
    } catch { /* fall through */ }
    return { transmittalId, transmissionId: rows[0].transmission_id!,
      status: rows[0].status as SubmissionStatus, ackReceivedAt: rows[0].ack_received_at };
  }

  async downloadAcknowledgment(transmittalId: number): Promise<GatewayAcknowledgment> {
    const { rows } = await pool.query<{ transmission_id: string; ack_received_at: Date | null; status: string }>(
      `SELECT transmission_id, ack_received_at, status FROM submission_transmittals
         WHERE id = $1 AND region = 'cn' AND gateway = 'nmpa_gateway'`, [transmittalId]);
    if (rows.length === 0)
      throw new GatewayError(`Transmittal ${transmittalId} not found`, 404, null, null);
    const r = rows[0];
        // Not an agency acknowledgement — this platform's own record of the
    // transmission, titled as such. See ./acknowledgement.ts.
    return platformTransmittalRecord({
      transmittalId,
      transmissionId: r.transmission_id,
      gatewayLabel: 'NMPA/CDE (nmpa_gateway)',
      status: r.status,
      ackReceivedAt: r.ack_received_at,
      extra: { 'Receipt': r.transmission_id },
    });
  }
}
