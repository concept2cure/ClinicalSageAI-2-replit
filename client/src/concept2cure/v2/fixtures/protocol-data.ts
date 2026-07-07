/* Protocol Development + Research Administration fixture data.
   Ported from kit protocol-data.jsx (window globals). */

/* ---- Shared sub-types ---- */

export interface Provenance { src: string; conf: string; audit: string; }
export interface SevText { sev: string; text: string; }

/* ---- Protocol document (C2C-17) ---- */

export interface PdevSection {
  id: string; num: string; title: string; status: string; required: boolean; tab?: string;
}
export interface ContentBlock {
  h: string; p: string; prov: Provenance;
}
export interface PdevObjective {
  id: string; type: string; text: string; endpoint: string;
}
export interface EligibilityItem { id: string; text: string; }
export interface PdevEligibility {
  inclusion: EligibilityItem[]; exclusion: EligibilityItem[];
}
export interface SoaVisit {
  id: string; label: string; day: string; window: string;
}
export interface SoaAssessment {
  id: string; label: string; cat: string;
}
export interface PdevSoa {
  visits: SoaVisit[];
  assessments: SoaAssessment[];
  cells: Record<string, string[]>;
  issues: SevText[];
}
export interface PdevRisk {
  id: string; hazard: string; cat: string;
  l: number; i: number; mitigation: string;
  rl: number; ri: number; status: string;
}
export interface PdevMilestone {
  id: string; label: string; date: string; status: string; urgency: string;
}
export interface BudgetItem {
  id: string; cat: string; label: string; perSubject: number;
}
export interface BudgetParams {
  enrollment: number; sponsorPerSubject: number; faRate: number;
}
export interface PdevBudget { params: BudgetParams; items: BudgetItem[]; }
export interface AmendmentChange { sec: string; from: string; to: string; }
export interface PdevAmendment {
  id: string; num: string; summary: string; status: string;
  reconsent: boolean; path: string; changes: AmendmentChange[];
}
export interface CapaAction { id: string; action: string; status: string; }
export interface PdevDeviation {
  id: string; title: string; sev: string; cat: string;
  reportable: boolean; status: string; capa: CapaAction[];
}
export interface ReviewComment {
  id: string; sec: string; sev: string; text: string; resolved: boolean;
}
export interface PdevReview {
  id: string; reviewer: string; role: string; status: string; comments: ReviewComment[];
}
export interface ConsentElement { id: string; el: string; present: boolean; }

export interface PdevDoc {
  id: string; title: string; shortTitle: string; kind: string;
  version: string; status: string; sponsor: string; pi: string;
  updated: string; completeness: number;
  sections: PdevSection[];
  openSection: string;
  content: Record<string, ContentBlock[]>;
  objectives: PdevObjective[];
  eligibility: PdevEligibility;
  soa: PdevSoa;
  risks: PdevRisk[];
  milestones: PdevMilestone[];
  budget: PdevBudget;
  amendments: PdevAmendment[];
  deviations: PdevDeviation[];
  reviews: PdevReview[];
  consent: ConsentElement[];
  completenessFindings: SevText[];
}

