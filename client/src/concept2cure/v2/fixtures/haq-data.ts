/**
 * Health Authority Questions fixture data -- post-submission review phase.
 * Verbatim from the kit's haq-data.jsx: a live FDA mid-review Information
 * Request round on the BX-204 NDA, plus the EMA Day-120 List of Questions.
 */

export interface HaqRound {
  id: string;
  agency: string;
  flag: string;
  authority: string;
  submission: string;
  type: string;
  received: string;
  due: string;
  clockDays: number;
  clockTotal: number;
  note: string;
}

export interface HaqCite {
  src: string;
  ok: boolean;
}

export interface HaqQuestion {
  id: string;
  disc: string;
  tone: string;
  status: 'draft' | 'in-review' | 'approved';
  owner: string;
  q: string;
  analysis: string;
  draft: string;
  cites: HaqCite[];
  commitments: string[];
  precedentNote: string;
  roundId?: string;
  _new?: boolean;
  label?: string;
  text?: string;
}

export const HAQ_ROUNDS: HaqRound[] = [
  {
    id: 'fda-ir1',
    agency: 'FDA',
    flag: 'US',
    authority: 'FDA / CDER / OND',
    submission: 'BX-204 -- NDA 212345',
    type: 'Information Request (mid-cycle)',
    received: '2026-06-09',
    due: '2026-06-23',
    clockDays: 6,
    clockTotal: 14,
    note: 'Single 14-day IR clock. Responses roll into the review; non-response risks an extension or CRL.',
  },
  {
    id: 'ema-d120',
    agency: 'EMA',
    flag: 'EU',
    authority: 'EMA / CHMP (Rapporteur)',
    submission: 'BX-204 -- MAA EMEA/H/C/00xxxx',
    type: 'Day-120 List of Questions',
    received: '2026-05-28',
    due: '2026-08-26',
    clockDays: 64,
    clockTotal: 90,
    note: 'Clock stops at Day 120; responses due before the clock restarts at Day 121.',
  },
];

