/**
 * Regulatory work-package compiler (MDX-PM-02).
 *
 * A pure, deterministic plan generator. Given the effective industry context
 * (specialization + regulatory pathways + target markets) it compiles the
 * standard device / IVD regulatory work-package set into a single, coherent
 * plan: strategy → design controls → risk → evidence (bench / analytical /
 * clinical) → software & cybersecurity → labeling → quality & manufacturing →
 * submission assembly → authority review → registration & UDI → postmarket.
 *
 * Two properties make this a *compiler* rather than a lookup table:
 *
 *  1. Tailoring — which packages and deliverables appear is driven by the
 *     specialization. An IVD program gets analytical + clinical *performance*
 *     packages; a SaMD program gets a software & cybersecurity package with
 *     the FDA-2023 emphasis; a physical device gets bench performance testing.
 *
 *  2. Shared-evidence reuse — when the pathways span multiple filings that lean
 *     on the same evidence (e.g. a dual 510(k)/CLIA program that also files an
 *     EU IVDR technical documentation), the compiler produces ONE combined
 *     plan. The shared analytical / clinical evidence packages appear once,
 *     with their `filingSectionsSupported` and `applicableMarkets` unioned
 *     across every filing that consumes them — never duplicated per filing.
 *
 * This module has zero runtime side effects and no I/O; it is safe to import
 * from a route handler, a worker, or a test.
 */

/* ─── Public types ────────────────────────────────────────────────── */

export interface WorkPackage {
  /** Stable identifier; also the dedupe key across pathways. */
  id: string;
  title: string;
  /** Why this package exists in regulatory terms. */
  regulatoryPurpose: string;
  /** Accountable function in the plan, never an assigned person or access grant. */
  ownerDiscipline: string;
  contributors: string[];
  /** Stated applicability, including unresolved conditional work. */
  applicability: string;
  /** Markets whose filings this package supports (unioned across pathways). */
  applicableMarkets: string[];
  /** Filing sections this package's evidence feeds, tagged by filing code. */
  filingSectionsSupported: string[];
  deliverables: string[];
  acceptanceCriteria: string[];
  /** Other work-package ids this one depends on (kept in-plan only). */
  dependsOn: string[];
}

export type Specialization =
  | 'medical_device'
  | 'ivd_diagnostics'
  | 'both'
  | 'samd'
  | 'companion_diagnostic'
  | 'combination_product'
  | null;

export interface CompileWorkPackagesInput {
  specialization: Specialization;
  pathways: string[];
  markets: string[];
  /** Unrecorded/null differs from an explicitly recorded empty selection. */
  deviceFlags?: readonly string[] | null;
}

/* ─── Package ids ─────────────────────────────────────────────────── */

const PKG = {
  strategy: 'regulatory-strategy',
  designControls: 'design-controls',
  riskManagement: 'risk-management',
  benchPerformance: 'bench-performance-testing',
  analyticalPerformance: 'analytical-performance',
  softwareCyber: 'software-cybersecurity',
  humanFactors: 'human-factors-usability',
  electrical: 'electrical-safety-emc',
  biocompatibility: 'biocompatibility',
  sterility: 'sterilization-microbiology',
  clinicalEvidence: 'clinical-evidence',
  clinicalPerformance: 'clinical-performance',
  performanceEvaluation: 'performance-evaluation',
  medicalWriting: 'medical-writing',
  labeling: 'labeling',
  quality: 'quality-manufacturing',
  manufacturing: 'manufacturing-transfer',
  submissionAssembly: 'submission-assembly',
  authorityReview: 'authority-review',
  registrationUdi: 'registration-udi',
  postmarket: 'postmarket',
} as const;

type PkgId = (typeof PKG)[keyof typeof PKG];

/* ─── Filing normalization ────────────────────────────────────────── */

/**
 * Canonical filing codes the compiler reasons about. A single stored pathway
 * token can expand to several (a dual program), which is what lets shared
 * evidence be unioned rather than duplicated.
 */
type FilingCode = '510k' | 'de_novo' | 'pma' | 'clia' | 'ivdr' | 'mdr';

const FILING_MARKET: Record<FilingCode, string> = {
  '510k': 'US',
  de_novo: 'US',
  pma: 'US',
  clia: 'US',
  ivdr: 'EU',
  mdr: 'EU',
};

/**
 * Normalize a raw stored pathway token (case/format tolerant) into zero or
 * more canonical filing codes. Unknown tokens contribute nothing rather than
 * throwing, so a new or free-text pathway degrades gracefully.
 */
function normalizePathway(raw: string): FilingCode[] {
  const t = raw.trim().toLowerCase().replace(/[\s()]/g, '');
  const technicalDocumentAliases: Record<string, FilingCode> = { ivdr_td: 'ivdr', mdr_td: 'mdr' };
  if (technicalDocumentAliases[t]) return [technicalDocumentAliases[t]];
  switch (t) {
    case 'dual_510k_clia':
    case '510k_clia':
      return ['510k', 'clia'];
    case '510k':
    case 'k510':
    case 'estar':
    case 'traditional510k':
    case 'special510k':
    case 'abbreviated510k':
      return ['510k'];
    case 'de_novo':
    case 'denovo':
      return ['de_novo'];
    case 'pma':
      return ['pma'];
    case 'clia':
    case 'clia_waiver':
    case 'cliawaiver':
    case 'ldt':
      return ['clia'];
    case 'ivdr':
    case 'eu_ivdr':
      return ['ivdr'];
    case 'mdr':
    case 'eu_mdr':
    case 'cer':
      return ['mdr'];
    default:
      return [];
  }
}

