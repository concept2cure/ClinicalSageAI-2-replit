import React, { useState, useMemo } from 'react';
import { I } from '../icons';
import { SampleTag } from '../dataConnect';
import { PedigreeBadge } from '../intelligence/Intelligence';
import type { SurfaceViewProps } from '../surfaceViews';
import '../styles/project-home-v2.css';
import {
  SHADOW_LENSES, SHADOW_SEQUENCE, SHADOW_FINDINGS,
  shadowLens, shadowAggregateRisk, SR_SEV, SR_DIM,
} from '../fixtures/shadow-review-data';
import type { ShadowFinding, SeverityMeta } from '../fixtures/shadow-review-data';

/* -- Helpers -- */

function riskBand(v: number): string { return v >= 0.66 ? 'high' : v >= 0.33 ? 'med' : 'low'; }
function riskWord(v: number): string { return v >= 0.66 ? 'high' : v >= 0.33 ? 'moderate' : 'low'; }

/* ================================================================
   ShadowReview -- AnA simulates the reviewer who will read your
   submission BEFORE you file. Scores the two gates that actually
   kill a filing (RTF / CRL) and hands you the fix list.
   Registers as SURFACE_VIEWS['shadow-review'] (full: true).
   ================================================================ */

export function ShadowReview({ onAsk, onNav }: SurfaceViewProps) {
  const ask = onAsk;
  const live = false; // sample data only until live API connected
  const seq = SHADOW_SEQUENCE;
  const lenses = SHADOW_LENSES;

  const [lensId, setLensId] = useState('fda_filing');
  const [_ran, _setRan] = useState(true); // sample run is pre-populated
  const lens = shadowLens(lensId);

  const findings = useMemo(() => {
    const f = (SHADOW_FINDINGS[lensId] || []) as ShadowFinding[];
    return f.slice().sort((a, b) => SR_SEV[a.severity].rank - SR_SEV[b.severity].rank);
  }, [lensId]);

  const risk = useMemo(() => shadowAggregateRisk(findings), [findings]);
  const rtf = risk.rtf;
  const crl = risk.crl;
  const criticals = findings.filter((f) => f.severity === 'critical').length;
  const majors = findings.filter((f) => f.severity === 'major').length;

  /* AnA's answer-first verdict -- reviewer voice, honest, one clear next step */
  const worst = rtf >= crl ? 'rtf' : 'crl';
  const lead = criticals > 0
    ? {
        tone: 'urgent' as const,
        h: <>{criticals} finding{criticals > 1 ? 's' : ''} would <b>stop your {lens.agency} filing at the {worst === 'rtf' ? lens.gates.rtf : lens.gates.crl}</b>. I ran the {lens.label} over your {seq.code} {seq.app} and this is what they would raise first.</>,
        b: <>A single critical saturates the gate -- fix these before you dispatch. Everything a reviewer flags here is cheaper to close now than in a {lens.gates.crl}.</>,
      }
    : majors > 0
      ? {
          tone: 'calm' as const,
          h: <>Your {seq.code} {seq.app} is <b>fileable, with {majors} substantive point{majors > 1 ? 's' : ''}</b> a {lens.agency} reviewer would raise. RTF risk {Math.round(rtf * 100)}%, {lens.gates.crl.split(' ')[0]} risk {Math.round(crl * 100)}%.</>,
          b: <>None are filing-blockers, but each is a likely question in the review cycle. Address them in the dossier now and you shorten the back-and-forth after you file.</>,
        }
      : {
          tone: 'good' as const,
          h: <>The {lens.label} found nothing that would block your filing. RTF risk {Math.round(rtf * 100)}%, {lens.gates.crl.split(' ')[0]} risk {Math.round(crl * 100)}%.</>,
          b: <>This is a clean simulated review. It is not a guarantee -- but a reviewer opening this sequence would not hit an administrative or substantive wall.</>,
        };

  return (
    <div className="sr">
      <SampleTag sample={true} />

      <div className="sr-head">
        <div className="sr-eyebrow">
          <span className="sr-kicker">AnA -- shadow review -- simulated {lens.agency} reviewer</span>
          <span className={'sr-src ' + (live ? 'live' : 'sample')}>{live ? 'Live' : 'Sample data'}</span>
        </div>
        <h1 className="sr-title">What would a reviewer flag before you file?</h1>
        <div className="sr-sub">{seq.code} -- {seq.app} -- sequence {seq.seq} ({seq.type}) -- {seq.leaves} leaves -- agencies run AI on their side of the desk -- this runs the reviewer's lens on yours, before they do</div>
      </div>

      {/* Lens selector -- the 5 real reviewer lenses */}
      <div className="sr-lenses">
        {lenses.map((l) => (
          <button key={l.id} className={'sr-lens' + (l.id === lensId ? ' on' : '')} onClick={() => setLensId(l.id)}>
            <span className="sr-lens-agency">{l.agency}</span>
            <span className="sr-lens-label">{l.label}</span>
          </button>
        ))}
      </div>

      {/* Answer-first lead -- AnA reporting the review */}
      <div className={'sr-lead tone-' + lead.tone}>
        <div className="sr-lead-ic">{I.eye || I.shieldCheck}</div>
        <div>
          <p className="sr-lead-h">{lead.h}</p>
          <p className="sr-lead-b">{lead.b}</p>
          <p className="sr-lead-basis">{lens.blurb}</p>
        </div>
      </div>

      <div className="sr-body">
        {/* The two gates that kill a filing */}
        <div className="sr-gates">
          {([
            { k: 'rtf', v: rtf, name: lens.gates.rtf, sub: 'Administrative gate -- will they accept the filing?', dims: 'rtf + format findings' },
            { k: 'crl', v: crl, name: lens.gates.crl, sub: 'Substantive gate -- will they approve after review?', dims: 'crl + nb findings' },
          ] as const).map((g) => (
            <div key={g.k} className={'sr-gate band-' + riskBand(g.v)}>
              <div className="sr-gate-top">
                <span className="sr-gate-name">{g.name}</span>
                <span className="sr-gate-pct">{Math.round(g.v * 100)}%</span>
              </div>
              <div className="sr-gate-track"><div className="sr-gate-fill" style={{ width: Math.round(g.v * 100) + '%' }} /></div>
              <div className="sr-gate-word">{riskWord(g.v)} risk</div>
              <div className="sr-gate-sub">{g.sub}</div>
            </div>
          ))}
        </div>

        {/* The findings -- the reviewer's list */}
        <div className="sr-findings">
          <div className="sr-findings-hd">
            <span className="sr-findings-t">{findings.length} finding{findings.length === 1 ? '' : 's'}</span>
            <span className="sr-findings-s">critical to info -- what the reviewer raises, and how to close it</span>
          </div>
          {findings.map((f, i) => {
            const sev: SeverityMeta = SR_SEV[f.severity] || SR_SEV.info;
            return (
              <div key={i} className={'sr-finding tone-' + sev.tone}>
                <div className="sr-finding-top">
                  <span className={'sr-sev tone-' + sev.tone}>{sev.label}</span>
                  <span className="sr-dim">{SR_DIM[f.dimension] || f.dimension}</span>
                  <span className="sr-finding-title">{f.title}</span>
                  {f.leafRef && f.leafRef !== '—' && <span className="mono sr-leaf">{f.leafRef}</span>}
                </div>
                {f.detail && <div className="sr-finding-detail">{f.detail}</div>}
                <div className="sr-finding-foot">
                  {f.basis && <span className="sr-basis"><b>Basis</b> {f.basis}</span>}
                  {f.recommendation && (
                    <button className="sr-fix" onClick={() => ask('Fix the shadow-review finding "' + f.title + '" (' + (SR_DIM[f.dimension] || f.dimension) + ', ' + sev.label + ') in §' + (f.leafRef || 'the dossier') + ': ' + f.recommendation)}>
                      {I.sparkles} {f.recommendation}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {!findings.length && <div className="sr-empty">No findings for this lens.</div>}
        </div>

        <div className="sr-foot">
          <PedigreeBadge level="model_assisted" />
          <PedigreeBadge level="deterministic_registry" />
          <span className="sr-foot-note">Findings are produced by the AI gateway (task <span className="mono">regulatory_review</span>, prompt <span className="mono">shadow-review@v1.0</span>) -- model-assisted. The RTF/CRL risk aggregation is deterministic (a single critical saturates the gate). Connect a sequence to run the live reviewer via <span className="mono">POST /api/submissions/sequences/:seqId/shadow-review</span>.</span>
          <div className="sr-actions">
            <button className="sr-run" onClick={() => ask('Re-run the ' + lens.label + ' shadow review on the ' + seq.code + ' ' + seq.app + ' sequence ' + seq.seq + ' and update the RTF/CRL risk.')}>
              {I.refresh || I.play} Re-run this reviewer
            </button>
            <button className="sr-run alt" onClick={() => onNav('ectd-coauthor')}>
              Open the sequence in eCTD co-author
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
