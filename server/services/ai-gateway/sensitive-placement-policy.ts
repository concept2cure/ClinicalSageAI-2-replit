/** Canonical, content-free decision for dispatching sensitive data to an AI provider. */
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

export interface ProviderPlacementApproval {
  region: string;
  zeroRetentionApproved: boolean;
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
  zeroRetentionApproval: boolean;
  intendedUse: string;
  providerApproval?: ProviderPlacementApproval;
  falsePositiveOverride?: { approved: boolean; reasonCode: string };
}
export interface SensitivePlacementDecision {
  allowed: boolean;
  reasonCode: PlacementReasonCode;
  provider: string;
  region?: string;
  dataClass: DetectedDataClass;
}

export function decideSensitivePlacement(input: SensitivePlacementInput): SensitivePlacementDecision {
  const result = (allowed: boolean, reasonCode: PlacementReasonCode): SensitivePlacementDecision => ({
    allowed, reasonCode, provider: input.provider, region: input.region, dataClass: input.detectedDataClass,
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
  if ((input.tenantPolicy.requireZeroRetention || input.environment === 'production') &&
      (!input.zeroRetentionApproval || !approval.zeroRetentionApproved)) {
    return result(false, 'DENY_SHARED_PROVIDER_WITHOUT_ZDR');
  }
  return result(true, 'ALLOW_APPROVED_PLACEMENT');
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
    approvals[provider] = {
      region: region.trim().toLowerCase(),
      zeroRetentionApproved,
      approvedDataClasses: [...new Set(approvedDataClasses)] as Array<'pii' | 'phi'>,
      approvedIntendedUses: [...new Set(approvedIntendedUses as string[])],
    };
  }
  return approvals;
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
}