/** Distinct, order-preserving filing codes implied by the input pathways. */
function activeFilings(pathways: string[]): FilingCode[] {
  const seen = new Set<FilingCode>();
  const out: FilingCode[] = [];
  for (const p of pathways) {
    for (const f of normalizePathway(p)) {
      if (!seen.has(f)) {
        seen.add(f);
        out.push(f);
      }
    }
  }
  return out;
}

/* ─── Filing → section map ────────────────────────────────────────────
 * For each filing, the section(s) a given package's evidence supports. This is
 * where shared evidence gets its provenance: analytical-performance carries a
 * distinct section string per filing, and the compiler unions them onto the one
 * package. Entries are tagged "<FILING>: <section>" so the union is readable and
 * self-documenting. */

const FILING_SECTIONS: Record<FilingCode, Partial<Record<PkgId, string[]>>> = {
  '510k': {
    [PKG.strategy]: ['510k: Substantial equivalence rationale'],
    [PKG.designControls]: ['510k: Device description'],
    [PKG.riskManagement]: ['510k: Risk analysis summary'],
    [PKG.benchPerformance]: ['510k: Performance testing – bench'],
    [PKG.analyticalPerformance]: ['510k: Performance testing – analytical'],
    [PKG.softwareCyber]: ['510k: Software/firmware documentation', '510k: Cybersecurity'],
    [PKG.clinicalEvidence]: ['510k: Performance testing – clinical'],
    [PKG.clinicalPerformance]: ['510k: Performance testing – clinical'],
    [PKG.labeling]: ['510k: Labeling'],
    [PKG.quality]: ['510k: Quality and controlled evidence records'],
    [PKG.sterility]: ['510k: Sterilization / packaging / shelf life'],
    [PKG.electrical]: ['510k: Electrical safety / EMC'],
    [PKG.biocompatibility]: ['510k: Biocompatibility'],
    [PKG.humanFactors]: ['510k: Human factors / usability'],
    [PKG.medicalWriting]: ['510k: Summary and substantial equivalence comparison'],
    [PKG.manufacturing]: ['510k: Manufacturing information where applicable'],
    [PKG.submissionAssembly]: ['510k: eSTAR assembly'],
  },
  de_novo: {
    [PKG.strategy]: ['de_novo: Classification & special controls rationale'],
    [PKG.designControls]: ['de_novo: Device description'],
    [PKG.riskManagement]: ['de_novo: Benefit-risk & special controls'],
    [PKG.benchPerformance]: ['de_novo: Non-clinical performance'],
    [PKG.analyticalPerformance]: ['de_novo: Analytical performance'],
    [PKG.softwareCyber]: ['de_novo: Software documentation', 'de_novo: Cybersecurity'],
    [PKG.clinicalEvidence]: ['de_novo: Clinical performance'],
    [PKG.clinicalPerformance]: ['de_novo: Clinical performance'],
    [PKG.labeling]: ['de_novo: Labeling'],
    [PKG.quality]: ['de_novo: Manufacturing / sterility'],
    [PKG.sterility]: ['de_novo: Sterilization / shelf life'],
    [PKG.electrical]: ['de_novo: Electrical safety / EMC'],
    [PKG.biocompatibility]: ['de_novo: Biocompatibility'],
    [PKG.humanFactors]: ['de_novo: Human factors / usability'],
    [PKG.medicalWriting]: ['de_novo: Classification and benefit-risk narrative'],
    [PKG.manufacturing]: ['de_novo: Manufacturing information'],
    [PKG.submissionAssembly]: ['de_novo: Request assembly'],
  },
  pma: {
    [PKG.strategy]: ['pma: Regulatory history & indications'],
    [PKG.designControls]: ['pma: Device description & principles of operation'],
    [PKG.riskManagement]: ['pma: Risk analysis'],
    [PKG.benchPerformance]: ['pma: Nonclinical laboratory studies'],
    [PKG.analyticalPerformance]: ['pma: Nonclinical laboratory studies'],
    [PKG.softwareCyber]: ['pma: Software & cybersecurity'],
    [PKG.clinicalEvidence]: ['pma: Clinical investigations'],
    [PKG.clinicalPerformance]: ['pma: Clinical investigations'],
    [PKG.labeling]: ['pma: Labeling'],
    [PKG.quality]: ['pma: Quality system records (QMSR)'],
    [PKG.manufacturing]: ['pma: Manufacturing information'],
    [PKG.sterility]: ['pma: Sterility / packaging / shelf life'],
    [PKG.electrical]: ['pma: Electrical safety / EMC'],
    [PKG.biocompatibility]: ['pma: Biocompatibility'],
    [PKG.humanFactors]: ['pma: Human factors / usability'],
    [PKG.medicalWriting]: ['pma: Safety and effectiveness narrative'],
    [PKG.submissionAssembly]: ['pma: Modular / traditional assembly'],
  },
  clia: {
    [PKG.strategy]: ['clia: Complexity categorization rationale'],
    [PKG.riskManagement]: ['clia: Risk assessment (CLSI EP23)'],
    [PKG.analyticalPerformance]: ['clia: Establishment of performance specifications'],
    [PKG.clinicalPerformance]: ['clia: Method comparison / accuracy'],
    [PKG.labeling]: ['clia: Procedure manual / IFU'],
    [PKG.quality]: ['clia: Quality control plan'],
    [PKG.humanFactors]: ['clia: Intended-user / use-error evidence where applicable'],
    [PKG.medicalWriting]: ['clia: Performance and procedure narratives'],
    [PKG.submissionAssembly]: ['clia: Validation dossier assembly'],
  },
  ivdr: {
    [PKG.strategy]: ['ivdr: Classification (Annex VIII) & intended purpose'],
    [PKG.designControls]: ['ivdr: Device description & GSPR mapping'],
    [PKG.riskManagement]: ['ivdr: Risk management (Annex I)'],
    [PKG.analyticalPerformance]: ['ivdr: Analytical performance report'],
    [PKG.softwareCyber]: ['ivdr: Software lifecycle & IT security'],
    [PKG.clinicalPerformance]: ['ivdr: Clinical performance & scientific validity report'],
    [PKG.performanceEvaluation]: ['ivdr: Performance evaluation report (Annex XIII)'],
    [PKG.humanFactors]: ['ivdr: Usability / use-related risk'],
    [PKG.electrical]: ['ivdr: Applicable electrical safety / EMC'],
    [PKG.biocompatibility]: ['ivdr: Applicable biological safety'],
    [PKG.sterility]: ['ivdr: Applicable sterility / packaging / stability'],
    [PKG.medicalWriting]: ['ivdr: Performance evaluation and technical narratives'],
    [PKG.manufacturing]: ['ivdr: Design and manufacturing information'],
    [PKG.labeling]: ['ivdr: Labeling & IFU (Annex I ch. III)'],
    [PKG.quality]: ['ivdr: Manufacturing & QMS (ISO 13485)'],
    [PKG.submissionAssembly]: ['ivdr: Technical documentation (Annex II/III)'],
  },
  mdr: {
    [PKG.strategy]: ['mdr: Classification (Annex VIII) & intended purpose'],
    [PKG.designControls]: ['mdr: Device description & GSPR mapping'],
    [PKG.riskManagement]: ['mdr: Risk management (Annex I)'],
    [PKG.benchPerformance]: ['mdr: Bench & preclinical verification'],
    [PKG.softwareCyber]: ['mdr: Software lifecycle & IT security (MDCG 2019-16)'],
    [PKG.clinicalEvidence]: ['mdr: Clinical evaluation report (CER)'],
    [PKG.humanFactors]: ['mdr: Usability / use-related risk'],
    [PKG.electrical]: ['mdr: Electrical safety / EMC'],
    [PKG.biocompatibility]: ['mdr: Biological safety'],
    [PKG.sterility]: ['mdr: Applicable sterility / packaging / shelf life'],
    [PKG.medicalWriting]: ['mdr: CER and technical-documentation narratives'],
    [PKG.manufacturing]: ['mdr: Design and manufacturing information'],
    [PKG.labeling]: ['mdr: Labeling & IFU (Annex I ch. III)'],
    [PKG.quality]: ['mdr: Manufacturing & QMS (ISO 13485)'],
    [PKG.submissionAssembly]: ['mdr: Technical documentation (Annex II/III)'],
  },
};

