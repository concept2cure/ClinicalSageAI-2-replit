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
