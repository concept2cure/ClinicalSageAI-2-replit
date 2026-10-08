/**
 * The open project's submissions, and the sequence its dispatch gate reads.
 *
 * ONE_ANA_ONE_CANVAS.md slice 24: the project page shows the project's
 * readiness and submissions, and the Submission Center reads the open project.
 * Three screens now ask the same two questions — "which submissions are this
 * project's?" and "is its sequence cleared to dispatch?" — and each is answered
 * here, once:
 *
 *   - `programSubmissionsPath` is the project-scoped list read
 *     (GET /api/submissions?programId=<uuid>, server/routes/submissions.ts). Its
 *     envelope's `meta.notOffered` is the server's count of the organization's
 *     submissions the scope left out; a reader states it or says nothing, and
 *     never works it out.
 *   - `useProgramSequence` finds the open program's latest sequence, and
 *     `useSequenceDispatchReadiness` reads that sequence's verdict from
 *     GET /api/submissions/sequences/:seqId/dispatch-readiness. Both moved here
 *     unchanged from DispatchReadiness.tsx so the readiness screen and the
 *     project page cannot drift apart.
 */
import { useEffect, useMemo, useState } from 'react';
import { redactInternals } from '@/lib/queryClient';
import { liveGetOrNull, unwrapList, useLiveData, type DataState } from '../dataConnect';
import { readShellProject } from '../shellProject';
import { SC_APPTYPES } from '../fixtures/submission';

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
  /** The server's sentence when the gate cleared only because its check did
   *  not run and is not required here. Not blocking, and not passed. */
  notAssessed?: string;
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
  cleared: boolean;
  blockers: string[];
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
   submission is chosen by the rule the server's resolveSubmissionSpine applies
   (server/services/cmc/submission-spine.ts, LX-22): of the matching application
   type, a submission anchored to this program (`programId`, which
   GET /api/submissions returns) is the program's, and one anchored to ANOTHER
   program never is, whatever its name. Only a submission with no recorded
   project is matched by name (the program's product_name / name / code against
   its product_name / title, case-insensitive), and the gate then says so. That
   fallback goes when no unanchored submission remains.

   Every state that is not "this program's sequence" is its own state, never
   another program's gate and never an empty state standing in for an error:
   no program open, the program could not be read, no submission for it, no
   sequence on its submission, discovery failed. */

interface ProgramRecord {
  id: string;
  name: string | null;
  code: string | null;
  product_name: string | null;
  program_type: string | null;
}

interface SubmissionRow {
  id: number;
  title: string | null;
  productName: string | null;
  applicationType: string | null;
  /** The project the submission belongs to; null or absent when none is recorded. */
  programId?: string | null;
}

const norm = (v: unknown): string => String(v ?? '').trim().toLowerCase();

/** A program type or application type in words ("IND", "510(k)", "De Novo"):
 *  the application-type label when one matches, otherwise the value as the
 *  server gave it ("CER"); null when there is none. */
export function programTypeLabel(t: string | null | undefined): string | null {
  const v = String(t ?? '').trim();
  if (!v) return null;
  return SC_APPTYPES.find((a) => a.v === v.toLowerCase())?.l ?? v;
}

/** A submission recorded to the program that the gate does not read, because
 *  its application type is not the program's. */
export interface OtherSubmission {
  title: string;
  applicationType: string | null;
}

const submissionTitleOf = (sub: SubmissionRow): string => sub.title || `submission ${sub.id}`;

/** Whether `sub` is this program's submission, and how that is known: by its
 *  recorded project, or — for a submission with none recorded — by name. */
function submissionBelongsToProgram(sub: SubmissionRow, program: ProgramRecord): 'program' | 'legacy-name' | null {
  const appType = norm(program.program_type);
  if (!appType || norm(sub.applicationType) !== appType) return null;
  if (sub.programId != null) return sub.programId === program.id ? 'program' : null;
  const programKeys = [program.product_name, program.name, program.code].map(norm).filter(Boolean);
  const subKeys = [sub.productName, sub.title].map(norm).filter(Boolean);
  return programKeys.some((k) => subKeys.includes(k)) ? 'legacy-name' : null;
}

