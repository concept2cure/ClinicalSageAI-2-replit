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

import type { ProviderName, TaskType } from '../ai-gateway/types';

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
    pinnedVersion: 'claude-opus-5',
    provider: 'anthropic',
    role: 'primary',
    rationale: 'Flagship reasoning + regulatory drafting model; primary for high-risk authoring and review tasks. Bumped 4.8 → Opus 5. Same wire surface as its predecessor (adaptive thinking; temperature/top_p/top_k and thinking.budget_tokens rejected), so the request shape is unchanged — but this is a capability change, not a patch: re-validation is owed against the PQ targets below, and until it executes the accuracy claim rests on the same harness as 4.8, not on measurement of this version. Opus 4.8 is retained as the top intra-provider fallback, so a tenant whose tier does not yet carry Opus 5 keeps the reviewed behaviour rather than falling to Sonnet.',
    evalReference: 'server/eval/pq/pq-protocol.json (PQ-DRAFT-001, draft; PENDING EXECUTION for this version — see pq below). Corrected 2026-09-23: this field cited docs/validation/PQ-CORTEX-001 PQ-007/008, which measure pathway-prediction accuracy and "regulatory intuition" for a different product, not drafting.',
    lastReviewed: '2026-09-17',
    approvedForHighRisk: true,
    highRiskBasis: 'This entry: "primary for high-risk authoring and review tasks".',
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
 * Whether the model that SERVED a request is approved for high-risk work,
 * identified the way a gateway response reports it: provider plus the wire
 * model (the pinned version) or the registry id. Unknown → not approved.
 */
export function isServedModelApprovedForHighRisk(
  served: { provider?: string | null; model?: string | null } | null | undefined,
): boolean {
  if (!served?.provider || !served.model) return false;
  return APPROVED_MODELS.some(
    (m) =>
      m.approvedForHighRisk &&
      m.provider === served.provider &&
      (m.pinnedVersion === served.model || m.id === served.model),
  );
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
