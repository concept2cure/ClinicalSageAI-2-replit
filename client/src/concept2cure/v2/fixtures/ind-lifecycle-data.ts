/**
 * IND lifecycle reference configuration. No records and no engines: the folder
 * name predates the de-mock work. The invented programme, sections and forms
 * this file once held are gone (see the notes below), and so, since 2026-10-15,
 * are its two client copies of server engines — a readiness evaluator and a
 * regulatory clock, mirrors of evaluateIndReadiness and
 * evaluateRegulatoryClock. The IND screen reads the checklist's server verdict
 * and POST /api/ind-lifecycle/clock instead. What remains is display labels and
 * the deliverable card definitions, each named with its reason in
 * scripts/ci/launch-scope-fixture-allowlist.json (the IND screen is a launch
 * surface since decision P-32, 2026-10-15).
 *
 * Mirror of (labels only):
 *   server/services/ind-lifecycle/ind-regulatory-clock.ts  (ClockStatus labels)
 *   server/routes/ind-lifecycle/documents.routes.ts  (deliverables)
 */

/* ── Types ── */

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
  /** Set when the deliverable is not offered in this release: the card is not
      rendered, and this sentence is shown in its place. The entry is kept so
      the card returns as it was (decision P-32). */
  withheld?: string;
}

export interface IndlClockStatusEntry {
  label: string;
  tone: string;
}

/* ── Fixture data ── */

/*
 * INDL_PROGRAM is gone, and with it the IndlProgram type.
 *
 * It described an invented drug programme — code and drugName 'BX-301',
 * productName 'BX-301 (anti-BCMA mAb)', indication 'Relapsed/refractory
 * multiple myeloma', sponsor 'Concept2Cure' — and it existed for exactly one
 * purpose: two deliverable `ask` strings concatenated it at module load into
 *
 *   "Assemble the IND cover letter (m1.2) for the BX-301 IND."
 *   "Assemble the Pre-IND briefing book for BX-301 (anti-BCMA mAb)."
 *
 * Those are not labels. IndLifecycle.tsx:551 passes `d.ask` to the shell's
 * onAsk, which pushes it into the AnA conversation as a USER message and
 * renders it in the rail. So clicking "Assemble" on either card put an invented
 * product, indication and modality into the customer's own words, addressed to
 * the assistant, in a regulatory workspace where the next thing produced is a
 * submission document.
 *
 * The fix is what the other four deliverables in this list already do: say
 * "this IND" and "this program" and let the conversation carry the real
 * context. Nothing else in the repo referenced INDL_PROGRAM, so removing it
 * costs nothing — it was invented content whose only job was to be spoken.
 */

/* The fixture form/section arrays that used to live here -- 17 invented
   sections with fabricated 'approved'/'drafting' statuses -- are deleted.
   They had no importer, but they remained the DEFAULT ARGUMENTS of the
   client readiness evaluator, so one argless call anywhere would have rendered
   a fabricated readiness figure for a real program. The defaults went with
   them, and the evaluator itself went on 2026-10-15: readiness is the
   server's verdict. */

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
  // A frozen authoring document: sealed, not approved, so not complete (DP-35).
  frozen: 'Frozen, not approved',
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
    ask: 'Assemble the IND cover letter (m1.2) for this IND.',
  },
  {
    id: 'briefing-book', title: 'Pre-IND Briefing Book', placement: 'Meeting package', ref: 'FDA Type B (Pre-IND)', ai: true, group: 'file',
    route: 'POST /api/ind-lifecycle/briefing-book',
    desc: 'FDA meeting briefing book -- background, questions, and sponsor positions for the Pre-IND meeting.',
    ask: 'Assemble the Pre-IND briefing book for this program.',
  },
  {
    id: 'loa', title: 'Letter of Authorization', placement: 'eCTD m1.4.1', ref: '21 CFR 312.23(b)', ai: false, group: 'file',
    route: 'POST /api/ind-lifecycle/loa',
    desc: 'Authorization to reference another IND or Drug Master File, with LOA-coverage QC.',
    ask: 'Assemble a Letter of Authorization (m1.4.1) for a referenced DMF.',
  },
  {
    id: 'right-of-reference', title: 'Statement of Right of Reference', placement: 'eCTD m1.4.2', ref: '21 CFR 312.23(b)', ai: false, group: 'file',
    route: 'POST /api/ind-lifecycle/right-of-reference',
    desc: 'The sponsor’s statement that a right of reference to another file has been granted, with its gap list.',
    ask: 'Assemble the Statement of Right of Reference (m1.4.2) for a referenced file.',
  },
  {
    id: 'safety-report', title: 'IND Safety Report', placement: 'eCTD amendment', ref: '21 CFR 312.32', ai: true, group: 'lifecycle',
    route: 'POST /api/ind-lifecycle/safety-report',
    desc: 'Classifies the event (7/15-day reportability) and assembles the expedited safety report + E2B(R3) ICSR.',
    ask: 'Classify and assemble an IND safety report (312.32) for a serious unexpected adverse event.',
    /* Decision P-32, 2026-10-15: 15-day safety reporting and ICSR transmission
       are not in this release. Their routes are refused 403 LAUNCH_SCOPE in
       production, and the card's code is kept in
       surfaces/indSafetyReportCard.ts. */
    withheld:
      'IND safety reports under 21 CFR 312.32 (the 7- and 15-day expedited reports) and ICSR transmission are not in this release.',
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