export type Discovery =
  | { state: 'discovering' }
  | { state: 'no-program' }
  | { state: 'error'; detail: string }
  | {
      state: 'no-submission';
      programId: string;
      programLabel: string;
      /** The program's type (regulatory_programs.program_type): the gate reads
       *  only a submission of this application type. Null when none is recorded. */
      programType: string | null;
      /** Submissions recorded to this program whose application type is not
       *  its type. The project has these; the gate does not read them, so
       *  "no submission" is never said over them. */
      otherSubmissions: OtherSubmission[];
    }
  | {
      state: 'no-sequence';
      programId: string;
      programLabel: string;
      submissionId: number;
      submissionTitle: string;
      /** 'legacy-name' when the submission has no recorded project. */
      match: 'program' | 'legacy-name';
    }
  | {
      state: 'sequence';
      programId: string;
      programLabel: string;
      submissionId: number;
      submissionTitle: string;
      /** 'legacy-name' when the submission has no recorded project. */
      match: 'program' | 'legacy-name';
      seqId: number;
      /** The eCTD sequence NUMBER ("0000"), the identifier a filing is known by;
       *  the assessment carries only the row id. Null when the row has none. */
      sequenceNumber: string | null;
    };

/* Each discovery step answers either its data or the Discovery state that ends
   the walk. liveGetOrNull rather than liveGet throughout: none of these reads
   ever wanted a fixture, and a failed read is reported as a failure, never as
   "nothing". */
type Step<T> = { data: T } | { done: Discovery };

async function readProgram(programId: string): Promise<Step<ProgramRecord>> {
  const r = await liveGetOrNull<ProgramRecord>(`/api/c2c/projects/${encodeURIComponent(programId)}`);
  if (r.error || r.data == null || typeof r.data !== 'object') {
    return { done: { state: 'error', detail: r.error ?? 'The open program could not be read.' } };
  }
  return { data: r.data };
}

async function findProgramSubmission(program: ProgramRecord, programId: string, programLabel: string): Promise<Step<{ sub: SubmissionRow; match: 'program' | 'legacy-name' }>> {
  const r = await liveGetOrNull<unknown>('/api/submissions');
  if (r.error || r.data == null) {
    return { done: { state: 'error', detail: r.error ?? 'The submissions could not be read.' } };
  }
  const list = unwrapList(r.data);
  const rows = (Array.isArray(list) ? (list as SubmissionRow[]) : []).filter((row) => row && typeof row.id === 'number');
  // Anchored first, whatever the list order; a name match only when none is.
  const sub = rows.find((r) => submissionBelongsToProgram(r, program) === 'program') ?? rows.find((r) => submissionBelongsToProgram(r, program) === 'legacy-name');
  if (sub) return { data: { sub, match: submissionBelongsToProgram(sub, program) ?? 'legacy-name' } };
  /* None of the program's type. The submissions recorded to it, if any, are of
     other types (an EU MAA beside an IND, any submission of a CER program):
     they are named, so a reader never says the project has none. */
  const programType = String(program.program_type ?? '').trim() || null;
  const otherSubmissions = rows
    .filter((r) => r.programId != null && r.programId === program.id)
    .map((r) => ({ title: submissionTitleOf(r), applicationType: r.applicationType ?? null }));
  return { done: { state: 'no-submission', programId, programLabel, programType, otherSubmissions } };
}

