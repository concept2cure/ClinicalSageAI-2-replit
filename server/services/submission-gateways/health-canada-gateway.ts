/**
 * Health Canada gateway — region 'ca'.
 *
 * PROTOCOL: UNVERIFIED — no agency source. Nothing is transmitted.
 *
 * 2026-10-08 (FILING_SPINE F19b; WORKFLOW_DECISION_2026-10-08 §5: "Health
 * Canada must refuse, not post to an endpoint written from no agency source").
 * This file used to describe, and implement, an HTTPS + mTLS + HMAC-SHA256 REST
 * protocol at cesg.hc-sc.gc.ca/submission/v1 (multipart upload,
 * /receipts/{id} polling, 'receipt' / 'pre-check' / 'accepted' acks, X-HC-*
 * signature headers), "mirroring the PMDA gateway". It cited a "CESG
 * onboarding specification" that was never filed in this repository; the
 * endpoint, the headers and the signature scheme were written from no Health
 * Canada source. With five environment variables set (HC_CESG_URL,
 * HC_CESG_COMPANY_ID, HC_CESG_CERT_PATH, HC_CESG_KEY_PATH,
 * HC_CESG_HMAC_SECRET, or their HC_CESG_STAGING_ forms) it POSTed an eCTD
 * package to that endpoint and polled it for status. The PMDA gateway had the
 * same defect and was closed the same way on 2026-10-05 (pmda-gateway.ts).
 *
 * The market verdict says the same: services/regulatory/market-support.ts
 * judges this channel "no channel" with HEALTH_CANADA_NO_TRANSPORT (below),
 * the sentence every refusal here uses. (It said ADAPTER_UNSOURCED, "its adapter
 * posts to an endpoint written from no agency source", until this file stopped
 * posting.) A Health Canada filing with no outline (an NDS, a CTA) is not
 * offered at project creation; a master file, which binds the harmonised ICH
 * Module 3 outline, is offered for authoring only. No replacement transport
 * exists in the product: the sponsor submits through Health Canada's own
 * channel.
 *
 * So, until a transport taken from Health Canada's own specification replaces
 * this file:
 *   - transmit refuses with the typed UnverifiedTransportError (transmitted ===
 *     false) — after the pure metadata check, before any transmittal row, any
 *     credential read and any socket — so refusedBeforeWire (index.ts) releases
 *     a caller's transmit claim;
 *   - checkStatus never polls: it returns the stored row as source 'stored',
 *     with the reason;
 *   - isConfigured is false: there is no sourced transport to configure.
 * The invented credential variables above are no longer read.
 */

import { pool } from '../../db';
import { platformTransmittalRecord } from './acknowledgement';
import {
  GatewayError, UnverifiedTransportError, requiredAgencyMetadata,
  type GatewayAcknowledgment, type GatewayStatusResult, type GatewayTransmitRequest,
  type GatewayTransmitResult, type SubmissionGateway, type SubmissionStatus,
} from './types';
/**
 * Why nothing is sent to Health Canada. One sentence: the market statement
 * (services/regulatory/market-support.ts) uses it as this channel's detail,
 * in place of ADAPTER_UNSOURCED, which says an adapter posts somewhere. It is
 * defined here, not there, because market-support reaches this module through
 * the gateway registry (submittabilityCoverage.ts → index.ts), and the reverse
 * import made a cycle in which this class was not yet defined.
 */
export const HEALTH_CANADA_NO_TRANSPORT =
  'no transport taken from a Health Canada source exists here, so nothing is sent to Health Canada';

/** Why nothing is sent to, or read from, Health Canada: the market statement's own words. */
const HC_REFUSAL = `No Health Canada channel: ${HEALTH_CANADA_NO_TRANSPORT}. Submit through Health Canada's own channel.`;

export class HealthCanadaGateway implements SubmissionGateway {
  readonly region    = 'ca' as const;
  readonly gateway   = 'hc_cesg' as const;
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
      'ca', 'hc_cesg', 'rest',
      `Sequence ${agency.sequenceNumber} was not sent and no transmittal was recorded. ${HC_REFUSAL}`,
    );
  }

  async checkStatus(transmittalId: number): Promise<GatewayStatusResult> {
    const { rows } = await pool.query<{
      transmission_id: string | null; status: string; ack_received_at: Date | null;
    }>(
      `SELECT transmission_id, status, ack_received_at FROM submission_transmittals
        WHERE id = $1 AND region = 'ca' AND gateway = 'hc_cesg'`,
      [transmittalId],
    );
    if (rows.length === 0 || !rows[0].transmission_id) {
      throw new GatewayError(`Transmittal ${transmittalId} not found`, 404, null, null);
    }
    return {
      source: 'stored',
      pollError: `Not polled: the Health Canada status protocol is unverified. ${HC_REFUSAL}`,
      transmittalId,
      transmissionId: rows[0].transmission_id,
      status: rows[0].status as SubmissionStatus,
      ackReceivedAt: rows[0].ack_received_at,
    };
  }

  async downloadAcknowledgment(transmittalId: number): Promise<GatewayAcknowledgment> {
    const { rows } = await pool.query<{ transmission_id: string; ack_received_at: Date | null; status: string }>(
      `SELECT transmission_id, ack_received_at, status FROM submission_transmittals
        WHERE id = $1 AND region = 'ca' AND gateway = 'hc_cesg'`,
      [transmittalId],
    );
    if (rows.length === 0) {
      throw new GatewayError(`Transmittal ${transmittalId} not found`, 404, null, null);
    }
    const r = rows[0];
    // Not an agency acknowledgement — this platform's own record of a row
    // written before 2026-10-08, titled as such. See ./acknowledgement.ts.
    return platformTransmittalRecord({
      transmittalId,
      transmissionId: r.transmission_id,
      gatewayLabel: 'Health Canada CESG (hc_cesg)',
      status: r.status,
      ackReceivedAt: r.ack_received_at,
      extra: { 'Receipt': r.transmission_id },
    });
  }
}
