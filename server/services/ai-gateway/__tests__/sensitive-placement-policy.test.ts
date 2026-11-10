import { describe, expect, it } from 'vitest';
import {
  assertSensitivePlacementConfiguration,
  decideSensitivePlacement,
  decideInputTierPlacement,
  sensitivityTierForClassification,
  readProviderPlacementApprovals,
  type SensitivePlacementInput,
} from '../sensitive-placement-policy';

describe('input sensitivity tiers (spec v0.5 §24)', () => {
  it.each([['PUBLIC', 0], ['INTERNAL', 1], ['CONFIDENTIAL', 2], ['CONTROLLED', 3], ['RESTRICTED', 3], [null, 3], ['unrecognized', 3]])(
    'maps persisted classification %s conservatively', (classification, tier) => {
      expect(sensitivityTierForClassification(classification)).toBe(tier);
    },
  );
  it('uses the highest input tier, even without any personal information', () => {
    expect(decideInputTierPlacement({ tiers: [0, 1, 3, 0], provider: 'anthropic', detectedDataClass: 'none' }))
      .toEqual({ allowed: false, tierMax: 3, reasonCode: 'DENY_INPUT_TIER' });
  });
  it.each(['openai', 'anthropic', 'bedrock', 'vertex', 'azure'])('keeps raw confidential and restricted inputs away from %s', provider => {
    for (const tier of [2, 3] as const) expect(decideInputTierPlacement({ tiers: [tier], provider }).allowed).toBe(false);
  });
  it('allows local processing and ordinary low-tier placement without bypassing existing policy', () => {
    expect(decideInputTierPlacement({ tiers: [3], provider: 'local' }).allowed).toBe(true);
    expect(decideInputTierPlacement({ tiers: [0, 1], provider: 'anthropic' }).allowed).toBe(true);
  });
  it('tiers up empty, malformed, and detector-uncertain bundles', () => {
    for (const tiers of [[], [4], [NaN], [undefined]] as unknown as Array<readonly (0 | 1 | 2 | 3)[]>) {
      expect(decideInputTierPlacement({ tiers, provider: 'anthropic' })).toMatchObject({ allowed: false, tierMax: 3 });
    }
    expect(decideInputTierPlacement({ tiers: [0], provider: 'anthropic', detectedDataClass: 'phi' }).allowed).toBe(false);
    expect(decideInputTierPlacement({ tiers: [0], provider: 'anthropic', detectedDataClass: 'unknown' }).allowed).toBe(false);
  });
});

/** A test fixture, not an agreement: no provider has a signed zero-retention agreement today (D6). */
const AGREEMENT = { reference: 'TEST-ZDR-ADDENDUM-0001', effectiveFrom: '2026-01-01' };
const approved = { region: 'us', zeroRetentionApproved: true, zeroRetentionAgreement: AGREEMENT, approvedDataClasses: ['pii', 'phi'] as Array<'pii'|'phi'>, approvedIntendedUses: ['clinical_drafting'] };
const base: SensitivePlacementInput = { environment: 'production', detectedDataClass: 'pii', tenantPolicy: {}, provider: 'private-deployment', region: 'us', registryZeroRetention: true, intendedUse: 'clinical_drafting', providerApproval: approved, now: new Date('2026-10-25T12:00:00Z') };

describe('canonical sensitive placement decision', () => {
  it.each<[string, Partial<SensitivePlacementInput>, boolean, string]>([
    ['no PII', { detectedDataClass: 'none' }, true, 'ALLOW_NON_SENSITIVE'],
    ['ordinary PII', {}, true, 'ALLOW_APPROVED_PLACEMENT'],
    ['health information', { detectedDataClass: 'phi' }, true, 'ALLOW_APPROVED_PLACEMENT'],
    ['shared without ZDR', { registryZeroRetention: false }, false, 'DENY_SHARED_PROVIDER_WITHOUT_ZDR'],
    ['unknown provider', { providerApproval: undefined }, false, 'DENY_UNKNOWN_PROVIDER'],
    ['missing region', { region: undefined }, false, 'DENY_MISSING_REGION'],
    ['region outside approval', { region: 'eu' }, false, 'DENY_TENANT_POLICY'],
    ['detector failure', { detectedDataClass: 'unknown' }, false, 'DENY_DETECTOR_FAILURE'],
    ['tenant policy lookup failure', { tenantPolicy: { resolution: 'unknown' } }, false, 'DENY_TENANT_POLICY'],
    // Annotated because it.each infers a union across the rows, which widens
    // `detectedDataClass` to `string` and stops the spread below type-checking.
  ] as Array<[string, Partial<SensitivePlacementInput>, boolean, string]>)('%s', (_name, patch, allowed, reasonCode) => {
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
    expect(() => assertSensitivePlacementConfiguration({ NODE_ENV: 'production', AI_SENSITIVE_DATA_POLICY_MODE: 'enforce', ANTHROPIC_ZERO_RETENTION: 'true', AI_PROVIDER_PLACEMENT_APPROVALS: JSON.stringify({ anthropic: approved }) } as NodeJS.ProcessEnv)).not.toThrow();
  });
  it('rejects malformed fields instead of trusting a JSON type assertion', () => {
    expect(() => assertSensitivePlacementConfiguration({
      NODE_ENV: 'production',
      AI_SENSITIVE_DATA_POLICY_MODE: 'enforce',
      AI_PROVIDER_PLACEMENT_APPROVALS: JSON.stringify({ deployment: { ...approved, zeroRetentionApproved: 'yes' } }),
    } as NodeJS.ProcessEnv)).toThrow(/invalid approval/i);
  });
});

