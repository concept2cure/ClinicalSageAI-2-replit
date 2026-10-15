/**
 * Approved-model lockfile + drift detection.
 *
 * Pins, per model, the exact provider model version the platform is validated
 * to use, plus the rationale and the eval reference that justifies it. This is
 * the "model governance matrix" a regulated buyer asks for and the
 * version-pinning manifest the gateway needs: a model cannot be swapped
 * (renamed, version-bumped, removed) without updating this lockfile, which
 * forces a re-validation / sign-off. `detectModelDrift()` compares the live
 * gateway registry against this lockfile; the drift gate test fails CI on any
 * unreviewed change, so a model swap is regression-gated against the gateway's
 * own fallback law.
 *
 * @module server/services/ai-governance/approved-models
 */

import type { ModelConfig, ProviderName, TaskType } from '../ai-gateway/types';
import { isProductionEnv } from '../ai-gateway/pii-screen';

export type ModelRole = 'primary' | 'fallback';

/**
 * Where a model stands against performance qualification (PQ) — the eval run
 * against `server/eval/rag/` and `server/eval/doc-quality/` that
 * `docs/LAUNCH_DEFINITION_OF_DONE.md` makes the condition for high-risk
 * regulatory drafting.
 *
 * `passed` carries the reference to the run that established it; a pass with
 * nothing to point at is not a pass, and the registry test refuses one.
 */
export interface PqStatus {
  status: 'pending' | 'passed' | 'failed';
  /** Path to the executed PQ record. Null until a run exists. */
  reference: string | null;
}

export interface ApprovedModel {
  /** Stable gateway alias id (e.g. 'claude-opus-4'). */
  id: string;
  /** Exact provider model version this id is pinned to (e.g. 'claude-opus-4-7'). */
  pinnedVersion: string;
  provider: ProviderName;
  role: ModelRole;
  /** Why this model is approved for its role. */
  rationale: string;
  /** Where the evidence justifying this approval lives. */
  evalReference: string;
  /** ISO date of the last governance review of this entry. */
  lastReviewed: string;
  /**
   * Whether this model may serve a high-risk task — regulatory drafting or
   * regulatory review (see {@link HIGH_RISK_TASK_TYPES}).
   *
   * Until 2026-09-22 this lived only in prose — "not approved for high-risk
   * regulatory drafting" in a rationale string — and nothing read it: the
   * gateway's fallback ladder, `cost_optimized`, `round_robin` and explicit
   * selection could each route drafting to a model this file said was not
   * approved for it. The gateway now enforces this field at every selection
   * point, so it is a control, not a description.
   */
  approvedForHighRisk: boolean;
  /**
   * The words that decide `approvedForHighRisk`, quoted from this registry or
   * from the launch definition of done. Transcribed, not re-decided: changing
   * a model's approval is a governance act and belongs in review, with the
   * sentence that justifies it written here.
   */
  highRiskBasis: string;
  /** Performance qualification against the eval harnesses. */
  pq: PqStatus;
}

/**
 * The pinned, validated model set. Versions mirror server/services/ai-gateway
 * DEFAULT_MODELS. Bumping a model in the gateway without updating the matching
 * entry here trips the drift gate.
 */