export const PDEV_DOC: PdevDoc = {
  id: 'PROT-2041',
  title: 'A Phase II Study of Selvotinib in Relapsed/Refractory DLBCL',
  shortTitle: 'SELVO-DLBCL-201',
  kind: 'clinical',
  version: '0.7',
  status: 'draft',
  sponsor: 'Northfield Cancer Institute (IIT)',
  pi: 'Dr. ElenaВаsquez',
  updated: '2 min ago',
  completeness: 68,
  sections: [
    { id: 's1', num: '1', title: 'Protocol summary / synopsis', status: 'complete', required: true },
    { id: 's2', num: '2', title: 'Background & rationale', status: 'complete', required: true },
    { id: 's3', num: '3', title: 'Objectives & endpoints', status: 'draft', required: true, tab: 'objectives' },
    { id: 's4', num: '4', title: 'Study design', status: 'draft', required: true },
    { id: 's5', num: '5', title: 'Eligibility criteria', status: 'draft', required: true, tab: 'eligibility' },
    { id: 's6', num: '6', title: 'Schedule of assessments', status: 'draft', required: true, tab: 'soa' },
    { id: 's7', num: '7', title: 'Study treatments', status: 'draft', required: true },
    { id: 's8', num: '8', title: 'Safety & adverse events', status: 'not_started', required: true },
    { id: 's9', num: '9', title: 'Statistical considerations', status: 'not_started', required: true },
    { id: 's10', num: '10', title: 'Data handling & monitoring', status: 'not_started', required: true },
    { id: 's11', num: '11', title: 'Ethics & informed consent', status: 'draft', required: true, tab: 'consent' },
    { id: 's12', num: '12', title: 'References', status: 'not_started', required: false },
  ],
  openSection: 's2',
  content: {
    s2: [
      { h: '2.1 Disease background', p: 'Diffuse large B-cell lymphoma (DLBCL) is the most common aggressive non-Hodgkin lymphoma. Approximately 30–40% of patients relapse after first-line R-CHOP, and outcomes in the relapsed/refractory (R/R) setting remain poor, with median overall survival under 12 months for patients ineligible for transplant.', prov: { src: 'Literature corpus · 14 sources', conf: 'High', audit: 'AUD-7741' } },
      { h: '2.2 Investigational agent', p: 'Selvotinib is an oral, selective BTK inhibitor with a differentiated kinome profile and reduced off-target activity against TEC and EGFR. Phase I data (n=42) demonstrated a manageable safety profile and an overall response rate of 51% in heavily pretreated B-cell malignancies.', prov: { src: 'IB v3.0 · §6.2', conf: 'High', audit: 'AUD-7742' } },
      { h: '2.3 Rationale for the current study', p: 'The combination of selective BTK inhibition with standard salvage chemotherapy is hypothesized to improve response depth without additive toxicity. This study evaluates selvotinib added to R-GemOx in transplant-ineligible R/R DLBCL.', prov: { src: 'Drafted by AnA from §2.1–2.2 + 3 precedents', conf: 'Medium', audit: 'AUD-7743' } },
    ],
  },
  objectives: [
    { id: 'o1', type: 'primary', text: 'To evaluate the overall response rate (ORR) of selvotinib plus R-GemOx per Lugano 2014 criteria.', endpoint: 'ORR (CR+PR) at end of cycle 4' },
    { id: 'o2', type: 'secondary', text: 'To assess progression-free survival (PFS) and duration of response (DoR).', endpoint: 'PFS, DoR (Kaplan–Meier)' },
    { id: 'o3', type: 'secondary', text: 'To characterize the safety and tolerability of the combination.', endpoint: 'AEs per CTCAE v5.0' },
    { id: 'o4', type: 'exploratory', text: 'To explore ctDNA dynamics as an early predictor of response.', endpoint: 'ctDNA clearance at C2D1' },
  ],
  eligibility: {
    inclusion: [
      { id: 'i1', text: 'Histologically confirmed DLBCL, relapsed or refractory after ≥1 prior line.' },
      { id: 'i2', text: 'Age ≥ 18 years.' },
      { id: 'i3', text: 'ECOG performance status 0–2.' },
      { id: 'i4', text: 'Measurable disease per Lugano 2014.' },
      { id: 'i5', text: 'Adequate hematologic, hepatic and renal function.' },
    ],
    exclusion: [
      { id: 'e1', text: 'Prior exposure to a BTK inhibitor.' },
      { id: 'e2', text: 'Active CNS lymphoma.' },
      { id: 'e3', text: 'Clinically significant cardiovascular disease within 6 months.' },
      { id: 'e4', text: 'Active anticoagulation with warfarin.' },
    ],
  },
  soa: {
    visits: [
      { id: 'scr', label: 'Screening', day: 'D-28→-1', window: '' },
      { id: 'c1d1', label: 'C1D1', day: 'D1', window: '' },
      { id: 'c1d8', label: 'C1D8', day: 'D8', window: '±1' },
      { id: 'c2d1', label: 'C2D1', day: 'D22', window: '±2' },
      { id: 'c4d1', label: 'C4D1', day: 'D64', window: '±2' },
      { id: 'eot', label: 'EOT', day: 'D85', window: '±3' },
      { id: 'fu', label: 'Follow-up', day: 'q90d', window: '±7' },
    ],
    assessments: [
      { id: 'a1', label: 'Informed consent', cat: 'Administrative' },
      { id: 'a2', label: 'Demographics & history', cat: 'Administrative' },
      { id: 'a3', label: 'Physical exam', cat: 'Clinical' },
      { id: 'a4', label: 'Vital signs', cat: 'Clinical' },
      { id: 'a5', label: 'ECOG status', cat: 'Clinical' },
      { id: 'a6', label: 'CBC with differential', cat: 'Laboratory' },
      { id: 'a7', label: 'Comprehensive metabolic', cat: 'Laboratory' },
      { id: 'a8', label: 'CT / PET imaging', cat: 'Imaging' },
      { id: 'a9', label: 'ctDNA (exploratory)', cat: 'Biomarker' },
      { id: 'a10', label: 'Adverse event review', cat: 'Safety' },
      { id: 'a11', label: 'Study drug administration', cat: 'Treatment' },
    ],
    cells: {
      a1: ['scr'], a2: ['scr'], a3: ['scr', 'c1d1', 'c2d1', 'c4d1', 'eot'],
      a4: ['scr', 'c1d1', 'c1d8', 'c2d1', 'c4d1', 'eot'], a5: ['scr', 'c1d1', 'c2d1', 'c4d1', 'eot'],
      a6: ['scr', 'c1d1', 'c1d8', 'c2d1', 'c4d1', 'eot'], a7: ['scr', 'c1d1', 'c2d1', 'c4d1', 'eot'],
      a8: ['scr', 'c4d1', 'eot', 'fu'], a9: ['scr', 'c2d1', 'eot'],
      a10: ['c1d1', 'c1d8', 'c2d1', 'c4d1', 'eot', 'fu'], a11: ['c1d1', 'c1d8', 'c2d1', 'c4d1'],
    },
    issues: [
      { sev: 'warning', text: 'Visit C1D8 has only 4 assessments scheduled — confirm minimal-visit intent.' },
      { sev: 'info', text: 'Follow-up (q90d) imaging cadence aligns with PFS endpoint.' },
    ],
  },
  risks: [
    { id: 'r1', hazard: 'Grade ≥3 neutropenia from combination myelosuppression', cat: 'Safety', l: 4, i: 4, mitigation: 'Protocol-defined dose modification + G-CSF support; weekly CBC in C1.', rl: 3, ri: 3, status: 'open' },
    { id: 'r2', hazard: 'Under-enrollment at single site', cat: 'Operational', l: 4, i: 3, mitigation: 'Activate two satellite sites; pre-screen registry.', rl: 2, ri: 3, status: 'mitigating' },
    { id: 'r3', hazard: 'ctDNA assay vendor delay', cat: 'Operational', l: 3, i: 2, mitigation: 'Exploratory endpoint; samples biobanked for batch analysis.', rl: 2, ri: 1, status: 'open' },
    { id: 'r4', hazard: 'Atrial fibrillation (BTKi class effect)', cat: 'Safety', l: 2, i: 4, mitigation: 'Baseline + on-study ECG; cardiology referral pathway.', rl: 2, ri: 3, status: 'mitigating' },
    { id: 'r5', hazard: 'Protocol deviation in eligibility verification', cat: 'Compliance', l: 3, i: 3, mitigation: 'Central eligibility review before C1D1.', rl: 1, ri: 3, status: 'mitigating' },
    { id: 'r6', hazard: 'Informed-consent version drift across sites', cat: 'Compliance', l: 2, i: 3, mitigation: 'IRB-controlled master ICF; site acknowledgment log.', rl: 1, ri: 2, status: 'closed' },
  ],
  milestones: [
    { id: 'm1', label: 'IRB initial approval', date: '2026-05-12', status: 'done', urgency: 'done' },
    { id: 'm2', label: 'IACUC (correlative tissue) approval', date: '2026-05-20', status: 'done', urgency: 'done' },
    { id: 'm3', label: 'Site initiation visit', date: '2026-06-18', status: 'done', urgency: 'done' },
    { id: 'm4', label: 'First patient in (FPI)', date: '2026-07-05', status: 'active', urgency: 'due_30' },
    { id: 'm5', label: 'Continuing review due', date: '2027-05-01', status: 'planned', urgency: 'due_90' },
    { id: 'm6', label: 'Interim DSMB review', date: '2026-11-15', status: 'planned', urgency: 'upcoming' },
    { id: 'm7', label: 'Last patient in (LPI)', date: '2027-04-30', status: 'planned', urgency: 'upcoming' },
  ],
  budget: {
    params: { enrollment: 40, sponsorPerSubject: 28500, faRate: 0.30 },
    items: [
      { id: 'b1', cat: 'Personnel', label: 'Study coordinator (per subject)', perSubject: 4200 },
      { id: 'b2', cat: 'Personnel', label: 'PI / sub-I effort (per subject)', perSubject: 3100 },
      { id: 'b3', cat: 'Procedures', label: 'CT/PET imaging (×4)', perSubject: 6800 },
      { id: 'b4', cat: 'Procedures', label: 'Laboratory panels', perSubject: 2400 },
      { id: 'b5', cat: 'Pharmacy', label: 'Drug handling & dispensing', perSubject: 1900 },
      { id: 'b6', cat: 'Biomarker', label: 'ctDNA assay (exploratory)', perSubject: 2200 },
      { id: 'b7', cat: 'Overhead', label: 'Regulatory & data management', perSubject: 1500 },
    ],
  },
  amendments: [
    { id: 'am1', num: 'Amendment 1', summary: 'Add satellite sites; broaden creatinine-clearance threshold to ≥45 mL/min.', status: 'irb_review', reconsent: false, path: 'Expedited', changes: [
      { sec: '§5 Eligibility', from: 'CrCl ≥ 60 mL/min', to: 'CrCl ≥ 45 mL/min' },
      { sec: '§1 Synopsis', from: 'Single-site', to: 'Multi-site (3 sites)' },
    ] },
    { id: 'am2', num: 'Amendment 2 (draft)', summary: 'Add mandatory baseline echocardiogram for AF risk monitoring.', status: 'draft', reconsent: true, path: 'Full board', changes: [
      { sec: '§6 SoA', from: 'ECG only', to: 'ECG + baseline echocardiogram' },
    ] },
  ],
  deviations: [
    { id: 'd1', title: 'Out-of-window C2D1 visit (Day 25, +3 over window)', sev: 'minor', cat: 'Visit schedule', reportable: false, status: 'open', capa: [
      { id: 'cap1', action: 'Re-train coordinator on visit-window calculation', status: 'in_progress' },
    ] },
    { id: 'd2', title: 'Eligibility lab drawn 30 days before C1D1 (>28-day screening window)', sev: 'major', cat: 'Eligibility', reportable: true, status: 'capa', capa: [
      { id: 'cap2', action: 'Notify IRB within 5 business days', status: 'completed' },
      { id: 'cap3', action: 'Implement central eligibility pre-check', status: 'in_progress' },
    ] },
  ],
  reviews: [
    { id: 'rv1', reviewer: 'M. Chen (Regulatory)', role: 'Regulatory', status: 'commented', comments: [
      { id: 'rc1', sec: '§3 Objectives', sev: 'major', text: 'Primary endpoint timing (end of C4) should specify the response-confirmation scan window.', resolved: false },
    ] },
    { id: 'rv2', reviewer: 'S. Okafor (Biostatistics)', role: 'Biostatistics', status: 'commented', comments: [
      { id: 'rc2', sec: '§9 Statistics', sev: 'blocking', text: 'Sample-size justification missing — Simon two-stage parameters not stated.', resolved: false },
    ] },
    { id: 'rv3', reviewer: 'L. Park (Safety)', role: 'Safety', status: 'approved', comments: [] },
  ],
  consent: [
    { id: 'ce1', el: 'Statement that the study involves research', present: true },
    { id: 'ce2', el: 'Purpose of the research & expected duration', present: true },
    { id: 'ce3', el: 'Description of procedures', present: true },
    { id: 'ce4', el: 'Reasonably foreseeable risks or discomforts', present: true },
    { id: 'ce5', el: 'Benefits to subject or others', present: true },
    { id: 'ce6', el: 'Alternative procedures or treatments', present: false },
    { id: 'ce7', el: 'Confidentiality of records', present: true },
    { id: 'ce8', el: 'Compensation / treatment for injury (>minimal risk)', present: true },
    { id: 'ce9', el: 'Contacts for questions', present: true },
    { id: 'ce10', el: 'Voluntary participation statement', present: true },
    { id: 'ce11', el: 'Key-information summary at the beginning (2018 Common Rule)', present: false },
  ],
  completenessFindings: [
    { sev: 'critical', text: 'Section 9 (Statistical considerations) is not started — required for finalization.' },
    { sev: 'critical', text: 'Sample-size justification missing (blocking review comment open).' },
    { sev: 'major', text: 'Section 8 (Safety & adverse events) is not started.' },
    { sev: 'major', text: '2 informed-consent required elements absent (alternatives, key-information summary).' },
    { sev: 'minor', text: 'Section 12 (References) incomplete.' },
  ],
};

