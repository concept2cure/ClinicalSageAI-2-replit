/**
 * MDX root component — composes Shell + the active surface.
 *
 * Ported from design-system/ui_kits/mdx/App.jsx. The kit's TweaksPanel +
 * postMessage editor-mode plumbing is omitted; v2 doesn't run the design-tool
 * harness. State that survives sessions (rail collapsed, AnA open, mode,
 * active surface) is in localStorage.
 */

import * as React from 'react';
import { I } from './icons';
import { Rail } from './shell/Rail';
import { TopBar } from './shell/TopBar';
import { TabBar } from './shell/TabBar';
import { CmdK } from './shell/CmdK';
import { AnaRail, type AnaMessage } from './shell/AnaRail';
import { Overview } from './surfaces/Overview';
import { K510Surface } from './surfaces/K510Surface';
import { PmaSurface } from './surfaces/PmaSurface';
import { CerSurface } from './surfaces/CerSurface';
import { PrecedentSurface } from './surfaces/PrecedentSurface';
import { InDesignSurface } from './surfaces/InDesignSurface';
import {
  TasksSurface,
  VaultSurface,
  ValidationSurface,
  SubmissionsSurface,
  TemplatesSurface,
} from './workbench/Workbench';
import { ProjectHome } from './projectHome/ProjectHome';
import { EstarEditor } from './editors/EstarEditor';
import { PmaEditor } from './editors/PmaEditor';
import { CerEditor } from './editors/CerEditor';
import { CerWorkbench } from './surfaces/cer/CerWorkbench';
import { PreSubManager } from './presub/PreSubManager';
import { MDX_STUBS, type AnaMode } from './data/nav';
import { MDX_PROGRAMS, type Program } from './data/programs';
import { EDITOR_PROGRAM } from './data/editor';
import { useAnaChat } from '../components/ana/useAnaChat';

const HERE_LABEL: Record<string, string> = {
  overview:       'Overview',
  'project-home': 'Project home',
  k510:           '510(k) Submissions',
  pma:            'PMA Submissions',
  cer:            'CER Generator',
  predicate:      'Precedent intelligence',
  engineering:    'Device engineering',
  udi:            'UDI and labeling',
  postmarket:     'Post-market vigilance',
  tasks:          'Tasks and reviews',
  vault:          'Document vault',
  validation:     'Validation center',
  submissions:    'Submission center',
  templates:      'Templates',
  analytics:      'Analytics',
  memory:         'Claude memory',
  admin:          'Admin and access',
  editor:         '510(k) module editor',
  'cer-workbench':'CER workbench (Equivalence · GSPR · PMS)',
  'pre-sub':      'Pre-submission manager',
  'pma-editor':   'PMA module editor',
  'cer-editor':   'CER section editor',
};

function getStored<T>(key: string, fallback: T): T {
  if (typeof localStorage === 'undefined') return fallback;
  const v = localStorage.getItem(key);
  if (v == null) return fallback;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
}

function persist(key: string, value: unknown) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota; ignore */
  }
}

const DEFAULT_USER = { name: 'Jordan Chen', initials: 'JC', role: 'Enterprise · Reg Affairs' };

export interface AppProps {
  /** Initial active workstream tab. Overrides the localStorage-persisted value
   *  for this mount. Used when MDX is embedded under a specific project module
   *  (e.g. from ZenApp embeddedModule = '510k' → initialNav = 'k510'). */
  initialNav?: string;
  /** Optional project display name to override the program-fixture title in
   *  context. Surfaces the correct project name in topbar / AnA grounding. */
  projectName?: string | null;
}

