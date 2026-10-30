/**
 * Workbench shapes — Submission Center.
 *
 * This module is types and fixed taxonomy now; the row sets it was ported
 * from data-workbench.jsx with are gone. See the note at the foot of the file
 * for what each one was and why it went.
 */

export type Tone = 'ok' | 'warn' | 'err' | 'default' | 'active' | 'review' | 'blocked' | 'complete';

/* No task shapes. The task panel folded into Tasks (D2, 2026-10-29;
   docs/evidence/D2-ONE-ANA/2026-10-29/fold-device-tasks/), and its Task,
   TaskMetric and column types went with it. */



/* No validation shapes. The organization-wide blocker list (device-validation)
   retired (D2, fold F5 item 2, 2026-10-29; decision P-61 item 2): a blocker
   belongs to a filing, from that filing's deterministic readiness
   (EstarFilingPanel). Its ValidationSummary, ValidationProgram and
   ValidationRule types went with it, the last with its "ok" severity, which
   drew an open low-severity blocker as "Pass". */




// ── Submission Center ────────────────────────────────────────────────────

export interface SubmissionStage { id: string; label: string; desc: string }
export interface SubmissionLogEntry { when: string; who: string; what: string }
/** The assembled bundle the server records on a package (`metadata.bundle`,
 *  written by POST /packages/:id/assemble). */
export interface SubmissionBundle { sha256: string; size: string; assembledAt: string | null }
export interface Submission {
  id: string;
  prog: string;
  pathway: string;
  /** The stage the record names (`metadata.stage`), or null. Slice 0: it was
   *  inferred from the status, so every open package sat at "Package" and
   *  every completed one at "Decision", and nothing recorded either. */
  stage: string | null;
  /** The package's own status. Slice 0: `locked` (set when the package is
   *  published) read "active", and `cancelled` read "blocked". */
  status: 'active' | 'blocked' | 'complete' | 'locked' | 'cancelled';
  title: string;
  /* Slice 0 (map row `device-submission`): no `target` and no `esig`. A
     package record names no receiving authority, and its `metadata.esig` is a
     free-form flag, not a signature record; the adapter derived "NB · TÜV" /
     "FDA · ESG" and "Signed" from them. Off the type, so no consumer can
     render them again. Nor `cover`, `files` or `bytes`: nothing writes
     `metadata.cover`, `fileCount` or `bytes` on a package, so every package
     read "Cover letter: draft" and "No files recorded". The bundle the server
     does record stands in for the last two. */
  bundle: SubmissionBundle | null;
  transmitAt: string | null;
  targetAt: string;
  tone: Tone;
  /** The readiness read's gate (useSubmissionDetail), or null: never assumed
   *  to be 0 / 0 / 0. The list read carries none (see useSubmissions). */
  gate: { errs: number; warns: number; ok: number } | null;
  log: SubmissionLogEntry[];
}

export const SUBMISSION_PIPELINE: SubmissionStage[] = [
  { id: 'package',   label: 'Package',         desc: 'eSTAR export · attachments' },
  { id: 'validate',  label: 'Validate',        desc: 'Required-field · claims' },
  { id: 'sign',      label: 'Cover + sign',    desc: 'Cover letter · e-signature' },
  /* Slice 0: was 'FDA ESG · notified body'. The record names no authority
     and no notified-body transmitter exists; sending is Gateway transmittals'. */
  { id: 'transmit',  label: 'Transmit',        desc: 'Gateway transmittal' },
  { id: 'ack',       label: 'Acknowledgement', desc: 'Receipt · review clock' },
  { id: 'review',    label: 'Review',          desc: 'Substantive · deficiency' },
  /* Slice 0: was 'Cleared · approved', while every completed package was
     counted here with no decision recorded. */
  { id: 'decision',  label: 'Decision',        desc: 'Agency decision' },
];


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
 * `SUBMISSION_PIPELINE` remains: the stages of a regulatory submission are real
 * structure, not an assessment. `TASKS_COLUMNS` went with the task panel's fold
 * into Tasks (D2, 2026-10-29).
 */
