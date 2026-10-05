/**
 * Cross-Jurisdictional Intelligence Engine
 *
 * Provides regulatory divergence mapping across FDA, EMA, PMDA, NMPA and
 * identifies reliance pathways, filing sequence optimization, and
 * harmonization frameworks (ICH, Access Consortium, Project Orbis).
 *
 * PMDA positions carry their basis (`basis`, rendered into `guidanceRef`); the
 * paediatric position and consultation names come from ind/ctd/jp-programs.ts.
 * Until 2026-10-05 they claimed, unsourced, bridging "mandatory per ICH E5", a
 * required Japanese comparator and QT study, zone IVa and "no mandatory"
 * paediatric plan. Every Japan basis is `recall` (DECISIONS.md #26; facts in
 * docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-05-record/g-jp-data-claims-truth-facts.md).
 *
 * @module server/services/cross-jurisdictional-intelligence
 */

import { createScopedLogger } from '../utils/logger';
import { getSubmissionTypeContext } from '../../shared/regulatory/submission-type-bridge.js';
import { basisLabel, type RegulatoryBasis } from '../../shared/regulatory/regulatory-basis.js';
import { getJpProgram } from './ind/ctd/jp-programs.js';

const log = createScopedLogger('cross-jurisdictional');

// ─── Types ───────────────────────────────────────────────────────────────────

export interface JurisdictionInput {
  submissionType: string;
  therapeuticArea?: string;
  indication?: string;
  targetAgencies?: string[];
  productType?: string;
}

export interface DivergenceItem {
  domain: 'clinical' | 'cmc' | 'safety' | 'labeling' | 'regulatory_pathway';
  topic: string;
  agencies: AgencyPosition[];
  divergenceLevel: 'aligned' | 'minor' | 'significant' | 'incompatible';
  harmonizationGuidance: string;
  ichReference?: string;
}

export interface AgencyPosition {
  agency: string;
  position: string;
  /** The position's bases as a reader sees them (each says whether it was checked against the regulator's text). */
  guidanceRef?: string;
  /** Where the position comes from. Set for every PMDA position. */
  basis?: readonly RegulatoryBasis[];
}

export interface ReliancePathway {
  name: string;
  referenceAgency: string;
  relyingAgencies: string[];
  applicableSubmissionTypes: string[];
  timelineSavings: string;
  requirements: string[];
  limitations: string[];
}

export interface FilingSequenceOption {
  sequence: string[];
  rationale: string;
  totalTimeline: string;
  riskLevel: 'low' | 'medium' | 'high';
  advantages: string[];
  disadvantages: string[];
}

export interface HarmonizationFramework {
  name: string;
  description: string;
  memberAgencies: string[];
  applicableTo: string[];
  benefits: string[];
  requirements: string[];
}

export interface CrossJurisdictionalResult {
  submissionType: string;
  targetAgencies: string[];
  divergences: DivergenceItem[];
  reliancePathways: ReliancePathway[];
  filingSequences: FilingSequenceOption[];
  harmonizationFrameworks: HarmonizationFramework[];
  summary: {
    totalDivergences: number;
    significantDivergences: number;
    availablePathways: number;
    recommendedSequence: string;
  };
}

// ─── Japan: bases and record-derived positions ──────────────────────────────

const SEARCH_EXTRACT = 'Search extract of the regulator-hosted copy on 2026-10-05; the document was not read (egress blocked). Re-read owed.';

/** ICH E5 and the 2023 MHLW notice on a Japanese Phase 1 before an MRCT. */
const JP_DATA_BASIS: readonly RegulatoryBasis[] = [
  { ref: 'ICH E5(R1) Ethnic factors in the acceptability of foreign clinical data', confidence: 'recall', note: "Bridging need is judged from the drug's sensitivity to ethnic factors; not a standing requirement." },
  { ref: 'MHLW notice 医薬薬審発1225第2号 (2023-12-25): Japanese Phase 1 study before an MRCT, for drugs developed first overseas', confidence: 'recall', url: 'https://www.mhlw.go.jp/content/10601000/001270513.pdf', note: `${SEARCH_EXTRACT} PMDA copy: https://www.pmda.go.jp/files/000266148.pdf.` },
];
const JP_Q1A_BASIS: RegulatoryBasis = { ref: 'ICH Q1A(R2) Stability testing of new drug substances and products', confidence: 'recall', url: 'https://database.ich.org/sites/default/files/Q1A(R2)%20Guideline.pdf', note: SEARCH_EXTRACT };