export const HAQ_QUESTIONS: Record<string, HaqQuestion[]> = {
  'fda-ir1': [
    {
      id: 'IR-1',
      disc: 'Clinical',
      tone: 'err',
      status: 'in-review',
      owner: 'J. Chen',
      q: 'Provide the objective response rate by age subgroup (<65 vs >=65) with corresponding 95% confidence intervals from the pivotal study BX204-201, and discuss whether efficacy is maintained in the elderly subpopulation.',
      analysis:
        'A standard subgroup-consistency probe -- the reviewer wants assurance the ORR holds in >=65y, where the label will see heavy use. They are not questioning the primary result; they want the stratified table and a consistency narrative. Drawn from the locked ADaM ADRS.',
      draft:
        'In the pivotal study BX204-201, the objective response rate was 42.1% (95% CI 35.8–48.6) overall. By age subgroup, ORR was 43.4% (95% CI 35.1–51.9) in patients <65 years (n=138) and 39.5% (95% CI 28.4–51.4) in patients >=65 years (n=76), per the locked CSR-201 primary analysis (ADaM ADRS, data lock 18 Apr 2026). The confidence intervals overlap substantially, and the point estimates are consistent with the overall result; efficacy is maintained in the elderly subpopulation.',
      cites: [
        { src: 'CSR-201 §7.4 -- primary efficacy', ok: true },
        { src: 'ADaM ADRS (locked)', ok: true },
        { src: '§2.7.3 Summary of Clinical Efficacy', ok: true },
      ],
      commitments: [],
      precedentNote:
        'In 3 of 4 comparable accelerated-approval oncology NDAs, the same age-subgroup IR was resolved with a stratified ORR table + a one-paragraph consistency statement; none required new analyses.',
    },
    {
      id: 'IR-2',
      disc: 'CMC',
      tone: 'err',
      status: 'draft',
      owner: 'M. Webb',
      q: 'Justify the proposed commercial drug substance specification acceptance criterion for the acidic charge variant (<=18.0%) in light of the observed range across registration lots, and confirm the comparability of pre- and post-process-change material.',
      analysis:
        'A specification-justification question tied to the Module 3 comparability item already on our critical path (T-204-31). The reviewer wants the acidic-variant criterion tied to clinical experience + the registration-lot distribution, and the pre/post-change comparability conclusion. Partially blocked until the comparability reconciliation closes.',
      draft:
        'The proposed acidic charge variant acceptance criterion (<=18.0%) is justified by the observed range across 14 registration lots (11.2–16.8%), bracketed by clinical experience (clinical lots up to 17.4% with no impact on PK or efficacy). Pre- vs post-process-change comparability was demonstrated across the analytical similarity panel (n=3 post-change lots) per §3.2.S.4 …',
      cites: [
        { src: '§3.2.S.4.3 -- batch analysis', ok: true },
        { src: 'Comparability protocol CP-204', ok: false },
        { src: '§3.2.S.7 stability', ok: true },
      ],
      commitments: [
        'Post-approval commitment: tighten to <=16.0% after 25 commercial lots (PACMP).',
      ],
      precedentNote:
        'Acidic-variant specification IRs are commonly resolved by linking the criterion to the clinical-experience max + a PACMP tightening commitment. AnA found this pattern in 5 recent mAb BLAs.',
    },
    {
      id: 'IR-3',
      disc: 'Clinical pharmacology',
      tone: 'warn',
      status: 'approved',
      owner: 'S. Park',
      q: 'Provide an exposure–response analysis for the primary efficacy endpoint and discuss the adequacy of the proposed dose.',
      analysis:
        'The reviewer wants the E–R for efficacy supporting the proposed dose. The population-PK and E–R analyses already exist in §2.7.2; this is an assembly + narrative task, not new work.',
      draft:
        'An exposure–response analysis for ORR was conducted using the population-PK–derived steady-state exposure (Cavg,ss). The relationship was flat across the exposure range observed at the proposed dose, indicating the dose is on the plateau of the E–R curve and supporting adequacy of the proposed regimen (§2.7.2; population-PK report PMX-204).',
      cites: [
        { src: '§2.7.2 Summary of Clinical Pharmacology', ok: true },
        { src: 'Pop-PK report PMX-204', ok: true },
      ],
      commitments: [],
      precedentNote:
        'Flat E–R at the proposed dose is the strongest framing; consistent with how the predicate program cleared the same question.',
    },
    {
      id: 'IR-4',
      disc: 'Biostatistics',
      tone: 'warn',
      status: 'draft',
      owner: 'A. Müller',
      q: 'Clarify the handling of missing data and the sensitivity analyses performed for the primary endpoint, including the assumptions underlying the primary imputation approach.',
      analysis:
        'A standard missing-data robustness question. The SAP pre-specified the primary as non-responder imputation with tipping-point sensitivity; this is a restatement from §2.7.3 + the SAP, not new analysis.',
      draft:
        'Missing responses were handled by non-responder imputation (NRI) for the primary ORR analysis, as pre-specified in the SAP. Sensitivity analyses included complete-case and a tipping-point analysis; the conclusion was robust to plausible departures from the primary assumption …',
      cites: [
        { src: 'SAP v3.0 §9.4', ok: true },
        { src: '§2.7.3 efficacy', ok: true },
      ],
      commitments: [],
      precedentNote:
        'NRI + tipping-point is the expected answer for ORR endpoints; matches recent oncology precedent.',
    },
    {
      id: 'IR-5',
      disc: 'Labeling',
      tone: 'ok',
      status: 'draft',
      owner: 'J. Chen',
      q: 'Revise the proposed USPI Section 8.1 (Pregnancy) to align with the nonclinical reproductive toxicology findings and the Pregnancy and Lactation Labeling Rule (PLLR) format.',
      analysis:
        'A labeling-conformance request. The DART findings in §2.6.6 drive the 8.1 risk-summary language; this is a drafting task in PLLR format, dependent on the SPL conversion already tracked (T-204-12).',
      draft:
        'Section 8.1 (Pregnancy) -- Risk Summary: Based on findings from animal reproduction studies and the mechanism of action, BX-204 can cause fetal harm when administered to a pregnant woman. There are no available data on BX-204 use in pregnant women to inform a drug-associated risk …',
      cites: [
        { src: '§2.6.6 nonclinical DART', ok: true },
        { src: 'USPI §8.1 (draft)', ok: true },
      ],
      commitments: [],
      precedentNote:
        'PLLR risk-summary phrasing is templated from the DART NOAEL; AnA aligned wording to the approved class labeling.',
    },
  ],
};
