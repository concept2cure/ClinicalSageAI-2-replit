/**
 * Project-home DISPLAY CONFIG, types and small presentational helpers.
 *
 * What remains here is configuration and rendering logic, not data about any
 * real programme: lifecycle stages, stage→tool maps, status/priority tone
 * lookups, kanban column definitions, and the pjInitials / fileTone / Ring
 * helpers ProjectHome imports.
 *
 * The fixture DATA constants are gone: PROJH, PV_TREE, pvAllDocs, pvStats,
 * PROJ_MEETINGS, PROJECTS and NP_TEAMS. Between them they described a whole
 * invented programme ("BX-204 — NDA 212345"), an invented eCTD document tree,
 * invented meetings, an invented project portfolio with named leads, and an
 * invented project team (Jordan Chen, Ana Müller, Marcus Webb …) — the same
 * fictional people that used to supply assignee names on the task board.
 *
 * ProjectHome had already stopped reading them; it renders the project's real
 * data room, an honest empty state, or an honest error state. They sat here
 * unreferenced, which is the only reason they were harmless.
 *
 * Do NOT re-port them from the kit. The real sources are the project, source
 * and document endpoints the surface already calls.
 */
import React from 'react';

/* ── Types ── */

export interface ProjHierarchy {
  depth: number;
  label: string;
  kind: string;
}

export interface ProjProgram {
  id: string;
  title: string;
  productName: string;
  productType: string;
  submissionType: string;
  region: string;
  clientType: string;
  ta: string;
  indication: string;
  lead: string;
  status: string;
  priority: string;
  type: string;
  riskLevel: string;
  completion: number;
  due: string;
  dueTone: string;
  retrievalMode: string;
  tokenEst: string;
  knowledgeTokens: number;
  hierarchy: ProjHierarchy[];
  desc: string;
}

export interface ProjIntelligence {
  readinessStatus: string;
  currentBlockers: string[];
  importantDecisions: string[];
  unresolvedRisks: string[];
  nextRecommendedActions: string[];
}

export interface ProjMemory {
  visibility: string;
  updated: string;
  body: string;
}

export interface ProjInstructions {
  updated: string;
  body: string;
}

export interface PyramidPhase {
  n: number;
  name: string;
  status: string;
  done: number;
  total: number;
  critical: boolean;
  gate?: string;
}

export interface ProjPyramid {
  pathway: string;
  label: string;
  phases: PyramidPhase[];
}

export interface ScheduleGoal {
  t: string;
  status: string;
  when: string;
}

export interface ProjSchedule {
  generatedByAna: boolean;
  confidence: number;
  updated: string;
  basis: string;
  goals: ScheduleGoal[];
}

export interface ProjTask {
  id: string;
  name: string;
  status: string;
  priority: string;
  module: string;
  assignee: string;
  due: string;
  ctq: boolean;
  critical: boolean;
  phase: number;
  dependsOn: string[];
  blockedReason?: string;
}

export interface ProjBoard {
  orgTotal: number;
  byStatus: null;
}

export interface ReadinessFinding {
  rule: string;
  kind: string;
  severity: string;
  status: string;
}

export interface ProjReadiness {
  score: number;
  isReady: boolean;
  blockerCount: number;
  rulesBased: ReadinessFinding[];
  validation: ReadinessFinding[];
  aiInferred: ReadinessFinding[];
}

export interface LinkedModule {
  m: string;
  t: string;
  done: number;
  risk?: boolean;
}

export interface ProjFile {
  name: string;
  type: string;
  module: string;
  section: string;
  dtype: string;
  status: string;
  conf: number | null;
}

export interface ProjConversation {
  t: string;
  when: string;
  n: number;
}

export interface ProjTeamMember {
  role: string;
  name: string;
  sig: string;
}

export interface ProjActivity {
  who: string;
  what: string;
  when: string;
}

export interface ProjH {
  program: ProjProgram;
  intelligence: ProjIntelligence;
  memory: ProjMemory;
  instructions: ProjInstructions;
  pyramid: ProjPyramid;
  schedule: ProjSchedule;
  tasks: ProjTask[];
  board: ProjBoard;
  readiness: ProjReadiness;
  linkedModules: LinkedModule[];
  files: ProjFile[];
  capacity: number;
  conversations: ProjConversation[];
  team: ProjTeamMember[];
  activity: ProjActivity[];
}

