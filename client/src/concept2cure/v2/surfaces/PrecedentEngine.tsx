import React, { useState, useMemo, useEffect } from 'react';
import { I } from '../icons';
import { useLiveData, EmptyState } from '../dataConnect';
import { apiRequest } from '@/lib/queryClient';
import type { SurfaceViewProps } from '../surfaceViews';
import { AnswerLead } from '../AnswerLead';
import { severityTone } from '../fixtures/precedent-engine-data';
import '../styles/project-home-v2.css';

/*
 * Precedent intelligence — wired to the real precedent read-model.
 *
 * The whole board (closest precedents + risk / strategy / CRL / RTF / EMA /
 * AdComm analyses) comes from GET /api/precedent-engine-board, which the server
 * assembles from the real precedentEngine service (search + the six analyzers),
 * org-scoped and fail-closed per section. The claim check posts to the real
 * POST /api/precedent-engine/check-claim. Nothing is fabricated: `cycle` and
 * `match` are nullable on the real record and render null-safe, an empty corpus
 * shows an honest empty state, and a failed load shows an honest error — never
 * the old PE_* fixture.
 */

/* ── Live view shapes (mirror the server DTO in precedent-engine-board.ts) ── */

interface PrecedentResultView {
  clearanceNumber: string;
  deviceName: string;
  applicant: string;
  decisionDate: string;
  clearanceType: string;
  decisionOutcome: string;
  productCode: string;
  therapeuticArea: string;
  /** Review-cycle days; null when not sourceable from the service record. */
  cycle: number | null;
  /** Coarse similarity 0–1; null when the record carries no score. */
  match: number | null;
  riskFactors: string[];
  predicateKNumber: string | null;
}
interface RiskFactorView { label: string; severity: 'high' | 'medium' | 'low'; note: string }
interface RiskView { overall: string; score: number; factors: RiskFactorView[] }
interface StrategyView { recommendation: string; predicate: string; rationale: string[]; altPathways: { p: string; when: string }[] }
interface PatternView { title: string; rate: string; items: string[] }
interface PrecedentBoard {
  results: PrecedentResultView[];
  risk: RiskView;
  strategy: StrategyView;
  patterns: { crl: PatternView; rtf: PatternView; ema: PatternView; adcomm: PatternView };
}
interface ClaimView { verdict?: string; confidence?: number; note?: string; precedents?: string[] }
type AnalysisState = RiskView | StrategyView | PatternView;

interface PeQuery {
  submissionType: string;
  therapeuticArea: string;
  indication: string;
  productCode: string;
}

/* Saved queries — the real org-scoped CRUD at /api/saved-precedent-queries
   ({data} envelope; numeric ids). The full PeQuery round-trips through the
   free-text `query` column as JSON; productCode/pathway are additionally
   normalized into the structured `scope` for other consumers. */
interface SavedPeQuery { id: number; label: string; query: string; scope: Record<string, unknown> | null; }

const PATHWAY_OF: Record<string, string> = { '510(k)': '510k', 'PMA': 'pma', 'De Novo': 'de_novo' };

function parseSavedQuery(s: SavedPeQuery): PeQuery {
  try {
    const p = JSON.parse(s.query) as Partial<PeQuery>;
    if (p && typeof p === 'object' && typeof p.submissionType === 'string') {
      return {
        submissionType: p.submissionType,
        therapeuticArea: String(p.therapeuticArea ?? ''),
        indication: String(p.indication ?? ''),
        productCode: String(p.productCode ?? ''),
      };
    }
  } catch { /* fall through to the free-text mapping */ }
  return {
    submissionType: '510(k)',
    therapeuticArea: '',
    indication: s.query,
    productCode: String((s.scope as { productCode?: string } | null)?.productCode ?? ''),
  };
}

/* ════ PrecedentEngine — precedent intelligence workbench ════ */

