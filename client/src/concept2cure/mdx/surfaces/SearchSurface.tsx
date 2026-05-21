/**
 * SearchSurface — Phase 8 global search.
 *
 * Cross-corpus search across artifacts, sections, audit log, AnA
 * conversations, memory atoms, and notifications. ⌘K opens it; bare
 * text searches everything, `kind:` `surface:` `program:` `actor:`
 * filters narrow.
 *
 * Cross-program. Port basis:
 * design-system/ui_kits/mdx/surfaces/Search.jsx.
 */

import * as React from 'react';
import { I, type IconKey } from '../icons';
import {
  SEARCH_KINDS,
  SEARCH_KPIS,
  SEARCH_RESULTS,
  SEARCH_SAVED,
} from '../data/search';
import { useSearch } from '../hooks/useSearch';
import type { Program } from '../data/programs';

export interface SearchSurfaceProps {
  program: Program | null;
  onAskAna: (text: string, opts?: { tool?: string }) => void;
}

export function SearchSurface({ program, onAskAna }: SearchSurfaceProps) {
  const [query, setQuery] = React.useState('');
  const [kindFilter, setKindFilter] = React.useState<string>('all');

  const live = useSearch({
    q: query || undefined,
    kind: kindFilter !== 'all' ? kindFilter : undefined,
    program: program?.code,
  });
  const results = live.results ?? SEARCH_RESULTS;
  const kinds = live.kinds ?? SEARCH_KINDS;
  const kpis = live.kpis ?? SEARCH_KPIS;
  const saved = live.saved ?? SEARCH_SAVED;

  const programFilter = program?.code?.split(' ')[0] ?? null;

  /* Apply filter logic client-side so fixture mode renders consistently
     with future live mode. */
  const filtered = results.filter((r) => {
    if (programFilter && r.program !== programFilter && r.program !== 'MDX')
      return false;
    if (kindFilter !== 'all' && r.kind !== kindFilter) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    return `${r.title} ${r.snippet} ${r.program}`.toLowerCase().includes(q);
  });

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">System</div>
          <h1 className="page-title">Global search</h1>
          <div className="page-sub">
            Cross-corpus search across artifacts, sections, audit log, AnA
            conversations, memory atoms, and notifications. Use{' '}
            <span className="mono">kind:</span>{' '}
            <span className="mono">surface:</span>{' '}
            <span className="mono">program:</span>{' '}
            <span className="mono">actor:</span> filters.
          </div>
        </div>
        <div className="page-actions">
          <button
            className="btn ghost small"
            onClick={() =>
              onAskAna('Save the current search as a pinned query for the team.')
            }
            type="button"
          >
            {I.pin} Save query
          </button>
        </div>
      </div>

      <div className="metrics-row metrics-compact">
        {kpis.map((k, i) => (
          <div key={i} className="metric-card" data-tone={k.tone ?? ''}>
            <div className="metric-label">{k.label}</div>
            <div className="metric-val">{k.metric}</div>
            <div className="metric-meta">{k.meta}</div>
          </div>
        ))}
      </div>

      <section className="section">
        <div className="search-input">
          <span className="ico">{I.search}</span>
          <input
            autoFocus
            placeholder="Search across the entire corpus…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search the corpus"
          />
          {query && (
            <button
              className="search-clear"
              onClick={() => setQuery('')}
              type="button"
              aria-label="Clear search"
            >
              {I.close}
            </button>
          )}
        </div>
      </section>

      <div className="search-grid">
        <aside className="search-rail">
          <div className="search-rail-lbl">Kind</div>
          <button
            className="search-kind"
            data-on={kindFilter === 'all' || undefined}
            onClick={() => setKindFilter('all')}
            type="button"
          >
            <span>All</span>
            <span className="mono small">{results.length}</span>
          </button>
          {kinds.map((k) => {
            const count = results.filter((r) => r.kind === k.id).length;
            const iconNode = I[k.icon as IconKey];
            return (
              <button
                key={k.id}
                className="search-kind"
                data-on={kindFilter === k.id || undefined}
                onClick={() => setKindFilter(k.id)}
                type="button"
              >
                <span className="ico">{iconNode}</span>
                <span>{k.label}</span>
                <span className="mono small">{count}</span>
              </button>
            );
          })}

          <div className="search-rail-lbl" style={{ marginTop: 18 }}>
            Saved queries
          </div>
          {saved.map((s) => (
            <button
              key={s.id}
              className="search-saved"
              onClick={() => setQuery(s.q)}
              type="button"
            >
              <div className="search-saved-label">{s.label}</div>
              <div className="search-saved-q mono tiny">{s.q}</div>
            </button>
          ))}
        </aside>

        <section className="search-results">
          <div className="section-head" style={{ marginBottom: 8 }}>
            <h2>Results</h2>
            <span className="section-sub">
              {filtered.length} of {results.length} shown
            </span>
          </div>
          {filtered.length === 0 && (
            <div
              style={{
                padding: '40px 24px',
                textAlign: 'center',
                background: 'var(--bg-050)',
                border: '1px dashed var(--border-100)',
                borderRadius: 8,
                color: 'var(--text-300)',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                No results match your query
              </div>
              <div style={{ fontSize: 12 }}>
                Try removing a filter or broadening the search.
              </div>
            </div>
          )}
          {filtered.map((r) => {
            const kind = kinds.find((k) => k.id === r.kind);
            const kindIcon = kind ? I[kind.icon as IconKey] : null;
            return (
              <button
                key={r.id}
                className="search-result"
                data-kind={r.kind}
                onClick={() =>
                  onAskAna(
                    `Open ${r.refId} (${r.title}) — surface what triggered the search match.`,
                  )
                }
                type="button"
              >
                <div className="search-result-head">
                  <span className="ico search-result-icon">{kindIcon}</span>
                  <span className={`search-result-kind search-kind-${r.kind}`}>
                    {kind?.label}
                  </span>
                  <span className="search-result-surface mono tiny">
                    {r.surface}
                  </span>
                  {r.program !== 'MDX' && (
                    <span className="search-result-program">{r.program}</span>
                  )}
                  <span className="search-result-when">{r.when}</span>
                </div>
                <div className="search-result-title">{r.title}</div>
                <div className="search-result-snippet">{r.snippet}</div>
                <div className="search-result-foot">
                  <span
                    className="mono tiny"
                    style={{ color: 'var(--text-400)' }}
                  >
                    {r.refId}
                  </span>
                  <span className="dot-sep">·</span>
                  <span style={{ color: 'var(--text-400)' }}>{r.author}</span>
                </div>
              </button>
            );
          })}
        </section>
      </div>
    </>
  );
}
