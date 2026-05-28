/**
 * CmcApp — Phase 10 CMC (Module 3) domain shell.
 *
 * Rail + TopBar + TabBar + surface router + AnA dock. Mirrors biopharma's
 * shell idioms. Every surface renders live data via useCMC hooks — no kit /
 * demo arrays are imported.
 *
 * The shell carries a selected project id (project context) used by the
 * project-scoped surfaces. Selection comes from the canonical project id space
 * (useProjects) — the same id the /api/cmc/*\/:projectId routes filter on —
 * defaulting to the activeProjectId prop, then the first project, persisted in
 * localStorage 'cmc.projectId'. The portfolio overview (product_id space) is a
 * separate cross-submission view and never drives scoped surfaces.
 *
 * AnA: ⌘\ toggles the dock. When open the dock runs a real useAnaChat
 * round-trip against /api/ana-ri/stream with CMC module context; when closed
 * it collapses to the biopharma-style .ana-seam button.
 *
 * @module client/src/concept2cure/cmc/App
 */

import * as React from 'react';
import { CmcRail } from './shell/Rail';
import { CmcTopBar, type CmcProjectOption } from './shell/TopBar';
import { CmcTabBar } from './shell/TabBar';
import { CmcOverview } from './surfaces/Overview';
import { CmcSpecifications } from './surfaces/Specifications';
import { CmcStability } from './surfaces/Stability';
import { CmcBatch } from './surfaces/Batch';
import { CmcChange } from './surfaces/Change';
import { CmcBlueprint } from './surfaces/Blueprint';
import { CmcGlobal } from './surfaces/Global';
import { CmcCopilot } from './surfaces/Copilot';
import { CmcIcon } from './icons';
import { HERE_LABEL_CMC, CMC_SUGGESTIONS } from './data/nav';
import { usePortfolioOverview } from '../hooks/useCMC';
import { useProjects } from '../hooks/useProjects';
import { useAnaChat } from '../components/ana/useAnaChat';

const USER = { name: 'You', initials: 'JC', role: 'Enterprise · CMC' };

export interface CmcAppProps {
  activeProjectId?: string;
  initialNav?: string;
}