/**
 * D6, 2026-10-25: a zero-retention approval names the agreement it rests on,
 * and holds only while the placement registry agrees. Until then one JSON
 * boolean was the whole claim: nothing tied it to an agreement, and nothing
 * compared it with the registry's own flag.
 */
describe('zero retention rests on a named agreement', () => {
  const prod = (approvals: unknown, extra: Record<string, string> = {}) => ({
    NODE_ENV: 'production',
    AI_SENSITIVE_DATA_POLICY_MODE: 'enforce',
    AI_PROVIDER_PLACEMENT_APPROVALS: JSON.stringify(approvals),
    ...extra,
  }) as NodeJS.ProcessEnv;
  const withoutAgreement = { region: 'global', zeroRetentionApproved: true, approvedDataClasses: ['pii'], approvedIntendedUses: ['drafting'] };

  it('refuses a zero-retention approval that names no agreement, saying what is missing', () => {
    const env = { AI_PROVIDER_PLACEMENT_APPROVALS: JSON.stringify({ anthropic: withoutAgreement }) } as NodeJS.ProcessEnv;
    expect(() => readProviderPlacementApprovals(env)).toThrow(
      /approves zero retention for anthropic but names no agreement it rests on: add "zeroRetentionAgreement"/,
    );
  });

  it('refuses it at production boot through the existing path', () => {
    expect(() => assertSensitivePlacementConfiguration(prod({ anthropic: withoutAgreement }, { ANTHROPIC_ZERO_RETENTION: 'true' })))
      .toThrow(/names no agreement/);
  });

  it.each([
    ['a blank reference', { reference: '  ', effectiveFrom: '2026-01-01' }],
    ['no reference', { effectiveFrom: '2026-01-01' }],
    ['a date that is not one', { reference: 'BAA-1', effectiveFrom: '2026-02-30' }],
    ['a date in another format', { reference: 'BAA-1', effectiveFrom: '01/01/2026' }],
    ['a string instead of an object', 'BAA-1'],
  ])('refuses an agreement with %s', (_name, agreement) => {
    const env = { AI_PROVIDER_PLACEMENT_APPROVALS: JSON.stringify({ anthropic: { ...withoutAgreement, zeroRetentionAgreement: agreement } }) } as NodeJS.ProcessEnv;
    expect(() => readProviderPlacementApprovals(env)).toThrow(/invalid zeroRetentionAgreement for anthropic/);
  });

  it('reads a JSON null as no agreement, as Terraform does', () => {
    const env = (agreement: unknown, zeroRetentionApproved: boolean) => ({ AI_PROVIDER_PLACEMENT_APPROVALS: JSON.stringify({ anthropic: { ...withoutAgreement, zeroRetentionApproved, zeroRetentionAgreement: agreement } }) }) as NodeJS.ProcessEnv;
    expect(() => readProviderPlacementApprovals(env(null, true))).toThrow(/names no agreement/);
    expect(readProviderPlacementApprovals(env(null, false)).anthropic.zeroRetentionAgreement).toBeUndefined();
  });

  it('keeps the agreement it parsed', () => {
    const env = { AI_PROVIDER_PLACEMENT_APPROVALS: JSON.stringify({ anthropic: { ...withoutAgreement, zeroRetentionAgreement: { reference: ' BAA-1 ', effectiveFrom: '2026-01-01' } } }) } as NodeJS.ProcessEnv;
    expect(readProviderPlacementApprovals(env).anthropic.zeroRetentionAgreement).toEqual({ reference: 'BAA-1', effectiveFrom: '2026-01-01' });
  });

  it('a self-hosted lane needs no agreement: no third party receives its text (ADR-0014 §1.5)', () => {
    const local = { region: 'on_prem', zeroRetentionApproved: true, approvedDataClasses: ['pii', 'phi'], approvedIntendedUses: ['embedding'] };
    expect(() => assertSensitivePlacementConfiguration(prod({ local }))).not.toThrow();
  });

  it('an approval without zero retention needs no agreement', () => {
    const interim = { region: 'global', zeroRetentionApproved: false, approvedDataClasses: [], approvedIntendedUses: ['drafting'] };
    expect(() => assertSensitivePlacementConfiguration(prod({ anthropic: interim }))).not.toThrow();
  });
});