/* ---- C2C-16 Research Committee Governance ---- */

export interface CommitteeType { id: string; label: string; full: string; }
export interface CommitteeMember {
  id: string; name: string; role: string; kind: string;
  affiliated: boolean; citi: string; privileges: string[];
}
export interface MeetingListItem {
  id: string; committee: string; date: string; title: string; status: string; agendaCount: number;
}
export interface AgendaItem {
  id: string; kind: string; protocol: string; status: string; risk: string;
  votes: Record<string, string | null>;
}
export interface OpenMeeting {
  id: string; committee: string; title: string; date: string;
  quorumRequired: number; present: string[];
  agenda: AgendaItem[];
}
export interface PortfolioItem {
  id: string; protocol: string; committee: string; risk: string;
  status: string; next: string; flag: string;
}
export interface PdevCommittees {
  active: string;
  types: CommitteeType[];
  members: Record<string, CommitteeMember[]>;
  composition: Record<string, SevText[]>;
  meetings: MeetingListItem[];
  openMeeting: OpenMeeting;
  portfolio: PortfolioItem[];
}

export const PDEV_COMMITTEES: PdevCommittees = {
  active: 'irb',
  types: [
    { id: 'irb', label: 'IRB', full: 'Institutional Review Board' },
    { id: 'iacuc', label: 'IACUC', full: 'Institutional Animal Care & Use Committee' },
    { id: 'ibc', label: 'IBC', full: 'Institutional Biosafety Committee' },
  ],
  members: {
    irb: [
      { id: 'mb1', name: 'Dr. R. Halvorsen', role: 'Chair', kind: 'scientist', affiliated: true, citi: 'current', privileges: ['vote', 'approve', 'assign'] },
      { id: 'mb2', name: 'Dr. A. Nwosu', role: 'Vice-chair', kind: 'scientist', affiliated: true, citi: 'current', privileges: ['vote', 'approve'] },
      { id: 'mb3', name: 'Rev. T. Maddox', role: 'Member', kind: 'nonscientist', affiliated: true, citi: 'current', privileges: ['vote'] },
      { id: 'mb4', name: 'C. Iverson, Esq.', role: 'Member (non-affiliated)', kind: 'nonscientist', affiliated: false, citi: 'expiring', privileges: ['vote'] },
      { id: 'mb5', name: 'Dr. P. Strand', role: 'Member', kind: 'scientist', affiliated: true, citi: 'current', privileges: ['vote'] },
      { id: 'mb6', name: 'M. Delgado, RN', role: 'Member', kind: 'scientist', affiliated: true, citi: 'current', privileges: ['vote'] },
    ],
    iacuc: [
      { id: 'mc1', name: 'Dr. J. Feldman', role: 'Chair', kind: 'scientist', affiliated: true, citi: 'current', privileges: ['vote', 'approve', 'assign'] },
      { id: 'mc2', name: 'Dr. K. Osei, DVM', role: 'Attending veterinarian', kind: 'veterinarian', affiliated: true, citi: 'current', privileges: ['vote', 'approve'] },
      { id: 'mc3', name: 'B. Larkin', role: 'Non-affiliated member', kind: 'nonscientist', affiliated: false, citi: 'current', privileges: ['vote'] },
      { id: 'mc4', name: 'Dr. S. Yuen', role: 'Scientist member', kind: 'scientist', affiliated: true, citi: 'expiring', privileges: ['vote'] },
    ],
    ibc: [
      { id: 'mi1', name: 'Dr. W. Achebe', role: 'Chair', kind: 'scientist', affiliated: true, citi: 'current', privileges: ['vote', 'approve', 'assign'] },
      { id: 'mi2', name: 'Dr. F. Romano', role: 'Biosafety officer', kind: 'scientist', affiliated: true, citi: 'current', privileges: ['vote', 'approve'] },
      { id: 'mi3', name: 'G. Tran', role: 'Community member', kind: 'nonscientist', affiliated: false, citi: 'missing', privileges: ['vote'] },
    ],
  },
  composition: {
    irb: [{ sev: 'info', text: '≥5 members present (6).' }, { sev: 'info', text: 'Nonscientist member present.' }, { sev: 'info', text: 'Non-affiliated member present.' }, { sev: 'warning', text: '1 member CITI training expiring within 30 days.' }],
    iacuc: [{ sev: 'info', text: 'Attending veterinarian present.' }, { sev: 'info', text: 'Non-affiliated member present.' }, { sev: 'warning', text: 'Only 4 members — confirm quorum policy.' }],
    ibc: [{ sev: 'critical', text: '1 member CITI training missing — ineligible to vote.' }, { sev: 'warning', text: '3 members — below recommended minimum of 5.' }],
  },
  meetings: [
    { id: 'mtg1', committee: 'irb', date: '2026-07-02', title: 'IRB Convened Meeting — July', status: 'scheduled', agendaCount: 3 },
    { id: 'mtg2', committee: 'irb', date: '2026-06-04', title: 'IRB Convened Meeting — June', status: 'completed', agendaCount: 4 },
  ],
  openMeeting: {
    id: 'mtg1', committee: 'irb', title: 'IRB Convened Meeting — July', date: '2026-07-02',
    quorumRequired: 4, present: ['mb1', 'mb2', 'mb3', 'mb4', 'mb5'],
    agenda: [
      { id: 'ag1', kind: 'Initial review', protocol: 'SELVO-DLBCL-201 (PROT-2041)', status: 'voting', risk: 'Greater than minimal risk',
        votes: { mb1: 'approve_with_modifications', mb2: 'approve_with_modifications', mb3: 'approve', mb4: null, mb5: 'disapprove' } },
      { id: 'ag2', kind: 'Continuing review', protocol: 'NF-MEL-118 Melanoma registry', status: 'pending', risk: 'Minimal risk', votes: {} },
      { id: 'ag3', kind: 'Amendment', protocol: 'PED-ALL-077 (Amendment 3)', status: 'pending', risk: 'Minimal risk', votes: {} },
    ],
  },
  portfolio: [
    { id: 'p1', protocol: 'SELVO-DLBCL-201', committee: 'IRB', risk: 'Greater than minimal', status: 'Pending initial', next: '2026-07-02', flag: 'agenda' },
    { id: 'p2', protocol: 'NF-MEL-118', committee: 'IRB', risk: 'Minimal', status: 'Approved', next: '2026-09-12', flag: 'continuing' },
    { id: 'p3', protocol: 'PED-ALL-077', committee: 'IRB', risk: 'Minimal', status: 'Approved', next: '2026-07-02', flag: 'amendment' },
    { id: 'p4', protocol: 'TOX-RAT-204', committee: 'IACUC', risk: 'USDA Category D', status: 'Approved', next: '2026-08-01', flag: 'continuing' },
    { id: 'p5', protocol: 'VEC-AAV-031', committee: 'IBC', risk: 'BSL-2', status: 'Pending', next: '2026-07-18', flag: 'review' },
  ],
};

