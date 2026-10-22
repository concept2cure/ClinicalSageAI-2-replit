import React, { useMemo } from 'react';
import { I } from '../icons';
import { PedigreeBadge } from '../intelligence/Intelligence';
import { EmptyState, hasKeys, useLiveData } from '../dataConnect';
import { usePublishSurfaceContext } from '../surfaceContext';
import { useSurfaceAvailable } from '../surfaceAvailable';
import { readShellProject, shellProgramId } from '../shellProject';
import type { SurfaceViewProps } from '../surfaceViews';
import {
  useProgramMarkets,
  type ExternalValidation,
  type GateView,
  type ProgramMarket,
  type ProgramMarkets,
  type ReadinessFinding,
  type RuleView,
} from './programSequence';
import { MarketsBody, NotSequencedState, VerdictDetail, marketName, marketTarget, marketVerdict, marketsForbidden, openSubmissionCenter } from './ProjectMarkets';
import { findingAct, type FindingAct } from './readinessFindingActs';
import { filingDocumentClassOf, filingTypeInSentence } from '@shared/regulatory/filing-document-classes';
import '../styles/project-home-v2.css';

/* ════ Submission Readiness — the open project's markets, each with its own
   deterministic dispatch gate (F18, docs/design/FILING_SPINE.md §7.2) ════
   One list: every market of the project (one submission, one application to
   one agency), its latest sequence and that sequence's verdict, read once in
   programSequence.ts (useProgramMarkets, the scoped list the Submit tab
   reads) and drawn by ProjectMarkets' rows. Under each row, the server's
   composed gates and its structural findings. Each finding's act opens the
   Submission Center where the finding is fixed (readinessFindingActs.ts); a
   cleared gate opens that sequence's Dispatch tab. Nothing here computes a
   verdict, signs or transmits.
   Pedigree: deterministic_registry (the gate is proven, not generated).
   full: true — owns the canvas. */

/** The open project's record: its name and type, read for the label and
 *  whether it is an application at all. */
interface ProgramRecord {
  id: string;
  name: string | null;
  code: string | null;
  program_type: string | null;
}

/* ── severity → tone map ── */
const SEV_TONE: Record<string, string> = { error: 'error', warning: 'warning', info: 'idle' };

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
function GateOutcome({ gate }: { gate: GateView }) {
  if (gate.key === 'external' && gate.assessmentStatus) {
    const labels = {
      passed: 'External validation passed.', failed: 'External validation failed.',
      invalid: 'External validation report invalid.', not_assessed: 'Not assessed.',
    };
    return <>{labels[gate.assessmentStatus]} {gate.assessmentNote ?? gate.notAssessed} {!gate.cleared && 'Blocks dispatch:'}</>;
  }
  return <>{gate.cleared && gate.notAssessed ? <>Not assessed. {gate.notAssessed}</> : gate.cleared ? 'Satisfied.' : 'Blocks dispatch:'}</>;
}

function externalValidationFacts(ev: ExternalValidation | undefined): Record<string, unknown> {
  if (!ev) return {};
  return {
    externalValidationCleared: ev.cleared,
    externalValidationStatus: ev.assessmentStatus ?? null,
    externalValidationNote: ev.assessmentNote ?? null,
    externalValidatorKind: ev.validatorKind ?? null,
    externalSelectedValidator: ev.selectedValidatorName ?? null,
    externalReportedValidator: ev.reportedValidatorName ?? null,
    externalValidationRan: ev.ran,
    externalQualifyingRun: ev.qualifyingRun ?? null,
    externalErrorCountKnown: ev.errorCountKnown ?? null,
  };
}

function gateWithLegacyErrors(suppliedGate: GateView, externalValidation: ExternalValidation): GateView {
  // Older responses have no factual status, but their positive observed count
  // still cannot be displayed as a successful external validation.
  return suppliedGate.key === 'external' && suppliedGate.assessmentStatus == null && externalValidation.ran && externalValidation.errorCount > 0
    ? { ...suppliedGate, assessmentStatus: 'failed', assessmentNote: `The supplied report carries ${externalValidation.errorCount} error-severity finding(s). The gate's blocking policy is shown separately.` }
    : suppliedGate;
}

