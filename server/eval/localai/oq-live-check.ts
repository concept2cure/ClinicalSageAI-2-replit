/**
 * LocalAI on-prem inference — OQ live-check runner.
 *
 * Operational Qualification helper for the self-hosted inference substrate
 * (LOCALAI_ONPREM_INFERENCE_PILOT_PLAN §7 OQ). It does two things, in order:
 *
 *   1. Verifies the on-prem / ZDR ROUTING INVARIANTS — env-independent facts
 *      about the placement registry that guarantee a residency-constrained
 *      tenant is served ONLY on the self-hosted substrate and never silently
 *      falls back to a frontier API. This needs no live server and runs in CI.
 *
 *   2. If (and only if) a local endpoint is configured (LOCAL_AI_BASE_URL /
 *      LITELLM_BASE_URL), it PROBES that endpoint through the gateway's own
 *      createLocalClient() factory — the same seam the gateway uses, so the
 *      probe exercises the governed path and never opens a second egress
 *      (it does not construct its own client, so check-gateway-bypass stays
 *      green). With no endpoint configured it SKIPS cleanly and exits 0.
 *
 * IMPORTANT — CI safety: importing this module has NO side effects and makes
 * NO network calls. The network probe only runs from main(), which only runs
 * when the file is invoked as the process entry point. Building the placement
 * registry and the local client are both pure/offline (client construction
 * does not dial the server).
 *
 * Usage:
 *   tsx server/eval/localai/oq-live-check.ts
 *   LOCAL_AI_BASE_URL=http://vllm:8000/v1 tsx server/eval/localai/oq-live-check.ts
 *
 * Exit code is non-zero when a required routing invariant is violated or a
 * configured endpoint fails to respond — so it can gate an OQ pipeline.
 *
 * @module server/eval/localai/oq-live-check
 */

import { pathToFileURL } from 'node:url';
import { createLocalClient } from '../../services/ai-gateway/providers/clients';
import {
  buildPlacementRegistry,
  isPlacementCompliant,
} from '../../services/ai-gateway/providers/placement';
import type { ProviderName } from '../../services/ai-gateway/types';

/** The frontier substrates that must be excluded from on-prem residency. */
const FRONTIER_PROVIDERS: ProviderName[] = [
  'openai',
  'anthropic',
  'moonshot',
  'bedrock',
  'vertex',
  'azure',
];

/** Shared multi-tenant frontier providers — excluded from ZDR by default. */
const SHARED_FRONTIER_PROVIDERS: ProviderName[] = ['openai', 'anthropic', 'moonshot'];

export interface RoutingCheck {
  name: string;
  pass: boolean;
  /**
   * Required checks are env-independent air-gap guarantees and determine the overall
   * pass/fail. Informational checks (required:false) depend on operator env
   * (e.g. a signed ZDR addendum can legitimately make a shared provider
   * ZDR-compliant) and are reported but never fail the OQ on their own.
   */
  required: boolean;
  detail: string;
}

export interface RoutingInvariantResult {
  ok: boolean;
  checks: RoutingCheck[];
}

/**
 * Assert the placement-registry invariants that guarantee on-prem / ZDR
 * requests route ONLY to the self-hosted `local` substrate. Pure and offline —
 * builds the registry from current env and evaluates isPlacementCompliant().
 */