/* ─── Specialization → package selection ──────────────────────────────
 * Which of the standard packages are in scope for each specialization. The
 * lifecycle scaffolding (strategy, risk, labeling, quality, assembly, review,
 * registration, postmarket) is universal; the evidence packages vary. */

function wantsDeviceClinicalEvidence(spec: Specialization, filings: FilingCode[], wantsBench: boolean): boolean {
  if (filings.includes('mdr')) return true;
  const diagnosticOnly: Specialization[] = ['ivd_diagnostics', 'companion_diagnostic'];
  if (diagnosticOnly.includes(spec)) return false;
  return wantsBench || spec === 'samd' || filings.includes('pma');
}

function isMdrEvaluationOnly(filings: FilingCode[]): boolean {
  return filings.length === 1 && filings[0] === 'mdr';
}

function selectPackageIds(spec: Specialization, filings: FilingCode[], flags: readonly string[] | null | undefined): PkgId[] {
  const physicalTypes: Specialization[] = ['medical_device', 'both', 'combination_product', 'companion_diagnostic', null];
  const assayTypes: Specialization[] = ['ivd_diagnostics', 'both', 'companion_diagnostic'];
  const wantsBench = physicalTypes.includes(spec);
  const wantsAnalytical = assayTypes.includes(spec) || filings.includes('ivdr');
  const hasRequiredEvaluation = filings.some(f => ['mdr', 'pma'].includes(f));
  const wantsClinicalEvidence = wantsDeviceClinicalEvidence(spec, filings, wantsBench);
  const hasClinical = hasRequiredEvaluation || !filings.includes('510k') || flags == null || flags.includes('clinicalData');
  const hasSoftware = spec === 'samd' || flags == null || flags.some(flag => ['softwareAiMl', 'cyberDevice'].includes(flag));
  const selected: [PkgId, boolean][] = [
    [PKG.strategy, true], [PKG.designControls, true], [PKG.riskManagement, true], [PKG.humanFactors, true],
    [PKG.benchPerformance, wantsBench], [PKG.analyticalPerformance, wantsAnalytical],
    [PKG.electrical, spec !== 'samd'], [PKG.biocompatibility, spec !== 'samd'],
    [PKG.sterility, flags == null || flags.includes('sterile')], [PKG.softwareCyber, hasSoftware],
    [PKG.clinicalEvidence, wantsClinicalEvidence && hasClinical], [PKG.clinicalPerformance, wantsAnalytical],
    [PKG.performanceEvaluation, filings.includes('ivdr')], [PKG.medicalWriting, true], [PKG.labeling, true],
    [PKG.quality, true], [PKG.manufacturing, true], [PKG.submissionAssembly, true], [PKG.authorityReview, true],
    [PKG.registrationUdi, true], [PKG.postmarket, true],
  ];
  const ids = selected.filter(([, include]) => include).map(([id]) => id);
  return isMdrEvaluationOnly(filings)
    ? [PKG.strategy, PKG.clinicalEvidence, ...ids.filter(id => id !== PKG.strategy && id !== PKG.clinicalEvidence)]
    : ids;
}

