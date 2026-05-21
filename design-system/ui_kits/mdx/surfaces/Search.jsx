/**
 * Global search — Phase 8.
 *
 * Cross-corpus search across artifacts, sections, audit, AnA conversations,
 * memory atoms, notifications. ⌘K opens it; bare text searches everything,
 * `kind:` `surface:` `program:` `actor:` filters narrow.
 */

(() => {

const { I } = window;
const { SEARCH_KINDS, SEARCH_RESULTS, SEARCH_KPIS, SEARCH_SAVED } = window;

function SearchSurface({ program, onAskAna }) {
  const [query, setQuery] = React.useState('');
  const [kindFilter, setKindFilter] = React.useState('all');

  const programFilter = program?.code?.split(' ')[0] || null;
  const filtered = SEARCH_RESULTS.filter(r => {
    if (programFilter && r.program !== programFilter && r.program !== 'MDX') return false;
    if (kindFilter !== 'all' && r.kind !== kindFilter) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    return (r.title + ' ' + r.snippet + ' ' + r.program).toLowerCase().includes(q);
  });

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">System</div>
          <h1 className="page-title">Global search</h1>
          <div className="page-sub">
            Cross-corpus search across artifacts, sections, audit log, AnA conversations,
            memory atoms, and notifications. Use <span className="mono">kind:</span>{' '}
            <span className="mono">surface:</span> <span className="mono">program:</span>{' '}
            <span className="mono">actor:</span> filters.
          </div>
        </div>
        <div className="page-actions">
          <button className="btn ghost small" onClick={() => onAskAna('Save the current search as a pinned query for the team.')}>
            {I.pin} Save query
          </button>
        </div>
      </div>

      <div className="metrics-row metrics-compact">
        {SEARCH_KPIS.map((k, i) => (
          <div key={i} className="metric-card" data-tone={k.tone || ''}>
            <div className="metric-label">{k.label}</div>
            <div className="metric-val">{k.metric}{k.unit && <span className="unit">{k.unit}</span>}</div>
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
            onChange={e => setQuery(e.target.value)}
          />
          {query && (
            <button className="search-clear" onClick={() => setQuery('')}>{I.close}</button>
          )}
        </div>
      </section>

      <div className="search-grid">
        <aside className="search-rail">
          <div className="search-rail-lbl">Kind</div>
          <button className="search-kind" data-on={kindFilter === 'all'} onClick={() => setKindFilter('all')}>
            <span>All</span>
            <span className="mono small">{SEARCH_RESULTS.length}</span>
          </button>
          {SEARCH_KINDS.map(k => {
            const count = SEARCH_RESULTS.filter(r => r.kind === k.id).length;
            return (
              <button key={k.id} className="search-kind" data-on={kindFilter === k.id} onClick={() => setKindFilter(k.id)}>
                <span className="ico">{I[k.icon]}</span>
                <span>{k.label}</span>
                <span className="mono small">{count}</span>
              </button>
            );
          })}

          <div className="search-rail-lbl" style={{ marginTop: 18 }}>Saved queries</div>
          {SEARCH_SAVED.map(s => (
            <button key={s.id} className="search-saved" onClick={() => setQuery(s.q)}>
              <div className="search-saved-label">{s.label}</div>
              <div className="search-saved-q mono tiny">{s.q}</div>
            </button>
          ))}
        </aside>

        <section className="search-results">
          <div className="section-head" style={{ marginBottom: 8 }}>
            <h2>Results</h2>
            <span className="section-sub">{filtered.length} of {SEARCH_RESULTS.length} shown</span>
          </div>
          {filtered.length === 0 && (
            <div style={{ padding: '40px 24px', textAlign: 'center', background: 'var(--bg-050)', border: '1px dashed var(--border-100)', borderRadius: 8, color: 'var(--text-300)' }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>No results match your query</div>
              <div style={{ fontSize: 12 }}>Try removing a filter or broadening the search.</div>
            </div>
          )}
          {filtered.map(r => {
            const kind = SEARCH_KINDS.find(k => k.id === r.kind);
            return (
              <button
                key={r.id}
                className="search-result"
                data-kind={r.kind}
                onClick={() => onAskAna(`Open ${r.refId} (${r.title}) — surface what triggered the search match.`)}
              >
                <div className="search-result-head">
                  <span className="ico search-result-icon">{kind && I[kind.icon]}</span>
                  <span className={`search-result-kind search-kind-${r.kind}`}>{kind?.label}</span>
                  <span className="search-result-surface mono tiny">{r.surface}</span>
                  {r.program !== 'MDX' && <span className="search-result-program">{r.program}</span>}
                  <span className="search-result-when">{r.when}</span>
                </div>
                <div className="search-result-title">{r.title}</div>
                <div className="search-result-snippet">{r.snippet}</div>
                <div className="search-result-foot">
                  <span className="mono tiny" style={{ color: 'var(--text-400)' }}>{r.refId}</span>
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

window.SearchSurface = SearchSurface;

})();