export function PrecedentEngine({ onAsk }: SurfaceViewProps) {
  const ask = onAsk;

  const [q, setQ] = useState<PeQuery>({
    submissionType: '510(k)',
    therapeuticArea: 'Diabetes',
    indication: 'Continuous glucose monitoring -- 14-day wear',
    productCode: 'QBJ',
  });
  // The query actually sent to the board — committed on Search, so editing the
  // form does not refetch until the user runs it.
  const [applied, setApplied] = useState<PeQuery>(q);
  const [selK, setSelK] = useState<string | null>(null);
  const [tab, setTab] = useState('risk');
  const [claim, setClaim] = useState('');
  const [claimRes, setClaimRes] = useState<ClaimView | null>(null);
  const [claimBusy, setClaimBusy] = useState(false);

  // Live precedent board — GET /api/precedent-engine-board?<applied query>.
  // Changing `path` (via Search committing `applied`) refetches; the previous
  // board stays visible while the next one loads.
  const path = useMemo(() => {
    const p = new URLSearchParams();
    p.set('submissionType', applied.submissionType);
    if (applied.therapeuticArea.trim()) p.set('therapeuticArea', applied.therapeuticArea.trim());
    if (applied.indication.trim()) p.set('indication', applied.indication.trim());
    if (applied.productCode.trim()) p.set('productCode', applied.productCode.trim());
    return '/api/precedent-engine-board?' + p.toString();
  }, [applied]);
  const board = useLiveData<PrecedentBoard>(path);

  const results = board.data?.results ?? [];
  const sel = results.find((r) => r.clearanceNumber === selK) || results[0];

  const runSearch = () => setApplied(q);

  /* Saved queries — list on load; save/pin/reload/delete against the real CRUD. */
  const [saved, setSaved] = useState<SavedPeQuery[]>([]);
  const [savedNote, setSavedNote] = useState('');
  const note = (m: string) => { setSavedNote(m); setTimeout(() => setSavedNote(''), 4200); };
  useEffect(() => {
    void (async () => {
      try {
        const res = await apiRequest('GET', '/api/saved-precedent-queries/');
        const body = await res.json().catch(() => null);
        if (res.ok && Array.isArray(body?.data)) setSaved(body.data as SavedPeQuery[]);
      } catch { /* list stays empty; saving still reports its own errors */ }
    })();
  }, []);

  const saveQuery = async () => {
    const label = [q.productCode, q.submissionType, (q.indication || q.therapeuticArea).slice(0, 60)]
      .filter(Boolean).join(' · ').slice(0, 120) || 'Precedent query';
    try {
      const scope: Record<string, unknown> = {};
      if (q.productCode.trim()) scope.productCode = q.productCode.trim().slice(0, 16);
      if (PATHWAY_OF[q.submissionType]) scope.pathway = PATHWAY_OF[q.submissionType];
      const res = await apiRequest('POST', '/api/saved-precedent-queries/', {
        label, query: JSON.stringify(q), scope: Object.keys(scope).length ? scope : null,
      });
      const body = await res.json().catch(() => null);
      const row = (body?.data ?? body) as SavedPeQuery | null;
      if (!res.ok || !row?.id) { note(res.status === 401 ? 'Sign in to save queries.' : `Couldn’t save the query (HTTP ${res.status}).`); return; }
      setSaved((s) => [row, ...s.filter((x) => x.id !== row.id)]);
      note('Query saved · ' + row.label);
    } catch (e) {
      note('Couldn’t save the query — ' + (e instanceof Error ? e.message : String(e)) + '.');
    }
  };

  const applySaved = (s: SavedPeQuery) => {
    const next = parseSavedQuery(s);
    setQ(next);
    setApplied(next); // run immediately
    // Stamp lastRunAt server-side; non-blocking, the search does not wait.
    void apiRequest('PATCH', `/api/saved-precedent-queries/${s.id}`, { refresh: true }).catch(() => {});
  };

  const deleteSaved = async (id: number) => {
    try {
      const res = await apiRequest('DELETE', `/api/saved-precedent-queries/${id}`);
      if (!res.ok && res.status !== 204) { note(`Couldn’t delete the saved query (HTTP ${res.status}).`); return; }
      setSaved((s) => s.filter((x) => x.id !== id));
    } catch (e) {
      note('Couldn’t delete — ' + (e instanceof Error ? e.message : String(e)) + '.');
    }
  };

  const analysis: AnalysisState | null = useMemo(() => {
    const d = board.data;
    if (!d) return null;
    switch (tab) {
      case 'risk': return d.risk;
      case 'strategy': return d.strategy;
      case 'crl': return d.patterns.crl;
      case 'rtf': return d.patterns.rtf;
      case 'ema': return d.patterns.ema;
      case 'adcomm': return d.patterns.adcomm;
      default: return d.risk;
    }
  }, [board.data, tab]);

  // Real claim check — POST /api/precedent-engine/check-claim. No fabricated
  // verdict; a failed check surfaces nothing rather than a canned result.
  const checkClaim = async () => {
    if (!claim.trim() || claimBusy) return;
    setClaimBusy(true);
    try {
      const res = await apiRequest('POST', '/api/precedent-engine/check-claim', {
        claim: claim.trim(),
        submissionType: applied.submissionType,
        ...(applied.therapeuticArea.trim() ? { therapeuticArea: applied.therapeuticArea.trim() } : {}),
        ...(applied.indication.trim() ? { indication: applied.indication.trim() } : {}),
      });
      const body = await res.json().catch(() => null);
      setClaimRes(res.ok && body?.data ? (body.data as ClaimView) : null);
    } catch {
      setClaimRes(null);
    } finally {
      setClaimBusy(false);
    }
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
  const isRisk = (a: AnalysisState): a is RiskView => 'factors' in a && 'score' in a;
  const isStrategy = (a: AnalysisState): a is StrategyView => 'recommendation' in a;
  const isPattern = (a: AnalysisState): a is PatternView => 'items' in a && 'title' in a && !('score' in a);

  /* answer-first lead — every value guarded for the real, nullable record */
  const top = results[0] || ({} as PrecedentResultView);
  const cyc = results.map((r) => r.cycle).filter((c): c is number => typeof c === 'number');
  const lo = cyc.length ? Math.min(...cyc) : null;
  const hi = cyc.length ? Math.max(...cyc) : null;
  const topRisk =
    analysis && isRisk(analysis) && analysis.factors && analysis.factors[0] ? analysis.factors[0] : null;
  const strong = (top.match || 0) >= 0.85;

  // Four honest states on the real read-model — never a fixture.
  if (board.loading && !board.data) {
    return (
      <div className="sp" style={{ maxWidth: 1160 }}>
        <div style={{ padding: 24 }}><EmptyState title="Loading precedent intelligence…" icon={I.clock} /></div>
      </div>
    );
  }
  if (board.error && !board.data) {
    return (
      <div className="sp" style={{ maxWidth: 1160 }}>
        <div style={{ padding: 24 }}>
          <EmptyState
            tone="error"
            icon={I.alertTriangle}
            title="Couldn't load precedent intelligence"
            hint="The precedent read-model didn't respond. It's assembled live from your organization's precedent corpus and the FDA registry — sign in and retry. Nothing is shown from a cached sample."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="sp" style={{ maxWidth: 1160 }}>
      <div className="sp-head">
        <div>
          <div className="sp-eyebrow">Specialist -- /api/precedent-engine-board</div>
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
          applied.submissionType +
          (applied.indication ? ' -- ' + applied.indication.split('--')[0].trim() : '')
        }
        headline={
          strong ? (
            <>
              Citing <b>{top.clearanceNumber}</b> ({top.deviceName}) is your cleanest path --{' '}
              {results.length} devices like yours cleared
              {lo != null && hi != null ? (
                <> in about <b>{lo}--{hi} days</b></>
              ) : null}
              .
            </>
          ) : results.length === 0 ? (
            <>No cleared precedents matched this search yet -- widen the criteria or ingest a precedent.</>
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
            disabled={board.loading}
          >
            {I.search} {board.loading ? 'Searching...' : 'Search'}
          </button>
          <button className="sp-ask" onClick={saveQuery} title="Save this query for reuse">
            {I.plus} Save query
          </button>
        </div>
        {(saved.length > 0 || savedNote) && (
          <div className="pj-card-b" style={{ paddingTop: 0, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {saved.map((s) => (
              <span key={s.id} className="rd-chip tone-idle" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <button style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer' }}
                  onClick={() => applySaved(s)} title="Load and run this saved query">
                  {s.label}
                </button>
                <button style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', opacity: 0.6 }}
                  onClick={() => deleteSaved(s.id)} title="Delete saved query" aria-label={'Delete ' + s.label}>
                  ×
                </button>
              </span>
            ))}
            {savedNote && <span style={{ fontSize: 12, color: 'var(--c2c-dim,#667085)' }}>{savedNote}</span>}
          </div>
        )}
      </div>

      <div className="sp-2col" style={{ gridTemplateColumns: '1.15fr 1fr' }}>
        <div className="pj-card">
          <div className="pj-card-h">
            <span className="t">Closest precedents</span>
            <span className="s">{results.length} -- ranked by match</span>
          </div>
          <div className="pj-card-b" style={{ padding: 8 }}>
            {results.length === 0 ? (
              <EmptyState
                icon={I.search}
                title="No matching precedents"
                hint="No cleared precedents in the corpus matched this submission type and criteria. Widen the search, or ingest a precedent to seed the registry."
              />
            ) : (
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
                        (sel && sel.clearanceNumber === r.clearanceNumber)
                          ? '1px solid var(--accent-muted)'
                          : '1px solid transparent',
                      background:
                        (sel && sel.clearanceNumber === r.clearanceNumber) ? 'var(--accent-000)' : 'transparent',
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
                        {r.cycle != null ? ' -- ' + r.cycle + 'd cycle' : ''}
                      </span>
                    </span>
                    <span className="rd-chip tone-ok">{r.decisionOutcome}</span>
                    {r.match != null && <span className="pe-match">{Math.round(r.match * 100)}%</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          {sel && (
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
                      {sel.decisionOutcome}{sel.decisionDate ? ' -- ' + sel.decisionDate : ''}
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
          )}

          <div className="pj-card">
            <div className="pj-card-b">
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
              {tab === 'risk' && analysis && isRisk(analysis) && (
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
                  {analysis.factors.length === 0 ? (
                    <div className="scaf-note">No scored risk factors for this submission context yet — nothing is inferred without a real signal.</div>
                  ) : (
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
                  )}
                </div>
              )}
              {tab === 'strategy' && analysis && isStrategy(analysis) && (
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
                    <b>Recommended:</b> {analysis.recommendation}
                    {analysis.predicate ? ' -- citing ' + analysis.predicate : ''}
                  </div>
                  {analysis.rationale.length === 0 ? (
                    <div className="scaf-note">Not enough supporting precedent data to assemble a rationale — run a search that returns precedents first.</div>
                  ) : (
                    <ul className="pe-ul">
                      {analysis.rationale.map((p, i) => (
                        <li key={i}>{p}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {['crl', 'rtf', 'ema', 'adcomm'].includes(tab) && analysis && isPattern(analysis) && (
                <div>
                  <div className="pj-seclbl" style={{ marginTop: 0 }}>
                    {analysis.title}
                  </div>
                  {analysis.items.length === 0 ? (
                    <div className="scaf-note">No {analysis.title.toLowerCase()} surfaced for this context — the analyzer found no matching pattern rather than inventing one.</div>
                  ) : (
                    <ul className="pe-ul">
                      {analysis.items.map((p, i) => (
                        <li key={i}>{p}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="pj-card" style={{ marginTop: 14 }}>
        <div className="pj-card-h">
          <span className="t">Real-time claim check</span>
          <span className="s">POST /api/precedent-engine/check-claim</span>
        </div>
        <div className="pj-card-b">
          <div className="tl-edit" style={{ marginTop: 0 }}>
            <span className="tl-edit-ic">{I.sparkles}</span>
            <input
              aria-label="Claim to check against precedent"
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
              aria-label="Check this claim against precedent"
              onClick={checkClaim}
              disabled={!claim.trim() || claimBusy}
            >
              {I.arrowUp}
            </button>
          </div>
          {claimRes && (
            <div className="gri-result" style={{ marginTop: 12 }}>
              <div className="gri-result-hdr">
                <span className="t">
                  {claimRes.verdict === 'supported' ? 'Supported' : 'Needs support'}
                  {typeof claimRes.confidence === 'number' ? ' -- ' + Math.round(claimRes.confidence * 100) + '%' : ''}
                </span>
              </div>
              <div className="gri-result-body">
                {claimRes.note && (
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
                )}
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