export const APPROVED_MODELS: ApprovedModel[] = [
  {
    id: 'claude-opus-4',
    pinnedVersion: 'claude-opus-5-5',
    provider: 'anthropic',
    role: 'primary',
    rationale: 'Flagship reasoning + regulatory drafting model; primary for high-risk authoring and review tasks. Bumped Opus 5 → Opus 5.5 on the founder\'s direction (2026-09-25). Why this model for this product: in Anthropic\'s testing it is much less likely than Opus 5 to state a figure or cite a source the inputs do not support, and catches detail errors in large inputs without more false flags — the failure modes that matter most in a regulatory record — at a lower price ($4 / $20 against $5 / $25 per MTok). What changed on the surface: thinking can no longer be disabled (the gateway never disables it on an adaptive entry); forced tool_choice any/tool is rejected (no caller uses it); the API effort default is medium, one level below Opus 5, so the entry declares medium rather than inheriting it; and its safety classifiers add biology to cyber, so a decline is raised and re-run on Opus 5 rather than returned as an empty answer. This is a capability change, not a patch: re-validation is owed against the PQ targets below, and until it executes the accuracy claim rests on the vendor\'s evaluation and the same harness as Opus 5, not on measurement of this version. Opus 5 is retained directly beneath it, so a tenant whose account cannot reach Opus 5.5 keeps the reviewed behaviour rather than falling to Sonnet.',
    evalReference: 'server/eval/pq/pq-protocol.json (PQ-DRAFT-001, draft; PENDING EXECUTION for this version — see pq below). Vendor evaluation and the surface differences: docs/evidence/MODEL-GOVERNANCE/2026-09-25-opus-5-5/README.md. Corrected 2026-09-23: this field cited docs/validation/PQ-CORTEX-001 PQ-007/008, which measure pathway-prediction accuracy and "regulatory intuition" for a different product, not drafting.',
    lastReviewed: '2026-09-25',
    approvedForHighRisk: true,
    highRiskBasis: 'This entry: "primary for high-risk authoring and review tasks".',
    pq: { status: 'pending', reference: null },
  },
  {
    id: 'claude-opus-5',
    pinnedVersion: 'claude-opus-5',
    provider: 'anthropic',
    role: 'fallback',
    rationale: 'Previous flagship (Opus 5), retained as the rung directly below Opus 5.5. Was the primary from 2026-09-17 to 2026-09-25 and carries that review. Same request surface except that it accepts disabled thinking and forced tool_choice (neither is sent), and it runs a cyber classifier without the biology one — so it is also what answers when Opus 5.5 declines a biology request. No declared effort default: Opus 5 runs at its own default (high), as it did as primary.',
    evalReference: 'Reviewed as primary 2026-09-17 (see the claude-opus-4 entry history); covered by the gateway fallback law.',
    lastReviewed: '2026-09-25',
    approvedForHighRisk: true,
    highRiskBasis: 'This entry: retained so a high-risk request the flagship cannot serve "keeps the reviewed behaviour rather than falling to Sonnet" — the DoD\'s "one validated fallback", now that the primary is Opus 5.5.',
    pq: { status: 'pending', reference: null },
  },
  {
    id: 'claude-opus-4-legacy',
    pinnedVersion: 'claude-opus-4-8',
    provider: 'anthropic',
    role: 'fallback',
    rationale: 'Previous flagship (Opus 4.8), retained as the top intra-provider fallback below Opus 5. Shares the reasoning-only surface, so a fallback preserves the same reasoning behaviour and the same request shape. Was the primary until 2026-09-17 and carries that review.',
    evalReference: 'Same capability profile as claude-opus-4; covered by the gateway fallback law. Reviewed as primary on 2026-07-24.',
    lastReviewed: '2026-09-17',
    approvedForHighRisk: true,
    highRiskBasis: 'This entry: retained as "the top intra-provider fallback below Opus 5" so a tenant "keeps the reviewed behaviour rather than falling to Sonnet". The DoD\'s "one validated fallback".',
    pq: { status: 'pending', reference: null },
  },
  {
    id: 'claude-sonnet-4',
    pinnedVersion: 'claude-sonnet-5',
    provider: 'anthropic',
    role: 'fallback',
    rationale: 'High-quality, lower-cost fallback below Opus on the quality ladder. Bumped Sonnet 4.6 → Sonnet 5. NOTE the surface change: Sonnet 5 is reasoning-only (adaptive thinking, no sampling params) where 4.6 took budget_tokens + temperature, so this rung no longer sends the same request shape as the rung below it. That is declared per entry in the gateway registry (thinkingMode / supportsSamplingParams) rather than inferred, which is what makes a mixed ladder safe.',
    evalReference: 'server/eval/rag/; gateway fallback law (Opus → Sonnet → Haiku). Not approved for high-risk regulatory drafting on its own — it is a fallback rung.',
    lastReviewed: '2026-09-17',
    approvedForHighRisk: false,
    highRiskBasis: 'This entry: "Not approved for high-risk regulatory drafting on its own"; the Opus 4.8 entry exists so a high-risk request does not fall to Sonnet.',
    pq: { status: 'pending', reference: null },
  },
  {
    id: 'claude-sonnet-4-legacy',
    pinnedVersion: 'claude-sonnet-4-6',
    provider: 'anthropic',
    role: 'fallback',
    rationale: 'Previous Sonnet (4.6), retained as the intra-provider rung below Sonnet 5. Replaces the dated claude-sonnet-4-20250514 snapshot that held this slot: a fallback should be the previous generation, not a year-old pin nobody re-reviewed. Keeps the LEGACY thinking surface (budget_tokens + temperature).',
    evalReference: 'Same capability profile as the prior claude-sonnet-4 entry it succeeds; covered by the gateway fallback law.',
    lastReviewed: '2026-09-17',
    approvedForHighRisk: false,
    highRiskBasis: 'Below Sonnet 5 on the quality ladder, which is itself not approved for high-risk drafting.',
    pq: { status: 'pending', reference: null },
  },
  {
    id: 'claude-haiku-4',
    pinnedVersion: 'claude-haiku-4-5',
    provider: 'anthropic',
    role: 'fallback',
    rationale: 'Fast, low-cost model for chat/summarization and last-rung Anthropic fallback. Version string only: the dated suffix (-20251001) was dropped because claude-haiku-4-5 is the complete model id. Same weights, same model — this is a naming correction, not a swap.',
    evalReference: 'server/eval/rag/; gateway fallback law.',
    lastReviewed: '2026-09-17',
    approvedForHighRisk: false,
    highRiskBasis: 'This entry: chat/summarization and last-rung fallback. Model card: "Not approved for high-risk regulatory drafting".',
    pq: { status: 'pending', reference: null },
  },
  {
    id: 'gpt-4o',
    pinnedVersion: 'gpt-4o',
    provider: 'openai',
    role: 'primary',
    rationale: 'Cross-provider primary for structured output; first OpenAI fallback when Anthropic is unavailable.',
    evalReference: 'server/eval/rag/; docs/rfi/AI_CAPABILITIES_INVENTORY.md (model configuration).',
    lastReviewed: '2026-06-03',
    approvedForHighRisk: false,
    highRiskBasis: 'DoD: GPT ships "with riskTier capped below high-risk until their PQ executes".',
    pq: { status: 'pending', reference: null },
  },
  {
    id: 'gpt-4o-mini',
    pinnedVersion: 'gpt-4o-mini',
    provider: 'openai',
    role: 'fallback',
    rationale: 'Low-cost model for chat/summarization; not approved for high-risk regulatory drafting.',
    evalReference: 'server/eval/rag/.',
    lastReviewed: '2026-06-03',
    approvedForHighRisk: false,
    highRiskBasis: 'This entry: "not approved for high-risk regulatory drafting".',
    pq: { status: 'pending', reference: null },
  },
  {
    id: 'kimi-k2-0711',
    pinnedVersion: 'kimi-k2-0711-preview',
    provider: 'moonshot',
    role: 'fallback',
    rationale: 'Long-context cross-provider fallback when both Anthropic and OpenAI are unavailable.',
    evalReference: 'Gateway fallback law (final cross-provider rung).',
    lastReviewed: '2026-06-03',
    approvedForHighRisk: false,
    highRiskBasis: 'DoD: Kimi ships "with riskTier capped below high-risk until their PQ executes".',
    pq: { status: 'pending', reference: null },
  },
  {
    id: 'moonshot-v1-128k',
    pinnedVersion: 'moonshot-v1-128k',
    provider: 'moonshot',
    role: 'fallback',
    rationale: 'Long-context cross-provider fallback.',
    evalReference: 'Gateway fallback law.',
    lastReviewed: '2026-06-03',
    approvedForHighRisk: false,
    highRiskBasis: 'DoD: Kimi/Moonshot ship "with riskTier capped below high-risk until their PQ executes".',
    pq: { status: 'pending', reference: null },
  },
  {
    id: 'moonshot-v1-32k',
    pinnedVersion: 'moonshot-v1-32k',
    provider: 'moonshot',
    role: 'fallback',
    rationale: 'Short-context cross-provider fallback for chat/general tasks.',
    evalReference: 'Gateway fallback law.',
    lastReviewed: '2026-06-03',
    approvedForHighRisk: false,
    highRiskBasis: 'DoD: Kimi/Moonshot ship "with riskTier capped below high-risk until their PQ executes".',
    pq: { status: 'pending', reference: null },
  },
  // ── Private-cloud + self-hosted substrates ─────────────────────────────────
  // Same Claude/GPT models as the shared-frontier entries, deployed in a
  // tenant's own cloud account (BAA / zero-retention / regional residency) or
  // self-hosted (air-gapped). Pinned here so a substrate-specific model id
  // cannot be swapped without governance review.
  {
    id: 'claude-opus-4-bedrock',
    pinnedVersion: 'anthropic.claude-opus-4-7',
    provider: 'bedrock',
    role: 'primary',
    rationale: 'Flagship Claude in the tenant AWS account — primary high-risk authoring/review path for BAA + zero-retention customers.',
    evalReference: 'Same model weights as claude-opus-4 (first-party); server/eval/rag/. Region/ZDR governed by providers/placement.ts.',
    lastReviewed: '2026-06-08',
    approvedForHighRisk: true,
    highRiskBasis: 'This entry: "primary high-risk authoring/review path for BAA + zero-retention customers".',
    pq: { status: 'pending', reference: null },
  },
  {
    id: 'claude-sonnet-4-bedrock',
    pinnedVersion: 'anthropic.claude-sonnet-4-6',
    provider: 'bedrock',
    role: 'fallback',
    rationale: 'Lower-cost private-cloud Claude fallback below Opus for BAA/ZDR customers.',
    evalReference: 'Same weights as claude-sonnet-4; gateway fallback law.',
    lastReviewed: '2026-06-08',
    approvedForHighRisk: false,
    highRiskBasis: 'Sonnet weights; see claude-sonnet-4.',
    pq: { status: 'pending', reference: null },
  },
  {
    id: 'claude-opus-4-vertex',
    pinnedVersion: 'claude-opus-4-7',
    provider: 'vertex',
    role: 'fallback',
    rationale: 'Flagship Claude in the tenant GCP project — regional data-residency path (EU/APAC) for customers on Google Cloud.',
    evalReference: 'Same weights as claude-opus-4; residency governed by providers/placement.ts.',
    lastReviewed: '2026-06-08',
    approvedForHighRisk: true,
    highRiskBasis: 'INFERENCE, not a quotation: this entry does not say high-risk in words. Treated as the Bedrock Opus entry is — the flagship Claude on a tenant cloud — because it is the only residency path for GCP customers, and refusing it would leave them no drafting model at all. A reviewer should confirm or reverse this.',
    pq: { status: 'pending', reference: null },
  },
  {
    id: 'gpt-4o-azure',
    pinnedVersion: 'gpt-4o',
    provider: 'azure',
    role: 'fallback',
    rationale: 'GPT-4o in the tenant Azure estate — private-cloud path for Microsoft-shop / enterprise customers.',
    evalReference: 'Same model as gpt-4o (first-party); abuse-monitoring opt-out is an Azure-side control.',
    lastReviewed: '2026-06-08',
    approvedForHighRisk: false,
    highRiskBasis: 'Same model as gpt-4o; see gpt-4o.',
    pq: { status: 'pending', reference: null },
  },
  {
    id: 'local-default',
    pinnedVersion: 'local-default',
    provider: 'local',
    role: 'fallback',
    rationale: 'Self-hosted open-weight model (vLLM/LiteLLM) — the only air-gappable substrate, for tenants who cannot send data to any third party. Lower quality; intended for non-high-risk tasks and offline deployments. The concrete weights are resolved by the self-hosted server / LiteLLM model map.',
    evalReference: 'Pending per-deployment eval; not approved for high-risk regulatory drafting until evaluated against server/eval/rag/.',
    lastReviewed: '2026-06-08',
    approvedForHighRisk: false,
    highRiskBasis: 'This entry: "not approved for high-risk regulatory drafting until evaluated against server/eval/rag/".',
    pq: { status: 'pending', reference: null },
  },
];