describe('the approval and the placement registry cannot disagree at production boot', () => {
  const prod = (approvals: unknown, extra: Record<string, string> = {}) => ({
    NODE_ENV: 'production',
    AI_SENSITIVE_DATA_POLICY_MODE: 'enforce',
    AI_PROVIDER_PLACEMENT_APPROVALS: JSON.stringify(approvals),
    ...extra,
  }) as NodeJS.ProcessEnv;
  const anthropic = { region: 'global', zeroRetentionApproved: true, zeroRetentionAgreement: AGREEMENT, approvedDataClasses: ['pii'], approvedIntendedUses: ['drafting'] };

  it('refuses a zero-retention approval for a provider whose registry entry retains data', () => {
    expect(() => assertSensitivePlacementConfiguration(prod({ anthropic })))
      .toThrow(/anthropic is approved for zero retention, but the placement registry says it retains data \(ANTHROPIC_ZERO_RETENTION is not true\)/);
  });

  it('refuses one for Moonshot, which is never a zero-retention lane', () => {
    expect(() => assertSensitivePlacementConfiguration(prod({ moonshot: anthropic })))
      .toThrow(/moonshot is approved for zero retention, but the placement registry says it retains data/);
  });

  it('refuses one for a name the gateway does not route to', () => {
    expect(() => assertSensitivePlacementConfiguration(prod({ 'private-deployment': anthropic })))
      .toThrow(/private-deployment is approved for zero retention, but it is not a provider the gateway routes to/);
  });

  it('refuses a registry zero-retention flag that no approval and agreement back', () => {
    const interim = { region: 'global', zeroRetentionApproved: false, approvedDataClasses: [], approvedIntendedUses: ['drafting'] };
    expect(() => assertSensitivePlacementConfiguration(prod({ anthropic: interim }, { ANTHROPIC_ZERO_RETENTION: 'true' })))
      .toThrow(/ANTHROPIC_ZERO_RETENTION=true claims zero retention for anthropic, but AI_PROVIDER_PLACEMENT_APPROVALS approves no zero retention for it/);
    expect(() => assertSensitivePlacementConfiguration(prod({ anthropic: interim }, { AI_BEDROCK_ZERO_RETENTION: 'true' })))
      .toThrow(/AI_BEDROCK_ZERO_RETENTION=true claims zero retention for bedrock/);
  });

  it('boots when both say so', () => {
    expect(() => assertSensitivePlacementConfiguration(prod({ anthropic }, { ANTHROPIC_ZERO_RETENTION: 'true' }))).not.toThrow();
  });
});

describe('the dispatch decision relies on zero retention only when both keys say so and the agreement is in force', () => {
  it('the registry alone, or the approval alone, is not zero retention', () => {
    expect(decideSensitivePlacement({ ...base, registryZeroRetention: false })).toMatchObject({ allowed: false, reasonCode: 'DENY_SHARED_PROVIDER_WITHOUT_ZDR' });
    expect(decideSensitivePlacement({ ...base, providerApproval: { ...approved, zeroRetentionApproved: false } })).toMatchObject({ allowed: false, reasonCode: 'DENY_SHARED_PROVIDER_WITHOUT_ZDR' });
  });

  it('an agreement that takes effect later is not yet in force', () => {
    const later = { ...approved, zeroRetentionAgreement: { reference: 'BAA-2', effectiveFrom: '2026-10-26' } };
    expect(decideSensitivePlacement({ ...base, providerApproval: later })).toMatchObject({ allowed: false, reasonCode: 'DENY_SHARED_PROVIDER_WITHOUT_ZDR' });
    expect(decideSensitivePlacement({ ...base, providerApproval: later, now: new Date('2026-10-26T00:00:00Z') }))
      .toMatchObject({ allowed: true, reasonCode: 'ALLOW_APPROVED_PLACEMENT' });
  });

  it('a third-party lane with no agreement is not zero retention, even if the approval says so', () => {
    const bare = { ...approved, zeroRetentionAgreement: undefined };
    expect(decideSensitivePlacement({ ...base, providerApproval: bare })).toMatchObject({ allowed: false, reasonCode: 'DENY_SHARED_PROVIDER_WITHOUT_ZDR' });
  });

  it('names the agreement an allowed dispatch relied on, and none when zero retention was not required', () => {
    expect(decideSensitivePlacement(base)).toMatchObject({ allowed: true, zeroRetentionAgreement: AGREEMENT });
    const notRequired = decideSensitivePlacement({ ...base, environment: 'staging' });
    expect(notRequired).toMatchObject({ allowed: true, reasonCode: 'ALLOW_APPROVED_PLACEMENT' });
    expect(notRequired.zeroRetentionAgreement).toBeUndefined();
  });
});