/* ─── Base package definitions ────────────────────────────────────────
 * The spec-independent skeleton: purpose, deliverables, acceptance, deps.
 * Specialization tailoring layers extra deliverables on top (below). */

interface BasePackage {
  title: string;
  regulatoryPurpose: string;
  deliverables: string[];
  acceptanceCriteria: string[];
  dependsOn: PkgId[];
}

const BASE_PACKAGES: Record<PkgId, BasePackage> = {
  [PKG.strategy]: {
  title: 'Regulatory strategy',
  regulatoryPurpose:
    'Fix the intended purpose, classification, and filing route(s) before evidence is generated.',
  deliverables: [
    'Intended-use / indications statement',
    'Classification & predicate/comparator analysis',
    'Regulatory pathway plan and filing timeline',
  ],
  acceptanceCriteria: [
    'Classification and pathway agreed and documented',
    'Predicate / comparator or novelty basis justified',
  ],
  dependsOn: [],
},
  [PKG.designControls]: {
  title: 'Design controls',
  regulatoryPurpose:
    'Establish design inputs, outputs, verification, and traceability under the QMS design-control process.',
  deliverables: [
    'Design & development plan',
    'Design inputs / outputs with traceability matrix',
    'Design verification protocols and reports',
    'Design history file (DHF) index',
  ],
  acceptanceCriteria: [
    'Every design input traces to an output and a verification',
    'Design reviews recorded at defined stages',
  ],
  dependsOn: [PKG.strategy],
},
  [PKG.riskManagement]: {
  title: 'Risk management',
  regulatoryPurpose:
    'Identify, evaluate, and control hazards across the lifecycle per ISO 14971.',
  deliverables: [
    'Risk management plan',
    'Hazard analysis / FMEA',
    'Risk control measures and verification of effectiveness',
    'Risk management report with benefit-risk conclusion',
  ],
  acceptanceCriteria: [
    'All identified hazards have controls with verified effectiveness',
    'Residual risk judged acceptable against benefit',
  ],
  dependsOn: [PKG.designControls],
},
  [PKG.benchPerformance]: {
  title: 'Bench & performance testing',
  regulatoryPurpose:
    'Demonstrate non-clinical performance, safety, and reliability of the physical device.',
  deliverables: [
    'Bench test plan and protocols',
    'Applicable recognized consensus standards and justified test methods',
    'Bench performance test reports',
  ],
  acceptanceCriteria: [
    'All bench acceptance criteria met with signed reports',
    'Test article traceable to design outputs',
  ],
  dependsOn: [PKG.designControls, PKG.riskManagement],
},
  [PKG.analyticalPerformance]: {
  title: 'Analytical performance evidence',
  regulatoryPurpose:
    'Establish analytical validity of the assay — the shared analytical evidence reused across every filing.',
  deliverables: [
    'Analytical performance plan',
    'Precision / reproducibility studies (CLSI EP05)',
    'Accuracy / method comparison (CLSI EP09)',
    'Limit of detection, linearity, interference and cross-reactivity studies',
    'Reagent and specimen stability studies',
    'Analytical performance report',
  ],
  acceptanceCriteria: [
    'Performance claims supported by pre-specified acceptance criteria',
    'Studies executed on final assay configuration',
  ],
  dependsOn: [PKG.designControls, PKG.riskManagement],
},
  [PKG.softwareCyber]: {
  title: 'Software & cybersecurity',
  regulatoryPurpose:
    'Document the software lifecycle and applicable cybersecurity evidence; statutory §524B requirements apply to cyber devices.',
  deliverables: [
    'Software description and documentation-level determination',
    'Software requirements & architecture',
    'Verification & validation records',
    'Software bill of materials (SBOM) and §524B evidence when applicable to a cyber device',
    'Cybersecurity risk assessment and threat model where applicable',
  ],
  acceptanceCriteria: [
    'IEC 62304 safety classification and FDA software documentation level separately justified',
    'Applicable cybersecurity controls verified; SBOM current when required',
  ],
  dependsOn: [PKG.designControls, PKG.riskManagement],
},
  [PKG.humanFactors]: {
  title: 'Human factors & usability',
  regulatoryPurpose: 'Address use-related risk and usability validation through the IEC 62366-1 engineering process.',
  deliverables: ['Use specification, users and use environments', 'Use-related risk analysis and critical tasks',
    'Formative usability evaluations', 'Usability validation protocol and report, or justified applicability rationale'],
  acceptanceCriteria: ['Critical tasks and use errors traced to the risk file', 'Validation covers intended users, environments and final labeling'],
  dependsOn: [PKG.designControls, PKG.riskManagement],
},
  [PKG.electrical]: {
  title: 'Electrical safety & EMC',
  regulatoryPurpose: 'Establish applicable electrical safety and electromagnetic compatibility evidence for powered equipment.',
  deliverables: ['Power/equipment applicability assessment and applicable standards',
    'Electrical safety and EMC protocols and outside-laboratory reports (IEC 60601 or applicable IVD equipment standards)',
    'Test-article configuration, deviations and disposition'],
  acceptanceCriteria: ['Applicable standards and editions justified for the equipment', 'Results assessed against predefined criteria and linked to the tested configuration'],
  dependsOn: [PKG.designControls, PKG.riskManagement],
},
  [PKG.biocompatibility]: {
  title: 'Biocompatibility & materials',
  regulatoryPurpose: 'Evaluate biological safety from material composition and nature/duration of patient contact under ISO 10993.',
  deliverables: ['Materials and patient-contact characterization', 'Biological evaluation plan and endpoint justifications',
    'Applicable laboratory reports and biological evaluation report'],
  acceptanceCriteria: ['Endpoints addressed by suitable evidence or documented justification', 'Materials, processing and final test articles are traceable'],
  dependsOn: [PKG.designControls, PKG.riskManagement],
},
  [PKG.sterility]: {
  title: 'Sterilization & microbiology',
  regulatoryPurpose: 'Support applicable sterile claims and microbiological safety through validated processes, packaging and shelf life.',
  deliverables: ['Sterilization validation and microbiological evidence, including endotoxin limits where applicable',
    'Packaging and sterile-barrier validation', 'Shelf-life and accelerated/real-time aging evidence',
    'Method-specific residuals and reprocessing instructions where applicable'],
  acceptanceCriteria: ['Sterile claim and applicable microbiological limits supported by validated evidence',
    'Worst-case product/load and packaging integrity over claimed shelf life justified'],
  dependsOn: [PKG.designControls, PKG.riskManagement],
},
  [PKG.clinicalEvidence]: {
  title: 'Clinical evidence',
  regulatoryPurpose:
    'Provide clinical data or a clinical evaluation demonstrating safety and effectiveness.',
  deliverables: [
    'Clinical evaluation / investigation plan',
    'Clinical study reports or literature-based evaluation',
    'Benefit-risk clinical conclusion',
  ],
  acceptanceCriteria: [
    'Clinical claims supported by adequate, attributable data',
    'Clinical conclusion consistent with the risk file',
  ],
  // Evaluation planning proceeds alongside engineering; reports reuse its evidence.
  dependsOn: [PKG.designControls, PKG.riskManagement],
},
  [PKG.clinicalPerformance]: {
  title: 'Clinical performance evidence',
  regulatoryPurpose:
    'Establish clinical performance of the assay — shared clinical evidence reused across filings.',
  deliverables: [
    'Clinical performance study plan',
    'Method-comparison studies against the justified reference method',
    'Diagnostic sensitivity / specificity studies',
    'Reference intervals and statistical uncertainty where applicable',
    'Clinical performance report',
  ],
  acceptanceCriteria: [
    'Clinical performance claims met against pre-specified criteria',
    'Comparator, intended population and statistical methods justified',
  ],
  dependsOn: [PKG.analyticalPerformance, PKG.riskManagement],
},
  [PKG.performanceEvaluation]: {
  title: 'Performance evaluation report (PER)',
  regulatoryPurpose: 'Integrate scientific validity, analytical performance and clinical performance under EU IVDR Annex XIII.',
  deliverables: ['Performance evaluation plan', 'Scientific validity report and systematic literature appraisal',
    'Integrated analytical performance and clinical performance evidence assessment',
    'PER benefit-risk conclusion and Annex I GSPR links', 'Qualified evaluator review and PMPF plan/update cycle'],
  acceptanceCriteria: ['All three evidence pillars support the intended purpose and claims',
    'Gaps, evidence quality and benefit-risk assessed; PMPF updates linked to the PER'],
  dependsOn: [PKG.analyticalPerformance, PKG.clinicalPerformance, PKG.riskManagement],
},
  [PKG.medicalWriting]: {
  title: 'Medical writing',
  regulatoryPurpose: 'Turn attributable technical and clinical evidence into consistent, reviewable submission narratives.',
  deliverables: ['Evidence-linked narrative documents and comparison tables', 'Consistent terminology, claims, labeling and IFU cross-check'],
  acceptanceCriteria: ['Claims trace to approved evidence and unresolved gaps remain explicit', 'Technical owners and designated reviewers review their contributions'],
  dependsOn: [PKG.designControls, PKG.riskManagement, PKG.benchPerformance, PKG.analyticalPerformance,
    PKG.clinicalEvidence, PKG.clinicalPerformance, PKG.performanceEvaluation],
},
  [PKG.labeling]: {
  title: 'Labeling',
  regulatoryPurpose:
    'Produce compliant labels, IFU, and market-specific labeling content.',
  deliverables: [
    'Label and instructions-for-use (IFU) drafts',
    'Symbols and UDI carrier layout',
    'Market-specific labeling and translations',
  ],
  acceptanceCriteria: [
    'Labeling reflects verified performance and approved claims',
    'Market-specific labeling requirements satisfied',
  ],
  dependsOn: [PKG.designControls, PKG.riskManagement],
},
  [PKG.quality]: {
  title: 'Quality assurance & document control',
  regulatoryPurpose:
    'Maintain controlled quality records, design controls and audit traceability under QMSR / ISO 13485.',
  deliverables: [
    'QMS documentation (QMSR / ISO 13485)',
    'Document control, review and approval records',
    'DHF audit trail and supplier-control review',
  ],
  acceptanceCriteria: [
    'Controlled documents retain versions, review history and authorized approvals',
    'Design and production quality records remain attributable',
  ],
  dependsOn: [PKG.designControls],
},
  [PKG.manufacturing]: {
  title: 'Manufacturing & design transfer',
  regulatoryPurpose: 'Transfer the controlled design into reproducible manufacturing and maintain supplier/process controls.',
  deliverables: ['Design-transfer plan and records', 'Process validation (IQ/OQ/PQ) where required',
    'Manufacturing specifications and production controls', 'Supplier qualification and control inputs'],
  acceptanceCriteria: ['Design outputs transferred to controlled production specifications',
    'Required process validations and supplier controls documented'],
  dependsOn: [PKG.designControls, PKG.quality],
},
  [PKG.submissionAssembly]: {
  title: 'Submission assembly',
  regulatoryPurpose:
    'Assemble the evidence into each filing’s required structure and validate completeness.',
  deliverables: [
    'Filing content plan mapped to sections',
    'Assembled submission package(s)',
    'Pre-submission validation / completeness checklist',
  ],
  acceptanceCriteria: [
    'Every required section populated from an accepted evidence package',
    'Submission passes technical / eValidation checks',
  ],
  // Evidence dependencies are added dynamically, then filtered to in-plan ids.
  dependsOn: [
    PKG.benchPerformance,
    PKG.analyticalPerformance,
    PKG.softwareCyber,
    PKG.clinicalEvidence,
    PKG.clinicalPerformance,
    PKG.performanceEvaluation,
    PKG.medicalWriting,
    PKG.humanFactors,
    PKG.electrical,
    PKG.biocompatibility,
    PKG.sterility,
    PKG.labeling,
    PKG.quality,
    PKG.manufacturing,
    PKG.riskManagement,
  ],
},
  [PKG.authorityReview]: {
  title: 'Authority review',
  regulatoryPurpose:
    'Manage the review interaction — deficiencies, additional-information requests, and responses.',
  deliverables: [
    'Submission tracking and correspondence log',
    'Deficiency / AI-request responses',
    'Review-meeting minutes and commitments',
  ],
  acceptanceCriteria: [
    'All authority questions answered within timelines',
    'Clearance / approval / certificate obtained',
  ],
  dependsOn: [PKG.submissionAssembly],
},
  [PKG.registrationUdi]: {
  title: 'Registration & UDI',
  regulatoryPurpose:
    'Complete establishment / device registration and UDI assignment in each market database.',
  deliverables: [
    'Establishment & device registration records',
    'UDI-DI assignment and database submission (GUDID / EUDAMED)',
    'Market-entry / importer documentation',
  ],
  acceptanceCriteria: [
    'Device registered and UDI records accepted in each market',
    'Registration data consistent with cleared labeling',
  ],
  dependsOn: [PKG.authorityReview],
},
  [PKG.postmarket]: {
  title: 'Postmarket surveillance',
  regulatoryPurpose:
    'Operate postmarket surveillance, vigilance, and periodic reporting obligations.',
  deliverables: [
    'Postmarket surveillance plan',
    'Complaint handling & vigilance / MDR reporting process',
    'Periodic safety update (PSUR / PMS report) schedule',
  ],
  acceptanceCriteria: [
    'Surveillance data collected and trended on schedule',
    'Reportable events filed within regulatory timelines',
  ],
  // Surveillance planning is premarket; collection/updates continue after placement.
  dependsOn: [PKG.strategy],
},
};

