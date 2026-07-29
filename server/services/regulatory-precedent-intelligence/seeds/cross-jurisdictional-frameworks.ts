/**
 * Seed cross-jurisdictional regulatory frameworks. Each framework is a
 * real, public collaboration agreement between health authorities, with
 * the dates and scope drawn from the FDA / EMA / participating-agency
 * public announcements.
 */

import type { CrossJurisdictionalFramework } from '../cross-jurisdictional-service';

export type CrossJurisdictionalSeed = Omit<
  CrossJurisdictionalFramework,
  'id' | 'organizationId' | 'createdAt' | 'updatedAt'
>;

export const CROSS_JURISDICTIONAL_FRAMEWORKS: CrossJurisdictionalSeed[] = [
  {
    frameworkCode: 'ICH_HARMONISATION',
    frameworkName: 'International Council for Harmonisation (ICH)',
    frameworkType: 'ich',
    memberAgencies: ['FDA', 'EMA', 'PMDA', 'Health Canada', 'TGA', 'Swissmedic', 'MFDS', 'ANVISA', 'NMPA', 'TFDA', 'HSA'],
    leadAgency: null,
    description:
      'ICH brings regulatory authorities and pharmaceutical industry together to develop globally harmonised quality, safety, efficacy, and multidisciplinary guidelines. Foundation for nearly every modern submission requirement.',
    scope: ['quality', 'safety', 'efficacy', 'multidisciplinary'],
    eligibilityCriteria: {
      memberStatus: 'Authority must be a Member or Standing Observer of ICH',
      productType: 'human pharmaceutical for marketing authorization',
    },
    parallelReviewSavingsDays: null,
    typicalTimelineDays: null,
    submissionSequence: [
      { agency: 'sponsor', submitDay: 0, decisionDay: 0 },
      { agency: 'FDA', submitDay: 0, decisionDay: 365 },
      { agency: 'EMA', submitDay: 0, decisionDay: 210 },
      { agency: 'PMDA', submitDay: 0, decisionDay: 365 },
    ],
    dataSharingMechanism: 'Common CTD format; no automatic data sharing between member agencies.',
    commonDossierRequirements: {
      module1: 'CTD per ICH M4 with agency-specific Module 1 addenda',
      module2: 'CTD summaries per ICH M4',
      module3: 'CMC per ICH Q1–Q14',
      module4: 'Nonclinical per ICH M3(R2)',
      module5: 'Clinical per ICH E6/E8/E9/E10',
      eCTD: 'ICH M8',
    },
    agencySpecificAddenda: {
      FDA: ['Module 1 (Administrative Information)', 'FDA Form 1571/1572', 'Pediatric Study Plan'],
      EMA: ['Module 1 (Administrative)', 'Risk Management Plan (RMP)', 'Paediatric Investigation Plan'],
      PMDA: ['CTD Module 1 Japan-specific', 'GCP inspection-readiness package'],
    },
    active: true,
    effectiveDate: '1990-04-15',
  },
  {
    frameworkCode: 'FDA_EMA_PARALLEL_SCIENTIFIC_ADVICE',
    frameworkName: 'FDA–EMA Parallel Scientific Advice',
    frameworkType: 'reliance',
    memberAgencies: ['FDA', 'EMA'],
    leadAgency: null,
    description:
      'Joint procedure for sponsors to obtain coordinated scientific advice from FDA and EMA simultaneously on development programs of mutual interest. Reduces divergent advice and supports global development.',
    scope: ['scientific_advice'],
    eligibilityCriteria: {
      productType: 'novel therapeutic with global development plan',
      submissionStage: 'pre-IND through end-of-Phase-2',
      sponsorRequest: 'Sponsor must request parallel procedure from both agencies',
    },
    parallelReviewSavingsDays: 60,
    typicalTimelineDays: 95,
    submissionSequence: [
      { agency: 'sponsor', submitDay: 0, decisionDay: 0 },
      { agency: 'FDA', submitDay: 30, decisionDay: 95 },
      { agency: 'EMA', submitDay: 30, decisionDay: 95 },
    ],
    dataSharingMechanism: 'FDA and EMA share the briefing book and exchange views before meeting; confidentiality agreements in place.',
    commonDossierRequirements: {
      briefingBook: 'Single briefing book covering both agencies',
      questions: 'Clearly itemised questions per agency',
      confidentiality: 'Mutual confidentiality acknowledgement',
    },
    agencySpecificAddenda: {
      FDA: ['Type C/B meeting request letter'],
      EMA: ['Scientific advice request form'],
    },
    active: true,
    effectiveDate: '2009-09-01',
  },
  {
    frameworkCode: 'PROJECT_ORBIS',
    frameworkName: 'Project Orbis (FDA OCE concurrent oncology review)',
    frameworkType: 'project_orbis',
    memberAgencies: ['FDA', 'TGA', 'Health Canada', 'Swissmedic', 'HSA', 'ANVISA', 'MHRA', 'INVIMA'],
    leadAgency: 'FDA',
    description:
      'FDA Oncology Center of Excellence framework that allows concurrent submission and review of oncology products across multiple international partners. Designed to speed patient access in participating countries.',
    scope: ['oncology_marketing_authorization'],
    eligibilityCriteria: {
      therapeuticArea: 'oncology',
      productType: 'novel anti-cancer agent or new indication',
      eligibleSubmissions: 'NDA, BLA, supplemental NDA/BLA',
    },
    parallelReviewSavingsDays: 180,
    typicalTimelineDays: 240,
    submissionSequence: [
      { agency: 'sponsor', submitDay: 0, decisionDay: 0 },
      { agency: 'FDA', submitDay: 0, decisionDay: 180 },
      { agency: 'TGA', submitDay: 0, decisionDay: 240 },
      { agency: 'Health Canada', submitDay: 0, decisionDay: 300 },
      { agency: 'Swissmedic', submitDay: 0, decisionDay: 300 },
      { agency: 'HSA', submitDay: 0, decisionDay: 240 },
    ],
    dataSharingMechanism: 'FDA shares review observations with partner agencies under confidentiality; each partner makes its own decision.',
    commonDossierRequirements: {
      ctd: 'Same CTD dossier filed concurrently to all participating agencies',
      preNda: 'FDA pre-NDA/BLA alignment',
      commitment: 'Sponsor commitment to share FDA correspondence with partner agencies',
    },
    agencySpecificAddenda: {
      TGA: ['Australian Specific Annex'],
      'Health Canada': ['Canadian Module 1'],
      Swissmedic: ['Swiss Module 1'],
    },
    active: true,
    effectiveDate: '2019-06-01',
  },
  {
    frameworkCode: 'ACCESS_CONSORTIUM',
    frameworkName: 'ACCESS Consortium (TGA / Health Canada / Swissmedic / MHRA / HSA)',
    frameworkType: 'access_consortium',
    memberAgencies: ['TGA', 'Health Canada', 'Swissmedic', 'MHRA', 'HSA'],
    leadAgency: null,
    description:
      'Work-sharing consortium that enables synchronised review of new active substance and biosimilar applications. Allows sponsors to file once across member agencies with coordinated assessment.',
    scope: ['marketing_authorization_new_active_substance', 'biosimilar'],
    eligibilityCriteria: {
      productType: 'new active substance or biosimilar',
      sponsorRequest: 'Sponsor requests synchronised review at pre-submission',
      submissionAlignment: 'CTD format aligned across member agencies',
    },
    parallelReviewSavingsDays: 90,
    typicalTimelineDays: 270,
    submissionSequence: [
      { agency: 'sponsor', submitDay: 0, decisionDay: 0 },
      { agency: 'TGA', submitDay: 0, decisionDay: 270 },
      { agency: 'Health Canada', submitDay: 0, decisionDay: 270 },
      { agency: 'Swissmedic', submitDay: 0, decisionDay: 300 },
      { agency: 'MHRA', submitDay: 0, decisionDay: 270 },
      { agency: 'HSA', submitDay: 0, decisionDay: 270 },
    ],
    dataSharingMechanism: 'Lead agency assessment report shared with other consortium members under confidentiality; each agency retains decision authority.',
    commonDossierRequirements: {
      ctd: 'Identical CTD across members',
      specification: 'Same product specification and shelf-life claim',
      timing: 'Synchronised submission timing',
    },
    agencySpecificAddenda: {
      TGA: ['Australian Specific Annex'],
      Swissmedic: ['Swiss Module 1'],
      MHRA: ['UK Module 1'],
    },
    active: true,
    effectiveDate: '2020-10-01',
  },
];
