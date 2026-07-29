(() => {
/**
 * AnA memory surface — your organization's curated AnA context.
 *
 * Memory atoms are NOT free-form notes. They're rules-of-record: every
 * relevant AnA conversation references the atoms that fit its scope. The
 * surface treats them as governed artifacts:
 *   • Each atom is verified (or not), pinned (or not), categorized,
 *     importance-banded, source-linked, and version-aware (supersedes
 *     a prior atom).
 *   • Each atom has a "use count" — how often AnA grounded on it. High
 *     use = high value. Zero use = candidate for retirement.
 *   • Effects column shows what AnA actually caught / grounded / enforced
 *     today, so the user sees memory doing work, not just sitting there.
 *
 * Layout — 3 cols + an ingestion strip at bottom:
 *   • Left   — categories (count + active)
 *   • Center — atoms list
 *   • Right  — live effects + verification queue
 *   • Bottom — ingestion jobs
 */

const { I, AskAnaChip } = window;
const { MEM_CATEGORIES, MEM_IMPORTANCE, MEM_ATOMS, MEM_INGEST, MEM_EFFECTS } = window;

function MemorySurface({ onAskAna }) {
  const [cat, setCat] = React.useState('all');
  const [imp, setImp] = React.useState('all');
  const [unverifiedOnly, setUnverifiedOnly] = React.useState(false);

  const filtered = MEM_ATOMS.filter(a =>
    (cat === 'all' || a.cat === cat) &&
    (imp === 'all' || a.imp === imp) &&
    (!unverifiedOnly || !a.verified),
  );

  const totalAtoms = MEM_ATOMS.length;
  const pinnedCount = MEM_ATOMS.filter(a => a.pinned).length;
  const unverified = MEM_ATOMS.filter(a => !a.verified).length;
  const totalUseToday = MEM_EFFECTS.reduce((s, e) => s + e.count, 0);

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Intelligence</div>
          <h1 className="page-title">AnA memory</h1>
          <div className="page-sub">
            Your organization's curated AnA context. Memory atoms are rules-of-record
            pinned to every relevant conversation — style, regulatory interpretation,
            pipeline facts, past learnings.
          </div>
        </div>
        <div className="page-actions">
          <button
            className="btn ghost small"
            onClick={() => onAskAna('Walk me through this week\'s memory effects — which atoms grounded the most conversations, which got overridden, and what should be retired.')}
          >
            {I.barChart3} Memory report
          </button>
          <button
            className="btn primary small"
            onClick={() => onAskAna('Ingest a document into memory. I\'ll attach the file; you extract candidate atoms, group them by category, and queue them for verification.')}
          >
            {I.upload} Ingest source
          </button>
        </div>
      </div>

      {/* Headline metrics — but inline, more textual than card-y */}
      <div className="mem-headline">
        <div className="mem-headline-item">
          <span className="mem-headline-n">{totalAtoms}</span>
          <span className="mem-headline-l">atoms</span>
        </div>
        <div className="mem-headline-sep" />
        <div className="mem-headline-item">
          <span className="mem-headline-n">{pinnedCount}</span>
          <span className="mem-headline-l">pinned to every conversation</span>
        </div>
        <div className="mem-headline-sep" />
        <div className="mem-headline-item">
          <span className="mem-headline-n">{unverified}</span>
          <span className="mem-headline-l">awaiting verification</span>
          {unverified > 0 && <button className="chip-filter mem-headline-cta" onClick={() => setUnverifiedOnly(!unverifiedOnly)}>{unverifiedOnly ? 'Showing' : 'Review'} →</button>}
        </div>
        <div className="mem-headline-sep" />
        <div className="mem-headline-item">
          <span className="mem-headline-n">{totalUseToday}</span>
          <span className="mem-headline-l">memory effects today</span>
        </div>
      </div>

      <div className="mem-grid">
        {/* Left — categories */}
        <aside className="mem-cats">
          <div className="mem-cats-label">Category</div>
          <button className="mem-cat-row" data-on={cat === 'all'} onClick={() => setCat('all')}>
            <span className="mem-cat-dot mem-cat-all" />
            <span className="mem-cat-name">All categories</span>
            <span className="mem-cat-n mono">{MEM_ATOMS.length}</span>
          </button>
          {MEM_CATEGORIES.map(c => (
            <button key={c.id} className="mem-cat-row" data-on={cat === c.id} onClick={() => setCat(c.id)}>
              <span className={`mem-cat-dot mem-cat-${c.color}`} />
              <span className="mem-cat-name">{c.label}</span>
              <span className="mem-cat-n mono">{c.count}</span>
            </button>
          ))}

          <div className="mem-cats-label" style={{ marginTop: 18 }}>Importance</div>
          <button className="mem-cat-row small" data-on={imp === 'all'} onClick={() => setImp('all')}>
            <span className="mem-cat-name">Any</span>
            <span className="mem-cat-n mono">{MEM_ATOMS.length}</span>
          </button>
          {MEM_IMPORTANCE.map(i => (
            <button key={i.id} className="mem-cat-row small" data-on={imp === i.id} onClick={() => setImp(i.id)}>
              <span className={`mem-imp-dot mem-imp-${i.id}`} />
              <span className="mem-cat-name">{i.label}</span>
              <span className="mem-cat-n mono">{MEM_ATOMS.filter(a => a.imp === i.id).length}</span>
            </button>
          ))}

          <div className="mem-cats-label" style={{ marginTop: 18 }}>Filter</div>
          <button className="mem-cat-row small" data-on={unverifiedOnly} onClick={() => setUnverifiedOnly(!unverifiedOnly)}>
            <span className="mem-imp-dot tone-warn" />
            <span className="mem-cat-name">Unverified only</span>
            <span className="mem-cat-n mono">{unverified}</span>
          </button>
        </aside>

        {/* Center — atoms list */}
        <section className="mem-atoms">
          <div className="section-head" style={{ marginBottom: 8 }}>
            <h2>Memory atoms</h2>
            <span className="section-sub">{filtered.length} of {MEM_ATOMS.length} shown · ordered by recency × use</span>
          </div>
          {filtered.length === 0 && (
            <div className="empty-state" style={{ padding: '40px 24px', textAlign: 'center', background: 'var(--bg-050)', border: '1px dashed var(--border-100)', borderRadius: 8, color: 'var(--text-200)' }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>No atoms match your filters</div>
              <div style={{ fontSize: 12 }}>Clear filters or ingest a source to seed new memory.</div>
            </div>
          )}
          {filtered.map(a => {
            const catDef = MEM_CATEGORIES.find(c => c.id === a.cat);
            return (
              <article
                key={a.id}
                className="mem-atom"
                data-imp={a.imp}
                data-verified={a.verified}
              >
                <div className="mem-atom-rail" />
                <div className="mem-atom-body">
                  <div className="mem-atom-head">
                    <span className="mono small mem-atom-id">{a.id}</span>
                    <span className={`mem-cat-tag mem-cat-${catDef?.color || 'all'}`}>{catDef?.label}</span>
                    <span className={`mem-imp-tag mem-imp-${a.imp}`}>{MEM_IMPORTANCE.find(i => i.id === a.imp)?.label}</span>
                    {a.pinned && (
                      <span className="mem-atom-pin" title="Pinned to every relevant conversation">
                        <span className="ico">{I.pin}</span> pinned
                      </span>
                    )}
                    {!a.verified && (
                      <span className="mem-atom-unverified" title="Inferred from conversation patterns — verify or retire">
                        {I.alertCircle} unverified
                      </span>
                    )}
                    <span className="mem-atom-scope">
                      {a.scope.map(s => <span key={s} className="mono tiny mem-scope">{s}</span>)}
                    </span>
                  </div>
                  <div className="mem-atom-title">{a.title}</div>
                  <div className="mem-atom-text">{a.body}</div>
                  <div className="mem-atom-foot">
                    <span className="mem-atom-source">{I.link} {a.source}</span>
                    {a.supersedes && (
                      <span className="mem-atom-chain mono tiny" title={`Supersedes ${a.supersedes}`}>
                        ↶ {a.supersedes}
                      </span>
                    )}
                    <span className="mem-atom-use">
                      <span className="mono">{a.useCount}</span>
                      <span style={{ color: 'var(--text-400)' }}>uses · last {a.lastUsed}</span>
                    </span>
                    <div className="mem-atom-actions">
                      {!a.verified && (
                        <button className="btn ghost small" onClick={() => onAskAna(`Verify memory atom ${a.id}: "${a.title}". Confirm or refute against the source document and update the importance band.`)}>{I.check} Verify</button>
                      )}
                      <button className="btn ghost small" onClick={() => onAskAna(`Show me the last 10 conversations where atom ${a.id} fired — quote the turns and the resulting AnA output.`)}>{I.eye} Trace</button>
                      <button className="btn ghost small" onClick={() => onAskAna(`Supersede atom ${a.id} with a refined version. Walk me through what to change in title, body, importance, scope, and link the supersession.`)}>{I.pencil} Supersede</button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        {/* Right — effects + verification queue */}
        <aside className="mem-effects">
          <section className="section">
            <div className="section-head">
              <h2>Effects · today</h2>
              <span className="section-sub">What memory did</span>
            </div>
            <div className="mem-effects-list">
              {MEM_EFFECTS.map((e, i) => {
                const atom = MEM_ATOMS.find(a => a.id === e.atom);
                return (
                  <button key={i} className={`mem-effect mem-effect-${e.kind}`} onClick={() => onAskAna(`Tell me more about effect from ${e.atom}: ${e.summary}`)}>
                    <div className="mem-effect-head">
                      <span className={`mem-effect-tag mem-effect-${e.kind}`}>{e.kind}</span>
                      <span className="mono tiny" style={{ color: 'var(--text-400)' }}>{e.when}</span>
                    </div>
                    <div className="mem-effect-summary">{e.summary}</div>
                    <div className="mem-effect-foot">
                      <span className="mono tiny">{e.atom}</span>
                      <span style={{ color: 'var(--text-400)', marginLeft: 6 }}>· {atom?.title.slice(0, 64)}{atom && atom.title.length > 64 ? '…' : ''}</span>
                      <span className="mem-effect-count mono small">{e.count}×</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </aside>
      </div>

      {/* Ingestion strip */}
      <section className="section">
        <div className="section-head">
          <h2>Ingestion · sources → atoms</h2>
          <span className="section-sub">Drop a PDF or doc. AnA extracts candidate atoms. You verify.</span>
        </div>
        <div className="mem-ingest">
          {MEM_INGEST.map(j => {
            const pending = j.proposed - j.accepted - j.rejected;
            return (
              <button
                key={j.id}
                className="mem-ingest-job"
                data-state={j.state}
                onClick={() => onAskAna(`Open ingestion job ${j.id} (${j.source}). ${pending > 0 ? `${pending} atoms still need verification — walk me through them one at a time.` : 'Show me the accepted atoms and where they were filed.'}`)}
              >
                <div className="mem-ingest-head">
                  <span className="mono small">{j.id}</span>
                  <span className="dot-sep">·</span>
                  <span style={{ color: 'var(--text-400)' }}>{j.added}</span>
                  <span style={{ marginLeft: 'auto' }} className={`status-pill ${j.state === 'verified' ? 'complete' : j.state === 'in-progress' ? 'active' : 'review'}`}>{j.state}</span>
                </div>
                <div className="mem-ingest-source">{j.source}</div>
                <div className="mem-ingest-bar">
                  <div className="mem-ingest-bar-track">
                    <span className="mem-ingest-seg mem-seg-accepted" style={{ width: `${j.accepted / j.proposed * 100}%` }} />
                    <span className="mem-ingest-seg mem-seg-rejected" style={{ width: `${j.rejected / j.proposed * 100}%` }} />
                  </div>
                  <span className="mono tiny mem-ingest-bar-lbl">
                    {j.accepted} accepted · {j.rejected} rejected · {pending} pending
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}

window.MemorySurface = MemorySurface;

})();
