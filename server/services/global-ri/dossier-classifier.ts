/**
 * Marketing-application legal-basis / dossier-type classifier — FDA & EU.
 *
 * The single most consequential early RA decision is the legal basis of the
 * marketing application: it dictates the data package, the cross-referencing
 * rights, the review division, fees, and exclusivity. Choosing 505(b)(2) vs a
 * full 505(b)(1) NDA, or an EU Article 10(3) hybrid vs a full Article 8(3)
 * application, is a judgement RA leads make at program inception and defend at
 * pre-submission meetings.
 *
 * This service classifies a product's situation into the correct legal basis per
 * region, returning the dossier type, what it permits, the data the applicant
 * must still generate, and the governing citation — deterministically.
 *
 * Regions: FDA (US), EU (centralised / Directive 2001/83/EC).
 *
 * Pure / deterministic — no DB, no IO. The classification is an indicative
 * reference aid; the binding legal basis is confirmed with the agency (e.g. at a
 * pre-IND / pre-submission or EMA scientific-advice meeting).
 *
 * References:
 *  - FDA: 505(b)(1) full NDA; 505(b)(2) NDA relying on data not developed by the
 *    applicant (21 USC 355(b)(2)); 505(j) ANDA (generic); 351(a) standalone BLA;
 *    351(k) biosimilar/interchangeable BLA (BPCIA).
 *  - EU: Directive 2001/83/EC — Art 8(3) full/standalone; Art 10(1) generic;
 *    Art 10(3) hybrid; Art 10(4) similar biological (biosimilar); Art 10a
 *    well-established use (bibliographic); Art 10b fixed combination; Art 10c
 *    informed consent.
 *
 * @module server/services/global-ri/dossier-classifier
 */

export type DossierRegion = 'FDA' | 'EU';

export interface DossierClassifierInput {
  region: DossierRegion;
  /** True for a biological product (drives BLA / biosimilar routes). */
  isBiologic?: boolean;
  /** True if the product is a copy of an already-approved reference product. */
  referencesApprovedProduct?: boolean;
  /** True if the applicant relies (in part) on data it does not own / has no right of reference to. */
  reliesOnOthersData?: boolean;
  /** True if the copy differs from the reference (strength, form, route, indication) — drives hybrid vs generic. */
  differsFromReference?: boolean;
  /** True if relying solely on published bibliographic literature (well-established use). */
  wellEstablishedUse?: boolean;
  /** True for a fixed-dose combination of known actives. */
  fixedCombination?: boolean;
  /** True if filing with the marketing-authorisation holder's consent to their dossier. */
  informedConsent?: boolean;
}

export interface DossierClassification {
  region: DossierRegion;
  /** The legal-basis code (e.g. '505(b)(2)', 'Article 10(3)'). */
  legalBasis: string;
  /** Human-readable dossier type. */
  dossierType: string;
  /** What the legal basis permits the applicant to rely on. */
  permits: string;
  /** Data the applicant must still generate / provide. */
  dataRequirements: string[];
  citation: string;
  notes: string[];
}

