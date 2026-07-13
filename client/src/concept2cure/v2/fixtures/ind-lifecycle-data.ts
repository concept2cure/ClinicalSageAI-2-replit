/**
 * IND Lifecycle fixture data -- deterministic compute + fixture sections,
 * forms, deliverables. Verbatim from kit ind-lifecycle-data.jsx.
 *
 * Mirror of:
 *   services/ind-lifecycle/ind-readiness-service.ts  (IndReadinessReport)
 *   services/ind-lifecycle/ind-regulatory-clock.ts   (ClockState)
 *   services/regulatory/ind-ectd-sections.ts         (section blueprint)
 *   server/routes/ind-lifecycle/documents.routes.ts  (deliverables)
 */

/* ── Types ── */

export interface IndlProgram {
  code: string;
  drugName: string;
  productName: string;
  indication: string;
  sponsorName: string;
  submissionType: string;
  targetReceiptOffsetDays: number;
}

export interface IndlForm {
  id: string;
  title: string;
  label: string;
  ref: string;
  done: boolean;
}

export interface IndlSection {
  code: string;
  title: string;
  module: string;
  ref: string;
  ai: boolean;
  status: string;
}

export interface IndlDeliverable {
  id: string;
  title: string;
  placement: string;
  ref: string;
  ai: boolean;
  group: 'file' | 'lifecycle';
  route: string;
  desc: string;
  ask: string;
}

export interface IndlClockStatusEntry {
  label: string;
  tone: string;
}

export interface IndlModuleProgress {
  module: string;
  title: string;
  total: number;
  completed: number;
  percentage: number;
}

export interface IndlIncompleteSection {
  code: string;
  title: string;
  module: string;
  status: string;
  regulatoryRef: string;
}

export interface IndlBlocker {
  kind: 'required_section' | 'required_form' | 'overdue_safety_report';
  code: string;
  message: string;
}

export interface IndlReadinessReport {
  filingType: string;
  ready: boolean;
  overallPercentage: number;
  moduleProgress: IndlModuleProgress[];
  requiredSections: {
    total: number;
    completed: number;
    incomplete: IndlIncompleteSection[];
  };
  forms: {
    required: string[];
    completed: string[];
    missing: string[];
  };
  blockers: IndlBlocker[];
  warnings: string[];
}

export interface IndlClockState {
  status: string;
  thirtyDayDate: string;
  safeToProceed: boolean;
  onHold: boolean;
  daysUntilThirtyDay: number;
  rationale: string;
}

/* ── Fixture data ── */

export const INDL_PROGRAM: IndlProgram = {
  code: 'BX-301',
  drugName: 'BX-301',
  productName: 'BX-301 (anti-BCMA mAb)',
  indication: 'Relapsed/refractory multiple myeloma',
  sponsorName: 'Concept2Cure',
  submissionType: 'IND',
  targetReceiptOffsetDays: 14,
};

export const INDL_FORMS: IndlForm[] = [
  { id: 'FDA_1571', title: 'Form FDA 1571', label: 'IND Application', ref: '21 CFR 312.23(a)(1)', done: true },
  { id: 'FDA_1572', title: 'Form FDA 1572', label: 'Statement of Investigator', ref: '21 CFR 312.53(c)', done: true },
  { id: 'FDA_3674', title: 'Form FDA 3674', label: 'Certification of Compliance (ClinicalTrials.gov)', ref: '42 USC 282(j)(5)(B)', done: false },
];