/*
 * Frozen at load, with every entry and its PQ record (ADR-0015 §3/§4; track GW
 * review [15], 2026-09-28). The gateway reads `approvedForHighRisk` and
 * `pq.status` live at every selection point, so a runtime write — flipping a
 * PQ to 'passed', pushing an entry — would switch the production controls off
 * without a code change or an environment variable. Changing an entry is a
 * governance act made in this file, in review. A write now throws (ES modules
 * are strict), and approved-models-invariant.test.ts refuses source that
 * attempts one outside the tests.
 */
for (const entry of APPROVED_MODELS) {
  Object.freeze(entry.pq);
  Object.freeze(entry);
}
Object.freeze(APPROVED_MODELS);

/**
 * Task types that are high-risk regulatory work. `server/services/ai-governance/
 * risk-tiers.ts` puts the drafting, compliance and submission capability
 * categories at `riskTier: 'high'`; at the gateway those reach a model as
 * `document_drafting` and `regulatory_review`.
 */
export const HIGH_RISK_TASK_TYPES: ReadonlySet<TaskType> = new Set<TaskType>([
  'document_drafting',
  'regulatory_review',
]);

export function isHighRiskTask(taskType: TaskType): boolean {
  return HIGH_RISK_TASK_TYPES.has(taskType);
}