/* ---- C2C-15 Medicare Coverage Analysis ---- */

export interface CoverageLineItem {
  id: string; item: string; soc: boolean; sponsorPaid: boolean;
  designation: string; ncd: string; icd10: string; valid: boolean;
}
export interface CoverageSuggestion { item: string; suggest: string; }
export interface CoverageQualifying {
  therapeuticIntent: boolean; enrollsMedicare: boolean; principalPurpose: boolean;
  deemed: boolean; desirableCount: number;
  determination: string; rationale: string;
}
export interface CoverageAnalysis {
  id: string; title: string; study: string; nct: string; sponsor: string; status: string;
  qualifying: CoverageQualifying;
  items: CoverageLineItem[];
  suggestions: CoverageSuggestion[];
  disclaimer: string;
}
export interface PdevCoverage { analysis: CoverageAnalysis; }

export const PDEV_COVERAGE: PdevCoverage = {
  analysis: {
    id: 'CA-118', title: 'SELVO-DLBCL-201 — Medicare Coverage Analysis', study: 'PROT-2041',
    nct: 'NCT0————', sponsor: 'Northfield Cancer Institute', status: 'in_progress',
    qualifying: {
      therapeuticIntent: true, enrollsMedicare: true, principalPurpose: true,
      deemed: true, desirableCount: 6,
      determination: 'Qualifying clinical trial', rationale: 'Meets all three NCD 310.1 criteria and is deemed (NIH-funded correlative). Routine costs are billable to Medicare.',
    },
    items: [
      { id: 'ci1', item: 'CT/PET imaging — screening', soc: true, sponsorPaid: false, designation: 'Routine cost', ncd: 'NCD 310.1', icd10: 'C83.30', valid: true },
      { id: 'ci2', item: 'Study drug (selvotinib)', soc: false, sponsorPaid: true, designation: 'Sponsor-paid', ncd: '—', icd10: 'Z00.6', valid: true },
      { id: 'ci3', item: 'CBC with differential', soc: true, sponsorPaid: false, designation: 'Routine cost', ncd: 'NCD 310.1', icd10: 'C83.30', valid: true },
      { id: 'ci4', item: 'ctDNA assay (exploratory)', soc: false, sponsorPaid: true, designation: 'Sponsor-paid', ncd: '—', icd10: 'Z00.6', valid: true },
      { id: 'ci5', item: 'Management of treatment complications', soc: true, sponsorPaid: false, designation: 'Routine cost', ncd: 'NCD 310.1', icd10: 'D70.1', valid: true },
      { id: 'ci6', item: 'Baseline echocardiogram (Amendment 2)', soc: false, sponsorPaid: false, designation: 'Unclassified', ncd: 'pending', icd10: '', valid: false },
    ],
    suggestions: [
      { item: 'Baseline echocardiogram', suggest: 'Likely routine cost — monitoring for class-effect toxicity is standard of care; confirm SOC at this institution.' },
    ],
    disclaimer: 'This analysis is advisory and based on NCD 310.1 and applicable LCDs. It is not a billing or coverage determination and does not constitute legal advice. The deterministic classification engine is the source of truth; AI text is advisory only.',
  },
};