export interface PvNode {
  id: string;
  label?: string;
  icon?: string;
  name?: string;
  type?: string;
  status?: string;
  ver?: string;
  author?: string;
  updated?: string;
  size?: string;
  esig?: boolean;
  children?: PvNode[];
}

export interface ProjMeetingQuestion {
  num: number;
  text: string;
  sponsorPos: string;
  agencyResp: string | null;
  agreed: boolean;
}

export interface ProjCommitment {
  type: string;
  desc: string;
  status: string;
  due: string;
  basis: string;
}

export interface ProjMeeting {
  id: string;
  interactionType: string;
  type: string;
  agency: string;
  date: string;
  status: string;
  attendees: string[];
  topic: string;
  outcome: string | null;
  briefingBook: string | null;
  documents: string[];
  questions: ProjMeetingQuestion[];
  commitments: ProjCommitment[];
}

export interface ProjPortfolioEntry {
  id: string;
  title: string;
  ws: string;
  code: string;
  stage: string;
  readiness: number;
  status: string;
  lead: string;
  blocker: string | null;
  due: string;
  activity: string;
}

export interface NpTeamMember {
  name: string;
  role: string;
}

export interface LifecycleStage {
  id: string;
  label: string;
  icon: string;
  blurb: string;
  /** What to do on this step, in one sentence a new client can act on. Static
   *  guidance about the step, never a claim about the program's state
   *  (docs/design/CLIENT_JOURNEY_2026-10-25.md, pass 2). */
  now: string;
  /** `now` for a device or diagnostic project, when it differs. */
  nowDevice?: string;
  /** Stage names that no longer have a tab and whose work is on this one.
   *  `project-home.set-stage` still accepts them (shared/navigation/
   *  surface-actions.ts), so an AnA call naming one opens this tab. */
  aliases?: readonly string[];
  /** What this step will hold once it works, in words, shown with no button
   *  (FILING_SPINE.md §2, §5): only this step's rows of
   *  .design/client-journey/INFORMATION_ARCHITECTURE.md (sections 3 and 5.4)
   *  that are placed but not yet shown. A feature that starts to work leaves
   *  this line in the same change as its door appears (IA section 11). */
  later?: string;
  /** `later` for a device or diagnostic project, when it differs: a drug
   *  line names an IND's documents and post-approval obligations, which a
   *  510(k), De Novo or PMA does not have. */
  laterDevice?: string;
}


/* ── PROJH ── */

/* ── Vault tree ── */

/* ── Meetings ── */

/* ── Lifecycle ── */

/* The project is the filing (docs/design/FILING_SPINE.md §1, §2): six steps
   in the order the work is done. Plan and Lifecycle were removed on
   2026-10-08 (slice F2) because neither held anything that could be opened.
   Plan returned on 2026-10-25 (CLIENT_JOURNEY_2026-10-25.md, pass 3) holding
   what the filing needs, who does it and by when (ProjectPlan.tsx). Lifecycle
   stays Submit's alias: follow-up sequences belong there. */