async function findLatestSequence(sub: SubmissionRow, match: 'program' | 'legacy-name', programId: string, programLabel: string): Promise<Discovery> {
  const r = await liveGetOrNull<unknown>(`/api/submissions/${sub.id}/sequences`);
  if (r.error || r.data == null) {
    return { state: 'error', detail: r.error ?? 'The sequences could not be read.' };
  }
  const list = unwrapList(r.data);
  const rows = Array.isArray(list) ? (list as Array<{ id?: number; sequenceNumber?: unknown }>) : [];
  const latest = rows[rows.length - 1];
  const submissionTitle = submissionTitleOf(sub);
  if (!latest?.id) {
    return { state: 'no-sequence', programId, programLabel, submissionId: sub.id, submissionTitle, match };
  }
  const sequenceNumber =
    typeof latest.sequenceNumber === 'string' && latest.sequenceNumber.trim() !== '' ? latest.sequenceNumber.trim() : null;
  return { state: 'sequence', programId, programLabel, submissionId: sub.id, submissionTitle, match, seqId: latest.id, sequenceNumber };
}

export async function discoverProgramSequence(programId: string, shellTitle: string | undefined): Promise<Discovery> {
  const prog = await readProgram(programId);
  if ('done' in prog) return prog.done;
  const program = prog.data;
  const programLabel = program.name || program.code || shellTitle || programId;
  const found = await findProgramSubmission(program, programId, programLabel);
  if ('done' in found) return found.done;
  return findLatestSequence(found.data.sub, found.data.match, programId, programLabel);
}

/** The open program's latest sequence. `reloadKey` re-runs the walk: a reader
 *  that offers "Try again" after a failed read bumps it. */
