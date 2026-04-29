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
import { ComingSoon } from './_stubs/ComingSoon';
import { ANA_MODES, MDX_STUBS, type AnaMode } from './data/nav';
import { MDX_PROGRAMS, type Program } from './data/programs';
import { EDITOR_PROGRAM } from './data/editor';

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

export function App() {
  const [activeNav,    setActiveNav]    = React.useState<string>(() => getStored('mdx.activeNav', 'overview'));
  const [railCollapsed,setRailCollapsed]= React.useState<boolean>(() => getStored('mdx.railCollapsed', false));
  const [anaOpen,      setAnaOpen]      = React.useState<boolean>(() => getStored('mdx.anaOpen', false));
  const [anaMode,      setAnaMode]      = React.useState<AnaMode['id']>(() => getStored('mdx.anaMode', 'standard'));
  const [selectedProgram, setSelectedProgram] = React.useState<Program | null>(null);
  const [cmdkOpen, setCmdkOpen] = React.useState(false);
  const [messages, setMessages] = React.useState<AnaMessage[]>([]);

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

  const askAna = (text: string, opts: { tool?: string } = {}) => {
    if (!text) return;
    const now = 'just now';
    const activeMode = ANA_MODES.find(m => m.id === anaMode)!;
    setMessages(ms => [
      ...ms,
      { role: 'user', body: text, when: now, mode: anaMode },
      {
        role: 'ana',
        body: opts.tool
          ? `Would run \`${opts.tool}\` via gateway in ${activeMode.label} mode.`
          : 'Routing via gateway… (this is the UI stub — real response streams here in production).',
        when: now,
        mode: anaMode,
      },
    ]);
    setAnaOpen(true);
  };

  const inEditor = activeNav === 'editor';
  const hereLabel = HERE_LABEL[activeNav] || 'Overview';

  let surface: React.ReactNode;
  if (inEditor) {
    surface = <EstarEditor initialMode={anaMode} />;
  } else if (MDX_STUBS[activeNav]) {
    surface = <InDesignSurface stub={MDX_STUBS[activeNav]} />;
  } else {
    switch (activeNav) {
      case 'k510':
        surface = <K510Surface program={programForContext} onAskAna={askAna} onOpenEditor={openEditor} />;
        break;
      case 'pma':
        surface = <PmaSurface onAskAna={askAna} />;
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
      // Surfaces whose source files are absent in this kit drop:
      case 'cer-workbench':
        surface = (
          <ComingSoon
            title="CER seven-tab workbench"
            description="Equivalence, GSPR, Literature corpus, Signals, PMS and Generator sub-tabs ship in a later kit drop. Use the basic CER surface in the meantime."
            icon="microscope"
          />
        );
        break;
      case 'pre-sub':
        surface = (
          <ComingSoon
            title="Pre-submission manager"
            description="Q-Sub pipeline, question authoring, FDA response matching, and commitment tracking ship in a later kit drop."
            icon="clipboardList"
          />
        );
        break;
      case 'pma-editor':
        surface = (
          <ComingSoon
            title="PMA module editor"
            description="The shared three-pane DocumentEditor primitive that powers PMA and CER section editing ships in a later kit drop. The eSTAR editor for 510(k) is available now from the 510(k) surface."
            icon="shieldCheck"
          />
        );
        break;
      case 'cer-editor':
        surface = (
          <ComingSoon
            title="CER section editor"
            description="The shared three-pane DocumentEditor primitive that powers PMA and CER section editing ships in a later kit drop."
            icon="microscope"
          />
        );
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
        {inEditor ? (
          <div className="ed-breadcrumb-bar">
            <button
              className="ed-exit"
              onClick={() => setActiveNav('k510')}
              title="Back to 510(k)"
            >
              {I.arrowLeft}
              <span>Back to 510(k)</span>
            </button>
            <span className="ed-crumb-sep">{I.right}</span>
            <span className="ed-crumb">{EDITOR_PROGRAM.title}</span>
            <span className="ed-crumb-sep">{I.right}</span>
            <span className="ed-crumb here">510(k) module editor</span>
            <span className="tb-spacer" style={{ flex: 1 }} />
            <button
              className="tb-btn"
              onClick={() => setCmdkOpen(true)}
              title="Command palette"
            >
              {I.search}
            </button>
          </div>
        ) : (
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
          <div className="ed-main-scroll" data-screen-label="MDX · 510(k) editor">
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
