/**
 * AI capability governance — per-capability risk tiers, intended use, and
 * human-oversight controls.
 *
 * This module is the single code source of truth for the governance contract
 * attached to every AnA capability, mirroring the FDA 2025 draft framework on
 * AI credibility for regulatory decisions (intended use × risk × oversight).
 *
 * The contract is composed from a category-level policy plus per-capability
 * overrides, so every capability — present or future — resolves to a complete,
 * auditable governance record. `seedCapabilityRegistry()` persists these onto
 * `ana_capability_registry` so the values are queryable and inspectable.
 *
 * @module server/services/ai-governance/risk-tiers
 */

/** Risk tier for an AI capability: model influence on the decision × consequence of error. */
export type AiRiskTier = 'minimal' | 'low' | 'moderate' | 'high';

/** Human-oversight control bound to a capability. */
export type HumanOversightMode =
  | 'none' // autonomous read; no human review required
  | 'suggest_only' // AnA may propose; a human must accept before it lands
  | 'requires_review' // output lands as draft; a human must review before approval
  | 'requires_approval'; // output requires explicit human approval (e-signature) before use

export interface CapabilityGovernance {
  capabilityKey: string;
  category: string;
  /** Per-feature intended-use statement: the regulatory-decision context and its boundaries. */
  intendedUse: string;
  riskTier: AiRiskTier;
  humanOversight: HumanOversightMode;
  /** 0..1 groundedness/confidence floor. Generated claims below this force human review. */
  groundednessThreshold: number;
  /** Whether this capability contributes to a GxP / 21 CFR Part 11 regulated record. */
  gxpApplicable: boolean;
}

type CategoryPolicy = Omit<CapabilityGovernance, 'capabilityKey' | 'category' | 'intendedUse'>;

/**
 * Category-level governance defaults. Drafting, compliance, and submission
 * capabilities directly shape regulatory submissions, so they carry the
 * highest risk tier, the strictest oversight, and the highest groundedness
 * floor. Knowledge/formatting capabilities are mechanical and low risk.
 */
const CATEGORY_POLICY: Record<string, CategoryPolicy> = {
  drafting: { riskTier: 'high', humanOversight: 'requires_review', groundednessThreshold: 0.8, gxpApplicable: true },
  compliance: { riskTier: 'high', humanOversight: 'requires_review', groundednessThreshold: 0.85, gxpApplicable: true },
  // A missed/wrong regulatory commitment is pure liability (misbranding, accelerated-
  // approval withdrawal), so extracted commitments are high-risk and always reviewed.
  commitments: { riskTier: 'high', humanOversight: 'requires_review', groundednessThreshold: 0.85, gxpApplicable: true },
  submission: { riskTier: 'high', humanOversight: 'requires_approval', groundednessThreshold: 0.85, gxpApplicable: true },
  analysis: { riskTier: 'moderate', humanOversight: 'requires_review', groundednessThreshold: 0.75, gxpApplicable: true },
  intelligence: { riskTier: 'moderate', humanOversight: 'suggest_only', groundednessThreshold: 0.7, gxpApplicable: true },
  prediction: { riskTier: 'moderate', humanOversight: 'suggest_only', groundednessThreshold: 0.7, gxpApplicable: false },
  workflow: { riskTier: 'low', humanOversight: 'requires_approval', groundednessThreshold: 0.6, gxpApplicable: true },
  knowledge: { riskTier: 'low', humanOversight: 'suggest_only', groundednessThreshold: 0.5, gxpApplicable: false },
  formatting: { riskTier: 'low', humanOversight: 'suggest_only', groundednessThreshold: 0.5, gxpApplicable: false },
};

const DEFAULT_POLICY: CategoryPolicy = {
  riskTier: 'moderate',
  humanOversight: 'requires_review',
  groundednessThreshold: 0.75,
  gxpApplicable: true,
};

/**
 * Per-capability overrides where a specific capability deviates from its
 * category default. Keyed by capabilityKey. An optional `intendedUse` here
 * pins curated language for the highest-stakes capabilities.
 */
const KEY_OVERRIDES: Record<string, Partial<CategoryPolicy> & { intendedUse?: string }> = {
  // The human approval action itself — always an explicit, signed approval.
  'authoring-approve': { humanOversight: 'requires_approval', riskTier: 'moderate' },
  // Predicate comparison drives 510(k) substantial-equivalence claims.
  'predicate-comparison': { riskTier: 'high', groundednessThreshold: 0.85 },
  // Submission readiness gates an actual filing.
  'submission-readiness': { humanOversight: 'requires_approval' },
};

const OVERSIGHT_CLAUSE: Record<HumanOversightMode, string> = {
  none: 'Outputs are informational and require no human review.',
  suggest_only: 'Outputs are suggestions a qualified user must accept before they are used.',
  requires_review: 'Outputs are drafts that a qualified user must review before approval.',
  requires_approval:
    'Outputs require explicit human approval (with electronic signature where applicable) before use.',
};

/** Compose a per-feature intended-use statement from the capability metadata. */
export function composeIntendedUse(input: {
  name: string;
  description?: string | null;
  humanOversight: HumanOversightMode;
}): string {
  const desc = (input.description ?? input.name).trim().replace(/\s+/g, ' ');
  const boundary =
    'Intended to assist qualified regulatory professionals as decision support, not to make autonomous regulatory determinations.';
  return `${desc} ${OVERSIGHT_CLAUSE[input.humanOversight]} ${boundary}`;
}

/**
 * Resolve the full governance contract for a capability. Always returns a
 * complete record, falling back to the category policy and then the default
 * policy for unknown capabilities.
 */
export function governanceFor(
  capabilityKey: string | undefined | null,
  category?: string | null,
  meta?: { name?: string; description?: string | null; intendedUse?: string | null }
): CapabilityGovernance {
  const cat = (category ?? '').toLowerCase();
  const base = CATEGORY_POLICY[cat] ?? DEFAULT_POLICY;
  const override = capabilityKey ? KEY_OVERRIDES[capabilityKey] : undefined;

  const policy: CategoryPolicy = {
    riskTier: override?.riskTier ?? base.riskTier,
    humanOversight: override?.humanOversight ?? base.humanOversight,
    groundednessThreshold: override?.groundednessThreshold ?? base.groundednessThreshold,
    gxpApplicable: override?.gxpApplicable ?? base.gxpApplicable,
  };

  const intendedUse =
    meta?.intendedUse?.trim() ||
    override?.intendedUse ||
    composeIntendedUse({
      name: meta?.name ?? capabilityKey ?? 'AI capability',
      description: meta?.description,
      humanOversight: policy.humanOversight,
    });

  return {
    capabilityKey: capabilityKey ?? 'unknown',
    category: cat || 'unknown',
    intendedUse,
    ...policy,
  };
}
