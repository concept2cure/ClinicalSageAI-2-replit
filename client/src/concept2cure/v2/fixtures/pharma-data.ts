/** Pharma / Biotech intelligence seed data -- shadow review, biostatistics, CMC, eTMF, grants. */

export type ShadowLens = 'fda_filing' | 'ema_d120' | 'pmda' | 'nb_mdr' | 'nb_ivdr';
export type FindingSeverity = 'critical' | 'major' | 'minor' | 'info';
export type FindingDimension = 'rtf' | 'crl' | 'format' | 'nb';
export type PowerClassification = 'adequate' | 'marginal' | 'underpowered' | 'indeterminate';
export type FragilityLevel = 'low' | 'moderate' | 'high';
export type DefensibilityRating = 'appropriate' | 'acceptable_with_caveats' | 'vulnerable' | 'poorly_matched';

export interface ShadowFinding { dim: FindingDimension; sev: FindingSeverity; title: string; detail: string; basis: string; fix: string; }
export interface ShadowData { pathway: string; lens: ShadowLens; rtfRiskScore: number; crlRiskScore: number; summary: string; findings: ShadowFinding[]; }

export interface StatisticalRisk { type: string; sev: FindingSeverity; desc: string; fix: string; }
export interface SAPElement { k: string; have: boolean; }
export interface BiostatsData {
  study: string; phase: string; type: string;
  endpoint: string; endpointType: string; method: string;
  alpha: number; power: number | null; effectSize: number | string | null; sampleSize: number; attrition: number;
  powerClass: PowerClassification; powerRationale: string[];
  fragility: { level: FragilityLevel; score: number; dependencies: string[]; failureModes: string[] };
  defensibility: DefensibilityRating;
  risks: StatisticalRisk[];
  sapComplete: boolean; sapElements: SAPElement[];
}

export interface INDInvestigator {
  name: string; site: string; irb: string; credentials: string;
  form1572Complete: boolean; missing?: string; subIs: string[];
}

export interface INDFormData {
  form1571: { indNumber: string; phase: string; sponsor: string; submissionDate: string; status: string; annualReportDue: string; division: string };
  sponsor: { name: string; address: string; duns: string; signatory: string; contactEmail: string; contactPhone: string };
  usAgent: null;
  investigators: INDInvestigator[];
}

export interface ATMPData {
  euClass: string; euBasis: string; catOpinionRequired: boolean; centralizedProcedureMandatory: boolean;
  usClass: string; usReviewDiv: string; usBasis: string;
  japanClass: string; japanPathway: string;
  expedited: string[];
  vector: { name: string; integrating: boolean; maxPayload: string; immunogenicityRisk: string; insertionalMutagenesisRisk: string; preExistingImmunity: boolean };
  ltfu: { years: number; rationale: string };
  cmcRequirements: string[]; nonclinicalRequirements: string[]; clinicalRequirements: string[]; gmpFocusAreas: string[];
}

export interface PharmaEntry {
  product: string; agency: string; framework: string;
  shadow: ShadowData; biostats: BiostatsData | null;
  formData?: INDFormData; atmpData?: ATMPData;
}

export interface CMCSection { key: string; path: string; state: string; stale: boolean; staleReason?: string; }
export interface CMCContradiction { id: number; sev: string; type: string; details: string; sections: string[]; status: string; }
export interface ETMFZone { zone: number; name: string; total: number; received: number; missing: number; inReview: number; }
export interface ETMFCriticalGap { zone: number; artifact: string; status: string; }
export interface GrantMilestone { title: string; type: string; due: string; status: string; }
export interface GrantSubaward { name: string; uei: string; amount: number; risk: string; screen: string; status: string; }
export interface GrantAward {
  number: string; agency: string; mechanism: string; title: string; pi: string; amount: number;
  periodStart: string; periodEnd: string; status: string; budgetSpent: number; budgetTotal: number;
  categories: { personnel: number; fringe: number; indirect: number; directOther: number };
  milestones: GrantMilestone[]; subawards: GrantSubaward[];
}