function classifyFda(i: DossierClassifierInput): DossierClassification {
  const notes = ['Confirm the legal basis with FDA (e.g. at a pre-IND or pre-NDA/BLA meeting).'];

  if (i.isBiologic) {
    if (i.referencesApprovedProduct) {
      return {
        region: 'FDA',
        legalBasis: '351(k)',
        dossierType: 'Biosimilar / interchangeable BLA',
        permits: 'Reliance on FDA\'s prior finding of safety/efficacy for the reference product, demonstrating biosimilarity rather than independent efficacy.',
        dataRequirements: [
          'Analytical similarity (structural/functional) to the reference product',
          'Animal data (including toxicity) as needed',
          'A comparative clinical study (PK/PD, immunogenicity, and efficacy/safety as needed)',
          'For interchangeability: additional switching data per the interchangeability guidance',
        ],
        citation: '42 USC 262(k) (BPCIA)',
        notes,
      };
    }
    return {
      region: 'FDA',
      legalBasis: '351(a)',
      dossierType: 'Standalone Biologics License Application (BLA)',
      permits: 'Full, independent demonstration of safety, purity, and potency for a new biologic.',
      dataRequirements: ['Complete CMC (Module 3)', 'Full nonclinical program', 'Adequate and well-controlled clinical trials establishing efficacy and safety'],
      citation: '42 USC 262(a) (PHS Act §351)',
      notes,
    };
  }

  if (i.referencesApprovedProduct && !i.differsFromReference && !i.reliesOnOthersData) {
    return {
      region: 'FDA',
      legalBasis: '505(j)',
      dossierType: 'Abbreviated New Drug Application (ANDA / generic)',
      permits: 'Reliance on the Reference Listed Drug (RLD); no independent safety/efficacy studies — bioequivalence in lieu of clinical efficacy.',
      dataRequirements: ['Demonstration of same active ingredient, strength, dosage form, route, and conditions of use as the RLD', 'Bioequivalence to the RLD', 'CMC and labeling consistent with the RLD'],
      citation: '21 USC 355(j)',
      notes,
    };
  }

  if (i.reliesOnOthersData || (i.referencesApprovedProduct && i.differsFromReference)) {
    return {
      region: 'FDA',
      legalBasis: '505(b)(2)',
      dossierType: 'NDA relying in part on data not developed by the applicant',
      permits: 'Reliance on published literature and/or FDA\'s prior findings of safety/efficacy for a listed drug, bridging to it for the differences (new dosage form, route, strength, indication, combination, etc.).',
      dataRequirements: ['A scientific bridge to the relied-upon drug/data (e.g. comparative BA)', 'New studies only for the aspects that differ from the relied-upon drug', 'A patent certification against the listed-drug patents'],
      citation: '21 USC 355(b)(2)',
      notes,
    };
  }

  return {
    region: 'FDA',
    legalBasis: '505(b)(1)',
    dossierType: 'Full New Drug Application (NDA)',
    permits: 'A complete, self-contained application; all data are owned by (or licensed with right of reference to) the applicant.',
    dataRequirements: ['Complete CMC (Module 3)', 'Full nonclinical program', 'Adequate and well-controlled clinical trials establishing efficacy and safety'],
    citation: '21 USC 355(b)(1)',
    notes,
  };
}

function classifyEu(i: DossierClassifierInput): DossierClassification {
  const notes = ['Confirm the legal basis with the EMA/competent authority (e.g. via scientific advice or a pre-submission meeting).'];

  if (i.informedConsent) {
    return {
      region: 'EU',
      legalBasis: 'Article 10c',
      dossierType: 'Informed-consent application',
      permits: 'Use of the pharmaceutical, preclinical and clinical documentation of an authorised product with the marketing-authorisation holder\'s consent.',
      dataRequirements: ['Letter of consent from the existing MAH', 'Administrative (Module 1) documentation; product-specific labeling'],
      citation: 'Directive 2001/83/EC Art 10c',
      notes,
    };
  }

  if (i.fixedCombination && !i.referencesApprovedProduct) {
    return {
      region: 'EU',
      legalBasis: 'Article 10b',
      dossierType: 'Fixed-combination application',
      permits: 'A new application for a combination of known active substances not previously authorised as a combination.',
      dataRequirements: ['Full Module 3 (quality) for the combination', 'Nonclinical/clinical data on the combination itself (not the individual actives where established)'],
      citation: 'Directive 2001/83/EC Art 10b',
      notes,
    };
  }

  if (i.wellEstablishedUse) {
    return {
      region: 'EU',
      legalBasis: 'Article 10a',
      dossierType: 'Well-established use (bibliographic) application',
      permits: 'Replacement of the applicant\'s own nonclinical/clinical studies with detailed scientific bibliography, where the active has ≥10 years of well-established use with recognised efficacy and an acceptable safety profile in the EU.',
      dataRequirements: ['Full Module 3 (quality)', 'A comprehensive bibliographic dossier demonstrating well-established use, efficacy, and safety'],
      citation: 'Directive 2001/83/EC Art 10a',
      notes,
    };
  }

  if (i.isBiologic && i.referencesApprovedProduct) {
    return {
      region: 'EU',
      legalBasis: 'Article 10(4)',
      dossierType: 'Similar biological medicinal product (biosimilar)',
      permits: 'Reliance on the reference biological\'s dossier by demonstrating biosimilarity, rather than repeating the full clinical program.',
      dataRequirements: ['Comparative quality (analytical) similarity to the reference', 'Comparative nonclinical data as needed', 'Comparative clinical data (PK/PD, immunogenicity, efficacy/safety per the relevant biosimilar guideline)'],
      citation: 'Directive 2001/83/EC Art 10(4)',
      notes,
    };
  }

  if (i.referencesApprovedProduct) {
    if (i.differsFromReference) {
      return {
        region: 'EU',
        legalBasis: 'Article 10(3)',
        dossierType: 'Hybrid application',
        permits: 'Partial reliance on the reference medicinal product\'s data where the strict generic definition is not met (differences in active substance, strength, form, route, or indication), supplemented by the applicant\'s own studies.',
        dataRequirements: ['Bioequivalence and/or appropriate nonclinical/clinical studies for the differences from the reference', 'Full Module 3 (quality)'],
        citation: 'Directive 2001/83/EC Art 10(3)',
        notes,
      };
    }
    return {
      region: 'EU',
      legalBasis: 'Article 10(1)',
      dossierType: 'Generic application',
      permits: 'Reliance on the reference medicinal product (same qualitative/quantitative active composition and pharmaceutical form) once its data/market protection has expired; bioequivalence in lieu of clinical efficacy.',
      dataRequirements: ['Demonstration of the same active composition and form as the reference', 'Bioequivalence study (where required)', 'Full Module 3 (quality)'],
      citation: 'Directive 2001/83/EC Art 10(1)',
      notes,
    };
  }

  return {
    region: 'EU',
    legalBasis: 'Article 8(3)',
    dossierType: 'Full / standalone (complete) application',
    permits: 'A complete, self-contained dossier with the applicant\'s own quality, nonclinical, and clinical data.',
    dataRequirements: ['Complete Module 3 (quality)', 'Full Module 4 (nonclinical)', 'Full Module 5 (clinical) establishing efficacy and safety'],
    citation: 'Directive 2001/83/EC Art 8(3)',
    notes,
  };
}