function basePackage(id: PkgId): BasePackage {
  return BASE_PACKAGES[id];
}

/* ─── Specialization-specific deliverable overlays ────────────────────
 * Additive, deterministic tailoring on top of the base skeleton. */

function specializationDeliverables(id: PkgId, spec: Specialization): string[] {
  if (spec === 'samd' && id === PKG.softwareCyber) {
    return [
      'Predetermined change control plan (PCCP) where applicable',
      'Documentation level (basic/enhanced) determination',
      'Interoperability and off-the-shelf software assessment',
    ];
  }
  if (spec === 'companion_diagnostic') {
    if (id === PKG.strategy) return ['Drug-device co-development / contemporaneous approval plan'];
    if (id === PKG.clinicalPerformance) return ['Clinical bridging study to the therapeutic trial population'];
  }
  if (spec === 'combination_product' && id === PKG.quality) {
    return ['Combination-product control strategy (21 CFR Part 4 / Article 117)'];
  }
  return [];
}

/** Functional ownership is guidance; staffing and approval authority stay in their governed stores. */
const PACKAGE_ROLES: Record<PkgId, { ownerDiscipline: string; contributors: string[] }> = {
  [PKG.strategy]: { ownerDiscipline: 'Regulatory Affairs', contributors: ['Medical Writing', 'R&D / Systems Engineering', 'Clinical Affairs'] },
  [PKG.designControls]: { ownerDiscipline: 'R&D / Systems Engineering', contributors: ['Mechanical / Electrical Engineering', 'Quality Assurance / Quality Systems', 'Risk Management'] },
  [PKG.riskManagement]: { ownerDiscipline: 'Risk Management', contributors: ['R&D / Systems Engineering', 'Clinical Affairs', 'Human Factors / Usability Engineering', 'Medical Writing'] },
  [PKG.benchPerformance]: { ownerDiscipline: 'V&V / Test Engineering', contributors: ['R&D / Systems Engineering', 'Specialist Laboratories', 'Quality Assurance / Quality Systems'] },
  [PKG.analyticalPerformance]: { ownerDiscipline: 'Assay Development', contributors: ['Laboratory Specialists', 'Biostatistics / Epidemiology', 'Quality Assurance / Quality Systems'] },
  [PKG.softwareCyber]: { ownerDiscipline: 'Software Engineering', contributors: ['Cybersecurity Specialists', 'V&V / Test Engineering', 'Risk Management'] },
  [PKG.humanFactors]: { ownerDiscipline: 'Human Factors / Usability Engineering', contributors: ['Risk Management', 'R&D / Systems Engineering', 'Medical Writing'] },
  [PKG.electrical]: { ownerDiscipline: 'Electrical Safety & EMC', contributors: ['Outside Testing Laboratory', 'Electrical Engineering', 'V&V / Test Engineering'] },
  [PKG.biocompatibility]: { ownerDiscipline: 'Biocompatibility & Materials', contributors: ['Specialist Laboratory', 'Materials Engineering', 'Risk Management'] },
  [PKG.sterility]: { ownerDiscipline: 'Sterilization & Microbiology', contributors: ['Specialist Laboratory', 'Packaging Engineering', 'Manufacturing / Operations'] },
  [PKG.clinicalEvidence]: { ownerDiscipline: 'Clinical Affairs', contributors: ['Qualified Lead Evaluator', 'Literature Specialists', 'Clinicians / Medical Experts', 'Biostatistics / Epidemiology', 'Regulatory Affairs', 'Post-Market Surveillance'] },
  [PKG.clinicalPerformance]: { ownerDiscipline: 'Clinical Performance / Medical Affairs', contributors: ['Laboratory Medicine', 'Biostatistics / Epidemiology', 'Assay Development'] },
  [PKG.performanceEvaluation]: { ownerDiscipline: 'Clinical Affairs', contributors: ['Qualified Performance Evaluator', 'Assay Development', 'Laboratory Medicine', 'Literature Specialists', 'Biostatistics / Epidemiology', 'Regulatory Affairs'] },
  [PKG.medicalWriting]: { ownerDiscipline: 'Medical Writing', contributors: ['Regulatory Affairs', 'Technical Authors', 'Clinical Affairs'] },
  [PKG.labeling]: { ownerDiscipline: 'Medical Writing', contributors: ['Regulatory Affairs', 'Risk Management', 'Human Factors / Usability Engineering'] },
  [PKG.quality]: { ownerDiscipline: 'Quality Assurance / Quality Systems', contributors: ['R&D / Systems Engineering', 'Document Control', 'Manufacturing / Operations'] },
  [PKG.manufacturing]: { ownerDiscipline: 'Manufacturing / Operations', contributors: ['Process Engineering', 'Supplier Quality', 'Quality Assurance / Quality Systems'] },
  [PKG.submissionAssembly]: { ownerDiscipline: 'Regulatory Operations / Publishing', contributors: ['Regulatory Affairs', 'Medical Writing', 'Quality Assurance / Quality Systems'] },
  [PKG.authorityReview]: { ownerDiscipline: 'Regulatory Affairs', contributors: ['Regulatory Operations / Publishing', 'Medical Writing', 'Technical Authors'] },
  [PKG.registrationUdi]: { ownerDiscipline: 'Regulatory Affairs', contributors: ['Manufacturing / Operations', 'Labeling Specialists', 'Quality Assurance / Quality Systems'] },
  [PKG.postmarket]: { ownerDiscipline: 'Post-Market Surveillance', contributors: ['Clinical Affairs', 'Risk Management', 'Regulatory Affairs', 'Quality Assurance / Quality Systems'] },
};