function GateCard({ gate: suppliedGate, externalValidation }: { gate: GateView; externalValidation: ExternalValidation }) {
  const gate = gateWithLegacyErrors(suppliedGate, externalValidation);
  /* A gate that does not block because its check never ran is not "Satisfied".
     The external validator's card read "…report for this package carries no
     errors — Satisfied." over a package no validator had seen. */
  const unassessed = gate.cleared && (Boolean(gate.notAssessed) || (gate.key === 'external' && gate.assessmentStatus != null && gate.assessmentStatus !== 'passed'));
  return (
    <li data-gate={gate.key} className={'dr2-gate ' + (unassessed ? 'warn' : gate.cleared ? 'ok' : 'block')}>
      <div className="dr2-gate-top">
        <span className="dr2-gate-dot" aria-hidden="true">{unassessed ? I.alertTriangle : gate.cleared ? I.check : I.lock}</span>
        <span className="dr2-gate-label">{gate.rule?.title ?? `The ${gate.key} gate — not in the rule corpus`}</span>
      </div>
      <div className="dr2-gate-detail">
        <GateOutcome gate={gate} />
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
    </li>
  );
}

/** Open the Submission Center on this market's sequence, where `act` is done. */
function openAct(onNav: (id: string) => void, m: ProgramMarket, sequenceId: number, act: FindingAct): void {
  openSubmissionCenter(onNav, act.kind === 'validation'
    ? { submissionId: m.submission.id, sequenceId, ws: 'validation' }
    : { submissionId: m.submission.id, sequenceId, ws: 'builder', section: { act: act.kind, code: act.code } });
}

/** One structural finding, its rule, and the act that opens where it is fixed. */
function FindingRow({ f, act, market }: { f: ReadinessFinding; act: (() => void) | null; market: string }) {
  const a = findingAct(f);
  return (
    <li data-finding={f.code} className={'dr2-find tone-' + (SEV_TONE[f.severity] || 'idle')}>
      <span className={'dr2-find-sev tone-' + (SEV_TONE[f.severity] || 'idle')}>{f.severity}</span>
      {f.sectionCode && <span className="mono dr2-find-code">{f.sectionCode}</span>}
      <span className="dr2-find-msg">
        <RuleLine rule={f.rule ?? null} code={f.code} />
        {f.message}
      </span>
      {a && act && (
        <button type="button" className="dr2-find-fix" onClick={act} aria-label={`${a.label} for ${market}`}>
          {a.label} {I.right}
        </button>
      )}
    </li>
  );
}

/** A cleared gate opens the sequence's Dispatch tab; transmit is offered there
 *  once the sequence is dispatched, each behind its own e-signature. */
function DispatchDoor({ m, sequenceId, sequenceNumber, status, onNav, market }: {
  m: ProgramMarket; sequenceId: number; sequenceNumber: string; status: string | null; onNav: (id: string) => void; market: string;
}) {
  const open = () => openSubmissionCenter(onNav, { submissionId: m.submission.id, sequenceId, ws: 'dispatch' });
  if (status === 'dispatched') {
    return (
      <div className="dr2-door">
        <button type="button" className="dr2-transmit" onClick={open} aria-label={`Open governed transmit for ${market}`}>
          {I.send} Open governed transmit
        </button>
      </div>
    );
  }
  return (
    <div className="dr2-door">
      <button type="button" className="dr2-transmit" onClick={open} aria-label={`Open Dispatch for sequence ${sequenceNumber} of ${market}`}>
        {I.send} Open Dispatch for sequence {sequenceNumber}
      </button>
      <p className="pj-mkt-note">
        Transmit opens once sequence {sequenceNumber} is dispatched. Dispatch and transmit each take your Part 11 e-signature on the Dispatch tab.
      </p>
    </div>
  );
}

/** Under a market's row: the server's composed gates, its structural findings
 *  with their acts, and the door to Dispatch on a cleared gate. Where the
 *  server gave no gate breakdown, the row's own verdict detail is shown. */