/**
 * Whether THIS request is high-risk work that only an approved model may serve.
 *
 * - `document_drafting` is always high-risk: drafting is `riskTier: 'high'` in
 *   risk-tiers.ts, and no caller can declare it lower.
 * - `regulatory_review` is high-risk unless the caller's risk policy declares it
 *   `low` or `medium`. The kernel router labels every regulatory-surface turn
 *   `regulatory_review` and carries its actual judgment in `riskTier`; a direct
 *   service call doing real review declares nothing and stays high-risk.
 * - Everything else is not high-risk work.
 */
export function isHighRiskRequest(
  taskType: TaskType,
  riskTier?: 'low' | 'medium' | 'high' | null,
): boolean {
  if (taskType === 'document_drafting') return true;
  if (taskType === 'regulatory_review') return riskTier !== 'low' && riskTier !== 'medium';
  return false;
}

/**
 * The task types that author governed regulatory content. `regulatory_review`
 * reads and judges; it is high-risk work, but it is not drafting.
 */
export const DRAFTING_TASK_TYPES: ReadonlySet<TaskType> = new Set<TaskType>(['document_drafting']);

/**
 * Whether THIS request is high-risk regulatory DRAFTING: high-risk work
 * ({@link isHighRiskRequest}) of a drafting task type. CLAUDE.md RULE 2 and
 * ADR-0015 §3: in production only a model whose entry records a passed PQ
 * serves it. Review is not drafting — ADR-0015 §3 lets read and review run on a
 * PQ-pending approved model — so this is `document_drafting` at every declared
 * tier and nothing else.
 */
