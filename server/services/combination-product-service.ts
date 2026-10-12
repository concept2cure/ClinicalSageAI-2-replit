/**
 * Combination Product Service
 *
 * Requirements and OCP guidance for drug/device, biologic/device, and
 * drug/biologic combination products.
 *
 * Classification is NOT done here. The primary mode of action and lead Center
 * come from the canonical engine, determinePrimaryModeOfAction in
 * server/services/combination-products/combination-products-knowledge.ts; this
 * service only builds the per-agency requirements for that answer. (Its former
 * determinePrimaryMode, a fixed per-PMOA table that listed the drug-eluting stent
 * as CDER-led and cited the PMOA as 21 CFR 3.2(e), was removed on 2026-10-05.)
 *
 * @module server/services/combination-product-service
 */

import type { PmoaResult } from './combination-products/combination-products-knowledge.js';

// ============================================================================
// TYPES
// ============================================================================

export interface CombinationRequirements {
  /** The canonical PMOA / lead-Center determination these requirements are for. */
  classification: PmoaResult;
  agency: string;
  submissionType: string;
  requiredComponents: Array<{
    component: string;
    requirements: string[];
    guidelines: string[];
  }>;
  gmPRequirements: string[];
  labelingConsiderations: string[];
}

export interface OCPGuidance {
  title: string;
  category: string;
  description: string;
  applicableTo: string[];
  keyRequirements: string[];
}

// ============================================================================
// CLASSIFICATION SERVICE
// ============================================================================

export class CombinationProductService {
  getCombinationRequirements(params: {
    classification: PmoaResult;
    targetAgency: string;
  }): CombinationRequirements {
    const agencyReqs = this.getAgencyRequirements(params.classification, params.targetAgency);
    return agencyReqs;
  }

  getOCPGuidance(productType: string): OCPGuidance[] {
    return OCP_GUIDANCE.filter(
      (g) => g.applicableTo.includes(productType) || g.applicableTo.includes('all')
    );
  }

  // ============================================================================
  // PRIVATE
  // ============================================================================

  private getAgencyRequirements(
    classification: PmoaResult,
    agency: string
  ): CombinationRequirements {
    if (agency === 'FDA') {
      return this.getFDARequirements(classification);
    }
    if (agency === 'EMA') {
      return this.getEMARequirements(classification);
    }
    return this.getGenericRequirements(classification, agency);
  }

  private getFDARequirements(classification: PmoaResult): CombinationRequirements {
    const drugReqs = {
      component: 'Drug Component',
      requirements: [
        'Full CMC data (drug substance and drug product)',
        'Nonclinical pharmacology and toxicology',
        'Clinical efficacy and safety data',
        'Stability data for drug in combination context',
        'Extractables and leachables from device component',
      ],
      guidelines: [
        'FDA Guidance: Current Good Manufacturing Practice for Combination Products (2017)',
        'FDA Guidance: Human Factors Studies and Related Clinical Study Considerations (2016)',
      ],
    };

    const deviceReqs = {
      component: 'Device Component',
      requirements: [
        'Design controls per 21 CFR 820',
        'Biocompatibility testing (ISO 10993)',
        'Performance/bench testing',
        'Sterilization validation (if applicable)',
        'Software validation (if applicable)',
        'Human factors / usability engineering (IEC 62366)',
      ],
      guidelines: [
        'FDA Guidance: Applying Human Factors to Medical Devices (2016)',
        'FDA Guidance: Design Considerations for Devices Intended for Home Use (2014)',
      ],
    };

    const biologicReqs = {
      component: 'Biologic Component',
      requirements: [
        'Full characterization of biological product',
        'Cell line/vector characterization',
        'Process validation and comparability',
        'Potency assay development',
        'Immunogenicity assessment',
      ],
      guidelines: [
        'FDA Guidance: Quality, Non-Clinical, and Clinical Considerations for Gene Therapy Products',
      ],
    };

    const components: Array<{ component: string; requirements: string[]; guidelines: string[] }> = [];
    if (classification.pmoaType !== 'biologic') {
      components.push(drugReqs, deviceReqs);
    } else {
      components.push(biologicReqs, deviceReqs);
    }

    return {
      classification,
      agency: 'FDA',
      submissionType: classification.leadCenter === 'CDER'
        ? 'NDA (with device constituent part)'
        : classification.leadCenter === 'CBER'
        ? 'BLA (with device constituent part)'
        : 'PMA or 510(k) (with drug/biologic constituent part)',
      requiredComponents: components,
      gmPRequirements: [
        'cGMP for both drug/biologic AND device components (21 CFR 4)',
        'Quality system must address both 21 CFR 211 (drug) and 21 CFR 820 (device)',
        'Single quality system may be used if it satisfies both sets of requirements',
        'Design controls required for device constituent part regardless of lead center',
      ],
      labelingConsiderations: [
        'Single labeling for the combination product',
        'Must address both drug and device aspects',
        'Instructions for Use (IFU) required for device component',
        'Patient/user training materials as needed',
        'Medication guide if required for drug component',
      ],
    };
  }