export function App({ initialNav, projectName }: AppProps = {}) {
  const [activeNav,    setActiveNav]    = React.useState<string>(() =>
    initialNav ?? getStored('mdx.activeNav', 'overview'),
  );
  const [railCollapsed,setRailCollapsed]= React.useState<boolean>(() => getStored('mdx.railCollapsed', false));
  const [anaOpen,      setAnaOpen]      = React.useState<boolean>(() => getStored('mdx.anaOpen', false));
  const [anaMode,      setAnaMode]      = React.useState<AnaMode['id']>(() => getStored('mdx.anaMode', 'standard'));
  const [selectedProgram, setSelectedProgram] = React.useState<Program | null>(null);
  const [cmdkOpen, setCmdkOpen] = React.useState(false);

  // First-visit discovery — open AnA once.
  React.useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    const visited = localStorage.getItem('mdx.visited');
    if (!visited) {
      localStorage.setItem('mdx.visited', '1');
      setAnaOpen(true);
    }
  }, []);

  // Persist surface preferences.
  React.useEffect(() => persist('mdx.activeNav', activeNav), [activeNav]);
  React.useEffect(() => persist('mdx.railCollapsed', railCollapsed), [railCollapsed]);
  React.useEffect(() => persist('mdx.anaOpen', anaOpen), [anaOpen]);
  React.useEffect(() => persist('mdx.anaMode', anaMode), [anaMode]);

  // Global keyboard — ⌘K palette, ⌘\ AnA toggle.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdkOpen(o => !o);
      }
      if (mod && e.key === '\\') {
        e.preventDefault();
        setAnaOpen(o => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const openProgram = (prog: Program) => {
    setSelectedProgram(prog);
    setActiveNav('project-home');
  };
  const openWorkbench = () => {
    if (selectedProgram) setActiveNav(selectedProgram.pathway);
  };
  const openEditor = () => setActiveNav('editor');

  const programForContext = React.useMemo<Program | null>(() => {
    if (selectedProgram) return selectedProgram;
    if (activeNav === 'k510') return MDX_PROGRAMS[0];
    if (activeNav === 'pma') return MDX_PROGRAMS[2];
    if (activeNav === 'cer') return MDX_PROGRAMS[3];
    if (activeNav === 'project-home') return MDX_PROGRAMS[0];
    return null;
  }, [activeNav, selectedProgram]);

  // ─── AnA chat — wired to the real gateway ──────────────────────────
  // Mirrors the Phase 1 home wiring: useAnaChat owns the SSE round-trip
  // with /api/ana-ri/stream. The MDX program code goes into module_context
  // so the orchestrator can ground on the active workstream.
  const programIdForAna = programForContext?.id ?? null;
  const programNameForAna = projectName ?? programForContext?.title ?? null;
  const submissionTypeForAna =
    programForContext?.pathway === 'k510' ? '510K'
    : programForContext?.pathway === 'pma' ? 'PMA'
    : programForContext?.pathway === 'cer' ? 'CER'
    : null;
  const anaChat = useAnaChat({
    projectId: programIdForAna,
    projectName: programNameForAna,
    screenName: HERE_LABEL[activeNav] || 'MDX',
    submissionType: submissionTypeForAna,
    moduleContext: { workstream: 'mdx', activeNav, anaMode },
  });

  // Adapt useAnaChat messages to the AnaRail's local AnaMessage shape.
  const messages: AnaMessage[] = React.useMemo(
    () =>
      anaChat.messages.map(m => ({
        role: m.role === 'assistant' ? ('ana' as const) : ('user' as const),
        body: m.text || (m.streaming ? (m.statusPhase || 'Routing…') : ''),
        when: m.sentAt
          ? new Date(m.sentAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
          : 'just now',
        mode: anaMode,
      })),
    [anaChat.messages, anaMode],
  );

  const askAna = React.useCallback(
    (text: string, opts: { tool?: string } = {}) => {
      if (!text) return;
      // The CmdK palette uses `tool` to dispatch named capabilities.
      // Until the server orchestrator accepts a typed tool field, embed
      // the tool id into the message text so the gateway can route it.
      const payload = opts.tool ? `>${opts.tool} ${text}`.trim() : text;
      void anaChat.send(payload);
      setAnaOpen(true);
    },
    [anaChat],
  );

  const editorRoute: 'estar' | 'pma' | 'cer' | null =
    activeNav === 'editor'      ? 'estar' :
    activeNav === 'pma-editor'  ? 'pma'   :
    activeNav === 'cer-editor'  ? 'cer'   :
    null;
  const inEditor = editorRoute !== null;
  const hereLabel = HERE_LABEL[activeNav] || 'Overview';

  let surface: React.ReactNode;
  if (editorRoute === 'estar') {
    surface = <EstarEditor initialMode={anaMode} programIdent={programForContext?.code ?? programForContext?.id ?? null} />;
  } else if (editorRoute === 'pma') {
    surface = <PmaEditor initialMode={anaMode} programIdent={programForContext?.code ?? programForContext?.id ?? null} />;
  } else if (editorRoute === 'cer') {
    surface = <CerEditor initialMode={anaMode} programIdent={programForContext?.code ?? programForContext?.id ?? null} />;
  } else if (MDX_STUBS[activeNav]) {
    surface = <InDesignSurface stub={MDX_STUBS[activeNav]} />;
  } else {
    switch (activeNav) {
      case 'k510':
        surface = <K510Surface program={programForContext} onAskAna={askAna} onOpenEditor={openEditor} />;
        break;
      case 'pma':
        surface = <PmaSurface onAskAna={askAna} onOpenEditor={() => setActiveNav('pma-editor')} />;
        break;
      case 'cer':
        surface = <CerSurface onAskAna={askAna} />;
        break;
      case 'predicate':
        surface = <PrecedentSurface onAskAna={askAna} />;
        break;
      case 'tasks':
        surface = <TasksSurface onAskAna={askAna} />;
        break;
      case 'vault':
        surface = <VaultSurface onAskAna={askAna} />;
        break;
      case 'validation':
        surface = <ValidationSurface onAskAna={askAna} />;
        break;
      case 'submissions':
        surface = <SubmissionsSurface onAskAna={askAna} />;
        break;
      case 'templates':
        surface = <TemplatesSurface />;
        break;
      case 'project-home':
        surface = (
          <ProjectHome
            program={programForContext}
            onOpenWorkbench={openWorkbench}
            onAskAna={askAna}
            onBackToOverview={() => {
              setSelectedProgram(null);
              setActiveNav('overview');
            }}
          />
        );
        break;
      case 'cer-workbench':
        surface = (
          <CerWorkbench
            onAskAna={askAna}
            onOpenEditor={() => setActiveNav('cer-editor')}
          />
        );
        break;
      case 'pre-sub':
        surface = <PreSubManager onAskAna={askAna} />;
        break;
      default:
        surface = <Overview onOpenProgram={openProgram} onAskAna={askAna} />;
    }
  }

  return (
    <div
      className={`shell${inEditor ? ' editor-mode' : ''}`}
      data-collapsed={inEditor ? true : railCollapsed}
      data-ana-open={inEditor ? false : anaOpen}
    >
      <Rail
        activeNav={activeNav}
        setActiveNav={setActiveNav}
        collapsed={inEditor ? true : railCollapsed}
        setCollapsed={setRailCollapsed}
        user={DEFAULT_USER}
      />
      <main className="main">
        {inEditor ? (() => {
          const exitNav: string =
            editorRoute === 'pma' ? 'pma' :
            editorRoute === 'cer' ? 'cer-workbench' :
            'k510';
          const exitLabel: string =
            editorRoute === 'pma' ? 'Back to PMA' :
            editorRoute === 'cer' ? 'Back to CER workbench' :
            'Back to 510(k)';
          const editorLabel: string =
            editorRoute === 'pma' ? 'PMA module editor' :
            editorRoute === 'cer' ? 'CER section editor' :
            '510(k) module editor';
          return (
            <div className="ed-breadcrumb-bar">
              <button
                className="ed-exit"
                onClick={() => setActiveNav(exitNav)}
                title={exitLabel}
              >
                {I.arrowLeft}
                <span>{exitLabel}</span>
              </button>
              <span className="ed-crumb-sep">{I.right}</span>
              <span className="ed-crumb">{EDITOR_PROGRAM.title}</span>
              <span className="ed-crumb-sep">{I.right}</span>
              <span className="ed-crumb here">{editorLabel}</span>
              <span className="tb-spacer" style={{ flex: 1 }} />
              <button
                className="tb-btn"
                onClick={() => setCmdkOpen(true)}
                title="Command palette"
              >
                {I.search}
              </button>
            </div>
          );
        })() : (
          <>
            <TopBar
              hereLabel={hereLabel}
              program={programForContext}
              onOpenPalette={() => setCmdkOpen(true)}
            />
            <TabBar activeNav={activeNav} setActiveNav={setActiveNav} />
          </>
        )}
        {inEditor ? (
          <div
            className="ed-main-scroll"
            data-screen-label={`MDX · ${editorRoute === 'pma' ? 'PMA editor' : editorRoute === 'cer' ? 'CER editor' : '510(k) editor'}`}
          >
            {surface}
          </div>
        ) : (
          <div className="page" data-screen-label={`MDX · ${hereLabel}`}>
            <div className="page-inner">{surface}</div>
          </div>
        )}
      </main>
      {!inEditor && (
        <AnaRail
          open={anaOpen}
          setOpen={setAnaOpen}
          activeNav={activeNav}
          program={programForContext}
          mode={anaMode}
          setMode={setAnaMode}
          messages={messages}
          onSend={askAna}
        />
      )}

      <CmdK
        open={cmdkOpen}
        onClose={() => setCmdkOpen(false)}
        activeNav={activeNav}
        program={programForContext}
        setActiveNav={setActiveNav}
        onAskAna={askAna}
        mode={anaMode}
        setMode={setAnaMode}
      />
    </div>
  );
}
