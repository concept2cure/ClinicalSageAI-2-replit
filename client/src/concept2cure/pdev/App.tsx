/**
 * PDEV App composer — full Phase 7 (sub-phases 7.0 / 7.1 / 7.2 / 7.3 / 7.4).
 *
 * 3-pane shell with surface routing for all 8 PDEV nav items, governed
 * mutations through <GovernedConfirmDialog>, and overlay sheets for
 * Activity detail (6 tabs), AI drafting workbench, evidence picker.
 *
 * Data sources (all routes already live in server/routes/pdev/pdev-routes.ts):
 *   /api/regulatory-programs           — IND program selector list
 *   /api/pdev/programs/:id             — program view + workstream rollups + activities
 *   /api/pdev/programs/:id/readiness   — live readiness recompute
 *   /api/pdev/programs/:id/workstreams/:ws — workstream drill
 *   /api/pdev/programs/:id/activities/:key/{evidence,workflow,provenance} — activity tabs
 *   /api/pdev/programs/:id/{ind-assembly,fda-interactions,fda-feedback/proposals,contradictions}
 *   POST /api/pdev/programs/:id/activities/:key/state — state-change mutation
 *   POST /api/pdev/programs/:id/activities/:key/evidence — attach
 *   DELETE /api/pdev/programs/:id/activities/:key/evidence/:evId — detach
 *   POST /api/pdev/programs/:id/activities/:key/ai-draft
 *   POST /api/pdev/programs/:id/ind-assembly/compile
 *   POST /api/pdev/programs/:id/fda-feedback/apply
 *   POST /api/pdev/workflow-runs/:runId/checkpoints/:cpId/decision
 */

import * as React from 'react';
import { PdevOverview } from './surfaces/Overview';
import { PdevWorkstreamSurface } from './surfaces/Workstream';
import { PdevActivityDetail } from './surfaces/ActivityDetail';
import { PdevAiDraftWorkbench } from './surfaces/AiDraftWorkbench';
import { PdevEvidencePicker } from './surfaces/EvidencePicker';
import { PdevAssemblySurface } from './surfaces/Assembly';
import { PdevFdaStreamSurface } from './surfaces/FdaStream';
import { PdevContradictionsSurface } from './surfaces/Contradictions';
import {
  usePdevContradictions,
  usePdevFdaInteractions,
  usePdevFdaProposals,
  usePdevIndAssembly,
  usePdevIndPrograms,
  usePdevProgram,
  usePdevReadiness,
  usePdevReadinessSnapshot,
  usePdevWorkstream,
} from './hooks/usePdevData';
import { isWorkstreamNav } from './data/nav';
import type { PdevActivityView } from './data/types';
import type { PdevWorkstream } from './data/enums';
import {
  GovernedConfirmDialog,
  type ConfirmConfig,
} from '../_shared/components/GovernedConfirmDialog';
import { usePublishSurfaceContext } from '../v2/surfaceContext';

const HERE_LABEL: Record<string, string> = {
  overview: 'Program dashboard',
  cmc: 'CMC workstream',
  nonclinical: 'Nonclinical workstream',
  clinical: 'Clinical workstream',
  regulatory: 'Regulatory workstream',
  ind_assembly: 'IND assembly readiness',
  contradictions: 'Contradictions registry',
  fda_interactions: 'FDA interactions',
};

const READINESS_THRESHOLD_DEFAULT = 85;

export interface PdevAppProps {
  /** Which surface to render — the shell's surface id, supplied by the registry. */
  nav: string;
  /** Navigate to another surface id. The shell owns navigation. */
  onNav: (id: string) => void;
  initialProgramId?: string | null;
  /**
   * Hand a prompt to the shell's one conversation. REQUIRED — not optional.
   *
   * It was optional, with a local `useAnaChat` fallback behind it. That made
   * the second conversation one dropped prop away, so the type now says what
   * the architecture says: this kit collects prompts, the shell answers them.
   */
  onAskAna: (
    text: string,
    context: { programCode: string | null; activityKey: string | null },
  ) => void;
}

