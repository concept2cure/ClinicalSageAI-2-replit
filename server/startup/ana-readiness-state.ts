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
 *   'ready'         — at least one live AI provider is enabled, and among its
 *                     enabled models is one approved for every high-risk task
 *                     type. AnA can answer and can draft.
 *   'deterministic' — AI_GATEWAY_DETERMINISTIC is an explicit operator opt-in,
 *                     so it PASSES readiness — but it is named distinctly and
 *                     never collapsed into 'ready', because the two are not the
 *                     same thing and an operator must be able to tell canned
 *                     fixtures from a live model at a glance.
 *   'no_provider'   — the gateway initialized with zero enabled providers.
 *                     FAILS. This is the incident above.
 *   'no_high_risk_model'
 *                   — at least one provider is enabled, but no enabled model is
 *                     approved for high-risk regulatory work (drafting and
 *                     review). FAILS. See the second incident below.
 *   'needs_election'
 *                   — in production, drafting or the embedding lane is served
 *                     only by a provider an organization must elect (OpenAI,
 *                     Azure, Vertex), so every organization that has not is
 *                     refused. FAILS. See the third section below.
 *   'no_embedding_lane'
 *                   — the configured embedding lane cannot be built (local with
 *                     no address). Every Vault and knowledge-base search fails.
 *                     FAILS.
 *   'embedding_lane_down'
 *                   — the lane can be built and serves every organization, but
 *                     the readiness probe could not embed one text through it at
 *                     the corpus width: unreachable, refused, the wrong width or
 *                     the wrong model. FAILS; probed again every 30 s, so a lane
 *                     that starts after this process turns it ready.
 *   'embedding_corpus_unverified'
 *                   — the self-hosted lane answered, but a corpus holds vectors
 *                     another model wrote (it must be re-embedded before it is
 *                     served), or the corpora could not be checked. FAILS.
 *   'error'         — the gateway could not be constructed. FAILS. Distinct
 *                     from 'no_provider' because "unknown, and we know why" is
 *                     diagnostically different from "checked, absent".
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SECOND INCIDENT — a provider is not a drafting model (U3a, 2026-09-24).
 *
 * Production passed OPENAI_API_KEY and nothing else. Since 2026-09-22 the
 * gateway refuses high-risk work (document_drafting, regulatory_review) to any
 * model not marked `approvedForHighRisk` in ai-governance/approved-models.ts,
 * and every model so marked is Claude (first-party, Bedrock or Vertex). So
 * every Authoring draft was refused with MODEL_NOT_APPROVED_FOR_HIGH_RISK —
 * while this module reported 'ready', because it counted providers and asked
 * nothing about what their models were allowed to do. Drafting is the job the
 * launch catalog's Authoring surface exists for; a process that refuses every
 * draft cannot do the thing it exists to do, and must not report ready.
 *
 * The check below asks the gateway's own registry (enabled = model on AND its
 * provider configured) and the canonical approval function — the same two
 * facts `selectModel` uses — so readiness and routing cannot disagree about
 * whether drafting has a model. Per-request placement (residency, ZDR,
 * sensitive-data approvals) is NOT checked here: it depends on the request,
 * and can still refuse an individual draft on a deployment that is ready.
 * ─────────────────────────────────────────────────────────────────────────────
 * A LANE AN ORGANIZATION MUST ELECT IS NOT A LANE FOR EVERY ORGANIZATION
 * (P1-54 R4, 2026-10-01).
 *
 * In production the gateway applies the provider election (ADR-0014 §1, P1-45):
 * OpenAI, Azure and Vertex serve an organization only when its placement policy
 * names them. Readiness counted lanes without asking whom they serve, so a
 * deployment whose only drafting model was Claude on Vertex, or whose
 * embeddings ran on OpenAI (the default when EMBEDDING_PROVIDER is unset),
 * reported ready while every organization that had not elected that vendor was
 * refused: every draft, or every Vault and knowledge-base search.
 *
 * Both checks ask the gateway's own election predicate (providerElectionRefusal)
 * on behalf of an organization that elected nothing — the default, and every
 * tenant until an Order Form says otherwise — and the embedding seam's own
 * resolver for the lane. Outside production nothing needs an election.
 * ─────────────────────────────────────────────────────────────────────────────
 * CONFIGURATION IS NOT A VERDICT (DP-71; ADR-0014 §1.5, amended 2026-10-01).
 *
 * The check above said the self-hosted lane was ready because it could be
 * built and served every organization. Every embedding through it was refused
 * by its server: the runtime asked a 1024-wide model for 1536 values (P1-54
 * round 1). So the embedding lane is ready only after the probe
 * (embedding-provider.ts::probeEmbeddingLane) has embedded one short text
 * through it at every corpus width, through the same seam and gateway door
 * search uses, bounded to EMBEDDING_PROBE_TIMEOUT_MS so boot is never held by
 * a silent address. A failed probe is re-run every EMBEDDING_PROBE_RETRY_MS:
 * the lane is a separate service that may start after this process. For the
 * self-hosted lane readiness also asks the corpus policy whether any corpus
 * holds vectors another model wrote (findVectorsFromAnotherModel): zero-padded
 * vectors share a column's vector space only with their own model's.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * @module server/startup/ana-readiness-state
 */