/** What AnA says about Japanese data wherever a position needs it. */
const JP_PHASE1_BEFORE_MRCT = 'a Japanese Phase 1 study before joining an MRCT is in principle not required where safety and tolerability at the MRCT dose can be judged from existing data (MHLW 2023-12-25, 医薬薬審発1225第2号)';
const JP_TRIAL_CONSULTATION = getJpProgram('pmda-consultation-clinical-trial');
const JP_PEDIATRIC_PLAN = getJpProgram('jp-pediatric-development-plan');
/** The PMDA paediatric position, read from the jp-programs record. */
const JP_PEDIATRIC_POSITION = `${JP_PEDIATRIC_PLAN.name} (${JP_PEDIATRIC_PLAN.nameJa}), in force from ${JP_PEDIATRIC_PLAN.effectiveFrom}. ${JP_PEDIATRIC_PLAN.timing ?? ''}`.trim();
const consultInJapan = `PMDA ${JP_TRIAL_CONSULTATION.name.toLowerCase()} (${JP_TRIAL_CONSULTATION.nameJa})`;

/** A position's basis and its rendering for the reader; nothing when the position has none recorded. */
function withBasis(basis: readonly RegulatoryBasis[] | undefined): Pick<AgencyPosition, 'basis' | 'guidanceRef'> {
  return basis ? { basis, guidanceRef: basis.map(basisLabel).join('; ') } : {};
}

// ─── Engine ──────────────────────────────────────────────────────────────────

export class CrossJurisdictionalEngine {

  async analyze(input: JurisdictionInput): Promise<CrossJurisdictionalResult> {
    log.info(`Cross-jurisdictional analysis: ${input.submissionType}, agencies: ${input.targetAgencies?.join(', ') || 'all'}`);

    // Resolve submission type through canonical bridge for international type support
    const registryCtx = getSubmissionTypeContext(input.submissionType);
    const resolvedAgencies = input.targetAgencies?.length
      ? input.targetAgencies
      : registryCtx
        ? [registryCtx.agency, ...['FDA', 'EMA', 'PMDA', 'NMPA'].filter(a => a !== registryCtx.agency)]
        : ['FDA', 'EMA', 'PMDA', 'NMPA'];

    const agencies = resolvedAgencies;

    const divergences = this.analyzeDivergences(input, agencies);
    const reliancePathways = this.findReliancePathways(input, agencies);
    const filingSequences = this.optimizeFilingSequence(input, agencies);
    const harmonizationFrameworks = this.findHarmonizationFrameworks(input, agencies);

    const significantDivergences = divergences.filter(
      d => d.divergenceLevel === 'significant' || d.divergenceLevel === 'incompatible'
    ).length;

    return {
      submissionType: input.submissionType,
      targetAgencies: agencies,
      divergences,
      reliancePathways,
      filingSequences,
      harmonizationFrameworks,
      summary: {
        totalDivergences: divergences.length,
        significantDivergences,
        availablePathways: reliancePathways.length,
        recommendedSequence: filingSequences[0]?.sequence.join(' → ') || agencies.join(' → '),
      },
    };
  }

