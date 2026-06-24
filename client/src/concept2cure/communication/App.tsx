/**
 * CommunicationApp — the regulated-handoff hub shell.
 *
 * Rail + TopBar + TabBar + surface router + AnA dock, mirroring the tasking
 * shell idioms and reusing the mdx shell chrome (.shell / .rail / .topbar /
 * .tabbar / .ana-seam). Three surfaces, all live: review queue (tasks in
 * `review`), pending e-sign approvals, and the 21 CFR Part 11 audit trail.
 *
 * Org-scoped — approvals are per-user/org, the review queue is org-wide with a
 * mine/everyone toggle, and the audit chain is org-scoped server-side. No
 * project id is required to open the hub.
 *
 * @module client/src/concept2cure/communication/App
 */

import * as React from 'react';
import { I } from '../mdx/icons';
import { COMM_TABS, HERE_LABEL_COMM, COMM_SUGGESTIONS } from './data/nav';
import { CommReviewQueue } from './surfaces/ReviewQueue';
import { CommApprovals } from './surfaces/Approvals';
import { CommAuditTimeline } from './surfaces/AuditTimeline';
import { useAnaChat } from '../components/ana/useAnaChat';

const USER = { name: 'You', initials: 'JC', role: 'Enterprise · Communication' };

export interface CommunicationAppProps {
  /** Accepted for parity with the other workstream shells; the hub is
   *  org-scoped so it is not used as a filter. */
  activeProjectId?: string;
  initialNav?: string;
}

function useCurrentUserId(): number | null {
  return React.useMemo(() => {
    try {
      const raw = localStorage.getItem('userId');
      const n = raw ? Number(raw) : NaN;
      return Number.isFinite(n) && n > 0 ? n : null;
    } catch {
      return null;
    }
  }, []);
}