export function isHighRiskDraftingRequest(
  taskType: TaskType,
  riskTier?: 'low' | 'medium' | 'high' | null,
): boolean {
  return DRAFTING_TASK_TYPES.has(taskType) && isHighRiskRequest(taskType, riskTier);
}

/** A weights digest: `sha256:` and 64 hex digits, alone or after `name@` (the OCI digest form). */
const WEIGHTS_DIGEST = /(^|@)sha256:[0-9a-f]{64}$/;

/**
 * True when an entry's pinned version names no concrete artifact.
 *
 * A vendor's version id names what the vendor serves under it. A self-hosted
 * entry's name is resolved by the operator's own server (the vLLM / LiteLLM
 * model map), so only a weights digest pins it. `local-default` pins the
 * placeholder 'local-default': its rationale says "The concrete weights are
 * resolved by the self-hosted server / LiteLLM model map." ADR-0015 §4: such
 * an entry is not selected in production until it pins a concrete artifact.
 * Pinning one lifts the exclusion with no code change.
 */
export function isNominalPin(entry: Pick<ApprovedModel, 'provider' | 'pinnedVersion'>): boolean {
  return entry.provider === 'local' && !WEIGHTS_DIGEST.test(entry.pinnedVersion);
}

/**
 * Whether an approved entry may author governed high-risk regulatory content
 * here, as CLAUDE.md RULE 2 defines it: `approvedForHighRisk`, and — in
 * production — a passed PQ (ADR-0015 §3). Outside production a PQ-pending
 * approved model qualifies, and the ledger records its PQ status.
 *
 * The one statement of that rule. The gateway applies it to a request labelled
 * as drafting (ai-gateway/model-governance.ts selectionRefusal); the
 * governed-write gate applies it to the model that produced a tool call that
 * stores model-authored text ({@link isServedModelApprovedForHighRisk}),
 * because AnA's governed drafting reaches the gateway as `regulatory_review`
 * or `chat` at a high risk tier, never as `document_drafting`.
 */
