/**
 * Biologics Intelligence Service
 *
 * Provides biologics/biosimilar-specific regulatory pathway intelligence,
 * including BLA pathways, biosimilar comparability requirements, expedited
 * programs (RMAT, ATMP, PRIME), and multi-agency strategy.
 *
 * @module server/services/biologics-intelligence-service
 */

// ============================================================================
// TYPES
// ============================================================================

export type ModalityType =
  | 'monoclonal_antibody'
  | 'recombinant_protein'
  | 'cell_therapy'
  | 'gene_therapy'
  | 'vaccine'
  | 'blood_product'
  | 'adc'
  | 'bispecific'
  | 'fusion_protein';

export interface BiologicPathwayResult {
  productType: string;
  modalityType: ModalityType;
  indication: string;
  agencies: Array<{
    agency: string;
    pathway: string;
    center: string;
    submissionType: string;
    specialConsiderations: string[];
    estimatedTimeline: string;
  }>;
}

export interface BiosimilarRequirements {
  referenceProduct: string;
  agency: string;
  analyticalSimilarity: StudyRequirement;
  pkPdStudies: StudyRequirement;
  clinicalEfficacy: StudyRequirement;
  immunogenicity: StudyRequirement;
  extrapolation: ExtrapolationGuidance;
  interchangeability: InterchangeabilityGuidance | null;
}

interface StudyRequirement {
  required: boolean;
  description: string;
  keyEndpoints: string[];
  guidelines: string[];
}

interface ExtrapolationGuidance {
  allowed: boolean;
  conditions: string[];
  guidelines: string[];
}

interface InterchangeabilityGuidance {
  available: boolean;
  requirements: string[];
  switchingStudyRequired: boolean;
}

export interface ExpeditedPathway {
  name: string;
  agency: string;
  eligible: boolean;
  criteria: string[];
  benefits: string[];
  applicationProcess: string;
}

export interface ComparabilityDesign {
  modalityType: string;
  referenceProduct: string;
  agency: string;
  analyticalStudies: string[];
  functionalAssays: string[];
  pkStudyDesign: string;
  clinicalDesign: string;
  immunogenicityPlan: string;
}

// ============================================================================
// PATHWAY INTELLIGENCE
// ============================================================================

export class BiologicsIntelligenceService {
  getBiologicPathway(params: {
    productType: 'biologic' | 'biosimilar';
    modalityType: ModalityType;
    indication: string;
    targetAgencies: string[];
  }): BiologicPathwayResult {
    const agencies = params.targetAgencies.map((agency) => {
      const pathwayInfo = this.getAgencyPathway(agency, params.productType, params.modalityType);
      return {
        agency,
        ...pathwayInfo,
        specialConsiderations: this.getModalityConsiderations(params.modalityType, agency),
        estimatedTimeline: this.getTimeline(agency, params.productType),
      };
    });

    return {
      productType: params.productType,
      modalityType: params.modalityType,
      indication: params.indication,
      agencies,
    };
  }

  getBiosimilarRequirements(params: {
    referenceProduct: string;
    targetAgency: string;
    interchangeability: boolean;
  }): BiosimilarRequirements {
    const agencyReqs = BIOSIMILAR_REQUIREMENTS[params.targetAgency] || BIOSIMILAR_REQUIREMENTS.FDA;

    return {
      referenceProduct: params.referenceProduct,
      agency: params.targetAgency,
      analyticalSimilarity: agencyReqs.analyticalSimilarity,
      pkPdStudies: agencyReqs.pkPdStudies,
      clinicalEfficacy: agencyReqs.clinicalEfficacy,
      immunogenicity: agencyReqs.immunogenicity,
      extrapolation: agencyReqs.extrapolation,
      interchangeability: params.interchangeability && params.targetAgency === 'FDA'
        ? {
            available: true,
            requirements: [
              'Switching study demonstrating no clinically meaningful difference',
              'At least 3 switching periods between reference and biosimilar',
              'PK and immunogenicity endpoints',
              'FDA guidance: Considerations in Demonstrating Interchangeability',
            ],
            switchingStudyRequired: true,
          }
        : null,
    };
  }

