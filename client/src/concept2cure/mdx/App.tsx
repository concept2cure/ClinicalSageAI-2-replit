/**
 * MDX root component — composes Shell + the active surface.
 *
 * Ported from design-system/ui_kits/mdx/App.jsx. The kit's TweaksPanel +
 * postMessage editor-mode plumbing is omitted; v2 doesn't run the design-tool
 * harness. State that survives sessions (rail collapsed, AnA open, mode,
 * active surface) is in localStorage.
 */

import * as React from 'react';
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
import { EngineeringSurface } from './surfaces/EngineeringSurface';
import { UdiSurface } from './surfaces/UdiSurface';
import { PostmarketSurface } from './surfaces/PostmarketSurface';
import { AnalyticsSurface } from './surfaces/AnalyticsSurface';
import { MemorySurface } from './surfaces/MemorySurface';
import { AdminSurface } from './surfaces/AdminSurface';
import {
  TasksSurface,
  VaultSurface,
  ValidationSurface,
  SubmissionsSurface,
  TemplatesSurface,
} from './workbench/Workbench';
import { ProjectHome } from './projectHome/ProjectHome';
import { PreSubManager } from './presub/PreSubManager';
import { type AnaMode } from './data/nav';
import { MDX_PROGRAMS, type Program } from './data/programs';
import { useAnaChat } from '../components/ana/useAnaChat';
import { useMdxPrograms } from './hooks/useMdxPrograms';

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
  'pre-sub':      'Pre-submission manager',
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
  /** Open the Phase 9 Universal Authoring shell on a doc type. The host swaps
   *  to the authoring layout — MDX no longer owns per-pathway editors. */
  onOpenAuthoring?: (docType?: string) => void;
}

export function App({ initialNav, projectName, onOpenAuthoring }: AppProps = {}) {
  const [activeNav,    setActiveNav]    = React.useState<string>(() =>
    initialNav ?? getStored('mdx.activeNav', 'overview'),
  );
  const [railCollapsed,setRailCollapsed]= React.useState<boolean>(() => getStored('mdx.railCollapsed', false));
  const [anaOpen,      setAnaOpen]      = React.useState<boolean>(() => getStored('mdx.anaOpen', false));
  const [anaMode,      setAnaMode]      = React.useState<AnaMode['id']>(() => getStored('mdx.anaMode', 'standard'));
  const [selectedProgram, setSelectedProgram] = React.useState<Program | null>(null);
  const [cmdkOpen, setCmdkOpen] = React.useState(false);

  /* Single source of truth for the program list — feeds TabBar counts,
     the Overview surface, and pathway-default lookup below. Falls back to
     the kit fixture only during the initial fetch / on error so the shell
     doesn't render with zero counts. */
  const liveProgramsResult = useMdxPrograms();
  const programs: Program[] = liveProgramsResult.programs ?? MDX_PROGRAMS;

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
  // Phase 9: authoring is the single editor. The host (ZenApp) owns the
  // authoring layout; MDX hands off the doc type derived from the pathway.
  const openAuthoring = (docType?: string) => onOpenAuthoring?.(docType);

  const programForContext = React.useMemo<Program | null>(() => {
    if (selectedProgram) return selectedProgram;
    if (activeNav === 'k510')         return programs.find(p => p.pathway === 'k510') ?? null;
    if (activeNav === 'pma')          return programs.find(p => p.pathway === 'pma')  ?? null;
    if (activeNav === 'cer')          return programs.find(p => p.pathway === 'cer')  ?? null;
    if (activeNav === 'project-home') return programs[0] ?? null;
    return null;
  }, [activeNav, selectedProgram, programs]);

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

  const hereLabel = HERE_LABEL[activeNav] || 'Overview';

  let surface: React.ReactNode;
  {
    switch (activeNav) {
      case 'engineering':
        surface = <EngineeringSurface program={programForContext} onAskAna={askAna} />;
        break;
      case 'udi':
        surface = <UdiSurface onAskAna={askAna} />;
        break;
      case 'postmarket':
        surface = <PostmarketSurface onAskAna={askAna} />;
        break;
      case 'analytics':
        surface = <AnalyticsSurface onAskAna={askAna} />;
        break;
      case 'memory':
        surface = <MemorySurface onAskAna={askAna} />;
        break;
      case 'admin':
        surface = <AdminSurface onAskAna={askAna} />;
        break;
      case 'k510':
        surface = <K510Surface program={programForContext} onAskAna={askAna} onOpenEditor={() => openAuthoring('k510')} />;
        break;
      case 'pma':
        surface = <PmaSurface program={programForContext} onAskAna={askAna} onOpenEditor={() => openAuthoring('pma')} />;
        break;
      case 'cer':
        surface = <CerSurface program={programForContext} onAskAna={askAna} />;
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
        surface = <TemplatesSurface onAskAna={askAna} />;
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
      case 'pre-sub':
        surface = <PreSubManager onAskAna={askAna} />;
        break;
      default:
        surface = <Overview programs={programs} onOpenProgram={openProgram} onAskAna={askAna} />;
    }
  }

  return (
    <div
      className="shell"
      data-collapsed={railCollapsed}
      data-ana-open={anaOpen}
    >
      <Rail
        activeNav={activeNav}
        setActiveNav={setActiveNav}
        collapsed={railCollapsed}
        setCollapsed={setRailCollapsed}
        user={DEFAULT_USER}
      />
      <main className="main">
        <TopBar
          hereLabel={hereLabel}
          program={programForContext}
          onOpenPalette={() => setCmdkOpen(true)}
        />
        <TabBar activeNav={activeNav} setActiveNav={setActiveNav} programs={programs} />
        <div className="page" data-screen-label={`MDX · ${hereLabel}`}>
          <div className="page-inner">{surface}</div>
        </div>
      </main>
      {true && (
        // No projectId passed to AnaRail: the MDX context id is a device/program
        // id, not a numeric project id, and /api/chat/upload 400s on a non-numeric
        // projectId. Uploads here stay org-scoped until MDX exposes a real project id.
        <AnaRail
          open={anaOpen}
          setOpen={setAnaOpen}
          activeNav={activeNav}
          program={programForContext}
          mode={anaMode}
          setMode={setAnaMode}
          messages={messages}
          onSend={askAna}
          onNewThread={() => anaChat.reset()}
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