function filingDeliverables(id: PkgId, filings: FilingCode[]): string[] {
  const out: string[] = [];
  if (filings.includes('510k')) {
    if (id === PKG.strategy) out.push('FDA product code and regulation number; predicate selection of record',
      'Substantial equivalence argument and differences/evidence strategy', 'FDA Pre-Sub (Q-Sub) questions, feedback and commitments where needed');
    if (id === PKG.medicalWriting) out.push('510(k) summary and substantial equivalence comparison tables');
    if (id === PKG.submissionAssembly) out.push('Applicable official FDA eSTAR fields, attachments and technical validation');
  }
  if (filings.includes('mdr') || filings.includes('ivdr')) {
    if (id === PKG.strategy) out.push('EU conformity route and notified body relationship where applicable', 'Regulatory review of Annex I GSPR mapping and any equivalence claim');
    if (id === PKG.submissionAssembly) out.push('EU technical documentation assembly under Annexes II and III, including evaluation and PMS records');
  }
  if (filings.includes('mdr') && id === PKG.postmarket) out.push('PMCF plan and results feeding the living CER; periodic and event-driven clinical evaluation updates');
  if (filings.includes('ivdr') && id === PKG.postmarket) out.push('PMPF plan and findings feeding the PER; periodic and event-driven performance evaluation updates');
  return out;
}

