/**
 * Nonclinical PK / ADME & Toxicokinetics Intelligence — Deterministic Knowledge Base
 *
 * Pure, in-code reference data and decision engines for the NONCLINICAL /
 * in-vitro ADME package that supports first-in-human (FIH) entry and beyond:
 * absorption / distribution / metabolism / excretion study design, radiolabeled
 * mass-balance (ADME) study design, metabolites-in-safety-testing (MIST)
 * assessment, toxicokinetics embedded in repeat-dose tox studies, in-vitro
 * reaction phenotyping (CYP / UGT / transporter fraction-metabolized), and
 * plasma protein binding.
 *
 * NO LLM, NO network, NO database, NO imports from other services. Every
 * function is closed-form and reproducible: identical input always yields
 * identical output.
 *
 * Scope guard: this module is NONCLINICAL and IN-VITRO focused. It deliberately
 * does NOT perform clinical DDI risk classification (that lives elsewhere). It
 * provides the in-vitro / nonclinical inputs (fm, fu, metabolite exposure,
 * recombinant-enzyme phenotyping) that feed downstream clinical decisions.
 *
 * Regulatory citations grounded in:
 *   - ICH M3(R2) — Nonclinical Safety Studies for the Conduct of Human Clinical
 *     Trials and Marketing Authorization for Pharmaceuticals (2009), incl. the
 *     metabolite-safety / MIST principles in Section XIV / Note 11.
 *   - ICH S3A — Note for Guidance on Toxicokinetics: The Assessment of Systemic
 *     Exposure in Toxicity Studies (1994) and the 2017 Q&A on microsampling.
 *   - ICH S3B — Pharmacokinetics: Guidance for Repeated Dose Tissue Distribution
 *     Studies (1994).
 *   - FDA Guidance for Industry — In Vitro Drug Interaction Studies: Cytochrome
 *     P450 Enzyme- and Transporter-Mediated Drug Interactions (Jan 2020).
 *   - FDA Guidance for Industry — Safety Testing of Drug Metabolites (MIST,
 *     revised Mar 2020).
 *   - ICH M12 — Drug Interaction Studies (Step 4, 2024) — in-vitro phenotyping
 *     and reaction-phenotyping expectations only.
 *
 * @module server/services/nonclinical-adme/nonclinical-adme-knowledge
 */

// ─────────────────────────────────────────────────────────────────────────────
// 0. Shared types
// ─────────────────────────────────────────────────────────────────────────────

/** Drug modality categories that drive the nonclinical ADME strategy. */
export type Modality =
  | 'small_molecule'
  | 'peptide'
  | 'oligonucleotide'
  | 'antibody'
  | 'adc'
  | 'protein'
  | 'other_biologic';

/** Development stage relative to the regulatory lifecycle. */
export type DevelopmentStage =
  | 'lead_optimization'
  | 'candidate_selection'
  | 'ind_enabling'
  | 'phase1'
  | 'phase2'
  | 'phase3'
  | 'nda_bla';

/** Route of administration. */
export type Route =
  | 'oral'
  | 'iv'
  | 'subcutaneous'
  | 'intramuscular'
  | 'inhalation'
  | 'topical'
  | 'ophthalmic'
  | 'intrathecal'
  | 'other';

/** Required / recommended / optional / not-applicable flag for a study. */
export type StudyNecessity = 'required' | 'recommended' | 'conditional' | 'optional' | 'not_applicable';

/** A single nonclinical ADME study recommendation. */
export interface AdmeStudyRecommendation {
  /** Short stable identifier for the study type. */
  studyId: string;
  /** Human-readable study name. */
  name: string;
  /** ADME domain the study addresses. */
  domain: 'absorption' | 'distribution' | 'metabolism' | 'excretion' | 'pk_general' | 'toxicokinetics';
  /** Whether the study is in-vitro, in-vivo, or in-silico. */
  system: 'in_vitro' | 'in_vivo' | 'in_silico';
  /** Necessity at the queried stage. */
  necessity: StudyNecessity;
  /** Timing relative to FIH (first-in-human) dosing. */
  timingRelativeToFIH: string;
  /** What the study delivers. */
  purpose: string;
  /** Practical design notes. */
  designNotes: string[];
  /** Regulatory citations supporting the study. */
  citations: string[];
}

/** A regulatory citation with a stable label. */
export interface Citation {
  source: string;
  detail: string;
}

// Frozen helper — guarantees pure, side-effect-free table reuse.
function freezeList<T>(items: T[]): T[] {
  return items.slice();
}

// Closed-form normal quantile helpers are not needed here; all engines are
// rule-based or arithmetic.

// ─────────────────────────────────────────────────────────────────────────────
// 1. Canonical citation registry
// ─────────────────────────────────────────────────────────────────────────────

