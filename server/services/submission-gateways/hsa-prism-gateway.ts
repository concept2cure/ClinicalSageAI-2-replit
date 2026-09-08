/**
 * HSA PRISM Gateway — Singapore's Health Sciences Authority.
 * Implements the PRISM (Product Registration Intelligent System for MedShield)
 * REST API for electronic regulatory submissions: therapeutic products
 * (new drug applications, MALs), medical devices (MD 4 and 5 registration),
 * IVDs (AMD 5 registration), and clinical trial certificates. Per the HSA
 * PRISM Submission Guide and HSA Health Products Act (CAP 122D).
 *
 * Transport: HTTPS POST with API key + HMAC-SHA256 request signature.
 * Package: ZIP with ACTD (ASEAN Common Technical Dossier) structure for
 * drug filings; HSA Technical Documentation for device/IVD filings.
 *
 * Honesty: throws CredentialError when HSA credentials are absent — never
 * fabricates a receipt. Status falls back to last-known DB row on poll failure.
 */

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

interface HsaCredentials {
  endpointUrl: string;
  apiKey: string;
  hmacSecret: string;
  orgId: string;
}

function loadCreds(env: 'staging' | 'production'): HsaCredentials {
  const p = env === 'production' ? 'HSA_' : 'HSA_STAGING_';
  const endpointUrl  = process.env[p + 'URL'];
  const apiKey       = process.env[p + 'API_KEY'];
  const hmacSecret   = process.env[p + 'HMAC_SECRET'];
  const orgId        = process.env[p + 'ORG_ID'];
  const missing: string[] = [];
  if (!endpointUrl)  missing.push(p + 'URL');
  if (!apiKey)       missing.push(p + 'API_KEY');
  if (!hmacSecret)   missing.push(p + 'HMAC_SECRET');
  if (!orgId)        missing.push(p + 'ORG_ID');
  if (missing.length > 0) throw new CredentialError('sg', 'hsa_prism', env, missing);
  return { endpointUrl: endpointUrl!, apiKey: apiKey!, hmacSecret: hmacSecret!, orgId: orgId! };
}

export class HsaPrismGateway implements SubmissionGateway {
  readonly region    = 'sg' as const;
  readonly gateway   = 'hsa_prism' as const;
  readonly transport = 'rest' as const;

  async isConfigured(_orgId: number, env: 'staging' | 'production'): Promise<boolean> {
    try { loadCreds(env); return true; }
    catch { return false; } // an unreadable cert or key is not 'configured'
  }