const ctdEntry: PharmaEntry = {
  product: 'BX-204 · oncology BLA', agency: 'FDA · CDER', framework: 'ICH CTD M4',
  shadow: {
    pathway: 'BLA', lens: 'fda_filing', rtfRiskScore: 0.72, crlRiskScore: 0.48,
    summary: 'Module 3 comparability gap and §2.5 efficacy-claim contradiction are the critical pre-submission blockers. RTF risk is elevated (0.72) primarily from the comparability hold; CRL risk is moderate (0.48) from the ORR CI discrepancy.',
    findings: [
      { dim: 'rtf', sev: 'critical', title: 'Module 3 comparability protocol incomplete', detail: 'Pre/post process-change bridge study not provided; FDA expects comparability before BLA submission.', basis: 'FDA Guidance on Comparability of Biotechnology Products (2019)', fix: 'Complete comparability study and include full data package (Module 3.2.S / 3.2.P) before freeze.' },
      { dim: 'crl', sev: 'major', title: '§2.5 ORR confidence interval discrepancy', detail: 'Clinical Overview claims ORR 41.2% vs CSR-201 locked value 38.6%; CI lower bound inconsistent with the pre-specified threshold.', basis: 'ICH E9', fix: 'Reconcile ORR and CI across §2.5, §2.7.3, and the pivotal CSR-201 §7.1 before submission.' },
      { dim: 'format', sev: 'minor', title: '§1.12 Patent information — composition claim missing', detail: 'Patent number for the primary composition-of-matter claim is not listed in Module 1.', basis: '21 CFR 314.50(h)', fix: 'Complete 355(b)(1)(A) patent information.' },
    ],
  },
  biostats: {
    study: 'BX204-201 · pivotal (Phase III)', phase: 'III', type: 'single_arm',
    endpoint: 'Confirmed ORR (primary)', endpointType: 'binary', method: 'Exact binomial CI vs historical control',
    alpha: 0.05, power: 85, effectSize: 0.386, sampleSize: 103, attrition: 0.08,
    powerClass: 'adequate', powerRationale: ['One-sided α=0.05 pre-specified; historical-control threshold 25% agreed with FDA in Type B SPA.', 'Sample size provides 85% power — above FDA 80% floor.'],
    fragility: { level: 'moderate', score: 62, dependencies: ['Historical control pool stability across 5 datasets', 'ORR adjudication consistency across sites'], failureModes: ['New OS data could undermine benefit-risk', 'Adjudication discrepancy on borderline responders'] },
    defensibility: 'acceptable_with_caveats',
    risks: [
      { type: 'overinterpretation_risk', sev: 'major', desc: 'Single-arm design requires confirmatory evidence post-approval under accelerated approval; post-marketing trial must be stated in labeling.', fix: 'Confirm post-marketing confirmatory trial commitment and timeline in §2.5 benefit-risk.' },
      { type: 'assumption_fragility', sev: 'major', desc: 'Historical control of 25% ORR pools heterogeneous datasets; fragility score 62 (moderate) — assumptions sensitive to control-pool definition.', fix: 'Provide sensitivity analysis with narrower historical control definition (same-histology, same era).' },
      { type: 'multiplicity_risk', sev: 'minor', desc: 'Key secondary endpoints (PFS, DoR) not pre-specified for multiplicity adjustment; treated as exploratory by default.', fix: 'Confirm secondary endpoints are labelled exploratory or apply hierarchical testing plan in SAP.' },
    ],
    sapComplete: false, sapElements: [
      { k: 'Primary endpoint & hypothesis', have: true }, { k: 'Statistical method (exact binomial)', have: true }, { k: 'Sample size justification', have: true },
      { k: 'Analysis populations (evaluable/safety)', have: true }, { k: 'Missing data strategy (IRC adjudication)', have: true },
      { k: 'Sensitivity analyses', have: false }, { k: 'Multiplicity adjustment plan', have: false },
      { k: 'Interim analysis / IDMC charter', have: true }, { k: 'SAP version control / sponsor sign-off', have: true },
    ],
  },
};

