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
import { EngineeringSurface } from './surfaces/EngineeringSurface';
import { UdiSurface } from './surfaces/UdiSurface';
import { PostmarketSurface } from './surfaces/PostmarketSurface';
import { AnalyticsSurface } from './surfaces/AnalyticsSurface';
import { MemorySurface } from './surfaces/MemorySurface';
import { AdminSurface } from './surfaces/AdminSurface';
import {
  TasksSurface,
  ValidationSurface,
  SubmissionsSurface,
} from './workbench/Workbench';
/* Phase 5: vault + templates routing leaves the Workbench placeholder
   behind. The new full-feature VaultSurface lives at
   surfaces/VaultSurface.tsx; TemplatesSurface ships in a follow-up PR. */
import { VaultSurface } from './surfaces/VaultSurface';
import { AuditSurface } from './surfaces/AuditSurface';
import { NotificationsSurface } from './surfaces/NotificationsSurface';
import { TemplatesSurface } from './surfaces/TemplatesSurface';
import { QualitySurface } from './surfaces/QualitySurface';
/* Phase 6 — diagnostic clients. */
import { IvdSurface } from './surfaces/IvdSurface';
import { IvdrSurface } from './surfaces/IvdrSurface';
import { CdxSurface } from './surfaces/CdxSurface';
import { LdtSurface } from './surfaces/LdtSurface';
/* Phase 7 — AnA review queue, Q-Sub, SaMD, Clinical. */
import { AnaReviewSurface } from './surfaces/AnaReviewSurface';
import { QSubSurface } from './surfaces/QSubSurface';
import { SamdSurface } from './surfaces/SamdSurface';
import { ClinicalSurface } from './surfaces/ClinicalSurface';
/* Phase 8 — cross-cutting. */
import { SearchSurface } from './surfaces/SearchSurface';
import { OnboardingSurface } from './surfaces/OnboardingSurface';
import { ConversationsSurface } from './surfaces/ConversationsSurface';
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
  editor:         '510(k) module editor',
  'cer-workbench':'CER workbench (Equivalence · GSPR · PMS)',
  'pre-sub':      'Pre-submission manager',
  'pma-editor':   'PMA module editor',
  'cer-editor':   'CER section editor',
  'ana-review':   'AnA review queue',
  qsub:           'Q-Sub briefing',
  samd:           'SaMD lifecycle · IEC 62304',
  clinical:       'Clinical study management',
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
  const openEditor = () => setActiveNav('editor');

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
  } else if (activeNav === 'engineering') {
    /* Phase 4 — Device engineering surface (doc-first variant).
       Lands ahead of the MDX_STUBS check so removing 'engineering' from
       MDX_STUBS isn't required atomically. */
    surface = (
      <EngineeringSurface
        program={programForContext}
        onAskAna={askAna}
        onOpenEditor={openEditor}
      />
    );
  } else if (activeNav === 'udi') {
    /* Phase 4 — UDI and labeling surface (doc-first, cross-program). */
    surface = <UdiSurface onAskAna={askAna} onOpenEditor={openEditor} />;
  } else if (activeNav === 'postmarket') {
    /* Phase 4 — Post-market vigilance surface (doc-first, cross-program). */
    surface = <PostmarketSurface onAskAna={askAna} onOpenEditor={openEditor} />;
  } else if (activeNav === 'analytics') {
    /* Phase 4 — Analytics surface (hybrid, cross-program). */
    surface = <AnalyticsSurface onAskAna={askAna} />;
  } else if (activeNav === 'memory') {
    /* Phase 4 — AnA memory surface (no-docs variant, cross-program). */
    surface = <MemorySurface onAskAna={askAna} />;
  } else if (activeNav === 'admin') {
    /* Phase 4 — Admin and access surface (hybrid, cross-program). */
    surface = <AdminSurface onAskAna={askAna} />;
  } else if (MDX_STUBS[activeNav]) {
    surface = <InDesignSurface stub={MDX_STUBS[activeNav]} />;
  } else {
    switch (activeNav) {
      case 'k510':
        surface = <K510Surface program={programForContext} onAskAna={askAna} onOpenEditor={openEditor} />;
        break;
      case 'pma':
        surface = <PmaSurface program={programForContext} onAskAna={askAna} onOpenEditor={() => setActiveNav('pma-editor')} />;
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
        surface = <VaultSurface onAskAna={askAna} onOpenEditor={openEditor} />;
        break;
      case 'validation':
        surface = <ValidationSurface onAskAna={askAna} />;
        break;
      case 'submissions':
        surface = <SubmissionsSurface onAskAna={askAna} />;
        break;
      case 'templates':
        surface = <TemplatesSurface onAskAna={askAna} onOpenEditor={openEditor} />;
        break;
      case 'audit':
        /* Phase 5 — dedicated audit log viewer (separate from the
           24-hour band on Admin). */
        surface = <AuditSurface onAskAna={askAna} onOpenEditor={openEditor} />;
        break;
      case 'notifications':
        /* Phase 5 — cross-surface signal inbox. */
        surface = <NotificationsSurface onAskAna={askAna} />;
        break;
      case 'quality':
        /* Phase 5 — Quality system (QSR/QMSR + ISO 13485). */
        surface = <QualitySurface onAskAna={askAna} onOpenEditor={openEditor} />;
        break;
      case 'ivd':
        /* Phase 6 — IVD pathway (analytical + clinical performance, CLIA, ISO 17511). */
        surface = (
          <IvdSurface
            program={programForContext}
            onAskAna={askAna}
            onOpenEditor={openEditor}
          />
        );
        break;
      case 'ivdr':
        /* Phase 6 — EU IVDR (PER, Annex VIII, notified body, EUDAMED IVD). */
        surface = (
          <IvdrSurface
            program={programForContext}
            onAskAna={askAna}
            onOpenEditor={openEditor}
          />
        );
        break;
      case 'cdx':
        /* Phase 6 — Companion diagnostic with paired drug-device timeline. */
        surface = (
          <CdxSurface
            program={programForContext}
            onAskAna={askAna}
            onOpenEditor={openEditor}
          />
        );
        break;
      case 'ldt':
        /* Phase 6 — LDT compliance (FDA 2024 rule phase tracker). */
        surface = <LdtSurface onAskAna={askAna} onOpenEditor={openEditor} />;
        break;
      case 'ana-review':
        /* Phase 7 — AnA-generated draft review queue. */
        surface = <AnaReviewSurface program={programForContext} onAskAna={askAna} />;
        break;
      case 'qsub':
        /* Phase 7 — Pre-Submission (Q-Sub) briefing-document workspace. */
        surface = (
          <QSubSurface
            program={programForContext}
            onAskAna={askAna}
            onOpenEditor={openEditor}
          />
        );
        break;
      case 'samd':
        /* Phase 7 — IEC 62304 SaMD software-lifecycle workspace. */
        surface = (
          <SamdSurface
            program={programForContext}
            onAskAna={askAna}
            onOpenEditor={openEditor}
          />
        );
        break;
      case 'clinical':
        /* Phase 7 — Clinical study management (sites, deviations, adjudication). */
        surface = (
          <ClinicalSurface
            program={programForContext}
            onAskAna={askAna}
            onOpenEditor={openEditor}
          />
        );
        break;
      case 'search':
        /* Phase 8 — global cross-corpus search. */
        surface = <SearchSurface program={programForContext} onAskAna={askAna} />;
        break;
      case 'onboarding':
        /* Phase 8 — migration importer wizard. */
        surface = <OnboardingSurface onAskAna={askAna} />;
        break;
      case 'conversations':
        /* Phase 8 — AnA conversation history. */
        surface = (
          <ConversationsSurface program={programForContext} onAskAna={askAna} />
        );
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
            program={programForContext}
            onAskAna={askAna}
            onOpenEditor={() => setActiveNav('cer-editor')}
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
            <TabBar activeNav={activeNav} setActiveNav={setActiveNav} programs={programs} />
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