/* ---- C2C-14 Intelligent Grant Finder ---- */

export interface GrantProfile {
  keywords: string[]; agencies: string[]; mechanisms: string[];
  institutionType: string; awardMin: number; awardMax: number;
}
export interface GrantOpportunity {
  id: string; title: string; agency: string; mech: string;
  fit: number; eligible: boolean; deadlineDays: number;
  ceiling: string; reasons: string[];
}
export interface PdevGrants { profile: GrantProfile; opportunities: GrantOpportunity[]; }

export const PDEV_GRANTS: PdevGrants = {
  profile: { keywords: ['DLBCL', 'BTK inhibitor', 'ctDNA', 'liquid biopsy', 'lymphoma'], agencies: ['NIH/NCI', 'DoD CDMRP', 'LLS'], mechanisms: ['R01', 'R21', 'Career Development'], institutionType: 'Academic medical center', awardMin: 250000, awardMax: 2500000 },
  opportunities: [
    { id: 'g1', title: 'NCI Clinical Trials & Translational Research (R01)', agency: 'NIH/NCI', mech: 'R01', fit: 92, eligible: true, deadlineDays: 38, ceiling: '$2.5M / 5y', reasons: ['Keyword match: DLBCL, ctDNA', 'Mechanism match: R01', 'Translational correlative aligns with PA-25 priorities'] },
    { id: 'g2', title: 'Blood Cancer Discoveries Grant Program', agency: 'LLS', mech: 'Project', fit: 84, eligible: true, deadlineDays: 61, ceiling: '$1.2M / 3y', reasons: ['Disease match: lymphoma', 'Early-phase IIT eligible', 'Biomarker focus encouraged'] },
    { id: 'g3', title: 'DoD Peer-Reviewed Cancer — Idea Award', agency: 'DoD CDMRP', mech: 'Idea', fit: 71, eligible: true, deadlineDays: 19, ceiling: '$700K / 3y', reasons: ['Novel ctDNA hypothesis', 'Innovation-weighted', 'Deadline approaching'] },
    { id: 'g4', title: 'Exploratory/Developmental Research (R21)', agency: 'NIH/NCI', mech: 'R21', fit: 67, eligible: true, deadlineDays: 105, ceiling: '$275K / 2y', reasons: ['Exploratory endpoint fit', 'Award range match', 'No preliminary data required'] },
    { id: 'g5', title: 'Established Investigator Award', agency: 'LLS', mech: 'Career', fit: 41, eligible: false, deadlineDays: 8, ceiling: '$1.1M / 5y', reasons: ['PI rank below threshold', 'Eligibility: 7+ yrs independent'] },
  ],
};