const indEntry: PharmaEntry = {
  product: 'BX-204 · Phase I IND (BX204-101)', agency: 'FDA · CDER', framework: '21 CFR 312',
  shadow: {
    pathway: 'IND', lens: 'fda_filing', rtfRiskScore: 0.25, crlRiskScore: 0.60,
    summary: 'Administrative filing is clean. Moderate clinical-hold risk — pre-specified stopping rules for hepatotoxicity are absent from the Phase I dose-escalation protocol.',
    findings: [
      { dim: 'crl', sev: 'major', title: 'Phase I stopping rules absent for hepatotoxicity', detail: 'Dose-escalation protocol lacks pre-specified DLT criteria for liver-enzyme elevations (>5× ULN not stated as a stopping criterion).', basis: '21 CFR 312.23(a)(6); FDA Guidance — Phase 1 Studies (2018)', fix: 'Add explicit liver-enzyme DLT stopping rules per ICH S9 and agreed DLT observation window.' },
      { dim: 'format', sev: 'minor', title: 'Form FDA 1572 — site address missing for Investigator B', detail: 'Site 2 investigator form is missing the full site address required under 21 CFR 312.53.', basis: '21 CFR 312.53', fix: 'Complete Form 1572 for all named investigators before IND submission.' },
    ],
  },
  biostats: {
    study: 'BX204-101 · Phase I dose-escalation (FIH)', phase: 'I', type: 'single_arm',
    endpoint: 'DLT rate at MTD (primary safety)', endpointType: 'binary', method: '3+3 escalation / accelerated titration',
    alpha: 0.10, power: null, effectSize: null, sampleSize: 36, attrition: 0.05,
    powerClass: 'indeterminate', powerRationale: ['3+3 designs are not powered for efficacy — DLT detection is heuristic.', 'Appropriate design for Phase I safety exploration.'],
    fragility: { level: 'low', score: 28, dependencies: ['Hepatotoxicity biomarker monitoring (ALT/AST schedule)', 'PK/PD sample collection compliance'], failureModes: ['Unexpected off-target toxicity at sub-MTD doses'] },
    defensibility: 'appropriate',
    risks: [
      { type: 'underpower_risk', sev: 'minor', desc: '3+3 offers limited power for biomarker-driven activity signals at each dose level; expansion cohort not pre-planned.', fix: 'Consider pre-specifying an expansion cohort at RP2D for early activity signal.' },
    ],
    sapComplete: false, sapElements: [
      { k: 'DLT definition & observation window', have: true }, { k: 'Dose-escalation rule', have: true },
      { k: 'MTD / RP2D definition', have: true }, { k: 'PK sampling schedule', have: true },
      { k: 'Biomarker analysis plan', have: true }, { k: 'Stopping rules for hepatotoxicity', have: false },
      { k: 'SAP version control / sign-off', have: true },
    ],
  },
  formData: {
    form1571: { indNumber: 'IND 123456', phase: 'Phase I', sponsor: 'Bioxcel Therapeutics Inc.', submissionDate: '2025-09-01', status: 'active', annualReportDue: '2026-09-01', division: 'CDER · Oncology Products (Division 3)' },
    sponsor: { name: 'Bioxcel Therapeutics Inc.', address: '555 Long Wharf Drive, New Haven CT 06511', duns: '12-345-6789', signatory: 'James C. Boyle, MD — Chief Executive Officer', contactEmail: 'regulatory@bioxcel.com', contactPhone: '+1 (203) 831-0600' },
    usAgent: null,
    investigators: [
      { name: 'Dr. Sarah K. Liu, MD', site: 'Memorial Sloan Kettering Cancer Center · 1275 York Ave, New York NY 10065', irb: 'MSKCC IRB (FWA00002790)', credentials: 'MD', form1572Complete: true, subIs: ['Dr. Kevin Park, MD', 'Dr. Anna Torres, PharmD'] },
      { name: 'Dr. Michael E. Johnson, MD PhD', site: 'Dana-Farber Cancer Institute · 450 Brookline Ave, Boston MA 02215', irb: 'DFCI IRB (FWA00003543)', credentials: 'MD, PhD', form1572Complete: false, missing: 'Site address incomplete', subIs: ['Dr. Rachel Green, MD'] },
      { name: 'Dr. Priya R. Sharma, MD', site: 'MD Anderson Cancer Center · 1515 Holcombe Blvd, Houston TX 77030', irb: 'UT MD Anderson IRB (FWA00000363)', credentials: 'MD', form1572Complete: true, subIs: [] },
    ],
  },
};

