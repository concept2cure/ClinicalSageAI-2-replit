/**
 * Oncology therapeutic-area profile (Feature 2.7).
 *
 * Covers:
 *   - Accelerated approval / surrogate endpoint posture
 *   - Confirmatory trial commitment expectations
 *   - REMS awareness (genotoxic / hematologic toxicity)
 *   - ODAC precedent surfacing
 *   - Project Optimus dose-optimization expectations
 *
 * @module server/services/ana/therapeutic-area-profiles/oncology
 */
import type { TherapeuticAreaProfile } from './types.js';

export const oncologyProfile: TherapeuticAreaProfile = {
  id: 'oncology',
  displayName: 'Oncology',
  description:
    'Adapts AnA for oncology submissions: accelerated-pathway logic, ' +
    'surrogate-endpoint scrutiny, dose-optimization (Project Optimus), ' +
    'REMS awareness, and FDA ODAC precedent.',

  contextRules: [
    {
      id: 'onc-accelerated-surrogate-justification',
      scope: 'section',
      appliesTo: '2.5',
      triggerKeywords: ['accelerated', 'surrogate', 'response rate', 'PFS', 'ORR'],
      instruction:
        'When the clinical strategy relies on a surrogate endpoint (e.g. ORR, PFS, MRD), the Module 2.5 narrative MUST justify why the surrogate is reasonably likely to predict clinical benefit and cite the FDA Surrogate Endpoint Table evidence. State the planned confirmatory trial design + endpoints + post-marketing commitment.',
      severity: 'critical',
      guidanceRef: 'FDA Guidance: Clinical Trial Endpoints for Approval of Cancer Drugs and Biologics (2018)',
    },
    {
      id: 'onc-confirmatory-trial-commitment',
      scope: 'always',
      triggerKeywords: ['accelerated approval', 'subpart H'],
      instruction:
        'Accelerated approval requires a confirmatory trial commitment with a specified endpoint, sample size, and timeline. Flag any draft that proposes accelerated approval without a documented post-marketing requirement (PMR) for the confirmatory trial.',
      severity: 'critical',
      guidanceRef: '21 CFR 314.510 (Subpart H) and 21 CFR 601.41 (Subpart E)',
    },
    {
      id: 'onc-project-optimus-dose-finding',
      scope: 'module',
      appliesTo: '2',
      triggerKeywords: ['dose', 'MTD', 'RP2D', 'dose escalation'],
      instruction:
        "Per FDA's Project Optimus, randomized dose-finding (≥2 doses) is now expected before pivotal study initiation. Drafts that establish RP2D solely from MTD/single-dose 3+3 should flag the absence of randomized dose comparison and propose a remediation plan.",
      severity: 'major',
      guidanceRef: 'FDA Project Optimus initiative (2023)',
    },
    {
      id: 'onc-rems-genotoxic',
      scope: 'section',
      appliesTo: '1.16',
      instruction:
        'For genotoxic/teratogenic oncology agents (e.g. lenalidomide-class, mTOR inhibitors), draft Module 1.16 with a REMS strategy including pregnancy testing, contraception requirements, and prescriber certification. Reference FDA REMS Assessment templates.',
      severity: 'major',
      guidanceRef: '21 USC 355-1; FDA REMS guidance',
    },
    {
      id: 'onc-odac-precedent',
      scope: 'always',
      triggerKeywords: ['ODAC', 'advisory committee', 'precedent'],
      instruction:
        'When the indication has had a recent ODAC vote (positive or negative), surface the ODAC briefing document and FDA response in the strategy section. Reviewers will reference ODAC precedent; not addressing it is a flag.',
      severity: 'minor',
    },
    {
      id: 'onc-pediatric-investigation-plan',
      scope: 'module',
      appliesTo: '1',
      instruction:
        'PREA / RACE Act for Cancer obligations: every adult oncology NDA/BLA needs a pediatric study plan addressing molecularly-targeted pediatric cancers, unless waiver/deferral is documented. EMA equivalent: PIP (Paediatric Investigation Plan).',
      severity: 'major',
      guidanceRef: 'FDA RACE Act for Cancer (2020); EMA PIP under Regulation (EC) 1901/2006',
    },
  ],

  riskFactors: [
    'Surrogate endpoint may not be on FDA Surrogate Endpoint Table — increases reviewer scrutiny',
    'Single-arm trial design without strong external control creates assessment uncertainty',
    'Cross-trial comparison of response rates is not interpretable without matched-adjusted analysis',
    'Genotoxic agent → REMS + pregnancy prevention program required',
    'Combination regimen → additive toxicity attribution must be addressed',
    'Tumor-agnostic indication → biomarker validation across each histology required',
    'OS readout in chronic indication may exceed PDUFA timeline → AA pathway likely',
    'Real-world evidence from oncology registries has reviewer-known reliability gaps',
  ],

  commonGaps: [
    {
      ctdSection: '2.5',
      patterns: ['benefit risk', 'overall benefit-risk'],
      description:
        'Benefit-risk narrative in Clinical Overview missing surrogate-endpoint-to-OS bridge or confirmatory trial commitment',
      severity: 'critical',
      guidanceRef: 'ICH M4E(R2)',
    },
    {
      ctdSection: '2.7.3',
      patterns: ['response rate', 'duration of response', 'forest plot'],
      description:
        'Efficacy summary missing ORR/DoR by sub-population (line of therapy, biomarker status, prior treatment)',
      severity: 'major',
      guidanceRef: 'FDA Guidance: Clinical Trial Endpoints for Cancer Drugs',
    },
    {
      ctdSection: '5.3.5.1',
      prefix: true,
      patterns: ['independent review committee', 'IRC', 'BICR'],
      description:
        'Pivotal CSR missing blinded independent central review (BICR) of imaging-based endpoints',
      severity: 'major',
      guidanceRef: 'FDA Guidance: Clinical Trial Imaging Endpoint Process Standards (2018)',
    },
    {
      ctdSection: '4.2.3',
      prefix: true,
      patterns: ['carcinogenicity', 'genotoxicity'],
      description:
        'Genotoxicity battery (Ames, in vitro mammalian, in vivo MN) not complete or not reported',
      severity: 'critical',
      guidanceRef: 'ICH S2(R1), ICH S9 (oncology-specific)',
    },
    {
      ctdSection: '1.16',
      patterns: ['REMS', 'risk management', 'pregnancy prevention'],
      description: 'REMS proposal missing for genotoxic/teratogenic agents',
      severity: 'major',
      guidanceRef: '21 USC 355-1',
    },
  ],

  guidanceRefs: [
    {
      code: 'ICH S9',
      authority: 'ICH',
      title: 'Nonclinical Evaluation for Anticancer Pharmaceuticals',
      why: 'Reduced nonclinical package for advanced cancer; sets expectations for first-in-human enabling studies',
    },
    {
      code: 'FDA Guidance: Clinical Trial Endpoints for Approval of Cancer Drugs and Biologics',
      authority: 'FDA',
      title: 'Clinical Trial Endpoints for Cancer Drug Approval',
      why: 'Defines acceptable endpoints (OS, PFS, ORR, MRD), conditions for accelerated approval',
    },
    {
      code: 'FDA Project Optimus',
      authority: 'FDA',
      title: 'Optimizing the Dose of Oncology Drug Products',
      why: 'Randomized dose-finding now expected before pivotal — major shift from MTD-only',
    },
    {
      code: 'EMA Anticancer Guideline',
      authority: 'EMA',
      title: 'Guideline on the Evaluation of Anticancer Medicinal Products in Man (EMA/CHMP/205/95)',
      why: 'EU equivalent of FDA endpoint guidance + tumor-type considerations',
    },
    {
      code: 'ICH E20',
      authority: 'ICH',
      title: 'Adaptive Designs for Clinical Trials',
      why: 'Common in oncology — basket / umbrella / platform trial methodology guardrails',
    },
  ],

  reviewerExpectations: [
    'OS or OS-surrogate with regulatory precedent',
    'Confirmatory trial commitment with specific endpoint + timeline (if AA)',
    'BICR for imaging endpoints in pivotal trial',
    'Subgroup analysis by line of therapy, biomarker status, prior treatments',
    'Cross-trial comparison should use matched-adjusted indirect comparison (MAIC), not naive comparison',
    'Project Optimus-aligned dose justification',
    'Pediatric investigation plan or RACE Act / PREA waiver',
    'REMS strategy for genotoxic/teratogenic agents',
    'Real-world data sources should disclose known limitations + reliability assessment',
  ],

  pathwayHints: [
    {
      pathway: 'accelerated_approval',
      applicability:
        'Serious condition + unmet medical need + surrogate endpoint reasonably likely to predict clinical benefit',
      impactedSections: ['2.5', '2.7.3', '5.3.5.1', '1.7'],
      reviewerNotes:
        'PMR for confirmatory trial REQUIRED. Failure to convert AA to traditional approval triggers withdrawal.',
    },
    {
      pathway: 'breakthrough_therapy',
      applicability:
        'Substantial improvement over existing therapies on a clinically significant endpoint, demonstrated by preliminary clinical evidence',
      impactedSections: ['1.7', '2.5'],
      reviewerNotes:
        'Granted FDA + sponsor early intensive collaboration. Often combined with AA or priority review.',
    },
    {
      pathway: 'orphan_drug',
      applicability: 'Indication < 200,000 US patients (FDA) / < 5/10,000 EU (EMA)',
      impactedSections: ['1.7', '2.5'],
      reviewerNotes:
        'Tax credits + 7-year US exclusivity. EMA orphan designation is a separate process from MA application.',
    },
    {
      pathway: 'rmat',
      applicability:
        'Regenerative medicine therapies for serious conditions (cell therapy, gene therapy)',
      impactedSections: ['3.2.S.2', '3.2.P.3', '5.3.5.1'],
      reviewerNotes:
        '21st Century Cures Act provision. Faster + iterative review of CMC. Often layered with AA.',
    },
  ],

  statisticalConsiderations: [
    'Time-to-event analyses: censoring approach must be specified up-front (administrative censoring vs informative)',
    'Stratified analysis by randomization factors required if used in stratification',
    'Hierarchical testing or alpha-spending for multiple comparisons (e.g. PFS + OS + ORR)',
    'Group sequential / interim analysis pre-specification — including stopping rules and conditional power thresholds',
    'For single-arm trials: external control selection must use propensity matching or MAIC, not naive comparison',
    'Subgroup analyses are HYPOTHESIS-GENERATING unless pre-specified — flag any post-hoc subgroup that drives the benefit-risk story',
  ],

  endpointConsiderations: [
    'OS is the gold standard; PFS / ORR / MRD are surrogates with varying precedent strength',
    'PFS interpretation requires consistent assessment intervals to avoid informative censoring',
    'ORR by RECIST 1.1 (or iRECIST for IO agents) — confirm version pre-specified',
    'MRD: depth of response (e.g. 10^-5) and assay (NGS vs flow cytometry) must be specified',
    'Composite endpoints (e.g. EFS) need component-level analysis for interpretation',
    'Patient-reported outcomes (PROs) require validated instruments + missing-data handling plan',
  ],

  retrievalKeywords: [
    'oncology',
    'cancer',
    'tumor',
    'overall survival',
    'progression-free survival',
    'objective response rate',
    'minimal residual disease',
    'surrogate endpoint',
    'accelerated approval',
    'BICR',
    'RECIST',
    'iRECIST',
    'ODAC',
    'project optimus',
    'RP2D',
    'MTD',
    'orphan drug',
    'breakthrough therapy',
    'REMS',
    'genotoxicity',
    'pediatric',
    'PREA',
    'RACE Act',
    'ICH S9',
  ],
};
