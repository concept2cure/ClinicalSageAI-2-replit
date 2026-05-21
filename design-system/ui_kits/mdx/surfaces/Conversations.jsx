/**
 * AnA conversation history — Phase 8.
 *
 * Threaded per-program record of every AnA conversation. Search, pin,
 * export-to-PDF for the regulatory record. Lineage from artifact audit
 * entries back to the conversation that produced the draft.
 */

(() => {

const { I } = window;
const { CONV_KPIS, CONVERSATIONS, CONV_FILTERS } = window;

function ConversationsSurface({ program, onAskAna }) {
  const [filter, setFilter] = React.useState('all');
  const [selected, setSelected] = React.useState(CONVERSATIONS[0].id);

  const programFilter = program?.code?.split(' ')[0] || null;
  const visible = CONVERSATIONS.filter(c => {
    if (programFilter && c.program !== programFilter) return false;
    if (filter === 'pinned')  return c.pinned;
    if (filter === 'today')   return c.lastActive.endsWith('h ago') || c.lastActive === 'just now';
    if (filter === 'drafted') return c.draftedDocs > 0;
    return true;
  });
  const sel = CONVERSATIONS.find(c => c.id === selected) || visible[0];

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Intelligence</div>
          <h1 className="page-title">AnA conversation history</h1>
          <div className="page-sub">
            Threaded record of every AnA conversation across the portfolio.
            Pin, search, export for the regulatory record. Each draft traces back to the turn that produced it.
          </div>
        </div>
        <div className="page-actions">
          <button className="btn ghost small" onClick={() => onAskAna('Export all conversations involving CV-330 in Q2 as a signed PDF dossier for the regulatory record.')}>
            {I.download} Export dossier
          </button>
          <button className="btn primary small" onClick={() => onAskAna('Pin the selected conversation as canonical — it becomes a permanent reference attached to its program.')}>
            {I.pin} Pin selected
          </button>
        </div>
      </div>

      <div className="metrics-row metrics-compact">
        {CONV_KPIS.map((k, i) => (
          <div key={i} className="metric-card" data-tone={k.tone || ''}>
            <div className="metric-label">{k.label}</div>
            <div className="metric-val">{k.metric}{k.unit && <span className="unit">{k.unit}</span>}</div>
            <div className="metric-meta">{k.meta}</div>
          </div>
        ))}
      </div>

      <div className="conv-grid">
        {/* Threaded list */}
        <section className="section">
          <div className="section-head">
            <h2>Threads</h2>
            <div className="seg small">
              {CONV_FILTERS.map(f => (
                <button key={f.id} className="seg-btn" data-on={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</button>
              ))}
            </div>
            <span className="section-sub">{visible.length} of {CONVERSATIONS.length} shown</span>
          </div>
          <div className="conv-list">
            {visible.map(c => (
              <button
                key={c.id}
                className="conv-row"
                data-on={selected === c.id}
                onClick={() => setSelected(c.id)}
              >
                <div className="conv-row-head">
                  <span className="conv-row-program">{c.program}</span>
                  <span className="dot-sep">·</span>
                  <span className="conv-row-surface mono tiny">{c.surface}</span>
                  {c.pinned && <span className="conv-pinned">{I.pin} pinned</span>}
                  <span className="conv-when" style={{ marginLeft: 'auto' }}>{c.lastActive}</span>
                </div>
                <div className="conv-row-topic">{c.topic}</div>
                <div className="conv-row-meta">
                  <span>{c.turns} turns</span>
                  <span className="dot-sep">·</span>
                  <span>{c.participants.join(' · ')}</span>
                  {c.draftedDocs > 0 && <><span className="dot-sep">·</span><span style={{ color: 'var(--accent-200)', fontWeight: 600 }}>produced {c.draftedDocs} draft{c.draftedDocs > 1 ? 's' : ''}</span></>}
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Selected conversation summary */}
        {sel && (
          <aside className="conv-detail">
            <div className="conv-detail-head">
              <div className="conv-detail-eyebrow">{sel.program} · {sel.surface}</div>
              <div className="conv-detail-topic">{sel.topic}</div>
            </div>
            <div className="drawer-meta">
              <div><div className="k">Turns</div><div className="v mono">{sel.turns}</div></div>
              <div><div className="k">Participants</div><div className="v">{sel.participants.join(' · ')}</div></div>
              <div><div className="k">Last active</div><div className="v">{sel.lastActive}</div></div>
              <div><div className="k">Drafts produced</div><div className="v">{sel.draftedDocs}</div></div>
            </div>
            <div className="drawer-section-lbl">Conversation summary</div>
            <div className="conv-detail-summary">{sel.summary}</div>
            <div className="drawer-actions">
              <button className="btn primary small" onClick={() => onAskAna(`Open conversation ${sel.id} in full · show every turn with citations and any drafts it produced.`)}>
                {I.eye} Open full thread
              </button>
              <button className="btn ghost small" onClick={() => onAskAna(`Trace from conversation ${sel.id} to every audit-log entry it produced.`)}>
                {I.link} Trace lineage
              </button>
            </div>
          </aside>
        )}
      </div>
    </>
  );
}

window.ConversationsSurface = ConversationsSurface;

})();
