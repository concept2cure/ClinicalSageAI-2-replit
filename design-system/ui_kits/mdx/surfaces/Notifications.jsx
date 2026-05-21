/**
 * Notifications inbox — Phase 5
 *
 * Cross-surface signal feed. Inbox-style list with kind filter chips,
 * unread vs. all toggle, and a "rules" tab for mute/route configuration.
 */

(() => {

const { I } = window;
const { NOTIF_KINDS, NOTIF_KPIS, NOTIFS } = window;

function NotificationsSurface({ onAskAna }) {
  const [kindFilter, setKindFilter] = React.useState('all');
  const [unreadOnly, setUnreadOnly] = React.useState(false);

  const filtered = NOTIFS.filter(n =>
    (kindFilter === 'all' || n.kind === kindFilter) &&
    (!unreadOnly || n.unread)
  );

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">System</div>
          <h1 className="page-title">Notifications</h1>
          <div className="page-sub">
            Cross-surface signal feed — overdue items, gate failures, AnA drafts,
            vigilance signals, Q-Sub feedback, CAPA escalations, access changes.
          </div>
        </div>
        <div className="page-actions">
          <button className="btn ghost small" onClick={() => onAskAna('Configure notification rules — which kinds to mute, which to escalate, who to route to.')}>
            {I.sliders} Mute rules
          </button>
          <button className="btn primary small" onClick={() => onAskAna('Mark all visible notifications as read and surface anything that still needs action.')}>
            {I.check} Mark all read
          </button>
        </div>
      </div>

      <div className="metrics-row metrics-compact">
        {NOTIF_KPIS.map((k, i) => (
          <div key={i} className="metric-card" data-tone={k.tone || ''}>
            <div className="metric-label">{k.label}</div>
            <div className="metric-val">{k.metric}</div>
            <div className="metric-meta">{k.meta}</div>
          </div>
        ))}
      </div>

      <section className="section">
        <div className="section-head">
          <h2>Inbox</h2>
          <div className="seg small">
            <button className="seg-btn" data-on={!unreadOnly} onClick={() => setUnreadOnly(false)}>All ({NOTIFS.length})</button>
            <button className="seg-btn" data-on={unreadOnly} onClick={() => setUnreadOnly(true)}>Unread ({NOTIFS.filter(n => n.unread).length})</button>
          </div>
          <div className="seg small" style={{ marginLeft: 8 }}>
            <button className="seg-btn" data-on={kindFilter === 'all'} onClick={() => setKindFilter('all')}>All kinds</button>
            {NOTIF_KINDS.slice(0, 5).map(k => (
              <button key={k.id} className="seg-btn" data-on={kindFilter === k.id} onClick={() => setKindFilter(k.id)}>{k.label}</button>
            ))}
          </div>
        </div>
        <div className="notif-list">
          {filtered.map(n => {
            const kind = NOTIF_KINDS.find(k => k.id === n.kind);
            return (
              <button
                key={n.id}
                className="notif-row"
                data-unread={n.unread}
                data-tone={kind?.tone || 'info'}
                onClick={() => onAskAna(`Open notification ${n.id} — ${n.title}. ${n.body} Walk me through the action: ${n.cta}.`)}
              >
                {n.unread && <span className="notif-unread-dot" />}
                <div className="notif-body">
                  <div className="notif-head">
                    <span className={`notif-kind-tag notif-kind-${n.kind}`}>{kind?.label}</span>
                    <span className="notif-surface mono tiny">{n.surface}</span>
                    <span className="notif-ref mono small">{n.ref}</span>
                    <span className="notif-when">{n.when}</span>
                  </div>
                  <div className="notif-title">{n.title}</div>
                  <div className="notif-text">{n.body}</div>
                </div>
                <div className="notif-cta">
                  <span>{n.cta}</span>
                  <span className="arr">{I.arrowRight}</span>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}

window.NotificationsSurface = NotificationsSurface;

})();
