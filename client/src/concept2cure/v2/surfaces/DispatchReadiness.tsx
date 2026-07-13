import React, { useMemo } from 'react';
import { I } from '../icons';
import { PedigreeBadge } from '../intelligence/Intelligence';
import type { SurfaceViewProps } from '../surfaceViews';
import {
  SAMPLE_DISPATCH_ASSESSMENT,
  dispatchGateFor,
  type DispatchReadinessAssessment,
  type ReadinessFinding,
} from '../fixtures/dispatch-readiness';
import '../styles/project-home-v2.css';

/* ── severity → tone map ── */
const SEV_TONE: Record<string, string> = { error: 'error', warning: 'warning', info: 'idle' };

/* ════ Dispatch Readiness — deterministic last gate before agency transmit ════
   Answer-first; not a dashboard. Consumes Shadow Review criticals + structural
   validation + external (eValidator) findings, composed.
   Pedigree: deterministic_registry (the gate is proven, not generated).
   full: true — owns the canvas. */

export function DispatchReadiness({ onAsk }: SurfaceViewProps) {
  const ask = onAsk;
  const a: DispatchReadinessAssessment = SAMPLE_DISPATCH_ASSESSMENT;
  const gate = useMemo(() => dispatchGateFor(a), [a]);
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
          <span className="dr2-src sample">Sample data</span>
        </div>
        <h1 className="dr2-title">Cleared to dispatch?</h1>
        <div className="dr2-sub">
          BX-204 · BLA 761123 · sequence 0000 · region {String(a.region || 'fda').toUpperCase()} · {a.leafCount} leaves · status {a.sequenceStatus}
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
            <span className="mono dr2-find-code">{f.sectionCode}</span>
            <span className="dr2-find-msg">{f.message}</span>
            {f.severity === 'error' && (
              <button
                className="dr2-find-fix"
                onClick={() => ask('Resolve the dispatch-blocking validation error in §' + f.sectionCode + ': ' + f.message)}
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
          <b>enforces</b>. Bound to <span className="mono">GET /api/submissions/sequences/:seqId/dispatch-readiness</span>;
          the wire transmit stays behind a Part-11 e-signature.
        </span>
        {gate.cleared && (
          <button
            className="dr2-transmit"
            onClick={() =>
              ask('Prepare the governed transmit of the BX-204 BLA sequence 0000 to the FDA ESG — require the Part-11 e-signature.')
            }
          >
            {I.send} Prepare governed transmit
          </button>
        )}
      </div>
    </div>
  );
}
