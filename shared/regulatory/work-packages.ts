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
}

/* ─── Package ids ─────────────────────────────────────────────────── */

const PKG = {
  strategy: 'regulatory-strategy',
  designControls: 'design-controls',
  riskManagement: 'risk-management',
  benchPerformance: 'bench-performance-testing',
  analyticalPerformance: 'analytical-performance',
  softwareCyber: 'software-cybersecurity',
  clinicalEvidence: 'clinical-evidence',
  clinicalPerformance: 'clinical-performance',
  labeling: 'labeling',
  quality: 'quality-manufacturing',
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
    [PKG.quality]: ['510k: Sterilization / shelf life'],
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
    [PKG.quality]: ['pma: Manufacturing information (QSR)'],
    [PKG.submissionAssembly]: ['pma: Modular / traditional assembly'],
  },
  clia: {
    [PKG.strategy]: ['clia: Complexity categorization rationale'],
    [PKG.riskManagement]: ['clia: Risk assessment (CLSI EP23)'],
    [PKG.analyticalPerformance]: ['clia: Establishment of performance specifications'],
    [PKG.clinicalPerformance]: ['clia: Method comparison / accuracy'],
    [PKG.labeling]: ['clia: Procedure manual / IFU'],
    [PKG.quality]: ['clia: Quality control plan'],
    [PKG.submissionAssembly]: ['clia: Validation dossier assembly'],
  },
  ivdr: {
    [PKG.strategy]: ['ivdr: Classification (Annex VIII) & intended purpose'],
    [PKG.designControls]: ['ivdr: Device description & GSPR mapping'],
    [PKG.riskManagement]: ['ivdr: Risk management (Annex I)'],
    [PKG.analyticalPerformance]: ['ivdr: Analytical performance report'],
    [PKG.softwareCyber]: ['ivdr: Software lifecycle & IT security'],
    [PKG.clinicalPerformance]: ['ivdr: Clinical performance & scientific validity report'],
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
    [PKG.labeling]: ['mdr: Labeling & IFU (Annex I ch. III)'],
    [PKG.quality]: ['mdr: Manufacturing & QMS (ISO 13485)'],
    [PKG.submissionAssembly]: ['mdr: Technical documentation (Annex II/III)'],
  },
};

/* ─── Specialization → package selection ──────────────────────────────
 * Which of the standard packages are in scope for each specialization. The
 * lifecycle scaffolding (strategy, risk, labeling, quality, assembly, review,
 * registration, postmarket) is universal; the evidence packages vary. */

