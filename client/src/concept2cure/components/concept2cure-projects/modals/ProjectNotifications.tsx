/**
 * ProjectNotifications — bell-icon right sheet, project-scoped feed.
 * Mirror of design-system/ui_kits/home/ProjectsExtras.jsx (lines 595–656).
 */
import { useEffect, useMemo, useState } from 'react';
import { I } from '../icons';
import { PNOT_NOTIFS } from '../data';
import type { Project } from '../types';

const READ_IDS_KEY = 'concept2cure.notifications.readIds.v1';

function loadReadIds(): Set<string> {
  if (typeof localStorage === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(READ_IDS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch { return new Set(); }
}

function persistReadIds(ids: Set<string>) {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(READ_IDS_KEY, JSON.stringify([...ids])); } catch { /* quota */ }
}

interface Props {
  open: boolean;
  onClose: () => void;
  projects: Project[];
  onOpenProject: (id: string) => void;
}

export function ProjectNotifications({ open, onClose, projects, onOpenProject }: Props) {
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [readIds, setReadIds] = useState<Set<string>>(() => loadReadIds());
  const [confirmingReset, setConfirmingReset] = useState(false);

  const notifications = useMemo(
    () => PNOT_NOTIFS.map(n => ({ ...n, unread: n.unread && !readIds.has(n.id) })),
    [readIds],
  );

  const markAllRead = () => {
    const next = new Set(readIds);
    for (const n of PNOT_NOTIFS) next.add(n.id);
    setReadIds(next);
    persistReadIds(next);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const visible = filter === 'unread' ? notifications.filter(n => n.unread) : notifications;
  const unreadN = notifications.filter(n => n.unread).length;
  const projectCount = new Set(notifications.map(n => n.project)).size;

  return (
    <div className="pnot" role="dialog" aria-label="Notifications">
      <div className="pnot-scrim" onClick={onClose} />
      <div className="pnot-shell">
        <header className="pnot-head">
          <div>
            <h2 className="pnot-title">Notifications</h2>
            <p className="pnot-sub">{unreadN} unread · across {projectCount} projects</p>
          </div>
          <div className="pnot-head-r">
            <div className="pnot-tabs">
              <button
                type="button"
                className={`pnot-tab ${filter === 'all' ? 'is-on' : ''}`}
                onClick={() => setFilter('all')}
              >
                All
              </button>
              <button
                type="button"
                className={`pnot-tab ${filter === 'unread' ? 'is-on' : ''}`}
                onClick={() => setFilter('unread')}
              >
                Unread {unreadN > 0 && <span className="pnot-tab-c">{unreadN}</span>}
              </button>
            </div>
            <button type="button" className="prj-icon-btn" onClick={onClose} title="Close">
              {I.close}
            </button>
          </div>
        </header>

        <ul className="pnot-list">
          {visible.length === 0 && <li className="pnot-empty">You're all caught up.</li>}
          {visible.map(n => {
            const p = projects.find(x => x.id === n.project);
            return (
              <li key={n.id} className={`pnot-row ${n.unread ? 'is-unread' : ''}`}>
                <span className="pnot-row-ico" data-kind={n.kind}>{I[n.icon] ?? null}</span>
                <div className="pnot-row-body">
                  <div className="pnot-row-title">{n.title}</div>
                  <div className="pnot-row-sub">{n.sub}</div>
                  <div className="pnot-row-meta">
                    <span className="pnot-row-when">{n.when}</span>
                    {p && (
                      <button
                        type="button"
                        className="pnot-row-project"
                        onClick={() => {
                          const next = new Set(readIds);
                          next.add(n.id);
                          setReadIds(next);
                          persistReadIds(next);
                          onOpenProject(p.id);
                        }}
                      >
                        {p.name}
                      </button>
                    )}
                  </div>
                </div>
                {n.unread && <span className="pnot-unread-dot" aria-label="Unread" />}
              </li>
            );
          })}
        </ul>

        <footer className="pnot-foot">
          <button
            type="button"
            className="pnot-foot-btn"
            onClick={markAllRead}
            disabled={unreadN === 0}
          >
            Mark all as read
          </button>
          <span className="pnot-foot-spacer" />
          {confirmingReset ? (
            <>
              <span className="pnot-foot-confirm">Reset all to unread?</span>
              <button type="button" className="pnot-foot-btn" onClick={() => setConfirmingReset(false)}>Cancel</button>
              <button type="button" className="pnot-foot-btn" onClick={() => {
                setReadIds(new Set());
                persistReadIds(new Set());
                setConfirmingReset(false);
              }}>Reset</button>
            </>
          ) : (
            <button
              type="button"
              className="pnot-foot-btn"
              onClick={() => setConfirmingReset(true)}
              title="Reset read/unread state"
            >
              Notification settings
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