export function PdevApp({
  nav,
  onNav,
  initialProgramId,
  onAskAna,
}: PdevAppProps) {
  // ── IND program list ──────────────────────────────────────────────
  // This was an inline `(programsList?.data ?? []).filter(...)`. A single route
  // answering `{ data: {} }` instead of `{ data: [...] }` made that `?? []` a
  // no-op — the object is not nullish — and `.filter` threw during render,
  // taking every PDEV surface down with it. The hook decides whether the body
  // is a list before anyone iterates it, and says so when it is not.
  const {
    programs: indPrograms,
    loading: programsLoading,
    error: programsError,
  } = usePdevIndPrograms();
  const [programId, setProgramId] = React.useState<string | null>(
    initialProgramId ?? null,
  );
  /**
   * Follow the shell's project selection.
   *
   * The kit's rail carried a program switcher; it went with the rail, and for a
   * while nothing replaced it — this module pinned itself to `indPrograms[0]`
   * and ignored the project every other v2 surface was showing. `window.C2C_PROJECT`
   * is that shared selection (see v2/surfaces/ProjectHome.tsx), so PDEV now
   * follows it when it names an IND program this org has, and falls back to the
   * first only when it does not.
   */
  React.useEffect(() => {
    if (indPrograms.length === 0) return;
    const selected = typeof window !== 'undefined' ? window.C2C_PROJECT?.id : undefined;
    const match = selected ? indPrograms.find((p) => String(p.id) === String(selected)) : undefined;
    const next = match?.id ?? (programId === null ? indPrograms[0].id : null);
    if (next && next !== programId) setProgramId(next);
  }, [programId, indPrograms]);

  const projectIdForProgram = React.useMemo(() => {
    const row = indPrograms.find((p) => p.id === programId);
    const meta = row?.metadata ?? null;
    if (meta && typeof meta.projectId === 'number') return meta.projectId;
    return null;
  }, [programId, indPrograms]);

  // ── Navigation + sheet state ──────────────────────────────────────
  // `activeNav` is the shell's surface id, not state this module keeps, and
  // rail-collapse / AnA-open are gone with the rail and the dock. The v2 shell
  // owns all three; a second copy here is what let this module draw a second
  // rail beside the shell's and run a second AnA conversation.
  const activeNav = nav;
  const setActiveNav = React.useCallback((id: string) => onNav(id), [onNav]);
  const [activeActivity, setActiveActivity] =
    React.useState<PdevActivityView | null>(null);
  const [aiDraftFor, setAiDraftFor] = React.useState<{
    activity: PdevActivityView;
    documentCode: string | null;
  } | null>(null);
  const [evidencePickerFor, setEvidencePickerFor] =
    React.useState<PdevActivityView | null>(null);

  // ── Snapshot mutation (Overview "Snapshot readiness" CTA) ─────────
  const snapshot = usePdevReadinessSnapshot();
  const [snapshotConfirm, setSnapshotConfirm] =
    React.useState<ConfirmConfig | null>(null);
  const [snapshotError, setSnapshotError] = React.useState<string | null>(null);

  // ── Data fetches gated by programId / activeNav ───────────────────
  const program = usePdevProgram(programId);
  const readiness = usePdevReadiness(programId);
  const workstreamId: PdevWorkstream | null = isWorkstreamNav(activeNav)
    ? activeNav
    : null;
  const workstream = usePdevWorkstream(programId, workstreamId);
  const assembly = usePdevIndAssembly(
    activeNav === 'ind_assembly' ? programId : null,
  );
  const fdaStream = usePdevFdaInteractions(
    activeNav === 'fda_interactions' ? programId : null,
  );
  const fdaProposals = usePdevFdaProposals(
    activeNav === 'fda_interactions' ? programId : null,
  );
  const contradictions = usePdevContradictions(
    activeNav === 'contradictions' ? programId : null,
  );

  // ── AnA bridge ────────────────────────────────────────────────────
  // `onAskAna` is REQUIRED, and hands the prompt to the shell's one
  // conversation. There is no local fallback.
  //
  // There was one: a second `useAnaChat` instance, with its own module_context,
  // reached whenever `onAskAna` was absent. When this kit had its own AnA dock
  // that made sense. It has not since the convergence — `PdevSurfaces.tsx:78`
  // always supplies `onAskAna`, nothing renders `anaChat.messages`, and
  // `useAnaChat` opens no thread on mount, so the instance was inert. Inert is
  // not harmless: it was a live second conversation sitting behind a single
  // `if (onAskAna)`, and one dropped prop would have re-forked the thread
  // silently, which is the exact failure this branch exists to make impossible.
  //
  // `tests/ui/one-shell.test.ts` now asserts that `useAnaChat` is instantiated
  // only by the shell and by the two surfaces that own a named conversation.
  const programCodeForAna = program.view?.program.code ?? null;
  const activityKeyForAna = activeActivity?.registry.key ?? null;
  const askAna = React.useCallback(
    (text: string) => {
      if (!text) return;
      onAskAna(text, {
        programCode: programCodeForAna,
        activityKey: activityKeyForAna,
      });
      // No `setAnaOpen` — the shell's AnA rail is the only one, and it opens
      // itself when a prompt arrives.
    },
    [onAskAna, programCodeForAna, activityKeyForAna],
  );


  // Refresh data after a mutation completes (state change, evidence
  // attach/detach, workflow decisions, FDA rollups, compile, etc.).
  const refreshAll = React.useCallback(() => {
    program.refresh();
    readiness.refresh();
    workstream.refresh();
    assembly.refresh();
    fdaStream.refresh();
    fdaProposals.refresh();
    contradictions.refresh();
  }, [program, readiness, workstream, assembly, fdaStream, fdaProposals, contradictions]);

  // ── Derived ──────────────────────────────────────────────────────
  const effectiveReadiness =
    readiness.report?.overall.readinessScore ??
    program.view?.latestSnapshots.find((s) => s.workstream === 'overall')
      ?.readinessScore ??
    program.view?.program.progressPercent ??
    0;

  const topBlocker =
    typeof program.view?.program.metadata?.blocker === 'string'
      ? (program.view.program.metadata.blocker as string)
      : null;

  // ── AnA screen context ────────────────────────────────────────────
  /* One builder, eight literal publish calls: the AnA coverage gate counts
     single-quoted surface-id literals, so each of the 8 pdev* surface ids
     this host serves gets its own call (the two-id shape in
     v2/surfaces/UsageBilling.tsx is the sanctioned precedent; quality/App.tsx
     is the kit-App precedent). The store keys on surface id, so the seven
     calls whose nav is not active publish null and are ignored. Branches
     mirror the render gates in the `surface` chain below — the context never
     claims more than the screen shows, and a failed read publishes as a
     failure, never as an empty program. */
  const anaContext = React.useMemo(() => {
    const here = HERE_LABEL[activeNav] ?? 'PDEV';
    if (programsError) {
      return {
        summary: `${here}. The IND programs could not be read — a failure, not an empty portfolio.`,
        facts: { screen: here, error: programsError },
      };
    }
    if (program.error) {
      return {
        summary: `${here}. The program could not be read — a failure, not an empty program.`,
        facts: { screen: here, error: program.error },
      };
    }
    if (!programId && !programsLoading && indPrograms.length === 0) {
      return {
        summary: `${here}. No IND programs yet — this is a real empty portfolio, not a failed read.`,
        facts: { screen: here, indPrograms: 0 },
      };
    }
    if (!program.view) {
      return {
        summary: `${here}. The PDEV program is still loading — nothing is readable yet.`,
        facts: { screen: here },
      };
    }

    const base = `${here} for ${program.view.program.code} — ${program.view.program.productName}.`;
    const facts: Record<string, unknown> = {
      screen: here,
      program: program.view.program.code,
      product: program.view.program.productName,
    };
    let detail = '';

    if (activeNav === 'overview') {
      /* effectiveReadiness falls through report → overall snapshot →
         progressPercent → 0, so a bare 0 is ambiguous. readinessSource says
         which figure the screen is actually showing. */
      const readinessSource = readiness.report
        ? 'report'
        : program.view.latestSnapshots.some((s) => s.workstream === 'overall') ||
            program.view.program.progressPercent != null
          ? 'snapshot-fallback'
          : 'unknown';
      if (readiness.error) {
        detail = ` The readiness read failed; the figure shown (${Math.round(effectiveReadiness)}%) falls back to the last snapshot/progress.`;
        facts.readinessError = readiness.error;
      } else if (readiness.report) {
        detail = ` Readiness ${Math.round(effectiveReadiness)}% against threshold ${READINESS_THRESHOLD_DEFAULT}%.`;
      } else if (readinessSource === 'snapshot-fallback') {
        detail = ` Readiness ${Math.round(effectiveReadiness)}% from the last snapshot/progress (the live recompute has not returned).`;
      } else {
        detail =
          ' Readiness shows 0% because no report, snapshot or progress figure exists yet — a fallback default, not a computed score.';
      }
      if (topBlocker) detail += ` Top blocker: ${topBlocker}.`;
      facts.readiness = Math.round(effectiveReadiness);
      facts.threshold = READINESS_THRESHOLD_DEFAULT;
      facts.topBlocker = topBlocker;
      facts.readinessSource = readinessSource;
    } else if (workstreamId) {
      if (workstream.error) {
        detail = ` The ${workstreamId} workstream read failed — a failure, not an empty workstream.`;
        facts.workstreamError = workstream.error;
      } else if (workstream.loading || !workstream.payload) {
        detail = ` The ${workstreamId} workstream is still loading.`;
      } else {
        const rollup = workstream.payload.rollup;
        detail =
          ` ${workstream.payload.activities.length} activities on screen` +
          (rollup
            ? ` — ${rollup.completedActivities} of ${rollup.totalActivities} complete, ${rollup.blockedActivities} blocked.`
            : '.');
        facts.workstream = workstreamId;
        facts.activitiesShown = workstream.payload.activities.length;
        if (rollup) {
          facts.totalActivities = rollup.totalActivities;
          facts.completedActivities = rollup.completedActivities;
          facts.blockedActivities = rollup.blockedActivities;
        }
      }
    } else if (activeNav === 'ind_assembly') {
      if (assembly.error) {
        detail = ' The IND assembly read failed — a failure, not an empty assembly.';
        facts.assemblyError = assembly.error;
      } else if (assembly.loading || !assembly.payload) {
        detail = ' IND assembly readiness is still loading.';
      } else {
        const a = assembly.payload;
        const belowThreshold = a.overallReadiness < a.threshold;
        /* The compile button's third disabled cause — a compile already in
           flight — is state the Assembly surface holds in its own mutation
           hook; this host cannot see it, so it is named as a property of the
           control, never claimed as current state. */
        const compileDisabledBecause = [
          ...(belowThreshold ? ['readiness below threshold'] : []),
          ...(projectIdForProgram === null ? ['no backing project linked'] : []),
        ];
        detail =
          ` Overall readiness ${a.overallReadiness}% against threshold ${a.threshold}%` +
          (belowThreshold ? ' — below threshold.' : ' — threshold met.') +
          (compileDisabledBecause.length
            ? ` The compile CTA is disabled: ${compileDisabledBecause.join('; ')}.`
            : ' The compile CTA is enabled (it also disables while a compile is in flight).');
        facts.overallReadiness = a.overallReadiness;
        facts.threshold = a.threshold;
        facts.belowThreshold = belowThreshold;
        facts.modules = a.modules.map(
          (m) => `${m.label}: mandatory ${m.mandatory.present}/${m.mandatory.total}`,
        );
        facts.compileDisabledBecause = compileDisabledBecause;
        facts.forceCompileGoverned = true;
      }
    } else if (activeNav === 'contradictions') {
      if (contradictions.error) {
        detail = ' The contradictions read failed — a failure, not a clean registry.';
        facts.contradictionsError = contradictions.error;
      } else if (contradictions.loading || !contradictions.payload) {
        detail = ' Contradictions are still loading.';
      } else {
        const rows = contradictions.payload.contradictions;
        const blocking = rows.filter(
          (c) => c.authorityState === 'blocks_promotion',
        ).length;
        /* Was "No contradictions detected — a real zero." — the same claim the
           registry surface itself stopped making, still being handed to AnA as a
           structured fact. The registry is a read over
           contradictionEngineService.searchFindings, which returns
           contradictions the engine has already DETECTED and persisted, so an
           empty list is equally the shape of a program nothing has ever scanned.
           Calling that "a real zero" asserted the one thing the payload cannot
           establish, to the component most likely to repeat it in prose. */
        detail =
          rows.length === 0
            ? ' The registry is empty; it lists contradictions the engine has detected, so this does not confirm a scan has run.'
            : ` ${rows.length} contradiction${rows.length === 1 ? '' : 's'} on screen; ${blocking} block${blocking === 1 ? 's' : ''} promotion.`;
        facts.contradictions = rows.length;
        facts.blocksPromotion = blocking;
      }
    } else if (activeNav === 'fda_interactions') {
      if (fdaStream.error || fdaProposals.error) {
        detail = ' The FDA interactions read failed — a failure, not an empty stream.';
        facts.fdaError = fdaStream.error ?? fdaProposals.error;
      } else if (fdaStream.loading || !fdaStream.payload) {
        detail = ' FDA interactions are still loading.';
      } else {
        const items = fdaStream.payload.interactions.length;
        detail =
          ` ${items} interaction${items === 1 ? '' : 's'} in the stream` +
          (fdaProposals.payload
            ? `; ${fdaProposals.payload.proposals.length} feedback proposal${fdaProposals.payload.proposals.length === 1 ? '' : 's'}.`
            : fdaProposals.loading
              ? '; feedback proposals are still loading.'
              : '; feedback proposals are unavailable.');
        facts.interactions = items;
        facts.proposals = fdaProposals.payload
          ? fdaProposals.payload.proposals.length
          : null;
      }
    }

    /* Overlay sheets sit over the page — when one is open, it is what the
       person is actually looking at. */
    let sheetLine = '';
    if (activeActivity) {
      sheetLine += ` The "${activeActivity.registry.title}" activity sheet is open — that is what the person is looking at.`;
      facts.openActivity = activeActivity.registry.key;
    }
    if (aiDraftFor) {
      sheetLine += ` The AI drafting workbench is open for "${aiDraftFor.activity.registry.title}".`;
      facts.aiDraftActivity = aiDraftFor.activity.registry.key;
    }
    if (evidencePickerFor) {
      sheetLine += ` The evidence picker is open for "${evidencePickerFor.registry.title}".`;
      facts.evidencePickerActivity = evidencePickerFor.registry.key;
    }

    return {
      summary: base + detail + sheetLine,
      facts,
      availableActions: [
        'Switch workstream cards / open an activity are screen clicks AnA can describe',
        'Readiness snapshots, IND compilation (and force compile), activity state changes, evidence attachment and AI drafts are governed — AnA proposes them in conversation, never through screen controls.',
      ],
    };
  }, [
    activeNav,
    workstreamId,
    programsError,
    programsLoading,
    indPrograms.length,
    programId,
    program.error,
    program.view,
    readiness.error,
    readiness.report,
    effectiveReadiness,
    topBlocker,
    workstream.error,
    workstream.loading,
    workstream.payload,
    assembly.error,
    assembly.loading,
    assembly.payload,
    projectIdForProgram,
    contradictions.error,
    contradictions.loading,
    contradictions.payload,
    fdaStream.error,
    fdaStream.loading,
    fdaStream.payload,
    fdaProposals.error,
    fdaProposals.loading,
    fdaProposals.payload,
    activeActivity,
    aiDraftFor,
    evidencePickerFor,
  ]);
  usePublishSurfaceContext('pdev', activeNav === 'overview' ? anaContext : null);
  usePublishSurfaceContext('pdev-cmc', activeNav === 'cmc' ? anaContext : null);
  usePublishSurfaceContext('pdev-nonclinical', activeNav === 'nonclinical' ? anaContext : null);
  usePublishSurfaceContext('pdev-clinical', activeNav === 'clinical' ? anaContext : null);
  usePublishSurfaceContext('pdev-regulatory', activeNav === 'regulatory' ? anaContext : null);
  usePublishSurfaceContext('pdev-ind-assembly', activeNav === 'ind_assembly' ? anaContext : null);
  usePublishSurfaceContext('pdev-fda-interactions', activeNav === 'fda_interactions' ? anaContext : null);
  usePublishSurfaceContext('pdev-contradictions', activeNav === 'contradictions' ? anaContext : null);

  const onSnapshot = () => {
    if (!programId) return;
    setSnapshotConfirm({
      action: 'Snapshot readiness',
      target: `${program.view?.program.code ?? programId}`,
      resource: program.view?.program.code,
      minReason: 10,
      confirmWord: 'yes',
    });
  };

  const onConfirmSnapshot = async ({ reason }: { reason: string }) => {
    if (!programId) return;
    setSnapshotError(null);
    try {
      await snapshot.run({ programId, reason });
      setSnapshotConfirm(null);
      refreshAll();
    } catch (err) {
      setSnapshotError(err instanceof Error ? err.message : 'Snapshot failed');
    }
  };

  // ── Render: choose surface ───────────────────────────────────────
  /* A load that failed says so. The alternative — the empty state below, or a
     spinner that never resolves — tells the user there is nothing here, which
     is a claim about their program rather than about the request. */
  const loadFailed = (detail: string, heading = "Couldn't load this program") => (
    <div className="pdev-page-error">
      <h2>{heading}</h2>
      <p className="pdev-page-error-detail">{detail}</p>
    </div>
  );

  let surface: React.ReactNode;
  if (programsError) {
    surface = loadFailed(programsError, "Couldn't load IND programs");
  } else if (program.error) {
    surface = loadFailed(program.error);
  } else if (!programId && !programsLoading && indPrograms.length === 0) {
    surface = (
      <div className="pdev-empty-state">
        <h2>No IND programs yet</h2>
        <p>
          Create an IND program in the regulatory programs surface and it will
          appear here for PDEV tracking.
        </p>
      </div>
    );
  } else if (!program.view) {
    surface = (
      <div className="pdev-loading-state" aria-busy="true">
        <p>Loading PDEV program…</p>
      </div>
    );
  } else if (activeNav === 'overview') {
    surface = (
      <PdevOverview
        view={program.view}
        readinessScore={effectiveReadiness}
        topBlocker={topBlocker}
        readinessThreshold={READINESS_THRESHOLD_DEFAULT}
        onAskAna={askAna}
        onSelectWorkstream={(ws) => setActiveNav(ws)}
        onSnapshot={onSnapshot}
      />
    );
  } else if (workstreamId) {
    if (workstream.error) {
      surface = loadFailed(workstream.error, `Couldn't load ${workstreamId}`);
    } else if (workstream.loading || !workstream.payload) {
      surface = (
        <div className="pdev-loading-state" aria-busy="true">
          <p>Loading {workstreamId}…</p>
        </div>
      );
    } else {
      surface = (
        <PdevWorkstreamSurface
          ws={workstreamId}
          programCode={program.view.program.code}
          payload={workstream.payload}
          onAskAna={askAna}
          onSelectActivity={setActiveActivity}
        />
      );
    }
  } else if (activeNav === 'ind_assembly') {
    if (assembly.error) {
      surface = loadFailed(assembly.error, "Couldn't load IND assembly");
    } else if (assembly.loading || !assembly.payload) {
      surface = (
        <div className="pdev-loading-state" aria-busy="true">
          <p>Loading IND assembly…</p>
        </div>
      );
    } else {
      surface = (
        <PdevAssemblySurface
          programId={programId!}
          programCode={program.view.program.code}
          projectId={projectIdForProgram}
          payload={assembly.payload}
          onAskAna={askAna}
          onCompiled={refreshAll}
        />
      );
    }
  } else if (activeNav === 'fda_interactions') {
    if (fdaStream.error || fdaProposals.error) {
      surface = loadFailed(
        fdaStream.error ?? fdaProposals.error ?? '',
        "Couldn't load FDA interactions",
      );
    } else if (fdaStream.loading || !fdaStream.payload) {
      surface = (
        <div className="pdev-loading-state" aria-busy="true">
          <p>Loading FDA interactions…</p>
        </div>
      );
    } else {
      surface = (
        <PdevFdaStreamSurface
          programId={programId!}
          programCode={program.view.program.code}
          stream={fdaStream.payload}
          proposals={fdaProposals.payload}
          onAskAna={askAna}
          onApplied={refreshAll}
        />
      );
    }
  } else if (activeNav === 'contradictions') {
    if (contradictions.error) {
      surface = loadFailed(contradictions.error, "Couldn't load contradictions");
    } else if (contradictions.loading || !contradictions.payload) {
      surface = (
        <div className="pdev-loading-state" aria-busy="true">
          <p>Loading contradictions…</p>
        </div>
      );
    } else {
      surface = (
        <PdevContradictionsSurface
          programCode={program.view.program.code}
          payload={contradictions.payload}
          onAskAna={askAna}
        />
      );
    }
  } else {
    surface = (
      <div className="pdev-coming-soon">
        <h2>{HERE_LABEL[activeNav] ?? 'Surface'}</h2>
        <p>This surface ships in a later sub-phase.</p>
      </div>
    );
  }

  /*
   * `.pdev-shell` is the scope every rule in app.css hangs off, so the class
   * survives even though the shell does not — without it these surfaces render
   * as unstyled markup. `data-surface` drops the shell's grid: the host draws
   * the rail, the topbar and the AnA rail now.
   *
   * `.pdev-page` / `.pdev-page-inner` are the kit's content measure (max-width
   * 1400, 20/28px padding), not chrome, so they stay too.
   *
   * Sheets render as siblings of the page — they are modals over the canvas.
   */
  return (
    <div className="pdev-shell" data-surface="true">
      <div className="pdev-page">
        <div className="pdev-page-inner">{surface}</div>
      </div>

      {activeActivity && programId && (
        <PdevActivityDetail
          programId={programId}
          activity={activeActivity}
          onClose={() => setActiveActivity(null)}
          onAskAna={askAna}
          onMutated={refreshAll}
          onOpenDraft={(documentCode) =>
            setAiDraftFor({ activity: activeActivity, documentCode })
          }
          onOpenEvidencePicker={() => setEvidencePickerFor(activeActivity)}
        />
      )}

      {aiDraftFor && programId && projectIdForProgram !== null && (
        <PdevAiDraftWorkbench
          programId={programId}
          projectId={projectIdForProgram}
          activity={aiDraftFor.activity}
          documentCode={aiDraftFor.documentCode}
          onClose={() => setAiDraftFor(null)}
        />
      )}
      {aiDraftFor && programId && projectIdForProgram === null && (
        <div className="pdev-sheet-backdrop" onClick={() => setAiDraftFor(null)} role="presentation">
          <aside className="pdev-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="pdev-sheet-head">
              <div>
                <div className="pdev-sheet-eyebrow">AI drafting workbench</div>
                <div className="pdev-sheet-title">Project linkage required</div>
              </div>
              <button className="pdev-sheet-close" onClick={() => setAiDraftFor(null)} type="button" aria-label="Close">
                ×
              </button>
            </div>
            <div className="pdev-sheet-body">
              <p>
                AI drafting routes through the existing eCTD / ESG submission
                pipeline, which requires a backing project. Set
                <span className="mono"> metadata.projectId </span>
                on the regulatory program to enable AI drafts for this program.
              </p>
            </div>
          </aside>
        </div>
      )}
      {evidencePickerFor && programId && (
        <PdevEvidencePicker
          programId={programId}
          activity={evidencePickerFor}
          onClose={() => setEvidencePickerFor(null)}
          onAttached={refreshAll}
        />
      )}

      {snapshotConfirm && programId && (
        <GovernedConfirmDialog
          open={true}
          {...snapshotConfirm}
          onCancel={() => {
            setSnapshotConfirm(null);
            setSnapshotError(null);
          }}
          onConfirm={onConfirmSnapshot}
          submitError={snapshotError}
        />
      )}
    </div>
  );
}
