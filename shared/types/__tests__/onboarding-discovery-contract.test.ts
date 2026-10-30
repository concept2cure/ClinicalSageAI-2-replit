import { describe, expect, it } from 'vitest';
import { LAUNCH_SURFACE_IDS } from '../../constants/launch-scope';
/* A recommendation is followed with onNav, which resolves a retired id through
   the shell's aliases (routing.ts destinationFor) — as demo-scripts.test.ts reads them. */
import { DEEP_LINK_ALIASES } from '../../../client/src/concept2cure/v2/registryModel';
import {
  assessOnboardingDiscovery,
  emptyDiscoveryAnswers,
  onboardingDiscoveryAnswersSchema,
  onboardingDiscoveryPatchSchema,
  onboardingDiscoveryRecordSchema,
  requiredDiscoveryFields,
  type OnboardingDiscoveryAnswers,
} from '../onboarding-discovery';

function completeSponsor(): OnboardingDiscoveryAnswers {
  return {
    ...emptyDiscoveryAnswers(),
    role: 'regulatory', regulatoryExperience: 'experienced',
    businessContext: 'sponsor', companyStage: 'early',
    companyGoal: 'Develop a first clinical program',
    productModalities: ['small_molecule'], developmentStage: 'preclinical',
    therapeuticAreas: ['Oncology'], indication: 'Advanced solid tumors',
    projectName: 'First IND', projectGoal: 'Prepare the clinical trial application',
    firstDeliverable: 'submission', targetMarkets: ['us'],
    workflowNeeds: ['submissions', 'cmc'], teamSize: '2_10', collaborationModel: 'mixed',
    dataReadiness: 'partial', securityNeeds: ['mfa', 'access_review'],
    successCriteria: 'A reviewed draft before our planned agency meeting',
    supportPreference: 'guided',
  };
}

