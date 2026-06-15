/**
 * Delivery / e-signature gate for Report-OS.
 *
 * Implements the spec rule: no external send of a sealed/final report without
 * an e-signature; non-final (draft/partial) exports are watermarked. Pure, no
 * IO. The audit payload is returned for the caller to persist.
 */

import type { ReportRunStatus } from '../truthfulness';
import type { DeliveryChannel, DeliveryDecision } from './types';

/**
 * Decide whether a report may be delivered on the given channel, and what
 * conditions (e-signature, watermark) apply.
 */
export function decideDelivery(
  report: { status: ReportRunStatus; sealed?: boolean },
  channel: DeliveryChannel,
): DeliveryDecision {
  const isFinal = report.status === 'final' || report.sealed === true;

  if (channel === 'external') {
    if (isFinal) {
      return {
        allowed: true,
        requiresESignature: true,
        watermark: false,
        reason: 'External send of a sealed/final report requires an e-signature.',
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
    watermark: input.decision.watermark,
    reason: input.decision.reason ?? null,
    at: input.at,
  };
}
