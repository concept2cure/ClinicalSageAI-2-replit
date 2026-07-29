/**
 * Seed precedent-application rules + confidence calibration. Each rule
 * encodes how a precedent claim translates into a confidence score:
 * direct vs analogous matching, recency decay, multi-jurisdiction
 * weighting, negative-precedent treatment.
 *
 * Backtested accuracy values are placeholders until internal validation
 * runs land; the rules themselves are real and traceable to FDA/EMA
 * precedent application practice.
 */

import type { PrecedentApplicationRule } from '../confidence-calibration-service';

export type PrecedentApplicationRuleSeed = Omit<
  PrecedentApplicationRule,
  'id' | 'organizationId' | 'createdAt' | 'updatedAt'
>;

export const PRECEDENT_APPLICATION_RULES: PrecedentApplicationRuleSeed[] = [
  {
    ruleCode: 'DIRECT_PRECEDENT_SAME_INDICATION',
    ruleName: 'Direct precedent — same indication, same active class',
    ruleType: 'direct_precedent',
    description:
      'Precedent and target share the same therapeutic indication and same active-substance class. Strongest precedent type; FDA and EMA explicitly cite "same indication" precedents in approval pathways.',
    applicabilityCriteria: {
      indicationMatch: 'exact',
      classMatch: 'same_active_class',
      submissionTypeMatch: 'preferred',
    },
    weightFactors: {
      indicationMatch: 1.0,
      classMatch: 0.9,
      submissionTypeMatch: 0.7,
      agencyMatch: 0.5,
    },
    baseConfidence: 0.85,
    confidenceModifiers: [
      { condition: 'Precedent decision is < 2 years old', modifier: 0.05, direction: 'increase' },
      { condition: 'Precedent decision involves accelerated approval', modifier: 0.05, direction: 'decrease' },
      { condition: 'Multiple precedents agree in same direction', modifier: 0.1, direction: 'increase' },
    ],
    minimumPrecedentCount: 1,
    recencyDecayHalflifeDays: 730,
    applicableAgencies: ['FDA', 'EMA', 'PMDA', 'Health Canada', 'TGA', 'MHRA'],
    crossJurisdictional: true,
    backtestedAccuracy: null,
    lastValidated: null,
    validationSampleSize: null,
  },
  {
    ruleCode: 'ANALOGOUS_PRECEDENT_MECHANISM',
    ruleName: 'Analogous precedent — same mechanism, different indication',
    ruleType: 'analogous_precedent',
    description:
      'Precedent shares mechanism of action with the target but is approved for a different indication. Useful for class-effect arguments but downweighted because indication-specific risk profiles differ.',
    applicabilityCriteria: {
      mechanismMatch: 'same',
      indicationMatch: 'different',
      classMatch: 'analogous',
    },
    weightFactors: {
      mechanismMatch: 0.8,
      classMatch: 0.6,
      submissionTypeMatch: 0.4,
      agencyMatch: 0.5,
    },
    baseConfidence: 0.6,
    confidenceModifiers: [
      { condition: 'At least three analogous precedents agree', modifier: 0.1, direction: 'increase' },
      { condition: 'Mechanism class has known indication-specific safety signal', modifier: 0.15, direction: 'decrease' },
      { condition: 'Analogous precedent in same therapeutic area', modifier: 0.05, direction: 'increase' },
    ],
    minimumPrecedentCount: 2,
    recencyDecayHalflifeDays: 1095,
    applicableAgencies: ['FDA', 'EMA', 'PMDA'],
    crossJurisdictional: true,
    backtestedAccuracy: null,
    lastValidated: null,
    validationSampleSize: null,
  },
  {
    ruleCode: 'NEGATIVE_PRECEDENT_FDA_CRL',
    ruleName: 'Negative precedent — FDA Complete Response Letter',
    ruleType: 'negative_precedent',
    description:
      'A precedent submission that received a CRL for the same or analogous claim is a strong negative signal. FDA explicitly avoids approving similar claims when prior CRLs identified the same deficiency pattern.',
    applicabilityCriteria: {
      precedentOutcome: 'crl',
      deficiencyMatch: 'same_or_analogous',
    },
    weightFactors: {
      deficiencyMatch: 0.9,
      indicationMatch: 0.7,
      classMatch: 0.6,
    },
    baseConfidence: 0.75,
    confidenceModifiers: [
      { condition: 'Same deficiency category as target submission', modifier: 0.1, direction: 'increase' },
      { condition: 'Deficiency was eventually resolved by the same sponsor', modifier: 0.15, direction: 'decrease' },
      { condition: 'Two or more CRL cycles on the same deficiency', modifier: 0.1, direction: 'increase' },
    ],
    minimumPrecedentCount: 1,
    recencyDecayHalflifeDays: 1825,
    applicableAgencies: ['FDA'],
    crossJurisdictional: false,
    backtestedAccuracy: null,
    lastValidated: null,
    validationSampleSize: null,
  },
  {
    ruleCode: 'POLICY_PRECEDENT_GUIDANCE',
    ruleName: 'Policy precedent — published guidance with controlling status',
    ruleType: 'policy_precedent',
    description:
      'Final published FDA or EMA guidance that controls the question. Treated as strong precedent when the target submission falls clearly within the guidance scope.',
    applicabilityCriteria: {
      guidanceStatus: 'final',
      scopeMatch: 'within_scope',
    },
    weightFactors: {
      guidanceStatus: 0.95,
      scopeMatch: 0.9,
    },
    baseConfidence: 0.9,
    confidenceModifiers: [
      { condition: 'Guidance is < 3 years old', modifier: 0.05, direction: 'increase' },
      { condition: 'Guidance is in draft (not final)', modifier: 0.15, direction: 'decrease' },
      { condition: 'Guidance has been amended after target submission start', modifier: 0.1, direction: 'decrease' },
    ],
    minimumPrecedentCount: 1,
    recencyDecayHalflifeDays: 1825,
    applicableAgencies: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
    crossJurisdictional: true,
    backtestedAccuracy: null,
    lastValidated: null,
    validationSampleSize: null,
  },
  {
    ruleCode: 'CROSS_JURISDICTIONAL_AGREEMENT',
    ruleName: 'Multi-jurisdictional agreement — same decision in 2+ agencies',
    ruleType: 'direct_precedent',
    description:
      'Two or more reference agencies (FDA, EMA, PMDA, Health Canada) reached the same decision for the same or analogous product. Confidence boost reflects independent corroboration.',
    applicabilityCriteria: {
      agencyCount: { min: 2 },
      decisionAlignment: 'same_direction',
    },
    weightFactors: {
      agencyCount: 0.95,
      decisionAlignment: 0.9,
    },
    baseConfidence: 0.88,
    confidenceModifiers: [
      { condition: 'Three or more agencies agree', modifier: 0.07, direction: 'increase' },
      { condition: 'One agency disagrees (split decision)', modifier: 0.2, direction: 'decrease' },
      { condition: 'Reliance pathway (Orbis / ACCESS) applies', modifier: 0.05, direction: 'increase' },
    ],
    minimumPrecedentCount: 2,
    recencyDecayHalflifeDays: 1460,
    applicableAgencies: ['FDA', 'EMA', 'PMDA', 'Health Canada', 'TGA', 'MHRA'],
    crossJurisdictional: true,
    backtestedAccuracy: null,
    lastValidated: null,
    validationSampleSize: null,
  },
  {
    ruleCode: 'PROCEDURAL_PRECEDENT_ADCOM_VOTE',
    ruleName: 'Procedural precedent — Advisory Committee vote outcome',
    ruleType: 'procedural_precedent',
    description:
      'Outcome of a relevant FDA Advisory Committee vote. Strong predictor of FDA action when the vote was on the same indication / product class.',
    applicabilityCriteria: {
      committeeType: 'matches_target',
      voteRecency: '< 5 years',
    },
    weightFactors: {
      committeeMatch: 0.85,
      voteUnanimity: 0.7,
    },
    baseConfidence: 0.7,
    confidenceModifiers: [
      { condition: 'Unanimous favourable vote', modifier: 0.15, direction: 'increase' },
      { condition: 'Split vote (>30% negative)', modifier: 0.1, direction: 'decrease' },
      { condition: 'FDA has historically overridden this committee on similar votes', modifier: 0.1, direction: 'decrease' },
    ],
    minimumPrecedentCount: 1,
    recencyDecayHalflifeDays: 1095,
    applicableAgencies: ['FDA'],
    crossJurisdictional: false,
    backtestedAccuracy: null,
    lastValidated: null,
    validationSampleSize: null,
  },
];
