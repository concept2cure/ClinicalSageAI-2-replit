/**
 * Deterministic mode: when the gateway answers with fixed responses instead of
 * a model, and when that is allowed.
 *
 * `AI_GATEWAY_DETERMINISTIC=true` (legacy alias `DETERMINISTIC_MODE=true`)
 * makes every request return a canned response. It exists so tests, local
 * development and the CI boot job can run without a provider key, and
 * `/readyz` names the state `deterministic`, never `ready`
 * (server/startup/ana-readiness-state.ts).
 *
 * In production a fixed response is placeholder text standing where a
 * regulatory user expects model output, and it can be accepted into a
 * governed draft. Until 2026-09-28 nothing refused it there: a production
 * process with the flag served `**AnA (Demo Mode):** …` for "Draft section
 * 2.7.3" while every health check read green
 * (docs/evidence/D2-DETERMINISTIC-PROD/2026-09-28/).
 *
 * So in production the flag needs its own written acceptance,
 * `AI_GATEWAY_ACCEPT_DETERMINISTIC=true`, the STORAGE_ACCEPT_LOCAL_DISK shape.
 * It is deliberately not AI_GOVERNANCE_ACCEPT_PERMISSIVE: accepting a
 * permissive PII screen for a synthetic-data pilot does not accept fabricated
 * drafting. The acceptance is for throwaway environments such as the CI boot
 * job. The deploy pipeline refuses any `*_ACCEPT_*` variable, and the flag
 * itself, in a task definition (.github/workflows/deploy-aws.yml).
 *
 * Enforced twice, the pii-screen way: at boot by
 * server/startup/ai-governance-posture.ts::assertDeterministicModePostureForProduction,
 * and at request time by the gateway, which covers a runtime toggle.
 *
 * @module server/services/ai-gateway/deterministic-mode
 */

import { isProductionEnv } from './pii-screen';

export const AI_GATEWAY_DETERMINISTIC_VAR = 'AI_GATEWAY_DETERMINISTIC';
/** Legacy alias, honoured so an old environment is still read correctly. */
export const DETERMINISTIC_MODE_LEGACY_VAR = 'DETERMINISTIC_MODE';
export const AI_GATEWAY_ACCEPT_DETERMINISTIC_VAR = 'AI_GATEWAY_ACCEPT_DETERMINISTIC';

// Read by literal property, not through the name constants: ci:env-var-docs
// finds variables by scanning for `env.NAME`, and an indirect read hides the
// variable from it, and so from .env.example.

/** The flag as the gateway reads it into `GatewayConfig.deterministicMode`. */
export function isDeterministicModeRequested(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.AI_GATEWAY_DETERMINISTIC === 'true' || env.DETERMINISTIC_MODE === 'true';
}

/** True only for the literal "true": a mistyped acceptance does not accept. */
export function acceptsDeterministicMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.AI_GATEWAY_ACCEPT_DETERMINISTIC === 'true';
}

export const DETERMINISTIC_PRODUCTION_RISK =
  'AnA answers with fixed responses, not model output, and those responses can be accepted into governed drafts';

/**
 * Throws in production unless the acceptance is recorded. Called by the
 * gateway immediately before it would serve a fixed response.
 */
export function assertDeterministicServingAllowed(env: NodeJS.ProcessEnv = process.env): void {
  if (!isProductionEnv(env) || acceptsDeterministicMode(env)) return;
  throw new Error(
    `[AI Gateway] Refusing to serve a fixed response in production: deterministic mode is on, so ` +
      `${DETERMINISTIC_PRODUCTION_RISK}. Unset ${AI_GATEWAY_DETERMINISTIC_VAR} (and ` +
      `${DETERMINISTIC_MODE_LEGACY_VAR}) to use a live provider, or set ` +
      `${AI_GATEWAY_ACCEPT_DETERMINISTIC_VAR}=true only in a throwaway environment that serves no user.`,
  );
}
