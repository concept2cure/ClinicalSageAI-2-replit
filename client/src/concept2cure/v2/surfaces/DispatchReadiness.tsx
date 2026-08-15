import React, { useEffect, useMemo, useState } from 'react';
import { I } from '../icons';
import { PedigreeBadge } from '../intelligence/Intelligence';
import { liveGet, unwrapList, useLiveData, EmptyState } from '../dataConnect';
import { usePublishSurfaceContext } from '../surfaceContext';
import type { SurfaceViewProps } from '../surfaceViews';
import { evaluateDispatchGate, mergeDispatchGates } from '../fixtures/dispatch-readiness';
import '../styles/project-home-v2.css';

/* ── Display types — aligned to the server's dispatch-readiness assessment
   (server/services/ectd/assess-dispatch-readiness.ts). Only the columns this
   surface renders are modeled; the server's redundant `gate` field is
   recomputed client-side below. `sectionCode` is NULLABLE: sequence-level
   structural findings (EMPTY_SEQUENCE, SEQUENCE_NUMBER_FORMAT) carry no
   section, so the server returns null there — rendered honestly, never
   fabricated. ── */
interface ReadinessFinding {
  severity: 'error' | 'warning' | 'info';
  code: string;
  sectionCode: string | null;
  message: string;
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

interface DispatchReadinessAssessment {
  sequenceId: number;
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

/** Discover the org's newest eCTD sequence id (submissions → sequences),
 *  failing closed: `seqId` stays null and `discovering` flips false, so the
 *  surface renders an honest empty state (never a fabricated assessment).
 *  Both reads hit real DB-backed endpoints; the null fixture means a failed
 *  discovery yields no sequence rather than sample data. */
function useLatestSequenceId(): { seqId: number | null; discovering: boolean } {
  const [seqId, setSeqId] = useState<number | null>(null);
  const [discovering, setDiscovering] = useState(true);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const subs = await liveGet<unknown>('/api/submissions', null);
        if (subs.sample) return; // discovery failed → stay on empty
        const subList = unwrapList(subs.data);
        const first = Array.isArray(subList) ? (subList[0] as { id?: number } | undefined) : undefined;
        if (!first?.id) return;
        const seqs = await liveGet<unknown>(`/api/submissions/${first.id}/sequences`, null);
        if (seqs.sample) return;
        const seqList = unwrapList(seqs.data);
        const rows = Array.isArray(seqList) ? (seqList as Array<{ id?: number }>) : [];
        const latest = rows[rows.length - 1];
        if (!cancelled && latest?.id) setSeqId(latest.id);
      } finally {
        if (!cancelled) setDiscovering(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return { seqId, discovering };
}

/* ── severity → tone map ── */
const SEV_TONE: Record<string, string> = { error: 'error', warning: 'warning', info: 'idle' };

/* ════ Dispatch Readiness — deterministic last gate before agency transmit ════
   Answer-first; not a dashboard. Consumes Shadow Review criticals + structural
   validation + external (eValidator) findings, composed.
   Pedigree: deterministic_registry (the gate is proven, not generated).
   full: true — owns the canvas. */

export function DispatchReadiness({ onAsk }: SurfaceViewProps) {
  const ask = onAsk;
  // Real deterministic gate for the org's newest sequence, computed server-side
  // by assessSequenceDispatchReadiness. Fixture-free: real assessment, honest
  // empty (no sequence yet), or honest error — never a sample assessment.
  const { seqId, discovering } = useLatestSequenceId();
  const live = useLiveData<DispatchReadinessAssessment>(
    seqId === null ? null : `/api/submissions/sequences/${seqId}/dispatch-readiness`,
    [seqId],
  );
  const a = live.data;

  // Compose the hard gate client-side from the server-computed inputs, mirroring
  // the server's assessSequenceDispatchReadiness (structural + external gates).
  // evaluateDispatchGate / mergeDispatchGates are pure deterministic functions —
  // the single source of truth for the blocker strings, not fixture data.
  const gate = useMemo(
    () =>
      a
        ? mergeDispatchGates(
            evaluateDispatchGate({
              validationErrors: a.validationErrors,
              unacknowledgedShadowCriticals: a.unacknowledgedShadowCriticals,
            }),
            { cleared: a.externalValidation.cleared, blockers: a.externalValidation.blockers || [] },
          )
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
     real refusal, because a gate that cannot be evaluated has not passed. */
  const anaContext = useMemo(
    () => ({
      summary: loading
        ? 'Dispatch readiness, still evaluating the gate.'
        : live.error
          ? 'Dispatch readiness could not be evaluated — the gate is unanswered, which is not the same as cleared.'
          : seqId === null || !a
            ? 'Dispatch readiness: no eCTD sequence exists yet for this organization, so there is nothing to clear.'
            : `Dispatch readiness for sequence ${a.sequenceId} (${a.region}, ${a.sequenceStatus}): ` +
              (gate.cleared ? 'cleared to dispatch.' : `NOT cleared — ${gate.blockers.length} blocker(s).`),
      facts: {
        gateState: loading ? 'evaluating' : live.error ? 'error' : seqId === null || !a ? 'no-sequence' : 'evaluated',
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
    [loading, live.error, seqId, a, gate],
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
        <div className="scaf-note" style={{ padding: '18px 10px' }}>Assessing dispatch readiness…</div>
      </div>
    );
  }
  if (live.error) {
    return (
      <div className="dr2">
        {head}
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn't compute the dispatch gate"
          hint="The deterministic readiness assessment didn't respond. It's computed server-side from your sequence's canonical leaves and open Shadow Review criticals — sign in and retry, or check the service is reachable."
        />
      </div>
    );
  }
  if (!a) {
    return (
      <div className="dr2">
        {head}
        <EmptyState
          icon={I.rocket}
          title="No submission sequence to gate yet"
          hint="The dispatch gate runs against your newest eCTD sequence. Create a submission and build a sequence, then AnA can prove whether it's cleared to transmit."
        />
      </div>
    );
  }

  /* ── real assessment (a is non-null from here) ── */
  const ev = a.externalValidation;
  const rd = a.readiness;

  /* three composed sub-gates */
  const structuralOk = a.validationErrors === 0;
  const shadowOk = a.unacknowledgedShadowCriticals === 0;
  const externalOk = ev.cleared !== false;

  const subGates = [
    {
      id: 'structural',
      label: 'Structural validation',
      ok: structuralOk,
      detail: structuralOk
        ? 'No open error-severity findings.'
        : a.validationErrors + ' open error-severity finding' + (a.validationErrors === 1 ? '' : 's'),
      basis: 'eCTD technical validation over the canonical core',
    },
    {
      id: 'shadow',
      label: 'Shadow Review criticals',
      ok: shadowOk,
      detail: a.shadowReviewMissing
        ? 'No Shadow Review has run — dispatch permitted but never adversarially reviewed.'
        : shadowOk
          ? a.shadowReviewRunCount + ' review' + (a.shadowReviewRunCount === 1 ? '' : 's') + ' run · 0 unacknowledged criticals'
          : a.unacknowledgedShadowCriticals + ' unacknowledged critical' + (a.unacknowledgedShadowCriticals === 1 ? '' : 's'),
      basis: 'Open critical Shadow Review findings for this sequence',
      warn: a.shadowReviewMissing,
    },
    {
      id: 'external',
      label: 'Agency-grade validator',
      ok: externalOk,
      detail: ev.configured
        ? ev.ran
          ? ev.errorCount + ' error' + (ev.errorCount === 1 ? '' : 's')
          : 'Configured; not yet run for this sequence.'
        : 'No external eValidator configured (default-off).',
      basis: 'External (eValidator) gate — fail-closed only under ECTD_REQUIRE_EVALIDATOR',
      muted: !ev.configured,
    },
  ];

  /* AnA answer-first verdict */
  const lead = gate.cleared
    ? a.shadowReviewMissing
      ? {
          tone: 'calm',
          h: <>Your sequence is <b>cleared to dispatch</b> — but nothing has adversarially reviewed it yet.</>,
          b: <>The hard gate is clear (0 validation errors, 0 unacknowledged Shadow criticals). I'd still run a Shadow Review before you transmit — a clean gate on a never-reviewed dossier is a blind spot, not a green light.</>,
        }
      : {
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
          Sequence {a.sequenceId} · region {String(a.region || 'fda').toUpperCase()} · {a.leafCount} leaves · status {a.sequenceStatus}
        </div>
      </div>

      {/* the verdict */}
      <div className={'dr2-verdict ' + (gate.cleared ? (a.shadowReviewMissing ? 'warn' : 'ok') : 'blocked')}>
        <span className="dr2-verdict-ic">
          {gate.cleared
            ? a.shadowReviewMissing
              ? I.alertTriangle
              : I.shieldCheck
            : I.lock}
        </span>
        <span className="dr2-verdict-t">
          {gate.cleared
            ? a.shadowReviewMissing
              ? 'Cleared — but never reviewed'
              : 'Cleared to dispatch'
            : 'Dispatch blocked'}
        </span>
      </div>

      <div className={'dr2-lead tone-' + lead.tone}>
        <div className="dr2-lead-ic">{I.rocket}</div>
        <div>
          <p className="dr2-lead-h">{lead.h}</p>
          <p className="dr2-lead-b">{lead.b}</p>
        </div>
      </div>

      {/* the three composed gates */}
      <div className="dr2-gates">
        {subGates.map((g) => (
          <div
            key={g.id}
            className={'dr2-gate ' + ((g as any).muted ? 'muted' : (g as any).warn ? 'warn' : g.ok ? 'ok' : 'block')}
          >
            <div className="dr2-gate-top">
              <span className="dr2-gate-dot">
                {(g as any).muted ? '–' : (g as any).warn ? I.alertTriangle : g.ok ? I.check : I.close}
              </span>
              <span className="dr2-gate-label">{g.label}</span>
            </div>
            <div className="dr2-gate-detail">{g.detail}</div>
            <div className="dr2-gate-basis">{g.basis}</div>
          </div>
        ))}
      </div>

      {/* blockers (if any) — the exact proven strings */}
      {!gate.cleared && (
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
          <div key={i} className={'dr2-find tone-' + (SEV_TONE[f.severity] || 'idle')}>
            <span className={'dr2-find-sev tone-' + (SEV_TONE[f.severity] || 'idle')}>{f.severity}</span>
            {f.sectionCode && <span className="mono dr2-find-code">{f.sectionCode}</span>}
            <span className="dr2-find-msg">{f.message}</span>
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
