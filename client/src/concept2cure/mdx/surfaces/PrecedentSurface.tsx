/**
 * Precedent Intelligence — saved queries + cross-portfolio insights.
 * Ported from Surfaces.jsx > PrecedentSurface, wired to live data via:
 *   /api/saved-precedent-queries          (CRUD)
 *   /api/regulatory-programs/portfolio-insights
 */

import * as React from 'react';
import { I } from '../icons';
import { useSavedPrecedentQueries, usePortfolioInsights } from '../hooks/usePrecedent';

export interface PrecedentSurfaceProps {
  onAskAna: (text: string) => void;
}

export function PrecedentSurface({ onAskAna }: PrecedentSurfaceProps) {
  const saved = useSavedPrecedentQueries();
  const insights = usePortfolioInsights();
  const [newLabel, setNewLabel] = React.useState('');
  const [newQuery, setNewQuery] = React.useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newLabel.trim() && newQuery.trim()) {
      await saved.create({ label: newLabel.trim(), query: newQuery.trim() });
      setNewLabel('');
      setNewQuery('');
    }
  };

  return (
    <>
      <div className="section-hdr">
        <div>
          <div className="section-title">Precedent intelligence</div>
          <div className="section-sub">
            Cross-pathway predicate and precedent search across FDA, EMA and PMDA
          </div>
        </div>
      </div>
      <div className="col2">
        <div className="panel">
          <div className="panel-hdr">
            <div>
              <div className="t">Saved queries</div>
              <div className="s">
                {saved.queries
                  ? `${saved.queries.length} saved · personal + org-shared`
                  : 'Loading…'}
              </div>
            </div>
          </div>

          <div className="estar">
            {saved.loading && saved.queries === null && (
              <div className="estar-row" style={{ color: 'var(--text-300)' }}>
                <div className="estar-num">··</div>
                <div className="estar-label">Loading saved queries…</div>
              </div>
            )}

            {!saved.loading && saved.queries === null && (
              <div className="estar-row" style={{ color: 'var(--text-300)' }}>
                <div className="estar-num">--</div>
                <div className="estar-label">
                  Saved queries are unavailable right now. Retry shortly — your pinned searches are not lost.
                </div>
              </div>
            )}

            {saved.queries?.length === 0 && (
              <div className="estar-row" style={{ color: 'var(--text-300)' }}>
                <div className="estar-num">00</div>
                <div className="estar-label">
                  No saved queries yet — pin a search below to start tracking hit counts.
                </div>
              </div>
            )}

            {saved.queries?.map((p, i) => (
              <div key={p.id} className="estar-row">
                <div className="estar-num">{String(i + 1).padStart(2, '0')}</div>
                <div className="estar-label">
                  <div>{p.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-400)', marginTop: 2 }}>
                    {p.query}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--text-300)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {p.hits === -1 ? 'not yet run' : `${p.hits.toLocaleString()} hits`}
                </span>
                <button
                  className="tb-btn"
                  title="Run search"
                  onClick={() =>
                    onAskAna(
                      `Run the precedent search "${p.label}" — query: ${p.query}. ` +
                        `Return matching K-numbers and any pattern shifts since I last ran this.`,
                    )
                  }
                  style={{ marginLeft: 8 }}
                >
                  {I.sparkles}
                </button>
                <button
                  className="tb-btn"
                  title="Remove saved query"
                  onClick={() => saved.remove(p.id)}
                  style={{ marginLeft: 4 }}
                >
                  {I.x}
                </button>
              </div>
            ))}
          </div>

          <form
            onSubmit={handleCreate}
            style={{
              padding: 12,
              borderTop: '1px solid var(--bd-100)',
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <input
              type="text"
              placeholder="Label (e.g. CGM 14-day wear)"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              style={{
                flex: '1 1 160px',
                padding: '6px 8px',
                fontSize: 12,
                border: '1px solid var(--bd-100)',
                borderRadius: 6,
              }}
            />
            <input
              type="text"
              placeholder="Search query"
              value={newQuery}
              onChange={(e) => setNewQuery(e.target.value)}
              style={{
                flex: '2 1 220px',
                padding: '6px 8px',
                fontSize: 12,
                border: '1px solid var(--bd-100)',
                borderRadius: 6,
              }}
            />
            <button type="submit" className="btn primary small">
              {I.plus} Pin
            </button>
          </form>
        </div>
        <div className="panel">
          <div className="panel-hdr">
            <div>
              <div className="t">Cross-agency precedent patterns</div>
              <div className="s">Derived from your portfolio</div>
            </div>
          </div>
          <div
            className="panel-body pad"
            style={{ fontSize: 12, color: 'var(--text-200)', lineHeight: 1.6 }}
          >
            {insights.loading && (
              <p style={{ margin: 0, color: 'var(--text-300)' }}>Computing insights…</p>
            )}
            {!insights.loading && insights.insights && (
              <>
                <p style={{ margin: '0 0 12px' }}>Patterns from your portfolio:</p>
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: 18,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  {insights.insights.map((insight, i) => (
                    <li key={i}>{insight.body}</li>
                  ))}
                </ul>
              </>
            )}
            {!insights.loading && !insights.insights && (
              <p style={{ margin: 0, color: 'var(--text-300)' }}>
                Insights are unavailable right now.
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