export const INDL_SECTIONS: IndlSection[] = [
  { code: 'm1.2', title: 'Cover Letter', module: 'M1', ref: '21 CFR 312.23(a)(1)', ai: true, status: 'signed' },
  { code: 'm1.3.3', title: 'Debarment Certification', module: 'M1', ref: '21 USC 335a', ai: false, status: 'approved' },
  { code: 'm1.5', title: 'Table of Contents', module: 'M1', ref: '21 CFR 312.23(a)(1)', ai: true, status: 'approved' },
  { code: 'm1.6.1', title: 'Introductory Statement', module: 'M1', ref: '21 CFR 312.23(a)(3)(i)', ai: true, status: 'approved' },
  { code: 'm1.6.2', title: 'General Investigational Plan', module: 'M1', ref: '21 CFR 312.23(a)(3)(iv)', ai: true, status: 'qa_review' },
  { code: 'm1.7', title: "Investigator's Brochure", module: 'M1', ref: '21 CFR 312.23(a)(5)', ai: true, status: 'drafting' },
  { code: 'm1.9', title: 'Environmental Assessment / Categorical Exclusion', module: 'M1', ref: '21 CFR 25.31', ai: true, status: 'approved' },
  { code: 'm2.3', title: 'Quality Overall Summary', module: 'M2', ref: 'ICH M4Q(R1)', ai: true, status: 'approved' },
  { code: 'm2.4', title: 'Nonclinical Overview', module: 'M2', ref: 'ICH M4S(R2)', ai: true, status: 'internal_review' },
  { code: 'm2.6', title: 'Nonclinical Written & Tabulated Summaries', module: 'M2', ref: 'ICH M4S(R2)', ai: true, status: 'approved' },
  { code: 'm3.2.S.2', title: 'Manufacture (Drug Substance)', module: 'M3', ref: 'ICH Q7', ai: true, status: 'approved' },
  { code: 'm3.2.S.4', title: 'Control of Drug Substance', module: 'M3', ref: 'ICH Q6A', ai: true, status: 'approved' },
  { code: 'm3.2.S.7', title: 'Stability (Drug Substance)', module: 'M3', ref: 'ICH Q1A/Q1B', ai: true, status: 'drafting' },
  { code: 'm3.2.P.3', title: 'Manufacture (Drug Product)', module: 'M3', ref: 'ICH Q7', ai: true, status: 'approved' },
  { code: 'm3.2.P.8', title: 'Stability (Drug Product)', module: 'M3', ref: 'ICH Q1A/Q5C', ai: true, status: 'drafting' },
  { code: 'm4.2.1', title: 'Pharmacology', module: 'M4', ref: 'ICH S7A/S7B', ai: false, status: 'approved' },
  { code: 'm4.2.2', title: 'Pharmacokinetics', module: 'M4', ref: 'ICH M4S', ai: false, status: 'approved' },
];

export const INDL_STATUS_LABEL: Record<string, string> = {
  not_started: 'Not started',
  data_gathering: 'Data gathering',
  drafting: 'Drafting',
  internal_review: 'Internal review',
  revision: 'Revision',
  qa_review: 'QA review',
  approved: 'Approved',
  signed: 'Signed',
  locked: 'Locked',
};

export const INDL_CLOCK_STATUS: Record<string, IndlClockStatusEntry> = {
  submitted: { label: 'In 30-day review', tone: 'warn' },
  safe_to_proceed: { label: 'Safe to proceed', tone: 'good' },
  clinical_hold: { label: 'Clinical hold', tone: 'bad' },
  partial_clinical_hold: { label: 'Partial hold', tone: 'bad' },
  withdrawn: { label: 'Withdrawn', tone: 'bad' },
  inactive: { label: 'Inactive', tone: 'info' },
};