  private analyzeDivergences(input: JurisdictionInput, agencies: string[]): DivergenceItem[] {
    const divergences: DivergenceItem[] = [];

    // Clinical divergences
    const clinicalDivergences: Array<{
      topic: string;
      positions: Record<string, string>;
      /** The basis of each agency's position, by agency. */
      bases?: Record<string, readonly RegulatoryBasis[]>;
      level: DivergenceItem['divergenceLevel'];
      harmonization: string;
      ich?: string;
    }> = [
      {
        topic: 'Primary Endpoint Acceptance',
        positions: {
          FDA: 'Requires hard clinical endpoints or validated surrogates per FDA guidance',
          EMA: 'Accepts patient-reported outcomes (PROs) more readily; CHMP scientific advice recommended',
          PMDA: `Need for Japanese-population data is judged case by case under ICH E5; ${JP_PHASE1_BEFORE_MRCT}. Agree endpoint acceptability in a ${consultInJapan}.`,
          NMPA: 'Requires China-specific clinical data or multi-regional clinical trial (MRCT) with Chinese sites',
        },
        bases: { PMDA: [...JP_DATA_BASIS, ...JP_TRIAL_CONSULTATION.basis] },
        level: 'significant',
        harmonization: 'Use ICH E17 MRCT framework to design a single global trial acceptable to all agencies',
        ich: 'ICH E17',
      },
      {
        topic: 'Comparator Selection',
        positions: {
          FDA: 'Placebo-controlled preferred; active comparator acceptable for ethical reasons',
          EMA: 'Active comparator preferred — must reflect EU standard of care',
          PMDA: `No Japan-specific comparator requirement is recorded; ICH E10 applies. Agree the comparator in a ${consultInJapan}.`,
          NMPA: 'China-approved comparator required; may differ from US/EU standard',
        },
        bases: { PMDA: [{ ref: 'ICH E10 Choice of control group in clinical trials', confidence: 'recall' }, ...JP_TRIAL_CONSULTATION.basis] },
        level: 'significant',
        harmonization: 'Pre-submission scientific advice with each agency; consider adaptive design with multiple comparator arms',
        ich: 'ICH E10',
      },
      {
        topic: 'Pediatric Requirements',
        positions: {
          FDA: 'PREA/BPCA mandate; Pediatric Study Plan required unless waiver/deferral granted',
          EMA: 'Paediatric Investigation Plan (PIP) required at time of MAA; PDCO agreement needed',
          PMDA: JP_PEDIATRIC_POSITION,
          NMPA: 'Pediatric data not always required; case-by-case assessment',
        },
        bases: { PMDA: JP_PEDIATRIC_PLAN.basis },
        level: 'significant',
        harmonization: 'Submit PIP to EMA early (before Phase 2); align FDA PSP timing; use ICH E11(R1) as common framework',
        ich: 'ICH E11(R1)',
      },
      {
        topic: 'Ethnic Sensitivity / Bridging',
        positions: {
          FDA: 'Generally accepts global data without bridging for most indications',
          EMA: 'Accepts global data; no routine bridging requirement',
          PMDA: `Need for Japanese data (a bridging study, Japanese subjects in an MRCT, or neither) is judged case by case under ICH E5 from the drug's sensitivity to ethnic factors; ${JP_PHASE1_BEFORE_MRCT}.`,
          NMPA: 'Chinese patient data required; MRCT with adequate Chinese enrollment or local study',
        },
        bases: { PMDA: JP_DATA_BASIS },
        level: 'significant',
        harmonization: 'Design MRCT per ICH E17 with adequate enrollment in Japan and China; pre-agree sample sizes with PMDA/NMPA',
        ich: 'ICH E5/E17',
      },
    ];

    // CMC divergences
    const cmcDivergences: Array<typeof clinicalDivergences[number]> = [
      {
        topic: 'Stability Testing Requirements',
        positions: {
          FDA: 'ICH Q1A conditions; 25°C/60% RH long-term; 12 months minimum at filing',
          EMA: 'ICH Q1A/Q1B; Zone II conditions; photostability per Q1B required',
          PMDA: 'ICH Q1A(R2) applies: its long-term conditions (25 °C/60% RH, or 30 °C/65% RH) were set for climatic zones I and II, the three regions EU, Japan and US; data generated in one of the three regions is acceptable in the others',
          NMPA: 'Zone IVb (hot/very humid) conditions; 40°C/75% RH accelerated; 6-month minimum',
        },
        bases: { PMDA: [JP_Q1A_BASIS] },
        level: 'minor',
        harmonization: 'Design stability program covering all ICH climatic zones (I-IVb) from initial registration batches',
        ich: 'ICH Q1A-Q1E',
      },
      {
        topic: 'Process Validation',
        positions: {
          FDA: 'Lifecycle approach per 2011 guidance; PPQ at commercial scale before approval',
          EMA: 'Annex 15 / ICH Q8-Q10; process validation can use QbD approach',
          PMDA: 'Follows ICH Q8-Q10; GMP inspection prior to approval',
          NMPA: 'Process validation at Chinese manufacturing site if local production; GMP certificate required',
        },
        bases: { PMDA: [{ ref: 'ICH Q8–Q10; PMD Act GMP conformity inspection (GMP適合性調査)', confidence: 'recall' }] },
        level: 'minor',
        harmonization: 'Implement ICH Q8-Q12 Quality by Design framework globally; schedule GMP inspections with all target agencies',
        ich: 'ICH Q8-Q12',
      },
    ];

    // Safety divergences
    const safetyDivergences: Array<typeof clinicalDivergences[number]> = [
      {
        topic: 'Risk Management',
        positions: {
          FDA: 'REMS with ETASU if significant risk; MedWatch for post-market',
          EMA: 'Risk Management Plan (RMP) mandatory with every MAA; PSUR/PBRER required',
          PMDA: 'Risk Management Plan required; Japanese-specific AE reporting timelines',
          NMPA: 'Periodic Safety Update Reports; China-specific pharmacovigilance database',
        },
        bases: { PMDA: [{ ref: 'MHLW Risk Management Plan guidance (医薬品リスク管理計画指針); PMD Act adverse reaction reporting', confidence: 'recall' }] },
        level: 'minor',
        harmonization: 'Develop single global RMP framework; tailor risk minimization measures per jurisdiction; align PBRER/PSUR timelines',
        ich: 'ICH E2E',
      },
      {
        topic: 'Cardiovascular Safety Assessment',
        positions: {
          FDA: 'ICH E14 thorough QT study required; CV outcome trial for diabetes drugs',
          EMA: 'E14 QT study; concentration-QTc analysis accepted; CV safety meta-analysis for certain classes',
          PMDA: 'ICH E14 and the ICH E14/S7B Q&As apply; no Japan-specific QT study requirement is recorded',
          NMPA: 'QT study data required; may request China-specific CV safety data',
        },
        bases: { PMDA: [{ ref: 'ICH E14 Clinical evaluation of QT/QTc interval prolongation; ICH E14/S7B Q&As', confidence: 'recall' }] },
        level: 'minor',
        harmonization: 'Conduct concentration-QTc analysis per ICH E14 Q&A; settle any region-specific QT data needs with each agency',
        ich: 'ICH E14/S7B',
      },
    ];

    // Filter and build divergences
    const allDivergences = [
      ...clinicalDivergences.map(d => ({ ...d, domain: 'clinical' as const })),
      ...cmcDivergences.map(d => ({ ...d, domain: 'cmc' as const })),
      ...safetyDivergences.map(d => ({ ...d, domain: 'safety' as const })),
    ];

    for (const d of allDivergences) {
      const agencyPositions: AgencyPosition[] = agencies
        .filter(a => d.positions[a])
        .map(a => ({ agency: a, position: d.positions[a], ...withBasis(d.bases?.[a]) }));

      if (agencyPositions.length >= 2) {
        divergences.push({
          domain: d.domain,
          topic: d.topic,
          agencies: agencyPositions,
          divergenceLevel: d.level,
          harmonizationGuidance: d.harmonization,
          ichReference: d.ich,
        });
      }
    }

    return divergences;
  }

