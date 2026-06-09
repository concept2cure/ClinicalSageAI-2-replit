/**
 * Methodology / platform science corpus — flow cytometry, mass spectrometry,
 * coagulation, and immunoassay platforms.
 *
 * Deep, citable entries on the measurement technologies behind major IVD
 * classes, each with the validation considerations and standards specific to
 * the platform (which differ materially from generic clinical chemistry).
 */

import type { KnowledgeEntry } from '../types';

export const PLATFORM_METHODOLOGY_KNOWLEDGE: KnowledgeEntry[] = [
  {
    id: 'sci.method.flow-cytometry',
    domain: 'scientific',
    topic: 'methodology',
    title: 'Flow cytometry — immunophenotyping and validation specifics',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'Flow cytometry quantifies cell-surface/intracellular markers on single cells; validation centers on antibody-panel design, compensation/spectral unmixing, gating reproducibility, and (for rare-event assays like MRD) limit of detection driven by total events acquired.',
    detail:
      'Clinical flow cytometry (leukemia/lymphoma immunophenotyping, CD4 counts, PNH, MRD) measures fluorescence per cell across multiple parameters. Its validation differs from analyte concentration assays: key elements are antibody clone/fluorochrome panel design and titration, fluorescence compensation or spectral unmixing, instrument standardization (calibration beads, voltage setup), gating-strategy reproducibility (a major inter-operator variability source), and specimen stability (cells degrade quickly). For rare-event applications such as MRD or PNH clones, the limit of detection and lower limit of quantitation are governed by the number of events acquired and the background — detecting 1 in 10⁴–10⁶ cells requires acquiring millions of events with defined cluster criteria. CLSI H62 (validation of assays performed by flow cytometry) and consensus (EuroFlow, ICSH/ICCS) frame the methodology. Standardized, harmonized panels (EuroFlow) improve cross-lab comparability.',
    keyPoints: [
      'Per-cell multi-parameter fluorescence; validation is panel/gating/compensation-centric.',
      'Gating reproducibility is a major inter-operator variability source.',
      'Rare-event LoD (MRD/PNH) is event-count and background driven.',
      'CLSI H62 + EuroFlow/ICCS consensus standardize methodology.',
    ],
    pitfalls: [
      'Inadequate compensation/unmixing producing spillover artefacts.',
      'Insufficient events acquired for a rare-event LoD claim.',
    ],
    citations: [
      { label: 'CLSI H62 (validation of flow cytometry assays)', source: 'CLSI' },
      { label: 'EuroFlow / ICSH-ICCS flow cytometry consensus', source: 'EuroFlow/ICCS' },
    ],
    related: ['sci.ngs.mrd', 'sci.ivd.detection-capability', 'sci.ivd.precision'],
    tags: ['flow-cytometry', 'immunophenotyping', 'mrd', 'gating', 'h62'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'sci.method.mass-spec',
    domain: 'scientific',
    topic: 'methodology',
    title: 'Clinical mass spectrometry (LC-MS/MS) — validation and standardization',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'LC-MS/MS provides high specificity for small molecules, steroids, drugs, and increasingly proteins; validation emphasizes ion-ratio confirmation, internal standards (ideally isotope-labeled), matrix effects/ion suppression, and carryover — and it is the basis of many reference measurement procedures.',
    detail:
      'Liquid chromatography–tandem mass spectrometry is the analytical gold standard for many small-molecule analytes (steroids, vitamin D, immunosuppressants, therapeutic drugs, newborn-screening metabolites) due to high specificity. Validation requirements that distinguish MS from immunoassays: qualifier/quantifier ion-ratio confirmation (specificity), use of internal standards — preferably stable-isotope-labeled — to correct for recovery and ion suppression, explicit assessment of matrix effects/ion suppression (post-column infusion or post-extraction spike), chromatographic resolution of isobaric interferents, and carryover. Because of its specificity and traceability potential, LC-MS/MS underpins many JCTLM-listed reference measurement procedures (e.g., for steroids, creatinine). Clinical MS is frequently deployed as a laboratory-developed test, intersecting the LDT regulatory landscape. CLSI C62 covers LC-MS/MS method validation.',
    keyPoints: [
      'High-specificity small-molecule (and growing protein) quantitation.',
      'Ion-ratio confirmation + (isotope-labeled) internal standards are essential.',
      'Must assess matrix effects/ion suppression and isobaric interference.',
      'Underpins many reference measurement procedures; often deployed as an LDT.',
    ],
    pitfalls: [
      'Ignoring ion suppression/matrix effects without an isotope-labeled IS.',
      'No qualifier-ion ratio acceptance criteria (false specificity).',
    ],
    citations: [
      { label: 'CLSI C62 (LC-MS/MS methods)', source: 'CLSI' },
      { label: 'JCTLM reference measurement procedures (MS-based)', source: 'JCTLM' },
    ],
    related: ['sci.ivd.method-comparison', 'sci.ivd.harmonization-jctlm', 'legal.ivd.ldt-rule'],
    tags: ['mass-spectrometry', 'lc-ms-ms', 'ion-ratio', 'internal-standard', 'c62'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'sci.method.coagulation',
    domain: 'scientific',
    topic: 'methodology',
    title: 'Coagulation testing — PT/INR, aPTT, and assay-specific calibration',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'Coagulation assays (PT/INR, aPTT, fibrinogen, factor assays, anti-Xa) are exquisitely sensitive to pre-analytics and reagent/instrument combinations; the INR depends on an ISI calibration and reagent responsiveness, requiring careful local calibration and pre-analytical control.',
    detail:
      'Coagulation testing has distinctive validation/standardization needs. The prothrombin time is reported as the International Normalized Ratio (INR), which corrects for thromboplastin reagent responsiveness via the International Sensitivity Index (ISI) and a geometric-mean normal PT — so the same plasma yields different PT seconds across reagent/instrument systems, and INR comparability depends on correct ISI calibration (ideally local/system-specific ISI). Pre-analytics are critical and tightly specified (CLSI H21): citrate tube fill ratio, hematocrit correction for very high/low Hct, time/temperature, and avoidance of contamination/clotting. Specialized assays (anti-Xa for heparin/DOAC monitoring, factor assays, lupus anticoagulant) have their own calibration and interference considerations. Heparin and direct oral anticoagulants interfere with multiple clot-based assays — a key labeled limitation.',
    keyPoints: [
      'INR depends on ISI calibration + geometric-mean normal PT (system-specific).',
      'Pre-analytics tightly specified (citrate fill ratio, Hct, time/temp) — CLSI H21.',
      'Anti-Xa, factor assays, lupus anticoagulant have specific calibration/interference needs.',
      'Heparin/DOACs interfere with clot-based assays (labeled limitation).',
    ],
    citations: [
      { label: 'CLSI H21 (coagulation specimen handling); H47/H54 (PT/aPTT)', source: 'CLSI' },
      { label: 'WHO/ISTH INR and ISI calibration guidance', source: 'WHO/ISTH' },
    ],
    related: ['bio.d-dimer', 'sci.ivd.preanalytical', 'sci.ivd.interference'],
    tags: ['coagulation', 'inr', 'isi', 'aptt', 'anti-xa', 'h21'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'sci.method.immunoassay-platforms',
    domain: 'scientific',
    topic: 'methodology',
    title: 'Immunoassay platforms — formats, interferences, and standardization',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'Immunoassays (ELISA, CLIA/ECLIA, lateral flow) dominate protein/hormone/infectious-serology testing; their characteristic interferences — hook effect, biotin, heterophile/HAMA antibodies, autoantibodies, cross-reactivity — and lot-to-lot calibration are central validation concerns.',
    detail:
      'Immunoassays use antibody–antigen binding with various detection formats (colorimetric ELISA, chemiluminescent CLIA/ECLIA, fluorescence, lateral-flow rapid tests). They are the workhorse for hormones, tumor markers, cardiac/inflammatory markers, and infectious serology. Their validation must address format-specific interferences: high-dose hook (prozone) causing falsely low results at very high analyte; biotin interference in streptavidin-biotin systems; heterophile/human anti-animal (HAMA) and rheumatoid-factor interference producing false positives/negatives; endogenous autoantibodies and macro-complexes (e.g., macroprolactin, macro-TSH); and cross-reactivity with structurally related molecules. Calibration is typically multi-point and lot-sensitive (lot-to-lot verification is a recurring QC need). Many immunoassays lack a true reference method and rely on consensus harmonization. Point-of-care lateral-flow versions add lay-user/robustness considerations (CLIA waiver).',
    keyPoints: [
      'Formats: ELISA, CLIA/ECLIA, fluorescence, lateral flow.',
      'Signature interferences: hook, biotin, heterophile/HAMA/RF, autoantibodies, cross-reactivity.',
      'Lot-to-lot calibration verification is a recurring QC need.',
      'Often consensus-harmonized (no true reference method); POC adds waiver considerations.',
    ],
    pitfalls: [
      'Missing hook-effect or biotin interference in panel design.',
      'No lot-to-lot calibration verification process.',
    ],
    citations: [
      { label: 'CLSI immunoassay interference guidance (I/LA series)', source: 'CLSI' },
      { label: 'IFCC working groups on immunoassay standardization', source: 'IFCC' },
    ],
    related: ['sci.ivd.interference', 'bio.troponin', 'bio.tsh', 'fda.ivd.clia-categorization'],
    tags: ['immunoassay', 'elisa', 'clia-eclia', 'hook-effect', 'biotin', 'hama'],
    lastReviewed: '2026-06-09',
  },
];