export const INDL_DELIVERABLES: IndlDeliverable[] = [
  {
    id: 'cover-letter', title: 'IND Cover Letter', placement: 'eCTD m1.2', ref: '21 CFR 312.23(a)(1)', ai: true, group: 'file',
    route: 'POST /api/ind-lifecycle/cover-letter',
    desc: 'Introduces the IND, summarizes contents, and highlights key points for the FDA reviewer.',
    ask: 'Assemble the IND cover letter (m1.2) for the ' + INDL_PROGRAM.drugName + ' IND.',
  },
  {
    id: 'briefing-book', title: 'Pre-IND Briefing Book', placement: 'Meeting package', ref: 'FDA Type B (Pre-IND)', ai: true, group: 'file',
    route: 'POST /api/ind-lifecycle/briefing-book',
    desc: 'FDA meeting briefing book -- background, questions, and sponsor positions for the Pre-IND meeting.',
    ask: 'Assemble the Pre-IND briefing book for ' + INDL_PROGRAM.productName + '.',
  },
  {
    id: 'loa', title: 'Letter of Authorization', placement: 'eCTD m1.4.1', ref: '21 CFR 312.23(b)', ai: false, group: 'file',
    route: 'POST /api/ind-lifecycle/loa',
    desc: 'Authorization to reference another IND or Drug Master File, with LOA-coverage QC.',
    ask: 'Assemble a Letter of Authorization (m1.4.1) for a referenced DMF.',
  },
  {
    id: 'safety-report', title: 'IND Safety Report', placement: 'eCTD amendment', ref: '21 CFR 312.32', ai: true, group: 'lifecycle',
    route: 'POST /api/ind-lifecycle/safety-report',
    desc: 'Classifies the event (7/15-day reportability) and assembles the expedited safety report + E2B(R3) ICSR.',
    ask: 'Classify and assemble an IND safety report (312.32) for a serious unexpected adverse event.',
  },
  {
    id: 'annual-report', title: 'IND Annual Report / DSUR', placement: 'eCTD annual sequence', ref: '21 CFR 312.33', ai: true, group: 'lifecycle',
    route: 'POST /api/ind-lifecycle/annual-report',
    desc: 'Assembles the annual report / DSUR section model with the serious-AE line listing (312.33(b)).',
    ask: 'Assemble the IND annual report / DSUR (312.33) for the current reporting year.',
  },
  {
    id: 'amendment', title: 'Protocol / Information Amendment', placement: 'eCTD amendment sequence', ref: '21 CFR 312.30/.31', ai: true, group: 'lifecycle',
    route: 'POST /api/ind-lifecycle/amendment-plan',
    desc: 'Plans a protocol or information amendment and the leaves it touches.',
    ask: 'Plan a protocol amendment (312.30) for the ongoing study.',
  },
];

/* ── Deterministic compute: mirror of evaluateIndReadiness ── */

const COMPLETE_STATUSES: Record<string, boolean> = { approved: true, signed: true, locked: true };
const MODULE_TITLES: Record<string, string> = {
  M1: 'Module 1 -- Administrative',
  M2: 'Module 2 -- Summaries',
  M3: 'Module 3 -- Quality (CMC)',
  M4: 'Module 4 -- Nonclinical',
  M5: 'Module 5 -- Clinical',
};

export function indlReadiness(
  sections: IndlSection[] = INDL_SECTIONS,
  forms: IndlForm[] = INDL_FORMS,
  overdueSafetyReports = 0,
): IndlReadinessReport {
  const incomplete: IndlIncompleteSection[] = [];
  let completed = 0;
  for (const s of sections) {
    if (COMPLETE_STATUSES[s.status]) {
      completed += 1;
    } else {
      incomplete.push({ code: s.code, title: s.title, module: s.module, status: s.status, regulatoryRef: s.ref });
    }
  }
  const missingForms = forms.filter((f) => !f.done).map((f) => f.id);
  const completedForms = forms.filter((f) => f.done).map((f) => f.id);

  const mods: Record<string, IndlModuleProgress> = {};
  for (const s of sections) {
    if (!mods[s.module]) {
      mods[s.module] = { module: s.module, title: MODULE_TITLES[s.module] || s.module, total: 0, completed: 0, percentage: 0 };
    }
    mods[s.module].total += 1;
    if (COMPLETE_STATUSES[s.status]) mods[s.module].completed += 1;
  }
  const moduleProgress = Object.keys(mods).sort().map((k) => {
    const m = mods[k];
    m.percentage = m.total ? Math.round((m.completed / m.total) * 100) : 100;
    return m;
  });

  const blockers: IndlBlocker[] = [];
  for (const g of incomplete) {
    blockers.push({
      kind: 'required_section',
      code: g.code,
      message: 'Required section ' + g.code + ' (' + g.title + ') is ' + (INDL_STATUS_LABEL[g.status] || g.status) + ' -- must be approved/signed before filing.',
    });
  }
  for (const f of missingForms) {
    blockers.push({ kind: 'required_form', code: f, message: 'Required Module 1 form ' + f + ' is not complete.' });
  }
  if (overdueSafetyReports > 0) {
    blockers.push({ kind: 'overdue_safety_report', code: 'safety', message: overdueSafetyReports + ' expedited IND safety report(s) past the 21 CFR 312.32 deadline.' });
  }

  const totalItems = sections.length + forms.length;
  const doneItems = completed + completedForms.length;
  return {
    filingType: 'initial',
    ready: blockers.length === 0,
    overallPercentage: totalItems === 0 ? 100 : Math.round((doneItems / totalItems) * 100),
    moduleProgress,
    requiredSections: { total: sections.length, completed, incomplete },
    forms: { required: forms.map((f) => f.id), completed: completedForms, missing: missingForms },
    blockers,
    warnings: [],
  };
}

