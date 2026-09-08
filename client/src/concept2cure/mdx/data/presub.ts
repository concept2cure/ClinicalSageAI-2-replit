/**
 * Pre-Sub / Q-Sub manager — data
 *
 * Ported verbatim from ui_kits/mdx/data-presub.jsx. Mirrors the
 * conversation-with-FDA before a 510(k) gets filed: Pre-Sub, Submission Issue
 * Request, Study Risk Determination, Agreement, and Informational meetings.
 *
 * Per CDRH guidance "Requests for Feedback…" Sep 2023 rev.
 */

// ─── KPI strip ─────────────────────────────────────────────────────────────

export type Tone = '' | 'ok' | 'warn' | 'err';

export interface PresubKpi {
  label: string;
  metric: string;
  unit: string;
  meta: string;
  tone: Tone;
}

export const PRESUB_KPIS: PresubKpi[] = [
  { label: 'In flight',           metric: '7',  unit: '',  meta: '5 Pre-Sub · 1 SIR · 1 SRD',         tone: '' },
  { label: 'Awaiting FDA',        metric: '3',  unit: '',  meta: 'Avg 41d in queue · 75d target',     tone: 'warn' },
  { label: 'Responses received',  metric: '4',  unit: '',  meta: 'This quarter · 2 written · 2 mtg',  tone: 'ok' },
  { label: 'Days to feedback',    metric: '64', unit: 'd', meta: '30-day improvement vs FY24',        tone: 'ok' },
];

// ─── Type taxonomy + lifecycle stages ──────────────────────────────────────

export type PresubTypeId = 'presub' | 'sir' | 'srd' | 'agree' | 'info';

export interface PresubType {
  id: PresubTypeId;
  label: string;
  desc: string;
}

export const PRESUB_TYPES: PresubType[] = [
  { id: 'presub', label: 'Pre-Sub',          desc: 'Written/meeting feedback before filing' },
  { id: 'sir',    label: 'Submission Issue', desc: 'Mid-review issue resolution' },
  { id: 'srd',    label: 'Study Risk Det.',  desc: 'IDE applicability question' },
  { id: 'agree',  label: 'Agreement',        desc: '21 CFR 814.42 PMA agreement' },
  { id: 'info',   label: 'Informational',    desc: 'Briefing only, no FDA response' },
];

export type PresubStageId = 'plan' | 'package' | 'submit' | 'await' | 'feedback' | 'integrate';

export interface PresubStage {
  id: PresubStageId;
  label: string;
  desc: string;
}

export const PRESUB_STAGES: PresubStage[] = [
  { id: 'plan',      label: 'Planning',     desc: 'Question list draft' },
  { id: 'package',   label: 'Package',      desc: 'Cover · device desc · questions' },
  { id: 'submit',    label: 'Filed',        desc: 'ESG transmit · Q-Sub number' },
  { id: 'await',     label: 'Awaiting FDA', desc: 'Acknowledgement · 75d clock' },
  { id: 'feedback',  label: 'Feedback',     desc: 'Written response or meeting' },
  { id: 'integrate', label: 'Integrate',    desc: 'Roll commitments to dossier' },
];

// ─── List row ──────────────────────────────────────────────────────────────

export interface PresubMeeting {
  date: string;
  kind: string;
  team: string;
  confirmed: boolean;
}

export interface PresubListRow {
  id: string;
  qNumber: string;
  type: PresubTypeId;
  prog: string;
  progTitle: string;
  title: string;
  stage: PresubStageId;
  daysIn: number;
  filed: string | null;
  targetDate: string | null;
  meeting: PresubMeeting | null;
  questions: number;
  answered: number;
  commitments: number;
  rolledIn: number;
  fdaTeam: string;
  tone: Tone;
}

