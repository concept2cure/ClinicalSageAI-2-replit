/**
 * `LITELLM_ENABLED=true` must not silently remove AI governance in production.
 *
 * ── WHAT THE FLAG DOES ───────────────────────────────────────────────────────
 * `server/services/aiProviderRouter.ts:602` makes the governed gateway the ELSE
 * branch:
 *
 *     if (this.liteLLMAdapter.isEnabled()) { ...adapter.execute()... }
 *     else                                 { ...executeViaGateway()... }
 *
 * so one env var diverts EVERY routed AI call away from `gateway.route()` — and
 * with it policy evaluation, the fail-closed PII/PHI screen, the
 * provider-placement / data-residency check, and the `ai.gateway_audit_log` row.
 * The router's own `ai_provider_audit_log` row carries no prompt hash, no
 * resolved model and no residency decision, so the call cannot be reconstructed
 * afterwards — which for a 21 CFR Part 11 estate is the whole point of the row.
 *
 * Before this guard the adapter read the flag, set a boolean, and said nothing.
 * The bypass was described as "latent" because `.env.example` defaults it false
 * and nothing in helm, terraform or compose sets it. That is latency by luck.
 * A governance control that one unreviewed env var can remove in silence is not
 * a control, and "nobody has set it yet" is not a safeguard.
 *
 * The production guard mirrors `server/db/rlsEnforcement.ts`, which refuses to
 * boot when `RLS_ENFORCE` is not `on`. Same reasoning, same shape: the operator
 * must say it twice, and the second saying names what is being given up.
 *
 * This is NOT a blessing of the bypass. Routing LiteLLM through the gateway as
 * a provider is the actual fix — WO-6.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LiteLLMAdapter } from '../LiteLLMAdapter';

const ACK = 'i-accept-ungoverned-ai-calls';

const ENV_KEYS = ['NODE_ENV', 'LITELLM_ENABLED', 'LITELLM_UNGOVERNED_ACK'] as const;
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('LiteLLMAdapter refuses to bypass the gateway silently in production', () => {
  it('REFUSES TO BOOT when enabled in production without the acknowledgement', () => {
    process.env.NODE_ENV = 'production';
    process.env.LITELLM_ENABLED = 'true';

    expect(() => new LiteLLMAdapter()).toThrow(/REFUSING TO BOOT/);
  });

  it('names what is lost, so the error is actionable without reading the source', () => {
    process.env.NODE_ENV = 'production';
    process.env.LITELLM_ENABLED = 'true';

    // An operator who hits this at 3am should learn the consequence from the
    // message, not be told a variable is wrong.
    expect(() => new LiteLLMAdapter()).toThrow(/PII\/PHI screen/);
    expect(() => new LiteLLMAdapter()).toThrow(/audit/i);
    expect(() => new LiteLLMAdapter()).toThrow(/LITELLM_UNGOVERNED_ACK/);
  });

  it('boots in production WITH the acknowledgement — this is a guard, not a ban', () => {
    process.env.NODE_ENV = 'production';
    process.env.LITELLM_ENABLED = 'true';
    process.env.LITELLM_UNGOVERNED_ACK = ACK;

    const adapter = new LiteLLMAdapter();
    expect(adapter.isEnabled()).toBe(true);
  });

  it('does not accept a truthy-looking acknowledgement', () => {
    process.env.NODE_ENV = 'production';
    process.env.LITELLM_ENABLED = 'true';

    // Same reasoning rlsEnforcement.ts gives for rejecting aliases of `on`: an
    // audit of the deployed environment must be a single exact-match grep. A
    // guard that accepts "true", "1" or "yes" is one an autocompleting deploy
    // tool can satisfy without anyone reading the sentence.
    for (const near of ['true', '1', 'yes', 'ack', 'I-ACCEPT-UNGOVERNED-AI-CALLS', ` ${ACK}x`]) {
      process.env.LITELLM_UNGOVERNED_ACK = near;
      expect(() => new LiteLLMAdapter(), `should reject ${JSON.stringify(near)}`).toThrow(
        /REFUSING TO BOOT/,
      );
    }
  });

  it('tolerates surrounding whitespace on the acknowledgement', () => {
    process.env.NODE_ENV = 'production';
    process.env.LITELLM_ENABLED = 'true';
    process.env.LITELLM_UNGOVERNED_ACK = `  ${ACK}\n`;

    // Env vars arrive from YAML, .env files and shell heredocs. Rejecting an
    // exactly-correct value because a deploy pipeline kept a trailing newline
    // would make the guard fire on the case it is not for.
    expect(() => new LiteLLMAdapter()).not.toThrow();
  });

  it('does not refuse outside production — dev and staging keep the flag', () => {
    process.env.LITELLM_ENABLED = 'true';

    for (const env of ['development', 'test', 'staging', undefined]) {
      if (env === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = env;
      expect(() => new LiteLLMAdapter(), `should boot under NODE_ENV=${env}`).not.toThrow();
    }
  });

  it('is inert when the flag is off — the default path is untouched', () => {
    process.env.NODE_ENV = 'production';

    const adapter = new LiteLLMAdapter();
    expect(adapter.isEnabled()).toBe(false);
  });
});
