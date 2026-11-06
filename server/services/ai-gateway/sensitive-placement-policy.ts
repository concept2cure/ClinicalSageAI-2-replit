/** Canonical, content-free decision for dispatching sensitive data to an AI provider. */
import {
  buildPlacementRegistry,
  isSelfHostedProvider,
  ZERO_RETENTION_FLAGS,
  type ProviderPlacement,
} from './providers/placement';
import type { DataSensitivityTier } from './types';

/** Conservative bridge from the Vault's existing classification vocabulary.
 * Controlled records and unknown classifications stay local until reviewed. */
export function sensitivityTierForClassification(classification: unknown): DataSensitivityTier {
  switch (typeof classification === 'string' ? classification.trim().toUpperCase() : '') {
    case 'PUBLIC': return 0;
    case 'INTERNAL': return 1;
    case 'CONFIDENTIAL': return 2;
    default: return 3;
  }
}

/** The maximum is computed by code; malformed/missing entries tier up.
 * No derivative bypass is asserted: sanitized derivatives need their own
 * tenant-approved lifecycle before raw confidential inputs can leave. */
export function decideInputTierPlacement(input: {
  tiers: readonly DataSensitivityTier[];
  provider: string;
  detectedDataClass?: DetectedDataClass;
}): { allowed: boolean; tierMax: DataSensitivityTier; reasonCode: 'ALLOW_INPUT_TIER' | 'DENY_INPUT_TIER' } {
  let tierMax: DataSensitivityTier = input.tiers.length === 0 ? 3 : 0;
  for (const tier of input.tiers) {
    tierMax = Math.max(tierMax, Number.isInteger(tier) && tier >= 0 && tier <= 3 ? tier : 3) as DataSensitivityTier;
  }
  if (input.detectedDataClass && input.detectedDataClass !== 'none') tierMax = 3;
  const allowed = tierMax < 2 || isSelfHostedProvider(input.provider);
  return { allowed, tierMax, reasonCode: allowed ? 'ALLOW_INPUT_TIER' : 'DENY_INPUT_TIER' };
}

export type DetectedDataClass = 'none' | 'pii' | 'phi' | 'unknown';
export type PlacementReasonCode =
  | 'ALLOW_NON_SENSITIVE'
  | 'ALLOW_APPROVED_PLACEMENT'
  | 'ALLOW_AUTHORIZED_FALSE_POSITIVE_OVERRIDE'
  | 'DENY_DETECTOR_FAILURE'
  | 'DENY_UNKNOWN_PROVIDER'
  | 'DENY_MISSING_REGION'
  | 'DENY_UNAPPROVED_DATA_CLASS'
  | 'DENY_UNAPPROVED_INTENDED_USE'
  | 'DENY_SHARED_PROVIDER_WITHOUT_ZDR'
  | 'DENY_TENANT_POLICY';

/**
 * The signed agreement a zero-retention approval rests on (D6, 2026-10-25).
 * `reference` names it: the contract or addendum an auditor can ask to see.
 * `effectiveFrom` is the UTC date it takes effect, YYYY-MM-DD. Before that date
 * the approval is on record but not in force, and no dispatch relies on it.
 */
export interface ZeroRetentionAgreement {
  reference: string;
  effectiveFrom: string;
}

export interface ProviderPlacementApproval {
  region: string;
  zeroRetentionApproved: boolean;
  /**
   * Required when zeroRetentionApproved is true, except for a self-hosted lane:
   * no third party receives its text, so there is no agreement to name. Until
   * 2026-10-25 the boolean alone was the approval, and nothing tied it to an
   * agreement that existed.
   */
  zeroRetentionAgreement?: ZeroRetentionAgreement;
  approvedDataClasses: Array<'pii' | 'phi'>;
  approvedIntendedUses: string[];
}
export interface TenantSensitiveDataPolicy {
  resolution?: 'resolved' | 'absent' | 'unknown';
  allowedProviders?: string[];
  requiredRegion?: string;
  requireZeroRetention?: boolean;
  allowFalsePositiveOverride?: boolean;
}
export interface SensitivePlacementInput {
  environment: string;
  detectedDataClass: DetectedDataClass;
  tenantPolicy: TenantSensitiveDataPolicy;
  provider: string;
  region?: string;
  /**
   * The placement registry's own zero-retention flag for the provider
   * (providers/placement.ts). One of the two keys; the approval is the other.
   * Until 2026-10-25 the gateway passed a copy of the approval's flag here, so
   * one JSON value was both keys.
   */
  registryZeroRetention: boolean;
  intendedUse: string;
  providerApproval?: ProviderPlacementApproval;
  falsePositiveOverride?: { approved: boolean; reasonCode: string };
  /** When the dispatch happens, for the agreement's effectiveFrom. Defaults to now. */
  now?: Date;
}
export interface SensitivePlacementDecision {
  allowed: boolean;
  reasonCode: PlacementReasonCode;
  provider: string;
  region?: string;
  dataClass: DetectedDataClass;
  /** The agreement an allowed dispatch relied on, when the dispatch required zero retention. */
  zeroRetentionAgreement?: ZeroRetentionAgreement;
}

