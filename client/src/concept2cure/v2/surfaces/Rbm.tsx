import React, { useState, useEffect, useMemo, useRef } from 'react';
import { authService, useAuthUser } from '@/services/portal/authService';
import { getAuthToken } from '@/utils/authToken';
import { I } from '../icons';
import type { OwnedSurfaceViewProps } from '../surfaceViews';
import { useLiveData, EmptyState, ProjectBack, type DataReadOwner } from '../dataConnect';
import { captureShellProjectGuard, publishShellProject, shellProgramId, useShellProject, type ShellProject } from '../shellProject';
import { useAuthoringReadSession } from '../editor/authoringCurrentRead';
import { RBM_NAV, RBM_LINKS } from '../fixtures/rbm-data';
import type { RbmBoard, RbmProgram } from './rbmBoard';
import { isRbmProgramRows, rbmBoardHasData } from './rbmBoard';
import { rbmWrite, RbmWriteNote } from './rbmWrites';
import {
  SeedEmpty,
  RbmAnaDock,
  RbmAnaComposer,
  RbmStarters,
  type RbmAnaMessage,
  RbmOverview,
  RbmReport,
  RbmRact,
  RbmKris,
  RbmQtls,
  RbmSignals,
  RbmPatients,
  RbmSites,
  RbmOversight,
  RbmPlan,
} from './RbmSurfaces';
import { useAnaChat } from '../../components/ana/useAnaChat';
import { activityPropsFor, hasReportableWork } from '../AnaActivity';
import '../styles/project-home-v2.css';
import '../styles/rbm-v2.css';

/* ── Surface component map — every sub-surface reads its slice from the live
   board (GET /api/mdx-rbm/rbm-board/:programId) passed as `board`. ── */
type SubSurface = React.ComponentType<{
  board: RbmBoard;
  onTab?: (id: string) => void;
  onAsk?: (t: string) => void;
  onNav?: (id: string) => void;
  onReload?: () => void;
}>;

const SURFACES: Record<string, SubSurface> = {
  overview: RbmOverview,
  report: RbmReport,
  ract: RbmRact,
  kris: RbmKris,
  qtls: RbmQtls,
  signals: RbmSignals,
  patients: RbmPatients,
  sites: RbmSites,
  oversight: RbmOversight,
  plan: RbmPlan,
};

/* ── Seed action map ── */
const SEED_ACTIONS: Record<string, string[]> = {
  overview: ['Seed risk assessment', 'Seed KRIs', 'Seed QTLs', 'Recompute site risk'],
  report: ['Seed risk assessment'],
  ract: ['Seed a default ICH E6(R3) assessment'],
  kris: ['Seed the standard KRI library'],
  qtls: ['Propose quality tolerance limits'],
  signals: ['Run central monitoring'],
  patients: ['Scan the patient cohort'],
  sites: ['Recompute site risk'],
  oversight: ['Recompute site risk'],
  plan: ['Generate a risk-based monitoring plan'],
};

/* Each seed button is the deterministic engine write it names (J5-03,
   2026-11-06). They used to ask AnA, so with no model a tester's "Seed risk
   assessment" did nothing, while the writes below already existed. Every one
   takes the project id and is admitted by the server's own project check. */
const SEED_WRITES: Record<string, string> = {
  'Seed risk assessment': '/rbm-assessments/seed',
  'Seed a default ICH E6(R3) assessment': '/rbm-assessments/seed',
  'Seed KRIs': '/rbm-kris/seed',
  'Seed the standard KRI library': '/rbm-kris/seed',
  'Seed QTLs': '/rbm-qtls/seed',
  'Propose quality tolerance limits': '/rbm-qtls/seed',
  'Run central monitoring': '/rbm-central-monitoring/run',
  'Scan the patient cohort': '/rbm-patient-profiles/score',
  'Recompute site risk': '/rbm-site-risk/recompute',
  'Generate a risk-based monitoring plan': '/rbm-monitoring-plans/generate',
};