function pathwayPackage(base: BasePackage, id: PkgId, filings: FilingCode[]): BasePackage {
  if (id === PKG.designControls && isMdrEvaluationOnly(filings)) return {
    ...base,
    title: 'Engineering inputs to clinical evaluation',
    regulatoryPurpose: 'Supply the existing approved device definition and engineering evidence to the clinical evaluation; identify changes and gaps without treating a CER as a fresh device-development project.',
    deliverables: ['Approved device description, intended purpose and evaluated configuration',
      'Relevant existing design and performance evidence with configuration/version references',
      'Technical and biological equivalence comparison tables supporting the clinical comparison where claimed',
      'Design changes, evidence-access limitations and engineering gaps affecting the evaluation'],
    acceptanceCriteria: ['Engineering inputs identify the device/version evaluated and remain consistent with labeling and the risk file',
      'Applicable approved evidence is attributable; gaps and changes are explicit for Clinical Affairs and the evaluator'],
  };
  if (id !== PKG.clinicalEvidence || !filings.includes('mdr')) return base;
  return {
    ...base,
    title: 'Clinical evaluation report (CER)',
    regulatoryPurpose: 'Clinically evaluate the EU MDR device through planned evidence identification, appraisal and synthesis, with qualified evaluator oversight.',
    deliverables: ['Clinical evaluation plan and qualified lead evaluator expertise/qualifications',
      'Systematic literature search protocol, search records and screening decisions',
      'Clinician-authored state of the art and clinical evidence appraisal',
      'Biostatistical / epidemiological appraisal of data quality and uncertainty',
      'Device description and technical/biological/clinical equivalence comparison, with evidence-access justification where claimed',
      'CER evidence synthesis and clinical benefit-risk conclusion linked to the risk file',
      'Qualified evaluator review and Regulatory Affairs mapping to Annex I GSPR',
      'PMS, vigilance and PMCF inputs with justified living CER update cycle'],
    acceptanceCriteria: ['Evaluator expertise covers the device, clinical use and scientific methodology',
      'Search, screening and appraisal decisions are attributable and reproducible',
      'Clinical claims, gaps, equivalence limitations and benefit-risk conclusions trace to evidence and GSPR'],
  };
}