/* ---- C2C-01/02 CITI Training matrix ---- */

export interface CitiPerson {
  id: string; name: string; role: string; cells: string[];
}
export interface ExpiringTraining { name: string; training: string; days: number; }
export interface PdevCiti {
  trainings: string[];
  personnel: CitiPerson[];
  expiring: ExpiringTraining[];
}

export const PDEV_CITI: PdevCiti = {
  trainings: ['Human Subjects (Biomed)', 'GCP', 'IACUC (Working with Animals)', 'Biosafety / IBC', 'Conflict of Interest'],
  personnel: [
    { id: 'tp1', name: 'Dr. Elena Vasquez', role: 'PI', cells: ['current', 'current', 'n/a', 'n/a', 'current'] },
    { id: 'tp2', name: 'Dr. A. Nwosu', role: 'Sub-I', cells: ['current', 'current', 'n/a', 'n/a', 'expiring'] },
    { id: 'tp3', name: 'M. Delgado, RN', role: 'Coordinator', cells: ['current', 'expiring', 'n/a', 'n/a', 'current'] },
    { id: 'tp4', name: 'S. Okafor', role: 'Biostat', cells: ['current', 'current', 'n/a', 'n/a', 'missing'] },
    { id: 'tp5', name: 'Dr. K. Osei, DVM', role: 'Veterinarian', cells: ['n/a', 'current', 'current', 'current', 'current'] },
    { id: 'tp6', name: 'R. Patel', role: 'Lab tech', cells: ['expired', 'n/a', 'current', 'current', 'missing'] },
  ],
  expiring: [
    { name: 'Dr. A. Nwosu', training: 'Conflict of Interest', days: 21 },
    { name: 'M. Delgado, RN', training: 'GCP', days: 14 },
    { name: 'Dr. K. Osei', training: 'IACUC', days: 27 },
  ],
};