  private findReliancePathways(_input: JurisdictionInput, agencies: string[]): ReliancePathway[] {
    const allPathways: ReliancePathway[] = [
      {
        name: 'Project Orbis',
        referenceAgency: 'FDA',
        relyingAgencies: ['TGA (Australia)', 'Health Canada', 'Swissmedic', 'HSA (Singapore)', 'ANVISA (Brazil)'],
        applicableSubmissionTypes: ['NDA', 'BLA'],
        timelineSavings: '6-12 months vs sequential filing',
        requirements: [
          'Oncology indication (primarily)',
          'FDA as reference agency with concurrent review',
          'Participating agencies review FDA package simultaneously',
          'Local labeling adaptations permitted',
        ],
        limitations: [
          'Limited to oncology products (expanding to other TAs)',
          'Not all global agencies participate',
          'Local post-approval requirements still apply',
        ],
      },
      {
        name: 'Access Consortium (New Routes)',
        referenceAgency: 'Multiple (work-sharing)',
        relyingAgencies: ['TGA', 'Health Canada', 'Swissmedic', 'HSA', 'MHRA (UK)'],
        applicableSubmissionTypes: ['NDA', 'BLA', 'MAA'],
        timelineSavings: '3-6 months via parallel assessment',
        requirements: [
          'Novel active substance or significant indication extension',
          'Dossier in CTD format',
          'Reference and concerned member agreement',
          'GMP compliance in member jurisdictions',
        ],
        limitations: [
          'Does not include FDA, EMA, PMDA, or NMPA',
          'Each member retains independent decision authority',
          'Local labeling requirements differ',
        ],
      },
      {
        name: 'ICH Common Technical Document (CTD)',
        referenceAgency: 'ICH',
        relyingAgencies: ['FDA', 'EMA', 'PMDA', 'NMPA', 'Health Canada', 'TGA', 'Swissmedic'],
        applicableSubmissionTypes: ['NDA', 'BLA', 'MAA', 'ANDA', '505(b)(2)'],
        timelineSavings: 'Foundation for all submissions — eliminates reformatting',
        requirements: [
          'Module 1: Region-specific (different per agency)',
          'Modules 2-5: Common across all ICH regions',
          'eCTD electronic format mandatory in most regions',
        ],
        limitations: [
          'Module 1 always requires local adaptation',
          'Regional annexes and local requirements persist',
          'NMPA may require Chinese-language documents',
        ],
      },
      {
        name: 'WHO Prequalification Reliance',
        referenceAgency: 'WHO',
        relyingAgencies: ['Multiple LMIC regulatory agencies'],
        applicableSubmissionTypes: ['NDA', 'BLA', 'ANDA'],
        timelineSavings: 'Enables access to 100+ countries via LMIC reliance',
        requirements: [
          'WHO prequalification listing',
          'Prior approval by stringent regulatory authority (SRA)',
          'GMP compliance verified by WHO inspection',
        ],
        limitations: [
          'Not applicable for initial registration in major markets',
          'Limited to essential medicines list products',
          'Country-specific requirements may still apply',
        ],
      },
      {
        name: 'MDSAP (Medical Device)',
        referenceAgency: 'Multiple',
        relyingAgencies: ['FDA', 'Health Canada', 'TGA', 'ANVISA', 'MHLW/PMDA'],
        applicableSubmissionTypes: ['510(k)', 'PMA', 'De Novo'],
        timelineSavings: 'Single audit accepted by 5 regulatory authorities',
        requirements: [
          'Certified MDSAP auditing organization',
          'QMS compliance per ISO 13485 + country-specific requirements',
          'Annual surveillance audits',
        ],
        limitations: [
          'Does not replace product registration/clearance',
          'EMA/EU not participating (uses EU MDR)',
          'NMPA not participating',
        ],
      },
    ];

    // Filter based on target agencies
    return allPathways.filter(p => {
      const allRelevantAgencies = [p.referenceAgency, ...p.relyingAgencies];
      return agencies.some(a => allRelevantAgencies.some(ra => ra.includes(a)));
    });
  }

