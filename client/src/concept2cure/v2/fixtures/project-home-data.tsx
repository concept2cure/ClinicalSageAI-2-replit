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

export const PJ_LIFECYCLE: LifecycleStage[] = [
  { id: 'plan', label: 'Plan', icon: 'calendar', blurb: 'Strategy, precedent, agency meetings & timeline' },
  { id: 'evidence', label: 'Evidence', icon: 'search', blurb: 'Vault, RAG search & claim↔evidence linking' },
  { id: 'author', label: 'Author', icon: 'penLine', blurb: 'Draft eCTD sections with AnA, track changes' },
  { id: 'review', label: 'Review', icon: 'checkCircle', blurb: 'Review, approve & e-sign' },
  { id: 'submit', label: 'Submit', icon: 'rocket', blurb: 'Assemble eCTD, validate & transmit' },
  { id: 'respond', label: 'Respond', icon: 'messageCircle', blurb: 'Health-authority questions & responses' },
  { id: 'lifecycle', label: 'Lifecycle', icon: 'globe', blurb: 'Registrations, variations, market access & PV' },
];


export const PJ_STAGE_TOOLS: Record<string, StageTool[]> = {
  plan: [
    { id: 'global-ri', label: 'Regulatory intelligence', desc: 'Pathways, precedent & global landscape', icon: 'globe' },
    { id: 'precedent-intelligence', label: 'Precedent intelligence', desc: 'Approved analogues in this therapeutic area', icon: 'scale' },
    { id: 'agency-meetings', label: 'Agency meetings', desc: 'Briefing books, questions & minutes', icon: 'calendar' },
  ],
  respond: [
    { id: 'haq-manager', label: 'HA questions', desc: 'Track & respond to deficiency letters', icon: 'messageCircle' },
    { id: 'global-ri', label: 'Precedent responses', desc: 'How analogues answered similar questions', icon: 'globe' },
    { id: 'document-authoring', label: 'Response authoring', desc: 'Draft governed responses with AnA', icon: 'penLine' },
  ],
  lifecycle: [
    { id: 'registrations', label: 'Registrations', desc: 'Market registrations & variations', icon: 'globe' },
    { id: 'market-access', label: 'Market access', desc: 'Pricing, reimbursement & HTA', icon: 'barChart' },
    { id: 'safety-narrative', label: 'Pharmacovigilance', desc: 'Safety narratives & signal detection', icon: 'shieldCheck' },
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
