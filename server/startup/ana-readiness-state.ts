/**
 * Process-wide AnA readiness flag.
 *
 * AnA is the product. Everything else on this platform is scaffolding around
 * her ability to answer. This module records, once at boot, whether she can —
 * and lets /readyz refuse to advertise a process where she cannot.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE INCIDENT — why this module exists.
 *
 * A tester opened the platform and AnA did not work at all. Not slowly, not
 * partially: every question returned "AnA is unreachable". The cause was one
 * line in the boot log, at debug level, between two hundred green checkmarks:
 *
 *     [AI Gateway] Initialized — providers: , strategy: task_based, deterministic: false
 *
 * No provider key was configured, so `getEnabledProviders()` was empty, so
 * POST /api/ana-ri/stream returned 503 GATEWAY_UNAVAILABLE (stream.ts) on every
 * single turn, and useAnaChat rendered the unreachable message.
 *
 * Every one of those two hundred checkmarks reported that a ROUTE HAD MOUNTED.
 * Not one of them established that anything behind a route could do work. And
 * /readyz — the probe an orchestrator uses to decide whether to send this
 * process live traffic — checked the database, the schema, Redis and the Bull
 * worker, and never once asked whether the platform's headline capability had a
 * model behind it. So the process reported `ready: true`, took traffic, and
 * failed every AnA request it was given.
 *
 * That is the same defect already recorded in readiness-state.ts one layer
 * down, where a schema check that had never run reported ready. The lesson did
 * not generalise on its own, so it is written out again here: a readiness probe
 * answers "should traffic be routed here?", and a process that will 503 every
 * AnA turn must answer no. Mounting is not readiness. Only capability is.
 *
 * The failure is now impossible to reach silently. It is a critical startup
 * invariant (lib/startup-invariants.ts), it turns /readyz red
 * (startup/inline-endpoints.ts), and in a developer's terminal it prints a
 * banner nobody can scroll past.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * States:
 *   'unknown'       — never verified. FAILS readiness. The default, because
 *                     "nobody checked" is not a yes; if it is ever observed on
 *                     a live process, a boot path returned without recording a
 *                     verdict and a red probe is the correct, loud response.
 *   'ready'         — at least one live AI provider is enabled. AnA can answer.
 *   'deterministic' — AI_GATEWAY_DETERMINISTIC is an explicit operator opt-in,
 *                     so it PASSES readiness — but it is named distinctly and
 *                     never collapsed into 'ready', because the two are not the
 *                     same thing and an operator must be able to tell canned
 *                     fixtures from a live model at a glance.
 *   'no_provider'   — the gateway initialized with zero enabled providers.
 *                     FAILS. This is the incident above.
 *   'error'         — the gateway could not be constructed. FAILS. Distinct
 *                     from 'no_provider' because "unknown, and we know why" is
 *                     diagnostically different from "checked, absent".
 *
 * @module server/startup/ana-readiness-state
 */

export type AnaReadiness = 'unknown' | 'ready' | 'deterministic' | 'no_provider' | 'error';

let anaReadiness: AnaReadiness = 'unknown';
let anaDetail = '';

export function setAnaReadiness(state: AnaReadiness, detail = ''): void {
  anaReadiness = state;
  anaDetail = detail;
}

export function getAnaReadiness(): AnaReadiness {
  return anaReadiness;
}

export function getAnaReadinessDetail(): string {
  return anaDetail;
}

/**
 * Does this state permit serving traffic?
 *
 * The single place the fail-open/fail-closed decision is made, so /readyz, the
 * startup invariant and the boot banner cannot drift apart on it. Only two
 * states pass, and 'unknown' is deliberately not one of them.
 */
export function isAnaReadinessServing(state: AnaReadiness = anaReadiness): boolean {
  return state === 'ready' || state === 'deterministic';
}

/**
 * Inspect the live gateway and record the verdict. Never throws — a readiness
 * probe that crashes tells an operator less than one that reports 'error'.
 *
 * Returns the recorded state so callers can branch without a second read.
 */
