/**
 * AI Gateway — PHI/PII screening support: enforcement-mode resolution and
 * request-text extraction.
 *
 * The gateway advertised `piiDetection: true` but nothing ever ran it: the
 * policy engine only checked token budget, blocked patterns, and rate limits,
 * so tester PHI/PII could reach a shared frontier API that retains payloads.
 * This module is the seam that makes the flag real: it resolves the
 * enforcement mode and flattens request content for the governance content
 * classifier. The placement DECISION itself lives in
 * `sensitive-placement-policy.ts` (`decideSensitivePlacement`) — the sole
 * placement decision — applied by `AIGateway.assertSensitiveDispatchAllowed`
 * immediately before every primary or fallback dispatch.
 *
 * Enforcement is env-configurable (AI_PII_ENFORCEMENT) and governs
 * NON-PRODUCTION behavior only — production always enforces the explicit
 * placement contract at dispatch, regardless of this setting:
 *   - 'off'   — no screening.
 *   - 'audit' — detect + record a content-free placement signal, never block
 *               (DEFAULT). Makes the previously invisible exposure visible
 *               without breaking pilot AI flows on the heuristic's false
 *               positives (e.g. an email in a document).
 *   - 'block' — fail closed: the placement contract is enforced at dispatch
 *               exactly as in production.
 *
 * @module server/services/ai-gateway/pii-screen
 */

import type { GatewayRequest } from './types';

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
