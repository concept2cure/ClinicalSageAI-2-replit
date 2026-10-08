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
  /** Stage names that no longer have a tab and whose work is on this one.
   *  `project-home.set-stage` still accepts them (shared/navigation/
   *  surface-actions.ts), so an AnA call naming one opens this tab. */
  aliases?: readonly string[];
  /** What this tab does not do in this release, in words, shown with no
   *  button (FILING_SPINE.md §2 "Submit" and "Respond", §5). */
  later?: string;
  /** `later` for a device or diagnostic project, when it differs: the drug
   *  line names IND annual reports and the EU variation classifier, which a
   *  510(k), De Novo or PMA does not have. */
  laterDevice?: string;
}

export interface StageTool {
  id: string;
  label: string;
  desc: string;
  icon: string;
}

/* ── PROJH ── */

/* ── Vault tree ── */

/* ── Meetings ── */

/* ── Lifecycle ── */

/* The project is the filing (docs/design/FILING_SPINE.md §1, §2): five tabs
   in the order the work is done. Plan and Lifecycle were removed on
   2026-10-08 (slice F2): neither held anything that could be opened in this
   release, and both showed "Not in this release" with no button. Their names
   are Submit's aliases, since market choice and follow-up sequences belong
   there, and what they promised is named on Submit's coming-later line. */
export const PJ_LIFECYCLE: LifecycleStage[] = [
  { id: 'evidence', label: 'Evidence', icon: 'search', blurb: 'Project files and the data room the documents are written from' },
  { id: 'author', label: 'Author', icon: 'penLine', blurb: 'Draft eCTD sections with AnA, track changes' },
  { id: 'review', label: 'Review', icon: 'checkCircle', blurb: 'Review, approve & e-sign' },
  {
    id: 'submit', label: 'Submit', icon: 'rocket', blurb: 'Assemble eCTD, validate & transmit',
    aliases: ['plan', 'lifecycle'],
    later:
      'Registrations, market access and pharmacovigilance; the variation classifier; IND annual-report tracking; ' +
      'regulatory intelligence, precedent and agency meetings.',
    laterDevice:
      'Registrations, market access and post-market vigilance; regulatory intelligence, precedent and agency meetings.',
  },
  {
    id: 'respond', label: 'Respond', icon: 'messageCircle', blurb: 'Health-authority questions & responses',
    later: 'Question-by-question tracking of agency letters, agency meetings and precedent responses.',
  },
];

/* A tool a stage offers is a door that opens. Tools outside this release are
   not listed here as cards; they are named on the stage's coming-later line. */
export const PJ_STAGE_TOOLS: Record<string, StageTool[]> = {
  respond: [
    { id: 'document-authoring', label: 'Response authoring', desc: 'Draft governed responses with AnA', icon: 'penLine' },
  ],
};

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
