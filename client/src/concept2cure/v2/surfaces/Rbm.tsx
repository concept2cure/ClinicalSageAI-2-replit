import React, { useState, useEffect, useMemo } from 'react';
import { I } from '../icons';
import type { OwnedSurfaceViewProps } from '../surfaceViews';
import { useLiveData, useLiveRows, EmptyState } from '../dataConnect';
import { RBM_NAV, RBM_LINKS } from '../fixtures/rbm-data';
import type { RbmBoard, RbmProgram } from './rbmBoard';
import { rbmBoardHasData } from './rbmBoard';
import {
  SeedEmpty, RbmAnaDock, type RbmAnaMessage,
  RbmOverview, RbmReport, RbmRact, RbmKris, RbmQtls,
  RbmSignals, RbmPatients, RbmSites, RbmOversight, RbmPlan,
} from './RbmSurfaces';
import { useAnaChat } from '../../components/ana/useAnaChat';
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
  overview: RbmOverview, report: RbmReport, ract: RbmRact,
  kris: RbmKris, qtls: RbmQtls, signals: RbmSignals,
  patients: RbmPatients, sites: RbmSites, oversight: RbmOversight,
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

/* ── Icon map for cross-app links ── */
const LINK_ICONS: Record<string, string> = {
  project: 'folder', vault: 'vault', biostats: 'sigma', tasks: 'checkSquare',
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
export function Rbm({ onNav, liveDrive }: OwnedSurfaceViewProps) {
  const [study, setStudy] = useState<string | null>(null);
  const [tab, setTab] = useState('overview');
  const [anaOpen, setAnaOpen] = useState(true);
  // Bumped after a persisted write so the board re-fetches and the surface
  // re-derives from server truth (never optimistic local state).
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey(k => k + 1);

  // Real studies (programs with RBM data) + the live board for the selected one.
  const programs = useLiveRows<RbmProgram>('/api/mdx-rbm/rbm-programs');
  useEffect(() => {
    if (!study && programs.rows.length) setStudy(programs.rows[0].id);
  }, [programs.rows, study]);
  const boardPath = study ? '/api/mdx-rbm/rbm-board/' + study : null;
  const board = useLiveData<RbmBoard>(boardPath, [boardPath, reloadKey]);
  const bd = board.data;
  // useLiveData keeps the previous study's board while the next request is in
  // flight, so `bd` can still belong to the old program right after a study
  // switch. Only treat the board as ready when it actually matches the selected
  // study — otherwise the prior study's risk data would render (and be
  // interactive) under the new selection until the fetch resolves.
  const boardReady = !!bd && bd.programId === study;
  const hasData = boardReady && rbmBoardHasData(bd);

  const selProgram = programs.rows.find(p => p.id === study) || null;
  const studyLabel = selProgram?.label ?? 'the study';
  const nav = RBM_NAV.find(n => n.id === tab)!;

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
      return { surface: 'rbm', studySelected: false, note: 'No study is selected, so no RBM board is on screen.' };
    }
    if (board.loading || !boardReady) {
      return { surface: 'rbm', studyId: study, studyLabel, boardReady: false, note: 'The RBM board for this study is still loading.' };
    }
    if (board.error) {
      return {
        surface: 'rbm', studyId: study, studyLabel, boardReady: false,
        note: 'The RBM board could not be read, so no risk readings are on screen — a failure, not a clean board.',
      };
    }
    if (!hasData || !bd) {
      return {
        surface: 'rbm', studyId: study, studyLabel, boardReady: true, boardSeeded: false,
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
         an item back to the user, not the whole board. */
      attention: (bd.attention ?? []).slice(0, 8).map(a => ({ severity: a.sev, kind: a.kind, tab: a.nav, title: a.t, detail: a.d })),
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
  const anaMsgs: RbmAnaMessage[] = anaChat.messages.map(m => ({
    role: m.role,
    text: m.text || (m.streaming ? m.statusPhase || 'Thinking…' : ''),
    executedActions: m.executedActions,
    pendingSignoffs: m.pendingSignoffs,
  }));
  const askAna = (text: string) => {
    if (!text) return;
    if (!anaOpen) setAnaOpen(true);
    void anaChat.send(text);
  };

  const Body = SURFACES[tab];

  return (
    <div className="rbm" data-screen-label={`RBM -- ${nav.label}`}>
      <div className="reg-h">
        <div>
          <div className="ph-eyebrow">Clinical — risk-based quality management</div>
          <h1 className="reg-title">Risk-based monitoring</h1>
          <p className="reg-sub">
            ICH E6(R3) RBQM for the study: risk assessment, KRIs and QTLs, central
            statistical monitoring, site oversight and the monitoring plan. Every score
            is engine output — the number behind each chip is always visible.
          </p>
        </div>
        <div className="rbm-study">
          <span className="rbm-study-l">Study</span>
          <select
            className="rbm-study-sel"
            value={study ?? ''}
            onChange={e => setStudy(e.target.value)}
            aria-label="Select a study"
            disabled={programs.rows.length === 0}
          >
            {programs.rows.length === 0 ? (
              <option value="">No RBM studies</option>
            ) : (
              programs.rows.map(s => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))
            )}
          </select>
          <span className="rbm-study-m">
            {bd && bd.programId === study
              ? `${bd.summary.sites.total} sites -- ${bd.summary.patients.scored} subjects scored`
              : 'Live RBM read-model'}
          </span>
        </div>
      </div>

      <div className="rbm-links">
        <span className="rbm-links-l">{I.network}Linked to</span>
        {(['project', 'vault', 'tasks', 'biostats'] as const).map(k => {
          const L = RBM_LINKS[k];
          return (
            <button
              key={k}
              className="rbm-link"
              onClick={() => onNav && onNav(L.surface)}
              title={L.note}
            >
              <span className="rbm-link-ico">
                {(I as Record<string, React.ReactNode>)[LINK_ICONS[k] || 'folder']}
              </span>
              <span className="rbm-link-t">
                <b>{L.label}</b><em>{L.value}</em>
              </span>
              <span className="rbm-link-go">{I.chevRight}</span>
            </button>
          );
        })}
      </div>

      <div className="reg-tabs rbm-tabs" role="tablist">
        {RBM_NAV.map(n => (
          <button
            key={n.id}
            role="tab"
            aria-selected={tab === n.id}
            className={`reg-tab${tab === n.id ? ' on' : ''}`}
            onClick={() => setTab(n.id)}
          >
            {n.label}
          </button>
        ))}
      </div>

      <div className="rbm-workarea" data-ana={anaOpen || undefined}>
        <div className="rbm-content">
          {programs.loading ? (
            <div style={{ padding: 24 }}>
              <EmptyState title="Loading RBM studies…" icon={I.clock} />
            </div>
          ) : programs.error ? (
            <div style={{ padding: 24 }}>
              <EmptyState
                tone="error"
                icon={I.alertTriangle}
                title="Couldn't load RBM studies"
                hint="The risk-based monitoring service didn't respond. Nothing is shown from a cached sample."
              />
            </div>
          ) : programs.rows.length === 0 ? (
            <div style={{ padding: 24 }}>
              <EmptyState
                icon={I.clipboardList}
                title="No RBM studies yet"
                hint="No study in this organization has a risk-based monitoring assessment yet. Once an RBM assessment exists for a program it appears here with its live risk, KRIs, QTLs and monitoring plan — nothing is simulated."
              />
            </div>
          ) : board.error ? (
            <div style={{ padding: 24 }}>
              <EmptyState
                tone="error"
                icon={I.alertTriangle}
                title="Couldn't load the RBM board"
                hint="The board didn't respond for this study. Nothing is shown from a cached sample."
              />
            </div>
          ) : !bd || bd.programId !== study ? (
            <div style={{ padding: 24 }}>
              <EmptyState title="Loading the RBM board…" icon={I.clock} />
            </div>
          ) : hasData ? (
            <Body key={bd.programId + '@' + bd.asOf} board={bd} onTab={setTab} onAsk={askAna} onNav={onNav} onReload={reload} />
          ) : (
            <SeedEmpty
              title={`No RBM data for ${studyLabel} yet`}
              body="This study has no risk assessment, indicators or tolerance limits. Seeding creates the ICH E6(R3) TransCelerate defaults, scoped to this study, ready to tailor."
              actions={SEED_ACTIONS[tab] || SEED_ACTIONS.overview}
              onRun={a => askAna(`${a} for ${studyLabel}`)}
            />
          )}
        </div>
        {anaOpen ? (
          <RbmAnaDock
            nav={nav}
            study={studyLabel.split(' --')[0]}
            msgs={anaMsgs}
            onAsk={askAna}
            onClose={() => setAnaOpen(false)}
          />
        ) : (
          <button
            className="rbm-ana-seam"
            onClick={() => setAnaOpen(true)}
            title="Open AnA"
          >
            <span className="mk">{'✻'}</span>AnA
          </button>
        )}
      </div>
    </div>
  );
}