/* ── Icon map for cross-app links ── */
const LINK_ICONS: Record<string, string> = {
  project: 'folder',
  vault: 'vault',
  biostats: 'sigma',
  tasks: 'checkSquare',
};

/* ════════════════════════════════════════════════════════════════════
   Rbm — the RBM domain shell.

   The study picker lists the real programs that have RBM data
   (GET /api/mdx-rbm/rbm-programs); selecting one loads its live board and the
   sub-surfaces render from it. When the org has no RBM data, or a study has none
   yet, an honest empty / seed state is shown — never a fixture.

   Every control that appears to change something writes to the server
   (/api/mdx/rbm-*) and then bumps `reloadKey` so the board is re-fetched and the
   surface re-derives from what was actually stored. There is no local
   optimistic layer and no sample data anywhere in this shell, which is why the
   "Sample data" tag is gone rather than merely hidden.
   ════════════════════════════════════════════════════════════════════ */

/* `onAsk` is deliberately absent. RBM owns its conversation — the dock at
   `RbmSurfaces.tsx` runs its own study-scoped `useAnaChat`, and what it passes
   down as `onAsk={askAna}` is that local sender, not the shell's. The prop was
   destructured here and never read, which is exactly the shape the union
   exists to forbid: a surface that hides the rail while still holding the
   handle that writes into it. */
/**
 * How many attention items the AnA context carries. The feed on screen is not
 * capped; this bounds only what the narrator is handed, and the context declares
 * the total beside it so a truncated list cannot read as the whole board.
 */
const ATTENTION_CONTEXT_CAP = 8;

/** Under this width the conversation cannot sit beside the board: it opens as a drawer over it (D7.md §C.4.6). */
const DOCK_MIN_WIDTH = 1024;

/** True while the window is narrower than the docked width. A browser without matchMedia is treated as wide. */
function useNarrowWindow(): boolean {
  const query = `(max-width: ${DOCK_MIN_WIDTH - 1}px)`;
  const read = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
  const [narrow, setNarrow] = useState(read);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const media = window.matchMedia(query);
    const onChange = () => setNarrow(media.matches);
    onChange();
    media.addEventListener?.('change', onChange);
    return () => media.removeEventListener?.('change', onChange);
  }, [query]);
  return narrow;
}

export function Rbm(props: OwnedSurfaceViewProps) {
  const project = useShellProject();
  const session = useAuthoringReadSession(useAuthUser());
  const projectId = shellProgramId(project);
  const visit = useRef({ guard: captureShellProjectGuard(), revision: 1 });
  if (!visit.current.guard()) visit.current = { guard: captureShellProjectGuard(), revision: visit.current.revision + 1 };
  const captured = visit.current;
  const owner = useMemo(() => {
    return { key: JSON.stringify([session.actor, session.key, projectId, captured.revision]), current: () => {
      const bearer = getAuthToken();
      return visit.current === captured && captured.guard() && session.sameRevision() && Boolean(authService.getUser())
        && Boolean(bearer) && authService.captureSessionReadGuard(bearer ?? undefined).current();
    } };
  }, [session, projectId, captured]);
  return <RbmWorkspace key={owner.key} {...props} project={project} owner={owner} />;
}

