/**
 * ProjectNotifications — bell-icon right sheet, project-scoped feed.
 * Mirror of design-system/ui_kits/home/ProjectsExtras.jsx (lines 595–656).
 */
import { useEffect, useState } from 'react';
import { I } from '../icons';
import { PNOT_NOTIFS } from '../data';
import type { Project } from '../types';

interface Props {
  open: boolean;
  onClose: () => void;
  projects: Project[];
  onOpenProject: (id: string) => void;
}

export function ProjectNotifications({ open, onClose, projects, onOpenProject }: Props) {
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const visible = filter === 'unread' ? PNOT_NOTIFS.filter(n => n.unread) : PNOT_NOTIFS;
  const unreadN = PNOT_NOTIFS.filter(n => n.unread).length;
  const projectCount = new Set(PNOT_NOTIFS.map(n => n.project)).size;

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
                        onClick={() => onOpenProject(p.id)}
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
          <button type="button" className="pnot-foot-btn">Mark all as read</button>
          <span className="pnot-foot-spacer" />
          <button type="button" className="pnot-foot-btn">Notification settings</button>
        </footer>
      </div>
    </div>
  );
}