function selectPackageIds(spec: Specialization): PkgId[] {
  const wantsAnalytical =
    spec === 'ivd_diagnostics' || spec === 'both' || spec === 'companion_diagnostic';
  const wantsBench =
    spec === 'medical_device' ||
    spec === 'both' ||
    spec === 'combination_product' ||
    spec === 'companion_diagnostic' ||
    spec === null;
  const wantsClinicalPerformance =
    spec === 'ivd_diagnostics' || spec === 'both' || spec === 'companion_diagnostic';
  const wantsClinicalEvidence =
    spec === 'medical_device' ||
    spec === 'both' ||
    spec === 'combination_product' ||
    spec === 'companion_diagnostic' ||
    spec === null;
  // Software & cybersecurity is in scope for every specialization (software is
  // near-ubiquitous across device/IVD); SaMD gets the additional emphasis
  // deliverables layered on in specializationDeliverables().
  const ids: PkgId[] = [PKG.strategy];
  ids.push(PKG.designControls);
  ids.push(PKG.riskManagement);
  if (wantsBench) ids.push(PKG.benchPerformance);
  if (wantsAnalytical) ids.push(PKG.analyticalPerformance);
  ids.push(PKG.softwareCyber);
  if (wantsClinicalEvidence) ids.push(PKG.clinicalEvidence);
  if (wantsClinicalPerformance) ids.push(PKG.clinicalPerformance);
  ids.push(
    PKG.labeling,
    PKG.quality,
    PKG.submissionAssembly,
    PKG.authorityReview,
    PKG.registrationUdi,
    PKG.postmarket,
  );
  return ids;
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

function basePackage(id: PkgId): BasePackage {
  switch (id) {
    case PKG.strategy:
      return {
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
      };
    case PKG.designControls:
      return {
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
      };
    case PKG.riskManagement:
      return {
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
      };
    case PKG.benchPerformance:
      return {
        title: 'Bench & performance testing',
        regulatoryPurpose:
          'Demonstrate non-clinical performance, safety, and reliability of the physical device.',
        deliverables: [
          'Bench test plan and protocols',
          'Biocompatibility evaluation (ISO 10993)',
          'Electrical safety / EMC where applicable (IEC 60601)',
          'Bench performance test reports',
        ],
        acceptanceCriteria: [
          'All bench acceptance criteria met with signed reports',
          'Test article traceable to design outputs',
        ],
        dependsOn: [PKG.designControls, PKG.riskManagement],
      };
    case PKG.analyticalPerformance:
      return {
        title: 'Analytical performance evidence',
        regulatoryPurpose:
          'Establish analytical validity of the assay — the shared analytical evidence reused across every filing.',
        deliverables: [
          'Analytical performance plan',
          'Precision / reproducibility studies (CLSI EP05)',
          'Accuracy / method comparison (CLSI EP09)',
          'Detection capability, linearity, interference, and stability studies',
          'Analytical performance report',
        ],
        acceptanceCriteria: [
          'Performance claims supported by pre-specified acceptance criteria',
          'Studies executed on final assay configuration',
        ],
        dependsOn: [PKG.designControls, PKG.riskManagement],
      };
    case PKG.softwareCyber:
      return {
        title: 'Software & cybersecurity',
        regulatoryPurpose:
          'Document the software lifecycle and cybersecurity posture per IEC 62304 and FDA 2023 guidance.',
        deliverables: [
          'Software requirements & architecture',
          'Verification & validation records',
          'Software bill of materials (SBOM)',
          'Cybersecurity risk assessment and threat model',
        ],
        acceptanceCriteria: [
          'Software documentation level matches safety class',
          'Cybersecurity risks assessed with controls and SBOM current',
        ],
        dependsOn: [PKG.designControls, PKG.riskManagement],
      };
    case PKG.clinicalEvidence:
      return {
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
        dependsOn: [PKG.benchPerformance, PKG.riskManagement],
      };
    case PKG.clinicalPerformance:
      return {
        title: 'Clinical performance evidence',
        regulatoryPurpose:
          'Establish clinical performance and scientific validity of the assay — shared clinical evidence reused across filings.',
        deliverables: [
          'Clinical performance study plan',
          'Diagnostic sensitivity / specificity studies',
          'Scientific validity summary',
          'Clinical performance report',
        ],
        acceptanceCriteria: [
          'Clinical performance claims met against pre-specified criteria',
          'Scientific validity of the analyte-condition association established',
        ],
        dependsOn: [PKG.analyticalPerformance, PKG.riskManagement],
      };
    case PKG.labeling:
      return {
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
      };
    case PKG.quality:
      return {
        title: 'Quality & manufacturing',
        regulatoryPurpose:
          'Demonstrate a compliant QMS and validated, reproducible manufacturing.',
        deliverables: [
          'QMS documentation (ISO 13485 / QSR)',
          'Process validation (IQ/OQ/PQ)',
          'Device master record and manufacturing controls',
        ],
        acceptanceCriteria: [
          'Manufacturing processes validated and under control',
          'QMS records support the intended production scale',
        ],
        dependsOn: [PKG.designControls],
      };
    case PKG.submissionAssembly:
      return {
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
          PKG.labeling,
          PKG.quality,
          PKG.riskManagement,
        ],
      };
    case PKG.authorityReview:
      return {
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
      };
    case PKG.registrationUdi:
      return {
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
      };
    case PKG.postmarket:
      return {
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
        dependsOn: [PKG.authorityReview, PKG.registrationUdi],
      };
    default: {
      // Exhaustiveness guard — unreachable if PKG and PkgId stay in sync.
      const _never: never = id;
      throw new Error(`Unknown work-package id: ${String(_never)}`);
    }
  }
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
  const selectedIds = selectPackageIds(specialization);
  const inPlan = new Set<PkgId>(selectedIds);

  // Markets: caller-supplied markets are authoritative; markets implied by the
  // active filings are unioned in so a sparse market list still reflects reach.
  const impliedMarkets = filings.map((f) => FILING_MARKET[f]);
  const allMarkets = uniq([...markets, ...impliedMarkets]);

  const packages: WorkPackage[] = selectedIds.map((id) => {
    const base = basePackage(id);

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
      applicableMarkets,
      filingSectionsSupported: uniq(sections),
      deliverables: uniq([...base.deliverables, ...specializationDeliverables(id, specialization)]),
      acceptanceCriteria: base.acceptanceCriteria,
      dependsOn,
    };
  });

  return packages;
}