function MarketGateDetail({ m, onNav, center }: { m: ProgramMarket; onNav: (id: string) => void; center: boolean }) {
  const r = m.read;
  if (r.state !== 'verdict' || !r.assessment) return <VerdictDetail read={r} />;
  const a = r.assessment;
  const market = marketName(m.submission);
  const gates: GateView[] = Array.isArray(a.gates) ? a.gates : [];
  const sequenceNumber = r.sequence.sequenceNumber ?? `id ${r.sequence.id}`;
  const status = a.sequenceStatus ?? r.sequence.status;
  const findings = Array.isArray(a.readiness?.findings) ? a.readiness.findings : [];
  return (
    <div className="dr2-market" data-testid="dr2-market-detail">
      {a.validatedStage?.holds === false && (
        <p role="status" className="pj-mkt-note" data-validated-stage="stale">{a.validatedStage.reason}</p>
      )}
      {gates.length > 0 ? (
        <ul className="dr2-gates" aria-label={`Dispatch gates for ${market}`}>
          {gates.map((g) => <GateCard key={g.key} gate={g} externalValidation={a.externalValidation} />)}
        </ul>
      ) : (
        <VerdictDetail read={r} />
      )}
      {a.readiness && (
        <div className="dr2-readiness">
          <div className="dr2-readiness-hd">
            <span className="dr2-readiness-t">Structural validation</span>
            <span className="dr2-readiness-s">
              <span className="dr2-count err">{a.readiness.errors} error{a.readiness.errors === 1 ? '' : 's'}</span>
              <span className="dr2-count warn">{a.readiness.warnings} warning{a.readiness.warnings === 1 ? '' : 's'}</span>
              <span className="dr2-count idle">{a.readiness.infos} info</span>
            </span>
          </div>
          {findings.length > 0 && (
            <ul className="dr2-finds" aria-label={`Structural findings for ${market}`}>
              {findings.map((f, i) => {
                const act = findingAct(f);
                return <FindingRow key={i} f={f} market={market} act={act && center ? () => openAct(onNav, m, r.sequence.id, act) : null} />;
              })}
            </ul>
          )}
        </div>
      )}
      {r.gate?.cleared && center && (
        <DispatchDoor m={m} sequenceId={r.sequence.id} sequenceNumber={sequenceNumber} status={status} onNav={onNav} market={market} />
      )}
    </div>
  );
}

/** Where the list stands, in one word, for AnA. */
type ListState = 'no-project' | 'reading' | 'project-failed' | 'not-sequenced' | 'forbidden' | 'list-failed' | 'no-market' | 'listed';

function listStateOf(programId: string | null, program: { loading: boolean; error?: string; data: ProgramRecord | null }, notSequenced: boolean, markets: ProgramMarkets): ListState {
  if (!programId) return 'no-project';
  if (program.error) return 'project-failed';
  if (program.loading || !program.data) return 'reading';
  if (notSequenced) return 'not-sequenced';
  if (markets.list.loading) return 'reading';
  if (marketsForbidden(markets)) return 'forbidden';
  if (markets.list.error) return 'list-failed';
  return markets.markets.length === 0 ? 'no-market' : 'listed';
}

/** One market as AnA is told it: `cleared` and `blockers` only when the server
 *  stated a gate, so a missing verdict is never published as cleared. */
function marketFacts(m: ProgramMarket): Record<string, unknown> {
  const r = m.read;
  const out: Record<string, unknown> = {
    submissionId: m.submission.id,
    market: marketName(m.submission),
    applicationType: m.submission.applicationType,
    region: m.submission.primaryRegion,
    readState: r.state,
    verdict: marketVerdict(r).text,
    answered: r.state === 'verdict' && r.gate != null,
  };
  if (r.state === 'verdict' || r.state === 'verdict-failed') {
    Object.assign(out, { sequenceId: r.sequence.id, sequenceNumber: r.sequence.sequenceNumber, sequenceStatus: r.sequence.status });
  }
  if (r.state === 'verdict' && r.gate) Object.assign(out, { cleared: r.gate.cleared, blockers: r.gate.blockers });
  const a = r.state === 'verdict' ? r.assessment : null;
  if (a) {
    Object.assign(out, {
      validationErrors: a.validationErrors,
      unacknowledgedShadowCriticals: a.unacknowledgedShadowCriticals,
      shadowReviewRunCount: a.shadowReviewRunCount,
      shadowReviewMissing: a.shadowReviewMissing,
      leafCount: a.leafCount,
      // A gate that cleared without assessing what it guards (an advisory
      // validator, a clinical hold, a Shadow Review waived by signature), in
      // the server's words, so AnA never narrates it as passed.
      notAssessed: (Array.isArray(a.gates) ? a.gates : [])
        .filter((g) => g.cleared && typeof g.notAssessed === 'string' && g.notAssessed.trim())
        .map((g) => ({ gate: g.key, note: g.notAssessed })),
      validatedStageHolds: a.validatedStage?.holds ?? null,
      ...externalValidationFacts(a.externalValidation),
    });
  }
  return out;
}