  private optimizeFilingSequence(input: JurisdictionInput, agencies: string[]): FilingSequenceOption[] {
    const sequences: FilingSequenceOption[] = [];

    // Drug/biologic sequences
    if (['NDA', 'BLA', 'MAA', '505(b)(2)'].includes(input.submissionType)) {
      sequences.push(
        {
          sequence: ['FDA', 'EMA', 'PMDA', 'NMPA'],
          rationale: 'FDA-first maximizes global precedent and enables reliance pathways (Project Orbis, Access Consortium)',
          totalTimeline: '18-30 months for all 4 approvals',
          riskLevel: 'low',
          advantages: [
            'FDA approval is the strongest global reference',
            'Enables Project Orbis concurrent review (oncology)',
            'EMA MAA can reference FDA review findings',
            'PMDA/NMPA can leverage approved labeling as starting point',
          ],
          disadvantages: [
            'Japanese-data needs (ICH E5, judged case by case) must be settled with PMDA before the PMDA filing',
            'NMPA requires China-specific clinical data',
            'Sequential approach is slower overall',
          ],
        },
        {
          sequence: ['FDA + EMA (parallel)', 'PMDA', 'NMPA'],
          rationale: 'Parallel FDA/EMA filing reduces total timeline; suitable when CTD is mature and both dossiers are ready',
          totalTimeline: '14-24 months for all 4 approvals',
          riskLevel: 'medium',
          advantages: [
            'Fastest path to US + EU approval',
            'Reduces total global timeline by 6-8 months',
            'Both agencies receive simultaneous scientific dialogue',
          ],
          disadvantages: [
            'Higher operational burden — dual scientific advice needed',
            'Divergent questions create parallel workstreams',
            'Risk of conflicting agency positions on same data',
          ],
        },
        {
          sequence: ['EMA', 'FDA', 'PMDA', 'NMPA'],
          rationale: 'EMA-first when EU is primary market or when conditional/accelerated pathway timing is favorable',
          totalTimeline: '20-30 months for all 4 approvals',
          riskLevel: 'medium',
          advantages: [
            'EMA centralised procedure provides 27-country access',
            'Conditional MA available for unmet medical need',
            'EU orphan designation provides market exclusivity',
          ],
          disadvantages: [
            'FDA may require additional data beyond EMA package',
            'PMDA and NMPA assess local-data needs independently',
            'Slower US market access',
          ],
        },
      );
    }

    // Device sequences
    if (['510(k)', 'PMA', 'De Novo'].includes(input.submissionType)) {
      sequences.push(
        {
          sequence: ['FDA', 'EU (MDR)', 'PMDA', 'NMPA'],
          rationale: 'FDA 510(k)/PMA first, then EU MDR CE marking, then Asia-Pacific',
          totalTimeline: '12-24 months for all 4 regions',
          riskLevel: 'low',
          advantages: [
            'FDA clearance/approval is globally recognized',
            'MDSAP audit covers FDA + 4 other jurisdictions',
            'EU MDR Notified Body process can run in parallel',
          ],
          disadvantages: [
            'EU MDR timeline is unpredictable (Notified Body capacity)',
            'PMDA requires Japanese clinical data for high-risk devices',
            'NMPA requires CFDA registration testing in Chinese labs',
          ],
        },
      );
    }

    return sequences;
  }