export function CmcApp({ activeProjectId, initialNav = 'overview' }: CmcAppProps) {
  const [activeNav, setActiveNav] = React.useState(initialNav);
  const [collapsed, setCollapsed] = React.useState(false);
  const [anaOpen, setAnaOpen] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem('cmc.anaOpen') ?? 'false'); }
    catch { return false; }
  });
  const [density, setDensity] = React.useState(() => {
    try { return localStorage.getItem('cmc.density') ?? 'comfortable'; }
    catch { return 'comfortable'; }
  });
  const [projectId, setProjectId] = React.useState<string | null>(() => {
    try { return activeProjectId ?? localStorage.getItem('cmc.projectId'); }
    catch { return activeProjectId ?? null; }
  });

  React.useEffect(() => {
    try { localStorage.setItem('cmc.anaOpen', JSON.stringify(anaOpen)); } catch { /* noop */ }
  }, [anaOpen]);
  React.useEffect(() => {
    try { localStorage.setItem('cmc.density', density); } catch { /* noop */ }
  }, [density]);
  React.useEffect(() => {
    try {
      if (projectId) localStorage.setItem('cmc.projectId', projectId);
    } catch { /* noop */ }
  }, [projectId]);

  // ⌘\ toggles AnA dock
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') { e.preventDefault(); setAnaOpen((o: boolean) => !o); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Portfolio overview (cross-submission RPI) feeds the Overview surface only —
  // it is keyed on product_id, a different id space, and never drives scoped
  // surfaces.
  const portfolio = usePortfolioOverview();
  const portfolioRows = portfolio.data ?? [];

  // The project selector and every project-scoped surface use the canonical
  // project id space (useProjects) — the same id the /api/cmc/*\/:projectId
  // routes filter on.
  const { projects } = useProjects();
  const projectOptions: CmcProjectOption[] = React.useMemo(
    () => projects.map((p: { id: string; name: string }) => ({ id: p.id, label: p.name })),
    [projects],
  );

  // Default the selection to the first project once the list loads.
  React.useEffect(() => {
    if (!projectId && projectOptions.length > 0) {
      setProjectId(projectOptions[0].id);
    }
  }, [projectId, projectOptions]);

  const hereLabel = HERE_LABEL_CMC[activeNav] ?? 'Module 3 overview';

  // Real AnA round-trip with CMC module context.
  const anaChat = useAnaChat({
    projectId: projectId ?? undefined,
    screenName: `CMC · ${activeNav}`,
    moduleContext: { workstream: 'cmc', activeNav, projectId: projectId ?? undefined },
  });

  const askAna = React.useCallback((text: string) => {
    if (!text) return;
    setAnaOpen(true);
    void anaChat.send(text);
  }, [anaChat]);

  const onOpenPalette = React.useCallback(() => {
    const suggestions = CMC_SUGGESTIONS[activeNav];
    askAna(suggestions?.[0] ?? 'Show me what you can do here');
  }, [activeNav, askAna]);

  let surface: React.ReactNode;
  switch (activeNav) {
    case 'overview':
      surface = (
        <CmcOverview
          projectId={projectId}
          portfolioRows={portfolioRows}
          onAskAna={askAna}
        />
      );
      break;
    case 'specs':     surface = <CmcSpecifications projectId={projectId} onAskAna={askAna} />; break;
    case 'stability': surface = <CmcStability projectId={projectId} onAskAna={askAna} />; break;
    case 'batch':     surface = <CmcBatch projectId={projectId} onAskAna={askAna} />; break;
    case 'change':    surface = <CmcChange />; break;
    case 'blueprint': surface = <CmcBlueprint projectId={projectId} onAskAna={askAna} />; break;
    case 'global':    surface = <CmcGlobal onAskAna={askAna} />; break;
    case 'copilot':   surface = <CmcCopilot projectId={projectId} />; break;
    default:
      surface = (
        <CmcOverview
          projectId={projectId}
          portfolioRows={portfolioRows}
          onAskAna={askAna}
        />
      );
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
      <CmcRail
        activeNav={activeNav} setActiveNav={setActiveNav}
        collapsed={collapsed} setCollapsed={setCollapsed}
        user={USER}
      />
      <main className="main">
        <CmcTopBar
          hereLabel={hereLabel}
          density={density} onDensity={setDensity}
          projectId={projectId}
          projectOptions={projectOptions}
          onSelectProject={setProjectId}
          onOpenPalette={onOpenPalette}
        />
        <CmcTabBar activeNav={activeNav} setActiveNav={setActiveNav} />
        <div className="page" data-screen-label={`CMC · ${hereLabel}`} data-density={density}>
          <div className="page-inner">{surface}</div>
        </div>
      </main>

      {/* AnA — collapsed seam (biopharma-style) when closed; an inline panel
          backed by a real useAnaChat stream when open. */}
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
              <span style={{ fontSize: 13, fontWeight: 600 }}>AnA · CMC</span>
            </div>
            <button className="tb-btn" type="button" onClick={() => setAnaOpen(false)}
                    aria-label="Collapse AnA dock" title="Collapse · ⌘\">
              <CmcIcon name="panelLeft" />
            </button>
          </div>

          <div className="cmc-chat-log" style={{ flex: 1, overflowY: 'auto' }}>
            {anaChat.messages.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(CMC_SUGGESTIONS[activeNav] ?? CMC_SUGGESTIONS.overview).slice(0, 3).map((s, i) => (
                  <button key={i} className="bp-od-starter" type="button" onClick={() => askAna(s)}>
                    <span className="bp-od-starter-ico"><CmcIcon name="sparkles" /></span>{s}
                  </button>
                ))}
              </div>
            )}
            {anaChat.messages.map((m, i) => (
              <div key={i} className={`cmc-chat-msg ${m.role === 'assistant' ? 'ana' : 'you'}`}>
                {m.text || (m.streaming ? m.statusPhase || 'Routing…' : '')}
              </div>
            ))}
          </div>

          <form style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}
                onSubmit={e => { e.preventDefault(); sendAnaDraft(); }}>
            <textarea rows={2} aria-label="Ask AnA"
                      placeholder={anaChat.isStreaming ? 'AnA is thinking…' : 'Ask AnA about Module 3…'}
                      value={anaDraft}
                      onChange={e => setAnaDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendAnaDraft(); } }}
                      disabled={anaChat.isStreaming}
                      style={{ flex: 1, fontSize: 13, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', resize: 'vertical', background: 'var(--bg-000)', color: 'var(--text-100)' }} />
            <button className="bp-btn-primary" type="submit" aria-label="Send"
                    disabled={!anaDraft.trim() || anaChat.isStreaming}>
              <CmcIcon name="send" />
            </button>
          </form>
        </aside>
      )}
    </div>
  );
}