/** The UTC calendar date of `now`, YYYY-MM-DD. */
function utcDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Whether the provider retains nothing on `now`, as both keys say: the
 * placement registry's flag, and an approval of zero retention resting on an
 * agreement that has taken effect. A self-hosted lane needs no agreement.
 */
export function zeroRetentionInForce(
  provider: string,
  registryZeroRetention: boolean,
  approval: ProviderPlacementApproval | undefined,
  now: Date = new Date(),
): boolean {
  if (!registryZeroRetention || approval?.zeroRetentionApproved !== true) return false;
  const agreement = approval.zeroRetentionAgreement;
  if (!agreement) return isSelfHostedProvider(provider);
  return agreement.effectiveFrom <= utcDate(now);
}

export function decideSensitivePlacement(input: SensitivePlacementInput): SensitivePlacementDecision {
  const result = (
    allowed: boolean,
    reasonCode: PlacementReasonCode,
    zeroRetentionAgreement?: ZeroRetentionAgreement,
  ): SensitivePlacementDecision => ({
    allowed, reasonCode, provider: input.provider, region: input.region, dataClass: input.detectedDataClass,
    ...(zeroRetentionAgreement ? { zeroRetentionAgreement } : {}),
  });
  if (input.detectedDataClass === 'none') return result(true, 'ALLOW_NON_SENSITIVE');
  if (input.detectedDataClass === 'unknown') return result(false, 'DENY_DETECTOR_FAILURE');
  if (input.tenantPolicy.resolution === 'unknown') return result(false, 'DENY_TENANT_POLICY');
  if (input.falsePositiveOverride?.approved && input.detectedDataClass === 'pii' &&
      input.tenantPolicy.allowFalsePositiveOverride && input.falsePositiveOverride.reasonCode.trim()) {
    return result(true, 'ALLOW_AUTHORIZED_FALSE_POSITIVE_OVERRIDE');
  }
  const approval = input.providerApproval;
  if (!approval) return result(false, 'DENY_UNKNOWN_PROVIDER');
  if (!input.region || !approval.region) return result(false, 'DENY_MISSING_REGION');
  if (input.region !== approval.region) return result(false, 'DENY_TENANT_POLICY');
  if (input.tenantPolicy.allowedProviders && !input.tenantPolicy.allowedProviders.includes(input.provider)) {
    return result(false, 'DENY_TENANT_POLICY');
  }
  if (input.tenantPolicy.requiredRegion && input.tenantPolicy.requiredRegion !== input.region) {
    return result(false, 'DENY_TENANT_POLICY');
  }
  if (!approval.approvedDataClasses.includes(input.detectedDataClass)) {
    return result(false, 'DENY_UNAPPROVED_DATA_CLASS');
  }
  if (!approval.approvedIntendedUses.includes(input.intendedUse)) {
    return result(false, 'DENY_UNAPPROVED_INTENDED_USE');
  }
  const zeroRetentionRequired = input.tenantPolicy.requireZeroRetention || input.environment === 'production';
  if (zeroRetentionRequired &&
      !zeroRetentionInForce(input.provider, input.registryZeroRetention, approval, input.now)) {
    return result(false, 'DENY_SHARED_PROVIDER_WITHOUT_ZDR');
  }
  return result(true, 'ALLOW_APPROVED_PLACEMENT', zeroRetentionRequired ? approval.zeroRetentionAgreement : undefined);
}

/** A real calendar date written YYYY-MM-DD. */
function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && utcDate(date) === value;
}

function readZeroRetentionAgreement(provider: string, value: unknown): ZeroRetentionAgreement {
  const candidate = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const { reference, effectiveFrom } = candidate;
  if (typeof reference !== 'string' || !reference.trim() ||
      typeof effectiveFrom !== 'string' || !isCalendarDate(effectiveFrom.trim())) {
    throw new Error(
      `AI_PROVIDER_PLACEMENT_APPROVALS has an invalid zeroRetentionAgreement for ${provider}: it needs a non-blank ` +
        '"reference" naming the signed agreement or addendum, and "effectiveFrom", the date it takes effect, written YYYY-MM-DD',
    );
  }
  return { reference: reference.trim(), effectiveFrom: effectiveFrom.trim() };
}

/**
 * The agreement an entry names, or none. A zero-retention approval for a lane a
 * third party runs must name one. A JSON null is no agreement, as Terraform's
 * validation reads it.
 */
function agreementOf(provider: string, value: unknown, zeroRetentionApproved: boolean): ZeroRetentionAgreement | undefined {
  const agreement = value === undefined || value === null ? undefined : readZeroRetentionAgreement(provider, value);
  if (zeroRetentionApproved && !agreement && !isSelfHostedProvider(provider)) {
    throw new Error(
      `AI_PROVIDER_PLACEMENT_APPROVALS approves zero retention for ${provider} but names no agreement it rests on: ` +
        'add "zeroRetentionAgreement": {"reference": "<the signed agreement or addendum>", "effectiveFrom": "YYYY-MM-DD"}, ' +
        'or set zeroRetentionApproved to false',
    );
  }
  return agreement;
}

