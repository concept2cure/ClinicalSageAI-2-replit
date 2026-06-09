/**
 * Standardization, harmonization, and quality-control science corpus.
 *
 * The metrology and quality infrastructure that makes IVD results comparable and
 * trustworthy across labs and time: reference-system harmonization (IFCC/JCTLM,
 * NGSP, CDC LSP), statistical QC (Westgard, Levey-Jennings, Six Sigma),
 * individualized QC plans (IQCP), and external quality assessment / proficiency
 * testing.
 */

import type { KnowledgeEntry } from '../types';

export const STANDARDIZATION_QC_KNOWLEDGE: KnowledgeEntry[] = [
  {
    id: 'sci.ivd.harmonization-jctlm',
    domain: 'scientific',
    topic: 'standardization',
    title: 'Reference-system harmonization — JCTLM, IFCC, and method standardization',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'Result comparability across methods/labs depends on a reference-measurement system: higher-order reference measurement procedures (RMPs) and certified reference materials (CRMs) listed by the JCTLM, organized by IFCC, to which manufacturers standardize calibrators (the operational side of ISO 17511).',
    detail:
      'Harmonization ensures a result means the same thing regardless of method. The Joint Committee for Traceability in Laboratory Medicine (JCTLM) maintains databases of approved higher-order reference measurement procedures, certified reference materials, and reference measurement services; the IFCC coordinates reference systems and harmonization programs for analytes lacking a true reference method (consensus harmonization). Manufacturers anchor their calibrator value-assignment to these higher-order references (ISO 17511), and where no RMP/CRM exists, harmonization proceeds via commutable panels and consensus target values. This infrastructure underpins guideline thresholds (e.g., HbA1c, lipids, creatinine) being portable across assays.',
    keyPoints: [
      'JCTLM lists approved RMPs, CRMs, and reference measurement services.',
      'IFCC coordinates reference systems + consensus harmonization where no RMP exists.',
      'Manufacturers standardize calibrators to these references (ISO 17511).',
      'Enables guideline cut-offs to be portable across methods.',
    ],
    citations: [
      { label: 'JCTLM database (RMPs/CRMs/services)', source: 'JCTLM/BIPM' },
      { label: 'IFCC reference systems and harmonization', source: 'IFCC' },
      { label: 'ISO 17511:2020', source: 'ISO' },
    ],
    related: ['sci.ivd.traceability', 'std.iso-17511', 'bio.hba1c', 'bio.kidney-function'],
    tags: ['harmonization', 'jctlm', 'ifcc', 'standardization', 'reference-method'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'sci.ivd.statistical-qc',
    domain: 'scientific',
    topic: 'quality-control',
    title: 'Statistical quality control — Levey-Jennings and Westgard multirules',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'Internal QC monitors assay stability by running control materials and charting results on Levey-Jennings plots, applying Westgard multirules (e.g., 1₃ₛ, 2₂ₛ, R₄ₛ, 4₁ₛ, 10ₓ) to detect random and systematic error while limiting false rejection.',
    detail:
      'Internal QC detects out-of-control performance before patient results are released. Control values are plotted on Levey-Jennings charts (mean ± SD), and Westgard multirules combine control limits to balance error detection against false-rejection: 1₂ₛ as a warning; 1₃ₛ and R₄ₛ catch random error; 2₂ₛ, 4₁ₛ, and 10ₓ catch systematic error/shift. The QC design (number of control levels, rules, run frequency) should be matched to the assay\'s analytical quality relative to the allowable total error — the basis of risk-based and Six-Sigma QC planning. CLSI C24 provides the framework for statistical QC.',
    keyPoints: [
      'Levey-Jennings charts + Westgard multirules detect random vs systematic error.',
      'Rule selection balances error detection against false rejection.',
      'QC design should match assay quality to the allowable total error (CLSI C24).',
    ],
    citations: [
      { label: 'CLSI C24 (statistical quality control)', source: 'CLSI' },
      { label: 'Westgard multirule QC', source: 'Westgard' },
    ],
    related: ['sci.ivd.six-sigma', 'sci.ivd.iqcp', 'sci.ivd.precision'],
    tags: ['qc', 'westgard', 'levey-jennings', 'multirule', 'clsi-c24'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'sci.ivd.six-sigma',
    domain: 'scientific',
    topic: 'quality-control',
    title: 'Six Sigma metrics for assay quality (sigma metric, TEa)',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'The sigma metric — (allowable total error − bias) / imprecision (in %), σ = (TEa − |bias|)/CV — quantifies analytical quality on a defect scale; higher sigma permits simpler QC (fewer rules/controls), lower sigma demands more.',
    detail:
      'Six-Sigma applied to laboratory medicine expresses assay performance against the allowable total error (TEa) defined by biological variation, regulatory/EQA criteria, or clinical needs. The sigma metric σ = (TEa% − |bias%|) / CV% places an assay on a quality scale where ≥6 is world-class and <3 is problematic. Sigma directly informs QC design: high-sigma assays tolerate single-rule, low-N QC, while low-sigma assays need multirule, higher-N QC or method improvement. This links precision/bias estimates (EP05/EP09) to a defensible, risk-based QC strategy.',
    keyPoints: [
      'σ = (TEa% − |bias%|) / CV%; ≥6 excellent, <3 poor.',
      'TEa sourced from biological variation / regulatory / clinical goals.',
      'Sigma drives QC design (rules, control N, frequency).',
    ],
    criteria: [
      { metric: 'World-class', typical: 'σ ≥ 6' },
      { metric: 'Acceptable', typical: 'σ ≈ 4–6' },
      { metric: 'Problematic', typical: 'σ < 3 (improve method or intensify QC)' },
    ],
    citations: [
      { label: 'Six Sigma quality management in the medical laboratory', source: 'Westgard/CLSI' },
    ],
    related: ['sci.ivd.statistical-qc', 'sci.ivd.precision', 'sci.ivd.method-comparison'],
    tags: ['six-sigma', 'sigma-metric', 'tea', 'quality'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'sci.ivd.iqcp',
    domain: 'scientific',
    topic: 'quality-control',
    title: 'Individualized Quality Control Plan (IQCP) — risk-based QC under CLIA',
    jurisdictions: ['US'],
    appliesTo: ['ivd'],
    summary:
      'IQCP is the CMS/CLIA option allowing a laboratory to design a risk-based QC plan (beyond the default 2-levels-per-day) based on a risk assessment, a QC plan, and a quality assessment program — used especially for unitized/POC devices with built-in controls.',
    detail:
      'Under CLIA, the default QC is two levels of external control per day, but CMS permits an Individualized Quality Control Plan (IQCP) as an alternative for many non-waived tests. IQCP has three parts: a Risk Assessment (evaluating the testing process — specimen, environment, reagent, test system, personnel — for sources of error), a Quality Control Plan (the controls, electronic/internal procedural controls, and frequency that mitigate identified risks), and a Quality Assessment program (ongoing monitoring/review). IQCP is particularly relevant to point-of-care and cartridge-based systems whose internal controls can substitute for some external QC when justified by the risk assessment. It aligns CLIA QC with ISO 14971-style risk management (CLSI EP23 provides the methodology).',
    keyPoints: [
      'CLIA risk-based QC alternative to default 2-levels/day.',
      'Three parts: Risk Assessment + QC Plan + Quality Assessment.',
      'Common for POC/cartridge systems with internal controls.',
      'Risk methodology per CLSI EP23 (ISO 14971-aligned).',
    ],
    citations: [
      { label: 'CMS CLIA IQCP policy', source: 'CMS' },
      { label: 'CLSI EP23 (laboratory QC based on risk management)', source: 'CLSI' },
    ],
    related: ['sci.ivd.statistical-qc', 'fda.ivd.clia-categorization', 'std.iso-14971'],
    tags: ['iqcp', 'clia', 'risk-based-qc', 'point-of-care', 'ep23'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'sci.ivd.eqa-pt',
    domain: 'scientific',
    topic: 'quality-control',
    title: 'External quality assessment (EQA) / proficiency testing (PT)',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'EQA/PT programs send blinded samples to participating labs and compare results against peers/targets, providing independent evidence of accuracy and inter-laboratory comparability; in the US, PT is mandatory under CLIA for regulated analytes.',
    detail:
      'External quality assessment (EQA), known as proficiency testing (PT) in the US, is an inter-laboratory comparison in which an external provider distributes blinded specimens; each lab tests them as routine samples and the provider scores results against a target value or peer group. EQA is a pillar of laboratory accreditation (ISO 15189) and, in the US, CLIA mandates PT for "regulated analytes" with defined acceptance criteria and consequences for failure. Commutable EQA materials with reference-method target values also support assay harmonization monitoring. For IVD manufacturers, EQA performance is real-world evidence of field accuracy and a useful post-market performance-monitoring input.',
    keyPoints: [
      'Blinded inter-lab comparison scored vs target/peer (EQA = PT).',
      'Pillar of ISO 15189 accreditation; CLIA-mandatory for regulated analytes in the US.',
      'Commutable EQA with reference targets monitors harmonization.',
      'EQA results are real-world post-market performance evidence.',
    ],
    citations: [
      { label: 'CLIA proficiency testing requirements (42 CFR 493 subpart H)', source: 'CMS' },
      { label: 'ISO 15189 / ISO 17043 (proficiency testing providers)', source: 'ISO' },
    ],
    related: ['std.iso-15189', 'sci.ivd.harmonization-jctlm', 'eu.ivdr.pms-pmpf'],
    tags: ['eqa', 'proficiency-testing', 'clia', 'iso-17043', 'inter-laboratory'],
    lastReviewed: '2026-06-09',
  },
];