import type { ModelConfig, ProviderName, TaskType } from '../services/ai-gateway/types';
import type { AIGateway } from '../services/ai-gateway/gateway';
import type { EmbeddingProvider } from '../services/ai-gateway/embeddings/embedding-provider';
import type { ForeignVectorReport } from '../services/embedding-corpus-policy';

export type AnaReadiness =
  | 'unknown'
  | 'ready'
  | 'deterministic'
  | 'no_provider'
  | 'no_high_risk_model'
  | 'needs_election'
  | 'no_embedding_lane'
  | 'embedding_lane_down'
  | 'embedding_corpus_unverified'
  | 'error';

let anaReadiness: AnaReadiness = 'unknown';
let anaDetail = '';

/** How long after a failed embedding probe (or corpus check) readiness is evaluated again. */
export const EMBEDDING_PROBE_RETRY_MS = 30_000;
let embeddingProbeRetry: ReturnType<typeof setTimeout> | null = null;

/**
 * Evaluate again once EMBEDDING_PROBE_RETRY_MS has passed, until the lane
 * answers. One pending retry at a time; it never keeps the process alive.
 */
function scheduleEmbeddingProbeRetry(): void {
  if (embeddingProbeRetry) return;
  embeddingProbeRetry = setTimeout(() => {
    embeddingProbeRetry = null;
    void evaluateAnaReadiness().then(state => {
      if (state === 'ready') console.info(`✅ AnA's embedding lane answered on a re-probe — ${getAnaReadinessDetail()}`);
    });
  }, EMBEDDING_PROBE_RETRY_MS);
  (embeddingProbeRetry as { unref?: () => void }).unref?.();
}

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

/** The models `include` admits, grouped by provider: `anthropic (a, b); bedrock (c)`. */
function modelsByProvider(models: ModelConfig[], include: (m: ModelConfig) => boolean): string {
  const byProvider = new Map<string, string[]>();
  for (const m of models) {
    if (!include(m)) continue;
    byProvider.set(m.provider, [...(byProvider.get(m.provider) ?? []), m.id]);
  }
  return [...byProvider].map(([p, ids]) => `${p} (${ids.join(', ')})`).join('; ');
}

/**
 * Whether an organization that elected nothing may reach this provider at all:
 * the gateway's own election predicate (ADR-0014 §1, P1-45), which refuses
 * nothing outside production.
 */
async function servesEveryOrganization(): Promise<(provider: ProviderName) => boolean> {
  const { providerElectionRefusal } = await import('../services/ai-gateway/providers/org-placement.js');
  return provider => providerElectionRefusal(provider, undefined) === null;
}

/**
 * A provider is not a drafting model: readiness also needs, for each high-risk
 * task type, an enabled model the canonical registry approves for it, on a
 * lane every organization reaches. Records and returns the verdict; split from
 * evaluateAnaReadiness, which calls it before the embedding lane.
 */