const ndaEntry: PharmaEntry = {
  product: 'AltexaTab · NDA 505(b)(1)', agency: 'FDA · CDER', framework: 'ICH CTD M4',
  shadow: {
    pathway: 'NDA', lens: 'fda_filing', rtfRiskScore: 0.30, crlRiskScore: 0.38,
    summary: 'NDA is in good shape. Minor RTF risk from a patent certification gap in Module 1; moderate CRL risk from a PLLR labeling deficiency.',
    findings: [
      { dim: 'format', sev: 'minor', title: 'Module 1 — paragraph IV certification missing', detail: 'Paragraph IV certification absent for one listed compound patent.', basis: '21 CFR 314.50(h)', fix: 'Complete Paragraph IV certification and notify patent holder per 21 CFR 314.52.' },
      { dim: 'crl', sev: 'major', title: 'Labeling PLLR — pregnancy subsection incomplete', detail: 'Prescribing information pregnancy subsection lacks human data discussion (or explicit N/A statement); PLLR requires human data or its absence to be stated.', basis: '21 CFR 201.57 / PLLR Guidance 2014', fix: 'Add pregnancy data summary or state absence of human data in the PI §8.1.' },
    ],
  },
  biostats: {
    study: 'ALXT-301 · Phase III RCT (n=420)', phase: 'III', type: 'non_inferiority',
    endpoint: 'Change in HbA1c at 24 weeks (NI margin -0.35%)', endpointType: 'continuous', method: 'ANCOVA on ITT; 95% CI for difference',
    alpha: 0.025, power: 90, effectSize: -0.30, sampleSize: 420, attrition: 0.10,
    powerClass: 'adequate', powerRationale: ['90% power well above FDA 80% minimum.', 'NI margin of -0.35% pre-agreed with FDA at Type B meeting.'],
    fragility: { level: 'low', score: 31, dependencies: ['HbA1c measurement consistency across labs', 'Placebo washout compliance'], failureModes: ['High placebo dropout inflates PP/ITT divergence beyond 5%'] },
    defensibility: 'appropriate',
    risks: [
      { type: 'attrition_sensitivity', sev: 'minor', desc: '10% attrition assumption; PP analysis pre-specified as key sensitivity — divergence >5% warrants explanation.', fix: 'Provide PP vs ITT comparison in §2.7.1; if divergence >5%, include tipping-point analysis.' },
    ],
    sapComplete: true, sapElements: [
      { k: 'Primary endpoint & NI margin', have: true }, { k: 'Statistical method (ANCOVA)', have: true },
      { k: 'Sample size + NI hypothesis', have: true }, { k: 'Analysis populations (ITT/PP/safety)', have: true },
      { k: 'Missing data handling (MMRM / MI)', have: true }, { k: 'Sensitivity analyses (PP/per-protocol)', have: true },
      { k: 'Multiplicity (ordered secondary testing)', have: true }, { k: 'SAP version control / sign-off', have: true },
    ],
  },
};

const maaEntry: PharmaEntry = {
  product: 'AltexaTab · EMA MAA', agency: 'EMA · CHMP', framework: 'ICH CTD M4 + EU Module 1',
  shadow: {
    pathway: 'MAA', lens: 'ema_d120', rtfRiskScore: 0.28, crlRiskScore: 0.52,
    summary: 'D120 assessment. Clinical review identifies an EU-specific benefit-risk framing concern; Risk Management Plan update is required before opinion.',
    findings: [
      { dim: 'crl', sev: 'major', title: 'RMP — routine risk minimisation incomplete', detail: 'Patient alert card is an approved risk minimisation measure but is not reflected in the RMP routine measures section.', basis: 'EMA Guideline on Risk Management Plans (Rev. 2)', fix: 'Update RMP to include the patient alert card as routine risk minimisation in Part III.' },
      { dim: 'nb', sev: 'minor', title: 'SmPC §5.1 — benefit claim EU context missing', detail: 'EU-specific ORR discussion uses US single-arm framing without EU-relevant historical comparator rationale.', basis: 'EMA SmPC Guideline (Rev. 2)', fix: 'Revise §5.1 to provide EU-context historical-control rationale (best supportive care in EU sites).' },
    ],
  },
  biostats: null,
};

