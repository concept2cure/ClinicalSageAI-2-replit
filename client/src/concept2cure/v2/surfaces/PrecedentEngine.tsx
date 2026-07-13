import React, { useState } from 'react';
import { I } from '../icons';
import { SampleTag } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import { AnswerLead } from '../AnswerLead';
import {
  PE_RESULTS,
  PE_RISK,
  PE_STRATEGY,
  PE_CLAIM,
  PE_PATTERNS,
  severityTone,
  type PrecedentResult,
  type RiskAnalysis,
  type Strategy,
  type ClaimResult,
  type PatternAnalysis,
  type PeQuery,
} from '../fixtures/precedent-engine-data';
import '../styles/project-home-v2.css';

/* ── Analysis union — the right-hand panel switches between these shapes ── */

type AnalysisState = RiskAnalysis | Strategy | PatternAnalysis;

/* ════ PrecedentEngine — precedent intelligence workbench ════ */

export function PrecedentEngine({ onAsk }: SurfaceViewProps) {
  const ask = onAsk;

  const [q, setQ] = useState<PeQuery>({
    submissionType: '510(k)',
    therapeuticArea: 'Diabetes',
    indication: 'Continuous glucose monitoring -- 14-day wear',
    productCode: 'QBJ',
  });
  const [results, setResults] = useState<PrecedentResult[]>(PE_RESULTS);
  const [selK, setSelK] = useState(PE_RESULTS[0].clearanceNumber);
  const [tab, setTab] = useState('risk');
  const [analysis, setAnalysis] = useState<AnalysisState>(PE_RISK);
  const [claim, setClaim] = useState('');
  const [claimRes, setClaimRes] = useState<ClaimResult | null>(null);
  const [busy, setBusy] = useState(false);

  const sel = results.find((r) => r.clearanceNumber === selK) || results[0];

  /* Fixture-backed "search" and "analysis" runners (live-first pattern in production). */
  const runSearch = () => {
    setBusy(true);
    setTimeout(() => {
      setResults(PE_RESULTS);
      setBusy(false);
    }, 400);
  };

  const runTab = (t: string) => {
    setTab(t);
    const map: Record<string, AnalysisState> = {
      risk: PE_RISK,
      strategy: PE_STRATEGY,
      crl: PE_PATTERNS.crl,
      rtf: PE_PATTERNS.rtf,
      ema: PE_PATTERNS.ema,
      adcomm: PE_PATTERNS.adcomm,
    };
    setAnalysis(map[t] || PE_RISK);
  };

  const checkClaim = () => {
    if (!claim.trim()) return;
    setClaimRes(PE_CLAIM);
  };

  const TABS: [string, string][] = [
    ['risk', 'Risk analysis'],
    ['strategy', 'Strategy'],
    ['crl', 'CRL triggers'],
    ['rtf', 'RTF triggers'],
    ['ema', 'EMA D120/180'],
    ['adcomm', 'AdComm risk'],
  ];

  /* Type guards for analysis panel rendering */
  const isRisk = (a: AnalysisState): a is RiskAnalysis => 'factors' in a && 'score' in a;
  const isStrategy = (a: AnalysisState): a is Strategy => 'recommendation' in a;
  const isPattern = (a: AnalysisState): a is PatternAnalysis => 'items' in a && 'title' in a && !('score' in a);

  /* answer-first lead */
  const top = results[0] || ({} as PrecedentResult);
  const cyc = results.map((r) => r.cycle).filter(Boolean);
  const lo = cyc.length ? Math.min(...cyc) : null;
  const hi = cyc.length ? Math.max(...cyc) : null;
  const topRisk =
    isRisk(analysis) && analysis.factors && analysis.factors[0] ? analysis.factors[0] : null;
  const strong = (top.match || 0) >= 0.85;

  return (
    <div className="sp" style={{ maxWidth: 1160 }}>
      <SampleTag sample={true} />
      <div className="sp-head">
        <div>
          <div className="sp-eyebrow">Specialist -- /api/precedent-engine</div>
          <h1 className="sp-title">Precedent intelligence</h1>
          <p className="sp-state">
            Search cleared precedents, compare your submission, and run regulatory-risk, strategy,
            CRL/RTF-trigger, EMA-question and Advisory-Committee analyses -- every result traces to
            registry precedents.
          </p>
        </div>
        <button
          className="sp-primary"
          onClick={() => ask('Ingest a new precedent into the registry')}
        >
          {I.plus} Ingest precedent
        </button>
      </div>

      <AnswerLead
        tone={strong ? 'good' : 'calm'}
        eyebrow={
          'The honest read on your ' +
          q.submissionType +
          (q.indication ? ' -- ' + q.indication.split('--')[0].trim() : '')
        }
        headline={
          strong ? (
            <>
              Citing <b>{top.clearanceNumber}</b> ({top.deviceName}) is your cleanest path --{' '}
              {results.length} devices like yours cleared in about{' '}
              <b>
                {lo}--{hi} days
              </b>
              .
            </>
          ) : (
            <>
              No single strong predicate yet -- worth a search or a De Novo look before you
              commit.
            </>
          )
        }
        body={
          topRisk ? (
            <>
              The one thing reviewers will most likely ask about is{' '}
              <b>{topRisk.label.toLowerCase()}</b>. Bring it up front and you take their biggest
              question off the table before they raise it.
            </>
          ) : (
            "Run the risk analysis below and I'll tell you exactly what reviewers tend to push back on for this kind of submission."
          )
        }
        reassure={
          strong
            ? "You're not starting from zero -- I'll draft the argument with you."
            : "Whatever the path, I'll walk it with you step by step."
        }
        action={{
          label: 'Draft this argument with AnA',
          onClick: () =>
            ask(
              'Draft the substantial-equivalence argument citing ' +
                (top.clearanceNumber || 'the top precedent') +
                (topRisk
                  ? ' and pre-empt the ' + topRisk.label.toLowerCase() + ' question'
                  : ''),
            ),
        }}
        secondary="Or explore the precedents and analyses below when you're ready."
      />

      <div className="pj-card" style={{ marginBottom: 14 }}>
        <div
          className="pj-card-b"
          style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}
        >
          <label className="pe-f">
            <span>Submission type</span>
            <select
              value={q.submissionType}
              onChange={(e) => setQ({ ...q, submissionType: e.target.value })}
            >
              {['510(k)', 'De Novo', 'PMA', 'NDA', 'BLA', 'ANDA'].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label className="pe-f" style={{ flex: 1.4 }}>
            <span>Indication</span>
            <input
              value={q.indication}
              onChange={(e) => setQ({ ...q, indication: e.target.value })}
            />
          </label>
          <label className="pe-f">
            <span>Therapeutic area</span>
            <input
              value={q.therapeuticArea}
              onChange={(e) => setQ({ ...q, therapeuticArea: e.target.value })}
            />
          </label>
          <label className="pe-f" style={{ maxWidth: 110 }}>
            <span>Product code</span>
            <input
              value={q.productCode}
              onChange={(e) => setQ({ ...q, productCode: e.target.value })}
            />
          </label>
          <button
            className="sp-primary"
            style={{ padding: '8px 16px' }}
            onClick={runSearch}
            disabled={busy}
          >
            {I.search} {busy ? 'Searching...' : 'Search'}
          </button>
        </div>
      </div>

      <div className="sp-2col" style={{ gridTemplateColumns: '1.15fr 1fr' }}>
        <div className="pj-card">
          <div className="pj-card-h">
            <span className="t">Closest precedents</span>
            <span className="s">{results.length} -- ranked by match</span>
          </div>
          <div className="pj-card-b" style={{ padding: 8 }}>
            <div className="sp-list">
              {results.map((r) => (
                <button
                  key={r.clearanceNumber}
                  className="sp-row"
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    borderRadius: 8,
                    padding: '9px 10px',
                    border:
                      selK === r.clearanceNumber
                        ? '1px solid var(--accent-muted)'
                        : '1px solid transparent',
                    background:
                      selK === r.clearanceNumber ? 'var(--accent-000)' : 'transparent',
                  }}
                  onClick={() => setSelK(r.clearanceNumber)}
                >
                  <span className="sp-row-b">
                    <span
                      className="sp-row-t"
                      style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-200)' }}
                    >
                      {r.clearanceNumber} -- {r.deviceName}
                    </span>
                    <span className="sp-row-s">
                      {r.applicant} -- {r.clearanceType} -- {r.cycle}d cycle
                    </span>
                  </span>
                  <span className="rd-chip tone-ok">{r.decisionOutcome}</span>
                  <span className="pe-match">{Math.round(r.match * 100)}%</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className="pj-card" style={{ marginBottom: 14 }}>
            <div className="pj-card-h">
              <span className="t">
                {sel.clearanceNumber} -- {sel.deviceName}
              </span>
              <button
                className="pj-card-h-go"
                style={{ fontSize: 11, color: 'var(--accent-200)' }}
                onClick={() =>
                  ask('Compare our submission against precedent ' + sel.clearanceNumber)
                }
              >
                Compare {I.arrowRight}
              </button>
            </div>
            <div className="pj-card-b">
              <div className="tl-spec-grid">
                <div className="tl-spec-row">
                  <span className="tl-spec-k">Applicant</span>
                  <span className="tl-spec-v">{sel.applicant}</span>
                </div>
                <div className="tl-spec-row">
                  <span className="tl-spec-k">Decision</span>
                  <span className="tl-spec-v">
                    {sel.decisionOutcome} -- {sel.decisionDate}
                  </span>
                </div>
                <div className="tl-spec-row">
                  <span className="tl-spec-k">Type</span>
                  <span className="tl-spec-v">{sel.clearanceType}</span>
                </div>
                <div className="tl-spec-row">
                  <span className="tl-spec-k">Predicate</span>
                  <span className="tl-spec-v">{sel.predicateKNumber || '--'}</span>
                </div>
              </div>
              {sel.riskFactors && sel.riskFactors.length > 0 && (
                <div className="tl-warn" style={{ marginTop: 10 }}>
                  {sel.riskFactors.map((f, i) => (
                    <div key={i} className="tl-warn-row">
                      {I.alertTriangle} {f}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="pj-card">
            <div className="pj-card-b">
              <div className="reg-tabs" style={{ marginTop: 0 }}>
                {TABS.map(([id, l]) => (
                  <button
                    key={id}
                    className={'reg-tab' + (tab === id ? ' on' : '')}
                    onClick={() => runTab(id)}
                  >
                    {l}
                  </button>
                ))}
              </div>
              {tab === 'risk' && isRisk(analysis) && (
                <div>
                  <div className="ub-row" style={{ marginBottom: 8 }}>
                    <div className="ub-row-l">
                      <div className="ub-row-t">Overall risk</div>
                      <div className="ub-row-s">{analysis.overall}</div>
                    </div>
                    <span className="rd-chip tone-warn">
                      {Math.round((analysis.score || 0) * 100)}%
                    </span>
                  </div>
                  <div className="sp-list">
                    {analysis.factors.map((f, i) => (
                      <div key={i} className="sp-row">
                        <span className={'rd-chip tone-' + severityTone(f.severity)}>
                          {f.severity}
                        </span>
                        <span className="sp-row-b">
                          <span className="sp-row-t">{f.label}</span>
                          <span className="sp-row-s">{f.note}</span>
                        </span>
                        <button
                          className="sp-go"
                          onClick={() => ask('Explain and pre-empt: ' + f.label)}
                        >
                          {I.sparkles}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {tab === 'strategy' && isStrategy(analysis) && (
                <div>
                  <div
                    className="de-quote"
                    style={{
                      padding: '10px 12px',
                      background: 'var(--bg-050)',
                      borderLeft: '3px solid var(--accent-100)',
                      borderRadius: 8,
                      marginBottom: 10,
                    }}
                  >
                    <b>Recommended:</b> {analysis.recommendation} -- citing {analysis.predicate}
                  </div>
                  <ul className="pe-ul">
                    {(analysis.rationale || []).map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}
              {['crl', 'rtf', 'ema', 'adcomm'].includes(tab) && isPattern(analysis) && (
                <div>
                  <div className="pj-seclbl" style={{ marginTop: 0 }}>
                    {analysis.title}
                  </div>
                  <ul className="pe-ul">
                    {analysis.items.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="pj-card" style={{ marginTop: 14 }}>
        <div className="pj-card-h">
          <span className="t">Real-time claim check</span>
          <span className="s">POST /check-claim</span>
        </div>
        <div className="pj-card-b">
          <div className="tl-edit" style={{ marginTop: 0 }}>
            <span className="tl-edit-ic">{I.sparkles}</span>
            <input
              className="tl-edit-in"
              placeholder='Paste a claim to check against precedent -- e.g. "14-day wear with no fingerstick calibration"'
              value={claim}
              onChange={(e) => setClaim(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') checkClaim();
              }}
            />
            <button
              className="tl-edit-go"
              onClick={checkClaim}
              disabled={!claim.trim()}
            >
              {I.arrowUp}
            </button>
          </div>
          {claimRes && (
            <div className="gri-result" style={{ marginTop: 12 }}>
              <div className="gri-result-hdr">
                <span className="t">
                  {claimRes.verdict === 'supported' ? 'Supported' : 'Needs support'} --{' '}
                  {Math.round((claimRes.confidence || 0) * 100)}%
                </span>
              </div>
              <div className="gri-result-body">
                <div
                  style={{
                    fontSize: 13,
                    lineHeight: 1.5,
                    color: 'var(--text-200)',
                    marginBottom: 8,
                  }}
                >
                  {claimRes.note}
                </div>
                <div className="gri-cite">
                  {(claimRes.precedents || []).map((c) => (
                    <span key={c} className="c">
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