export function CommunicationApp({ initialNav = 'reviews' }: CommunicationAppProps) {
  const [activeNav, setActiveNav] = React.useState(initialNav);
  const [collapsed, setCollapsed] = React.useState(false);
  const [anaOpen, setAnaOpen] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem('comm.anaOpen') ?? 'false'); }
    catch { return false; }
  });
  const [owner, setOwner] = React.useState<'all' | 'mine'>(() => {
    try { return (localStorage.getItem('comm.owner') as 'all' | 'mine') ?? 'all'; }
    catch { return 'all'; }
  });

  const currentUserId = useCurrentUserId();

  React.useEffect(() => {
    try { localStorage.setItem('comm.anaOpen', JSON.stringify(anaOpen)); } catch { /* noop */ }
  }, [anaOpen]);
  React.useEffect(() => {
    try { localStorage.setItem('comm.owner', owner); } catch { /* noop */ }
  }, [owner]);

  // ⌘\ toggles the AnA dock.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') { e.preventDefault(); setAnaOpen((o: boolean) => !o); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const hereLabel = HERE_LABEL_COMM[activeNav] ?? 'Communication';

  const anaChat = useAnaChat({
    screenName: `Communication · ${activeNav}`,
    moduleContext: { workstream: 'communication', activeNav, owner },
  });

  const askAna = React.useCallback((text: string) => {
    if (!text) return;
    setAnaOpen(true);
    void anaChat.send(text);
  }, [anaChat]);

  let surface: React.ReactNode;
  switch (activeNav) {
    case 'approvals':
      surface = <CommApprovals onAskAna={askAna} />;
      break;
    case 'audit':
      surface = <CommAuditTimeline />;
      break;
    case 'reviews':
    default:
      surface = <CommReviewQueue owner={owner} currentUserId={currentUserId} onAskAna={askAna} />;
  }

  const [anaDraft, setAnaDraft] = React.useState('');
  const sendAnaDraft = () => {
    const t = anaDraft.trim();
    if (!t) return;
    setAnaDraft('');
    void anaChat.send(t);
  };

  return (
    <div className="shell" data-collapsed={collapsed || undefined}
         data-ana-open={anaOpen ? 'true' : undefined}>
      <nav className="rail" aria-label="Communication navigation">
        <div className="rail-top">
          <div className="rail-logo">
            <span className="rail-logo-text">Communication <span>Center</span></span>
          </div>
          <button className="rail-collapse" type="button" aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
                  onClick={() => setCollapsed((c) => !c)}>
            {I.panelLeft}
          </button>
        </div>
        <div className="rail-nav">
          {COMM_TABS.map((t) => (
            <button key={t.id} type="button"
                    className={`nav-item${activeNav === t.id ? ' active' : ''}`}
                    aria-current={activeNav === t.id ? 'page' : undefined}
                    onClick={() => setActiveNav(t.id)}>
              <span className="ico">{I[t.icon]}</span>
              <span className="lbl">{t.label}</span>
            </button>
          ))}
        </div>
        <div className="rail-spacer" />
        <div className="rail-account">
          <span className="who">{USER.name} · {USER.role}</span>
        </div>
      </nav>

      <main className="main">
        <div className="topbar">
          <div className="topbar-here">{hereLabel}</div>
          <div className="topbar-actions" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="button" className={`tb-btn${owner === 'all' ? ' active' : ''}`}
                    onClick={() => setOwner('all')}>Everyone</button>
            <button type="button" className={`tb-btn${owner === 'mine' ? ' active' : ''}`}
                    onClick={() => setOwner('mine')}>Mine</button>
          </div>
        </div>
        <div className="tabbar">
          {COMM_TABS.map((t) => (
            <button key={t.id} type="button"
                    className={`tab${activeNav === t.id ? ' active' : ''}`}
                    aria-current={activeNav === t.id ? 'page' : undefined}
                    onClick={() => setActiveNav(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="page" data-screen-label={`Communication · ${hereLabel}`}>
          <div className="page-inner">{surface}</div>
        </div>
      </main>

      {/* AnA — collapsed seam when closed; a live useAnaChat panel when open. */}
      {!anaOpen ? (
        <aside className="ana-seam" aria-label="AnA assistant (collapsed)">
          <button className="ana-seam-btn" type="button"
                  onClick={() => setAnaOpen(true)} title="Open AnA · ⌘\">
            <span className="ana-seam-mark">✻</span>
            <span className="ana-seam-label">AnA</span>
          </button>
        </aside>
      ) : (
        <aside className="ana" aria-label="AnA assistant"
               style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14, minWidth: 300, borderLeft: '1px solid var(--border)', background: 'var(--bg-000)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="ana-seam-mark">✻</span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>AnA · communication</span>
            </div>
            <button className="tb-btn" type="button" onClick={() => setAnaOpen(false)}
                    aria-label="Collapse AnA dock" title="Collapse · ⌘\">
              {I.panelLeft}
            </button>
          </div>

          <div className="task-chat-log" style={{ flex: 1, overflowY: 'auto' }}>
            {anaChat.messages.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(COMM_SUGGESTIONS[activeNav] ?? COMM_SUGGESTIONS.reviews).slice(0, 3).map((s, i) => (
                  <button key={i} className="task-starter" type="button" onClick={() => askAna(s)}>
                    <span className="task-starter-ico">{I.sparkles}</span>{s}
                  </button>
                ))}
              </div>
            )}
            {anaChat.messages.map((m, i) => (
              <div key={i} className={`task-chat-msg ${m.role === 'assistant' ? 'ana' : 'you'}`}>
                {m.text || (m.streaming ? m.statusPhase || 'Routing…' : '')}
              </div>
            ))}
          </div>

          <form style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}
                onSubmit={e => { e.preventDefault(); sendAnaDraft(); }}>
            <textarea rows={2} aria-label="Ask AnA"
                      placeholder={anaChat.isStreaming ? 'AnA is thinking…' : 'Ask AnA about your reviews…'}
                      value={anaDraft}
                      onChange={e => setAnaDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendAnaDraft(); } }}
                      disabled={anaChat.isStreaming}
                      style={{ flex: 1, fontSize: 13, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', resize: 'vertical', background: 'var(--bg-000)', color: 'var(--text-100)' }} />
            <button className="bp-btn-primary" type="submit" aria-label="Send"
                    disabled={!anaDraft.trim() || anaChat.isStreaming}>
              {I.send}
            </button>
          </form>
        </aside>
      )}
    </div>
  );
}