export const PJ_LIFECYCLE: LifecycleStage[] = [
  {
    id: 'plan', label: 'Plan', icon: 'clipboardList', blurb: 'What this filing needs, who does it, and by when',
    now: 'See every document this filing needs. Start each from its template, and assign it to a person with a due date.',
    nowDevice: 'See the work this filing needs, by discipline. Assign each piece to a person with a due date.',
    // Slice A.1. Not named because they work today: AnA's pathway and filing-order advice beside this step
    // (strategic-advisor, global-ri), the protocol workspace (Author's door), and the phase 2 meeting request
    // and briefing documents, which start from their templates here. Only recording the meeting is missing.
    later:
      'The chosen pathway and filing order across agencies, recorded on the project. For a US IND: the GLP studies ' +
      'and what Module 4 still needs; what each Investigator’s Brochure section still needs; each deliverable’s ' +
      'development work and evidence; the Pre-IND meeting recorded in Communication; and the documents an IND ' +
      'amendment, annual report or safety report needs, listed as the initial IND’s are.',
    laterDevice:
      'For a US filing, the Pre-Sub for FDA as one of this project’s workstreams; the chosen pathway and filing ' +
      'order across agencies, recorded on the project.',
  },
  {
    id: 'evidence', label: 'Evidence', icon: 'search', blurb: 'Project files and the data room the documents are written from',
    now: 'Add the documents this filing is written from: protocols, study reports, prior correspondence. Each file is read on upload and becomes a source you can trace.',
    // Slice A.1. Not named because they work today: AnA's literature search and its cited answers from the
    // project's files, and the device evidence features, opened from Plan's workstreams.
    later:
      'Research runs on a question in the literature and registries, listed here and filed to Vault; risk-based ' +
      'monitoring for this project’s study.',
    laterDevice:
      'The usability engineering file for this device; research runs on a question in the literature and ' +
      'registries, listed here and filed to Vault.',
  },
  {
    id: 'author', label: 'Author', icon: 'penLine', blurb: 'Draft eCTD sections with AnA, track changes',
    now: 'Draft the filing’s documents from those sources. Ask AnA to draft a section, or open a document and write it yourself.',
    nowDevice: 'Draft the filing’s documents from the device or diagnostic evidence. Ask AnA to draft a section, or open a document and write it yourself.',
    // Slice A.1: the editor's "For this document" (IA section 6, slice 6).
    later: 'Each document’s own tools, chosen by its type, beside it in the editor.',
  },
  {
    id: 'review', label: 'Review', icon: 'checkCircle', blurb: 'Review, approve & e-sign',
    now: 'Send each document for review, resolve the comments, and approve it with your signature.',
    // Slice A.1. AnA already checks documents against each other on request, and the editor's sources rail
    // already shows whether one document's cited source was replaced: what is to come is the standing list.
    later:
      'Where this project’s documents disagree with each other, kept as a list that updates when a governed ' +
      'value changes; citations to sources that have since been superseded, across the project’s documents.',
  },
  {
    id: 'submit', label: 'Submit', icon: 'rocket', blurb: "Build and validate each market's eCTD sequence",
    now: 'Place the approved documents in each market’s sequence, check its readiness, then compile the submission.',
    nowDevice: 'Assemble the eSTAR or technical documentation from the approved documents.',
    aliases: ['lifecycle'],
    // Rewritten in slice A.1 to today's truth. It named IND annual-report tracking (IND forms assembles, downloads
    // and files the annual report), the variation classifier and regulatory intelligence (AnA runs both), agency
    // meetings (folded into Communication), and market access, pharmacovigilance and precedent, which are not
    // Submit's. Not named because they work today: each market's application number, what was sent and whether
    // it was acknowledged (each sequence's Dispatch tab), and the next sequence after approval (Submission
    // Center's follow-up sequences).
    later:
      'Each approved market’s registration status and renewal date; renewals and post-approval obligations ' +
      'tracked as they fall due; safety reports with their reporting clock.',
    laterDevice:
      'Each market’s registration status and renewal date; renewals and post-market obligations tracked as they ' +
      'fall due.',
  },
  {
    id: 'respond', label: 'Respond', icon: 'messageCircle', blurb: 'Draft responses to agency letters',
    now: 'When the agency writes, add its letter here, draft each answer from it with AnA, and start the response sequence.',
    // Question-by-question tracking left this list on 2026-10-18: each inbox
    // letter now holds its questions and a signed response to each
    // (AgencyResponses.tsx). Agency meetings left it in slice A.1: they fold
    // into Communication, whose Meetings and recorded commitments work today.
    // One line for every project: a drug project has no Pre-Sub, so it is
    // named for a device filing.
    later:
      'Precedent responses, showing how the agency answered similar questions before; for a US device filing, ' +
      'FDA’s written feedback on its Pre-Sub.',
  },
];

/* PJ_STAGE_TOOLS (each stage's tool cards) was deleted 2026-10-15: its one
   entry, Respond's "Response authoring", opened the editor with no letter, and
   ProjectRespond.tsx (FILING_SPINE F15) replaces it. */

/* ── Portfolio ── */

/* ── Tone / label maps ── */

/* ── Helpers ── */

export function pjInitials(n: string): string {
  return (n || '').split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase();
}

export function fileTone(s: string): string {
  if (s === 'validated' || s === 'approved') return 'ok';
  if (s === 'extracted') return 'acc';
  if (s === 'review' || s === 'processing') return 'warn';
  if (s === 'draft' || s === 'uploaded') return 'idle';
  if (s === 'error') return 'err';
  return 'idle';
}

export function Ring({ value, size = 128, stroke = 11 }: { value: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - value / 100);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-200)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent-100)" strokeWidth={stroke}
        strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
        style={{ fontSize: 26, fontWeight: 600, fill: 'var(--text-100)', fontFamily: 'var(--font-sans)' }}>{value}%</text>
    </svg>
  );
}