export function isQualifiedForHighRiskDrafting(
  entry: Pick<ApprovedModel, 'approvedForHighRisk' | 'pq'>,
  production: boolean,
): boolean {
  return entry.approvedForHighRisk && (!production || entry.pq.status === 'passed');
}

const APPROVED_FOR_HIGH_RISK: ReadonlySet<string> = new Set(
  APPROVED_MODELS.filter((m) => m.approvedForHighRisk).map((m) => m.id),
);

/**
 * True only for a registry entry marked `approvedForHighRisk`. An id this
 * registry does not know is NOT approved: a model added to the gateway without
 * a governance entry must fail closed here, not inherit an approval by default.
 */
export function isApprovedForHighRisk(modelId: string): boolean {
  return APPROVED_FOR_HIGH_RISK.has(modelId);
}

/**
 * Whether the model that SERVED a request may have its text stored as a
 * governed record: {@link isQualifiedForHighRiskDrafting} for its entry,
 * identified the way a gateway response reports it — provider plus the wire
 * model (the pinned version) or the registry id. Unknown → not approved.
 *
 * Its one caller is the governed-write gate (ana/AnaToolExecutor.ts
 * preHandlerRefusal), which runs before any tool in GOVERNED_CONTENT_WRITE_TOOLS
 * stores model-authored text. Until 2026-09-28 (track GW review [1]/[9]/[19])
 * this read `approvedForHighRisk` alone, so in production a PQ-pending model
 * wrote AnA's governed drafts — the vault, the editor, protocol sections —
 * while the gateway refused `document_drafting`. The name is kept for that
 * caller, which another lane owns; the rule is RULE 2's, and in production
 * "approved for high-risk drafting" means PQ-passed.
 */
export function isServedModelApprovedForHighRisk(
  served: { provider?: string | null; model?: string | null } | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const entry = approvedEntryFor(served);
  return entry !== undefined && isQualifiedForHighRiskDrafting(entry, isProductionEnv(env));
}

/** A model that served a turn, with whether RULE 2 lets its text stand as governed content here. */
export interface QualifiedServedModel {
  provider: string | null;
  model: string | null;
  /** {@link isServedModelApprovedForHighRisk}, at the time this was read. */
  qualified: boolean;
  /** Its entry's `approvedForHighRisk`; null when the registry has no entry for it. */
  approvedForHighRisk: boolean | null;
  /** Its PQ status in this registry; null when the registry has no entry for it. */
  pq: PqStatus['status'] | null;
}

/**
 * Each model that served a turn (ana/turn-record-models.ts servedModelsOf), with RULE 2's
 * verdict for it and the two facts it rests on, so a reader can tell a model
 * not approved for regulatory drafting from an approved one whose PQ has not
 * passed, and a PQ-pending model admitted outside production from one with a
 * passed PQ (AnA reasoning round 10).
 */
export function qualifyServedModels(
  served: ReadonlyArray<{ provider: string | null; model: string | null }>,
  env: NodeJS.ProcessEnv = process.env,
): QualifiedServedModel[] {
  return served.map((s) => {
    const entry = approvedEntryFor(s);
    return {
      provider: s.provider,
      model: s.model,
      qualified: isServedModelApprovedForHighRisk(s, env),
      approvedForHighRisk: entry ? entry.approvedForHighRisk : null,
      pq: entry ? entry.pq.status : null,
    };
  });
}