  private findHarmonizationFrameworks(_input: JurisdictionInput, agencies: string[]): HarmonizationFramework[] {
    const frameworks: HarmonizationFramework[] = [
      {
        name: 'ICH (International Council for Harmonisation)',
        description: 'Global harmonization of technical requirements for pharmaceuticals — Quality (Q), Safety (S), Efficacy (E), Multidisciplinary (M)',
        memberAgencies: ['FDA', 'EMA', 'PMDA', 'NMPA', 'Health Canada', 'Swissmedic', 'TGA', 'ANVISA', 'MHRA'],
        applicableTo: ['NDA', 'BLA', 'MAA', 'ANDA', '505(b)(2)', 'IND'],
        benefits: [
          'Common Technical Document (CTD) format accepted globally',
          'Harmonized stability testing (Q1), validation (Q2), impurities (Q3)',
          'Common clinical trial design principles (E6 GCP, E8, E9)',
          'Reduces duplicate studies across regions',
        ],
        requirements: [
          'Adherence to ICH guidelines is expected, not always legally binding',
          'Region-specific Module 1 still required',
          'Implementation timelines vary by member agency',
        ],
      },
      {
        name: 'Access Consortium',
        description: 'Coalition of medium-sized regulatory agencies enabling work-sharing for new drug assessments',
        memberAgencies: ['TGA', 'Health Canada', 'HSA', 'Swissmedic', 'MHRA'],
        applicableTo: ['NDA', 'BLA', 'MAA'],
        benefits: [
          'Parallel assessment reduces time to multiple approvals',
          'Work-sharing reduces reviewer burden and sponsor costs',
          'New Active Substance Work Sharing (NASWS) pathway',
          'Generic medicines work-sharing available',
        ],
        requirements: [
          'Novel active substance or significant line extension',
          'CTD-format dossier',
          'Agreement from reference + concerned members',
        ],
      },
      {
        name: 'Project Orbis',
        description: 'FDA-led framework for concurrent submission and review of oncology products',
        memberAgencies: ['FDA', 'TGA', 'Health Canada', 'Swissmedic', 'HSA', 'ANVISA'],
        applicableTo: ['NDA', 'BLA'],
        benefits: [
          'Simultaneous review by 6+ agencies',
          'FDA serves as reference reviewer',
          'Dramatically reduces global oncology access timeline',
          'Patient access in smaller markets accelerated',
        ],
        requirements: [
          'Oncology indication (expanding to other TAs)',
          'FDA submission as reference',
          'Participating agency opt-in',
        ],
      },
      {
        name: 'IMDRF (International Medical Device Regulators Forum)',
        description: 'Global harmonization for medical devices — successor to GHTF',
        memberAgencies: ['FDA', 'EU (EC)', 'PMDA', 'NMPA', 'Health Canada', 'TGA', 'ANVISA', 'HSA', 'MHRA'],
        applicableTo: ['510(k)', 'PMA', 'De Novo'],
        benefits: [
          'Harmonized device classification principles',
          'MDSAP single-audit program',
          'Common UDI framework',
          'Standardized adverse event terminology (IMDRF codes)',
        ],
        requirements: [
          'Voluntary adoption — not legally binding',
          'Each member implements through local regulation',
        ],
      },
    ];

    return frameworks.filter(f =>
      f.memberAgencies.some(m => agencies.some(a => m.includes(a)))
    );
  }
}

export const crossJurisdictionalEngine = new CrossJurisdictionalEngine();
