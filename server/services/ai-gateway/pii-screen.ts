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
 * Enforcement is env-configurable (AI_PII_ENFORCEMENT):
 *   - 'off'   — no screening.
 *   - 'audit' — detect + record a content-free placement signal, never block.
 *               The NON-PRODUCTION default: makes the previously invisible
 *               exposure visible without breaking pilot AI flows on the
 *               heuristic's false positives (e.g. an email in a document).
 *   - 'block' — fail closed: the placement contract is enforced at dispatch.
 *
 * ── Production posture (runbook B19, fixed 2026-09-20) ──────────────────────
 * In production the DEFAULT is 'block'. An explicit 'audit' or 'off' is a
 * deliberate, operator-owned degraded posture and must be recorded as such
 * with AI_GOVERNANCE_ACCEPT_PERMISSIVE=true — exactly the shape of
 * AUDIT_SEAL_ACCEPT_UNSEALED for the audit seal. Without the acceptance the
 * boot gate (server/startup/ai-governance-posture.ts, fired on import from
 * server/config/environment.ts) REFUSES TO BOOT, and — defence in depth, for
 * any code path that reads the gate without the boot gate having fired — this
 * resolver returns 'block' rather than the unaccepted permissive value. The
 * dispatch path already enforced the placement contract in production
 * regardless of this setting; what changed is that the configured posture
 * can no longer silently disagree with the enforced one.
 *
 * Non-production behaviour is unchanged: unset → 'audit', explicit values
 * honoured, unrecognized → 'audit', no acceptance needed.
 *
 * `resolvePiiEnforcement` is pure and env-injectable so the boot gate can
 * import it instead of carrying a duplicate that drifts.
 *
 * @module server/services/ai-gateway/pii-screen
 */

import type { GatewayRequest } from './types';

export type PiiEnforcement = 'off' | 'audit' | 'block';

/** The written-acceptance variable for a permissive AI-governance gate in production. */
export const AI_GOVERNANCE_ACCEPT_PERMISSIVE_VAR = 'AI_GOVERNANCE_ACCEPT_PERMISSIVE';

/** True when the operator has explicitly accepted a permissive gate in production. */
export function acceptsPermissiveAiGovernance(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env[AI_GOVERNANCE_ACCEPT_PERMISSIVE_VAR] ?? '').trim().toLowerCase() === 'true';
}

export function isProductionEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.NODE_ENV ?? '').trim().toLowerCase() === 'production';
}

export interface ResolvedPiiEnforcement {
  /** The value AI_PII_ENFORCEMENT carries, when it is one of the three modes; undefined when unset or unrecognized. */
  configured: PiiEnforcement | undefined;
  /** The mode the gateway runs with. */
  effective: PiiEnforcement;
  /**
   * True when `effective` was forced to 'block' because production carried an
   * explicit permissive value without AI_GOVERNANCE_ACCEPT_PERMISSIVE=true.
   * The boot gate refuses that configuration; this flag is the runtime echo.
   */
  forcedByProductionDefault: boolean;
}

/** Pure resolution of the PII screen mode from an environment. */
export function resolvePiiEnforcement(env: NodeJS.ProcessEnv = process.env): ResolvedPiiEnforcement {
  const raw = (env.AI_PII_ENFORCEMENT ?? '').trim().toLowerCase();
  const configured: PiiEnforcement | undefined =
    raw === 'off' || raw === 'audit' || raw === 'block' ? raw : undefined;
  const production = isProductionEnv(env);

  if (!production) {
    return { configured, effective: configured ?? 'audit', forcedByProductionDefault: false };
  }
  if (configured === undefined || configured === 'block') {
    return { configured, effective: 'block', forcedByProductionDefault: false };
  }
  if (acceptsPermissiveAiGovernance(env)) {
    return { configured, effective: configured, forcedByProductionDefault: false };
  }
  return { configured, effective: 'block', forcedByProductionDefault: true };
}

export function getPiiEnforcement(): PiiEnforcement {
  return resolvePiiEnforcement(process.env).effective;
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