const atmpEntry: PharmaEntry = {
  product: 'LX-01 · CD19-CAR T-cell therapy · CBER/OTP · Phase I/II · B-ALL',
  agency: 'FDA · CBER · Office of Therapeutic Products (OTP)', framework: 'PHS Act §351(a) · 21 CFR 600/610/211',
  atmpData: {
    euClass: 'gene_therapy', euBasis: 'Reg (EC) 1394/2007 Art 2(1)(a) — gene-modified cells (GTMP)', catOpinionRequired: true, centralizedProcedureMandatory: true,
    usClass: 'gene_therapy_cber', usReviewDiv: 'CBER — OTP', usBasis: 'PHS Act 351(a); 21 CFR 600/610',
    japanClass: 'Regenerative Medicine Product', japanPathway: 'PMD Act — conditional/time-limited approval (Art 23-26)',
    expedited: ['FDA Breakthrough Therapy', 'FDA RMAT', 'EMA PRIME'],
    vector: { name: 'Lentiviral Vector (SIN)', integrating: true, maxPayload: '~8–10 kb', immunogenicityRisk: 'low', insertionalMutagenesisRisk: 'moderate', preExistingImmunity: false },
    ltfu: { years: 15, rationale: 'Integrating vector — 15-year LTFU per FDA Guidance (Long Term Follow-Up After Administration of a Gene Therapy Product, 2020).' },
    cmcRequirements: [
      'SIN lentiviral vector (U3 deletion confirmed) — no replication-competent architecture',
      'VCN/cell: target ≤5 copies/CD3+ T-cell (CQA with upper acceptance criterion)',
      'Transduction efficiency: CD19-CAR+ fraction ≥40% of CD3+ cells (release spec)',
      'RCL testing: co-culture assay on vector lot + end-of-production HEK293T + patient PBMC at 3/6/12 mo + annually',
      'Potency: CD19-specific cytotoxicity assay (E:T titration vs NALM-6, EC50)',
      'Viability at release: ≥70% (7-AAD exclusion)',
      'Residual plasmid DNA: <300 ng/dose (validated clearance step required)',
      'Cryopreservation: DMSO-based infusion bag, controlled-rate freeze to −135 °C; thaw recovery ≥80%',
      'Chain of identity (CoI): leukopak-to-infusion-bag barcode traceability, mandatory CoI SOP',
    ],
    nonclinicalRequirements: [
      'PoC efficacy: CD19-CAR T vs CD19+ ALL xenograft (NSG-SGM3) — complete remission required',
      'Biodistribution: CAR-T engraftment by flow + qPCR in blood/BM/spleen/LN/gonads',
      'GLP tox: NSG mouse dose-escalation — CRS/ICANS surrogates (IL-6, TNF, CAR-T expansion)',
      'RCL testing: end-of-production HEK293T cells + vector supernatant (co-culture assay)',
      'Integration site analysis (ISA): LAM-PCR on NHP or transduced CD3+ cells',
      'IVIM assay: in vitro immortalisation assay per EMA GTMP guideline (insertional mutagenesis)',
    ],
    clinicalRequirements: [
      'IND (21 CFR 312.23) — CBER/OTP review; Breakthrough Therapy designation pathway',
      'Lymphodepletion conditioning: fludarabine 25 mg/m²/day × 3d + cyclophosphamide 900 mg/m²/day × 1d',
      'CRS monitoring: daily CBC/CRP/ferritin/IL-6 × 14 days; ASTCT 2019 grading',
      'ICANS monitoring: daily neurological assessment × 14 days; ASTCT 2019 grading',
      'Sentinel dosing: staggered enrollment, 14-day observation between patients in first cohort',
      'RCL patient monitoring: baseline + mo 1/3/6/12, then annually × 15 years',
      'ISA on patient PBMC: pre-infusion baseline + mo 3/6/12/annually × 15 years',
      'Anti-CAR antibody (ADA) monitoring: pre-infusion, wk 4/12/26',
    ],
    gmpFocusAreas: [
      'Autologous batch GMP: parallel-patient processing controls, segregation, chain of identity',
      'Leukapheresis-to-release: cold-chain interruption risk during patient logistics',
      'QC release turnaround: 14-day manufacturing + QC; clinical need may be <21 days',
      'Grade A (ISO 5) open processing; Grade B background; no co-processing of different patients simultaneously',
    ],
  },
  shadow: { pathway: 'BLA-ATMP', lens: 'fda_filing', rtfRiskScore: 0.18, crlRiskScore: 0.42,
    summary: 'Administrative filing clean. Moderate CRL risk driven by incomplete ISA data package and LTFU plan not yet finalized.',
    findings: [
      { dim: 'crl', sev: 'major', title: 'Integration site analysis — patient sample data incomplete', detail: 'ISA data from ≥3 patients required by CBER/OTP at time of BLA filing. Only 1 evaluable patient dataset submitted.', basis: 'FDA Gene Therapy Guidance (2020); CBER BLA review expectations', fix: 'Submit ISA data for all patients enrolled ≥12 months prior to BLA submission date.' },
      { dim: 'crl', sev: 'minor', title: 'LTFU plan — monitoring schedule not finalized', detail: 'Long-term follow-up plan does not specify monitoring visit schedule for years 6–15.', basis: 'FDA Guidance: Long Term Follow-Up (2020)', fix: 'Finalize LTFU schedule per FDA Guidance Table 1 — annual visits with specified assessments.' },
    ],
  },
  biostats: {
    study: 'LX01-101 · Phase I/II CAR-T dose-escalation + expansion', phase: 'I/II', type: 'single_arm',
    endpoint: 'CRR at day 28 (primary); MRD-negative CR (secondary)', endpointType: 'binary', method: 'Modified 3+3 escalation → expansion at RP2D',
    alpha: 0.05, power: 0.80, effectSize: 'CRR ≥70% vs historical control 35%', sampleSize: 42, attrition: 0.10,
    powerClass: 'adequate', powerRationale: ['Single-arm with historical control appropriate for rare disease with high unmet need.', '80% power achieved at n=36 evaluable (Simon two-stage design).'],
    fragility: { level: 'moderate', score: 52, dependencies: ['CRR definition (CR+CRi) consistency across sites', 'Day 28 BM biopsy collection compliance'], failureModes: ['Bridging therapy confounding in heavily pre-treated patients', 'MRD assay sensitivity inconsistency across labs'] },
    defensibility: 'appropriate',
    risks: [
      { type: 'method_mismatch', sev: 'minor', desc: 'Simon two-stage ORR design adapted for CRR endpoint — not pre-specified in original SAP. Protocol amendment required.', fix: 'Amend SAP to specify CRR primary endpoint with Simon two-stage boundary values.' },
    ],
    sapComplete: true, sapElements: [
      { k: 'Primary endpoint definition (CRR at day 28)', have: true }, { k: 'Simon two-stage boundaries', have: true },
      { k: 'Historical control derivation and justification', have: true }, { k: 'MRD assay sensitivity specification', have: true },
      { k: 'Interim analysis plan (Stage 1 futility)', have: true }, { k: 'SAP version control / sign-off', have: true },
    ],
  },
};