export const PRESUB_LIST: PresubListRow[] = [
  {
    id: 'qs-2025-1142', qNumber: 'Q251142', type: 'presub',
    prog: 'BX-204', progTitle: 'BX-204 Continuous Glucose Monitor',
    title: 'Predicate strategy and AI/ML algorithm scope',
    stage: 'feedback', daysIn: 4,
    filed: 'Mar 14, 2025', targetDate: 'May 28, 2025',
    meeting: { date: 'Jun 03, 2025', kind: 'Tele · 60 min', team: 'Dr. K. Patel (DDH/OHT2)', confirmed: true },
    questions: 5, answered: 5, commitments: 3, rolledIn: 2,
    fdaTeam: 'OHT2 — Diabetes', tone: 'ok',
  },
  {
    id: 'qs-2025-0987', qNumber: 'Q250987', type: 'presub',
    prog: 'OR-801', progTitle: 'OR-801 Pedicle Screw System',
    title: 'Performance testing waiver — fatigue ASTM F1717',
    stage: 'await', daysIn: 52,
    filed: 'Feb 04, 2025', targetDate: 'Apr 20, 2025',
    meeting: null,
    questions: 3, answered: 0, commitments: 0, rolledIn: 0,
    fdaTeam: 'OHT6 — Orthopedic', tone: 'warn',
  },
  {
    id: 'qs-2025-0844', qNumber: 'Q250844', type: 'sir',
    prog: 'OR-801', progTitle: 'OR-801 Pedicle Screw System',
    title: 'AI request — biocompatibility extractables data',
    stage: 'feedback', daysIn: 11,
    filed: 'Jan 22, 2025', targetDate: 'Apr 07, 2025',
    meeting: null,
    questions: 2, answered: 2, commitments: 1, rolledIn: 1,
    fdaTeam: 'OHT6 — Orthopedic', tone: 'ok',
  },
  {
    id: 'qs-2025-1331', qNumber: '—', type: 'presub',
    prog: 'RX-340', progTitle: 'RX-340 Surgical Stapler',
    title: 'Predicate determination · K224182 vs K231901',
    stage: 'package', daysIn: 6,
    filed: null, targetDate: null,
    meeting: null,
    questions: 4, answered: 0, commitments: 0, rolledIn: 0,
    fdaTeam: 'OHT4 — Surgical', tone: '',
  },
  {
    id: 'qs-2025-1187', qNumber: 'Q251187', type: 'presub',
    prog: 'PM-660', progTitle: 'PM-660 Patient Monitor — software',
    title: 'Cybersecurity premarket scope · SBOM evidence',
    stage: 'await', daysIn: 23,
    filed: 'Mar 06, 2025', targetDate: 'May 20, 2025',
    meeting: null,
    questions: 6, answered: 0, commitments: 0, rolledIn: 0,
    fdaTeam: 'OHT2 — Cardiac', tone: '',
  },
  {
    id: 'qs-2025-1402', qNumber: '—', type: 'srd',
    prog: 'NM-512', progTitle: 'NM-512 Neuromodulation Lead',
    title: 'IDE applicability — chronic implantation feasibility',
    stage: 'plan', daysIn: 2,
    filed: null, targetDate: null,
    meeting: null,
    questions: 1, answered: 0, commitments: 0, rolledIn: 0,
    fdaTeam: 'OHT5 — Neurostim', tone: '',
  },
  {
    id: 'qs-2024-0721', qNumber: 'Q240721', type: 'presub',
    prog: 'BX-204', progTitle: 'BX-204 Continuous Glucose Monitor',
    title: 'Clinical study design · accuracy endpoint',
    stage: 'integrate', daysIn: 18,
    filed: 'Sep 10, 2024', targetDate: 'Nov 25, 2024',
    meeting: { date: 'Dec 02, 2024', kind: 'In-person · 90 min', team: 'Dr. K. Patel (DDH/OHT2)', confirmed: true },
    questions: 4, answered: 4, commitments: 5, rolledIn: 5,
    fdaTeam: 'OHT2 — Diabetes', tone: 'ok',
  },
];

// ─── Per-Q-Sub detail ──────────────────────────────────────────────────────

export type QuestionStatus = 'answered' | 'awaiting';

export interface DossierLink {
  kind: 'k510-section' | 'pma-section' | 'cer-section';
  label: string;
  sectionId: number;
}

export interface Commitment {
  id: string;
  text: string;
  dossierLink: DossierLink;
  rolledIn: boolean;
  /** When true, this commitment is gating the next dossier transmit. */
  blocker?: boolean;
}

export interface PresubQuestion {
  n: number;
  q: string;
  ourPosition: string;
  fdaResponse: string | null;
  status: QuestionStatus;
  commitment: Commitment | null;
}

export interface PresubTimelineEntry {
  when: string;
  who: string;
  what: string;
}

export interface PresubDetail {
  summary: string;
  questions: PresubQuestion[];
  timeline: PresubTimelineEntry[];
}

