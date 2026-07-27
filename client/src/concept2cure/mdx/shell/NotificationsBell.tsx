/**
 * NotificationsBell — the shell bell, made real.
 *
 * Replaces a dead `<button title="Notifications">` that rendered the
 * bell glyph and did nothing, while `/api/mdx/notifications` served a
 * complete feed with no consumer. The badge shows the live unread
 * count; the dropdown lists notifications and lets the user mark one —
 * or all — read, through the governed endpoints.
 *
 * Severity is shown honestly: a `critical` notification (an MDR clock
 * crossing a deadline, a supplier certificate lapse) reads red, not the
 * same grey as an informational one.
 */

import * as React from 'react';
import { I } from '../icons';
import { DataGate } from '../components/DataGate';
import { useNotifications } from '../hooks/useNotifications';

export function NotificationsBell() {
  const notif = useNotifications();
  const ref = React.useRef<HTMLDivElement>(null);

  /* Close on outside click / Escape — standard popover behaviour, kept
     local so the bell is a drop-in for the old button slot. */
  React.useEffect(() => {
    if (!notif.open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) notif.setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') notif.setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [notif.open, notif]);

  const badge = notif.unread > 0 ? (notif.unread > 99 ? '99+' : String(notif.unread)) : null;

  return (
    <div className="tb-notif" ref={ref}>
      <button
        className="tb-btn"
        title={notif.unread > 0 ? `Notifications — ${notif.unread} unread` : 'Notifications'}
        aria-label={notif.unread > 0 ? `Notifications, ${notif.unread} unread` : 'Notifications'}
        aria-expanded={notif.open}
        onClick={() => notif.setOpen(!notif.open)}
      >
        {I.bell}
        {badge && <span className="tb-notif-badge" aria-hidden>{badge}</span>}
      </button>

      {notif.open && (
        <div className="tb-notif-panel" role="dialog" aria-label="Notifications">
          <div className="tb-notif-head">
            <span className="tb-notif-title">Notifications</span>
            {notif.unread > 0 && (
              <button className="tb-notif-allread" onClick={() => void notif.markAllRead()}>
                Mark all read
              </button>
            )}
          </div>

          <DataGate
            state={notif.items}
            label="notifications"
            onRetry={notif.refresh}
            dense
            emptyHint="You're all caught up."
          >
            {(rows) => (
              <ul className="tb-notif-list">
                {rows.map((n) => (
                  <li
                    key={n.id}
                    className={`tb-notif-row${n.readAt ? '' : ' unread'}`}
                    data-sev={n.severity}
                  >
                    <span className={`tb-notif-dot sev-${n.severity}`} aria-hidden />
                    <div className="tb-notif-body">
                      <div className="tb-notif-row-title">{n.title}</div>
                      {n.body && <div className="tb-notif-row-text">{n.body}</div>}
                    </div>
                    {!n.readAt && (
                      <button
                        className="tb-notif-read"
                        title="Mark read"
                        aria-label={`Mark "${n.title}" read`}
                        onClick={() => void notif.markRead(n.id)}
                      >
                        {I.check}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </DataGate>
        </div>
      )}
    </div>
  );
}