const CITATIONS = {
  ICH_M3R2:
    'ICH M3(R2) — Nonclinical Safety Studies for the Conduct of Human Clinical Trials and Marketing Authorization for Pharmaceuticals (2009)',
  ICH_M3R2_METAB:
    'ICH M3(R2) Section XIV / Note 11 — Nonclinical assessment of human metabolites (MIST principle)',
  ICH_S3A:
    'ICH S3A — Note for Guidance on Toxicokinetics: The Assessment of Systemic Exposure in Toxicity Studies (1994)',
  ICH_S3A_QA:
    'ICH S3A Q&A (2017) — Toxicokinetics microsampling and exposure-assessment clarifications',
  ICH_S3B:
    'ICH S3B — Pharmacokinetics: Guidance for Repeated Dose Tissue Distribution Studies (1994)',
  FDA_IN_VITRO_DDI:
    'FDA Guidance for Industry — In Vitro Drug Interaction Studies: Cytochrome P450 Enzyme- and Transporter-Mediated Drug Interactions (January 2020)',
  FDA_MIST:
    'FDA Guidance for Industry — Safety Testing of Drug Metabolites (revised March 2020)',
  ICH_M12:
    'ICH M12 — Drug Interaction Studies (Step 4, 2024)',
  ICH_S6R1:
    'ICH S6(R1) — Preclinical Safety Evaluation of Biotechnology-Derived Pharmaceuticals (2011)',
  ICH_M3R2_RADIOLABEL:
    'ICH M3(R2) — Human radiolabeled mass-balance study expectations to support metabolite characterization',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// 2. Nonclinical ADME program design
// ─────────────────────────────────────────────────────────────────────────────

export interface DesignADMEProgramParams {
  modality: Modality;
  developmentStage: DevelopmentStage;
  route: Route;
  /** True if the program is for a small-molecule new chemical entity. */
  isNewChemicalEntity?: boolean;
  /** Estimated elimination half-life in hours, if known. */
  halfLife_hours?: number;
  /** True if metabolism is expected to be the major clearance route. */
  metabolicClearanceExpected?: boolean;
  /** True if the molecule is known/expected to be a CYP/transporter victim or perpetrator. */
  ddiPotentialExpected?: boolean;
  /** Intended chronic (>= 6 month) dosing. */
  chronicDosing?: boolean;
  /** Free-text drug name (used only for echoing). */
  drugName?: string;
}

export interface DesignADMEProgramResult {
  modality: Modality;
  developmentStage: DevelopmentStage;
  route: Route;
  /** True when full small-molecule ADME package applies. */
  smallMoleculePackageApplies: boolean;
  studies: AdmeStudyRecommendation[];
  /** Sequenced narrative of what must be in hand before FIH. */
  fihReadinessChecklist: string[];
  /** Modality-specific strategic notes. */
  strategyNotes: string[];
  citations: Citation[];
  /** Top-line summary sentence. */
  summary: string;
}

// Master catalog of nonclinical ADME studies (small-molecule centric).
interface CatalogEntry {
  studyId: string;
  name: string;
  domain: AdmeStudyRecommendation['domain'];
  system: AdmeStudyRecommendation['system'];
  earliestStage: DevelopmentStage;
  timingRelativeToFIH: string;
  purpose: string;
  designNotes: string[];
  citations: string[];
}

const STAGE_ORDER: DevelopmentStage[] = [
  'lead_optimization',
  'candidate_selection',
  'ind_enabling',
  'phase1',
  'phase2',
  'phase3',
  'nda_bla',
];

function stageIndex(stage: DevelopmentStage): number {
  const i = STAGE_ORDER.indexOf(stage);
  return i < 0 ? 0 : i;
}

const SMALL_MOLECULE_ADME_CATALOG: CatalogEntry[] = [
  {
    studyId: 'caco2_permeability',
    name: 'In vitro permeability (Caco-2 / MDCK)',
    domain: 'absorption',
    system: 'in_vitro',
    earliestStage: 'lead_optimization',
    timingRelativeToFIH: 'Before FIH (lead optimization onward)',
    purpose:
      'Estimate passive permeability and apparent efflux ratio to predict fraction absorbed and identify P-gp/BCRP substrate liability.',
    designNotes: [
      'Bidirectional transport (A-to-B and B-to-A) at 1-2 pH conditions',
      'Include efflux ratio; ratio >= 2 with reduction by inhibitor suggests transporter involvement',
      'Run alongside aqueous solubility and logD to anchor BCS provisional class',
    ],
    citations: [CITATIONS.FDA_IN_VITRO_DDI],
  },
  {
    studyId: 'metabolic_stability',
    name: 'In vitro metabolic stability (microsomes / hepatocytes)',
    domain: 'metabolism',
    system: 'in_vitro',
    earliestStage: 'lead_optimization',
    timingRelativeToFIH: 'Before FIH',
    purpose:
      'Estimate intrinsic clearance and project hepatic clearance across species; supports species selection for tox.',
    designNotes: [
      'Liver microsomes and/or hepatocytes from human plus the two tox species',
      'Determine intrinsic clearance (CLint) and scale to hepatic CL via well-stirred model',
      'Compare human vs. tox-species clearance to justify species relevance',
    ],
    citations: [CITATIONS.ICH_M3R2],
  },
  {
    studyId: 'metabolite_id_invitro',
    name: 'In vitro metabolite identification (cross-species)',
    domain: 'metabolism',
    system: 'in_vitro',
    earliestStage: 'candidate_selection',
    timingRelativeToFIH: 'Before FIH; updated as data accrue',
    purpose:
      'Characterize the in-vitro metabolite profile in human and tox-species hepatocytes to provide an early read on potential human-unique or disproportionate metabolites.',
    designNotes: [
      'Hepatocyte incubations across human and both tox species',
      'LC-MS/MS structural characterization of major metabolites',
      'Provides the qualitative basis for the pre-FIH MIST risk read',
    ],
    citations: [CITATIONS.FDA_MIST, CITATIONS.ICH_M3R2_METAB],
  },
  {
    studyId: 'reaction_phenotyping',
    name: 'In vitro reaction phenotyping (CYP / UGT)',
    domain: 'metabolism',
    system: 'in_vitro',
    earliestStage: 'candidate_selection',
    timingRelativeToFIH: 'Before FIH (refined before Phase 2/3)',
    purpose:
      'Identify enzymes responsible for metabolism and estimate fraction metabolized (fm) by each pathway to anticipate victim-DDI and pharmacogenomic liability.',
    designNotes: [
      'Recombinant enzymes + selective chemical inhibitors + correlation analysis',
      'Estimate fm for each major CYP/UGT; pathways with fm >= 0.25 are clinically meaningful',
      'See designReactionPhenotyping() for full design',
    ],
    citations: [CITATIONS.FDA_IN_VITRO_DDI, CITATIONS.ICH_M12],
  },
  {
    studyId: 'cyp_inhibition',
    name: 'In vitro CYP inhibition (reversible + time-dependent)',
    domain: 'metabolism',
    system: 'in_vitro',
    earliestStage: 'ind_enabling',
    timingRelativeToFIH: 'Before FIH',
    purpose:
      'Determine whether the drug inhibits major CYPs (reversible IC50/Ki and time-dependent inactivation) to flag perpetrator-DDI potential for clinical planning.',
    designNotes: [
      'Cover CYP1A2, 2B6, 2C8, 2C9, 2C19, 2D6, 3A4 (midazolam + testosterone probes)',
      'Include time-dependent (mechanism-based) inhibition assessment',
      'In-vitro flags feed clinical DDI strategy but do not themselves classify clinical risk',
    ],
    citations: [CITATIONS.FDA_IN_VITRO_DDI, CITATIONS.ICH_M12],
  },
  {
    studyId: 'cyp_induction',
    name: 'In vitro CYP induction (human hepatocytes)',
    domain: 'metabolism',
    system: 'in_vitro',
    earliestStage: 'ind_enabling',
    timingRelativeToFIH: 'Before FIH',
    purpose:
      'Assess mRNA induction of CYP1A2, 2B6, and 3A4 in cryopreserved human hepatocytes to flag perpetrator-DDI / autoinduction liability.',
    designNotes: [
      'Plated human hepatocytes from >= 3 donors',
      'Measure CYP1A2, 2B6, 3A4 mRNA; consider activity confirmation',
      'Evaluate at clinically relevant concentrations once exposure is known',
    ],
    citations: [CITATIONS.FDA_IN_VITRO_DDI, CITATIONS.ICH_M12],
  },
  {
    studyId: 'transporter_substrate',
    name: 'In vitro transporter substrate assessment',
    domain: 'distribution',
    system: 'in_vitro',
    earliestStage: 'ind_enabling',
    timingRelativeToFIH: 'Before FIH',
    purpose:
      'Determine whether the drug is a substrate of P-gp, BCRP, OATP1B1/1B3, OAT1/3, OCT2, MATE1/2-K to anticipate disposition and victim-DDI.',
    designNotes: [
      'Vesicle / transfected-cell systems with selective inhibitors',
      'P-gp and BCRP for efflux; hepatic and renal uptake transporters as relevant',
      'Substrate calls inform distribution, elimination and special-population strategy',
    ],
    citations: [CITATIONS.FDA_IN_VITRO_DDI, CITATIONS.ICH_M12],
  },
  {
    studyId: 'transporter_inhibition',
    name: 'In vitro transporter inhibition',
    domain: 'distribution',
    system: 'in_vitro',
    earliestStage: 'ind_enabling',
    timingRelativeToFIH: 'Before FIH or before Phase 2',
    purpose:
      'Determine whether the drug inhibits key transporters (P-gp, BCRP, OATP1B1/1B3, OAT1/3, OCT2, MATE1/2-K, BSEP) to flag perpetrator liability.',
    designNotes: [
      'IC50 determination against probe substrates for each transporter',
      'BSEP inhibition is a cholestatic / hepatotoxicity flag',
      'Timing may be deferred to before Phase 2 if exposure is uncertain at FIH',
    ],
    citations: [CITATIONS.FDA_IN_VITRO_DDI, CITATIONS.ICH_M12],
  },
  {
    studyId: 'plasma_protein_binding',
    name: 'Plasma protein binding (equilibrium dialysis, cross-species)',
    domain: 'distribution',
    system: 'in_vitro',
    earliestStage: 'candidate_selection',
    timingRelativeToFIH: 'Before FIH',
    purpose:
      'Determine fraction unbound (fu) in human and tox-species plasma to interpret free-drug exposure margins and in-vitro DDI parameters.',
    designNotes: [
      'Equilibrium dialysis is the reference method',
      'Human plus both tox species; report fu and species differences',
      'See assessProteinBinding() for full design',
    ],
    citations: [CITATIONS.ICH_S3A, CITATIONS.FDA_IN_VITRO_DDI],
  },
  {
    studyId: 'blood_to_plasma',
    name: 'Blood-to-plasma partitioning ratio',
    domain: 'distribution',
    system: 'in_vitro',
    earliestStage: 'candidate_selection',
    timingRelativeToFIH: 'Before FIH',
    purpose:
      'Determine the blood-to-plasma concentration ratio to convert plasma clearance to blood clearance and interpret hepatic extraction.',
    designNotes: [
      'Measure across species at relevant concentrations',
      'Needed to scale plasma CL to blood CL for extraction-ratio interpretation',
    ],
    citations: [CITATIONS.ICH_S3A],
  },
  {
    studyId: 'tissue_distribution_qwba',
    name: 'Tissue distribution (radiolabeled QWBA, ICH S3B)',
    domain: 'distribution',
    system: 'in_vivo',
    earliestStage: 'ind_enabling',
    timingRelativeToFIH: 'Before FIH (single-dose); repeat-dose if triggered',
    purpose:
      'Define tissue distribution and identify tissues with prolonged retention using quantitative whole-body autoradiography in a pigmented and albino rodent.',
    designNotes: [
      'Single-dose QWBA typically sufficient; repeat-dose triggered by long retention',
      'ICH S3B repeat-dose triggers: apparent t1/2 in a tissue exceeds that in blood, or accumulation',
      'Melanin binding assessed via pigmented animal',
    ],
    citations: [CITATIONS.ICH_S3B],
  },
  {
    studyId: 'mass_balance_animal',
    name: 'Animal mass-balance / excretion (radiolabeled)',
    domain: 'excretion',
    system: 'in_vivo',
    earliestStage: 'ind_enabling',
    timingRelativeToFIH: 'Before FIH',
    purpose:
      'Establish routes and rates of excretion (urine, feces, bile) and overall recovery in the tox species, and provide cross-species metabolite context for the human ADME study.',
    designNotes: [
      'Collect urine and feces (and bile via cannulation) to characterize elimination',
      'Recovery target >= 90% of administered radioactivity',
      'Provides the animal counterpart to the human 14C ADME study',
    ],
    citations: [CITATIONS.ICH_M3R2_RADIOLABEL, CITATIONS.FDA_MIST],
  },
  {
    studyId: 'human_mass_balance',
    name: 'Human radiolabeled mass-balance / ADME (14C)',
    domain: 'excretion',
    system: 'in_vivo',
    earliestStage: 'phase1',
    timingRelativeToFIH: 'After FIH (typically Phase 1, before pivotal Phase 3)',
    purpose:
      'Define human routes of elimination, total recovery and the circulating human metabolite profile; the definitive input to the MIST assessment.',
    designNotes: [
      'See designMassBalanceStudy() for full design',
      'Drives final MIST comparison of human vs. animal metabolite exposure',
    ],
    citations: [CITATIONS.ICH_M3R2_RADIOLABEL, CITATIONS.FDA_MIST],
  },
  {
    studyId: 'toxicokinetics',
    name: 'Toxicokinetics embedded in repeat-dose tox (ICH S3A)',
    domain: 'toxicokinetics',
    system: 'in_vivo',
    earliestStage: 'ind_enabling',
    timingRelativeToFIH: 'Before FIH (within GLP tox studies)',
    purpose:
      'Quantify systemic exposure (AUC, Cmax) in the tox species to establish exposure margins, saturation, accumulation, and gender differences.',
    designNotes: [
      'See designToxicokinetics() for full design',
      'Exposure (not dose) defines the safety margin to the clinical exposure',
    ],
    citations: [CITATIONS.ICH_S3A, CITATIONS.ICH_M3R2],
  },
];

const BIOLOGIC_ADME_NOTES: Record<Modality, string[]> = {
  small_molecule: [],
  peptide: [
    'Classic small-molecule ADME (CYP phenotyping, mass balance, QWBA) is generally NOT applicable.',
    'Catabolism to amino acids/peptides is the expected clearance; characterize proteolytic stability instead.',
    'Immunogenicity and target-mediated disposition can dominate PK; design TK accordingly.',
  ],
  oligonucleotide: [
    'Disposition is governed by nuclease metabolism and tissue (liver/kidney) accumulation, not CYP.',
    'Tissue distribution and persistence (especially kidney/liver) are central; ICH S3B-style retention matters.',
    'Hybridization-based and LC-MS metabolite assays replace classic metabolite ID.',
  ],
  antibody: [
    'ICH S6(R1) governs; standard ADME (CYP/transporter) does NOT apply.',
    'Disposition driven by FcRn recycling, target-mediated drug disposition (TMDD), and proteolytic catabolism.',
    'Tissue distribution via radiolabel is uncommon; rely on PK/PD and immunogenicity assessment.',
  ],
  adc: [
    'Hybrid strategy: characterize the small-molecule payload and linker catabolites with ADME tools.',
    'Antibody component follows ICH S6(R1); payload follows small-molecule MIST/metabolite logic.',
    'Deconjugation and payload release kinetics are central to disposition and safety.',
  ],
  protein: [
    'ICH S6(R1) governs; proteolytic catabolism is the clearance pathway.',
    'No CYP/transporter ADME package; focus on PK, immunogenicity, and TMDD.',
  ],
  other_biologic: [
    'Apply ICH S6(R1) principles; classic small-molecule ADME generally not applicable.',
    'Tailor disposition characterization to the specific construct.',
  ],
};

function isSmallMoleculeLike(modality: Modality): boolean {
  return modality === 'small_molecule' || modality === 'adc';
}

/**
 * designADMEProgram — assemble the nonclinical ADME study package appropriate to
 * the modality, development stage, and route, with timing relative to FIH.
 */
export function designADMEProgram(params: DesignADMEProgramParams): DesignADMEProgramResult {
  const {
    modality,
    developmentStage,
    route,
    isNewChemicalEntity = modality === 'small_molecule',
    metabolicClearanceExpected = modality === 'small_molecule',
    ddiPotentialExpected = false,
    chronicDosing = false,
  } = params;

  const smApplies = isSmallMoleculeLike(modality);
  const curIdx = stageIndex(developmentStage);

  const studies: AdmeStudyRecommendation[] = [];

  if (smApplies) {
    for (const entry of SMALL_MOLECULE_ADME_CATALOG) {
      const entryIdx = stageIndex(entry.earliestStage);
      let necessity: StudyNecessity;
      if (entryIdx <= curIdx) {
        // Study should be in hand or in progress at this stage.
        necessity = coreNecessity(entry.studyId, {
          metabolicClearanceExpected,
          ddiPotentialExpected,
          chronicDosing,
          route,
        });
      } else if (entryIdx === curIdx + 1) {
        necessity = 'recommended';
      } else {
        necessity = 'optional';
      }

      studies.push({
        studyId: entry.studyId,
        name: entry.name,
        domain: entry.domain,
        system: entry.system,
        necessity,
        timingRelativeToFIH: entry.timingRelativeToFIH,
        purpose: entry.purpose,
        designNotes: freezeList(entry.designNotes),
        citations: freezeList(entry.citations),
      });
    }
  }

  const strategyNotes: string[] = [];
  strategyNotes.push(...freezeList(BIOLOGIC_ADME_NOTES[modality]));

  if (smApplies) {
    strategyNotes.push(
      'Per ICH M3(R2), in-vitro metabolism and the in-vitro DDI in-vitro package should be available before FIH.',
    );
    strategyNotes.push(
      'The human radiolabeled mass-balance study is a post-FIH activity (Phase 1) and is the definitive MIST input.',
    );
    if (!metabolicClearanceExpected) {
      strategyNotes.push(
        'Metabolic clearance is not expected to dominate; reaction-phenotyping depth may be reduced but renal/biliary excretion and transporter substrate calls become more important.',
      );
    }
    if (ddiPotentialExpected) {
      strategyNotes.push(
        'DDI potential is flagged; complete the in-vitro CYP inhibition/induction and transporter inhibition package early to inform clinical DDI planning.',
      );
    }
    if (chronicDosing) {
      strategyNotes.push(
        'Chronic dosing intended; ensure accumulation and steady-state exposure are captured in toxicokinetics and that long-tissue-retention triggers (ICH S3B) are evaluated.',
      );
    }
    if (route === 'inhalation' || route === 'topical' || route === 'ophthalmic') {
      strategyNotes.push(
        'Local route: characterize local disposition and the systemically available fraction; systemic ADME scales to the absorbed dose.',
      );
    }
    if (route === 'iv') {
      strategyNotes.push(
        'IV route: oral-absorption studies (Caco-2 fraction-absorbed framing) are de-emphasized; focus on distribution, metabolism, and excretion.',
      );
    }
  }

  const checklist = buildFihChecklist(smApplies, studies, isNewChemicalEntity);

  const citations: Citation[] = [
    { source: CITATIONS.ICH_M3R2, detail: 'Overall nonclinical safety / ADME package timing relative to clinical phase.' },
    { source: CITATIONS.ICH_S3A, detail: 'Toxicokinetics and systemic-exposure assessment in tox studies.' },
    { source: CITATIONS.ICH_S3B, detail: 'Repeat-dose tissue distribution triggers.' },
    { source: CITATIONS.FDA_IN_VITRO_DDI, detail: 'In-vitro CYP/transporter phenotyping and inhibition/induction.' },
    { source: CITATIONS.FDA_MIST, detail: 'Metabolite identification and safety-testing strategy.' },
    { source: CITATIONS.ICH_M12, detail: 'In-vitro reaction-phenotyping expectations.' },
  ];
  if (!smApplies) {
    citations.push({
      source: CITATIONS.ICH_S6R1,
      detail: 'Preclinical safety evaluation of biotechnology-derived pharmaceuticals (governs biologic disposition).',
    });
  }

  const requiredCount = studies.filter((s: AdmeStudyRecommendation) => s.necessity === 'required').length;

  const summary = smApplies
    ? `Nonclinical ADME package for a ${modality} (${route}) at ${developmentStage}: ${requiredCount} required studies of ${studies.length} catalogued; in-vitro metabolism and DDI package precede FIH, human 14C mass balance follows in Phase 1.`
    : `For modality "${modality}", classic small-molecule ADME largely does not apply; disposition characterization follows ICH S6(R1) (catabolism, TMDD, FcRn, immunogenicity).`;

  return {
    modality,
    developmentStage,
    route,
    smallMoleculePackageApplies: smApplies,
    studies,
    fihReadinessChecklist: checklist,
    strategyNotes,
    citations,
    summary,
  };
}

interface NecessityContext {
  metabolicClearanceExpected: boolean;
  ddiPotentialExpected: boolean;
  chronicDosing: boolean;
  route: Route;
}

function coreNecessity(studyId: string, ctx: NecessityContext): StudyNecessity {
  // Studies that are essentially always required before FIH for a small molecule.
  const alwaysRequired = new Set<string>([
    'caco2_permeability',
    'metabolic_stability',
    'metabolite_id_invitro',
    'reaction_phenotyping',
    'cyp_inhibition',
    'cyp_induction',
    'transporter_substrate',
    'plasma_protein_binding',
    'blood_to_plasma',
    'mass_balance_animal',
    'toxicokinetics',
  ]);

  if (studyId === 'tissue_distribution_qwba') {
    return 'required';
  }
  if (studyId === 'human_mass_balance') {
    // Required for an NCE program but performed after FIH.
    return 'required';
  }
  if (studyId === 'transporter_inhibition') {
    return ctx.ddiPotentialExpected ? 'required' : 'recommended';
  }
  if (studyId === 'reaction_phenotyping' && !ctx.metabolicClearanceExpected) {
    return 'recommended';
  }
  if (alwaysRequired.has(studyId)) {
    if (studyId === 'caco2_permeability' && ctx.route === 'iv') {
      return 'optional';
    }
    return 'required';
  }
  return 'recommended';
}

function buildFihChecklist(
  smApplies: boolean,
  studies: AdmeStudyRecommendation[],
  isNCE: boolean,
): string[] {
  if (!smApplies) {
    return freezeList([
      'Confirm ICH S6(R1) disposition strategy is documented (catabolism, TMDD, FcRn, immunogenicity).',
      'Confirm PK/TK exposure characterization in the relevant species is planned within GLP tox.',
      'Classic small-molecule ADME (CYP phenotyping, QWBA, 14C mass balance) is generally waived — document the rationale.',
    ]);
  }
  const preFih = studies.filter(
    (s: AdmeStudyRecommendation) =>
      s.timingRelativeToFIH.toLowerCase().includes('before fih') && s.necessity === 'required',
  );
  const out: string[] = [];
  out.push('Before FIH, the following nonclinical ADME deliverables should be in hand:');
  for (const s of preFih) {
    out.push(`- ${s.name} (${s.domain}, ${s.system})`);
  }
  out.push('After FIH (Phase 1): human radiolabeled (14C) mass-balance / ADME study to finalize the MIST assessment.');
  if (isNCE) {
    out.push('This is a new chemical entity — the full in-vitro metabolism and DDI package is expected before FIH per ICH M3(R2).');
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Radiolabeled mass-balance / human ADME study design
// ─────────────────────────────────────────────────────────────────────────────

export interface DesignMassBalanceStudyParams {
  /** 'human' or 'animal' mass-balance study. */
  subject: 'human' | 'animal';
  /** Radiolabel isotope. */
  isotope?: '14C' | '3H';
  /** Route of administration for the radiolabeled dose. */
  route?: Route;
  /** Estimated terminal half-life in hours (drives collection duration). */
  halfLife_hours?: number;
  /** Whether the drug/metabolites are expected to be excreted slowly (e.g., covalent/tissue binding). */
  slowEliminationExpected?: boolean;
  /** Whether biliary excretion is suspected to be important. */
  biliaryExcretionSuspected?: boolean;
  /** Animal species when subject = 'animal'. */
  species?: string;
  drugName?: string;
}

export interface DesignMassBalanceStudyResult {
  subject: 'human' | 'animal';
  isotope: '14C' | '3H';
  /** Recommended label position guidance. */
  labelPositionGuidance: string[];
  /** Recommended administered radioactivity dose guidance. */
  doseGuidance: string[];
  /** Recommended collection matrices and schedule. */
  collectionSchedule: string[];
  /** Recovery target text. */
  recoveryTarget: string;
  /** Numeric recovery target fraction (0-1). */
  recoveryTargetFraction: number;
  /** Estimated collection duration in hours, if half-life supplied. */
  estimatedCollectionDuration_hours?: number;
  /** Metabolite profiling plan. */
  metaboliteProfilingPlan: string[];
  /** Design warnings / flags. */
  warnings: string[];
  citations: Citation[];
  summary: string;
}

/**
 * designMassBalanceStudy — radiolabeled mass-balance / ADME study design with
 * label-position, dose, collection schedule, recovery target and metabolite
 * profiling guidance.
 */
export function designMassBalanceStudy(
  params: DesignMassBalanceStudyParams,
): DesignMassBalanceStudyResult {
  const {
    subject,
    isotope = '14C',
    route = 'oral',
    halfLife_hours,
    slowEliminationExpected = false,
    biliaryExcretionSuspected = false,
    species,
  } = params;

  const labelPositionGuidance: string[] = [
    'Place the radiolabel at a metabolically stable position so the label tracks the molecule (and its metabolic core) rather than being lost as a one-carbon or small fragment.',
    'Avoid positions susceptible to rapid loss (e.g., metabolically labile methyl groups that can be released as 14CO2 or 3H2O exchangeable positions).',
    '14C is generally preferred over 3H for human mass-balance because 3H is prone to exchange/loss leading to falsely low recovery.',
    'Ideally retain a single, well-defined labeled position on the scaffold to keep the radiolabel on all major metabolites.',
  ];
  if (isotope === '3H') {
    labelPositionGuidance.push(
      'For 3H: confirm the tritium is at a non-exchangeable position; demonstrate label stability before the definitive study.',
    );
  }

  const doseGuidance: string[] = [];
  if (subject === 'human') {
    doseGuidance.push(
      'Administer a single dose of the unlabeled drug spiked with tracer radioactivity, typically in the range of ~50-150 microCi (1.85-5.55 MBq) of 14C per subject, justified by dosimetry.',
      'The radioactive dose must be supported by a radiation-dosimetry assessment keeping effective dose within accepted limits for research subjects.',
      'Use a small number of healthy subjects (commonly 4-8) given a single therapeutic-range dose.',
    );
  } else {
    doseGuidance.push(
      'Administer the radiolabeled dose at or near the pharmacologically/toxicologically relevant dose level in the chosen species.',
      'Specific-activity should be high enough to quantify total radioactivity and profile minor metabolites in excreta and plasma.',
    );
    if (species) {
      doseGuidance.push(`Species for this study: ${species}.`);
    }
  }
  doseGuidance.push(`Route of administration: ${route}.`);

  const collectionSchedule: string[] = [
    'Collect ALL excreta to achieve mass balance: urine and feces are mandatory.',
    'Sample plasma/blood serially for total radioactivity, parent and metabolite profiling.',
    'Collect expired air (14CO2) when the label could be lost as one-carbon units.',
  ];
  if (biliaryExcretionSuspected || subject === 'animal') {
    collectionSchedule.push(
      'Consider bile collection (bile-duct-cannulated animals) when biliary excretion is suspected to be a major route.',
    );
  }
  collectionSchedule.push(
    'Continue collection until cumulative recovery plateaus (commonly < 1% of dose excreted per 24 h in two consecutive intervals) or to a predefined cap.',
  );

  // Closed-form collection-duration estimate: ~7 half-lives (>= 99% eliminated)
  // capped, extended when slow elimination is expected.
  let estimatedDuration: number | undefined;
  if (typeof halfLife_hours === 'number' && halfLife_hours > 0) {
    const multiplier = slowEliminationExpected ? 10 : 7;
    estimatedDuration = Math.round(halfLife_hours * multiplier);
    collectionSchedule.push(
      `Estimated minimum collection duration: ~${estimatedDuration} h (~${multiplier} half-lives of ${halfLife_hours} h).`,
    );
  }

  const recoveryTargetFraction = 0.9;
  const recoveryTarget =
    'Target total recovery of >= 90% of the administered radioactivity. Recovery between 80% and 90% may be acceptable with justification (e.g., demonstrated slow excretion, retained label); recovery < 80% generally warrants investigation or study extension.';

  const metaboliteProfilingPlan: string[] = [
    'Profile circulating radioactivity in pooled plasma (e.g., AUC-pooled across the absorption/elimination window) to quantify each metabolite as a fraction of total drug-related material.',
    'Profile and identify metabolites in urine and feces to establish metabolic routes.',
    'Quantify each circulating metabolite relative to total drug-related exposure to feed the MIST assessment (human metabolites > 10% of total drug-related AUC require comparison to animal exposure).',
    'Cross-reference circulating human metabolites against the metabolite profiles from the animal mass-balance / tox species.',
  ];

  const warnings: string[] = [];
  if (slowEliminationExpected) {
    warnings.push(
      'Slow elimination is expected — plan an extended collection period and pre-specify the criterion for stopping collection; incomplete recovery is a common review issue.',
    );
  }
  if (isotope === '3H') {
    warnings.push(
      '3H label carries a risk of exchange leading to 3H2O formation and falsely low recovery; 14C is generally preferred for the definitive human study.',
    );
  }
  if (subject === 'human' && route === 'iv') {
    warnings.push(
      'For an IV radiolabeled study, absorption is complete by definition; the study characterizes distribution, metabolism, and excretion rather than fraction absorbed.',
    );
  }

  const citations: Citation[] = [
    { source: CITATIONS.ICH_M3R2_RADIOLABEL, detail: 'Human radiolabeled mass-balance supports metabolite characterization.' },
    { source: CITATIONS.FDA_MIST, detail: 'Circulating-metabolite quantification feeds the MIST assessment.' },
    { source: CITATIONS.ICH_S3B, detail: 'Radiolabel disposition / retention context.' },
  ];

  const summary =
    subject === 'human'
      ? `Single-dose ${isotope} human mass-balance/ADME study (${route}): target >= 90% recovery, collect urine/feces (+ expired air / bile as needed), AUC-pooled plasma metabolite profiling to finalize MIST.`
      : `${isotope} animal mass-balance study${species ? ` in ${species}` : ''} (${route}): characterize excretion routes and cross-species metabolites, target >= 90% recovery.`;

  return {
    subject,
    isotope,
    labelPositionGuidance,
    doseGuidance,
    collectionSchedule,
    recoveryTarget,
    recoveryTargetFraction,
    estimatedCollectionDuration_hours: estimatedDuration,
    metaboliteProfilingPlan,
    warnings,
    citations,
    summary,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Metabolite safety (MIST) assessment
// ─────────────────────────────────────────────────────────────────────────────

/** A single human metabolite with exposure data. */
export interface MetaboliteInput {
  /** Identifier or chemical name. */
  name: string;
  /** Human exposure as a percent of total drug-related (parent + metabolites) exposure (0-100). */
  percentOfTotalDrugRelated: number;
  /**
   * Optional ratio of human exposure to the highest animal (tox-species)
   * exposure for the same metabolite, expressed as human/animal. A value <= 1
   * means animal exposure covers human exposure. If omitted, coverage is
   * treated as unknown.
   */
  humanToAnimalExposureRatio?: number;
  /** True when the metabolite is pharmacologically active. */
  pharmacologicallyActive?: boolean;
  /** True when the metabolite is a known structural alert / reactive metabolite. */
  structuralAlert?: boolean;
  /** True when the metabolite is unique to humans (not formed at meaningful levels in any tox species). */
  humanUnique?: boolean;
}

export interface AssessMetaboliteSafetyParams {
  metabolites: MetaboliteInput[];
  /**
   * Basis used to express percentOfTotalDrugRelated. FDA MIST uses fraction of
   * total drug-related exposure; some sponsors compute fraction of parent.
   * Default 'total_drug_related'.
   */
  exposureBasis?: 'total_drug_related' | 'parent';
  /** Whether the metabolite is for a drug intended for chronic use. */
  chronicUse?: boolean;
  drugName?: string;
}

/** Per-metabolite MIST verdict. */
export interface MetaboliteVerdict {
  name: string;
  percentOfTotalDrugRelated: number;
  /** True when the metabolite exceeds the 10% MIST threshold. */
  exceedsThreshold: boolean;
  /** True when adequate animal coverage is demonstrated. */
  animalCoverageAdequate: boolean | 'unknown';
  /** Classification of the metabolite. */
  classification: 'no_action' | 'monitor' | 'qualification_needed' | 'human_unique_qualification';
  rationale: string[];
}

export interface AssessMetaboliteSafetyResult {
  exposureBasis: 'total_drug_related' | 'parent';
  /** The MIST threshold applied (percent). */
  thresholdPercent: number;
  perMetabolite: MetaboliteVerdict[];
  /** Names of metabolites exceeding the 10% threshold. */
  disproportionateOrMajor: string[];
  /** Names of human-unique metabolites of concern. */
  humanUniqueOfConcern: string[];
  /** Overall whether nonclinical qualification activity is triggered. */
  qualificationTriggered: boolean;
  /** Recommended actions. */
  recommendedActions: string[];
  citations: Citation[];
  summary: string;
}

/**
 * assessMetaboliteSafety — apply the MIST framework (ICH M3(R2) / FDA 2020):
 * identify human metabolites that exceed 10% of total drug-related exposure,
 * detect disproportionate or human-unique metabolites, and determine whether
 * nonclinical qualification is needed.
 */
export function assessMetaboliteSafety(
  params: AssessMetaboliteSafetyParams,
): AssessMetaboliteSafetyResult {
  const {
    metabolites,
    exposureBasis = 'total_drug_related',
    chronicUse = false,
  } = params;

  const thresholdPercent = 10;

  const perMetabolite: MetaboliteVerdict[] = metabolites.map((m: MetaboliteInput) => {
    const exceeds = m.percentOfTotalDrugRelated > thresholdPercent;
    let coverage: boolean | 'unknown';
    if (typeof m.humanToAnimalExposureRatio === 'number') {
      // Animal coverage adequate when animal exposure >= human exposure,
      // i.e. human/animal ratio <= 1 (allow small margin at exactly 1).
      coverage = m.humanToAnimalExposureRatio <= 1;
    } else {
      coverage = 'unknown';
    }

    const rationale: string[] = [];
    let classification: MetaboliteVerdict['classification'];

    if (m.humanUnique) {
      classification = 'human_unique_qualification';
      rationale.push(
        'Metabolite is human-unique (not formed at meaningful levels in tox species); animal toxicology cannot have covered it.',
      );
      if (exceeds) {
        rationale.push('Exceeds the 10% MIST threshold — nonclinical characterization/qualification is expected.');
      } else {
        rationale.push(
          'Below 10% but human-unique — evaluate whether qualification is warranted, particularly for structural alerts or chronic use.',
        );
      }
    } else if (!exceeds) {
      classification = 'no_action';
      rationale.push(
        `At ${m.percentOfTotalDrugRelated}% of total drug-related exposure, this metabolite is below the 10% MIST threshold — no specific nonclinical metabolite qualification is triggered on exposure grounds.`,
      );
    } else if (coverage === true) {
      classification = 'monitor';
      rationale.push(
        'Exceeds 10% of total drug-related exposure, but animal exposure at the metabolite equals or exceeds human exposure — considered qualified by the existing tox program.',
      );
    } else if (coverage === false) {
      classification = 'qualification_needed';
      rationale.push(
        'Exceeds 10% of total drug-related exposure AND animal exposure does NOT cover human exposure — the metabolite is disproportionate; nonclinical qualification (or additional tox-species coverage) is needed.',
      );
    } else {
      classification = 'qualification_needed';
      rationale.push(
        'Exceeds 10% of total drug-related exposure and animal coverage is unknown — obtain animal vs. human exposure comparison before concluding; treat as qualification-pending.',
      );
    }

    if (m.structuralAlert) {
      rationale.push(
        'Carries a structural alert / reactive-metabolite liability — lower the threshold for concern and consider mechanistic characterization regardless of percentage.',
      );
    }
    if (m.pharmacologicallyActive) {
      rationale.push(
        'Pharmacologically active — its contribution to efficacy and to off-target effects should be considered in addition to the MIST safety assessment.',
      );
    }

    return {
      name: m.name,
      percentOfTotalDrugRelated: m.percentOfTotalDrugRelated,
      exceedsThreshold: exceeds,
      animalCoverageAdequate: coverage,
      classification,
      rationale,
    };
  });

  const disproportionateOrMajor = perMetabolite
    .filter((v: MetaboliteVerdict) => v.exceedsThreshold)
    .map((v: MetaboliteVerdict) => v.name);

  const humanUniqueOfConcern = perMetabolite
    .filter((v: MetaboliteVerdict) => v.classification === 'human_unique_qualification')
    .map((v: MetaboliteVerdict) => v.name);

  const qualificationTriggered = perMetabolite.some(
    (v: MetaboliteVerdict) =>
      v.classification === 'qualification_needed' || v.classification === 'human_unique_qualification',
  );

  const recommendedActions: string[] = [];
  if (qualificationTriggered) {
    recommendedActions.push(
      'Demonstrate adequate animal exposure to each disproportionate/human-unique metabolite, or conduct nonclinical studies on the metabolite itself (synthesized standard).',
    );
    recommendedActions.push(
      'Where animal coverage is absent, options include selecting an alternate tox species that forms the metabolite, dosing the metabolite directly, or generic toxicology of the metabolite.',
    );
  } else {
    recommendedActions.push(
      'No metabolite exceeds the 10% threshold without adequate animal coverage — no additional nonclinical metabolite qualification is triggered on current data.',
    );
  }
  recommendedActions.push(
    'Base the MIST comparison on steady-state human exposure; metabolite percentages from a single-dose study should be confirmed at steady state.',
  );
  if (chronicUse) {
    recommendedActions.push(
      'Chronic-use product: ensure the metabolite assessment reflects steady-state and long-term exposure; the threshold for concern is effectively lower for genotoxic structural alerts.',
    );
  }
  if (exposureBasis === 'parent') {
    recommendedActions.push(
      'Exposure was expressed relative to PARENT; FDA MIST is defined relative to TOTAL drug-related exposure. Re-express against total drug-related material before final conclusions.',
    );
  }

  const citations: Citation[] = [
    { source: CITATIONS.FDA_MIST, detail: '10% of total drug-related exposure threshold and qualification strategy.' },
    { source: CITATIONS.ICH_M3R2_METAB, detail: 'Nonclinical characterization of disproportionate / human-unique metabolites.' },
    { source: CITATIONS.ICH_M3R2, detail: 'Overall nonclinical safety context for metabolite testing.' },
  ];

  const summary = qualificationTriggered
    ? `MIST: ${disproportionateOrMajor.length} metabolite(s) exceed 10% of total drug-related exposure; ${humanUniqueOfConcern.length} human-unique. Nonclinical qualification or additional animal coverage is triggered.`
    : `MIST: no metabolite exceeds the 10% threshold without adequate animal coverage; no additional nonclinical qualification triggered on current data.`;

  return {
    exposureBasis,
    thresholdPercent,
    perMetabolite,
    disproportionateOrMajor,
    humanUniqueOfConcern,
    qualificationTriggered,
    recommendedActions,
    citations,
    summary,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Toxicokinetics (ICH S3A) design
// ─────────────────────────────────────────────────────────────────────────────

export interface DesignToxicokineticsParams {
  /** Tox study type the TK is embedded in. */
  studyType:
    | 'single_dose'
    | 'repeat_dose_rodent'
    | 'repeat_dose_nonrodent'
    | 'carcinogenicity'
    | 'reproductive_dart'
    | 'juvenile';
  species: string;
  route: Route;
  /** Number of dose groups (excluding control), if known. */
  doseGroups?: number;
  /** Whether the study uses a satellite (TK) group vs. main-study animals. */
  useSatelliteGroup?: boolean;
  /** Anticipated human therapeutic AUC (any consistent unit) for margin framing. */
  anticipatedHumanAUC?: number;
  /** Achieved animal AUC at the high dose (same unit) for margin framing. */
  animalHighDoseAUC?: number;
  /** Whether saturation of absorption/clearance is suspected. */
  saturationSuspected?: boolean;
  /** Whether accumulation on repeat dosing is suspected. */
  accumulationSuspected?: boolean;
  /** Whether a gender (sex) difference in exposure is suspected. */
  genderDifferenceSuspected?: boolean;
  drugName?: string;
}

export interface DesignToxicokineticsResult {
  studyType: DesignToxicokineticsParams['studyType'];
  species: string;
  /** Recommended sampling-time strategy. */
  samplingStrategy: string[];
  /** Recommended sampling days within the study. */
  samplingDays: string[];
  /** Exposure parameters to derive. */
  exposureParameters: string[];
  /** Margin framing, including a computed AUC multiple when inputs supplied. */
  marginFraming: string[];
  /** Computed exposure margin (animal/human AUC), if both AUCs supplied. */
  exposureMargin?: number;
  /** How to evaluate saturation. */
  saturationAssessment: string[];
  /** How to evaluate accumulation. */
  accumulationAssessment: string[];
  /** How to evaluate gender differences. */
  genderDifferenceAssessment: string[];
  /** Design considerations (satellite vs main, sampling burden). */
  designConsiderations: string[];
  citations: Citation[];
  summary: string;
}

/**
 * designToxicokinetics — ICH S3A toxicokinetics design embedded within a tox
 * study: sampling, exposure parameters, exposure margins, saturation,
 * accumulation, and gender differences.
 */
export function designToxicokinetics(
  params: DesignToxicokineticsParams,
): DesignToxicokineticsResult {
  const {
    studyType,
    species,
    route,
    doseGroups,
    useSatelliteGroup,
    anticipatedHumanAUC,
    animalHighDoseAUC,
    saturationSuspected = false,
    accumulationSuspected = false,
    genderDifferenceSuspected = false,
  } = params;

  const isRodent =
    studyType === 'repeat_dose_rodent' ||
    species.toLowerCase().includes('rat') ||
    species.toLowerCase().includes('mouse');

  const samplingStrategy: string[] = [
    'Sample at enough time points across the dosing interval to characterize Cmax and AUC (typically a profile of ~4-8 points covering absorption, peak, and elimination).',
    'AUC and Cmax are the primary exposure metrics; full profiles are preferred but a reduced/microsampling scheme can be used when validated (ICH S3A Q&A).',
  ];
  if (isRodent) {
    samplingStrategy.push(
      'In rodents, composite (sparse) sampling across animals is acceptable to build the mean profile; consider microsampling to keep animals on study.',
    );
  } else {
    samplingStrategy.push(
      'In non-rodents (e.g., dog, NHP), serial sampling from the same animal across the profile is standard.',
    );
  }

  const samplingDays: string[] = [];
  if (studyType === 'single_dose') {
    samplingDays.push('Single profile on the day of dosing.');
  } else {
    samplingDays.push('Profile early (Day 1 / first dose) to establish initial exposure.');
    samplingDays.push('Profile near the end of dosing (e.g., last week / steady state) to assess accumulation and time-dependence.');
    if (studyType === 'carcinogenicity') {
      samplingDays.push('Add interim profiles (e.g., periodically over the 2-year study) to confirm exposure is maintained.');
    }
    if (studyType === 'reproductive_dart' || studyType === 'juvenile') {
      samplingDays.push('Confirm exposure during the critical windows (gestation/lactation or the relevant juvenile age).');
    }
  }

  const exposureParameters: string[] = [
    'AUC(0-tau) or AUC(0-24h) — primary systemic-exposure metric for margin calculation.',
    'Cmax — peak exposure metric.',
    'Tmax and, where feasible, terminal half-life.',
    'Express margins on AUC and Cmax (and, where relevant, on free/unbound exposure using plasma protein binding).',
  ];

  const marginFraming: string[] = [
    'Safety margins are based on systemic EXPOSURE (AUC, Cmax), NOT on administered dose — exposure normalizes for species differences in absorption and clearance.',
    'Compute the exposure multiple = animal exposure at the NOAEL (or high dose) divided by the anticipated human therapeutic exposure.',
    'Where protein binding differs across species, also frame margins on unbound exposure.',
  ];

  let exposureMargin: number | undefined;
  if (
    typeof animalHighDoseAUC === 'number' &&
    typeof anticipatedHumanAUC === 'number' &&
    anticipatedHumanAUC > 0
  ) {
    exposureMargin = Math.round((animalHighDoseAUC / anticipatedHumanAUC) * 100) / 100;
    marginFraming.push(
      `Computed AUC exposure multiple (animal high dose / anticipated human): ${exposureMargin}x.`,
    );
    if (exposureMargin < 1) {
      marginFraming.push(
        'The animal exposure is BELOW the anticipated human exposure — margins are inadequate; reconsider the high dose, formulation/absorption, or the clinical exposure assumption.',
      );
    } else if (exposureMargin < 10) {
      marginFraming.push(
        'The exposure multiple is modest (< 10x); ensure it is adequate for the indication, duration, and findings, and check whether absorption saturation is limiting the achievable animal exposure.',
      );
    }
  }

  const saturationAssessment: string[] = [
    'Compare dose-normalized AUC and Cmax across dose groups: less-than-dose-proportional increases indicate saturable absorption or first-pass; greater-than-proportional increases indicate saturable clearance.',
    'Saturation caps the achievable animal exposure and therefore the safety margin — document it explicitly when high-dose selection is limited by exposure plateau.',
  ];
  if (saturationSuspected) {
    saturationAssessment.push(
      'Saturation is suspected — include enough dose groups (ideally >= 3) to characterize the exposure-dose relationship and identify the plateau.',
    );
  }

  const accumulationAssessment: string[] = [
    'Compare Day 1 vs. end-of-dosing AUC/Cmax: an accumulation ratio > 1 indicates accumulation; a decrease over time can indicate autoinduction of clearance.',
    'Relate the observed accumulation to the elimination half-life and dosing interval.',
  ];
  if (accumulationSuspected) {
    accumulationAssessment.push(
      'Accumulation is suspected — ensure a late-study TK profile is scheduled to quantify the accumulation ratio at steady state.',
    );
  }

  const genderDifferenceAssessment: string[] = [
    'Evaluate exposure separately by sex; report male and female AUC/Cmax.',
    'When a marked sex difference exists, frame the safety margin against the sex with the lower exposure and consider its toxicological relevance.',
  ];
  if (genderDifferenceSuspected) {
    genderDifferenceAssessment.push(
      'A sex difference is suspected (common with sex-specific CYP/UGT or transporter expression in rodents) — power the TK sampling to detect it.',
    );
  }

  const designConsiderations: string[] = [];
  if (useSatelliteGroup) {
    designConsiderations.push(
      'Satellite (TK) animals are used so that TK blood sampling does not compromise the main-study toxicology endpoints — appropriate when sampling burden is high (e.g., rodents).',
    );
  } else {
    designConsiderations.push(
      'Main-study animals are sampled for TK; ensure the sampling volume/frequency does not confound toxicology endpoints (favor microsampling).',
    );
  }
  if (typeof doseGroups === 'number') {
    designConsiderations.push(`Dose groups (excluding control): ${doseGroups}.`);
    if (doseGroups < 3 && (saturationSuspected || studyType !== 'single_dose')) {
      designConsiderations.push(
        'Fewer than 3 dose groups limits the ability to characterize dose-proportionality / saturation — consider adding a group.',
      );
    }
  }
  designConsiderations.push(`Route: ${route}.`);

  const citations: Citation[] = [
    { source: CITATIONS.ICH_S3A, detail: 'Toxicokinetics: AUC/Cmax exposure assessment, satellite groups, sex differences.' },
    { source: CITATIONS.ICH_S3A_QA, detail: 'Microsampling and reduced-sampling approaches.' },
    { source: CITATIONS.ICH_M3R2, detail: 'Exposure-based safety margins to support clinical dosing.' },
  ];

  const summary = `ICH S3A toxicokinetics in ${species} (${studyType}): characterize AUC/Cmax, ${
    typeof exposureMargin === 'number' ? `computed exposure multiple ${exposureMargin}x, ` : ''
  }assess saturation, accumulation, and sex differences; margins are exposure-based.`;

  return {
    studyType,
    species,
    samplingStrategy,
    samplingDays,
    exposureParameters,
    marginFraming,
    exposureMargin,
    saturationAssessment,
    accumulationAssessment,
    genderDifferenceAssessment,
    designConsiderations,
    citations,
    summary,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. In-vitro reaction phenotyping
// ─────────────────────────────────────────────────────────────────────────────

/** Enzyme classes covered by reaction phenotyping. */
export type PhenotypingEnzyme =
  | 'CYP1A2'
  | 'CYP2B6'
  | 'CYP2C8'
  | 'CYP2C9'
  | 'CYP2C19'
  | 'CYP2D6'
  | 'CYP2E1'
  | 'CYP3A4'
  | 'CYP3A5'
  | 'UGT1A1'
  | 'UGT1A3'
  | 'UGT1A4'
  | 'UGT1A9'
  | 'UGT2B7'
  | 'FMO'
  | 'AO'
  | 'non_cyp_other';

interface EnzymeProbe {
  enzyme: PhenotypingEnzyme;
  selectiveInhibitor: string;
  marker: string;
}

const PHENOTYPING_PROBES: EnzymeProbe[] = [
  { enzyme: 'CYP1A2', selectiveInhibitor: 'furafylline (TDI) / alpha-naphthoflavone', marker: 'phenacetin O-deethylation' },
  { enzyme: 'CYP2B6', selectiveInhibitor: 'ticlopidine / 2-phenyl-2-(1-piperidinyl)propane', marker: 'bupropion hydroxylation' },
  { enzyme: 'CYP2C8', selectiveInhibitor: 'montelukast / quercetin', marker: 'amodiaquine N-deethylation' },
  { enzyme: 'CYP2C9', selectiveInhibitor: 'sulfaphenazole', marker: 'diclofenac 4-hydroxylation' },
  { enzyme: 'CYP2C19', selectiveInhibitor: '(+)-N-3-benzylnirvanol', marker: 'S-mephenytoin 4-hydroxylation' },
  { enzyme: 'CYP2D6', selectiveInhibitor: 'quinidine', marker: 'dextromethorphan O-demethylation' },
  { enzyme: 'CYP2E1', selectiveInhibitor: 'diethyldithiocarbamate / clomethiazole', marker: 'chlorzoxazone 6-hydroxylation' },
  { enzyme: 'CYP3A4', selectiveInhibitor: 'ketoconazole / itraconazole', marker: 'midazolam 1-hydroxylation; testosterone 6β-hydroxylation' },
  { enzyme: 'CYP3A5', selectiveInhibitor: 'CYP3A5-genotyped HLM panel (no selective chemical inhibitor)', marker: 'midazolam (3A4/3A5 overlap)' },
  { enzyme: 'UGT1A1', selectiveInhibitor: 'atazanavir', marker: 'beta-estradiol 3-glucuronidation' },
  { enzyme: 'UGT1A3', selectiveInhibitor: 'recombinant-enzyme based', marker: 'specific glucuronide formation' },
  { enzyme: 'UGT1A4', selectiveInhibitor: 'hecogenin', marker: 'trifluoperazine glucuronidation' },
  { enzyme: 'UGT1A9', selectiveInhibitor: 'niflumic acid (low conc.)', marker: 'propofol glucuronidation' },
  { enzyme: 'UGT2B7', selectiveInhibitor: 'fluconazole (weak) / recombinant approach', marker: 'zidovudine / morphine glucuronidation' },
  { enzyme: 'FMO', selectiveInhibitor: 'heat inactivation (no NADPH preincubation) — FMO is heat-labile', marker: 'N-/S-oxidation' },
  { enzyme: 'AO', selectiveInhibitor: 'hydralazine / raloxifene (aldehyde oxidase)', marker: 'cytosolic oxidation' },
  { enzyme: 'non_cyp_other', selectiveInhibitor: 'pathway-specific', marker: 'pathway-specific' },
];

export interface DesignReactionPhenotypingParams {
  /** Which enzymes to phenotype; if omitted, the standard CYP panel is used. */
  candidateEnzymes?: PhenotypingEnzyme[];
  /** Whether metabolism is the major clearance route (drives need / depth). */
  metabolismMajorClearance?: boolean;
  /** Estimated overall fraction of clearance that is metabolic (0-1). */
  fractionMetabolic?: number;
  /** Whether non-CYP enzymes (UGT, FMO, AO) are suspected. */
  nonCypSuspected?: boolean;
  /**
   * Optional preliminary fm estimates by enzyme (0-1), summing to <= 1. When
   * supplied, the engine flags enzymes with fm >= 0.25 as clinically meaningful.
   */
  preliminaryFm?: { enzyme: PhenotypingEnzyme; fm: number }[];
  drugName?: string;
}

/** Per-enzyme phenotyping plan entry. */
export interface EnzymePhenotypingPlan {
  enzyme: PhenotypingEnzyme;
  selectiveInhibitor: string;
  marker: string;
  /** Estimated fm if supplied. */
  estimatedFm?: number;
  /** True when fm >= 0.25 (clinically meaningful pathway). */
  clinicallyMeaningful?: boolean;
}

export interface DesignReactionPhenotypingResult {
  /** Whether reaction phenotyping is warranted. */
  warranted: boolean;
  /** The three orthogonal approaches required for a robust fm estimate. */
  approaches: string[];
  /** Per-enzyme plan. */
  enzymePlan: EnzymePhenotypingPlan[];
  /** fm interpretation guidance. */
  fmInterpretation: string[];
  /** Enzymes flagged as clinically meaningful (fm >= 0.25), if fm supplied. */
  majorEnzymes: PhenotypingEnzyme[];
  /** Design warnings. */
  warnings: string[];
  citations: Citation[];
  summary: string;
}

const STANDARD_CYP_PANEL: PhenotypingEnzyme[] = [
  'CYP1A2',
  'CYP2B6',
  'CYP2C8',
  'CYP2C9',
  'CYP2C19',
  'CYP2D6',
  'CYP3A4',
];

/**
 * designReactionPhenotyping — in-vitro reaction phenotyping design using the
 * three orthogonal approaches (recombinant enzymes, selective chemical
 * inhibitors in HLM, and correlation analysis) with fraction-metabolized (fm)
 * interpretation.
 */
export function designReactionPhenotyping(
  params: DesignReactionPhenotypingParams,
): DesignReactionPhenotypingResult {
  const {
    candidateEnzymes,
    metabolismMajorClearance = true,
    fractionMetabolic,
    nonCypSuspected = false,
    preliminaryFm,
  } = params;

  // Determine the enzyme set.
  let enzymeSet: PhenotypingEnzyme[];
  if (candidateEnzymes && candidateEnzymes.length > 0) {
    enzymeSet = candidateEnzymes.slice();
  } else {
    enzymeSet = STANDARD_CYP_PANEL.slice();
    if (nonCypSuspected) {
      const nonCyp: PhenotypingEnzyme[] = ['UGT1A1', 'UGT2B7', 'FMO', 'AO'];
      for (const e of nonCyp) {
        if (!enzymeSet.includes(e)) {
          enzymeSet.push(e);
        }
      }
    }
  }

  // Warranted unless metabolism is clearly negligible.
  const warranted =
    metabolismMajorClearance ||
    (typeof fractionMetabolic === 'number' ? fractionMetabolic >= 0.25 : true);

  const approaches: string[] = [
    'Recombinant human enzymes (rhCYP/rhUGT): incubate the drug with individual recombinant enzymes to identify which can form each metabolite; scale with relative-activity or inter-system extrapolation factors.',
    'Selective chemical inhibition in human liver microsomes (HLM): co-incubate with enzyme-selective inhibitors and measure the reduction in metabolite formation to apportion fm.',
    'Correlation analysis across a characterized bank of individual-donor HLM: correlate metabolite-formation rate with marker activities for each enzyme to confirm the responsible enzyme.',
  ];

  const probeByEnzyme = new Map<PhenotypingEnzyme, EnzymeProbe>();
  for (const p of PHENOTYPING_PROBES) {
    probeByEnzyme.set(p.enzyme, p);
  }

  const fmByEnzyme = new Map<PhenotypingEnzyme, number>();
  if (preliminaryFm) {
    for (const f of preliminaryFm) {
      fmByEnzyme.set(f.enzyme, f.fm);
    }
  }

  const enzymePlan: EnzymePhenotypingPlan[] = enzymeSet.map((e: PhenotypingEnzyme) => {
    const probe = probeByEnzyme.get(e);
    const fm = fmByEnzyme.get(e);
    const plan: EnzymePhenotypingPlan = {
      enzyme: e,
      selectiveInhibitor: probe ? probe.selectiveInhibitor : 'pathway-specific',
      marker: probe ? probe.marker : 'pathway-specific',
    };
    if (typeof fm === 'number') {
      plan.estimatedFm = fm;
      plan.clinicallyMeaningful = fm >= 0.25;
    }
    return plan;
  });

  const majorEnzymes: PhenotypingEnzyme[] = enzymePlan
    .filter((p: EnzymePhenotypingPlan) => p.clinicallyMeaningful === true)
    .map((p: EnzymePhenotypingPlan) => p.enzyme);

  const fmInterpretation: string[] = [
    'Fraction metabolized (fm) by an enzyme is the fraction of total elimination attributable to that pathway; estimate it by combining the three approaches.',
    'A pathway with fm >= 0.25 is generally considered clinically meaningful: a strong inhibitor of that enzyme could roughly double or more the drug exposure (victim-DDI), and a polymorphic enzyme could create poor-metabolizer subpopulations.',
    'When a single enzyme accounts for fm >= 0.5, the drug is a sensitive victim of that pathway; clinical index-inhibitor/inducer DDI studies for that enzyme are typically expected (handled by clinical DDI assessment, not this nonclinical engine).',
    'Reconcile the in-vitro fm with the overall metabolic fraction of clearance (fm,metabolic) so that the sum of pathway fm values is consistent with total clearance.',
  ];

  const warnings: string[] = [];
  if (!warranted) {
    warnings.push(
      'Metabolism does not appear to be a major clearance route — reaction phenotyping can be limited in scope; characterize renal/biliary excretion and transporter substrate status instead.',
    );
  }
  if (preliminaryFm) {
    const total = preliminaryFm.reduce((acc: number, f: { enzyme: PhenotypingEnzyme; fm: number }) => acc + f.fm, 0);
    if (total > 1.0001) {
      warnings.push(
        `Provided preliminary fm values sum to ${Math.round(total * 100) / 100} (> 1) — recheck; pathway fm values cannot exceed total metabolism.`,
      );
    }
  }
  if (nonCypSuspected) {
    warnings.push(
      'Non-CYP metabolism suspected — UGT, FMO, and aldehyde oxidase require specialized incubation conditions (e.g., heat-inactivation control for FMO; cytosol/S9 for AO); standard HLM phenotyping will miss them.',
    );
  }

  const citations: Citation[] = [
    { source: CITATIONS.FDA_IN_VITRO_DDI, detail: 'Reaction-phenotyping approaches and fm-based victim-DDI flagging.' },
    { source: CITATIONS.ICH_M12, detail: 'In-vitro reaction-phenotyping expectations and enzyme panel.' },
  ];

  const summary = warranted
    ? `Reaction phenotyping across ${enzymeSet.length} enzyme(s) using recombinant enzymes + selective inhibitors + correlation analysis; ${
        majorEnzymes.length > 0 ? `clinically meaningful pathway(s): ${majorEnzymes.join(', ')}` : 'fm to be estimated for each pathway'
      }.`
    : 'Reaction phenotyping is limited in scope because metabolism is not a major clearance route; focus on excretion and transporter status.';

  return {
    warranted,
    approaches,
    enzymePlan,
    fmInterpretation,
    majorEnzymes,
    warnings,
    citations,
    summary,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Plasma protein binding
// ─────────────────────────────────────────────────────────────────────────────

/** A single species' protein-binding measurement. */
export interface SpeciesBindingInput {
  species: string;
  /** Fraction unbound (fu), 0-1. Provide this OR percentBound. */
  fractionUnbound?: number;
  /** Percent bound (0-100). Provide this OR fractionUnbound. */
  percentBound?: number;
}

export interface AssessProteinBindingParams {
  /** Per-species binding data; should include human plus the tox species. */
  speciesData: SpeciesBindingInput[];
  /** Method used / planned. */
  method?: 'equilibrium_dialysis' | 'ultrafiltration' | 'ultracentrifugation' | 'other';
  /** Whether binding is suspected to be concentration-dependent (saturable). */
  concentrationDependentSuspected?: boolean;
  /** Whether the drug is highly bound (informs free-fraction sensitivity). */
  drugName?: string;
}

/** Normalized per-species binding result. */
export interface SpeciesBindingResult {
  species: string;
  fractionUnbound: number;
  percentBound: number;
  /** Binding category descriptor. */
  category: string;
}

export interface AssessProteinBindingResult {
  method: NonNullable<AssessProteinBindingParams['method']>;
  perSpecies: SpeciesBindingResult[];
  /** Human fraction unbound, if human data present. */
  humanFractionUnbound?: number;
  /** Highest cross-species fu difference (fold). */
  maxSpeciesFoldDifference?: number;
  /** Method guidance. */
  methodGuidance: string[];
  /** Interpretation for free-drug exposure and DDI. */
  freepDrugImplications: string[];
  warnings: string[];
  citations: Citation[];
  summary: string;
}

function bindingCategory(fu: number): string {
  if (fu < 0.01) return 'very_high_binding (>99% bound)';
  if (fu < 0.1) return 'high_binding (90-99% bound)';
  if (fu < 0.3) return 'moderate_binding (70-90% bound)';
  return 'low_binding (<70% bound)';
}

/**
 * assessProteinBinding — plasma protein binding assessment: method, fraction
 * unbound, cross-species comparison, and implications for free-drug exposure
 * and DDI.
 */
export function assessProteinBinding(
  params: AssessProteinBindingParams,
): AssessProteinBindingResult {
  const {
    speciesData,
    method = 'equilibrium_dialysis',
    concentrationDependentSuspected = false,
  } = params;

  const perSpecies: SpeciesBindingResult[] = speciesData.map((d: SpeciesBindingInput) => {
    let fu: number;
    if (typeof d.fractionUnbound === 'number') {
      fu = d.fractionUnbound;
    } else if (typeof d.percentBound === 'number') {
      fu = 1 - d.percentBound / 100;
    } else {
      fu = NaN;
    }
    // Clamp into [0,1] for safety in derived metrics.
    const fuClamped = Number.isFinite(fu) ? Math.min(1, Math.max(0, fu)) : NaN;
    const pctBound = Number.isFinite(fuClamped) ? Math.round((1 - fuClamped) * 10000) / 100 : NaN;
    return {
      species: d.species,
      fractionUnbound: Number.isFinite(fuClamped) ? Math.round(fuClamped * 10000) / 10000 : NaN,
      percentBound: pctBound,
      category: Number.isFinite(fuClamped) ? bindingCategory(fuClamped) : 'undetermined',
    };
  });

  const humanEntry = perSpecies.find(
    (p: SpeciesBindingResult) => p.species.toLowerCase().includes('human'),
  );
  const humanFractionUnbound = humanEntry && Number.isFinite(humanEntry.fractionUnbound)
    ? humanEntry.fractionUnbound
    : undefined;

  // Cross-species fold difference of fu.
  const validFus = perSpecies
    .map((p: SpeciesBindingResult) => p.fractionUnbound)
    .filter((v: number) => Number.isFinite(v) && v > 0);
  let maxSpeciesFoldDifference: number | undefined;
  if (validFus.length >= 2) {
    const minFu = Math.min(...validFus);
    const maxFu = Math.max(...validFus);
    maxSpeciesFoldDifference = Math.round((maxFu / minFu) * 100) / 100;
  }

  const methodGuidance: string[] = [
    'Equilibrium dialysis is the reference method for plasma protein binding; it avoids the non-specific binding and volume-shift artifacts of ultrafiltration and ultracentrifugation.',
    'Confirm assay recovery, equilibrium time, and absence of drug instability or non-specific binding to the apparatus.',
    'Measure at multiple concentrations spanning the expected therapeutic range to detect saturable (concentration-dependent) binding.',
    'Use the SAME method across species so the cross-species comparison is internally consistent.',
  ];
  if (method !== 'equilibrium_dialysis') {
    methodGuidance.push(
      `Method specified is ${method}; if ultrafiltration/ultracentrifugation is used, correct for non-specific binding and validate against equilibrium dialysis for highly bound compounds.`,
    );
  }

  const freeDrugImplications: string[] = [
    'Only the unbound (free) drug is available to distribute, bind targets, be metabolized, and be eliminated — interpret exposure and safety margins on a free (unbound) basis when binding differs across species.',
    'When binding differs markedly between the tox species and human, recompute the exposure margin using unbound exposure (fu × total) rather than total exposure.',
    'For highly bound drugs (fu < 0.1), small absolute changes in binding produce large relative changes in free fraction — free-drug interpretation is especially important.',
    'Protein binding (fu) is a required input to in-vitro DDI parameters (e.g., unbound inhibitor concentrations for IC50/Ki interpretation and basic-model DDI predictions).',
  ];

  const warnings: string[] = [];
  if (!humanEntry) {
    warnings.push('No human plasma data provided — add human binding to anchor the cross-species comparison and free-drug margins.');
  }
  if (typeof maxSpeciesFoldDifference === 'number' && maxSpeciesFoldDifference >= 3) {
    warnings.push(
      `Large cross-species difference in fraction unbound (~${maxSpeciesFoldDifference}-fold) — free-drug-based margin framing is essential; total-exposure margins could mislead.`,
    );
  }
  if (concentrationDependentSuspected) {
    warnings.push(
      'Concentration-dependent (saturable) binding suspected — characterize fu across the therapeutic range; a single fu value may not apply at high (tox) exposures.',
    );
  }
  for (const p of perSpecies) {
    if (!Number.isFinite(p.fractionUnbound)) {
      warnings.push(`Binding for "${p.species}" could not be computed — provide fractionUnbound or percentBound.`);
    }
  }

  const citations: Citation[] = [
    { source: CITATIONS.ICH_S3A, detail: 'Free-drug exposure and protein-binding context for exposure margins.' },
    { source: CITATIONS.FDA_IN_VITRO_DDI, detail: 'Protein binding (fu) as an input to in-vitro DDI parameter interpretation.' },
  ];

  const summary =
    typeof humanFractionUnbound === 'number'
      ? `Plasma protein binding by ${method}: human fu = ${humanFractionUnbound}${
          typeof maxSpeciesFoldDifference === 'number' ? `, cross-species fu spread ~${maxSpeciesFoldDifference}-fold` : ''
        }; interpret margins on a free-drug basis.`
      : `Plasma protein binding by ${method}: provide human plasma data to anchor free-drug margins.`;

  return {
    method,
    perSpecies,
    humanFractionUnbound,
    maxSpeciesFoldDifference,
    methodGuidance,
    freepDrugImplications: freeDrugImplications,
    warnings,
    citations,
    summary,
  };
}