async function recordHighRiskCoverage(
  gw: AIGateway,
  providers: string[],
): Promise<AnaReadiness> {
  // A provider is not a drafting model. Fail closed if the gateway cannot
  // show its registry: a posture readiness cannot inspect is not one it may
  // pass.
  if (typeof gw.getModels !== 'function') {
    setAnaReadiness(
      'error',
      'AI gateway exposes no model registry, so whether any enabled model is approved for ' +
        'regulatory drafting cannot be checked'
    );
    return 'error';
  }

  const { HIGH_RISK_TASK_TYPES, isApprovedForHighRisk } = await import(
    '../services/ai-governance/approved-models.js'
  );
  const models: ModelConfig[] = gw.getModels() ?? [];
  // The same predicate the gateway's selectModel applies to a high-risk
  // request: enabled (model on and provider configured), capable of the
  // task, and approved by the canonical registry. No second list.
  const serves = (m: ModelConfig, task: TaskType) =>
    m.capabilities.includes(task) && isApprovedForHighRisk(m.id);
  const everyOrganization = await servesEveryOrganization();

  const unserved: TaskType[] = [];
  const electedOnly: TaskType[] = [];
  const servingIds = new Set<string>();
  for (const task of HIGH_RISK_TASK_TYPES) {
    const live = models.filter(m => m.enabled && serves(m, task));
    if (live.length === 0) unserved.push(task);
    else if (!live.some(m => everyOrganization(m.provider))) electedOnly.push(task);
    for (const m of live) servingIds.add(m.id);
  }

  if (unserved.length > 0) {
    // Name what would fix it, from the registry rather than from memory:
    // every model approved for the missing work, grouped by the provider
    // that would have to be enabled to reach it.
    const approved = modelsByProvider(models, m => unserved.some(task => serves(m, task)));
    const remedy = approved
      ? `Models approved for it, by provider: ${approved}. ` +
        'Enabling one of those providers is a data-placement decision, not only a key.'
      : 'The model registry holds no model approved for it at all.';
    setAnaReadiness(
      'no_high_risk_model',
      `AI provider(s) enabled: ${providers.join(', ')} — but no enabled model is approved for ` +
        `regulatory drafting and review (${unserved.join(', ')}), so every Authoring draft is ` +
        `refused with MODEL_NOT_APPROVED_FOR_HIGH_RISK. ${remedy} ` +
        'See approvedForHighRisk in server/services/ai-governance/approved-models.ts.'
    );
    return 'no_high_risk_model';
  }

  if (electedOnly.length > 0) {
    // Every model that drafts sits on a lane organizations must elect. Name
    // them, and the approved models on lanes that reach every organization.
    const gated = modelsByProvider(models, m => m.enabled && electedOnly.some(task => serves(m, task)));
    const open = modelsByProvider(
      models,
      m => everyOrganization(m.provider) && electedOnly.some(task => serves(m, task)),
    );
    setAnaReadiness(
      'needs_election',
      `In production, regulatory drafting and review (${electedOnly.join(', ')}) are served only by ` +
        `${gated}, which serve an organization only when its placement policy elects that provider ` +
        "(ADR-0014 §1); every other organization's drafts are refused. " +
        (open
          ? `Approved models on lanes every organization reaches, by provider: ${open}.`
          : 'The model registry holds no approved model on a lane every organization reaches.')
    );
    return 'needs_election';
  }

  setAnaReadiness(
    'ready',
    `AnA has ${providers.length} provider(s): ${providers.join(', ')}; regulatory drafting ` +
      `and review served by ${[...servingIds].join(', ')}`
  );
  return 'ready';
}

/**
 * Vault and knowledge-base search embed every document and every query through
 * one lane (EMBEDDING_PROVIDER), fixed per deployment and never re-routed. On a
 * deployment that is otherwise ready, records whether that lane can be built,
 * whether it serves an organization that elected nothing, and whether it has
 * embedded one text at every corpus width (the probe, DP-71); when all three
 * hold, names the lane and what it answered in the ready detail. The lane is
 * the embedding seam's own resolver (getEmbeddingProvider), so readiness and
 * search cannot disagree about it.
 */
