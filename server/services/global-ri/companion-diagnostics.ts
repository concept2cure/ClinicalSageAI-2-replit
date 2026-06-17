/**
 * Companion-diagnostics (CDx) co-development expert — FDA & EU.
 *
 * A companion diagnostic is an in-vitro diagnostic (IVD) that provides
 * information ESSENTIAL for the safe and effective use of a corresponding
 * therapeutic product (e.g. selecting patients who are likely to benefit, or
 * who are at increased risk of serious adverse reactions). Because the test and
 * the drug are functionally inseparable, the two are co-developed and their
 * approvals/labels are linked. This is a distinct judgement from the drug-device
 * PMOA / lead-center call modeled in combination-product-classification.ts: a CDx
 * is a drug + IVD pairing (two separate products that cross-reference each other),
 * not a single integral drug-device combination product.
 *
 * This service returns, per region, the modeled CDx framework — the regulatory
 * definition, the device risk classification, the premarket route, whether a
 * medicines authority must be consulted, and the oversight model — plus a
 * region-neutral co-development checklist (analytical validation, clinical
 * validation, contemporaneous timelines, cross-labeling, assay bridging).
 * Deterministic.
 *
 * Regions:
 *  - FDA (US)
 *  - EU  (European Union, under the IVDR)
 *
 * Pure / deterministic — no DB, no IO. The framework is an indicative reference
 * aid; the actual CDx classification and route depend on the test's intended use
 * and the linked therapeutic, and rest with the agency (FDA CDRH together with
 * CDER/CBER; EU Notified Body with the medicines competent authority / EMA
 * consultation).
 *
 * References:
 *  - FDA: Guidance for Industry and FDA Staff, "In Vitro Companion Diagnostic
 *    Devices" (August 2014) — a CDx essential to the safe/effective use of a
 *    therapeutic is generally a significant-risk device and is typically Class III
 *    requiring premarket approval (PMA, 21 CFR Part 814); the CDx and its
 *    corresponding therapeutic should be developed contemporaneously and, where
 *    possible, approved/cleared contemporaneously, with the drug and device
 *    labeling cross-referencing each other. Device classification under FD&C Act
 *    §513; PMA under 21 CFR Part 814. CDRH reviews the device in coordination with
 *    the therapeutic-product center (CDER for drugs, CBER for biologics).
 *    See also "Developing and Labeling In Vitro Companion Diagnostic Devices for a
 *    Specific Group of Oncology Therapeutic Products" (2018) and "Principles for
 *    Codevelopment of an In Vitro Companion Diagnostic Device with a Therapeutic
 *    Product" (2016, draft).
 *  - EU: Regulation (EU) 2017/746 (IVDR). A companion diagnostic is defined in
 *    IVDR Article 2(7). Under Annex VIII classification Rule 3(c) a companion
 *    diagnostic is risk Class C. IVDR Article 48(7) requires that, for a Class C
 *    companion diagnostic, the conformity-assessment Notified Body CONSULT a
 *    medicines competent authority designated by a Member State (or the European
 *    Medicines Agency, EMA, where the associated medicinal product falls within
 *    the centralised procedure) on the suitability of the CDx in relation to the
 *    medicinal product concerned, and that authority/EMA provides a scientific
 *    opinion within set timelines.
 *
 * @module server/services/global-ri/companion-diagnostics
 */

export type CdxRegion = 'FDA' | 'EU';

export interface CompanionDiagnosticFramework {
  region: CdxRegion;
  /** The regulatory definition of a companion diagnostic in this region. */
  definition: string;
  /** The IVD/device risk classification a CDx typically falls into. */
  deviceClassification: string;
  /** The premarket / conformity-assessment route. */
  regulatoryRoute: string;
  /**
   * Whether and how a medicines authority is consulted on the suitability of the
   * CDx in relation to the linked therapeutic.
   */
  medicinesConsultation: string;
  /** The review/oversight model (which bodies coordinate). */
  oversight: string;
  /** Governing citation. */
  citation: string;
  notes: string[];
}

const CDX_CAVEAT =
  'Indicative reference only — a CDx\'s classification and route depend on its intended use and the linked therapeutic; confirm with the agency (FDA CDRH together with CDER/CBER; EU Notified Body with the medicines competent authority / EMA consultation).';