/**
 * The registry entry for the model that served a request, identified the way a
 * gateway response reports it: provider plus the wire model (the pinned
 * version) or the registry id. Undefined when no entry matches — the ledger
 * then records the call as served by an unregistered model rather than
 * guessing an entry for it.
 */
export function approvedEntryFor(
  served: { provider?: string | null; model?: string | null } | null | undefined,
): ApprovedModel | undefined {
  if (!served?.provider || !served.model) return undefined;
  return APPROVED_MODELS.find(
    (m) => m.provider === served.provider && (m.pinnedVersion === served.model || m.id === served.model),
  );
}

/**
 * The approved-models entry a registry row IS, or undefined: the entry whose
 * id, provider and pinned version are the row's id, provider and wire model.
 * It is the one test of "this model may be selected" (CLAUDE.md Rule 2) for a
 * caller's pin (effort.ts resolveModelOverride), the picker
 * (projectModelsForPicker) and the cost-tier default (reasoning.ts
 * resolveTierModel), the pin and the tier through {@link governedMatch} — and,
 * since ADR-0015 §4 (2026-09-28), for every gateway selection point, through
 * ai-gateway/model-governance.ts selectionRefusal.
 *
 * Identity, not the served-model lookup ({@link approvedEntryFor}). That lookup
 * takes the first entry for the provider whose pinned version OR id is the wire
 * model, which is looser than a pin, and it depends on the order of
 * APPROVED_MODELS:
 *
 *   - it accepts a wire model EQUAL TO an entry's alias id (e.g. wire
 *     'claude-opus-4'), which names no pinned version at all;
 *   - it keys on the wire model, where the gateway's high-risk check keys on the
 *     registry id (`isApprovedForHighRisk(model.id)`), so a row carrying an
 *     approved version under another id would pass here and be refused there;
 *   - its first hit decides. Until 2026-09-28 (H1, row 74) this function was
 *     that lookup followed by an identity check on the hit, so a row that IS an
 *     entry was refused whenever an earlier entry for its provider had an id or
 *     pinned version equal to the row's wire model. No entry does that today;
 *     nothing forbids it.
 *
 * The drift gate (detectModelDrift) holds the registry to the same id and
 * pinned version, so every model in today's registry is its own entry and this
 * refuses none of them. `entries` is the governed list, a parameter so the
 * order-independence is testable (governing-entry.test.ts).
 */
export function governingEntry(
  m: Pick<ModelConfig, 'id' | 'provider' | 'model'>,
  entries: readonly ApprovedModel[] = APPROVED_MODELS,
): ApprovedModel | undefined {
  return entries.find((e) => e.provider === m.provider && e.id === m.id && e.pinnedVersion === m.model);
}

/**
 * The enabled registry row a named model selects under Rule 2. The one rule for
 * every resolver that turns a name into a model: a caller's pin (effort.ts
 * resolveModelOverride) and the cost-tier default, ANA_TIER_*_MODEL remaps
 * included (reasoning.ts resolveTierModel). Until H1 (2026-09-28) each had its
 * own copy, and the copies disagreed: one value against one registry was
 * refused as a pin and served as a tier.
 *
 * The value is matched on registry id or wire model. The first enabled match
 * that is its own approved-models entry and may be selected in this
 * environment ({@link selectableEntry}: in production, not a placeholder pin)
 * is `served`. Each match before it is `withheld`: passed over, the way a
 * disabled row is, and the way the gateway's explicit path passes over a row
 * not approved for the task. When no match qualifies, `served` is absent and
 * every match is withheld. Its only input besides its arguments is NODE_ENV
 * (`env`); whether a withheld row is SAID is the caller's decision.
 *
 * What a caller hands the gateway is the served row's `{ provider, model }`,
 * not the row. The gateway looks the row up again: the first enabled row with
 * that provider whose wire model or id is that model (placement and health
 * aside). Since ADR-0015 §4 it serves only a row that is its own entry, at
 * every risk level, and the lockfile invariant
 * (approved-models-invariant.test.ts) forbids two entries of one provider
 * sharing a pinned version or one's id being another's pinned version — so
 * the pair names at most one row the gateway may serve, and it is the row
 * judged here.
 */
