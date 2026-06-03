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

import type { ProviderName } from '../ai-gateway/types';

export type ModelRole = 'primary' | 'fallback';

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
}

/**
 * The pinned, validated model set. Versions mirror server/services/ai-gateway
 * DEFAULT_MODELS. Bumping a model in the gateway without updating the matching
 * entry here trips the drift gate.
 */
export const APPROVED_MODELS: ApprovedModel[] = [
  {
    id: 'claude-opus-4',
    pinnedVersion: 'claude-opus-4-7',
    provider: 'anthropic',
    role: 'primary',
    rationale: 'Flagship reasoning + regulatory drafting model; primary for high-risk authoring and review tasks.',
    evalReference: 'server/eval/rag/ (faithfulness); docs/validation/PQ-CORTEX-001 (PQ-007/008 accuracy targets, pending execution).',
    lastReviewed: '2026-06-03',
  },
  {
    id: 'claude-opus-4-legacy',
    pinnedVersion: 'claude-opus-4-20250514',
    provider: 'anthropic',
    role: 'fallback',
    rationale: 'Dated Opus snapshot retained as intra-provider fallback when the flagship is unavailable.',
    evalReference: 'Same capability profile as claude-opus-4; covered by the gateway fallback law.',
    lastReviewed: '2026-06-03',
  },
  {
    id: 'claude-sonnet-4',
    pinnedVersion: 'claude-sonnet-4-6',
    provider: 'anthropic',
    role: 'fallback',
    rationale: 'High-quality, lower-cost fallback below Opus on the quality ladder.',
    evalReference: 'server/eval/rag/; gateway fallback law (Opus → Sonnet → Haiku).',
    lastReviewed: '2026-06-03',
  },
  {
    id: 'claude-sonnet-4-legacy',
    pinnedVersion: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    role: 'fallback',
    rationale: 'Dated Sonnet snapshot retained as intra-provider fallback.',
    evalReference: 'Same capability profile as claude-sonnet-4; covered by the gateway fallback law.',
    lastReviewed: '2026-06-03',
  },
  {
    id: 'claude-haiku-4',
    pinnedVersion: 'claude-haiku-4-5-20251001',
    provider: 'anthropic',
    role: 'fallback',
    rationale: 'Fast, low-cost model for chat/summarization and last-rung Anthropic fallback.',
    evalReference: 'server/eval/rag/; gateway fallback law.',
    lastReviewed: '2026-06-03',
  },
  {
    id: 'gpt-4o',
    pinnedVersion: 'gpt-4o',
    provider: 'openai',
    role: 'primary',
    rationale: 'Cross-provider primary for structured output; first OpenAI fallback when Anthropic is unavailable.',
    evalReference: 'server/eval/rag/; docs/rfi/AI_CAPABILITIES_INVENTORY.md (model configuration).',
    lastReviewed: '2026-06-03',
  },
  {
    id: 'gpt-4o-mini',
    pinnedVersion: 'gpt-4o-mini',
    provider: 'openai',
    role: 'fallback',
    rationale: 'Low-cost model for chat/summarization; not approved for high-risk regulatory drafting.',
    evalReference: 'server/eval/rag/.',
    lastReviewed: '2026-06-03',
  },
  {
    id: 'kimi-k2-0711',
    pinnedVersion: 'kimi-k2-0711-preview',
    provider: 'moonshot',
    role: 'fallback',
    rationale: 'Long-context cross-provider fallback when both Anthropic and OpenAI are unavailable.',
    evalReference: 'Gateway fallback law (final cross-provider rung).',
    lastReviewed: '2026-06-03',
  },
  {
    id: 'moonshot-v1-128k',
    pinnedVersion: 'moonshot-v1-128k',
    provider: 'moonshot',
    role: 'fallback',
    rationale: 'Long-context cross-provider fallback.',
    evalReference: 'Gateway fallback law.',
    lastReviewed: '2026-06-03',
  },
  {
    id: 'moonshot-v1-32k',
    pinnedVersion: 'moonshot-v1-32k',
    provider: 'moonshot',
    role: 'fallback',
    rationale: 'Short-context cross-provider fallback for chat/general tasks.',
    evalReference: 'Gateway fallback law.',
    lastReviewed: '2026-06-03',
  },
];

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