export const PRESUB_DETAIL: Record<string, PresubDetail> = {
  // Q251142 — BX-204 predicate / AI scope. Flagship: meeting completed,
  // all questions answered, 3 commitments captured, 2 rolled into the dossier.
  'qs-2025-1142': {
    summary:
      'BX-204 sought CDRH agreement on predicate K212284 (Dexcom G6) and locking the AI/ML algorithm scope ahead of a Q3 510(k) filing. Meeting June 3 — written minutes received June 12.',
    questions: [
      {
        n: 1,
        q: 'Does FDA agree K212284 is a suitable primary predicate, given the AI-derived trend arrows added to BX-204?',
        ourPosition:
          'K212284 same intended use, technology, target population. AI-derived features are an output enhancement and do not change indications.',
        fdaResponse:
          'FDA agrees K212284 is appropriate as the primary predicate. Recommend including K223341 as a reference predicate to address the trend-arrow technology. Sponsor should provide a Technology Difference Justification per §6 of the eSTAR.',
        status: 'answered',
        commitment: {
          id: 'cm-1',
          text: 'Add K223341 as reference predicate; draft Technology Difference Justification',
          dossierLink: { kind: 'k510-section', label: 'eSTAR §6.1', sectionId: 6 },
          rolledIn: true,
        },
      },
      {
        n: 2,
        q: 'Is the locking strategy for v1.0 of the algorithm — fixed weights, no on-device update — acceptable for a traditional 510(k) submission?',
        ourPosition:
          'Algorithm is locked at submission. PCCP not requested for v1.0. Future updates would file new 510(k).',
        fdaResponse:
          'Locked algorithm acceptable. Provide an algorithm-change protocol in the device description that defines what triggers a new submission. Note: any model retraining post-clearance requires new 510(k).',
        status: 'answered',
        commitment: {
          id: 'cm-2',
          text: 'Author algorithm-change protocol (device description §4.3)',
          dossierLink: { kind: 'k510-section', label: 'eSTAR §4.3', sectionId: 4 },
          rolledIn: true,
        },
      },
      {
        n: 3,
        q: 'Does the proposed clinical accuracy study (n=156, 14 days, MARD endpoint at ≤9.5%) provide sufficient evidence?',
        ourPosition: 'Powered for non-inferiority vs YSI reference. Two sites, mixed Type 1 and Type 2.',
        fdaResponse:
          'Sample size adequate for primary endpoint. Recommend pre-specifying subgroup analysis for hypoglycemia (<70 mg/dL) — current SAP only includes overall MARD. FDA will not accept post-hoc subgroup claims.',
        status: 'answered',
        commitment: {
          id: 'cm-3',
          text: 'Amend SAP to pre-specify hypo-MARD subgroup',
          dossierLink: { kind: 'k510-section', label: 'eSTAR §11 — Performance', sectionId: 11 },
          rolledIn: false,
          blocker: true,
        },
      },
      {
        n: 4,
        q: 'Do we need a separate human factors validation given BX-204 is intended for self-use by Type 2 diabetic patients ≥18?',
        ourPosition:
          'HF validation per IEC 62366-1 against the intended user profile is planned (n=15 per group).',
        fdaResponse:
          'HF validation is required per FDA HF guidance (Feb 2016). Sample size and methodology proposed are acceptable. Confirm task list maps to the use-related risk analysis from §10.',
        status: 'answered',
        commitment: null,
      },
      {
        n: 5,
        q: 'Is a clinical claim of "complementary use with insulin therapy decisions" supportable, or should we restrict to "trend monitoring only"?',
        ourPosition:
          'Prefer "complementary" framing, with caveat language about confirmatory fingerstick.',
        fdaResponse:
          'FDA cautions that "complementary to insulin therapy decisions" approaches a dosing claim and would require a separate IDE-supported study. Recommend "trend monitoring and pattern recognition; not for use in insulin dosing decisions" as labeled indication.',
        status: 'answered',
        commitment: {
          id: 'cm-5',
          text: 'Restrict labeled indication per FDA recommendation',
          dossierLink: { kind: 'k510-section', label: 'eSTAR §3 — Indications for Use', sectionId: 3 },
          rolledIn: false,
        },
      },
    ],
    timeline: [
      { when: 'Jun 12', who: 'FDA',                what: 'Written meeting minutes received · 5 of 5 questions resolved' },
      { when: 'Jun 03', who: 'FDA · Dr. K. Patel', what: 'Meeting held · 58 minutes · 3 commitments captured' },
      { when: 'May 27', who: 'Sponsor',            what: 'Pre-meeting briefing package supplied (35p)' },
      { when: 'Apr 19', who: 'FDA',                what: 'Meeting scheduled · Jun 03 · tele · OHT2' },
      { when: 'Apr 02', who: 'FDA',                what: 'Acknowledgement letter · Q251142 · review clock started' },
      { when: 'Mar 14', who: 'M. Webb',            what: 'Transmitted via ESG · receipt 251142-rcpt' },
      { when: 'Mar 11', who: 'L. Tran',            what: 'Cover letter signed (DocuSign)' },
      { when: 'Mar 09', who: 'J. Chen',            what: 'Q-Sub package locked · 5 questions · 23 pages' },
    ],
  },

  // Q250987 — OR-801 fatigue waiver. In flight, awaiting FDA.
  'qs-2025-0987': {
    summary:
      'OR-801 requested a fatigue testing waiver based on equivalence to predicate K191822 — same alloy, identical thread geometry, validated dynamic compression bending data on file. Filed Feb 4, 75-day target Apr 20.',
    questions: [
      {
        n: 1,
        q: 'Does FDA agree that fatigue testing per ASTM F1717 may be waived given equivalence to K191822 (same Ti-6Al-4V ELI, same thread geometry, same surface treatment)?',
        ourPosition:
          'Identical alloy spec ASTM F136. Thread geometry from K191822 reused. Dynamic compression bending data on file from supplier qualification.',
        fdaResponse: null,
        status: 'awaiting',
        commitment: null,
      },
      {
        n: 2,
        q: 'If full ASTM F1717 is required, is reduced-sample testing (n=5 per worst-case configuration vs n=10) acceptable?',
        ourPosition: 'Worst-case construct identified by FEA · Tier-1 sites only.',
        fdaResponse: null,
        status: 'awaiting',
        commitment: null,
      },
      {
        n: 3,
        q: 'Are the proposed worst-case constructs (5.5mm × 50mm and 7.5mm × 90mm) sufficient, or does FDA require additional configurations?',
        ourPosition: 'FEA-driven selection. Smallest and largest within the indicated range.',
        fdaResponse: null,
        status: 'awaiting',
        commitment: null,
      },
    ],
    timeline: [
      { when: 'Feb 11', who: 'FDA',     what: 'Acknowledgement letter · Q250987 · review clock started' },
      { when: 'Feb 04', who: 'M. Webb', what: 'Transmitted via ESG · receipt 250987-rcpt' },
      { when: 'Feb 03', who: 'L. Tran', what: 'Cover letter signed' },
      { when: 'Feb 01', who: 'J. Chen', what: 'Q-Sub package locked · 3 questions · 17 pages' },
    ],
  },

  // Q250844 — OR-801 SIR (mid-review). Response received, 1 commitment open.
  'qs-2025-0844': {
    summary:
      'Mid-review Submission Issue Request raised after FDA AI letter on the OR-801 510(k). FDA asked for extractables and leachables under ISO 10993-18. Response received, supplier-tested data accepted with a documentation update.',
    questions: [
      {
        n: 1,
        q: 'Will supplier-provided extractables data per ISO 10993-18 (worst-case extraction, GC-MS) be acceptable, or does FDA require a finished-device chemical characterization?',
        ourPosition: 'Material is identical to predicate. Supplier data tied to lot 22K with chain of custody.',
        fdaResponse:
          'Supplier extractables data is acceptable for the OR-801 device given identical alloy and surface treatment. Sponsor must include the supplier qualification audit trail and confirm lot-traceability in the test article statement.',
        status: 'answered',
        commitment: {
          id: 'cm-844-1',
          text: 'Add lot-traceability statement and supplier audit trail to §15 — Biocompatibility',
          dossierLink: { kind: 'k510-section', label: 'eSTAR §15', sectionId: 15 },
          rolledIn: true,
        },
      },
      {
        n: 2,
        q: 'Does FDA require a 90-day extraction (instead of 24h) for chronic implant scoring?',
        ourPosition: 'Predicate cleared with 24h extraction. Implant duration <30 days per labeling.',
        fdaResponse:
          '24-hour extraction acceptable. Confirm clinical exposure duration in §3 matches the biocompatibility test article statement.',
        status: 'answered',
        commitment: null,
      },
    ],
    timeline: [
      { when: 'Apr 03', who: 'FDA',     what: 'Written response received · 2 of 2 questions resolved' },
      { when: 'Feb 28', who: 'FDA',     what: 'Acknowledgement · Q250844 · review clock started' },
      { when: 'Jan 22', who: 'M. Webb', what: 'Transmitted via ESG · receipt 250844-rcpt' },
    ],
  },
};