describe('organization-wide discovery contract', () => {
  it('allows resumable blank drafts without pretending discovery is complete', () => {
    const answers = emptyDiscoveryAnswers();
    expect(onboardingDiscoveryAnswersSchema.safeParse(answers).success).toBe(true);
    expect(assessOnboardingDiscovery(answers)).toMatchObject({ completionPercent: 0, readyToComplete: false });
  });

  it('requires the drug context, and ignores a device-only question for a drug sponsor', () => {
    const answers = completeSponsor();
    expect(requiredDiscoveryFields(answers)).toEqual(expect.arrayContaining(['therapeuticAreas', 'indication']));
    expect(requiredDiscoveryFields(answers)).not.toContain('devicePurpose');
    expect(assessOnboardingDiscovery(answers)).toMatchObject({ completionPercent: 100, readyToComplete: true });
    expect(assessOnboardingDiscovery({ ...answers, indication: '' }).missingFields).toContain('indication');
  });

  it('requires device purpose and provider services only for the applicable context', () => {
    const answers = { ...completeSponsor(), businessContext: 'service_provider' as const, productModalities: ['medical_device' as const] };
    const fields = requiredDiscoveryFields(answers);
    expect(fields).toContain('devicePurpose');
    expect(fields).toContain('serviceScope');
    expect(fields).not.toContain('therapeuticAreas');
    expect(fields).not.toContain('indication');
    expect(assessOnboardingDiscovery(answers).missingFields).toEqual(['devicePurpose', 'serviceScope']);
  });

  it('asks both drug and device follow-ups for a combination product', () => {
    expect(requiredDiscoveryFields({ ...completeSponsor(), productModalities: ['combination'] }))
      .toEqual(expect.arrayContaining(['therapeuticAreas', 'indication', 'devicePurpose']));
  });

  it('does not count transient blank therapeutic-area entries as answered', () => {
    const answers = completeSponsor();
    expect(assessOnboardingDiscovery({ ...answers, therapeuticAreas: ['', '  '] }).missingFields).toContain('therapeuticAreas');
    expect(assessOnboardingDiscovery({ ...answers, therapeuticAreas: ['', ' Oncology ', ' '] }).missingFields).not.toContain('therapeuticAreas');
  });

  it('refuses unknown fields, policy injection, impossible dates and oversized values', () => {
    expect(onboardingDiscoveryAnswersSchema.safeParse({ ...completeSponsor(), security: { mfaRequired: false } }).success).toBe(false);
    expect(onboardingDiscoveryAnswersSchema.safeParse({ ...completeSponsor(), targetDate: '2026-02-30' }).success).toBe(false);
    expect(onboardingDiscoveryAnswersSchema.safeParse({ ...completeSponsor(), targetDate: '2028-02-29' }).success).toBe(true);
    expect(onboardingDiscoveryAnswersSchema.safeParse({ ...completeSponsor(), companyGoal: 'a'.repeat(2001) }).success).toBe(false);
    expect(onboardingDiscoveryAnswersSchema.safeParse({ ...completeSponsor(), workflowNeeds: ['digital_twin'] }).success).toBe(false);
  });

  it('requires a person’s reason and a nonnegative revision, with no caller-controlled ownership', () => {
    const body = { answers: completeSponsor(), expectedRevision: 0, complete: true, reason: 'Confirmed at the discovery meeting.' };
    expect(onboardingDiscoveryPatchSchema.safeParse(body).success).toBe(true);
    expect(onboardingDiscoveryPatchSchema.safeParse({ ...body, reason: 'ok' }).success).toBe(false);
    expect(onboardingDiscoveryPatchSchema.safeParse({ ...body, expectedRevision: -1 }).success).toBe(false);
    expect(onboardingDiscoveryPatchSchema.safeParse({ ...body, organizationId: 8 }).success).toBe(false);
  });

  it('refuses a stored completion marker that is not supported by complete answers', () => {
    const record = { schemaVersion: 1, revision: 1, answers: emptyDiscoveryAnswers(), updatedAt: '2026-10-14T00:00:00.000Z', updatedBy: 7, completedAt: '2026-10-14T00:00:00.000Z' };
    expect(onboardingDiscoveryRecordSchema.safeParse(record).success).toBe(false);
    expect(onboardingDiscoveryRecordSchema.safeParse({ ...record, completedAt: null }).success).toBe(true);
    expect(onboardingDiscoveryRecordSchema.safeParse({ ...record, answers: completeSponsor() }).success).toBe(true);
  });

  it('keeps recommendations in the reachable launch scope and gives no setup verdict from answers', () => {
    for (const recommendations of [
      assessOnboardingDiscovery(completeSponsor()).recommendations,
      assessOnboardingDiscovery({ ...completeSponsor(), productModalities: ['medical_device'], securityNeeds: ['sso', 'retention'], workflowNeeds: ['quality', 'analytics'] }).recommendations,
    ]) {
      // `setup` folded into admin-console (D2, 2026-10-29); its alias opens the Settings tab.
      for (const item of recommendations) expect(LAUNCH_SURFACE_IDS.has(DEEP_LINK_ALIASES[item.surface] ?? item.surface), item.surface).toBe(true);
      expect(recommendations.some(item => item.id === 'security-review')).toBe(true);
      expect(recommendations.some(item => item.id === 'define-project')).toBe(true);
    }
  });

  it('does not recommend CMC composition outside its small-molecule US IND scope', () => {
    expect(assessOnboardingDiscovery(completeSponsor()).recommendations.some(item => item.id === 'cmc-scope')).toBe(true);
    for (const answers of [
      { ...completeSponsor(), productModalities: ['biologic' as const] },
      { ...completeSponsor(), targetMarkets: ['eu' as const] },
      { ...completeSponsor(), developmentStage: 'marketing' as const },
    ]) expect(assessOnboardingDiscovery(answers).recommendations.some(item => item.id === 'cmc-scope')).toBe(false);
  });
});