export const PD: Record<string, PharmaEntry | null> = {
  ctd: ctdEntry,
  ind: indEntry,
  nda: ndaEntry,
  maa: maaEntry,
  bla: ctdEntry,
  jnda: {
    ...maaEntry,
    product: 'AltexaTab · PMDA J-NDA',
    agency: 'PMDA · Japan',
    shadow: {
      ...maaEntry.shadow,
      pathway: 'J-NDA',
      lens: 'pmda' as ShadowLens,
      summary: 'PMDA consultation review. Bridging study adequacy and Japanese subgroup data are the primary assessment items.',
    },
  },
  ctd_505b2: null,
  ctd_cro: null,
  atmp: atmpEntry,
};

export function getPharmaData(pid: string): PharmaEntry | null {
  return PD[pid] || null;
}

export const CMC_OS = {
  project: 'BX-204 · Module 3 CMC · BLA filing',
  sections: [
    { key: '3.2.S.1', path: 'Drug Substance — General Information', state: 'approved', stale: false },
    { key: '3.2.S.2', path: 'Drug Substance — Manufacture', state: 'approved', stale: false },
    { key: '3.2.S.3', path: 'Drug Substance — Characterisation', state: 'draft', stale: false },
    { key: '3.2.S.4', path: 'Drug Substance — Control', state: 'approved', stale: true, staleReason: 'Lot L-24-0870 calibration recall updated specification limits — section requires recompile against revised source object.' },
    { key: '3.2.S.5', path: 'Drug Substance — Reference Standards', state: 'draft', stale: false },
    { key: '3.2.S.6', path: 'Drug Substance — Container Closure', state: 'approved', stale: false },
    { key: '3.2.S.7', path: 'Drug Substance — Stability', state: 'draft', stale: false },
    { key: '3.2.P.1', path: 'Drug Product — Description & Composition', state: 'approved', stale: false },
    { key: '3.2.P.2', path: 'Drug Product — Pharmaceutical Development', state: 'draft', stale: false },
    { key: '3.2.P.3', path: 'Drug Product — Manufacture', state: 'approved', stale: true, staleReason: 'Manufacturing site change (ITO→Lonza Basel) not yet reflected. Section compiled against prior site.' },
    { key: '3.2.P.4', path: 'Drug Product — Control of Excipients', state: 'approved', stale: false },
    { key: '3.2.P.5', path: 'Drug Product — Control of Drug Product', state: 'draft', stale: false },
    { key: '3.2.P.6', path: 'Drug Product — Reference Standards', state: 'draft', stale: false },
    { key: '3.2.P.7', path: 'Drug Product — Container Closure', state: 'approved', stale: false },
    { key: '3.2.P.8', path: 'Drug Product — Stability', state: 'draft', stale: false },
  ] as CMCSection[],
  contradictions: [
    { id: 1, sev: 'high', type: 'specification_conflict', details: 'Moisture spec in 3.2.S.4.1 (NMT 0.3% w/w) conflicts with 6-month stability data (3.2.S.7) showing 0.35% at 25°C/60%RH. Acceptance criterion requires revision.', sections: ['3.2.S.4', '3.2.S.7'], status: 'open' },
    { id: 2, sev: 'medium', type: 'batch_record_discordance', details: 'Batch BX204-DS-009 yield in 3.2.S.2 (68.4%) differs from QC release batch record (71.2%). Calculation method inconsistency.', sections: ['3.2.S.2'], status: 'open' },
    { id: 3, sev: 'low', type: 'nomenclature', details: '"Polysorbate 80" vs "Tween 80" used interchangeably in 3.2.P.4 and 3.2.P.5. Standardise to INN.', sections: ['3.2.P.4', '3.2.P.5'], status: 'open' },
  ] as CMCContradiction[],
};

