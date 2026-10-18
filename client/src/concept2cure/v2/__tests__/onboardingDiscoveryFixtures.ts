import { emptyDiscoveryAnswers, type OnboardingDiscoveryAnswers } from '@shared/types/onboarding-discovery';

/** Test input, never used by product code. */
export function completeDiscovery(): OnboardingDiscoveryAnswers {
  return {
    ...emptyDiscoveryAnswers(), role: 'regulatory', regulatoryExperience: 'experienced',
    businessContext: 'sponsor', companyStage: 'early', companyGoal: 'Prepare our first clinical program.',
    productModalities: ['small_molecule'], developmentStage: 'preclinical',
    therapeuticAreas: ['Oncology'], indication: 'Adults with advanced solid tumors.',
    projectName: 'Program Alpha', projectGoal: 'Prepare an evidence-backed submission package.',
    firstDeliverable: 'submission', targetMarkets: ['us'], workflowNeeds: ['vault', 'submissions'],
    teamSize: '2_10', collaborationModel: 'internal', dataReadiness: 'partial',
    securityNeeds: ['mfa'], successCriteria: 'Agree gaps and review the draft with the project lead.',
    supportPreference: 'guided',
  };
}