  getExpeditedPathways(params: {
    indication: string;
    unmetNeed: boolean;
    seriousCondition: boolean;
    targetAgency: string;
  }): ExpeditedPathway[] {
    const pathways = EXPEDITED_PATHWAYS[params.targetAgency] || [];
    return pathways.map((p) => ({
      ...p,
      eligible: this.assessEligibility(p, params),
    }));
  }

  getComparabilityStudyDesign(params: {
    modalityType: string;
    referenceProduct: string;
    targetAgency: string;
  }): ComparabilityDesign {
    const analytical = this.getAnalyticalStudies(params.modalityType);
    const functional = this.getFunctionalAssays(params.modalityType);

    return {
      modalityType: params.modalityType,
      referenceProduct: params.referenceProduct,
      agency: params.targetAgency,
      analyticalStudies: analytical,
      functionalAssays: functional,
      pkStudyDesign: 'Randomized, double-blind, single-dose, parallel-group or crossover PK study in healthy volunteers or target patient population',
      clinicalDesign: 'Randomized, double-blind, parallel-group equivalence study with adequate sample size to demonstrate similarity margins',
      immunogenicityPlan: 'Comparative immunogenicity assessment: anti-drug antibodies (ADA), neutralizing antibodies (NAb), impact on PK/PD/efficacy/safety',
    };
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private getAgencyPathway(agency: string, productType: string, modalityType: ModalityType) {
    const pathways: Record<string, Record<string, { pathway: string; center: string; submissionType: string }>> = {
      FDA: {
        biologic: { pathway: 'BLA 351(a)', center: 'CBER/CDER', submissionType: 'Biologics License Application' },
        biosimilar: { pathway: 'BLA 351(k)', center: 'CBER/CDER', submissionType: 'Abbreviated BLA (Biosimilar)' },
      },
      EMA: {
        biologic: { pathway: 'Centralised Procedure', center: 'CHMP', submissionType: 'Marketing Authorisation Application' },
        biosimilar: { pathway: 'Centralised (Art. 10(4))', center: 'CHMP + BMWP', submissionType: 'MAA (Biosimilar)' },
      },
      PMDA: {
        biologic: { pathway: 'JNDA (Biologic)', center: 'Review Division', submissionType: 'Japan New Drug Application' },
        biosimilar: { pathway: 'Biosimilar Application', center: 'Review Division', submissionType: 'Biosimilar Approval Application' },
      },
      NMPA: {
        biologic: { pathway: 'BLA', center: 'CDE', submissionType: 'Biologics License Application' },
        biosimilar: { pathway: 'Biosimilar Application', center: 'CDE', submissionType: 'Biosimilar Application' },
      },
    };

    // Cell/gene therapy special routing
    if (['cell_therapy', 'gene_therapy'].includes(modalityType)) {
      if (agency === 'FDA') return { pathway: 'BLA 351(a) - RMAT Eligible', center: 'CBER (OTAT)', submissionType: 'BLA' };
      if (agency === 'EMA') return { pathway: 'Centralised (ATMP)', center: 'CAT + CHMP', submissionType: 'MAA (ATMP)' };
    }

    return pathways[agency]?.[productType] || { pathway: 'Standard Application', center: 'Regulatory Division', submissionType: 'Application' };
  }

  private getModalityConsiderations(modalityType: ModalityType, agency: string): string[] {
    const considerations: Record<string, string[]> = {
      monoclonal_antibody: [
        'Full characterization of CDR regions and post-translational modifications',
        'Fc effector function assessment (ADCC, CDC, ADCP)',
        'Immunogenicity risk assessment and mitigation strategy',
        'Cell line characterization and genetic stability',
      ],
      cell_therapy: [
        'Potency assay development for cell products',
        'Manufacturing consistency across patient-derived cells',
        'Long-term follow-up plan (minimum 15 years for gene-modified cells)',
        agency === 'FDA' ? 'RMAT designation eligibility assessment' : 'ATMP classification and CAT review',
        'Risk of insertional mutagenesis / tumorigenicity',
      ],
      gene_therapy: [
        'Vector characterization and tropism profiling',
        'Biodistribution and shedding studies',
        'Long-term follow-up plan (minimum 5-15 years)',
        'Environmental risk assessment (for viral vectors)',
        agency === 'FDA' ? 'Chemistry, Manufacturing, and Controls for gene therapy (FDA guidance)' : 'EMA guideline on quality, non-clinical, and clinical aspects of gene therapy',
      ],
      adc: [
        'Characterization of antibody, linker, and payload separately and conjugated',
        'Drug-antibody ratio (DAR) distribution and control',
        'Linker stability assessment (in vivo and in vitro)',
        'Free payload quantification and safety implications',
      ],
      vaccine: [
        'Immunogenicity endpoints (seroconversion, GMT, GMR)',
        'Lot-to-lot consistency studies',
        'Pediatric development plan (if applicable)',
        'Cold chain requirements and stability program',
      ],
      bispecific: [
        'Both binding arms characterized independently',
        'Bridge/hinge engineering characterization',
        'Dual-target selectivity and off-target binding assessment',
        'Unique PK/PD considerations for bispecific format',
      ],
      recombinant_protein: [
        'Host cell protein (HCP) clearance validation',
        'Glycosylation profiling and batch-to-batch consistency',
        'Aggregation and degradation pathway characterization',
      ],
      fusion_protein: [
        'Fusion junction characterization',
        'Both domains functionally active assessment',
        'Unique immunogenicity risks from novel epitopes',
      ],
      blood_product: [
        'Donor screening and pathogen safety testing',
        'Viral inactivation/removal validation',
        'Potency standardization across batches',
      ],
    };
    return considerations[modalityType] || [];
  }

  private getTimeline(agency: string, productType: string): string {
    const timelines: Record<string, Record<string, string>> = {
      FDA: {
        biologic: '10-12 months (standard), 6 months (priority review)',
        biosimilar: '10-12 months from acceptance',
      },
      EMA: {
        biologic: '210 days (active review) + clock stops',
        biosimilar: '210 days (active review) + clock stops',
      },
      PMDA: {
        biologic: '12 months (standard), 6 months (SAKIGAKE)',
        biosimilar: '12 months standard',
      },
      NMPA: {
        biologic: '12-18 months',
        biosimilar: '12-18 months',
      },
    };
    return timelines[agency]?.[productType] || '12 months (standard)';
  }

  private assessEligibility(
    pathway: ExpeditedPathway,
    params: { unmetNeed: boolean; seriousCondition: boolean }
  ): boolean {
    if (pathway.name.includes('Breakthrough') || pathway.name.includes('PRIME')) {
      return params.seriousCondition && params.unmetNeed;
    }
    if (pathway.name.includes('Fast Track')) {
      return params.seriousCondition && params.unmetNeed;
    }
    if (pathway.name.includes('RMAT')) {
      return params.seriousCondition;
    }
    if (pathway.name.includes('Orphan')) {
      return true; // Depends on prevalence, not just unmet need
    }
    return params.seriousCondition;
  }

  private getAnalyticalStudies(modalityType: string): string[] {
    const base = [
      'Primary structure (peptide mapping, intact mass)',
      'Higher-order structure (CD, DSC, HDX-MS)',
      'Glycosylation profiling (HILIC, CE-LIF)',
      'Charge variants (CEX, iCIEF)',
      'Size variants (SEC-MALS, AUC)',
      'Purity and impurities (SDS-PAGE, CE-SDS)',
    ];

    if (modalityType === 'monoclonal_antibody' || modalityType === 'bispecific') {
      return [...base, 'Fc glycan analysis', 'Disulfide bond mapping', 'Subunit analysis (IdeS digestion)'];
    }
    if (modalityType === 'adc') {
      return [...base, 'DAR distribution (HIC)', 'Unconjugated antibody quantification', 'Free drug analysis', 'Linker integrity'];
    }
    return base;
  }

  private getFunctionalAssays(modalityType: string): string[] {
    const base = ['Target binding affinity (SPR, BLI)', 'Cell-based potency assay'];

    if (modalityType === 'monoclonal_antibody') {
      return [...base, 'ADCC assay', 'CDC assay', 'FcRn binding (neonatal Fc receptor)'];
    }
    if (modalityType === 'bispecific') {
      return [...base, 'Dual-target simultaneous binding', 'T-cell activation assay (if T-cell engager)'];
    }
    return base;
  }
}

// ============================================================================
// REFERENCE DATA
// ============================================================================

const BIOSIMILAR_REQUIREMENTS: Record<string, {
  analyticalSimilarity: StudyRequirement;
  pkPdStudies: StudyRequirement;
  clinicalEfficacy: StudyRequirement;
  immunogenicity: StudyRequirement;
  extrapolation: ExtrapolationGuidance;
}> = {
  FDA: {
    analyticalSimilarity: {
      required: true,
      description: 'Comprehensive analytical characterization demonstrating biosimilarity. This is the foundation of the biosimilar application.',
      keyEndpoints: ['Structure', 'Function', 'Purity', 'Impurities', 'Stability'],
      guidelines: ['FDA Guidance: Quality Considerations in Demonstrating Biosimilarity (2015)'],
    },
    pkPdStudies: {
      required: true,
      description: 'Clinical PK/PD study demonstrating similar exposure and activity.',
      keyEndpoints: ['AUC', 'Cmax', 'Tmax', 'PD markers (if relevant)'],
      guidelines: ['FDA Guidance: Clinical Pharmacology Data to Support a Demonstration of Biosimilarity (2014)'],
    },
    clinicalEfficacy: {
      required: true,
      description: 'At least one adequate and well-controlled clinical study in a sensitive population.',
      keyEndpoints: ['Primary efficacy endpoint (equivalence margins)', 'Safety', 'Immunogenicity'],
      guidelines: ['FDA Guidance: Scientific Considerations in Demonstrating Biosimilarity (2015)'],
    },
    immunogenicity: {
      required: true,
      description: 'Comparative immunogenicity assessment.',
      keyEndpoints: ['ADA incidence', 'NAb incidence', 'Impact on PK/efficacy/safety'],
      guidelines: ['FDA Guidance: Immunogenicity Assessment for Therapeutic Protein Products (2014)'],
    },
    extrapolation: {
      allowed: true,
      conditions: [
        'Scientific justification based on totality of evidence',
        'Mechanism of action similar across indications',
        'PK/PD/safety profile similar across indications',
      ],
      guidelines: ['FDA Guidance: Biosimilars: Questions and Answers (2018)'],
    },
  },
  EMA: {
    analyticalSimilarity: {
      required: true,
      description: 'Step-wise approach: analytical → functional → clinical. Analytical is the cornerstone.',
      keyEndpoints: ['Physicochemical', 'Biological activity', 'Purity/impurities', 'Process-related impurities'],
      guidelines: ['EMA/CHMP/BMWP/437/04 Rev 1 (Overarching guideline)'],
    },
    pkPdStudies: {
      required: true,
      description: 'PK equivalence study. PD study if relevant PD marker exists.',
      keyEndpoints: ['AUC0-inf', 'Cmax', 'PD markers'],
      guidelines: ['EMA Guideline on similar biological medicinal products containing biotechnology-derived proteins'],
    },
    clinicalEfficacy: {
      required: true,
      description: 'Comparative clinical efficacy in a sensitive model. May be waived if analytical + PK are highly similar.',
      keyEndpoints: ['Equivalence in primary efficacy endpoint', 'Safety', 'Immunogenicity'],
      guidelines: ['Product-specific EMA guidelines (e.g., for mAbs, EPO, G-CSF)'],
    },
    immunogenicity: {
      required: true,
      description: 'Pre-approval comparative immunogenicity. 1-year data preferred.',
      keyEndpoints: ['ADA incidence and titer', 'NAb incidence', 'Clinical correlation'],
      guidelines: ['EMA Guideline on immunogenicity assessment of therapeutic proteins (EMEA/CHMP/BMWP/14327/2006)'],
    },
    extrapolation: {
      allowed: true,
      conditions: [
        'Same mechanism of action across indications',
        'Target/receptor is the same',
        'Clinical study conducted in most sensitive population',
        'Safety profile extrapolable',
      ],
      guidelines: ['EMA Reflection paper on extrapolation'],
    },
  },
};

const EXPEDITED_PATHWAYS: Record<string, ExpeditedPathway[]> = {
  FDA: [
    {
      name: 'Fast Track',
      agency: 'FDA',
      eligible: false,
      criteria: ['Serious or life-threatening condition', 'Potential to address unmet medical need', 'Nonclinical or clinical data demonstrating potential'],
      benefits: ['Early and frequent FDA communication', 'Rolling review', 'Eligibility for Priority Review and Accelerated Approval'],
      applicationProcess: 'Request at any time during development. Include evidence of serious condition and unmet need.',
    },
    {
      name: 'Breakthrough Therapy',
      agency: 'FDA',
      eligible: false,
      criteria: ['Serious or life-threatening condition', 'Preliminary clinical evidence of substantial improvement over existing therapies'],
      benefits: ['Intensive FDA guidance', 'Organizational commitment from senior managers', 'Rolling review', 'May consider cross-discipline meetings'],
      applicationProcess: 'Request with preliminary clinical evidence. Can be requested as early as IND.',
    },
    {
      name: 'RMAT (Regenerative Medicine Advanced Therapy)',
      agency: 'FDA',
      eligible: false,
      criteria: ['Regenerative medicine therapy (cell, gene, tissue-based)', 'Intended to treat serious condition', 'Preliminary clinical evidence of addressing unmet need'],
      benefits: ['All Fast Track benefits', 'Potential accelerated approval based on surrogate/intermediate endpoints', 'Priority Review'],
      applicationProcess: 'Request with evidence that product qualifies as regenerative medicine and addresses serious condition.',
    },
    {
      name: 'Orphan Drug Designation',
      agency: 'FDA',
      eligible: false,
      criteria: ['Disease prevalence < 200,000 in US', 'No reasonable expectation of recovering development costs'],
      benefits: ['7-year market exclusivity', 'Tax credits for clinical research', 'Waived PDUFA fees', 'FDA development assistance'],
      applicationProcess: 'Submit orphan drug designation request to OOPD at any time during development.',
    },
  ],
  EMA: [
    {
      name: 'PRIME (PRIority MEdicines)',
      agency: 'EMA',
      eligible: false,
      criteria: ['Unmet medical need', 'Major therapeutic advantage', 'Preliminary clinical evidence or compelling nonclinical data'],
      benefits: ['Early appointment of rapporteur', 'Kick-off meeting with multidisciplinary experts', 'Scientific advice at key milestones', 'Accelerated Assessment eligibility'],
      applicationProcess: 'Apply before pivotal trial start. Academic sponsors can apply at proof-of-concept.',
    },
    {
      name: 'ATMP Classification',
      agency: 'EMA',
      eligible: false,
      criteria: ['Gene therapy', 'Somatic cell therapy', 'Tissue-engineered product', 'Combined ATMP'],
      benefits: ['CAT (Committee for Advanced Therapies) scientific recommendation', 'Centralised procedure mandatory', 'Incentives for SMEs'],
      applicationProcess: 'Request ATMP classification from CAT. Mandatory for marketing authorisation.',
    },
    {
      name: 'Conditional Marketing Authorisation',
      agency: 'EMA',
      eligible: false,
      criteria: ['Unmet medical need', 'Positive benefit-risk on less complete data', 'Comprehensive data expected post-authorisation', 'Product administered under medical supervision'],
      benefits: ['Earlier patient access', 'Annual renewal until full data available'],
      applicationProcess: 'Part of the centralised procedure application. Justify need for conditional approval.',
    },
  ],
};

// Singleton export
export const biologicsIntelligence = new BiologicsIntelligenceService();
