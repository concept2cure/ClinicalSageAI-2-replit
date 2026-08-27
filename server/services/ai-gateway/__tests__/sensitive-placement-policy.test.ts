import { describe, expect, it } from 'vitest';
import { assertSensitivePlacementConfiguration, decideSensitivePlacement, type SensitivePlacementInput } from '../sensitive-placement-policy';

const approved = { region: 'us', zeroRetentionApproved: true, approvedDataClasses: ['pii', 'phi'] as Array<'pii'|'phi'>, approvedIntendedUses: ['clinical_drafting'] };
const base: SensitivePlacementInput = { environment: 'production', detectedDataClass: 'pii', tenantPolicy: {}, provider: 'private-deployment', region: 'us', zeroRetentionApproval: true, intendedUse: 'clinical_drafting', providerApproval: approved };

describe('canonical sensitive placement decision', () => {
  it.each<[string, Partial<SensitivePlacementInput>, boolean, string]>([
    ['no PII', { detectedDataClass: 'none' }, true, 'ALLOW_NON_SENSITIVE'],
    ['ordinary PII', {}, true, 'ALLOW_APPROVED_PLACEMENT'],
    ['health information', { detectedDataClass: 'phi' }, true, 'ALLOW_APPROVED_PLACEMENT'],
    ['shared without ZDR', { zeroRetentionApproval: false }, false, 'DENY_SHARED_PROVIDER_WITHOUT_ZDR'],
    ['unknown provider', { providerApproval: undefined }, false, 'DENY_UNKNOWN_PROVIDER'],
    ['missing region', { region: undefined }, false, 'DENY_MISSING_REGION'],
    ['region outside approval', { region: 'eu' }, false, 'DENY_TENANT_POLICY'],
    ['detector failure', { detectedDataClass: 'unknown' }, false, 'DENY_DETECTOR_FAILURE'],
    ['tenant policy lookup failure', { tenantPolicy: { resolution: 'unknown' } }, false, 'DENY_TENANT_POLICY'],
  ])('%s', (_name, patch, allowed, reasonCode) => {
    expect(decideSensitivePlacement({ ...base, ...patch })).toMatchObject({ allowed, reasonCode });
  });

  it('allows only an authorized, reasoned ordinary-PII false-positive override and never a PHI override', () => {
    const override = { approved: true, reasonCode: 'review-123' };
    expect(decideSensitivePlacement({ ...base, providerApproval: undefined, tenantPolicy: { allowFalsePositiveOverride: true }, falsePositiveOverride: override })).toMatchObject({ allowed: true, reasonCode: 'ALLOW_AUTHORIZED_FALSE_POSITIVE_OVERRIDE' });
    expect(decideSensitivePlacement({ ...base, detectedDataClass: 'phi', providerApproval: undefined, tenantPolicy: { allowFalsePositiveOverride: true }, falsePositiveOverride: override }).allowed).toBe(false);
    expect(decideSensitivePlacement({ ...base, tenantPolicy: { resolution: 'unknown', allowFalsePositiveOverride: true }, falsePositiveOverride: override }).allowed).toBe(false);
  });
});

describe('production deployment guard', () => {
  it('rejects missing mode, missing settings, and contradictory approval', () => {
    expect(() => assertSensitivePlacementConfiguration({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toThrow(/policy_mode/i);
    expect(() => assertSensitivePlacementConfiguration({ NODE_ENV: 'production', AI_SENSITIVE_DATA_POLICY_MODE: 'enforce' } as NodeJS.ProcessEnv)).toThrow(/approvals/i);
    expect(() => assertSensitivePlacementConfiguration({ NODE_ENV: 'production', AI_SENSITIVE_DATA_POLICY_MODE: 'enforce', AI_PROVIDER_PLACEMENT_APPROVALS: JSON.stringify({ shared: { region: 'global', zeroRetentionApproved: false, approvedDataClasses: ['pii'], approvedIntendedUses: ['chat'] } }) } as NodeJS.ProcessEnv)).toThrow(/contradictory/i);
  });
  it('accepts an explicit internally consistent human-supplied contract', () => {
    expect(() => assertSensitivePlacementConfiguration({ NODE_ENV: 'production', AI_SENSITIVE_DATA_POLICY_MODE: 'enforce', AI_PROVIDER_PLACEMENT_APPROVALS: JSON.stringify({ deployment: approved }) } as NodeJS.ProcessEnv)).not.toThrow();
  });
  it('rejects malformed fields instead of trusting a JSON type assertion', () => {
    expect(() => assertSensitivePlacementConfiguration({
      NODE_ENV: 'production',
      AI_SENSITIVE_DATA_POLICY_MODE: 'enforce',
      AI_PROVIDER_PLACEMENT_APPROVALS: JSON.stringify({ deployment: { ...approved, zeroRetentionApproved: 'yes' } }),
    } as NodeJS.ProcessEnv)).toThrow(/invalid approval/i);
  });
});