function softwareApplicability(input: CompileWorkPackagesInput): string {
  const flags = input.deviceFlags;
  if (flags?.includes('cyberDevice')) return 'Applicable: cyber device recorded; include statutory FD&C Act §524B cybersecurity and SBOM evidence.';
  if (input.specialization === 'samd' || flags?.includes('softwareAiMl')) return 'Applicable: software device features recorded; separately determine cyber-device status and cybersecurity obligations.';
  return 'Conditional: software and cyber-device applicability have not been recorded.';
}

function clinicalApplicability(input: CompileWorkPackagesInput, filings: FilingCode[]): string {
  if (filings.includes('mdr')) return 'Applicable: EU MDR clinical evaluation; new clinical investigations depend on the evaluation plan and evidence gaps.';
  if (filings.includes('pma')) return 'Applicable: clinical evidence supports the PMA strategy and intended claims.';
  return input.deviceFlags?.includes('clinicalData') ? 'Applicable: clinical data submitted is recorded for this project.'
    : 'Conditional: clinical studies depend on the pathway, claims, device differences and evidence gaps; a 510(k) may be supported without clinical studies.';
}

function packageApplicability(id: PkgId, input: CompileWorkPackagesInput, filings: FilingCode[]): string {
  const flags = input.deviceFlags;
  if (id === PKG.electrical) return 'Conditional: confirm electrical power, equipment type and applicable safety/EMC standards; IEC 60601 is not universal for IVD equipment.';
  if (id === PKG.biocompatibility) return flags?.includes('implantable')
    ? 'Applicable: implantable device recorded; confirm materials, contact nature and duration.'
    : 'Conditional: direct or indirect patient contact, material composition and exposure determine the biological evaluation.';
  if (id === PKG.sterility) return flags?.includes('sterile')
    ? 'Applicable: sterile device recorded; validate the claimed method, packaging, microbiological limits and shelf life.'
    : 'Conditional: sterile supply or required reprocessing and microbiological controls must be confirmed.';
  if (id === PKG.softwareCyber) return softwareApplicability(input);
  if (id === PKG.clinicalEvidence) return clinicalApplicability(input, filings);
  if (id === PKG.performanceEvaluation) return 'Applicable: EU IVDR performance evaluation integrates three evidence pillars and PMPF; this is distinct from an MDR CER.';
  if (id === PKG.humanFactors) return 'Use-related risk applies to intended users and environments; justify the extent of formative and validation work.';
  if (id === PKG.postmarket) return 'Plan before market placement; collect surveillance data and maintain evaluation conclusions through the lifecycle.';
  return 'Tailor deliverables and acceptance criteria to the recorded product, pathway, claims and justified evidence needs.';
}

/* ─── Compiler ────────────────────────────────────────────────────── */

const uniq = (xs: string[]): string[] => Array.from(new Set(xs));

/**
 * Compile the regulatory work-package plan for a program's effective context.
 *
 * Deterministic: same input → identical output (stable order, stable ids).
 * Dedupe/merge is inherent — each package is emitted once by id, and its
 * `filingSectionsSupported` and `applicableMarkets` are unioned across every
 * active filing that consumes it.
 */
export function compileWorkPackages(input: CompileWorkPackagesInput): WorkPackage[] {
  const { specialization, pathways, markets } = input;
  const filings = activeFilings(pathways);
  const selectedIds = selectPackageIds(specialization, filings, input.deviceFlags);
  const inPlan = new Set<PkgId>(selectedIds);

  // Markets: caller-supplied markets are authoritative; markets implied by the
  // active filings are unioned in so a sparse market list still reflects reach.
  const impliedMarkets = filings.map((f) => FILING_MARKET[f]);
  const allMarkets = uniq([...markets, ...impliedMarkets]);

  const packages: WorkPackage[] = selectedIds.map((id) => {
    const base = pathwayPackage(basePackage(id), id, filings);

    // Filing sections: union this package's section string across every active
    // filing that references it (shared-evidence reuse; deduped by Set).
    const sections: string[] = [];
    for (const f of filings) {
      const forPkg = FILING_SECTIONS[f][id];
      if (forPkg) sections.push(...forPkg);
    }

    // Applicable markets: only the markets whose filings actually consume this
    // package; fall back to the full market set when no filing references it
    // (universal lifecycle packages), so the plan is never empty-scoped.
    const marketsForPkg = uniq(
      filings.filter((f) => FILING_SECTIONS[f][id]).map((f) => FILING_MARKET[f]),
    );
    const applicableMarkets = marketsForPkg.length > 0 ? uniq(marketsForPkg) : allMarkets;

    // Dependencies: keep only deps that are actually in this plan.
    const dependsOn = base.dependsOn.filter((d) => inPlan.has(d));

    return {
      id,
      title: base.title,
      regulatoryPurpose: base.regulatoryPurpose,
      ownerDiscipline: PACKAGE_ROLES[id].ownerDiscipline,
      contributors: [...PACKAGE_ROLES[id].contributors],
      applicability: packageApplicability(id, input, filings),
      applicableMarkets,
      filingSectionsSupported: uniq(sections),
      deliverables: uniq([...base.deliverables, ...specializationDeliverables(id, specialization), ...filingDeliverables(id, filings)]),
      acceptanceCriteria: [...base.acceptanceCriteria],
      dependsOn,
    };
  });

  return packages;
}
