/**
 * Delivery / e-signature gate for Report-OS.
 *
 * Implements the spec rule: no external send of a sealed/final report without
 * an e-signature; non-final (draft/partial) exports are watermarked. Pure, no
 * IO. The audit payload is returned for the caller to persist.
 *
 * P1-44b (2026-10-01): finalizing a run is its electronic signature (POST
 * /api/report-os/runs/:id/finalize signs `report-run:<id>` over the seal), so a
 * final report carries the signature the rule asks for. The caller passes the
 * id of that signature when the report has one, and the gate decides the whole
 * rule: a final report with its signature goes out with no second ceremony; one
 * without is not allowed. Before, the gate could only say a signature was
 * required, and the caller refused every external send of a final report.
 */

import type { ReportRunStatus } from '../truthfulness';
import type { DeliveryChannel, DeliveryDecision } from './types';

/**
 * Decide whether a report may be delivered on the given channel, and what
 * conditions (e-signature, watermark) apply. `signatureId` is the live
 * signature the report was finalized under, when it has one.
 */
export function decideDelivery(
  report: { status: ReportRunStatus; sealed?: boolean; signatureId?: number | null },
  channel: DeliveryChannel,
): DeliveryDecision {
  const isFinal = report.status === 'final' || report.sealed === true;

  if (channel === 'external') {
    if (isFinal) {
      const signatureId = report.signatureId ?? null;
      if (signatureId == null) {
        return {
          allowed: false,
          requiresESignature: true,
          watermark: false,
          reason: 'External send of a sealed/final report requires an e-signature, and this report carries none.',
        };
      }
      return {
        allowed: true,
        requiresESignature: true,
        signatureId,
        watermark: false,
        reason: 'External send of a sealed/final report carries the e-signature it was finalized under.',
      };
    }
    return {
      allowed: true,
      requiresESignature: false,
      watermark: true,
      reason: `Non-final export (status: ${report.status}) is watermarked as draft.`,
    };
  }

  // platform channel: in-platform viewing, no e-signature gate.
  return {
    allowed: true,
    requiresESignature: false,
    watermark: report.status !== 'final',
  };
}

/**
 * Normalize a delivery audit payload for persistence by the caller. No IO.
 */
export function describeDeliveryAudit(input: {
  subscriptionId?: number;
  reportTypeId: string;
  channel: DeliveryChannel;
  recipients: string[];
  decision: DeliveryDecision;
  at: string;
}): Record<string, unknown> {
  return {
    subscriptionId: input.subscriptionId ?? null,
    reportTypeId: input.reportTypeId,
    channel: input.channel,
    recipientCount: input.recipients.length,
    recipients: input.recipients,
    allowed: input.decision.allowed,
    requiresESignature: input.decision.requiresESignature,
    signatureId: input.decision.signatureId ?? null,
    watermark: input.decision.watermark,
    reason: input.decision.reason ?? null,
    at: input.at,
  };
}