export function useProgramSequence(reloadKey = 0): Discovery {
  const shell = readShellProject();
  const programId = shell ? String(shell.id) : null;
  const shellTitle = shell?.title;
  const [d, setD] = useState<Discovery>(programId ? { state: 'discovering' } : { state: 'no-program' });
  useEffect(() => {
    if (!programId) {
      setD({ state: 'no-program' });
      return undefined;
    }
    let cancelled = false;
    setD({ state: 'discovering' });
    discoverProgramSequence(programId, shellTitle)
      .then((next) => {
        if (!cancelled) setD(next);
      })
      .catch((e: unknown) => {
        if (!cancelled) setD({ state: 'error', detail: redactInternals(e instanceof Error ? e.message : '', 'the read failed') });
      });
    return () => {
      cancelled = true;
    };
    // The shell program is read on every render; the effect keys on its id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programId, reloadKey]);
  return d;
}

/** The submissions recorded to a program that its gate does not read, in
 *  words: 'MAA "ONC-221 EU MAA"', joined. Empty when there are none. */
export function otherSubmissionsLine(others: OtherSubmission[]): string {
  return others
    .map((o) => [programTypeLabel(o.applicationType), `"${o.title}"`].filter(Boolean).join(' '))
    .join(', ');
}

/** The gate's not-ready state when the program has no submission of its type,
 *  in words, about `subject` ("this project", "OQ-005"). Never "no
 *  submission" over submissions the program has. */
export function noSubmissionWords(
  d: Extract<Discovery, { state: 'no-submission' }>,
  subject: string,
): { title: string; hint: string } {
  const type = programTypeLabel(d.programType);
  const others = otherSubmissionsLine(d.otherSubmissions);
  if (!type) {
    return {
      title: `No submission is gated for ${subject}`,
      hint:
        `No program type is recorded for ${subject}, so the dispatch gate cannot tell which submission to read.` +
        (others ? ` Its submissions: ${others}.` : ''),
    };
  }
  if (others) {
    return {
      title: `No ${type} submission for ${subject} yet`,
      hint: `The dispatch gate reads only ${subject}'s ${type} submission. Its submissions of other types are not gated here: ${others}.`,
    };
  }
  // Nothing is recorded to the program at all: "no submission" is then true.
  return {
    title: `No submission for ${subject} yet`,
    hint: `The dispatch gate reads ${subject}'s ${type} submission, and none is recorded, so there is no sequence to gate yet.`,
  };
}

/* What the gate's state is when there is no verdict to give — one value per
   not-ready state, each about the open program. */
export type GateState = 'evaluating' | 'error' | 'no-program' | 'no-submission' | 'no-sequence' | 'evaluated';

function notReadyState(discovery: Discovery): Exclude<GateState, 'evaluating' | 'evaluated'> | null {
  switch (discovery.state) {
    case 'error':
      return 'error';
    case 'no-program':
      return 'no-program';
    case 'no-submission':
      return 'no-submission';
    case 'no-sequence':
      return 'no-sequence';
    default:
      return null;
  }
}

export interface SequenceDispatchReadiness {
  /** The sequence row id being gated, or null when discovery found none. */
  seqId: number | null;
  live: DataState<DispatchReadinessAssessment>;
  assessment: DispatchReadinessAssessment | null;
  /** The server's composed verdict; {cleared:false, blockers:[]} when it gave none. */
  gate: DispatchGate;
  /** Whether the server stated a verdict at all. False is UNANSWERED, never cleared. */
  answered: boolean;
  loading: boolean;
  gateState: GateState;
}

/** The server's composed verdict, or null when it stated none. */
function serverGate(a: DispatchReadinessAssessment | null): DispatchGate | null {
  return a?.gate && typeof a.gate.cleared === 'boolean' ? { cleared: a.gate.cleared, blockers: a.gate.blockers ?? [] } : null;
}

/** A read in flight, or one asked for whose first fetch has not started yet. */
function readPending(live: DataState<unknown>): boolean {
  return live.loading || (!live.error && !live.empty && live.data == null);
}

/** The dispatch-readiness verdict for the sequence `discovery` found. A re-run
 *  of the discovery (its `reloadKey`) passes through 'discovering', which has no
 *  sequence, so the verdict is read again when the sequence is found again. */
export function useSequenceDispatchReadiness(discovery: Discovery): SequenceDispatchReadiness {
  const seqId = discovery.state === 'sequence' ? discovery.seqId : null;
  const live = useLiveData<DispatchReadinessAssessment>(
    seqId === null ? null : `/api/submissions/sequences/${seqId}/dispatch-readiness`,
    [seqId],
  );
  const a = live.data;

  /* THE GATE IS THE SERVER'S, NOT OURS.
     The readiness screen used to RECOMPUTE the verdict from the server's raw
     inputs, by merging a local copy of evaluateDispatchGate with the
     external-validation result. Two gates — and the server composes FOUR
     (assess-dispatch-readiness.ts: structural, external, shadowPresence,
     releaseSignature). So a sequence with zero validation errors, no external
     validator configured, and ZERO completed Shadow Review runs had the server
     answering `cleared: false` (shadowPresence blocks: never-reviewed is
     unassessed, not clean) while the screen rendered "cleared to dispatch"
     and published `facts.cleared: true` to AnA. The same applied to a missing
     §11.70 release signature.

     The local copy had also drifted: it did `Number.isFinite(x) ? x : 0`, the
     exact coercion the server deliberately INVERTED because it made "could not
     determine" indistinguishable from "none".

     A recomputed verdict cannot be kept in step with a gate set that grows, and
     duplicating it is what let these diverge. Consume the composed verdict; when
     the server did not supply one, the gate is UNANSWERED, which is not
     cleared. */
  const answered = serverGate(a) !== null;
  const gate = useMemo<DispatchGate>(() => serverGate(a) ?? { cleared: false, blockers: [] as string[] }, [a]);

  /* Between discovery naming a sequence and its read starting, the read is
     neither loading nor answered; that is still evaluating, not "no sequence". */
  const loading = discovery.state === 'discovering' || (seqId !== null && readPending(live));
  const gateState: GateState = loading
    ? 'evaluating'
    : live.error
      ? 'error'
      : notReadyState(discovery) ?? (seqId === null || !a ? 'no-sequence' : 'evaluated');
  return { seqId, live, assessment: a, gate, answered, loading, gateState };
}