export function assertOnPremRoutingInvariants(): RoutingInvariantResult {
  const reg = buildPlacementRegistry();
  const checks: RoutingCheck[] = [];

  // ── Local substrate classification (env-independent) ──────────────────────
  checks.push({
    name: 'local-substrate-self-hosted',
    required: true,
    pass: reg.local.substrate === 'self_hosted',
    detail: `local.substrate=${reg.local.substrate}`,
  });
  checks.push({
    name: 'local-region-on-prem',
    required: true,
    pass: reg.local.regions.includes('on_prem'),
    detail: `local.regions=[${reg.local.regions.join(',')}]`,
  });
  checks.push({
    name: 'local-zero-data-retention',
    required: true,
    pass: reg.local.zeroDataRetention === true,
    detail: `local.zeroDataRetention=${reg.local.zeroDataRetention}`,
  });
  checks.push({
    name: 'local-satisfies-on-prem',
    required: true,
    pass: isPlacementCompliant(reg.local, { residency: 'on_prem' }) === true,
    detail: 'on_prem residency must route to local',
  });
  checks.push({
    name: 'local-satisfies-zdr',
    required: true,
    pass: isPlacementCompliant(reg.local, { zeroDataRetention: true }) === true,
    detail: 'zero-data-retention must be satisfiable by local',
  });

  // ── Every frontier substrate is excluded from on-prem (env-independent) ───
  for (const p of FRONTIER_PROVIDERS) {
    const compliant = isPlacementCompliant(reg[p], { residency: 'on_prem' });
    checks.push({
      name: `frontier-${p}-excluded-from-on-prem`,
      required: true,
      pass: compliant === false,
      detail: `${p} on_prem-compliant=${compliant} (must be false)`,
    });
  }

  // ── Shared frontier excluded from ZDR by default (env-dependent → info) ───
  for (const p of SHARED_FRONTIER_PROVIDERS) {
    const compliant = isPlacementCompliant(reg[p], { zeroDataRetention: true });
    checks.push({
      name: `shared-frontier-${p}-excluded-from-zdr-by-default`,
      required: false,
      pass: compliant === false,
      detail:
        `${p} zdr-compliant=${compliant} ` +
        '(informational — a signed ZDR addendum may legitimately flip this)',
    });
  }

  const ok = checks.filter(c => c.required).every(c => c.pass);
  return { ok, checks };
}

/** True when an operator has configured a self-hosted generation endpoint. */
export function isLocalEndpointConfigured(): boolean {
  return Boolean(process.env.LOCAL_AI_BASE_URL || process.env.LITELLM_BASE_URL);
}

/**
 * True when the gateway's local client factory yields a client for the current
 * env. Offline — constructing the OpenAI-compatible client does not dial the
 * server. Mirrors OQ's "no accidental activation" invariant.
 */
export function localClientActive(): boolean {
  return createLocalClient() !== null;
}

export interface ProbeResult {
  ok: boolean;
  models?: string[];
  error?: string;
}

/**
 * Probe the configured local endpoint via the gateway's createLocalClient()
 * (never a direct client — that would bypass the audited seam). Lists models;
 * a reachable OpenAI-compatible server answers. Returns a result object rather
 * than throwing so the runner can format it.
 */
export async function probeLocalEndpoint(): Promise<ProbeResult> {
  const client = createLocalClient();
  if (!client) {
    return { ok: false, error: 'no local client — LOCAL_AI_BASE_URL/LITELLM_BASE_URL unset' };
  }
  try {
    const list: any = await client.models.list();
    const models: string[] = (list?.data || []).map((m: any) => m.id).filter(Boolean);
    return { ok: true, models };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

/* eslint-disable no-console */
async function main(): Promise<void> {
  console.log('[OQ] LocalAI on-prem inference — routing invariants + live probe\n');

  const routing = assertOnPremRoutingInvariants();
  for (const c of routing.checks) {
    const status = c.pass ? 'PASS' : c.required ? 'FAIL' : 'warn';
    console.log(`  [${status}] ${c.name} — ${c.detail}`);
  }
  if (!routing.ok) {
    console.error(
      '\n[OQ] FAIL: on-prem/ZDR routing invariants violated — a residency-constrained ' +
        'request could route off-prem. Fix placement.ts before any on-prem tenant.',
    );
    process.exitCode = 1;
    return;
  }
  console.log('\n[OQ] Routing invariants OK: on-prem/ZDR routes only to the local substrate.');

  if (!isLocalEndpointConfigured()) {
    console.log(
      '[OQ] SKIP live probe: no LOCAL_AI_BASE_URL/LITELLM_BASE_URL configured. ' +
        'Routing invariants verified; endpoint probe skipped (CI-safe). Exit 0.',
    );
    return;
  }

  console.log('\n[OQ] Local endpoint configured — probing via the gateway local client...');
  const probe = await probeLocalEndpoint();
  if (!probe.ok) {
    console.error(`[OQ] FAIL: local endpoint did not respond — ${probe.error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`[OQ] PASS: local endpoint reachable. Served models: ${(probe.models || []).join(', ') || '(none reported)'}`);
}
/* eslint-enable no-console */

// Only execute when invoked directly; importing (tests) must have no effect and
// make no network calls.
const invokedDirectly =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]!).href;
if (invokedDirectly) {
  void main();
}
