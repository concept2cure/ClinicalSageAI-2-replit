/**
 * NotificationsSurface — Phase 5 inbox.
 *
 * Cross-surface signal feed: overdue items, gate failures, AnA drafts,
 * vigilance signals, Q-Sub feedback, CAPA escalations, access changes.
 * Inbox-style list with kind filter chips + unread toggle.
 *
 * Cross-program. Port basis:
 * design-system/ui_kits/mdx/surfaces/Notifications.jsx.
 */

import * as React from 'react';
import { I } from '../icons';
import { NOTIFS, NOTIF_KINDS, NOTIF_KPIS } from '../data/notifications';
import { useNotifications } from '../hooks/useNotifications';

export interface NotificationsSurfaceProps {
  onAskAna: (text: string, opts?: { tool?: string }) => void;
}

export function NotificationsSurface({ onAskAna }: NotificationsSurfaceProps) {
  const [kindFilter, setKindFilter] = React.useState<string>('all');
  const [unreadOnly, setUnreadOnly] = React.useState(false);

  const live = useNotifications({
    unread: unreadOnly || undefined,
    kind: kindFilter !== 'all' ? kindFilter : undefined,
  });
  const notifications = live.notifications ?? NOTIFS;
  const kinds = live.kinds ?? NOTIF_KINDS;
  const kpis = live.kpis ?? NOTIF_KPIS;

  /* Apply filters client-side as well so fixture mode behaves
     consistently with live mode. */
  const filtered = notifications.filter(
    (n) =>
      (kindFilter === 'all' || n.kind === kindFilter) &&
      (!unreadOnly || n.unread),
  );

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">System</div>
          <h1 className="page-title">Notifications</h1>
          <div className="page-sub">
            Cross-surface signal feed — overdue items, gate failures, AnA
            drafts, vigilance signals, Q-Sub feedback, CAPA escalations,
            access changes.
          </div>
        </div>
        <div className="page-actions">
          <button
            className="btn ghost small"
            onClick={() =>
              onAskAna(
                'Configure notification rules — which kinds to mute, which to escalate, who to route to.',
              )
            }
            type="button"
          >
            {I.sliders} Mute rules
          </button>
          <button
            className="btn primary small"
            onClick={() =>
              onAskAna(
                'Mark all visible notifications as read and surface anything that still needs action.',
              )
            }
            type="button"
          >
            {I.check} Mark all read
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
        <div className="section-head">
          <h2>Inbox</h2>
          <div className="seg small">
            <button
              className="seg-btn"
              data-on={!unreadOnly || undefined}
              onClick={() => setUnreadOnly(false)}
              type="button"
            >
              All ({notifications.length})
            </button>
            <button
              className="seg-btn"
              data-on={unreadOnly || undefined}
              onClick={() => setUnreadOnly(true)}
              type="button"
            >
              Unread ({notifications.filter((n) => n.unread).length})
            </button>
          </div>
          <div className="seg small" style={{ marginLeft: 8 }}>
            <button
              className="seg-btn"
              data-on={kindFilter === 'all' || undefined}
              onClick={() => setKindFilter('all')}
              type="button"
            >
              All kinds
            </button>
            {kinds.slice(0, 5).map((k) => (
              <button
                key={k.id}
                className="seg-btn"
                data-on={kindFilter === k.id || undefined}
                onClick={() => setKindFilter(k.id)}
                type="button"
              >
                {k.label}
              </button>
            ))}
          </div>
        </div>
        <div className="notif-list">
          {filtered.map((n) => {
            const kind = kinds.find((k) => k.id === n.kind);
            return (
              <button
                key={n.id}
                className="notif-row"
                data-unread={n.unread || undefined}
                data-tone={kind?.tone ?? 'info'}
                onClick={() =>
                  onAskAna(
                    `Open notification ${n.id} — ${n.title}. ${n.body} Walk me through the action: ${n.cta}.`,
                  )
                }
                type="button"
              >
                {n.unread && <span className="notif-unread-dot" />}
                <div className="notif-body">
                  <div className="notif-head">
                    <span className={`notif-kind-tag notif-kind-${n.kind}`}>
                      {kind?.label}
                    </span>
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
