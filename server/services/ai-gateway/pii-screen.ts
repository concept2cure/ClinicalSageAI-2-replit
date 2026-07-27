/**
 * AI Gateway — PHI/PII placement screen.
 *
 * The gateway advertised `piiDetection: true` but nothing ever ran it: the
 * policy engine only checked token budget, blocked patterns, and rate limits,
 * so tester PHI/PII could reach a shared frontier API that retains payloads.
 * This module is the seam that makes the flag real. It reuses the governance
 * content classifier (heuristic by default) and a pure decision function so
 * the enforcement rule is unit-testable in isolation from the gateway.
 *
 * Enforcement is env-configurable (AI_PII_ENFORCEMENT):
 *   - 'off'   — no screening.
 *   - 'audit' — detect + record, never block (DEFAULT). Makes the previously
 *               invisible exposure visible without breaking pilot AI flows on
 *               the heuristic's false positives (e.g. an email in a document).
 *   - 'block' — fail closed: content classified as PHI/PII may only go to a
 *               zero-data-retention provider; otherwise the request is refused.
 *               Recommended once a deployment handles real (non-synthetic) PHI.
 *
 * @module server/services/ai-gateway/pii-screen
 */

import type { GatewayRequest } from './types';
import type { ClassificationResult } from '../ai-governance/classification/types';

export type PiiEnforcement = 'off' | 'audit' | 'block';

export function getPiiEnforcement(): PiiEnforcement {
  const raw = (process.env.AI_PII_ENFORCEMENT || 'audit').trim().toLowerCase();
  return raw === 'off' || raw === 'block' ? raw : 'audit';
}

/**
 * Flatten a request's textual content for classification: every message's
 * `content` plus the text of any `text` content blocks. Non-text blocks
 * (images, documents) are not inspected here.
 */
export function extractRequestText(request: GatewayRequest): string {
  const parts: string[] = [];
  for (const message of request.messages ?? []) {
    if (typeof message.content === 'string' && message.content) parts.push(message.content);
    for (const block of message.contentBlocks ?? []) {
      if (block && (block as { type?: string }).type === 'text') {
        const text = (block as { text?: string }).text;
        if (typeof text === 'string' && text) parts.push(text);
      }
    }
  }
  return parts.join('\n');
}

export interface SensitiveDataDecision {
  /** True when the request must be refused. */
  block: boolean;
  /** Human-readable reason (safe for logs; contains no raw sensitive values). */
  reason?: string;
  /** True when protected data was detected (regardless of block outcome). */
  detected: boolean;
}

/**
 * Pure enforcement decision. PHI/PII detected in content bound for a provider
 * that does NOT contractually guarantee zero data retention is refused only
 * under 'block' enforcement; 'audit'/'off' never block. Regulatory-only
 * content (expected on this platform) is not treated as sensitive here.
 */
export function decideSensitiveDataPlacement(input: {
  classification: Pick<ClassificationResult, 'phi' | 'pii' | 'classes'>;
  zeroDataRetention: boolean;
  enforcement: PiiEnforcement;
  provider?: string;
}): SensitiveDataDecision {
  const { classification, zeroDataRetention, enforcement, provider } = input;
  const detected = Boolean(classification.phi || classification.pii);

  if (!detected || enforcement === 'off') {
    return { block: false, detected };
  }
  if (enforcement === 'audit') {
    return { block: false, detected };
  }
  // enforcement === 'block'
  if (zeroDataRetention) {
    return { block: false, detected };
  }
  const kinds = [classification.phi ? 'PHI' : null, classification.pii ? 'PII' : null]
    .filter(Boolean)
    .join('/');
  return {
    block: true,
    detected,
    reason:
      `Request content classified as ${kinds} cannot be routed to provider ` +
      `"${provider ?? 'unknown'}" (no zero-data-retention guarantee). Configure a ` +
      `zero-retention/private-cloud provider, or set AI_PII_ENFORCEMENT=audit if this ` +
      `content is synthetic.`,
  };
}
