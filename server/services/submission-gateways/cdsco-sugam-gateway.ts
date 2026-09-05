/**
 * CDSCO SUGAM Gateway — India's Central Drugs Standard Control Organisation.
 * Implements the SUGAM (Single Window Integration) portal REST API for
 * electronic regulatory submissions: new drugs (Form 44/CT-04), medical
 * devices and IVDs (MD-14/MD-3), import licences, and post-approval changes.
 * Per the SUGAM Technical Specification and CDSCO Guidance Document on
 * Electronic Submissions (New Drugs and Clinical Trials Rules, 2019).
 *
 * Transport: HTTPS POST with SUGAM API key + session Bearer token.
 * Package: ZIP with CTD structure; IN-specific Module 1 (m1/in/).
 *
 * Honesty: throws CredentialError when SUGAM credentials are absent — never
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

interface SugamCredentials {
  endpointUrl: string;
  apiKey: string;
  sessionToken: string;
  applicantId: string;
}

function loadCreds(env: 'staging' | 'production'): SugamCredentials {
  const p = env === 'production' ? 'CDSCO_' : 'CDSCO_STAGING_';
  const endpointUrl   = process.env[p + 'URL'];
  const apiKey        = process.env[p + 'API_KEY'];
  const sessionToken  = process.env[p + 'SESSION_TOKEN'];
  const applicantId   = process.env[p + 'APPLICANT_ID'];
  const missing: string[] = [];
  if (!endpointUrl)   missing.push(p + 'URL');
  if (!apiKey)        missing.push(p + 'API_KEY');
  if (!sessionToken)  missing.push(p + 'SESSION_TOKEN');
  if (!applicantId)   missing.push(p + 'APPLICANT_ID');
  if (missing.length > 0) throw new CredentialError('in', 'cdsco_sugam', env, missing);
  return { endpointUrl: endpointUrl!, apiKey: apiKey!, sessionToken: sessionToken!, applicantId: applicantId! };
}

export class CdscoSugamGateway implements SubmissionGateway {
  readonly region    = 'in' as const;
  readonly gateway   = 'cdsco_sugam' as const;
  readonly transport = 'rest' as const;

  async isConfigured(_orgId: number, env: 'staging' | 'production'): Promise<boolean> {
    try { loadCreds(env); return true; }
    catch (e) { return !(e instanceof CredentialError); }
  }

  async transmit(req: GatewayTransmitRequest): Promise<GatewayTransmitResult> {
    const entry = req.submissionType ? resolveToRegistryEntry(req.submissionType) : null;
    const normReq = entry ? { ...req, submissionType: entry.applicationType } : req;
    const id = await insertTransmittal('in', 'cdsco_sugam', 'ectd', normReq);
    try {
      const creds = loadCreds(normReq.environment);
      await patchTransmittal(id, { status: 'in_transit' });
      const zipBuf = await readVerifiedBundle(normReq.bundle);
      const boundary = `----sugam-${Date.now()}`;
      const meta = Buffer.from(JSON.stringify({
        applicantId: creds.applicantId,
        applicationNumber: normReq.metadata?.applicationId ?? null,
        sequenceNumber: normReq.metadata?.sequence ?? '0000',
        submissionType: normReq.submissionType ?? 'initial',
        sha256: normReq.bundle.sha256,
      }), 'utf8');
      const body = buildMultipart(boundary, meta, zipBuf, 'ectd-in.zip');
      const path = '/api/v1/submissions';
      const resp = await httpsRequest({
        method: 'POST',
        url: `${creds.endpointUrl.replace(/\/$/, '')}${path}`,
        headers: {
          'Content-Type':       `multipart/form-data; boundary=${boundary}`,
          'Content-Length':     String(body.length),
          'X-SUGAM-API-Key':    creds.apiKey,
          'Authorization':      `Bearer ${creds.sessionToken}`,
          'X-SUGAM-Applicant':  creds.applicantId,
          'X-SUGAM-Sha256':     sha256hex(body),
          'Accept':             'application/json',
        },
        body, errorPrefix: 'CDSCO SUGAM Gateway POST',
      });
      if (resp.httpStatus < 200 || resp.httpStatus >= 300) {
        await patchTransmittal(id, { status: 'rejected', httpStatus: resp.httpStatus,
          errorClass: 'gateway', errorMessage: `HTTP ${resp.httpStatus}: ${resp.body.toString('utf8').slice(0, 500)}` });
        throw new GatewayError(`CDSCO SUGAM returned HTTP ${resp.httpStatus}`, resp.httpStatus, null, resp.body.toString('utf8'));
      }
      let parsed: { receiptId?: string; applicationId?: string; trackingId?: string };
      try { parsed = JSON.parse(resp.body.toString('utf8')); }
      catch { throw new GatewayError('CDSCO SUGAM returned non-JSON success', resp.httpStatus, null, resp.body.toString('utf8')); }
      const receiptId = parsed.receiptId ?? parsed.applicationId ?? parsed.trackingId ?? null;
      if (!receiptId) {
        // A 2xx whose body names no receipt is not an accepted submission. This
        // minted `sugam-<timestamp>` here, recorded the row as received with an
        // acknowledgement time from the platform clock, told the operator
        // "accepted. Receipt: sugam-…", and later polled the agency for a
        // receipt that never existed. CESP refuses the same case; so does this.
        await patchTransmittal(id, {
          status: 'rejected', httpStatus: resp.httpStatus,
          errorClass: 'gateway', errorMessage: 'Agency returned success with no receipt identifier in the body.',
        });
        throw new GatewayError('SUGAM response missing a receipt identifier', resp.httpStatus, null, parsed);
      }
      await patchTransmittal(id, { status: 'received', transmissionId: receiptId,
        httpStatus: resp.httpStatus, ackReceivedAt: new Date() });
      return { transmittalId: id, transmissionId: receiptId, status: 'received', transport: 'rest',
        httpStatus: resp.httpStatus, ackReceivedAt: new Date(),
        message: `CDSCO SUGAM submission accepted. Tracking ID: ${receiptId}.` };
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
         FROM submission_transmittals WHERE id = $1 AND region = 'in' AND gateway = 'cdsco_sugam'`,
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
        headers: { 'X-SUGAM-API-Key': creds.apiKey, 'Authorization': `Bearer ${creds.sessionToken}`, 'Accept': 'application/json' },
        errorPrefix: 'CDSCO status poll', timeoutMs: 60_000,
      });
      if (resp.httpStatus === 200) {
        const p = JSON.parse(resp.body.toString('utf8')) as { status?: string };
        const mapped: SubmissionStatus =
          p.status === 'submitted'    ? 'received'
          : p.status === 'scrutinised'  ? 'validation_passed'
          : p.status === 'deficient'    ? 'response_required'
          : p.status === 'under_review' ? 'review_started'
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
         WHERE id = $1 AND region = 'in' AND gateway = 'cdsco_sugam'`, [transmittalId]);
    if (rows.length === 0)
      throw new GatewayError(`Transmittal ${transmittalId} not found`, 404, null, null);
    const r = rows[0];
        // Not an agency acknowledgement — this platform's own record of the
    // transmission, titled as such. See ./acknowledgement.ts.
    return platformTransmittalRecord({
      transmittalId,
      transmissionId: r.transmission_id,
      gatewayLabel: 'CDSCO SUGAM (cdsco_sugam)',
      status: r.status,
      ackReceivedAt: r.ack_received_at,
      extra: { 'Tracking ID': r.transmission_id },
    });
  }
}
