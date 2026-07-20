import React, { useState, useEffect } from 'react';
import { I } from '../icons';
import { SampleTag, useLive } from '../dataConnect';
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

/* ── Live board contract — GET /api/precedent-engine-board -> { success, data }.
   Fields are optional because a fail-closed guard must not trust the shape until
   it has been structurally checked (the backend degrades any sub-call to an
   honest empty value rather than 500-ing the whole board). ── */
interface PrecedentBoardData {
  results?: PrecedentResult[];
  risk?: RiskAnalysis;
  strategy?: Strategy;
  patterns?: {
    crl?: PatternAnalysis;
    rtf?: PatternAnalysis;
    ema?: PatternAnalysis;
    adcomm?: PatternAnalysis;
  };
}

/* The { success, data } payload the board falls back to when the live read-model
   is unreachable or does not yet structurally match — shape-exact so `.data.data`
   is uniform whether live or sample. Never deleted: this is the fail-closed
   fixture the surface renders (and honestly labels "Sample data"). */
const PE_BOARD_FIXTURE: { data: PrecedentBoardData } = {
  data: {
    results: PE_RESULTS,
    risk: PE_RISK,
    strategy: PE_STRATEGY,
    patterns: {
      crl: PE_PATTERNS.crl,
      rtf: PE_PATTERNS.rtf,
      ema: PE_PATTERNS.ema,
      adcomm: PE_PATTERNS.adcomm,
    },
  },
};

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
  const [claim, setClaim] = useState('');
  const [claimRes, setClaimRes] = useState<ClaimResult | null>(null);
  const [busy, setBusy] = useState(false);

  /* ── Live board — GET /api/precedent-engine-board -> { success, data }.
     `useLive` assigns the WHOLE body to `.data`, so the display payload is at
     `raw.data.data`. Each slice is trusted as live ONLY when the response is not
     the fixture, structurally matches the display contract, and carries content;
     otherwise it fails closed to its fixture (shown honestly as "Sample data").
     The real-time claim check below is a separate POST endpoint and stays
     fixture-backed. ── */
  const raw = useLive<{ data?: PrecedentBoardData }>('/api/precedent-engine-board', PE_BOARD_FIXTURE);
  const board = raw.data?.data;

  const resultsLive = Boolean(
    !raw.sample &&
    board &&
    Array.isArray(board.results) &&
    board.results.length > 0 &&
    typeof board.results[0]?.clearanceNumber === 'string' &&
    typeof board.results[0]?.deviceName === 'string',
  );
  const riskLive = Boolean(
    !raw.sample &&
    board &&
    board.risk &&
    Array.isArray(board.risk.factors) &&
    board.risk.factors.length > 0 &&
    typeof board.risk.factors[0]?.label === 'string',
  );
  const strategyLive = Boolean(
    !raw.sample &&
    board &&
    board.strategy &&
    typeof board.strategy.recommendation === 'string' &&
    Array.isArray(board.strategy.rationale) &&
    board.strategy.rationale.length > 0,
  );
  const patternOk = (p?: PatternAnalysis) =>
    Boolean(!raw.sample && p && typeof p.title === 'string' && Array.isArray(p.items) && p.items.length > 0);
  const crlLive = patternOk(board?.patterns?.crl);
  const rtfLive = patternOk(board?.patterns?.rtf);
  const emaLive = patternOk(board?.patterns?.ema);
  const adcommLive = patternOk(board?.patterns?.adcomm);

  /* Effective slices: the live value when trusted, else the fail-closed fixture. */
  const effResults: PrecedentResult[] = resultsLive ? (board!.results ?? PE_RESULTS) : PE_RESULTS;
  const effRisk: RiskAnalysis = riskLive ? (board!.risk ?? PE_RISK) : PE_RISK;
  const effStrategy: Strategy = strategyLive ? (board!.strategy ?? PE_STRATEGY) : PE_STRATEGY;
  const effPatterns = {
    crl: crlLive ? (board!.patterns?.crl ?? PE_PATTERNS.crl) : PE_PATTERNS.crl,
    rtf: rtfLive ? (board!.patterns?.rtf ?? PE_PATTERNS.rtf) : PE_PATTERNS.rtf,
    ema: emaLive ? (board!.patterns?.ema ?? PE_PATTERNS.ema) : PE_PATTERNS.ema,
    adcomm: adcommLive ? (board!.patterns?.adcomm ?? PE_PATTERNS.adcomm) : PE_PATTERNS.adcomm,
  };
  const analysisMap: Record<string, AnalysisState> = {
    risk: effRisk,
    strategy: effStrategy,
    crl: effPatterns.crl,
    rtf: effPatterns.rtf,
    ema: effPatterns.ema,
    adcomm: effPatterns.adcomm,
  };
  const tabLive: Record<string, boolean> = {
    risk: riskLive,
    strategy: strategyLive,
    crl: crlLive,
    rtf: rtfLive,
    ema: emaLive,
    adcomm: adcommLive,
  };

  /* The analysis panel is a pure projection of the current tab over the effective
     slices, so it reflects live data the moment the board arrives — no stale
     window and no imperative setter to fall out of sync. */
  const analysis: AnalysisState = analysisMap[tab] || effRisk;

  /* When the live board arrives, adopt its precedents and keep the selection valid. */
  useEffect(() => {
    if (!resultsLive) return;
    setResults(effResults);
    if (!effResults.some((r) => r.clearanceNumber === selK)) setSelK(effResults[0].clearanceNumber);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultsLive]);

  const sel = results.find((r) => r.clearanceNumber === selK) || results[0];

  /* Live-first "search" — re-applies the effective precedents (live when trusted,
     else the fixture) behind the existing busy affordance. */
  const runSearch = () => {
    setBusy(true);
    setTimeout(() => {
      setResults(effResults);
      setBusy(false);
    }, 400);
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
  const cyc = results.map((r) => r.cycle).filter((c): c is number => typeof c === 'number');
  const lo = cyc.length ? Math.min(...cyc) : null;
  const hi = cyc.length ? Math.max(...cyc) : null;
  const topRisk =
    isRisk(analysis) && analysis.factors && analysis.factors[0] ? analysis.factors[0] : null;
  const strong = (top.match || 0) >= 0.85;

  return (
    <div className="sp" style={{ maxWidth: 1160 }}>
      <SampleTag sample={!resultsLive} />
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
              {results.length} devices like yours cleared
              {lo != null && hi != null ? (
                <>
                  {' '}
                  in about{' '}
                  <b>
                    {lo}--{hi} days
                  </b>
                </>
              ) : null}
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
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="s">{results.length} -- ranked by match</span>
              <SampleTag sample={!resultsLive} />
            </span>
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
                      {r.applicant} -- {r.clearanceType}
                      {r.cycle == null ? '' : ' -- ' + r.cycle + 'd cycle'}
                    </span>
                  </span>
                  <span className="rd-chip tone-ok">{r.decisionOutcome}</span>
                  <span className="pe-match">{r.match == null ? '—' : Math.round(r.match * 100) + '%'}</span>
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
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <SampleTag sample={!resultsLive} />
                <button
                  className="pj-card-h-go"
                  style={{ fontSize: 11, color: 'var(--accent-200)' }}
                  onClick={() =>
                    ask('Compare our submission against precedent ' + sel.clearanceNumber)
                  }
                >
                  Compare {I.arrowRight}
                </button>
              </span>
            </div>
            <div className="pj-card-b">
              <div className="tl-spec-grid">
                <div className="tl-spec-row">
                  <span className="tl-spec-k">Applicant</span>
                  <span className="tl-spec-v">{sel.applicant || '—'}</span>
                </div>
                <div className="tl-spec-row">
                  <span className="tl-spec-k">Decision</span>
                  <span className="tl-spec-v">
                    {sel.decisionOutcome || '—'}
                    {sel.decisionDate ? ' -- ' + sel.decisionDate : ''}
                  </span>
                </div>
                <div className="tl-spec-row">
                  <span className="tl-spec-k">Type</span>
                  <span className="tl-spec-v">{sel.clearanceType || '—'}</span>
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
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flexWrap: 'wrap',
                  justifyContent: 'space-between',
                }}
              >
                <div className="reg-tabs" style={{ marginTop: 0 }}>
                  {TABS.map(([id, l]) => (
                    <button
                      key={id}
                      className={'reg-tab' + (tab === id ? ' on' : '')}
                      onClick={() => setTab(id)}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                <SampleTag sample={!tabLive[tab]} />
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