/**
 * Classify a product's marketing-application legal basis for a region.
 * Pure / deterministic. Throws for an unmodeled region.
 */
export function classifyDossier(input: DossierClassifierInput): DossierClassification {
  if (input.region === 'FDA') return classifyFda(input);
  if (input.region === 'EU') return classifyEu(input);
  throw new Error(`No dossier legal-basis modeled for region "${input.region}".`);
}

export interface LegalBasisReference {
  legalBasis: string;
  dossierType: string;
  citation: string;
}

const LEGAL_BASES: Record<DossierRegion, LegalBasisReference[]> = {
  FDA: [
    { legalBasis: '505(b)(1)', dossierType: 'Full NDA', citation: '21 USC 355(b)(1)' },
    { legalBasis: '505(b)(2)', dossierType: 'NDA relying on others\' data', citation: '21 USC 355(b)(2)' },
    { legalBasis: '505(j)', dossierType: 'ANDA (generic)', citation: '21 USC 355(j)' },
    { legalBasis: '351(a)', dossierType: 'Standalone BLA', citation: '42 USC 262(a)' },
    { legalBasis: '351(k)', dossierType: 'Biosimilar BLA', citation: '42 USC 262(k)' },
  ],
  EU: [
    { legalBasis: 'Article 8(3)', dossierType: 'Full/standalone', citation: 'Dir 2001/83/EC Art 8(3)' },
    { legalBasis: 'Article 10(1)', dossierType: 'Generic', citation: 'Dir 2001/83/EC Art 10(1)' },
    { legalBasis: 'Article 10(3)', dossierType: 'Hybrid', citation: 'Dir 2001/83/EC Art 10(3)' },
    { legalBasis: 'Article 10(4)', dossierType: 'Biosimilar', citation: 'Dir 2001/83/EC Art 10(4)' },
    { legalBasis: 'Article 10a', dossierType: 'Well-established use', citation: 'Dir 2001/83/EC Art 10a' },
    { legalBasis: 'Article 10b', dossierType: 'Fixed combination', citation: 'Dir 2001/83/EC Art 10b' },
    { legalBasis: 'Article 10c', dossierType: 'Informed consent', citation: 'Dir 2001/83/EC Art 10c' },
  ],
};

/** List the modeled legal bases for a region (reference catalog). */
export function getLegalBases(region: DossierRegion): LegalBasisReference[] | null {
  return LEGAL_BASES[region] ?? null;
}
