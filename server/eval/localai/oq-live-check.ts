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
import { APPROVED_MODELS, governingEntry, type ApprovedModel } from '../../services/ai-governance/approved-models';
import { CLOUD_MODELS } from '../../services/ai-gateway/providers/cloud-models';
import { hasConcreteQualifiedPin } from '../../services/ai-gateway/model-governance';
import type { ModelConfig } from '../../services/ai-gateway/types';

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
  readiness?: LocalQualificationReadiness;
}

interface LocalReadinessInputs {
  env?: NodeJS.ProcessEnv;
  registry?: readonly ModelConfig[];
  entries?: readonly ApprovedModel[];
  reportedModels?: readonly string[];
}

export interface LocalQualificationReadiness {
  kind: 'local-qualification-readiness';
  status: 'blocked';
  readyToEvaluate: false;
  qualifiesModel: false;
  endpointConfigured: boolean;
  routingEnabled: boolean;
  expectedModel: { id: string | null; version: string | null; immutablePin: boolean };
  runtimeIdentity: { status: 'not_probed' | 'matched' | 'mismatched'; reportedModelCount: number; matchedModel: string | null };
  weightsVerification: 'not_independently_verified';
  blockers: Array<{ code: string; message: string }>;
}

function localConfiguration(inputs: LocalReadinessInputs) {
  const env = inputs.env ?? process.env;
  const row = (inputs.registry ?? CLOUD_MODELS).find(model => model.provider === 'local');
  const entry = row ? governingEntry(row, inputs.entries ?? APPROVED_MODELS) : undefined;
  const endpointConfigured = Boolean(env.LOCAL_AI_BASE_URL || env.LITELLM_BASE_URL);
  const routingEnabled = endpointConfigured && env.AI_LOCAL_ENABLED === 'true' && Boolean(row?.enabled);
  const immutablePin = Boolean(entry && hasConcreteQualifiedPin(entry));
  return { row, entry, endpointConfigured, routingEnabled, immutablePin };
}

function localRuntimeIdentity(configuration: ReturnType<typeof localConfiguration>, reported?: readonly string[]): LocalQualificationReadiness['runtimeIdentity'] {
  const matched = configuration.immutablePin && reported?.includes(configuration.entry!.pinnedVersion) === true;
  return { status: reported === undefined ? 'not_probed' : matched ? 'matched' : 'mismatched',
    reportedModelCount: reported?.length ?? 0, matchedModel: matched ? configuration.entry!.pinnedVersion : null };
}

function localReadinessBlockers(configuration: ReturnType<typeof localConfiguration>, identity: LocalQualificationReadiness['runtimeIdentity']) {
  const { endpointConfigured, routingEnabled, entry, immutablePin } = configuration;
  const blockers: LocalQualificationReadiness['blockers'] = [];
  if (!endpointConfigured) blockers.push({ code: 'LOCAL_ENDPOINT_UNCONFIGURED', message: 'A self-hosted generation endpoint has not been configured.' });
  if (!routingEnabled) blockers.push({ code: 'LOCAL_ROUTING_DISABLED', message: 'The local generation lane is not enabled.' });
  if (!entry) blockers.push({ code: 'LOCAL_REGISTRY_DRIFT', message: 'The configured local row does not match its controlled registry entry.' });
  if (!immutablePin) blockers.push({ code: 'LOCAL_PIN_NOT_CONCRETE', message: 'The controlled local entry does not pin immutable weights by SHA-256.' });
  if (identity.status === 'mismatched') blockers.push({ code: 'LOCAL_IDENTITY_NOT_REPORTED', message: 'Discovery did not report the exact configured immutable model identity.' });
  blockers.push({ code: 'LOCAL_WEIGHTS_NOT_INDEPENDENTLY_VERIFIED', message: 'Runtime inventory cannot independently verify loaded weights, the runtime image or deployment configuration.' });
  return blockers;
}

/** A runtime model name is a declaration, not a measurement of loaded weights or deployment configuration. */
export function localQualificationReadiness(inputs: LocalReadinessInputs = {}): LocalQualificationReadiness {
  const configuration = localConfiguration(inputs);
  const runtimeIdentity = localRuntimeIdentity(configuration, inputs.reportedModels);
  const { endpointConfigured, routingEnabled, row, entry, immutablePin } = configuration;
  return { kind: 'local-qualification-readiness', status: 'blocked', readyToEvaluate: false, qualifiesModel: false,
    endpointConfigured, routingEnabled, expectedModel: { id: row?.id ?? null, version: entry?.pinnedVersion ?? null, immutablePin },
    runtimeIdentity, weightsVerification: 'not_independently_verified', blockers: localReadinessBlockers(configuration, runtimeIdentity) };
}

/**
 * Inspect runtime-declared identity through the existing client factory.
 * Reachability and matching inventory cannot independently attest loaded
 * weights or deployment configuration, so neither establishes readiness.
 */
export async function probeLocalEndpoint(inputs: LocalReadinessInputs = {}): Promise<ProbeResult> {
  const before = localQualificationReadiness(inputs);
  if (!before.routingEnabled || !before.expectedModel.immutablePin) return { ok: false, readiness: before, error: 'LOCAL_QUALIFICATION_PREREQUISITES_BLOCKED' };
  const client = createLocalClient();
  if (!client) {
    return { ok: false, readiness: before, error: 'LOCAL_CLIENT_UNAVAILABLE' };
  }
  try {
    const list: any = await client.models.list();
    const models: string[] = Array.isArray(list?.data) ? list.data.map((model: { id?: unknown }) => model.id).filter((id: unknown): id is string => typeof id === 'string' && Boolean(id.trim())) : [];
    const readiness = localQualificationReadiness({ ...inputs, reportedModels: models });
    return { ok: false, readiness, models: readiness.runtimeIdentity.matchedModel ? [readiness.runtimeIdentity.matchedModel] : [],
      error: readiness.runtimeIdentity.status === 'matched' ? 'LOCAL_DEPLOYMENT_EVIDENCE_REQUIRED' : 'LOCAL_IDENTITY_NOT_REPORTED' };
  } catch {
    return { ok: false, readiness: before, error: 'LOCAL_DISCOVERY_FAILED' };
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

  console.log('\n[OQ] Local endpoint configured — checking controlled identity and discovery prerequisites...');
  const probe = await probeLocalEndpoint();
  if (probe.readiness) console.log(JSON.stringify(probe.readiness));
  if (!probe.ok) {
    console.error(`[OQ] BLOCKED: local qualification readiness is not established — ${probe.error}`);
    process.exitCode = 1;
    return;
  }
  console.log('[OQ] Exact runtime identity was reported; independent deployment evidence and model qualification remain separate requirements.');
}
/* eslint-enable no-console */

// Only execute when invoked directly; importing (tests) must have no effect and
// make no network calls.
const invokedDirectly =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]!).href;
if (invokedDirectly) {
  void main();
}