async function recordEmbeddingLane(): Promise<AnaReadiness> {
  const seam = await import('../services/ai-gateway/embeddings/embedding-provider.js');
  let provider: EmbeddingProvider;
  try {
    provider = seam.getEmbeddingProvider();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    setAnaReadiness(
      'no_embedding_lane',
      `The embedding lane cannot be built: ${message} Vault and knowledge-base search fail for every ` +
        'organization until it is configured.'
    );
    return 'no_embedding_lane';
  }

  const kind: ProviderName = provider.kind;
  const everyOrganization = await servesEveryOrganization();
  if (!everyOrganization(kind)) {
    setAnaReadiness(
      'needs_election',
      `The embedding lane is ${kind} (EMBEDDING_PROVIDER), which in production embeds an organization's ` +
        `content only when its placement policy elects ${kind} (ADR-0014 §1). Vault and knowledge-base ` +
        'search are refused for every organization that has not. The lane that serves every organization ' +
        'is the self-hosted one: EMBEDDING_PROVIDER=local with EMBEDDING_LOCAL_BASE_URL (ADR-0014 §1.5).'
    );
    return 'needs_election';
  }

  // The drafting verdict's detail, which a ready embedding verdict extends.
  const coverage = getAnaReadinessDetail();

  const probe = await seam.probeEmbeddingLane(provider);
  if (!probe.ok) {
    setAnaReadiness(
      'embedding_lane_down',
      `${probe.detail} Vault and knowledge-base search fail for every organization until it does; ` +
        `it is probed again every ${EMBEDDING_PROBE_RETRY_MS / 1000} s.`
    );
    scheduleEmbeddingProbeRetry();
    return 'embedding_lane_down';
  }

  if (kind === 'local') {
    const corpora = await recordSelfHostedCorpora();
    if (corpora !== 'ready') return corpora;
  }

  setAnaReadiness('ready', `${coverage}; embeddings: ${kind} — ${probe.detail}`);
  return 'ready';
}

/**
 * The self-hosted lane writes bge-m3 zero-padded to the corpus width, which
 * shares a column's vector space only with bge-m3's own vectors (ADR-0014 §1.5,
 * amended). Records 'embedding_corpus_unverified' when a corpus holds vectors
 * another model wrote, or when the corpora could not be read: unchecked is not
 * clean. A failed read is retried; a finding stands until the corpus is
 * re-embedded and readiness evaluated again (a restart, or
 * GET /api/concept2cure/startup/invariants).
 */