function RbmWorkspace({ onNav, liveDrive, project, owner }: OwnedSurfaceViewProps & { project: ShellProject | null; owner: DataReadOwner }) {
  const [tab, setTab] = useState('overview');
  /* AnA's conversation leads this screen (the founder, 2026-11-12: "place AnA chat prominently more"). Where
     there is room beside the board it is open on arrival; on a narrow window it would cover the board, so it
     waits there behind the composer under the title, and opens as a drawer on the first question. */
  const narrow = useNarrowWindow();
  const [anaChoice, setAnaOpen] = useState<boolean | null>(null);
  const anaOpen = anaChoice ?? !narrow;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const current = () => mounted.current && owner.current();
  const readOwner = useMemo(() => ({ key: owner.key, current: () => mounted.current && owner.current() }), [owner]);
  // Bumped after a persisted write so the board re-fetches and the surface
  // re-derives from server truth (never optimistic local state).
  const [reloadKey, setReloadKey] = useState(0);
  const [rosterEpoch, setRosterEpoch] = useState(0);
  const reload = () => { if (current()) setReloadKey(k => k + 1); };
  const retryRoster = () => { if (current()) setRosterEpoch(epoch => epoch + 1); };

  // The server admits real projects with RBM selected or existing monitoring records.
  const roster = useLiveData<RbmProgram[]>('/api/mdx-rbm/rbm-programs', [owner.key, rosterEpoch], isRbmProgramRows, readOwner);
  const programs = { ...roster, rows: roster.loading || roster.error ? [] : roster.data ?? [] };
  const reconciliationRequired = programs.meta?.reconciliationRequired === true;
  const requestedProject = shellProgramId(project);
  const selProgram = programs.rows.find(p => p.id.toLowerCase() === requestedProject) ?? null;
  const study = selProgram?.id ?? null;
  const boardPath = study ? '/api/mdx-rbm/rbm-board/' + study : null;
  const board = useLiveData<RbmBoard>(boardPath, [boardPath, reloadKey], undefined, readOwner);
  const bd = board.data;
  // useLiveData keeps the previous study's board while the next request is in
  // flight, so `bd` can still belong to the old program right after a study
  // switch. Only treat the board as ready when it actually matches the selected
  // study — otherwise the prior study's risk data would render (and be
  // interactive) under the new selection until the fetch resolves.
  const boardReady = current() && !board.loading && !board.error && !!bd && bd.programId === study;
  const hasData = boardReady && rbmBoardHasData(bd);

  const studyLabel = selProgram?.label ?? 'the study';
  const nav = RBM_NAV.find(n => n.id === tab)!;
  const selectProject = (id: string) => {
    if (!current() || programs.loading || programs.error) return;
    const selected = programs.rows.find(row => row.id === id);
    if (!selected) return;
    publishShellProject({ id: selected.id, title: selected.label, code: selected.code ?? undefined,
      productType: selected.productType ?? undefined });
  };
  const navigate = (target: string) => { if (current() && study) onNav?.(target); };
  /* The open project, when the roster does not list it: it has neither the
     New project flag nor a monitoring record yet. Starting it is the RACT
     seed for that project; the server admits it only with project access. */
  const unstarted = !programs.loading && !programs.error && !reconciliationRequired && requestedProject && !selProgram ? requestedProject : null;
  const [writing, setWriting] = useState(false);
  const [writeNote, setWriteNote] = useState<string | null>(null);
  const runSeed = async (label: string, programId: string | null) => {
    const path = SEED_WRITES[label];
    if (!path || !programId || writing || !current()) return;
    setWriting(true); setWriteNote(null);
    try {
      await rbmWrite('POST', path, { programId });
      if (!current()) return;
      retryRoster(); reload();
    } catch (failure) {
      if (current()) setWriteNote(failure instanceof Error ? failure.message : 'The change was not saved.');
    } finally {
      if (mounted.current) setWriting(false);
    }
  };
  const startEmpty = unstarted ? (
    <div>
      <SeedEmpty
        title="Risk-based monitoring has not started for this project"
        body="Starting it records the ICH E6(R3) default risk assessment (RACT) for the open project, ready to tailor. No indicator, limit or score is recorded until you add or seed it."
        actions={['Start risk-based monitoring']}
        onRun={() => void runSeed('Seed risk assessment', unstarted)}
      />
      <RbmWriteNote note={writeNote} />
    </div>
  ) : null;

  /* AnA — the REAL streaming assistant (/api/ana-ri/stream), grounded to the
     selected RBM program. The former rbmAnaResolve() heuristic that fabricated
     canned cards from fixture constants is gone: the dock now shows the real
     turn (streamed text, executed actions, and the real Part 11 sign-off for a
     governed command). */
  /* What AnA can see of this screen — through this surface's OWN conversation.
     RBM owns the rail's column, so `usePublishSurfaceContext` is the wrong
     channel here: nothing in this shell reads it, because the shell's rail is
     not drawn. The grounding channel for an owned conversation is the
     `moduleContext` its own `useAnaChat` forwards, exactly as
     `document-authoring` and `ectd-coauthor` already do.

     This hook passed none. So the dock ran the real assistant, on the real
     endpoint, with the real study id — and could still not name a single KRI,
     QTL breach or flagged site on the screen beside it, on a surface whose only
     subject is those readings.

     A NOT-READY board publishes as not ready. `boardReady` is false while a
     study switch is in flight, and `bd` still holds the PREVIOUS study's risk
     data in that window; grounding on it would have AnA discuss one study's
     KRIs under another study's name. */
  const anaModuleContext = useMemo(() => {
    if (!study) {
      return {
        surface: 'rbm',
        studySelected: false,
        note: 'No study is selected, so no RBM board is on screen.',
      };
    }
    if (board.error) {
      return {
        surface: 'rbm',
        studyId: study,
        studyLabel,
        boardReady: false,
        note: 'The RBM board could not be read, so no risk readings are on screen — a failure, not a clean board.',
      };
    }
    if (board.loading || !boardReady) {
      return {
        surface: 'rbm',
        studyId: study,
        studyLabel,
        boardReady: false,
        note: 'The RBM board for this study is still loading.',
      };
    }
    if (!hasData || !bd) {
      return {
        surface: 'rbm',
        studyId: study,
        studyLabel,
        boardReady: true,
        boardSeeded: false,
        note: 'This study has no RBM data seeded yet, so the board is genuinely empty.',
      };
    }
    return {
      surface: 'rbm',
      studyId: study,
      studyLabel,
      openTab: tab,
      boardReady: true,
      boardSeeded: true,
      asOf: bd.asOf,
      summary: bd.summary,
      /* The punch-list the overview leads with, capped — enough for AnA to name
         an item back to the user, not the whole board.
         THE CAP IS DECLARED, not silent (coverage review C-6). It used to publish
         `slice(0, 8)` alone, so a severity-ranked regulatory attention list with
         nine items reached the narrator as eight with nothing saying so, and the
         model could then answer "these are the items needing attention" over a
         truncated list. Under Rule 2 the engine supplies the figures; a figure
         the narrator cannot tell is partial is worse than no figure. The
         total-beside-the-cap shape is the one CommunicationCenter.tsx already
         uses for its agency inbox.
         The HUMAN feed is NOT capped — RbmSurfacesA.tsx renders `board.attention`
         in full — so this is the narrator's view only, and the review's claim
         that item 9 is hidden from a reader does not hold. */
      attentionTotal: (bd.attention ?? []).length,
      attentionShown: Math.min(ATTENTION_CONTEXT_CAP, (bd.attention ?? []).length),
      attentionOrdering: 'severity-ranked (critical, high, medium); the items below are the most severe',
      attention: (bd.attention ?? []).slice(0, ATTENTION_CONTEXT_CAP).map(a => ({ severity: a.sev, kind: a.kind, tab: a.nav, title: a.t, detail: a.d })),
      reportApproved: bd.report ? bd.report.approved : null,
      storeProvisioned: bd.pendingStore ? false : true,
    };
  }, [study, studyLabel, tab, board.loading, board.error, boardReady, hasData, bd]);
  const anaChat = useAnaChat({
    screenName: 'rbm',
    projectId: study ?? undefined,
    moduleContext: anaModuleContext,
    // Live Drive bridge — same opt-in and shell-level apply machine as the rail.
    liveDrive: liveDrive?.on,
    onDriveEvent: liveDrive?.onDriveEvent,
    onArtifactSaved: liveDrive?.onWorkSaved,
  });
  /* Each turn with the shared record of her work and its output card. The
     waiting state is the record's live phase — never "Thinking…". */
  const anaMsgs: RbmAnaMessage[] = anaChat.messages.map(m => {
    const activity = activityPropsFor(m);
    return {
      role: m.role,
      text: m.text,
      executedActions: m.executedActions,
      pendingSignoffs: m.pendingSignoffs,
      activity: m.role === 'assistant' && (m.streaming || hasReportableWork(activity)) ? activity : undefined,
      output: m.generatedDraft?.title ? { generatedDraft: m.generatedDraft, streaming: m.streaming } : undefined,
    };
  });
  const askAna = (text: string) => {
    if (!text || !current() || !study) return;
    if (!anaOpen) setAnaOpen(true);
    void anaChat.send(text);
  };

  const Body = SURFACES[tab];
  if (!current()) return <EmptyState title="Risk-based monitoring is unavailable for this session" hint="Reopen monitoring after selecting your account and project." />;

  /* The conversation names the study by its code ("LMN-201"), which is how a team says it; a project with no code
     is named as the picker names it. The full name made the dock's question three lines long. */
  const studyName = selProgram ? (selProgram.code?.trim() || studyLabel.split(' --')[0]) : '';
  /* The study's size, in the title's one sentence. It was a caption under the picker; the board is its only source,
     so nothing is said until this study's board has been read. */
  const counted = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
  const studySize = bd && bd.programId === study
    ? `: ${counted(bd.summary.sites.total, 'site')}, ${counted(bd.summary.patients.scored, 'subject')} scored.`
    : '.';
  const toggleAna = () => { if (current()) setAnaOpen(!anaOpen); };

  return (
    <div className="page-inner rbm-page" data-work-area="rbm" data-screen-label={`RBM — ${nav.label}`}>
      <ProjectBack onNav={onNav} />
      <header className="ph">
        <div>
          <h1 className="ph-title">Risk-based monitoring</h1>
          <p className="ph-sub">ICH E6(R3) risk-based quality management for the study{studySize}</p>
        </div>
        <div className="ph-acts">
          <select
            className="c2c-input rbm-study-sel"
            value={study ?? ''}
            onChange={e => selectProject(e.target.value)}
            aria-label="Select a project for risk-based monitoring"
            disabled={programs.loading || Boolean(programs.error) || programs.rows.length === 0}
          >
            <option value="">{programs.rows.length ? 'Choose a project' : 'No monitoring projects'}</option>
            {programs.rows.map(s => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
          </select>
          {/* The conversation's own control, where the title is: it replaces the sideways "AnA" strip that was
              left at the board's edge when the dock was closed. */}
          <button type="button" className="btn ghost rbm-ana-toggle" aria-pressed={anaOpen} onClick={toggleAna}
            title={anaOpen ? 'Close the conversation with AnA' : 'Open the conversation with AnA'}>
            <span className="mk" aria-hidden="true">{'✻'}</span>AnA
          </button>
        </div>
      </header>

      {/* With the conversation closed, AnA is still the first thing under the title: her composer and the open
          tab's suggestions. A question opens the conversation and sends. */}
      {!anaOpen && study && (
        <div className="rbm-askbar" role="group" aria-label="Ask AnA">
          <RbmAnaComposer study={studyName} onSend={askAna} />
          <RbmStarters nav={nav} onAsk={askAna} layout="row" />
        </div>
      )}

      <div className="rbm-links">
        <span className="rbm-links-l">{I.network}Linked to</span>
        {(['project', 'vault', 'tasks', 'biostats'] as const).map(k => {
          const L = RBM_LINKS[k];
          return (
            <button
              key={k}
              className="rbm-link"
              aria-label={`${L.label} ${L.value}`}
              onClick={() => navigate(k === 'project' ? 'project-home' : L.surface)}
              disabled={!study}
              title={L.note}
            >
              <span className="rbm-link-ico">
                {(I as Record<string, React.ReactNode>)[LINK_ICONS[k] || 'folder']}
              </span>
              <span className="rbm-link-t">
                <b>{L.label}</b>
                <em>{L.value}</em>
              </span>
            </button>
          );
        })}
      </div>

      {reconciliationRequired && <p className="rbm-note" role="status">Some project relationships need repair before monitoring can be shown. No unavailable project details are supplied.</p>}

      <div className="tabs" role="tablist">
        {RBM_NAV.map(n => (
          <button
            key={n.id}
            role="tab"
            aria-selected={tab === n.id}
            className="tab"
            onClick={() => { if (current()) setTab(n.id); }}
          >
            {n.label}
          </button>
        ))}
      </div>

      <div className={`rbm-workarea${anaOpen && !narrow ? ' wa-split' : ''}`} data-ana={anaOpen || undefined}>
        <div className="rbm-content">
          {programs.loading ? (
            <EmptyState title="Loading RBM studies…" icon={I.clock} />
          ) : programs.error ? (
            <EmptyState
              tone="error"
              icon={I.alertTriangle}
              title="Couldn't load RBM studies"
              hint="The risk-based monitoring service didn't respond. Nothing is shown from a cached sample."
              retry={retryRoster}
            />
          ) : startEmpty ? (
            startEmpty
          ) : programs.rows.length === 0 ? (
            <EmptyState
              icon={I.clipboardList}
              title={reconciliationRequired ? 'Monitoring project relationships need repair' : 'No monitoring projects yet'}
              hint={reconciliationRequired ? 'Ask your project administrator to repair the project relationships before opening monitoring.' : 'Open a project and start its monitoring here, or select risk-based monitoring when setting up a project. Projects with recorded monitoring data appear here; no risk assessment or score is invented.'}
            />
          ) : !study ? (
            <EmptyState icon={I.folder}
              title={project ? 'This project is not available for risk-based monitoring' : 'Choose a project for risk-based monitoring'}
              hint="Choose an accessible monitoring project from the project selector. Another project is never opened automatically." />
          ) : board.error ? (
            <EmptyState
              tone="error"
              icon={I.alertTriangle}
              title="Couldn't load the RBM board"
              hint="The board didn't respond for this study. Nothing is shown from a cached sample."
              retry={reload}
            />
          ) : board.loading || !bd || bd.programId !== study ? (
            <EmptyState title="Loading the RBM board…" icon={I.clock} />
          ) : hasData ? (
            <Body
              key={bd.programId + '@' + bd.asOf}
              board={bd}
              onTab={next => { if (current()) setTab(next); }}
              onAsk={askAna}
              onNav={navigate}
              onReload={reload}
            />
          ) : (
            <SeedEmpty
              title={`No RBM data for ${studyLabel} yet`}
              body="This study has no risk assessment, indicators or tolerance limits. Seeding creates the ICH E6(R3) TransCelerate defaults, scoped to this study, ready to tailor."
              actions={SEED_ACTIONS[tab] || SEED_ACTIONS.overview}
              onRun={a => SEED_WRITES[a] ? void runSeed(a, study) : askAna(`${a} for ${studyLabel}`)}
            />
          )}
          {!startEmpty && <RbmWriteNote note={writeNote} />}
        </div>
        {anaOpen && (
          <RbmAnaDock
            nav={nav}
            study={studyName}
            msgs={anaMsgs}
            onAsk={askAna}
            onClose={() => { if (current()) setAnaOpen(false); }}
            onNav={navigate}
            onStartDemo={liveDrive?.onStartDemo}
            drawer={narrow}
            /* The live work dock reads the raw turns: phases, tool timings,
               pending steers and outputs the pane's message shape does not carry. */
            work={{
              messages: anaChat.messages,
              streaming: anaChat.isStreaming,
              runStatus: anaChat.runStatus,
              pendingSteers: anaChat.pendingSteers,
            }}
          />
        )}
      </div>
    </div>
  );
}