  private getEMARequirements(classification: PmoaResult): CombinationRequirements {
    return {
      classification,
      agency: 'EMA',
      submissionType: 'MAA + MDR CE Marking (integral combination)',
      requiredComponents: [
        {
          component: 'Medicinal Product',
          requirements: [
            'Full Module 3 (Quality), Module 4 (Nonclinical), Module 5 (Clinical)',
            'Device component addressed in Module 3.2.P',
            'Notified Body opinion on device conformity (MDR Article 117)',
          ],
          guidelines: ['MDR 2017/745 Article 1(8) and Annex I'],
        },
        {
          component: 'Device Component',
          requirements: [
            'Technical documentation per MDR Annex II and III',
            'Essential requirements conformity (MDR Annex I)',
            'Clinical evaluation per MDR Article 61',
            'Notified Body assessment for Class III/IIb devices',
          ],
          guidelines: ['MDCG 2021-22: Guidance on Combination Products'],
        },
      ],
      gmPRequirements: [
        'EU GMP Annex 1 (if sterile)',
        'ISO 13485 for device manufacturing',
        'Compliance with both pharmaceutical and device quality systems',
      ],
      labelingConsiderations: [
        'SmPC must address both drug and device aspects',
        'Package leaflet requirements for both components',
        'CE marking on outer packaging (if device is integral)',
      ],
    };
  }

  private getGenericRequirements(
    classification: PmoaResult,
    agency: string
  ): CombinationRequirements {
    return {
      classification,
      agency,
      submissionType: 'Combination Product Application (agency-specific)',
      requiredComponents: [
        {
          component: 'Primary Component',
          requirements: [
            'Full data package for primary mode of action component',
            'Compatibility/interaction data between components',
            'Combined product stability data',
          ],
          guidelines: ['Consult agency-specific combination product guidance'],
        },
        {
          component: 'Secondary Component',
          requirements: [
            'Relevant quality data',
            'Safety data in combination context',
            'Performance/functional data',
          ],
          guidelines: ['Consult agency-specific guidance'],
        },
      ],
      gmPRequirements: ['Quality system covering both component types'],
      labelingConsiderations: ['Combined labeling addressing both components'],
    };
  }
}

// ============================================================================
// OCP GUIDANCE DATABASE
// ============================================================================

const OCP_GUIDANCE: OCPGuidance[] = [
  {
    title: 'Classification of Products as Drugs and Devices',
    category: 'Classification',
    description: 'Framework for determining whether a product is a drug, device, biologic, or combination product.',
    applicableTo: ['all'],
    keyRequirements: [
      'Determine primary mode of action (PMOA)',
      'Request for Designation (RFD) to OCP if uncertain',
      'PMOA determines lead FDA center',
    ],
  },
  {
    title: 'Current Good Manufacturing Practice for Combination Products',
    category: 'Manufacturing',
    description: 'GMP requirements under 21 CFR Part 4 for combination products.',
    applicableTo: ['all'],
    keyRequirements: [
      'Demonstrate compliance with both drug/biologic cGMP and device QSR',
      'Streamlined approach: single quality system may satisfy both',
      'Design controls required for device constituent parts',
    ],
  },
  {
    title: 'Human Factors Studies for Combination Products',
    category: 'Usability',
    description: 'Human factors and usability engineering for drug-device combinations.',
    applicableTo: ['drug', 'biologic'],
    keyRequirements: [
      'Formative and summative usability studies',
      'Simulated-use and actual-use studies',
      'Assessment of critical tasks and use errors',
      'Labeling comprehension studies',
    ],
  },
  {
    title: 'Postmarket Safety Reporting for Combination Products',
    category: 'Post-market',
    description: 'Adverse event reporting requirements per 21 CFR Part 4 Subpart B.',
    applicableTo: ['all'],
    keyRequirements: [
      'Report under regulations applicable to lead center application type',
      'MedWatch (drug/biologic) or MDR (device) as applicable',
      '15-day alert reports for serious, unexpected events',
    ],
  },
  {
    title: 'Prefilled Syringes and Auto-injectors',
    category: 'Drug-Device',
    description: 'Specific considerations for container closure / delivery device combinations.',
    applicableTo: ['drug', 'biologic'],
    keyRequirements: [
      'Container closure integrity testing',
      'Extractables and leachables assessment',
      'Dose delivery accuracy and precision',
      'Needle safety mechanism evaluation',
      'Drop/impact resistance testing',
    ],
  },
];

// Singleton export
export const combinationProductService = new CombinationProductService();
