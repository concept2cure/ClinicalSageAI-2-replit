/**
 * BiopharmaApp — Phase 10.2 biopharma domain shell.
 *
 * Rail + TopBar + TabBar + surface router + persistent AnA dock.
 * Programs come from /api/biopharma/programs (live); inbound agency
 * correspondence from /api/regulatory-correspondence; user preferences
 * (density · railGroups · dockOpen) persist via PUT /api/users/me/preferences;
 * the tenant's client type comes from organizations.client_type via
 * GET /api/users/me (medtech tenants are redirected to the MDX shell).
 *
 * AnA dock: ⌘\ toggles; 400px open, 32px seam closed; chat streams through
 * useAnaChat (/api/ana-ri/stream) with activeNav pinned into module_context.
 *
 * Port of ui_kits/biopharma/app.jsx + shell.jsx per PHASE_10_2_INSTALL.md.
 *
 * @module client/src/concept2cure/biopharma/App
 */

import * as React from 'react';
import { BiopharmaRail }   from './shell/Rail';
import { BiopharmaTopBar } from './shell/TopBar';
import { BiopharmaTabBar } from './shell/TabBar';
import { BiopharmaAnaDock, type BiopharmaAnaMessage } from './shell/AnaDock';
import { BiopharmaOverview }  from './surfaces/Overview';
import { BiopharmaInd }       from './surfaces/IndSurface';
import { BiopharmaNda, BiopharmaBla, BiopharmaMaa, BiopharmaJnda } from './surfaces/Pathway';
import { BiopharmaLifecycle } from './surfaces/LifecycleSurface';
import { BiopharmaPediatric } from './surfaces/PediatricSurface';
import { BiopharmaPv }        from './surfaces/PvSurface';
import { BiopharmaOrphan }    from './surfaces/OrphanSurface';
import { BiopharmaMeetings }  from './surfaces/MeetingsSurface';
import { BiopharmaStub }      from './surfaces/Stub';
import { HERE_LABEL_BIOPHARMA, BIOPHARMA_SUGGESTIONS, getClientTypeConfig } from './data/nav';
import { useBiopharmaPrograms } from './data/programs';
import { useUserPreferences } from './data/preferences';
import { useAnaChat } from '../components/ana/useAnaChat';

const SHARED_WITH_MDX: Record<string, string> = {
  tasks:        'mdx/workbench/Tasks',
  'ana-review': 'mdx/surfaces/AnaReview',
  vault:        'mdx/surfaces/Vault',
  validation:   'mdx/workbench/Validation',
  submissions:  'mdx/workbench/Submissions',
  templates:    'mdx/surfaces/Templates',
  analytics:    'mdx/surfaces/Analytics',
  memory:       'mdx/surfaces/Memory',
  conversations:'mdx/surfaces/Conversations',
  search:       'mdx/surfaces/Search',
  notifications:'mdx/surfaces/Notifications',
  audit:        'mdx/surfaces/Audit',
  admin:        'mdx/surfaces/Admin',
};

export interface BiopharmaAppProps {
  initialNav?: string;
}

