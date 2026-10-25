/**
 * The open project's submissions, and the dispatch verdict of each market's
 * latest sequence.
 *
 * ONE_ANA_ONE_CANVAS.md slice 24: the project page shows the project's
 * readiness and submissions, and the Submission Center reads the open project.
 * Every screen that asks "which submissions are this project's?" and "is its
 * sequence cleared to dispatch?" is answered here, once:
 *
 *   - `programSubmissionsPath` is the project-scoped list read
 *     (GET /api/submissions?programId=<uuid>, server/routes/submissions.ts). Its
 *     envelope's `meta.notOffered` is the server's count of the organization's
 *     submissions the scope left out; a reader states it or says nothing, and
 *     never works it out.
 *   - `useProgramMarkets` (FILING_SPINE.md F9) reads every market of the
 *     project: each submission in the scoped list, its latest sequence, and
 *     that sequence's verdict from
 *     GET /api/submissions/sequences/:seqId/dispatch-readiness. The project
 *     page, its header line and Submission Readiness (F18) all read it.
 *
 * Submission Readiness used to find ONE sequence of its own (the submission of
 * the program's application type in the organisation's unscoped list, here as
 * `useProgramSequence`), so a project filing an IND and an MAA had a verdict
 * for one of them on that screen. F18 deleted that walk: the scoped list is
 * the server's project scope, and no submission is matched to a project by
 * type or name on the client.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { liveGetOrNull, unwrapList, useLiveRows, type ListState } from '../dataConnect';
import { SC_APPTYPES } from '../fixtures/submission';
import { filingDocumentClassOf } from '@shared/regulatory/filing-document-classes';

/** GET /api/submissions scoped to one program (its uuid). */
export const programSubmissionsPath = (programId: string): string =>
  `/api/submissions?programId=${encodeURIComponent(programId)}`;

/** The scoped read's `meta.notOffered`, or null when the route did not send a
 *  number. Never computed on the client. */
export function notOfferedCount(meta: Record<string, unknown> | undefined): number | null {
  const n = meta?.notOffered;
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 ? n : null;
}

// Display tone and label for the submission status enum (not sample data).
export const SUB_STATUS_TONE: Record<string, string> = {
  planning: 'idle',
  active: 'ai',
  submitted: 'ok',
  archived: 'idle',
};
// The status cell printed the raw enum ("submitted") while every other chip on
// the surface carries a label; an unknown value stays visible as itself.
export const SUB_STATUS_LABEL: Record<string, string> = {
  planning: 'Planning', active: 'Active', submitted: 'Submitted', archived: 'Archived',
};

/* ── Display types — aligned to the server's dispatch-readiness assessment
   (server/services/ectd/assess-dispatch-readiness.ts). Only the columns the
   readers render are modeled; the server's composed `gate` is consumed as it
   is, never recomputed (see useSequenceDispatchReadiness). `sectionCode` is
   NULLABLE: sequence-level structural findings (EMPTY_SEQUENCE,
   SEQUENCE_NUMBER_FORMAT) carry no section, so the server returns null there —
   rendered honestly, never fabricated. ── */
/** A corpus rule as the server attaches it (validation-rule-corpus ruleView). */
export interface RuleView {
  id: string;
  title: string;
  category: string;
  regions: string[];
  severity: 'high' | 'medium' | 'low';
  source: string;
  enforcement: string;
  /** Enforced here / guaranteed by packager construction / requires the agency validator. */
  enforcementStatement: string;
}

export interface ReadinessFinding {
  severity: 'error' | 'warning' | 'info';
  code: string;
  sectionCode: string | null;
  message: string;
  /** The corpus rule this finding is an instance of; null when none names it. */
  rule?: RuleView | null;
}

/** One composed dispatch gate, as the server names it. */
export interface GateView {
  key: 'structural' | 'external' | 'shadowPresence' | 'releaseSignature';
  rule: RuleView | null;
  cleared: boolean;
  blockers: string[];
  /** The server's sentence when the gate cleared without assessing what it
   *  guards: an external assessment that did not qualify and is not required
   *  here, a US IND's clinical hold (P-33), a Shadow Review waived by
   *  signature (P-34). Not blocking, and not passed. */
  notAssessed?: string;
  assessmentStatus?: 'passed' | 'failed' | 'not_assessed' | 'invalid';
  assessmentNote?: string;
}