/* ---- C2C-16 Portfolio analytics (continuing-review expiration) ---- */

export interface PortfolioAnalyticsBuckets {
  expired: number; due_30: number; due_90: number; current: number;
}
export interface NeedsAttentionItem {
  protocol: string; committee: string; issue: string; citation: string; urgency: string;
}
export interface PdevPortfolioAnalytics {
  buckets: PortfolioAnalyticsBuckets;
  needsAttention: NeedsAttentionItem[];
}

export const PDEV_PORTFOLIO_ANALYTICS: PdevPortfolioAnalytics = {
  buckets: { expired: 1, due_30: 2, due_90: 3, current: 7 },
  needsAttention: [
    { protocol: 'VEC-AAV-031', committee: 'IBC', issue: 'Continuing review expired 4 days ago', citation: '45 CFR 46.109(f) / institutional policy', urgency: 'expired' },
    { protocol: 'PED-ALL-077', committee: 'IRB', issue: 'Continuing review due in 12 days', citation: '45 CFR 46.109(f)', urgency: 'due_30' },
    { protocol: 'TOX-RAT-204', committee: 'IACUC', issue: 'Annual review due in 23 days', citation: 'PHS Policy IV.C.1.a', urgency: 'due_30' },
    { protocol: 'SELVO-DLBCL-201', committee: 'IRB', issue: 'Initial approval pending July board', citation: '—', urgency: 'due_90' },
  ],
};

/* ---- Severity-to-tone map ---- */

export const PDEV_SEV_TONE: Record<string, string> = {
  critical: 'err', blocking: 'err', major: 'warn', minor: 'ai', warning: 'warn', info: 'idle',
};

/* ---- Helpers ---- */

export function pdevPct(n: number, d: number): number {
  return d ? Math.round((n / d) * 100) : 0;
}