/* ── Deterministic compute: mirror of evaluateRegulatoryClock (30-day safe-to-proceed) ── */

interface ClockEvent {
  date: string;
  type: string;
}

export function indlClock(
  receiptISO: string,
  events: ClockEvent[] = [],
  asOfISO?: string,
): IndlClockState {
  const DAY = 86400000;
  const asOf = asOfISO ? new Date(asOfISO) : new Date();
  const thirty = new Date(new Date(receiptISO).getTime() + 30 * DAY);
  const elapsed = asOf.getTime() >= thirty.getTime();
  const daysUntil = elapsed ? 0 : Math.ceil((thirty.getTime() - asOf.getTime()) / DAY);

  let hold = 'none';
  let terminal: string | null = null;
  events
    .filter((e) => new Date(e.date).getTime() <= asOf.getTime())
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .forEach((e) => {
      if (e.type === 'clinical_hold_imposed') hold = 'clinical_hold';
      else if (e.type === 'partial_hold_imposed') hold = 'partial_clinical_hold';
      else if (e.type === 'hold_lifted') hold = 'none';
      else if (e.type === 'withdrawn') terminal = 'withdrawn';
      else if (e.type === 'inactivated') terminal = 'inactive';
      else if (e.type === 'reactivated') terminal = null;
    });

  let status: string;
  let rationale: string;
  if (terminal === 'withdrawn') {
    status = 'withdrawn';
    rationale = 'The IND has been withdrawn by the sponsor; no clinical investigation may proceed under it.';
  } else if (terminal === 'inactive') {
    status = 'inactive';
    rationale = 'The IND is on inactive status (21 CFR 312.45); it must be reactivated before proceeding.';
  } else if (hold === 'clinical_hold') {
    status = 'clinical_hold';
    rationale = 'A clinical hold is in effect (21 CFR 312.42); the affected investigation(s) may not proceed until the hold is lifted.';
  } else if (hold === 'partial_clinical_hold') {
    status = 'partial_clinical_hold';
    rationale = 'A partial clinical hold is in effect; only the unaffected portions of the investigation may proceed.';
  } else if (elapsed) {
    status = 'safe_to_proceed';
    rationale = 'The 30-day review period has elapsed with no clinical hold; clinical investigations may proceed (21 CFR 312.40(b)).';
  } else {
    status = 'submitted';
    rationale = 'Within the 30-day FDA review period; ' + daysUntil + ' calendar day(s) remain before the investigation may begin absent a hold.';
  }

  const onHold = status === 'clinical_hold' || status === 'partial_clinical_hold';
  return {
    status,
    thirtyDayDate: thirty.toISOString(),
    safeToProceed: elapsed && !onHold && terminal === null,
    onHold,
    daysUntilThirtyDay: daysUntil,
    rationale,
  };
}