export interface ReadinessSummary {
  errors: number;
  warnings: number;
  infos: number;
  findings: ReadinessFinding[];
}

export interface ExternalValidation {
  configured: boolean;
  ran: boolean;
  errorCount: number;
  errorCountKnown?: boolean;
  cleared: boolean;
  blockers: string[];
  validatorKind?: 'external_engine' | 'internal_subset' | 'unavailable' | 'unknown';
  selectedValidatorName?: string | null;
  reportedValidatorName?: string | null;
  qualifyingRun?: boolean;
  assessmentStatus?: GateView['assessmentStatus'];
  assessmentNote?: string;
  enforced?: boolean;
}

/** The server's composed dispatch verdict. Authoritative — see `gate` below. */
export interface DispatchGate {
  cleared: boolean;
  blockers: string[];
}

export interface DispatchReadinessAssessment {
  sequenceId: number;
  /**
   * The composed hard gate, as the server decided it
   * (assess-dispatch-readiness.ts -> composeDispatchGatesForStep(..., 'dispatch')).
   * Optional on the wire so a response that predates it, or one that failed to
   * parse, is treated as UNANSWERED rather than silently recomputed.
   */
  gate?: DispatchGate;
  /** The dispatch verdict gate by gate — each the corpus rule it enforces, with
   *  its own blockers (assess-dispatch-readiness dispatchGateViews). */
  gates?: GateView[];
  region: string;
  sequenceStatus: string;
  validationErrors: number;
  unacknowledgedShadowCriticals: number;
  shadowReviewRunCount: number;
  shadowReviewMissing: boolean;
  externalValidation: ExternalValidation;
  readiness: ReadinessSummary;
  leafCount: number;
  /** For a stored Validated stage: whether it still holds (assess-dispatch-readiness
   *  validatedStageOf), and why not, in the server's words; shown beside the
   *  status (QA 2026-10-08, j7 finding 20). Null otherwise. */
  validatedStage?: { holds: boolean; reason?: string } | null;
  /** The server's verdict for each governed step (assess-dispatch-readiness
   *  composeStepVerdicts), read as it is, never recomputed. `freezeGate`: every
   *  gate but the release signature. `dispatchGateOnSigning`: dispatch once the
   *  dispatch e-signature, which records the release signature, is on record.
   *  Optional on the wire: a response without them is read as not cleared. */
  freezeGate?: DispatchGate;
  dispatchGateOnSigning?: DispatchGate;
  /** A dispatched sequence whose release no longer covers the current recorded
   *  facts must be signed again before any transmission. */
  dispatchAuthorization?: { reauthorizing: boolean; eligible: boolean; refusal: string | null };
}

/** The server says dispatch is clear except for the release signature the
 *  dispatch e-signature itself records (the Dispatch tab's awaitingOwnSignature).
 *  Read from the server's two verdicts; a missing field is false. */
export function awaitingOwnReleaseSignature(a: DispatchReadinessAssessment | null | undefined): boolean {
  return !!a && a.gate?.cleared === false && a.dispatchGateOnSigning?.cleared === true;
}

/* ── Which sequence the gate reads: the OPEN PROGRAM's ─────────────────────
   (VSR-001 F-8, 2026-09-21.) The readiness screen used to read
   GET /api/submissions and take `subs[0]` — the organisation's most recently
   updated submission, whichever program it belonged to. With two submissions
   it gated a sequence the user was not looking at, and told a program whose
   sequence existed that it had "no submission sequence to gate yet". For a
   transmit gate that is the wrong verdict on the wrong filing.

   The open program comes from `readShellProject` (the one reader of
   window.C2C_PROJECT; a deep link or the OQ harness may seed it with the id
   alone), so the program RECORD is read from GET /api/c2c/projects/:id and its
   submission is the one of the matching application type that is anchored to
   this program (`programId`, which GET /api/submissions returns). One anchored
   to ANOTHER program never is, whatever its name, and — P-20 follow-up,
   2026-10-08 — neither is one with no recorded project: no screen matches a
   program to an application by name. Such a submission is counted, never
   named, so the not-ready state can say it exists and how it is anchored (the
   Submission Center anchors a legacy submission, P-14).

   Every state that is not "this program's sequence" is its own state, never
   another program's gate and never an empty state standing in for an error:
   no program open, the program could not be read, no submission for it, no
   sequence on its submission, discovery failed. */

