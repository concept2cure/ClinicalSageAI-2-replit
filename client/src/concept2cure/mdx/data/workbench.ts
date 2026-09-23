/**
 * Workbench shapes — Tasks, Validation Center, Submission Center, Templates.
 *
 * This module is types and fixed taxonomy now; the row sets it was ported
 * from data-workbench.jsx with are gone. See the note at the foot of the file
 * for what each one was and why it went.
 */

export type TaskCol = 'todo' | 'doing' | 'review' | 'blocked' | 'done';
export type Tone = 'ok' | 'warn' | 'err' | 'default' | 'active' | 'review' | 'blocked' | 'complete';

export interface TaskColumn {
  id: TaskCol;
  label: string;
  tone: Tone;
}

export interface Task {
  id: string;
  col: TaskCol;
  prog: string;
  sect: string;
  title: string;
  assignee: string;
  due: string;
  tone: Tone;
  label: string;
  kind: 'edit' | 'review' | 'sign';
  esig: boolean;
  comments: number;
}

export interface TaskMetric {
  label: string;
  metric: string;
  unit?: string;
  meta: string;
  tone?: Tone;
}

export const TASKS_COLUMNS: TaskColumn[] = [
  { id: 'todo',     label: 'To do',       tone: 'default' },
  { id: 'doing',    label: 'In progress', tone: 'active' },
  { id: 'review',   label: 'In review',   tone: 'review' },
  { id: 'blocked',  label: 'Blocked',     tone: 'blocked' },
  { id: 'done',     label: 'Done',        tone: 'complete' },
];



// ── Validation Center ────────────────────────────────────────────────────

export interface ValidationSummary { label: string; metric: string; unit?: string; meta: string; tone?: Tone }
export interface ValidationProgram { id: string; code: string; title: string; pathway: string; errs: number; warns: number; ok: number; status: 'blocked' | 'active' | 'complete'; readiness: number }
export interface ValidationRule { id: string; prog: string; sect: string; severity: 'err' | 'warn' | 'ok'; category: string; msg: string; since: string }




// ── Submission Center ────────────────────────────────────────────────────

export interface SubmissionStage { id: string; label: string; desc: string }
export interface SubmissionLogEntry { when: string; who: string; what: string }
export interface Submission {
  id: string;
  prog: string;
  pathway: string;
  stage: string;
  status: 'active' | 'blocked' | 'complete';
  title: string;
  target: string;
  bytes: string;
  files: number;
  cover: 'signed' | 'draft';
  esig: boolean;
  transmitAt: string | null;
  targetAt: string;
  tone: Tone;
  gate: { errs: number; warns: number; ok: number };
  log: SubmissionLogEntry[];
}

export const SUBMISSION_PIPELINE: SubmissionStage[] = [
  { id: 'package',   label: 'Package',         desc: 'eSTAR export · attachments' },
  { id: 'validate',  label: 'Validate',        desc: 'Required-field · claims' },
  { id: 'sign',      label: 'Cover + sign',    desc: 'Cover letter · e-signature' },
  { id: 'transmit',  label: 'Transmit',        desc: 'FDA ESG · notified body' },
  { id: 'ack',       label: 'Acknowledgement', desc: 'Receipt · review clock' },
  { id: 'review',    label: 'Review',          desc: 'Substantive · deficiency' },
  { id: 'decision',  label: 'Decision',        desc: 'Cleared · approved' },
];


// ── Templates ────────────────────────────────────────────────────────────

export interface Template {
  id: string;
  name: string;
  uses: number;
  owner: string;
  updated: string;
  tags: string[];
}

/*
 * The seven row sets that used to live here — TASKS, TASKS_METRICS,
 * VALIDATION_SUMMARY, VALIDATION_PROGRAMS, VALIDATION_RULES, SUBMISSIONS and
 * TEMPLATES — are removed. The interfaces above stay: they are the shapes the
 * live endpoints return, and Workbench.tsx reads them.
 *
 * `SUBMISSIONS` was the one that had to go regardless of gating. Its rows
 * carried `cover: 'signed'`, `esig: true`, a log line reading "Cover letter
 * e-signed (AUD-9104)" — an invented Part 11 signature id — and a
 * "CLEARED · K254481" decision, and they drove the transmission gate.
 *
 * The other six were reachable only under sample mode, which is the right
 * treatment for example content — but Workbench rendered a sample banner on
 * the submissions panel alone, so tasks, validation findings and templates
 * appeared unmarked, as though they were the tenant's own work. Each of the
 * four panels has a live endpoint, so the honest reading before it answers is
 * nothing at all.
 *
 * `TASKS_COLUMNS` and `SUBMISSION_PIPELINE` remain: a Kanban's columns and the
 * stages of a regulatory submission are real structure, not an assessment.
 */