function anaSummary(state: ListState, label: string, markets: ProgramMarket[], programType: string | null): string {
  const p = label;
  switch (state) {
    case 'no-project': return 'Submission readiness: no project is open, so no sequence is being gated.';
    case 'reading': return 'Submission readiness, still reading the project and its markets.';
    case 'project-failed': return 'Submission readiness could not read the open project, so whether it has markets is not stated.';
    case 'not-sequenced': {
      const documentClass = filingDocumentClassOf(programType);
      return `Submission readiness: the open project (${p}) is ${documentClass ? filingTypeInSentence(documentClass.docType, true) : 'a filing document class'}, authored here and not built as a sequence, so there is no sequence to gate.`;
    }
    case 'forbidden': return `Submission readiness: the person's role does not include reading submissions, so the markets of ${p} are not shown.`;
    case 'list-failed': return `Submission readiness: the markets of ${p} could not be read. Nothing is being gated, which is not the same as cleared.`;
    case 'no-market': return `Submission readiness: ${p} has no market yet, so there is no sequence to gate.`;
    default:
      return `Submission readiness for ${p}: ` + markets.map((m) => `${marketName(m.submission)}: ${marketVerdict(m.read).text}`).join('; ') + '.';
  }
}

export function DispatchReadiness({ onNav }: SurfaceViewProps) {
  const shell = readShellProject();
  const programId = shellProgramId(shell);
  const [programBump, setProgramBump] = React.useState(0);
  const program = useLiveData<ProgramRecord>(
    programId ? `/api/c2c/projects/${encodeURIComponent(programId)}` : null,
    [programId, programBump],
    hasKeys<ProgramRecord>('id'),
  );
  const programType = program.data?.program_type ?? null;
  const documentClass = filingDocumentClassOf(programType);
  /* The markets are read beside the project, from the first render, so the
     list is "loading" until it has answered. Started only once the project
     was read, it rendered one commit of "No market for this project yet"
     before any read began. A filing document class is shown its own state and
     never its (empty) list. */
  const markets = useProgramMarkets(programId);
  const label = program.data?.name || program.data?.code || shell?.title || programId || 'the open project';
  const available = useSurfaceAvailable();
  const center = available('submission-center');
  const state = listStateOf(programId, program, Boolean(documentClass), markets);

  const anaContext = useMemo(
    () => ({
      summary: anaSummary(state, label, markets.markets, programType),
      facts: {
        listState: state,
        ...(programId ? { programId, program: label } : {}),
        markets: state === 'listed' ? markets.markets.map(marketFacts) : [],
      },
      availableActions: [
        'Explain why a market is not cleared to dispatch',
        'Explain what each blocker requires before it clears',
        'Explain what the external validator adds to this gate',
      ],
    }),
    [state, label, markets.markets, programId, programType],
  );
  usePublishSurfaceContext('dispatch-readiness', anaContext);

  /* the surface's identity — shown in every state */
  const head = (
    <div className="dr2-head">
      <div className="dr2-eyebrow">
        <span className="dr2-kicker">AnA · dispatch gate · proven, not generated</span>
      </div>
      <h1 className="dr2-title">Cleared to dispatch?</h1>
      {programId && <div className="dr2-sub">{label} · each market&apos;s latest sequence, as the server gates it</div>}
    </div>
  );

  let body: React.ReactNode;
  if (!programId) {
    body = (
      <EmptyState icon={I.rocket} title="Open a project to see its markets"
        hint="The dispatch gate reads the open project's markets and nothing else; it never gates whichever submission is newest in the organisation." />
    );
  } else if (program.error) {
    body = (
      <EmptyState tone="error" icon={I.alertTriangle} title="Couldn't read this project"
        hint="The project could not be read, so whether it has markets is not stated. Nothing is being gated, which is not the same as cleared."
        retry={() => setProgramBump((b) => b + 1)} />
    );
  } else if (!program.data) {
    body = <div role="status" className="scaf-note" style={{ padding: '18px 10px' }}>Reading this project…</div>;
  } else if (documentClass) {
    body = <NotSequencedState documentClass={documentClass} />;
  } else {
    body = (
      <MarketsBody markets={markets} center={center} onOpen={center ? (m) => openSubmissionCenter(onNav, marketTarget(m)) : null}
        startHint=" Add one from the project's Submit tab."
        detail={(m) => <MarketGateDetail m={m} onNav={onNav} center={center} />} />
    );
  }

  return (
    <div className="dr2">
      {head}
      {body}
      <div className="dr2-foot">
        <PedigreeBadge level="deterministic_registry" />
        <span className="dr2-foot-note">
          Every gate input is computed from server state — a client cannot pass{' '}
          <span className="mono">validationErrors:0</span> to talk the gate down. The AI dispatch-QC task advises; this gate{' '}
          <b>enforces</b>. Dispatch and the wire transmit each stay behind a Part 11 e-signature, on the sequence&apos;s Dispatch tab.
        </span>
      </div>
    </div>
  );
}