const FRAMEWORKS: Record<CdxRegion, CompanionDiagnosticFramework> = {
  FDA: {
    region: 'FDA',
    definition:
      'An in-vitro companion diagnostic device provides information that is essential for the safe and effective use of a corresponding therapeutic product (e.g. to identify patients most likely to benefit, or those at increased risk of serious adverse reactions), per the FDA guidance "In Vitro Companion Diagnostic Devices" (2014).',
    deviceClassification:
      'A CDx essential to the safe and effective use of a therapeutic is generally a significant-risk device and is typically classified as Class III, requiring premarket approval (PMA) under 21 CFR Part 814 (device classification under FD&C Act §513).',
    regulatoryRoute:
      'Premarket approval (PMA, 21 CFR Part 814) for the typical Class III CDx; the CDx and its corresponding therapeutic are developed contemporaneously and, where possible, approved/cleared contemporaneously.',
    medicinesConsultation:
      'No formal "medicines authority consultation" step as in the EU; instead, CDRH reviews the device in coordination with the therapeutic-product center (CDER for drugs, CBER for biologics) within FDA, and the drug and device labeling cross-reference each other.',
    oversight:
      'FDA — CDRH reviews the IVD in coordination with CDER (drugs) or CBER (biologics), which reviews the therapeutic.',
    citation:
      'FDA Guidance "In Vitro Companion Diagnostic Devices" (2014); FD&C Act §513; 21 CFR Part 814 (PMA)',
    notes: [
      'The therapeutic\'s labeling specifies the use of the CDx, and the CDx labeling identifies the corresponding therapeutic — the two cross-reference each other.',
      'Where possible the CDx and the therapeutic should be approved contemporaneously; FDA describes codevelopment principles in its 2016 draft codevelopment guidance.',
      'Not every CDx is Class III/PMA — the device class follows the test\'s intended use and risk; a lower-risk test could follow a different route. Confirm the classification with FDA.',
      CDX_CAVEAT,
    ],
  },
  EU: {
    region: 'EU',
    definition:
      'Under the IVDR a companion diagnostic is a device essential for the safe and effective use of a corresponding medicinal product — to identify, before and/or during treatment, patients most likely to benefit, or those at increased risk of serious adverse reactions (IVDR Article 2(7)).',
    deviceClassification:
      'A companion diagnostic is risk Class C under IVDR Annex VIII classification Rule 3(c).',
    regulatoryRoute:
      'Class C conformity assessment requiring a Notified Body (IVDR Annex IX or Annex X) leading to CE marking, with the additional medicines-authority consultation step under IVDR Article 48(7).',
    medicinesConsultation:
      'IVDR Article 48(7) requires the Notified Body to CONSULT a medicines competent authority designated by a Member State — or the European Medicines Agency (EMA) where the associated medicinal product is centrally authorised — on the suitability of the companion diagnostic in relation to the medicinal product concerned; that authority/EMA provides a scientific opinion.',
    oversight:
      'EU — a Notified Body performs the Class C conformity assessment and must obtain a scientific opinion from a medicines competent authority (or EMA for centrally authorised products) under IVDR Article 48(7).',
    citation:
      'Regulation (EU) 2017/746 (IVDR) Art 2(7); Annex VIII Rule 3(c); Art 48(7)',
    notes: [
      'Classification as Class C follows directly from Annex VIII Rule 3(c) for companion diagnostics; this is one class below the highest IVDR class (D).',
      'The medicines-authority / EMA consultation under Article 48(7) is what distinguishes the CDx conformity-assessment route from that of an ordinary Class C IVD.',
      'EMA is consulted where the associated medicinal product is (or will be) authorised through the centralised procedure; otherwise a Member-State-designated medicines competent authority is consulted.',
      CDX_CAVEAT,
    ],
  },
};

/**
 * Return the modeled companion-diagnostic framework for a region.
 * Pure / deterministic. Throws for an unmodeled region.
 */
export function getCompanionDiagnosticFramework(
  region: CdxRegion,
): CompanionDiagnosticFramework {
  const framework = FRAMEWORKS[region];
  if (!framework) {
    throw new Error(`No companion-diagnostic framework modeled for region "${region}".`);
  }
  return framework;
}

/** A single region-neutral co-development consideration. */
export interface CodevelopmentConsideration {
  /** Stable identifier. */
  id: string;
  /** Short title. */
  title: string;
  /** What it entails. */
  detail: string;
}

export interface CodevelopmentConsiderations {
  considerations: CodevelopmentConsideration[];
  citation: string;
  notes: string[];
}

const CODEVELOPMENT_CONSIDERATIONS: CodevelopmentConsideration[] = [
  {
    id: 'analytical_validation',
    title: 'Analytical validation',
    detail:
      'Establish that the assay accurately and reliably measures the analyte/biomarker it is intended to detect — accuracy, precision/reproducibility, limit of detection, specificity, and reference ranges — independent of the clinical claim.',
  },
  {
    id: 'clinical_validation',
    title: 'Clinical validation',
    detail:
      'Demonstrate that the CDx result meaningfully partitions the population for the linked therapeutic, validated against the therapeutic\'s clinical-trial population and outcomes (the test\'s clinical claim is established within the drug\'s pivotal evidence).',
  },
  {
    id: 'contemporaneous_timeline',
    title: 'Contemporaneous development timeline',
    detail:
      'Plan and run device and drug development in parallel so the CDx is validated on the same population and is ready for approval/CE marking contemporaneously with the therapeutic, avoiding a gap where the drug is approved but no validated test is available.',
  },
  {
    id: 'cross_labeling',
    title: 'Cross-labeling',
    detail:
      'The therapeutic\'s labeling specifies the use of the companion diagnostic to select/manage patients, and the CDx labeling identifies the corresponding therapeutic — the drug and device labels cross-reference each other.',
  },
  {
    id: 'assay_bridging',
    title: 'Assay bridging',
    detail:
      'Where the clinical-trial assay differs from the intended market (commercial) assay, perform bridging studies to show concordance so the clinical evidence generated with the trial assay supports the market assay\'s claim.',
  },
];

const CODEVELOPMENT_CITATION =
  'FDA Guidance "In Vitro Companion Diagnostic Devices" (2014) and codevelopment guidance (2016 draft); Regulation (EU) 2017/746 (IVDR) Art 48(7) & Annex VIII Rule 3(c)';

/**
 * Return the region-neutral CDx co-development checklist.
 * Pure / deterministic.
 */
export function getCodevelopmentConsiderations(): CodevelopmentConsiderations {
  return {
    considerations: CODEVELOPMENT_CONSIDERATIONS,
    citation: CODEVELOPMENT_CITATION,
    notes: [
      'These considerations apply across regions; the specific evidence package and approval/CE-marking route differ by region (FDA PMA + cross-labeling; EU Class C conformity assessment + Article 48(7) medicines-authority/EMA consultation).',
      CDX_CAVEAT,
    ],
  };
}

/** The set of modeled CDx regions. */
export const CDX_REGIONS: CdxRegion[] = ['FDA', 'EU'];