export const ETMF_DATA = {
  tmf: 'BX204-101 Phase I FIH', study: 'BX204-101', model: 'DIA RM v3.0', status: 'active',
  zones: [
    { zone: 1, name: 'Trial Management', total: 8, received: 7, missing: 1, inReview: 0 },
    { zone: 2, name: 'Central Trial Documents', total: 12, received: 11, missing: 0, inReview: 1 },
    { zone: 3, name: 'Regulatory', total: 15, received: 13, missing: 2, inReview: 0 },
    { zone: 4, name: 'IRB / Ethics Committee', total: 6, received: 6, missing: 0, inReview: 0 },
    { zone: 5, name: 'Site Management', total: 22, received: 18, missing: 3, inReview: 1 },
    { zone: 6, name: 'Case Report Forms', total: 4, received: 2, missing: 0, inReview: 2 },
    { zone: 7, name: 'Lab Records', total: 9, received: 8, missing: 1, inReview: 0 },
    { zone: 8, name: 'IP / Investigational Product', total: 11, received: 9, missing: 2, inReview: 0 },
    { zone: 9, name: 'Source Data', total: 6, received: 3, missing: 0, inReview: 3 },
    { zone: 10, name: 'Central Monitoring', total: 5, received: 3, missing: 1, inReview: 1 },
    { zone: 11, name: 'Safety & Medical Events', total: 8, received: 6, missing: 2, inReview: 0 },
  ] as ETMFZone[],
  criticalGaps: [
    { zone: 3, artifact: 'FDA acknowledgment letter — IND Amendment 3', status: 'missing' },
    { zone: 5, artifact: 'DFCI site — Investigator Brochure acknowledgment (v7)', status: 'missing' },
    { zone: 8, artifact: 'IP destruction records — Lot L-24-0889 (recalled lot)', status: 'missing' },
    { zone: 11, artifact: 'SAE narratives — 2 unresolved SAEs from MSK site', status: 'missing' },
  ] as ETMFCriticalGap[],
};

