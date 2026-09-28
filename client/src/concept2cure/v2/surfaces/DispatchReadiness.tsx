import React, { useEffect, useMemo, useState } from 'react';
import { redactInternals } from '@/lib/queryClient';
import { I } from '../icons';
import { PedigreeBadge } from '../intelligence/Intelligence';
import { liveGetOrNull, unwrapList, useLiveData, EmptyState } from '../dataConnect';
import { readShellProject } from '../shellProject';
import { usePublishSurfaceContext } from '../surfaceContext';
import type { SurfaceViewProps } from '../surfaceViews';
import '../styles/project-home-v2.css';

/* ── Display types — aligned to the server's dispatch-readiness assessment
   (server/services/ectd/assess-dispatch-readiness.ts). Only the columns this
   surface renders are modeled; the server's redundant `gate` field is
   recomputed client-side below. `sectionCode` is NULLABLE: sequence-level
   structural findings (EMPTY_SEQUENCE, SEQUENCE_NUMBER_FORMAT) carry no
   section, so the server returns null there — rendered honestly, never
   fabricated. ── */
/** A corpus rule as the server attaches it (validation-rule-corpus ruleView). */
interface RuleView {
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

interface ReadinessFinding {
  severity: 'error' | 'warning' | 'info';
  code: string;
  sectionCode: string | null;
  message: string;
  /** The corpus rule this finding is an instance of; null when none names it. */
  rule?: RuleView | null;
}

/** One composed dispatch gate, as the server names it. */
interface GateView {
  key: 'structural' | 'external' | 'shadowPresence' | 'releaseSignature';
  rule: RuleView | null;
  cleared: boolean;
  blockers: string[];
}

interface ReadinessSummary {
  errors: number;
  warnings: number;
  infos: number;
  findings: ReadinessFinding[];
}

interface ExternalValidation {
  configured: boolean;
  ran: boolean;
  errorCount: number;
  cleared: boolean;
  blockers: string[];
}

/** The server's composed dispatch verdict. Authoritative — see `gate` below. */
interface DispatchGate {
  cleared: boolean;
  blockers: string[];
}

interface DispatchReadinessAssessment {
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

/* ── Which sequence this surface gates: the OPEN PROGRAM's ─────────────────
   (VSR-001 F-8, 2026-09-21.) This used to read GET /api/submissions and take
   `subs[0]` — the organisation's most recently updated submission, whichever
   program it belonged to. With two submissions it gated a sequence the user
   was not looking at, and told a program whose sequence existed that it had
   "no submission sequence to gate yet". For a transmit gate that is the wrong
   verdict on the wrong filing.

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

type Discovery =
  | { state: 'discovering' }
  | { state: 'no-program' }
  | { state: 'error'; detail: string }
  | { state: 'no-submission'; programId: string; programLabel: string }
  | { state: 'no-sequence'; programId: string; programLabel: string; submissionId: number; submissionTitle: string }
  | {
      state: 'sequence';
      programId: string;
      programLabel: string;
      submissionId: number;
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
  return sub ? { data: { sub, match: submissionBelongsToProgram(sub, program) ?? 'legacy-name' } } : { done: { state: 'no-submission', programId, programLabel } };
}

async function findLatestSequence(sub: SubmissionRow, match: 'program' | 'legacy-name', programId: string, programLabel: string): Promise<Discovery> {
  const r = await liveGetOrNull<unknown>(`/api/submissions/${sub.id}/sequences`);
  if (r.error || r.data == null) {
    return { state: 'error', detail: r.error ?? 'The sequences could not be read.' };
  }
  const list = unwrapList(r.data);
  const rows = Array.isArray(list) ? (list as Array<{ id?: number; sequenceNumber?: unknown }>) : [];
  const latest = rows[rows.length - 1];
  if (!latest?.id) {
    return { state: 'no-sequence', programId, programLabel, submissionId: sub.id, submissionTitle: sub.title || `submission ${sub.id}` };
  }
  const sequenceNumber =
    typeof latest.sequenceNumber === 'string' && latest.sequenceNumber.trim() !== '' ? latest.sequenceNumber.trim() : null;
  return { state: 'sequence', programId, programLabel, submissionId: sub.id, match, seqId: latest.id, sequenceNumber };
}

async function discoverProgramSequence(programId: string, shellTitle: string | undefined): Promise<Discovery> {
  const prog = await readProgram(programId);
  if ('done' in prog) return prog.done;
  const program = prog.data;
  const programLabel = program.name || program.code || shellTitle || programId;
  const found = await findProgramSubmission(program, programId, programLabel);
  if ('done' in found) return found.done;
  return findLatestSequence(found.data.sub, found.data.match, programId, programLabel);
}

function useProgramSequence(): Discovery {
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
  }, [programId]);
  return d;
}

/* What AnA is told when there is no verdict to give — one line per not-ready
   state, each naming the program it is about. */
type GateState = 'evaluating' | 'error' | 'no-program' | 'no-submission' | 'no-sequence' | 'evaluated';

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

function notReadySummary(state: GateState, programLabel: string | null): string {
  const p = programLabel ?? 'the open program';
  switch (state) {
    case 'evaluating':
      return 'Dispatch readiness, still evaluating the gate.';
    case 'error':
      return 'Dispatch readiness could not be evaluated — the gate is unanswered, which is not the same as cleared.';
    case 'no-program':
      return 'Dispatch readiness: no program is open, so no sequence is being gated.';
    case 'no-submission':
      return `Dispatch readiness: the open program (${p}) has no submission recorded, so there is no sequence to gate.`;
    default:
      return `Dispatch readiness: the open program (${p}) has no eCTD sequence yet, so there is nothing to clear.`;
  }
}

/* ── severity → tone map ── */
const SEV_TONE: Record<string, string> = { error: 'error', warning: 'warning', info: 'idle' };

/* ════ Dispatch Readiness — deterministic last gate before agency transmit ════
   Answer-first; not a dashboard. Consumes Shadow Review criticals + structural
   validation + external (eValidator) findings, composed.
   Pedigree: deterministic_registry (the gate is proven, not generated).
   full: true — owns the canvas. */

/** A finding's rule: its title and id, regions, corpus severity and where it is enforced. */
function RuleLine({ rule, code }: { rule: RuleView | null; code: string }) {
  if (!rule) {
    return (
      <span style={{ display: 'block', fontSize: 12 }}>
        <span className="mono">{code}</span> — not in the rule corpus, so no rule stands behind this finding.
      </span>
    );
  }
  return (
    <span style={{ display: 'block', fontSize: 12 }}>
      <b>{rule.title}</b> <span className="mono">{rule.id}</span> · {rule.regions.map((r) => r.toUpperCase()).join(' · ')} ·{' '}
      {rule.severity} · {rule.enforcementStatement}
    </span>
  );
}

/** One composed gate: the rule it enforces, its outcome in words, its own blockers. */
function GateCard({ gate }: { gate: GateView }) {
  return (
    <div data-gate={gate.key} className={'dr2-gate ' + (gate.cleared ? 'ok' : 'block')}>
      <div className="dr2-gate-top">
        <span className="dr2-gate-dot">{gate.cleared ? I.check : I.lock}</span>
        <span className="dr2-gate-label">{gate.rule?.title ?? `The ${gate.key} gate — not in the rule corpus`}</span>
      </div>
      <div className="dr2-gate-detail">
        {gate.cleared ? 'Satisfied.' : 'Blocks dispatch:'}
        {!gate.cleared && (
          <ul style={{ margin: '2px 0 0', paddingLeft: 16 }}>
            {gate.blockers.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        )}
      </div>
      {gate.rule && (
        <div className="dr2-gate-basis">
          <span className="mono">{gate.rule.id}</span> · {gate.rule.enforcementStatement}
        </div>
      )}
    </div>
  );
}

export function DispatchReadiness({ onAsk }: SurfaceViewProps) {
  const ask = onAsk;
  // Real deterministic gate for the OPEN PROGRAM's latest sequence, computed
  // server-side by assessSequenceDispatchReadiness. Fixture-free: real
  // assessment, honest empty (no program / no submission / no sequence), or
  // honest error — never a sample assessment, never another program's.
  const discovery = useProgramSequence();
  const seqId = discovery.state === 'sequence' ? discovery.seqId : null;
  const sequenceNumber = discovery.state === 'sequence' ? discovery.sequenceNumber : null;
  const discovering = discovery.state === 'discovering';
  const programLabel = 'programLabel' in discovery ? discovery.programLabel : null;
  const live = useLiveData<DispatchReadinessAssessment>(
    seqId === null ? null : `/api/submissions/sequences/${seqId}/dispatch-readiness`,
    [seqId],
  );
  const a = live.data;

  /* THE GATE IS THE SERVER'S, NOT OURS.
     This used to RECOMPUTE the verdict here from the server's raw inputs, by
     merging a local copy of evaluateDispatchGate with the external-validation
     result. Two gates — and the server composes FOUR
     (assess-dispatch-readiness.ts: structural, external, shadowPresence,
     releaseSignature). So a sequence with zero validation errors, no external
     validator configured, and ZERO completed Shadow Review runs had the server
     answering `cleared: false` (shadowPresence blocks: never-reviewed is
     unassessed, not clean) while this surface rendered "cleared to dispatch"
     and published `facts.cleared: true` to AnA. The same applied to a missing
     §11.70 release signature.

     The local copy had also drifted: it did `Number.isFinite(x) ? x : 0`, the
     exact coercion the server deliberately INVERTED because it made "could not
     determine" indistinguishable from "none".

     A recomputed verdict cannot be kept in step with a gate set that grows, and
     duplicating it is what let these diverge. Consume the composed verdict; when
     the server did not supply one, the gate is UNANSWERED, which is not
     cleared. */
  const gate = useMemo<DispatchGate>(
    () =>
      a?.gate && typeof a.gate.cleared === 'boolean'
        ? { cleared: a.gate.cleared, blockers: a.gate.blockers ?? [] }
        : { cleared: false, blockers: [] as string[] },
    [a],
  );

  const loading = discovering || (seqId !== null && live.loading);

  /* WHAT ANA SEES HERE. This surface answers one question — may this sequence
     be transmitted — and the answer is a hard gate, so the payload carries the
     BLOCKERS and not just the verdict. "Not cleared" without the reasons is the
     shape of answer that sends someone hunting; the gate already computes the
     strings, so they travel.

     `cleared` is never published as true from a missing assessment: with no
     sequence discovered, `gate` is {cleared:false, blockers:[]}, which would
     read as "blocked for no reason". The state field distinguishes that from a
     real refusal, because a gate that cannot be evaluated has not passed — and
     it says WHICH not-ready state this is (no program open, no submission for
     the program, no sequence on it, a failed read), never "no sequence in the
     organisation". */
  const gateState: GateState = loading
    ? 'evaluating'
    : live.error
      ? 'error'
      : notReadyState(discovery) ?? (seqId === null || !a ? 'no-sequence' : 'evaluated');
  const anaContext = useMemo(
    () => ({
      summary:
        gateState === 'evaluated' && a
          ? `Dispatch readiness for sequence ${sequenceNumber ?? `id ${a.sequenceId}`} (${a.region}, ${a.sequenceStatus}) of program ${programLabel}: ` +
            (gate.cleared ? 'cleared to dispatch.' : `NOT cleared — ${gate.blockers.length} blocker(s).`)
          : notReadySummary(gateState, programLabel),
      facts: {
        gateState,
        ...('programId' in discovery ? { programId: discovery.programId, program: discovery.programLabel } : {}),
        ...('submissionId' in discovery ? { submissionId: discovery.submissionId } : {}),
        ...(sequenceNumber ? { sequenceNumber } : {}),
        ...(a
          ? {
              sequenceId: a.sequenceId,
              region: a.region,
              sequenceStatus: a.sequenceStatus,
              cleared: gate.cleared,
              blockers: gate.blockers,
              validationErrors: a.validationErrors,
              unacknowledgedShadowCriticals: a.unacknowledgedShadowCriticals,
              shadowReviewRunCount: a.shadowReviewRunCount,
              shadowReviewMissing: a.shadowReviewMissing,
              externalValidationCleared: a.externalValidation?.cleared ?? null,
              leafCount: a.leafCount,
            }
          : {}),
      },
      availableActions: [
        'Explain why this sequence is not cleared to dispatch',
        'Explain what each blocker requires before it clears',
        'Explain what the external validator adds to this gate',
      ],
    }),
    [gateState, discovery, programLabel, sequenceNumber, a, gate],
  );
  usePublishSurfaceContext('dispatch-readiness', anaContext);

  /* the surface's identity — shown in every state */
  const head = (
    <div className="dr2-head">
      <div className="dr2-eyebrow">
        <span className="dr2-kicker">AnA · dispatch gate · proven, not generated</span>
      </div>
      <h1 className="dr2-title">Cleared to dispatch?</h1>
    </div>
  );

  /* ── honest loading / error / empty (never a fixture) ── */
  if (loading) {
    return (
      <div className="dr2">
        {head}
        <div role="status" className="scaf-note" style={{ padding: '18px 10px' }}>Assessing dispatch readiness…</div>
      </div>
    );
  }
  if (live.error || discovery.state === 'error') {
    return (
      <div className="dr2">
        {head}
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn't compute the dispatch gate"
          hint={
            discovery.state === 'error'
              ? `The open program's submission and sequence could not be read (${discovery.detail}). Nothing is being gated — sign in and retry, or check the service is reachable.`
              : "The deterministic readiness assessment didn't respond. It's computed server-side from your sequence's canonical leaves and open Shadow Review criticals — sign in and retry, or check the service is reachable."
          }
        />
      </div>
    );
  }
  if (discovery.state === 'no-program') {
    return (
      <div className="dr2">
        {head}
        <EmptyState
          icon={I.rocket}
          title="Open a program to gate its sequence"
          hint="The dispatch gate runs against the open program's eCTD sequence and nothing else — it never gates whichever submission happens to be newest in the organisation. Open a program first; its sequence's verdict appears here."
        />
      </div>
    );
  }
  if (discovery.state === 'no-submission') {
    return (
      <div className="dr2">
        {head}
        <EmptyState
          icon={I.rocket}
          title={`No submission for ${discovery.programLabel} yet`}
          hint="This program has no submission recorded, so there is no sequence to gate. Create its submission in the Submission Center and build a sequence; this screen does not stand in another program's filing for it."
        />
      </div>
    );
  }
  if (discovery.state === 'no-sequence' || !a) {
    const label = discovery.state === 'no-sequence' ? discovery.programLabel : programLabel ?? 'the open program';
    const sub = discovery.state === 'no-sequence' ? discovery.submissionTitle : null;
    return (
      <div className="dr2">
        {head}
        <EmptyState
          icon={I.rocket}
          title={`No sequence to gate for ${label} yet`}
          hint={
            (sub ? `Its submission "${sub}" has no eCTD sequence yet. ` : '') +
            'Build a sequence and place documents into it, then AnA can prove whether it is cleared to transmit.'
          }
        />
      </div>
    );
  }

  /* ── real assessment (a is non-null from here) ── */
  const ev = a.externalValidation;
  const rd = a.readiness;

  /* The composed gates, as the SERVER itemized them: each is the corpus rule
     it enforces, with its own blockers. They used to be recomputed here from
     raw counts and drawn as a tick or a cross — three of the server's four
     gates, with the Shadow Review card reading "dispatch permitted" on the very
     state the server blocks. A response that carries no breakdown shows none,
     rather than a local reconstruction. */
  const gateViews: GateView[] = Array.isArray(a.gates) ? a.gates : [];

  /* AnA answer-first verdict */
  const lead = gate.cleared
    ? {
          tone: 'good',
          h: <>Your sequence is <b>cleared to dispatch</b>. Every hard gate is proven clear.</>,
          b: <>0 open validation errors, 0 unacknowledged Shadow Review criticals{ev.configured ? ', external validator clean' : ''}. This verdict is computed from server state — not a model opinion. The wire transmit stays behind your Part-11 e-signature.</>,
      }
    : {
        tone: 'urgent',
        h: <>{gate.blockers.length} blocker{gate.blockers.length === 1 ? '' : 's'} stand{gate.blockers.length === 1 ? 's' : ''} between you and dispatch.</>,
        b: <>This is the deterministic floor — I cannot clear it while these are open, no matter how the draft reads. Close them, then re-check.</>,
      };

  return (
    <div className="dr2">
      <div className="dr2-head">
        <div className="dr2-eyebrow">
          <span className="dr2-kicker">AnA · dispatch gate · proven, not generated</span>
        </div>
        <h1 className="dr2-title">Cleared to dispatch?</h1>
        <div className="dr2-sub">
          {/* The sequence NUMBER is what a filing is known by (0000, 0001 …);
              the row id is kept beside it because every API path here is keyed
              by it. When the row carries no number, only the id is stated. */}
          {programLabel ? <>{programLabel} · </> : null}
          {sequenceNumber ? <>Sequence {sequenceNumber} (id {a.sequenceId})</> : <>Sequence id {a.sequenceId}</>} · region{' '}
          {String(a.region || 'fda').toUpperCase()} · {a.leafCount} leaves · status {a.sequenceStatus}
          {discovery.state === 'sequence' && discovery.match === 'legacy-name' ? ' · submission matched by name: it has no project recorded' : null}
        </div>
      </div>

      {/* the verdict */}
      <div className={'dr2-verdict ' + (gate.cleared ? 'ok' : 'blocked')}>
        <span className="dr2-verdict-ic">{gate.cleared ? I.shieldCheck : I.lock}</span>
        <span className="dr2-verdict-t">{gate.cleared ? 'Cleared to dispatch' : 'Dispatch blocked'}</span>
      </div>

      <div className={'dr2-lead tone-' + lead.tone}>
        <div className="dr2-lead-ic">{I.rocket}</div>
        <div>
          <p className="dr2-lead-h">{lead.h}</p>
          <p className="dr2-lead-b">{lead.b}</p>
        </div>
      </div>

      {/* the composed gates — each the rule it enforces, its outcome in words */}
      {gateViews.length > 0 && (
        <div className="dr2-gates">
          {gateViews.map((g) => <GateCard key={g.key} gate={g} />)}
        </div>
      )}

      {/* blockers — shown here only when the server did not itemize its
          gates; otherwise each blocker is shown inside the gate it belongs to */}
      {!gate.cleared && gateViews.length === 0 && (
        <div className="dr2-blockers">
          <div className="dr2-blockers-hd">{I.lock} What must close before dispatch</div>
          {gate.blockers.map((b, i) => (
            <div key={i} className="dr2-blocker">
              <span className="dr2-blocker-n">{i + 1}</span>
              <span className="dr2-blocker-t">{b}</span>
            </div>
          ))}
        </div>
      )}

      {/* structural findings breakdown */}
      <div className="dr2-readiness">
        <div className="dr2-readiness-hd">
          <span className="dr2-readiness-t">Structural validation</span>
          <span className="dr2-readiness-s">
            <span className="dr2-count err">{rd.errors} error{rd.errors === 1 ? '' : 's'}</span>
            <span className="dr2-count warn">{rd.warnings} warning{rd.warnings === 1 ? '' : 's'}</span>
            <span className="dr2-count idle">{rd.infos} info</span>
          </span>
        </div>
        {(rd.findings || []).map((f: ReadinessFinding, i: number) => (
          <div key={i} data-finding={f.code} className={'dr2-find tone-' + (SEV_TONE[f.severity] || 'idle')}>
            <span className={'dr2-find-sev tone-' + (SEV_TONE[f.severity] || 'idle')}>{f.severity}</span>
            {f.sectionCode && <span className="mono dr2-find-code">{f.sectionCode}</span>}
            <span className="dr2-find-msg">
              <RuleLine rule={f.rule ?? null} code={f.code} />
              {f.message}
            </span>
            {f.severity === 'error' && (
              <button
                className="dr2-find-fix"
                onClick={() =>
                  ask(
                    f.sectionCode
                      ? 'Resolve the dispatch-blocking validation error in §' + f.sectionCode + ': ' + f.message
                      : 'Resolve the dispatch-blocking validation error: ' + f.message,
                  )
                }
              >
                {I.sparkles} Fix
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="dr2-foot">
        <PedigreeBadge level="deterministic_registry" />
        <span className="dr2-foot-note">
          Every gate input is computed from server state — a client cannot pass{' '}
          <span className="mono">validationErrors:0</span> to talk the gate down. The AI dispatch-QC task advises; this gate{' '}
          <b>enforces</b>. Bound to the governed dispatch-readiness gate;
          the wire transmit stays behind a Part-11 e-signature.
        </span>
        {gate.cleared && (
          <button
            className="dr2-transmit"
            onClick={() =>
              ask(
                'Prepare the governed transmit of sequence ' +
                  a.sequenceId +
                  ' (region ' +
                  String(a.region || 'fda').toUpperCase() +
                  ') to the agency gateway — require the Part-11 e-signature.',
              )
            }
          >
            {I.send} Prepare governed transmit
          </button>
        )}
      </div>
    </div>
  );
}
