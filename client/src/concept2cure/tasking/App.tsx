/**
 * TaskingApp — cross-program tasking workstream domain shell.
 *
 * Rail + TopBar + TabBar + surface router + AnA dock. Mirrors the risk shell
 * idioms. Every surface renders live data via useTasking hooks against
 * /api/regulatory/tasks/* — no kit / demo arrays are imported.
 *
 * Scoping — tasks are org-scoped (cross-program), not project-scoped. The
 * unified_tasks API filters by organizationId (resolved client-side in the
 * service) and an optional numeric projectId. The canonical concept2cure
 * project id is a non-numeric string (proj_…) that does not map to the numeric
 * projects.id FK unified_tasks references, so it is NOT threaded as the project
 * filter (it would match nothing). The board therefore defaults to genuine
 * org-wide scope; the primary live filter is the mine / everyone owner toggle,
 * which filters by the current user id (localStorage 'userId').
 *
 * The kit also sketches a project-messaging pane (threads + bubbles). There is
 * no backend thread endpoint, so that pane is omitted rather than faked.
 *
 * AnA: ⌘\ toggles the dock. When open it runs a real useAnaChat round-trip
 * against /api/ana-ri/stream with tasking module context; when closed it
 * collapses to the biopharma-style .ana-seam button.
 *
 * @module client/src/concept2cure/tasking/App
 */

import * as React from 'react';
import { TaskingRail } from './shell/Rail';
import { TaskingTopBar, type TaskingProjectOption } from './shell/TopBar';
import { TaskingTabBar } from './shell/TabBar';
import { TaskingOverview } from './surfaces/Overview';
import { TaskingBoard } from './surfaces/Board';
import { TaskingList } from './surfaces/List';
import { TaskingIcon } from './icons';
import { HERE_LABEL_TASKING, TASKING_SUGGESTIONS } from './data/nav';
import { useAnaChat } from '../components/ana/useAnaChat';

const USER = { name: 'You', initials: 'JC', role: 'Enterprise · Tasking' };

export interface TaskingAppProps {
  /** The canonical concept2cure project id, accepted for parity with the other
   *  workstream shells. Tasking is org-scoped, so it is not used as a filter
   *  unless a numeric program id is available. */
  activeProjectId?: string;
  initialNav?: string;
}

/** Resolve the current user id from the shared localStorage convention. */
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

export function TaskingApp({ initialNav = 'overview' }: TaskingAppProps) {
  const [activeNav, setActiveNav] = React.useState(initialNav);
  const [collapsed, setCollapsed] = React.useState(false);
  const [anaOpen, setAnaOpen] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem('tasking.anaOpen') ?? 'false'); }
    catch { return false; }
  });
  const [density, setDensity] = React.useState(() => {
    try { return localStorage.getItem('tasking.density') ?? 'comfortable'; }
    catch { return 'comfortable'; }
  });
  const [owner, setOwner] = React.useState<'all' | 'mine'>(() => {
    try { return (localStorage.getItem('tasking.owner') as 'all' | 'mine') ?? 'all'; }
    catch { return 'all'; }
  });
  const [projectId, setProjectId] = React.useState<number | null>(null);

  const currentUserId = useCurrentUserId();

  React.useEffect(() => {
    try { localStorage.setItem('tasking.anaOpen', JSON.stringify(anaOpen)); } catch { /* noop */ }
  }, [anaOpen]);
  React.useEffect(() => {
    try { localStorage.setItem('tasking.density', density); } catch { /* noop */ }
  }, [density]);
  React.useEffect(() => {
    try { localStorage.setItem('tasking.owner', owner); } catch { /* noop */ }
  }, [owner]);

  // ⌘\ toggles AnA dock
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') { e.preventDefault(); setAnaOpen((o: boolean) => !o); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Program filter — populated only with numeric project ids the unified-tasks
  // API can actually filter on. The canonical concept2cure project id space is
  // non-numeric, so this stays empty and the board scopes org-wide.
  const projectOptions: TaskingProjectOption[] = React.useMemo(() => [], []);

  const hereLabel = HERE_LABEL_TASKING[activeNav] ?? 'Your work';

  const anaChat = useAnaChat({
    screenName: `Tasking · ${activeNav}`,
    moduleContext: { workstream: 'tasking', activeNav, owner },
  });

  const askAna = React.useCallback((text: string) => {
    if (!text) return;
    setAnaOpen(true);
    void anaChat.send(text);
  }, [anaChat]);

  const onOpenPalette = React.useCallback(() => {
    const suggestions = TASKING_SUGGESTIONS[activeNav];
    askAna(suggestions?.[0] ?? 'Show me what you can do here');
  }, [activeNav, askAna]);

  let surface: React.ReactNode;
  switch (activeNav) {
    case 'overview':
      surface = <TaskingOverview projectId={projectId} owner={owner} currentUserId={currentUserId} onAskAna={askAna} />;
      break;
    case 'board':
      surface = <TaskingBoard projectId={projectId} owner={owner} currentUserId={currentUserId} onAskAna={askAna} />;
      break;
    case 'list':
      surface = <TaskingList projectId={projectId} owner={owner} currentUserId={currentUserId} onAskAna={askAna} />;
      break;
    default:
      surface = <TaskingOverview projectId={projectId} owner={owner} currentUserId={currentUserId} onAskAna={askAna} />;
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
      <TaskingRail
        activeNav={activeNav} setActiveNav={setActiveNav}
        collapsed={collapsed} setCollapsed={setCollapsed}
        user={USER}
      />
      <main className="main">
        <TaskingTopBar
          hereLabel={hereLabel}
          density={density} onDensity={setDensity}
          projectId={projectId}
          projectOptions={projectOptions}
          onSelectProject={setProjectId}
          owner={owner}
          onSelectOwner={setOwner}
          onOpenPalette={onOpenPalette}
        />
        <TaskingTabBar activeNav={activeNav} setActiveNav={setActiveNav} />
        <div className="page" data-screen-label={`Tasking · ${hereLabel}`} data-density={density}>
          <div className="page-inner">{surface}</div>
        </div>
      </main>

      {/* AnA — collapsed seam when closed; an inline panel backed by a real
          useAnaChat stream when open. */}
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
              <span style={{ fontSize: 13, fontWeight: 600 }}>AnA · tasking</span>
            </div>
            <button className="tb-btn" type="button" onClick={() => setAnaOpen(false)}
                    aria-label="Collapse AnA dock" title="Collapse · ⌘\">
              <TaskingIcon name="panelLeft" />
            </button>
          </div>

          <div className="task-chat-log" style={{ flex: 1, overflowY: 'auto' }}>
            {anaChat.messages.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(TASKING_SUGGESTIONS[activeNav] ?? TASKING_SUGGESTIONS.overview).slice(0, 3).map((s, i) => (
                  <button key={i} className="task-starter" type="button" onClick={() => askAna(s)}>
                    <span className="task-starter-ico"><TaskingIcon name="sparkles" /></span>{s}
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
                      placeholder={anaChat.isStreaming ? 'AnA is thinking…' : 'Ask AnA about your tasks…'}
                      value={anaDraft}
                      onChange={e => setAnaDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendAnaDraft(); } }}
                      disabled={anaChat.isStreaming}
                      style={{ flex: 1, fontSize: 13, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', resize: 'vertical', background: 'var(--bg-000)', color: 'var(--text-100)' }} />
            <button className="bp-btn-primary" type="submit" aria-label="Send"
                    disabled={!anaDraft.trim() || anaChat.isStreaming}>
              <TaskingIcon name="send" />
            </button>
          </form>
        </aside>
      )}
    </div>
  );
}