export function governedMatch<T extends Pick<ModelConfig, 'id' | 'provider' | 'model' | 'enabled'>>(
  value: string,
  rows: readonly T[],
  env: NodeJS.ProcessEnv = process.env,
): { served?: { row: T; entry: ApprovedModel }; withheld: T[] } {
  const withheld: T[] = [];
  for (const row of rows) {
    if (!row.enabled || (row.id !== value && row.model !== value)) continue;
    const entry = selectableEntry(row, APPROVED_MODELS, env);
    if (entry) return { served: { row, entry }, withheld };
    withheld.push(row);
  }
  return { withheld };
}

/**
 * The approved entry a registry row IS ({@link governingEntry}), when it may be
 * selected here: in production, not an entry that pins a placeholder
 * ({@link isNominalPin}; ADR-0015 §4). The resolvers' form of the gateway's
 * rule (ai-gateway/model-governance.ts selectionRefusal), so a tier, a pin or
 * the picker never hands the gateway a model it refuses on every call. Until
 * 2026-09-28 (track GW review [4]) they used `governingEntry` alone, and
 * `ANA_TIER_ECONOMY_MODEL=local-default` — a remap .env.example advertises —
 * failed every Economy-tier turn in production with a terminal
 * MODEL_NOT_GOVERNED instead of passing it over.
 */
export function selectableEntry(
  m: Pick<ModelConfig, 'id' | 'provider' | 'model'>,
  entries: readonly ApprovedModel[] = APPROVED_MODELS,
  env: NodeJS.ProcessEnv = process.env,
): ApprovedModel | undefined {
  const entry = governingEntry(m, entries);
  return entry && !(isProductionEnv(env) && isNominalPin(entry)) ? entry : undefined;
}

/** Minimal fact about a model as it exists in the live gateway registry. */
export interface RegistryModelFact {
  id: string;
  model: string;
}

export type ModelDriftKind = 'missing' | 'version_changed' | 'unapproved_addition';

export interface ModelDriftFinding {
  id: string;
  kind: ModelDriftKind;
  detail: string;
  approvedVersion?: string;
  registryVersion?: string;
}

/**
 * Compare the live gateway registry against the approved lockfile. Any finding
 * means a model was swapped without updating governance and must be re-reviewed
 * before it can ship.
 */
export function detectModelDrift(registry: RegistryModelFact[]): ModelDriftFinding[] {
  const findings: ModelDriftFinding[] = [];
  const approvedById = new Map(APPROVED_MODELS.map(m => [m.id, m]));
  const registryById = new Map(registry.map(m => [m.id, m]));

  for (const approved of APPROVED_MODELS) {
    const live = registryById.get(approved.id);
    if (!live) {
      findings.push({
        id: approved.id,
        kind: 'missing',
        detail: `Approved model "${approved.id}" (${approved.pinnedVersion}) is no longer in the gateway registry.`,
        approvedVersion: approved.pinnedVersion,
      });
      continue;
    }
    if (live.model !== approved.pinnedVersion) {
      findings.push({
        id: approved.id,
        kind: 'version_changed',
        detail: `Model "${approved.id}" version changed from approved ${approved.pinnedVersion} to ${live.model}; re-validation required.`,
        approvedVersion: approved.pinnedVersion,
        registryVersion: live.model,
      });
    }
  }

  for (const live of registry) {
    if (!approvedById.has(live.id)) {
      findings.push({
        id: live.id,
        kind: 'unapproved_addition',
        detail: `Gateway model "${live.id}" (${live.model}) is not in the approved-models lockfile; add a governance entry before use.`,
        registryVersion: live.model,
      });
    }
  }

  return findings;
}

/** Convenience: true when the live registry exactly matches the lockfile. */
export function isRegistryApproved(registry: RegistryModelFact[]): boolean {
  return detectModelDrift(registry).length === 0;
}
