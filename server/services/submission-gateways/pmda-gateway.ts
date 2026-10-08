/**
 * PMDA Gateway — Japan (Pharmaceuticals and Medical Devices Agency).
 *
 * PROTOCOL: UNVERIFIED — no regulator source. Nothing is transmitted.
 *
 * 2026-10-05 (D2 record, step g-pmda-transmit-unverified; finding
 * drugs-jp-ectd-v4-only-for-new-applications). This file used to describe, and
 * implement, an HTTPS + mTLS + HMAC-SHA256 REST protocol at
 * gateway.pmda.go.jp/submission/v1 (multipart upload, /receipts/{id} polling,
 * 'receipt' / 'pre-check' / 'review-accepted' acks), citing a "PMDA Gateway
 * System Operating Procedure (2022)". No regulator text for any of it was ever
 * filed. With five environment variables set it POSTed an eCTD package to that
 * endpoint and polled it for status.
 *
 * PMDA's actual electronic channel is 申請電子データシステム (the "gateway
 * system", https://esg.pmda.go.jp/). Per PMDA's own material (search extracts,
 * 2026-10-05; see docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-05-record/
 * g-pmda-transmit-unverified-facts.md) it is used with a personal electronic
 * certificate and a user registration, and a 提出予告 (advance notice) issues
 * the eCTD reception number before the eCTD is uploaded. Its operation manual
 * (esg.pmda.go.jp/files/manual_ectd_sd.pdf) has not been read here.
 *
 * So, until a protocol taken from that source replaces this file:
 *   - transmit refuses with the typed UnverifiedTransportError (transmitted ===
 *     false) — after the pure metadata check, before any transmittal row, any
 *     credential read and any socket — so refusedBeforeWire (index.ts) releases
 *     a caller's transmit claim;
 *   - checkStatus never polls: it returns the stored row as source 'stored',
 *     with the reason;
 *   - isConfigured is false: there is no sourced transport to configure.
 * The invented credential variables (PMDA_URL, PMDA_APPLICANT_ID,
 * PMDA_CERT_PATH, PMDA_KEY_PATH, PMDA_HMAC_SECRET) are no longer read.
 *
 * Separately, from 2026-04-01 PMDA accepts only eCTD v4.0 for new approval
 * applications and this platform builds Japan packages in v3.2.2 only; a new
 * Japanese application is blocked earlier, at dispatch (JP_ECTD_V4_REQUIRED,
 * server/services/ectd/dispatch-readiness.ts).
 */

import { pool } from '../../db';
import { platformTransmittalRecord } from './acknowledgement';
import {
  GatewayError, UnverifiedTransportError, requiredAgencyMetadata,
  type GatewayAcknowledgment, type GatewayStatusResult, type GatewayTransmitRequest,
  type GatewayTransmitResult, type SubmissionGateway, type SubmissionStatus,
} from './types';
import { PMDA_PROTOCOL_UNVERIFIED } from './transport-refusals';

/* Why nothing is sent to, or read from, PMDA: one sentence, used by every
   refusal here and by the market line (transport-refusals.ts). */

export class PmdaGateway implements SubmissionGateway {
  readonly region    = 'pmda' as const;
  readonly gateway   = 'pmda_gateway' as const;
  readonly transport = 'rest' as const;

  /** Always false: no sourced transport exists to be configured. */
  async isConfigured(_orgId: number, _environment: 'staging' | 'production'): Promise<boolean> {
    return false;
  }

  async transmit(req: GatewayTransmitRequest): Promise<GatewayTransmitResult> {
    // The request's own defects are reported first (a pure check, typed as
    // nothing transmitted), then the refusal that applies to every request.
    const agency = requiredAgencyMetadata(req);
    throw new UnverifiedTransportError(
      'pmda', 'pmda_gateway', 'rest',
      `Sequence ${agency.sequenceNumber} was not sent and no transmittal was recorded. ${PMDA_PROTOCOL_UNVERIFIED}`,
    );
  }

  async checkStatus(transmittalId: number): Promise<GatewayStatusResult> {
    const { rows } = await pool.query<{
      transmission_id: string | null; status: string; ack_received_at: Date | null;
    }>(
      `SELECT transmission_id, status, ack_received_at, metadata FROM submission_transmittals
        WHERE id = $1 AND region = 'pmda' AND gateway = 'pmda_gateway'`,
      [transmittalId],
    );
    if (rows.length === 0 || !rows[0].transmission_id) {
      throw new GatewayError(`Transmittal ${transmittalId} not found`, 404, null, null);
    }
    return {
      source: 'stored',
      pollError: `Not polled: the PMDA status protocol is unverified. ${PMDA_PROTOCOL_UNVERIFIED}`,
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
    // Not an agency acknowledgement — this platform's own record of the
    // transmission, titled as such. See ./acknowledgement.ts.
    return platformTransmittalRecord({
      transmittalId,
      transmissionId: r.transmission_id,
      gatewayLabel: 'PMDA (pmda_gateway)',
      status: r.status,
      ackReceivedAt: r.ack_received_at,
      extra: { 'Receipt': r.transmission_id },
    });
  }
}