export async function evaluateAnaReadiness(): Promise<AnaReadiness> {
  try {
    const { getGateway } = await import('../services/ai-gateway/index.js');
    const gw = getGateway();

    if (!gw) {
      setAnaReadiness('error', 'AI gateway did not initialize (getGateway returned nothing)');
      return 'error';
    }

    // Deterministic mode is checked FIRST and on its own. It is a deliberate
    // opt-in that serves fixtures with no provider attached, so asking about
    // providers first would misreport an intentional test posture as an outage.
    if (gw.isDeterministic?.()) {
      setAnaReadiness(
        'deterministic',
        'AI_GATEWAY_DETERMINISTIC is set — AnA serves fixed responses, not live model output'
      );
      return 'deterministic';
    }

    const providers = gw.getEnabledProviders();
    if (!providers || providers.length === 0) {
      setAnaReadiness(
        'no_provider',
        'No AI provider is configured. Set ANTHROPIC_API_KEY (or OPENAI_API_KEY / ' +
          'KIMI_API_KEY) — without one, every AnA turn returns 503 GATEWAY_UNAVAILABLE.'
      );
      return 'no_provider';
    }

    setAnaReadiness('ready', `AnA has ${providers.length} provider(s): ${providers.join(', ')}`);
    return 'ready';
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    setAnaReadiness('error', `AI gateway could not be constructed: ${message}`);
    return 'error';
  }
}

/**
 * Print the boot verdict where a human will actually see it.
 *
 * The incident was not that the information was absent — `providers: ` was
 * right there in the log. It was that the information was indistinguishable
 * from two hundred lines of success. A failure that matters this much gets a
 * shape that cannot be skimmed past.
 */
export function logAnaReadinessBanner(): void {
  const state = getAnaReadiness();
  const detail = getAnaReadinessDetail();

  if (state === 'ready') {
    console.info(`✅ AnA is live — ${detail}`);
    return;
  }

  if (state === 'deterministic') {
    console.warn(
      '\n' +
        '┌─────────────────────────────────────────────────────────────────────────┐\n' +
        '│  AnA IS IN DETERMINISTIC MODE — RESPONSES ARE FIXTURES, NOT A MODEL      │\n' +
        '└─────────────────────────────────────────────────────────────────────────┘\n' +
        `  ${detail}\n` +
        '  Unset AI_GATEWAY_DETERMINISTIC to run AnA against a live provider.\n'
    );
    return;
  }

  console.error(
    '\n' +
      '┌─────────────────────────────────────────────────────────────────────────┐\n' +
      '│  AnA CANNOT ANSWER. THE PLATFORM IS UP BUT ITS CORE FEATURE IS DOWN.     │\n' +
      '└─────────────────────────────────────────────────────────────────────────┘\n' +
      `  ${detail}\n` +
      '  Every chat turn will fail with 503 GATEWAY_UNAVAILABLE until this is fixed.\n' +
      '  /readyz is reporting NOT READY for this reason.\n'
  );
}

/** Test seam: restore module state between cases. */
/**
 * Outcome of the boot-time AnA capability registry seed.
 *
 * 'pending' until the seed has run; 'seeded' when the table holds rows;
 * 'empty' when it ran and still holds none; 'failed' when it threw. Reported
 * by /readyz on both paths. It does not flip readiness on its own — a process
 * with a live provider still answers turns — but an operator reading
 * `capabilityRegistry: 'failed'` knows capability routing (ana-context-router)
 * is running on an empty table, which before this was invisible: the seed
 * failed on every production boot under RLS_ENFORCE=on and logged itself as
 * "non-blocking".
 */
export type CapabilityRegistryState = 'pending' | 'seeded' | 'empty' | 'failed';

let capabilityRegistryState: CapabilityRegistryState = 'pending';
let capabilityRegistryDetail = '';

export function setCapabilityRegistryState(state: CapabilityRegistryState, detail = ''): void {
  capabilityRegistryState = state;
  capabilityRegistryDetail = detail;
}

export function getCapabilityRegistryState(): CapabilityRegistryState {
  return capabilityRegistryState;
}

export function getCapabilityRegistryDetail(): string {
  return capabilityRegistryDetail;
}

export function resetAnaReadinessForTests(): void {
  capabilityRegistryState = 'pending';
  capabilityRegistryDetail = '';
  anaReadiness = 'unknown';
  anaDetail = '';
}
