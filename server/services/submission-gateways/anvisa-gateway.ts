/**
 * ANVISA Gateway — Brazil's Agência Nacional de Vigilância Sanitária.
 * Implements the ANVISA SOLICITA/ELETRONICO REST API for regulatory submissions:
 * drugs (Registro, Renovação, Pós-Registro), medical devices (Notificação,
 * Cadastro, Registro), IVDs, and cosmetics. Per ANVISA RDC 204/2017 and
 * the SOLICITA Electronic Submission Technical Guide.
 *
 * Transport: HTTPS POST with Bearer token + company CNPJ identifier.
 * Package: ZIP with CTD structure; BR-specific Module 1 (m1/br/).
 * Note: Portuguese-language administrative documents are required in Module 1.
 *
 * Honesty: throws CredentialError when ANVISA credentials are absent — never
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
import { httpsRequest, insertTransmittal, patchTransmittal, buildMultipart, sha256hex } from './rest-gateway-helpers';
import { platformTransmittalRecord } from './acknowledgement';

interface AnvisaCredentials {
  endpointUrl: string;
  bearerToken: string;
  companyId: string;
}

function loadCreds(env: 'staging' | 'production'): AnvisaCredentials {
  const p = env === 'production' ? 'ANVISA_' : 'ANVISA_STAGING_';
  const endpointUrl  = process.env[p + 'URL'];
  const bearerToken  = process.env[p + 'TOKEN'];
  const companyId    = process.env[p + 'COMPANY_ID'];
  const missing: string[] = [];
  if (!endpointUrl)  missing.push(p + 'URL');
  if (!bearerToken)  missing.push(p + 'TOKEN');
  if (!companyId)    missing.push(p + 'COMPANY_ID');
  if (missing.length > 0) throw new CredentialError('br', 'anvisa_gateway', env, missing);
  return { endpointUrl: endpointUrl!, bearerToken: bearerToken!, companyId: companyId! };
}

export class AnvisaGateway implements SubmissionGateway {
  readonly region    = 'br' as const;
  readonly gateway   = 'anvisa_gateway' as const;
  readonly transport = 'rest' as const;

  async isConfigured(_orgId: number, env: 'staging' | 'production'): Promise<boolean> {
    try { loadCreds(env); return true; }
    catch { return false; } // an unreadable cert or key is not 'configured'
  }

  async transmit(req: GatewayTransmitRequest): Promise<GatewayTransmitResult> {
    const entry = req.submissionType ? resolveToRegistryEntry(req.submissionType) : null;
    const normReq = entry ? { ...req, submissionType: entry.applicationType } : req;
    const agency = requiredAgencyMetadata(normReq);
    const id = await insertTransmittal('br', 'anvisa_gateway', 'ectd', normReq);
    try {
      const creds = loadCreds(normReq.environment);
      await patchTransmittal(id, { status: 'in_transit' });
      const zipBuf = await readVerifiedBundle(normReq.bundle);
      const boundary = `----anvisa-${Date.now()}`;
      const meta = Buffer.from(JSON.stringify({
        companyId: creds.companyId,
        processNumber: normReq.metadata?.applicationId ?? null,
        sequenceNumber: agency.sequenceNumber,
        submissionType: agency.submissionType,
        sha256: normReq.bundle.sha256,
      }), 'utf8');
      const body = buildMultipart(boundary, meta, zipBuf, 'ectd-br.zip');
      const path = '/api/v1/submissoes';
      const resp = await httpsRequest({
        method: 'POST',
        url: `${creds.endpointUrl.replace(/\/$/, '')}${path}`,
        headers: {
          'Content-Type':      `multipart/form-data; boundary=${boundary}`,
          'Content-Length':    String(body.length),
          'Authorization':     `Bearer ${creds.bearerToken}`,
          'X-ANVISA-Company':  creds.companyId,
          'X-ANVISA-Sha256':   sha256hex(body),
          'Accept':            'application/json',
        },
        body, errorPrefix: 'ANVISA Gateway POST',
      });
      if (resp.httpStatus < 200 || resp.httpStatus >= 300) {
        await patchTransmittal(id, { status: 'rejected', httpStatus: resp.httpStatus,
          errorClass: 'gateway', errorMessage: `HTTP ${resp.httpStatus}: ${resp.body.toString('utf8').slice(0, 500)}` });
        throw new GatewayError(`ANVISA returned HTTP ${resp.httpStatus}`, resp.httpStatus, null, resp.body.toString('utf8'));
      }
      let parsed: { protocoloId?: string; receiptId?: string; numeroProtocolo?: string };
      try { parsed = JSON.parse(resp.body.toString('utf8')); }
      catch { throw new GatewayError('ANVISA returned non-JSON success', resp.httpStatus, null, resp.body.toString('utf8')); }
      const receiptId = parsed.protocoloId ?? parsed.receiptId ?? parsed.numeroProtocolo ?? null;
      if (!receiptId) {
        // A 2xx whose body names no receipt is not an accepted submission. This
        // minted `anvisa-<timestamp>` here, recorded the row as received with an
        // acknowledgement time from the platform clock, told the operator
        // "accepted. Receipt: anvisa-…", and later polled the agency for a
        // receipt that never existed. CESP refuses the same case; so does this.
        await patchTransmittal(id, {
          status: 'rejected', httpStatus: resp.httpStatus,
          errorClass: 'gateway', errorMessage: 'Agency returned success with no receipt identifier in the body.',
        });
        throw new GatewayError('ANVISA response missing a receipt identifier', resp.httpStatus, null, parsed);
      }
      await patchTransmittal(id, { status: 'received', transmissionId: receiptId,
        httpStatus: resp.httpStatus, ackReceivedAt: new Date() });
      return { transmittalId: id, transmissionId: receiptId, status: 'received', transport: 'rest',
        httpStatus: resp.httpStatus, ackReceivedAt: new Date(),
        message: `ANVISA submission accepted. Protocol: ${receiptId}.` };
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
         FROM submission_transmittals WHERE id = $1 AND region = 'br' AND gateway = 'anvisa_gateway'`,
      [transmittalId],
    );
    if (rows.length === 0 || !rows[0].transmission_id)
      throw new GatewayError(`Transmittal ${transmittalId} not found`, 404, null, null);
    let pollError: string | null = 'The agency status poll did not complete.';
    try {
      const env = (rows[0].metadata?.environment as 'staging' | 'production' | undefined) ?? 'production';
      const creds = loadCreds(env);
      const resp = await httpsRequest({
        method: 'GET',
        url: `${creds.endpointUrl.replace(/\/$/, '')}/api/v1/submissoes/${encodeURIComponent(rows[0].transmission_id!)}`,
        headers: { 'Authorization': `Bearer ${creds.bearerToken}`, 'Accept': 'application/json' },
        errorPrefix: 'ANVISA status poll', timeoutMs: 60_000,
      });
      if (resp.httpStatus === 200) {
        const p = JSON.parse(resp.body.toString('utf8')) as { situacao?: string; status?: string };
        const raw = p.situacao ?? p.status ?? '';
        const mapped: SubmissionStatus =
          raw === 'recebido'     ? 'received'
          : raw === 'validado'     ? 'validation_passed'
          : raw === 'pendencia'    ? 'response_required'
          : raw === 'em_analise'   ? 'review_started'
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
         WHERE id = $1 AND region = 'br' AND gateway = 'anvisa_gateway'`, [transmittalId]);
    if (rows.length === 0)
      throw new GatewayError(`Transmittal ${transmittalId} not found`, 404, null, null);
    const r = rows[0];
        // Not an agency acknowledgement — this platform's own record of the
    // transmission, titled as such. See ./acknowledgement.ts.
    return platformTransmittalRecord({
      transmittalId,
      transmissionId: r.transmission_id,
      gatewayLabel: 'ANVISA (anvisa_gateway)',
      status: r.status,
      ackReceivedAt: r.ack_received_at,
      extra: { 'Protocol': r.transmission_id },
    });
  }
}