/** A program type or application type in words ("IND", "510(k)", "De Novo",
 *  "Prior Approval Supplement"): the application-type label when one matches,
 *  a filing document class's label when it is one (never its key, "pas"),
 *  otherwise the value as the server gave it ("CER"); null when there is none. */
/** A US IND: the filing the IND forms screen (21 CFR 312, FDA forms) serves.
 *  One rule for a submission (SubmissionCenter) and a project (ProjectHome). */
export function isUsInd(s: { applicationType?: string | null; primaryRegion?: string | null }): boolean {
  return String(s.applicationType ?? '').toLowerCase() === 'ind' && String(s.primaryRegion ?? '').toLowerCase() === 'fda';
}

export function programTypeLabel(t: string | null | undefined): string | null {
  const v = String(t ?? '').trim();
  if (!v) return null;
  return SC_APPTYPES.find((a) => a.v === v.toLowerCase())?.l ?? filingDocumentClassOf(v)?.label ?? v;
}

/** A submission's latest sequence, as GET /api/submissions/:id/sequences
 *  lists them (the last row), or null when it lists none. */
export interface LatestSequence {
  id: number;
  /** The eCTD sequence NUMBER ("0000"); null when the row has none. */
  sequenceNumber: string | null;
  /** The sequence's status as the server stored it ("assembling"); null when absent. */
  status: string | null;
}

const trimmedOrNull = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

/** The latest sequence in a sequence-list payload. One rule for the readiness
 *  screen's discovery and the project's markets. */
export function latestSequenceOf(payload: unknown): LatestSequence | null {
  const list = unwrapList(payload);
  const rows = Array.isArray(list) ? (list as Array<{ id?: unknown; sequenceNumber?: unknown; status?: unknown }>) : [];
  const latest = rows[rows.length - 1];
  if (!latest || typeof latest.id !== 'number' || !latest.id) return null;
  return { id: latest.id, sequenceNumber: trimmedOrNull(latest.sequenceNumber), status: trimmedOrNull(latest.status) };
}

const sequencesPath = (submissionId: number): string => `/api/submissions/${submissionId}/sequences`;
const dispatchReadinessPath = (seqId: number): string => `/api/submissions/sequences/${seqId}/dispatch-readiness`;

/** The server's composed verdict, or null when it stated none.
 *
 *  THE GATE IS THE SERVER'S, NOT OURS. The readiness screen used to RECOMPUTE
 *  the verdict from the server's raw inputs, merging a local copy of
 *  evaluateDispatchGate with the external-validation result: two gates, while
 *  the server composes four (assess-dispatch-readiness.ts: structural,
 *  external, shadowPresence, releaseSignature). A sequence no Shadow Review
 *  had read was then shown "cleared to dispatch" while the server answered
 *  `cleared: false`, and the local copy coerced "could not determine" to 0.
 *  A recomputed verdict cannot be kept in step with a gate set that grows, so
 *  the composed verdict is consumed as it is; when the server supplies none,
 *  the gate is UNANSWERED, which is not cleared. */
function serverGate(a: DispatchReadinessAssessment | null): DispatchGate | null {
  return a?.gate && typeof a.gate.cleared === 'boolean' ? { cleared: a.gate.cleared, blockers: a.gate.blockers ?? [] } : null;
}

/* ── The project's markets (FILING_SPINE.md F9, §6 row 12) ─────────────────
   One verdict per project read only the submission of the project's own
   application type (findProgramSubmission above), so a project filing an IND
   to FDA and an MAA to EMA had a verdict for one of them. A market is one
   submission: an application type to one agency. Each is read on its own:

     GET /api/submissions?programId=<uuid>            the project's markets
       → GET /api/submissions/:id/sequences            its latest sequence
         → GET /api/submissions/sequences/:seqId/dispatch-readiness   its verdict

   The list is the server's project scope, so no submission is matched to the
   project by name. Each market's reads succeed or fail alone: one failed
   verdict is that market's failure, never another's, and never "cleared".
   The verdict is the server's composed gate, consumed as it is (serverGate);
   nothing here recomputes it. */

