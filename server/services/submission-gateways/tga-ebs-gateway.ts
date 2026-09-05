/**
 * TGA eBusiness Services Gateway — Australia's Therapeutic Goods Administration.
 * Implements the TGA eBS REST API for electronic regulatory submissions:
 * prescription medicines, biologicals, medical devices, IVDs, and OTC applications.
 * Per the TGA "Guide to Electronic Submissions" and TGA eBS API specification.
 *
 * Transport: HTTPS POST with TGA API key + optional mTLS for licensed submitters.
 * Package: ZIP with eCTD structure; AU Module 1 (m1/au/) for drug filings, or
 * TGA Technical Documentation for device / IVD filings.
 *
 * Honesty: throws CredentialError when TGA credentials are absent — never
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
} from './types';
import { httpsRequest, insertTransmittal, patchTransmittal, buildMultipart, sha256hex } from './rest-gateway-helpers';
import { platformTransmittalRecord } from './acknowledgement';

interface TgaCredentials {
  endpointUrl: string;
  apiKey: string;
  sponsorId: string;
  certPem?: string;
  keyPem?: string;
}

async function loadCreds(env: 'staging' | 'production'): Promise<TgaCredentials> {
  const p = env === 'production' ? 'TGA_EBS_' : 'TGA_EBS_STAGING_';
  const endpointUrl = process.env[p + 'URL'];
  const apiKey      = process.env[p + 'API_KEY'];
  const sponsorId   = process.env[p + 'SPONSOR_ID'];
  const missing: string[] = [];
  if (!endpointUrl) missing.push(p + 'URL');
  if (!apiKey)      missing.push(p + 'API_KEY');
  if (!sponsorId)   missing.push(p + 'SPONSOR_ID');
  if (missing.length > 0) throw new CredentialError('au', 'tga_ebs', env, missing);
  const certPath = process.env[p + 'CERT_PATH'];
  const keyPath  = process.env[p + 'KEY_PATH'];
  const [certPem, keyPem] = (certPath && keyPath)
    ? await Promise.all([fs.readFile(certPath, 'utf8'), fs.readFile(keyPath, 'utf8')])
    : [undefined, undefined];
  return { endpointUrl: endpointUrl!, apiKey: apiKey!, sponsorId: sponsorId!, certPem, keyPem };
}

export class TgaEbsGateway implements SubmissionGateway {
  readonly region    = 'au' as const;
  readonly gateway   = 'tga_ebs' as const;
  readonly transport = 'rest' as const;

  async isConfigured(_orgId: number, env: 'staging' | 'production'): Promise<boolean> {
    try { await loadCreds(env); return true; }
    catch (e) { return !(e instanceof CredentialError); }
  }

  async transmit(req: GatewayTransmitRequest): Promise<GatewayTransmitResult> {
    const entry = req.submissionType ? resolveToRegistryEntry(req.submissionType) : null;
    const normReq = entry ? { ...req, submissionType: entry.applicationType } : req;
    const id = await insertTransmittal('au', 'tga_ebs', 'ectd', normReq);
    try {
      const creds = await loadCreds(normReq.environment);
      await patchTransmittal(id, { status: 'in_transit' });
      const zipBuf = await readVerifiedBundle(normReq.bundle);
      const boundary = `----tga-ebs-${Date.now()}`;
      const meta = Buffer.from(JSON.stringify({
        sponsorId: creds.sponsorId,
        applicationId: normReq.metadata?.applicationId ?? null,
        sequenceNumber: normReq.metadata?.sequence ?? '0000',
        submissionType: normReq.submissionType ?? 'initial',
        sha256: normReq.bundle.sha256,
      }), 'utf8');
      const body = buildMultipart(boundary, meta, zipBuf, 'ectd-au.zip');
      const path = '/api/v1/submissions';
      const resp = await httpsRequest({
        method: 'POST',
        url: `${creds.endpointUrl.replace(/\/$/, '')}${path}`,
        headers: {
          'Content-Type':    `multipart/form-data; boundary=${boundary}`,
          'Content-Length':  String(body.length),
          'X-TGA-API-Key':   creds.apiKey,
          'X-TGA-Sponsor':   creds.sponsorId,
          'X-TGA-Sha256':    sha256hex(body),
          'Accept':          'application/json',
        },
        body, certPem: creds.certPem, keyPem: creds.keyPem,
        errorPrefix: 'TGA eBS Gateway POST',
      });
      if (resp.httpStatus < 200 || resp.httpStatus >= 300) {
        await patchTransmittal(id, { status: 'rejected', httpStatus: resp.httpStatus,
          errorClass: 'gateway', errorMessage: `HTTP ${resp.httpStatus}: ${resp.body.toString('utf8').slice(0, 500)}` });
        throw new GatewayError(`TGA eBS returned HTTP ${resp.httpStatus}`, resp.httpStatus, null, resp.body.toString('utf8'));
      }
      let parsed: { receiptId?: string; submissionId?: string; referenceNumber?: string };
      try { parsed = JSON.parse(resp.body.toString('utf8')); }
      catch { throw new GatewayError('TGA eBS returned non-JSON success', resp.httpStatus, null, resp.body.toString('utf8')); }
      const receiptId = parsed.receiptId ?? parsed.submissionId ?? parsed.referenceNumber ?? null;
      if (!receiptId) {
        // A 2xx whose body names no receipt is not an accepted submission. This
        // minted `tga-<timestamp>` here, recorded the row as received with an
        // acknowledgement time from the platform clock, told the operator
        // "accepted. Receipt: tga-…", and later polled the agency for a
        // receipt that never existed. CESP refuses the same case; so does this.
        await patchTransmittal(id, {
          status: 'rejected', httpStatus: resp.httpStatus,
          errorClass: 'gateway', errorMessage: 'Agency returned success with no receipt identifier in the body.',
        });
        throw new GatewayError('TGA response missing a receipt identifier', resp.httpStatus, null, parsed);
      }
      await patchTransmittal(id, { status: 'received', transmissionId: receiptId,
        httpStatus: resp.httpStatus, ackReceivedAt: new Date() });
      return { transmittalId: id, transmissionId: receiptId, status: 'received', transport: 'rest',
        httpStatus: resp.httpStatus, ackReceivedAt: new Date(),
        message: `TGA eBS submission accepted. Receipt: ${receiptId}.` };
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
         FROM submission_transmittals WHERE id = $1 AND region = 'au' AND gateway = 'tga_ebs'`,
      [transmittalId],
    );
    if (rows.length === 0 || !rows[0].transmission_id)
      throw new GatewayError(`Transmittal ${transmittalId} not found`, 404, null, null);
    try {
      const env = (rows[0].metadata?.environment as 'staging' | 'production' | undefined) ?? 'production';
      const creds = await loadCreds(env);
      const resp = await httpsRequest({
        method: 'GET',
        url: `${creds.endpointUrl.replace(/\/$/, '')}/api/v1/submissions/${encodeURIComponent(rows[0].transmission_id!)}`,
        headers: { 'X-TGA-API-Key': creds.apiKey, 'X-TGA-Sponsor': creds.sponsorId, 'Accept': 'application/json' },
        certPem: creds.certPem, keyPem: creds.keyPem,
        errorPrefix: 'TGA status poll', timeoutMs: 60_000,
      });
      if (resp.httpStatus === 200) {
        const p = JSON.parse(resp.body.toString('utf8')) as { status?: string };
        const mapped: SubmissionStatus =
          p.status === 'received'   ? 'received'
          : p.status === 'validated'  ? 'validation_passed'
          : p.status === 'invalid'    ? 'validation_failed'
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
         WHERE id = $1 AND region = 'au' AND gateway = 'tga_ebs'`, [transmittalId]);
    if (rows.length === 0)
      throw new GatewayError(`Transmittal ${transmittalId} not found`, 404, null, null);
    const r = rows[0];
        // Not an agency acknowledgement — this platform's own record of the
    // transmission, titled as such. See ./acknowledgement.ts.
    return platformTransmittalRecord({
      transmittalId,
      transmissionId: r.transmission_id,
      gatewayLabel: 'TGA eBS (tga_ebs)',
      status: r.status,
      ackReceivedAt: r.ack_received_at,
      extra: { 'Receipt': r.transmission_id },
    });
  }
}