export function readProviderPlacementApprovals(env: NodeJS.ProcessEnv = process.env): Record<string, ProviderPlacementApproval> {
  const raw = env.AI_PROVIDER_PLACEMENT_APPROVALS;
  if (!raw) return {};
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('AI_PROVIDER_PLACEMENT_APPROVALS must be a JSON object');
  const approvals: Record<string, ProviderPlacementApproval> = {};
  for (const [provider, value] of Object.entries(parsed)) {
    if (!provider.trim() || !value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`AI_PROVIDER_PLACEMENT_APPROVALS has an invalid entry for ${provider || '<empty>'}`);
    }
    const candidate = value as Record<string, unknown>;
    const region = candidate.region;
    const zeroRetentionApproved = candidate.zeroRetentionApproved;
    const approvedDataClasses = candidate.approvedDataClasses;
    const approvedIntendedUses = candidate.approvedIntendedUses;
    if (typeof region !== 'string' || !region.trim() || typeof zeroRetentionApproved !== 'boolean' ||
        !Array.isArray(approvedDataClasses) || !approvedDataClasses.every(v => v === 'pii' || v === 'phi') ||
        !Array.isArray(approvedIntendedUses) || !approvedIntendedUses.every(v => typeof v === 'string' && v.trim())) {
      throw new Error(`AI_PROVIDER_PLACEMENT_APPROVALS has an invalid approval for ${provider}`);
    }
    const zeroRetentionAgreement = agreementOf(provider, candidate.zeroRetentionAgreement, zeroRetentionApproved);
    approvals[provider] = {
      region: region.trim().toLowerCase(),
      zeroRetentionApproved,
      ...(zeroRetentionAgreement ? { zeroRetentionAgreement } : {}),
      approvedDataClasses: [...new Set(approvedDataClasses)] as Array<'pii' | 'phi'>,
      approvedIntendedUses: [...new Set(approvedIntendedUses as string[])],
    };
  }
  return approvals;
}

/**
 * Where the approvals and the placement registry disagree about zero
 * retention. A lane a third party runs needs both keys or neither: an approval
 * the registry contradicts, or a registry flag no approval and agreement back,
 * is one claim standing alone. A self-hosted lane is zero-retention by where it
 * runs, and needs neither. Empty when they agree.
 */
export function zeroRetentionDisagreements(
  approvals: Record<string, ProviderPlacementApproval>,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const registry = buildPlacementRegistry(env) as Record<string, ProviderPlacement | undefined>;
  const flags = ZERO_RETENTION_FLAGS as Partial<Record<string, string>>;
  const problems: string[] = [];
  for (const [provider, approval] of Object.entries(approvals)) {
    if (!approval.zeroRetentionApproved) continue;
    const placement = registry[provider];
    if (!placement) {
      problems.push(`${provider} is approved for zero retention, but it is not a provider the gateway routes to, so nothing confirms it retains nothing`);
    } else if (!placement.zeroDataRetention) {
      const flag = flags[provider];
      problems.push(
        `${provider} is approved for zero retention, but the placement registry says it retains data ` +
          (flag ? `(${flag} is not true)` : '(it has no zero-retention setting)'),
      );
    }
  }
  for (const [provider, flag] of Object.entries(flags)) {
    if (flag && registry[provider]?.zeroDataRetention && approvals[provider]?.zeroRetentionApproved !== true) {
      problems.push(
        `${flag}=true claims zero retention for ${provider}, but AI_PROVIDER_PLACEMENT_APPROVALS approves no zero retention for it and names no agreement`,
      );
    }
  }
  return problems;
}

export function assertSensitivePlacementConfiguration(env: NodeJS.ProcessEnv = process.env): void {
  if ((env.NODE_ENV || '').toLowerCase() !== 'production') return;
  if (env.AI_SENSITIVE_DATA_POLICY_MODE !== 'enforce') throw new Error('[ai-sensitive-placement] production requires AI_SENSITIVE_DATA_POLICY_MODE=enforce');
  const approvals = readProviderPlacementApprovals(env);
  if (Object.keys(approvals).length === 0) throw new Error('[ai-sensitive-placement] production requires explicit AI_PROVIDER_PLACEMENT_APPROVALS');
  for (const [provider, approval] of Object.entries(approvals)) {
    if (approval.approvedDataClasses.length > 0 && !approval.zeroRetentionApproved) {
      throw new Error(`[ai-sensitive-placement] contradictory sensitive-data approval for ${provider}: zero retention is not approved`);
    }
  }
  const disagreements = zeroRetentionDisagreements(approvals, env);
  if (disagreements.length > 0) {
    throw new Error(`[ai-sensitive-placement] zero retention is claimed in one place and not the other: ${disagreements.join('; ')}`);
  }
}
