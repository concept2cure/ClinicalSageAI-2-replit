/**
 * LabelingApp — labeling workstream domain shell.
 *
 * Rail + TopBar + TabBar + surface router + AnA dock. Mirrors the CMC shell
 * idioms. Every surface renders live data via useLabeling hooks against
 * /api/mdx/labeling — no kit / demo arrays are imported.
 *
 * The shell carries a selected project id from the canonical project id space
 * (useProjects). That id is threaded to the surfaces as the labeling
 * document `program_id` filter — the same id space CMC scopes on — defaulting
 * to the activeProjectId prop, then the first project, persisted in
 * localStorage 'labeling.projectId'.
 *
 * AnA: ⌘\ toggles the dock. When open it runs a real useAnaChat round-trip
 * against /api/ana-ri/stream with labeling module context; when closed it
 * collapses to the biopharma-style .ana-seam button.
 *
 * @module client/src/concept2cure/labeling/App
 */

import * as React from 'react';
import { LabelingRail } from './shell/Rail';
import { LabelingTopBar, type LabelingProjectOption } from './shell/TopBar';
import { LabelingTabBar } from './shell/TabBar';
import { LabelingOverview } from './surfaces/Overview';
import { LabelingDocuments } from './surfaces/Documents';
import { LabelingTranslations } from './surfaces/Translations';
import { LabelingSymbols } from './surfaces/Symbols';
import { LabelingIcon } from './icons';
import { HERE_LABEL_LABELING, LABELING_SUGGESTIONS } from './data/nav';
import { useProjects } from '../hooks/useProjects';
import { useAnaChat } from '../components/ana/useAnaChat';

const USER = { name: 'You', initials: 'JC', role: 'Enterprise · Labeling' };

export interface LabelingAppProps {
  activeProjectId?: string;
  initialNav?: string;
}

export function LabelingApp({ activeProjectId, initialNav = 'overview' }: LabelingAppProps) {
  const [activeNav, setActiveNav] = React.useState(initialNav);
  const [collapsed, setCollapsed] = React.useState(false);
  const [anaOpen, setAnaOpen] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem('labeling.anaOpen') ?? 'false'); }
    catch { return false; }
  });
  const [density, setDensity] = React.useState(() => {
    try { return localStorage.getItem('labeling.density') ?? 'comfortable'; }
    catch { return 'comfortable'; }
  });
  const [projectId, setProjectId] = React.useState<string | null>(() => {
    try { return activeProjectId ?? localStorage.getItem('labeling.projectId'); }
    catch { return activeProjectId ?? null; }
  });

  React.useEffect(() => {
    try { localStorage.setItem('labeling.anaOpen', JSON.stringify(anaOpen)); } catch { /* noop */ }
  }, [anaOpen]);
  React.useEffect(() => {
    try { localStorage.setItem('labeling.density', density); } catch { /* noop */ }
  }, [density]);
  React.useEffect(() => {
    try { if (projectId) localStorage.setItem('labeling.projectId', projectId); } catch { /* noop */ }
  }, [projectId]);

  // ⌘\ toggles AnA dock
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') { e.preventDefault(); setAnaOpen((o: boolean) => !o); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // The project selector and every project-scoped surface use the canonical
  // project id space (useProjects) — threaded to surfaces as the labeling
  // document program_id filter.
  const { projects } = useProjects();
  const projectOptions: LabelingProjectOption[] = React.useMemo(
    () => projects.map((p: { id: string; name: string }) => ({ id: p.id, label: p.name })),
    [projects],
  );

  React.useEffect(() => {
    if (!projectId && projectOptions.length > 0) {
      setProjectId(projectOptions[0].id);
    }
  }, [projectId, projectOptions]);

  const hereLabel = HERE_LABEL_LABELING[activeNav] ?? 'Labeling overview';

  const anaChat = useAnaChat({
    projectId: projectId ?? undefined,
    screenName: `Labeling · ${activeNav}`,
    moduleContext: { workstream: 'labeling', activeNav, projectId: projectId ?? undefined },
  });

  const askAna = React.useCallback((text: string) => {
    if (!text) return;
    setAnaOpen(true);
    void anaChat.send(text);
  }, [anaChat]);

  const onOpenPalette = React.useCallback(() => {
    const suggestions = LABELING_SUGGESTIONS[activeNav];
    askAna(suggestions?.[0] ?? 'Show me what you can do here');
  }, [activeNav, askAna]);

  let surface: React.ReactNode;
  switch (activeNav) {
    case 'overview':     surface = <LabelingOverview projectId={projectId} onAskAna={askAna} />; break;
    case 'documents':    surface = <LabelingDocuments projectId={projectId} onAskAna={askAna} />; break;
    case 'translations': surface = <LabelingTranslations projectId={projectId} onAskAna={askAna} />; break;
    case 'symbols':      surface = <LabelingSymbols projectId={projectId} onAskAna={askAna} />; break;
    default:             surface = <LabelingOverview projectId={projectId} onAskAna={askAna} />;
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
      <LabelingRail
        activeNav={activeNav} setActiveNav={setActiveNav}
        collapsed={collapsed} setCollapsed={setCollapsed}
        user={USER}
      />
      <main className="main">
        <LabelingTopBar
          hereLabel={hereLabel}
          density={density} onDensity={setDensity}
          projectId={projectId}
          projectOptions={projectOptions}
          onSelectProject={setProjectId}
          onOpenPalette={onOpenPalette}
        />
        <LabelingTabBar activeNav={activeNav} setActiveNav={setActiveNav} />
        <div className="page" data-screen-label={`Labeling · ${hereLabel}`} data-density={density}>
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
              <span style={{ fontSize: 13, fontWeight: 600 }}>AnA · labeling</span>
            </div>
            <button className="tb-btn" type="button" onClick={() => setAnaOpen(false)}
                    aria-label="Collapse AnA dock" title="Collapse · ⌘\">
              <LabelingIcon name="panelLeft" />
            </button>
          </div>

          <div className="lb-chat-log" style={{ flex: 1, overflowY: 'auto' }}>
            {anaChat.messages.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(LABELING_SUGGESTIONS[activeNav] ?? LABELING_SUGGESTIONS.overview).slice(0, 3).map((s, i) => (
                  <button key={i} className="lb-starter" type="button" onClick={() => askAna(s)}>
                    <span className="lb-starter-ico"><LabelingIcon name="sparkles" /></span>{s}
                  </button>
                ))}
              </div>
            )}
            {anaChat.messages.map((m, i) => (
              <div key={i} className={`lb-chat-msg ${m.role === 'assistant' ? 'ana' : 'you'}`}>
                {m.text || (m.streaming ? m.statusPhase || 'Routing…' : '')}
              </div>
            ))}
          </div>

          <form style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}
                onSubmit={e => { e.preventDefault(); sendAnaDraft(); }}>
            <textarea rows={2} aria-label="Ask AnA"
                      placeholder={anaChat.isStreaming ? 'AnA is thinking…' : 'Ask AnA about labeling…'}
                      value={anaDraft}
                      onChange={e => setAnaDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendAnaDraft(); } }}
                      disabled={anaChat.isStreaming}
                      style={{ flex: 1, fontSize: 13, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', resize: 'vertical', background: 'var(--bg-000)', color: 'var(--text-100)' }} />
            <button className="bp-btn-primary" type="submit" aria-label="Send"
                    disabled={!anaDraft.trim() || anaChat.isStreaming}>
              <LabelingIcon name="send" />
            </button>
          </form>
        </aside>
      )}
    </div>
  );
}