async function recordSelfHostedCorpora(): Promise<AnaReadiness> {
  let report: ForeignVectorReport;
  try {
    const { findVectorsFromAnotherModel } = await import('../services/embedding-corpus-policy.js');
    const { getPool } = await import('../db/runtime.js');
    report = await findVectorsFromAnotherModel(getPool());
  } catch (err: unknown) {
    // The database's message can name hosts; /readyz is public. The log has it.
    const e = err as { name?: unknown; code?: unknown; message?: unknown } | null;
    console.warn('[ana-readiness] the embedding corpora could not be checked:', e?.message ?? String(err));
    const what = typeof e?.code === 'string' ? `error code ${e.code}` : typeof e?.name === 'string' ? e.name : 'an error';
    setAnaReadiness(
      'embedding_corpus_unverified',
      `The embedding corpora could not be checked for vectors another model wrote (${what}). Vault and ` +
        'knowledge-base search are not reported ready until they have been; checked again every ' +
        `${EMBEDDING_PROBE_RETRY_MS / 1000} s.`
    );
    scheduleEmbeddingProbeRetry();
    return 'embedding_corpus_unverified';
  }

  if (report.findings.length > 0) {
    const where = report.findings
      .map(f => `${f.table}: ${f.rows} vector(s) (${f.scopes.join(', ')})`)
      .join('; ');
    setAnaReadiness(
      'embedding_corpus_unverified',
      `Corpora hold vectors that ${report.model} did not write — ${where}. The self-hosted lane stores ` +
        `${report.model} (${report.nativeDimensions} values, zero-padded), which shares a column's vector space ` +
        'only with its own vectors, so search would compare against another model. Those corpora must be ' +
        're-embedded through the lane before they are served (ADR-0014 §1.5); then restart, or GET ' +
        '/api/concept2cure/startup/invariants.'
    );
    return 'embedding_corpus_unverified';
  }
  return 'ready';
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
        'No AI provider is configured. Set ANTHROPIC_API_KEY (or AI_BEDROCK_ENABLED / ' +
          'AI_VERTEX_ENABLED) — without one, every AnA turn returns 503 GATEWAY_UNAVAILABLE. ' +
          'OPENAI_API_KEY or KIMI_API_KEY alone answer chat but not regulatory drafting, which ' +
          'only an approvedForHighRisk model may serve.'
      );
      return 'no_provider';
    }

    const coverage = await recordHighRiskCoverage(gw, providers);
    if (coverage !== 'ready') return coverage;
    return await recordEmbeddingLane();
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

  if (state === 'no_high_risk_model') {
    console.error(
      '\n' +
        '┌─────────────────────────────────────────────────────────────────────────┐\n' +
        '│  AnA CANNOT DRAFT. NO ENABLED MODEL IS APPROVED FOR REGULATORY DRAFTING. │\n' +
        '└─────────────────────────────────────────────────────────────────────────┘\n' +
        `  ${detail}\n` +
        '  Every drafting and regulatory-review request will be refused until this is fixed.\n' +
        '  /readyz is reporting NOT READY for this reason.\n'
    );
    return;
  }

  if (state === 'needs_election') {
    console.error(
      '\n' +
        '┌─────────────────────────────────────────────────────────────────────────┐\n' +
        '│  AnA SERVES ONLY ORGANIZATIONS THAT ELECTED THE VENDOR IT RUNS ON.       │\n' +
        '└─────────────────────────────────────────────────────────────────────────┘\n' +
        `  ${detail}\n` +
        '  Every other organization is refused until this is fixed.\n' +
        '  /readyz is reporting NOT READY for this reason.\n'
    );
    return;
  }

  if (state === 'embedding_lane_down') {
    console.error(
      '\n' +
        '┌─────────────────────────────────────────────────────────────────────────┐\n' +
        '│  AnA CANNOT SEARCH. THE EMBEDDING LANE HAS NOT EMBEDDED A TEXT.         │\n' +
        '└─────────────────────────────────────────────────────────────────────────┘\n' +
        `  ${detail}\n` +
        '  Vault and knowledge-base search fail for every organization until this is fixed.\n' +
        '  /readyz is reporting NOT READY for this reason.\n'
    );
    return;
  }

  if (state === 'embedding_corpus_unverified') {
    console.error(
      '\n' +
        '┌─────────────────────────────────────────────────────────────────────────┐\n' +
        '│  AnA CANNOT SEARCH. A CORPUS MAY HOLD VECTORS FROM ANOTHER MODEL.       │\n' +
        '└─────────────────────────────────────────────────────────────────────────┘\n' +
        `  ${detail}\n` +
        '  Search is not reported ready until every corpus holds one model\'s vectors.\n' +
        '  /readyz is reporting NOT READY for this reason.\n'
    );
    return;
  }

  if (state === 'no_embedding_lane') {
    console.error(
      '\n' +
        '┌─────────────────────────────────────────────────────────────────────────┐\n' +
        '│  AnA CANNOT SEARCH. THE EMBEDDING LANE IS NOT CONFIGURED.                │\n' +
        '└─────────────────────────────────────────────────────────────────────────┘\n' +
        `  ${detail}\n` +
        '  Vault and knowledge-base search fail for every organization until this is fixed.\n' +
        '  /readyz is reporting NOT READY for this reason.\n'
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
  if (embeddingProbeRetry) clearTimeout(embeddingProbeRetry);
  embeddingProbeRetry = null;
  capabilityRegistryState = 'pending';
  capabilityRegistryDetail = '';
  anaReadiness = 'unknown';
  anaDetail = '';
}