  async transmit(req: GatewayTransmitRequest): Promise<GatewayTransmitResult> {
    const entry = req.submissionType ? resolveToRegistryEntry(req.submissionType) : null;
    const normReq = entry ? { ...req, submissionType: entry.applicationType } : req;
    const agency = requiredAgencyMetadata(normReq);
    const id = await insertTransmittal('sg', 'hsa_prism', 'ectd', normReq);
    try {
      const creds = loadCreds(normReq.environment);
      await patchTransmittal(id, { status: 'in_transit' });
      const zipBuf = await readVerifiedBundle(normReq.bundle);
      const boundary = `----hsa-prism-${Date.now()}`;
      const meta = Buffer.from(JSON.stringify({
        orgId: creds.orgId,
        applicationId: normReq.metadata?.applicationId ?? null,
        sequenceNumber: agency.sequenceNumber,
        submissionType: agency.submissionType,
        sha256: normReq.bundle.sha256,
      }), 'utf8');
      const body = buildMultipart(boundary, meta, zipBuf, 'ectd-sg.zip');
      const path = '/api/v1/submissions';
      const date = new Date().toUTCString();
      const bodySha = sha256hex(body);
      const signature = buildHmac('POST', path, date, bodySha, creds.hmacSecret);
      const resp = await httpsRequest({
        method: 'POST',
        url: `${creds.endpointUrl.replace(/\/$/, '')}${path}`,
        headers: {
          'Content-Type':   `multipart/form-data; boundary=${boundary}`,
          'Content-Length': String(body.length),
          'X-HSA-API-Key':  creds.apiKey,
          'X-HSA-Org':      creds.orgId,
          'X-HSA-Date':     date,
          'X-HSA-Signature': signature,
          'X-HSA-Sha256':   bodySha,
          'Accept':         'application/json',
        },
        body, errorPrefix: 'HSA PRISM Gateway POST',
      });
      if (resp.httpStatus < 200 || resp.httpStatus >= 300) {
        await patchTransmittal(id, { status: 'rejected', httpStatus: resp.httpStatus,
          errorClass: 'gateway', errorMessage: `HTTP ${resp.httpStatus}: ${resp.body.toString('utf8').slice(0, 500)}` });
        throw new GatewayError(`HSA PRISM returned HTTP ${resp.httpStatus}`, resp.httpStatus, null, resp.body.toString('utf8'));
      }
      let parsed: { receiptId?: string; submissionId?: string; caseId?: string };
      try { parsed = JSON.parse(resp.body.toString('utf8')); }
      catch { throw new GatewayError('HSA PRISM returned non-JSON success', resp.httpStatus, null, resp.body.toString('utf8')); }
      const receiptId = parsed.receiptId ?? parsed.submissionId ?? parsed.caseId ?? null;
      if (!receiptId) {
        // A 2xx whose body names no receipt is not an accepted submission. This
        // minted `hsa-<timestamp>` here, recorded the row as received with an
        // acknowledgement time from the platform clock, told the operator
        // "accepted. Receipt: hsa-…", and later polled the agency for a
        // receipt that never existed. CESP refuses the same case; so does this.
        await patchTransmittal(id, {
          status: 'rejected', httpStatus: resp.httpStatus,
          errorClass: 'gateway', errorMessage: 'Agency returned success with no receipt identifier in the body.',
        });
        throw new GatewayError('HSA response missing a receipt identifier', resp.httpStatus, null, parsed);
      }
      await patchTransmittal(id, { status: 'received', transmissionId: receiptId,
        httpStatus: resp.httpStatus, ackReceivedAt: new Date() });
      return { transmittalId: id, transmissionId: receiptId, status: 'received', transport: 'rest',
        httpStatus: resp.httpStatus, ackReceivedAt: new Date(),
        message: `HSA PRISM submission accepted. Case ID: ${receiptId}.` };
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
         FROM submission_transmittals WHERE id = $1 AND region = 'sg' AND gateway = 'hsa_prism'`,
      [transmittalId],
    );
    if (rows.length === 0 || !rows[0].transmission_id)
      throw new GatewayError(`Transmittal ${transmittalId} not found`, 404, null, null);
    let pollError: string | null = 'The agency status poll did not complete.';
    try {
      const env = (rows[0].metadata?.environment as 'staging' | 'production' | undefined) ?? 'production';
      const creds = loadCreds(env);
      const path = `/api/v1/submissions/${encodeURIComponent(rows[0].transmission_id!)}`;
      const date = new Date().toUTCString();
      const sig = buildHmac('GET', path, date, '', creds.hmacSecret);
      const resp = await httpsRequest({
        method: 'GET',
        url: `${creds.endpointUrl.replace(/\/$/, '')}${path}`,
        headers: { 'X-HSA-API-Key': creds.apiKey, 'X-HSA-Org': creds.orgId,
          'X-HSA-Date': date, 'X-HSA-Signature': sig, 'Accept': 'application/json' },
        errorPrefix: 'HSA status poll', timeoutMs: 60_000,
      });
      if (resp.httpStatus === 200) {
        const p = JSON.parse(resp.body.toString('utf8')) as { status?: string; caseStatus?: string };
        const raw = p.status ?? p.caseStatus ?? '';
        const mapped: SubmissionStatus =
          raw === 'received'       ? 'received'
          : raw === 'acknowledged'   ? 'validation_passed'
          : raw === 'query_raised'   ? 'response_required'
          : raw === 'under_evaluation' ? 'review_started'
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
         WHERE id = $1 AND region = 'sg' AND gateway = 'hsa_prism'`, [transmittalId]);
    if (rows.length === 0)
      throw new GatewayError(`Transmittal ${transmittalId} not found`, 404, null, null);
    const r = rows[0];
        // Not an agency acknowledgement — this platform's own record of the
    // transmission, titled as such. See ./acknowledgement.ts.
    return platformTransmittalRecord({
      transmittalId,
      transmissionId: r.transmission_id,
      gatewayLabel: 'HSA PRISM (hsa_prism)',
      status: r.status,
      ackReceivedAt: r.ack_received_at,
      extra: { 'Case ID': r.transmission_id },
    });
  }
}