/** A market: one submission in the project's scoped list (the columns read). */
export interface MarketSubmission {
  id: number;
  title: string;
  productName: string | null;
  applicationType: string;
  primaryRegion: string;
  status: string;
  lifecycleStage: string;
  programId?: string | null;
}

/** Where one market's reads stand. */
export type MarketRead =
  | { state: 'reading' }
  /** The sequence list could not be read: there is no verdict, and no claim
   *  about whether a sequence exists. */
  | { state: 'sequences-failed' }
  | { state: 'no-sequence' }
  /** The latest sequence is known; its verdict could not be read. */
  | { state: 'verdict-failed'; sequence: LatestSequence }
  /** The server answered. `gate` is null when it stated no verdict, which is
   *  unanswered, never cleared. */
  | { state: 'verdict'; sequence: LatestSequence; assessment: DispatchReadinessAssessment | null; gate: DispatchGate | null };

export interface ProgramMarket {
  submission: MarketSubmission;
  read: MarketRead;
}

export interface ProgramMarkets {
  /** The scoped list read: loading, failed, empty or rows. */
  list: ListState<MarketSubmission>;
  /** The server's count of the organization's submissions the scope left out. */
  notOffered: number | null;
  markets: ProgramMarket[];
  retryList: () => void;
  /** Read one market again; the others are not touched. */
  retryMarket: (submissionId: number) => void;
}

const READING: MarketRead = { state: 'reading' };

async function readMarket(submissionId: number): Promise<MarketRead> {
  const seqs = await liveGetOrNull<unknown>(sequencesPath(submissionId));
  // No body is not "no sequence": the same rule as findLatestSequence.
  if (seqs.error || seqs.data == null) return { state: 'sequences-failed' };
  const sequence = latestSequenceOf(seqs.data);
  if (!sequence) return { state: 'no-sequence' };
  const v = await liveGetOrNull<DispatchReadinessAssessment>(dispatchReadinessPath(sequence.id));
  if (v.error) return { state: 'verdict-failed', sequence };
  const assessment = v.data && typeof v.data === 'object' ? v.data : null;
  return { state: 'verdict', sequence, assessment, gate: serverGate(assessment) };
}

/** The open project's markets, each with its latest sequence and that
 *  sequence's own verdict. Read once and shared by every reader on the page
 *  (the Submit tab and the header line), so the two cannot disagree. */
export function useProgramMarkets(programId: string | null): ProgramMarkets {
  const [listBump, setListBump] = useState(0);
  const path = programId ? programSubmissionsPath(programId) : null;
  const list = useLiveRows<MarketSubmission>(path, [path, listBump]);
  const [reads, setReads] = useState<Record<number, MarketRead>>({});
  /* The latest read asked of each market; an older answer is dropped. */
  const asked = useRef<Record<number, number>>({});
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const read = useCallback((submissionId: number) => {
    const n = (asked.current[submissionId] ?? 0) + 1;
    asked.current[submissionId] = n;
    const put = (r: MarketRead) => {
      if (mounted.current && asked.current[submissionId] === n) setReads((m) => ({ ...m, [submissionId]: r }));
    };
    put(READING);
    readMarket(submissionId).then(put, () => put({ state: 'sequences-failed' }));
  }, []);

  const { rows, loading, error } = list;
  useEffect(() => {
    if (loading || error) return;
    for (const s of rows) {
      if (s && typeof s.id === 'number') read(s.id);
    }
  }, [rows, loading, error, read]);

  const markets = useMemo<ProgramMarket[]>(
    () => rows.filter((s) => s && typeof s.id === 'number').map((submission) => ({ submission, read: reads[submission.id] ?? READING })),
    [rows, reads],
  );
  const notOffered = !loading && !error ? notOfferedCount(list.meta) : null;
  const retryList = useCallback(() => setListBump((b) => b + 1), []);
  return { list, notOffered, markets, retryList, retryMarket: read };
}