export function BiopharmaApp({ initialNav = 'overview' }: BiopharmaAppProps) {
  const [activeNav, setActiveNav] = React.useState(initialNav);
  const [collapsed, setCollapsed] = React.useState(false);

  // Per-user preferences (density · railGroups · dockOpen) + session-derived
  // client type and greeting name. Persists to users.preferences server-side
  // with a localStorage mirror as the offline fallback.
  const {
    density, setDensity,
    railGroups, setRailGroupOpen,
    dockOpen, setDockOpen,
    clientType, userFirstName,
  } = useUserPreferences();

  const clientCfg = getClientTypeConfig(clientType);

  // Medtech tenants use the MDX shell — redirect per PHASE_10_2_INSTALL.md §5.
  const isMedtech = clientType === 'medtech';
  React.useEffect(() => {
    if (isMedtech) window.location.hash = '#mdx';
  }, [isMedtech]);

  // ⌘\ toggles AnA dock
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        setDockOpen(o => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setDockOpen]);

  const { programs, loading } = useBiopharmaPrograms();

  const hereLabel = HERE_LABEL_BIOPHARMA[activeNav] ?? 'Overview';

  // Active program pill — first live program matching the active pathway tab.
  const program = React.useMemo(() => {
    const byType = (t: string) => programs.find(p => p.program_type.toLowerCase() === t) ?? null;
    if (activeNav === 'ind')  return byType('ind');
    if (activeNav === 'nda')  return byType('nda');
    if (activeNav === 'bla')  return byType('bla');
    if (activeNav === 'maa')  return byType('maa');
    if (activeNav === 'jnda') return byType('jnda');
    return null;
  }, [activeNav, programs]);

  // ─── AnA dock chat — wired to the real gateway (/api/ana-ri/stream).
  // activeNav goes into module_context so the orchestrator grounds on the
  // active surface; per-surface thread persistence is the Phase 10.1 store
  // (c2c_ana_conversations.domain).
  const anaChat = useAnaChat({
    projectId: program?.id ?? null,
    projectName: program?.code ?? program?.name ?? null,
    screenName: `Biopharma · ${hereLabel}`,
    submissionType: program?.program_type ?? null,
    moduleContext: { workstream: 'biopharma', activeNav },
  });

  const dockMessages: BiopharmaAnaMessage[] = React.useMemo(
    () =>
      anaChat.messages.map(m => ({
        role: m.role === 'assistant' ? ('ana' as const) : ('user' as const),
        body: m.text || (m.streaming ? (m.statusPhase || 'Routing…') : ''),
        when: m.sentAt
          ? new Date(m.sentAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
          : 'just now',
        streaming: m.streaming,
      })),
    [anaChat.messages],
  );

  const askAna = React.useCallback(
    (text: string) => {
      if (!text) return;
      setDockOpen(true);
      void anaChat.send(text);
    },
    [anaChat, setDockOpen],
  );

  const onOpenPalette = React.useCallback(() => {
    const suggestions = BIOPHARMA_SUGGESTIONS[activeNav];
    askAna(suggestions?.[0] ?? 'Show me what you can do here');
  }, [activeNav, askAna]);

  const user = {
    name: userFirstName ?? 'You',
    initials: (userFirstName ?? 'You').slice(0, 2).toUpperCase(),
    role: 'Enterprise · Reg Affairs',
  };

  if (isMedtech) {
    return (
      <div className="shell">
        <main className="main">
          <div className="page" data-screen-label="Biopharma · Redirect">
            <div className="page-inner">
              <div className="bp-surface" style={{ alignItems: 'center', justifyContent: 'center', minHeight: 320 }}>
                <div style={{ textAlign: 'center', maxWidth: 480 }}>
                  <div className="bp-kicker" style={{ marginBottom: 12 }}>Medical device and diagnostics</div>
                  <h2 className="bp-title" style={{ marginBottom: 8 }}>Your workspace lives in MDX</h2>
                  <p className="bp-meta">
                    Your organization is a medtech tenant — 510(k), PMA, CER and post-market
                    surfaces live in the MDX workspace. Redirecting you there now.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  let surface: React.ReactNode;
  switch (activeNav) {
    case 'overview':
      surface = (
        <BiopharmaOverview
          programs={programs}
          onAskAna={askAna}
          loading={loading}
          clientType={clientType}
          userFirstName={userFirstName}
        />
      );
      break;
    case 'ind':       surface = <BiopharmaInd       programs={programs} onAskAna={askAna} />; break;
    case 'nda':       surface = <BiopharmaNda       programs={programs} onAskAna={askAna} />; break;
    case 'bla':       surface = <BiopharmaBla       programs={programs} onAskAna={askAna} />; break;
    case 'maa':       surface = <BiopharmaMaa       programs={programs} onAskAna={askAna} />; break;
    case 'jnda':      surface = <BiopharmaJnda      programs={programs} onAskAna={askAna} />; break;
    case 'lifecycle': surface = <BiopharmaLifecycle programs={programs} onAskAna={askAna} />; break;
    case 'pediatric': surface = <BiopharmaPediatric programs={programs} onAskAna={askAna} />; break;
    case 'pharmacov': surface = <BiopharmaPv        programs={programs} onAskAna={askAna} />; break;
    case 'orphan':    surface = <BiopharmaOrphan    programs={programs} onAskAna={askAna} />; break;
    case 'meetings':  surface = <BiopharmaMeetings  programs={programs} onAskAna={askAna} />; break;
    case 'cmc':
    case 'clinical':
    case 'biostat':
    case 'precedent':
      surface = <BiopharmaStub nav={activeNav} label={hereLabel} onAskAna={askAna} />;
      break;
    default:
      surface = SHARED_WITH_MDX[activeNav]
        ? <BiopharmaStub nav={activeNav} label={hereLabel} sharedWith={SHARED_WITH_MDX[activeNav]} onAskAna={askAna} />
        : <BiopharmaStub nav={activeNav} label={hereLabel} onAskAna={askAna} />;
  }

  return (
    <div className="shell" data-collapsed={collapsed || undefined}
         data-ana-open={dockOpen ? 'true' : undefined}>
      <BiopharmaRail
        activeNav={activeNav} setActiveNav={setActiveNav}
        collapsed={collapsed} setCollapsed={setCollapsed}
        clientType={clientType} user={user}
        groupOpen={railGroups} onToggleGroup={setRailGroupOpen}
      />
      <main className="main">
        <BiopharmaTopBar
          hereLabel={hereLabel} program={program}
          density={density} onDensity={setDensity}
          domainLabel={clientCfg.domainLabel}
          onOpenPalette={onOpenPalette}
        />
        <BiopharmaTabBar
          activeNav={activeNav} setActiveNav={setActiveNav}
          programs={programs} clientType={clientType}
        />
        <div className="page" data-screen-label={`Biopharma · ${hereLabel}`} data-density={density}>
          <div className="page-inner">{surface}</div>
        </div>
      </main>
      {/* Persistent AnA dock — 400px open / 32px seam closed / ⌘\ toggles. */}
      <BiopharmaAnaDock
        open={dockOpen}
        setOpen={setDockOpen}
        activeNav={activeNav}
        messages={dockMessages}
        onSend={text => { void anaChat.send(text); }}
        isStreaming={anaChat.isStreaming}
        onNewThread={anaChat.reset}
        projectId={program?.id}
      />
    </div>
  );
}