export const GRANT_DATA = {
  awards: [
    { number: 'R01CA234567-02', agency: 'nih', mechanism: 'r01', title: 'BX-204: Molecular determinants of accelerated approval in r/r DLBCL', pi: 'Dr. Sarah K. Liu MD', amount: 2847000, periodStart: '2024-09-01', periodEnd: '2028-08-31', status: 'active',
      budgetSpent: 892000, budgetTotal: 2847000,
      categories: { personnel: 1420000, fringe: 284000, indirect: 711750, directOther: 431250 },
      milestones: [
        { title: 'IND submission for BX204-101', type: 'regulatory', due: '2025-09-01', status: 'met' },
        { title: 'RPPR — Year 1', type: 'progress_report', due: '2025-08-31', status: 'met' },
        { title: 'First patient dosed (FPD) at MSKCC', type: 'scientific', due: '2025-12-31', status: 'met' },
        { title: 'Interim efficacy readout (n=15 evaluable)', type: 'scientific', due: '2026-06-30', status: 'in_progress' },
        { title: 'RPPR — Year 2', type: 'progress_report', due: '2026-08-31', status: 'pending' },
        { title: 'Phase II expansion IND amendment', type: 'regulatory', due: '2026-09-30', status: 'pending' },
      ],
      subawards: [
        { name: 'Dana-Farber Cancer Institute', uei: 'G9Y4PF2FFAJ2', amount: 680000, risk: 'low', screen: 'cleared', status: 'executed' },
        { name: 'MD Anderson Cancer Center', uei: 'M5LL3WBQT234', amount: 520000, risk: 'low', screen: 'cleared', status: 'executed' },
      ],
    },
    { number: 'SBIR-2B-NIH-2025-031', agency: 'nih', mechanism: 'sbir', title: 'SBIR Phase II: Aurora CGM Paediatric Extension — AI/ML Performance Validation', pi: 'Dr. Kevin Park MD', amount: 1500000, periodStart: '2025-06-01', periodEnd: '2027-05-31', status: 'active',
      budgetSpent: 310000, budgetTotal: 1500000,
      categories: { personnel: 750000, fringe: 150000, indirect: 225000, directOther: 375000 },
      milestones: [
        { title: 'Paediatric sensor prototype delivery', type: 'deliverable', due: '2025-12-01', status: 'met' },
        { title: 'Paediatric clinical validation study start', type: 'scientific', due: '2026-02-28', status: 'in_progress' },
        { title: 'RPPR — Year 1', type: 'progress_report', due: '2026-05-31', status: 'pending' },
        { title: '510(k) submission — paediatric indication', type: 'regulatory', due: '2027-01-31', status: 'pending' },
      ],
      subawards: [],
    },
  ] as GrantAward[],
};
