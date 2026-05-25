/**
 * PDEV App composer — full Phase 7 (sub-phases 7.0 / 7.1 / 7.2 / 7.3 / 7.4).
 *
 * 3-pane shell with surface routing for all 8 PDEV nav items, governed
 * mutations through <PdevConfirmDialog>, and overlay sheets for
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
import { useFetchJson } from '../mdx/hooks/useFetchJson';
import { useAnaChat } from '../components/ana/useAnaChat';
import { PdevRail } from './shell/Rail';
import { PdevTopBar } from './shell/TopBar';
import { PdevAnaDock, type PdevAnaDockMessage } from './shell/AnaDock';
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
  usePdevProgram,
  usePdevReadiness,
  usePdevReadinessSnapshot,
  usePdevWorkstream,
} from './hooks/usePdevData';
import { isWorkstreamNav } from './data/nav';
import type { PdevActivityView } from './data/types';
import type { PdevWorkstream } from './data/enums';
import {
  PdevConfirmDialog,
  type ConfirmConfig,
} from './components/ConfirmDialog';

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

interface IndProgramRow {
  id: string;
  code: string;
  productName: string;
  name: string;
  programType: string;
  status: string;
  metadata?: Record<string, unknown> | null;
}

interface IndProgramListPayload {
  data: IndProgramRow[];
}

export interface PdevAppProps {
  /** Initial nav id from a deep-link. */
  initialNav?: string;
  initialProgramId?: string | null;
  /** AnA gateway adapter. The dock collects prompts; routing them to
   *  the real chat surface is the host app's responsibility. */
  onAskAna?: (
    text: string,
    context: { programCode: string | null; activityKey: string | null },
  ) => void;
}

export function PdevApp({
  initialNav,
  initialProgramId,
  onAskAna,
}: PdevAppProps) {
  // ── IND program list ──────────────────────────────────────────────
  const { data: programsList, loading: programsLoading } =
    useFetchJson<IndProgramListPayload>('/api/regulatory-programs');
  const indPrograms = React.useMemo(
    () =>
      (programsList?.data ?? []).filter(
        (p) => p.programType === 'IND' && p.status !== 'archived',
      ),
    [programsList],
  );
  const [programId, setProgramId] = React.useState<string | null>(
    initialProgramId ?? null,
  );
  React.useEffect(() => {
    if (programId === null && indPrograms.length > 0) {
      setProgramId(indPrograms[0].id);
    }
  }, [programId, indPrograms]);

  const projectIdForProgram = React.useMemo(() => {
    const row = indPrograms.find((p) => p.id === programId);
    const meta = row?.metadata ?? null;
    if (meta && typeof meta.projectId === 'number') return meta.projectId;
    return null;
  }, [programId, indPrograms]);

  // ── Navigation + sheet state ──────────────────────────────────────
  const [activeNav, setActiveNav] = React.useState<string>(initialNav ?? 'overview');
  const [collapsed, setCollapsed] = React.useState(false);
  const [anaOpen, setAnaOpen] = React.useState(true);
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
  // When the host doesn't override onAskAna, route through a local
  // useAnaChat instance against /api/ana-ri/stream. The PDEV workstream,
  // active program code, and active activity go into module_context so
  // the orchestrator can ground its response. Streaming history surfaces
  // in the AnA conversation panel (Phase 8) — the dock here only collects
  // the prompt.
  const programCodeForAna = program.view?.program.code ?? null;
  const activityKeyForAna = activeActivity?.registry.key ?? null;
  const anaChat = useAnaChat({
    projectId: programId,
    projectName: programCodeForAna,
    screenName: `PDEV · ${activeNav}`,
    submissionType: 'IND',
    moduleContext: {
      workstream: 'pdev',
      activeNav,
      programCode: programCodeForAna,
      activityKey: activityKeyForAna,
    },
  });
  const askAna = React.useCallback(
    (text: string) => {
      if (!text) return;
      if (onAskAna) {
        onAskAna(text, {
          programCode: programCodeForAna,
          activityKey: activityKeyForAna,
        });
      } else {
        void anaChat.send(text);
      }
      setAnaOpen(true);
    },
    [onAskAna, anaChat, programCodeForAna, activityKeyForAna],
  );

  // Adapt useAnaChat messages to the dock's transcript shape. Skipped when
  // the host owns AnA (onAskAna present) — then the host renders history.
  const dockMessages: PdevAnaDockMessage[] = React.useMemo(() => {
    if (onAskAna) return [];
    return anaChat.messages.map((m) => ({
      role: m.role === 'assistant' ? ('ana' as const) : ('user' as const),
      body: m.text || (m.streaming ? m.statusPhase || 'Routing…' : ''),
      when: m.sentAt
        ? new Date(m.sentAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
        : 'just now',
      streaming: m.streaming,
    }));
  }, [onAskAna, anaChat.messages]);

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
  let surface: React.ReactNode;
  if (program.error) {
    surface = (
      <div className="pdev-page-error">
        <h2>Couldn't load this program</h2>
        <p className="pdev-page-error-detail">{program.error}</p>
      </div>
    );
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
    if (workstream.loading || !workstream.payload) {
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
    if (assembly.loading || !assembly.payload) {
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
    if (fdaStream.loading || !fdaStream.payload) {
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
    if (contradictions.loading || !contradictions.payload) {
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

  return (
    <div
      className="pdev-shell"
      data-collapsed={collapsed || undefined}
      data-ana-open={anaOpen || undefined}
    >
      <PdevRail
        activeNav={activeNav}
        setActiveNav={(id) => {
          setActiveNav(id);
          setActiveActivity(null);
        }}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        program={program.view?.program ?? null}
        programs={indPrograms.map((p) => ({
          id: p.id,
          code: p.code,
          productName: p.productName || p.name,
        }))}
        switchProgram={(id) => {
          setProgramId(id);
          setActiveActivity(null);
        }}
      />
      <main className="pdev-main">
        <PdevTopBar
          hereLabel={HERE_LABEL[activeNav] ?? 'PDEV'}
          program={program.view?.program ?? null}
          onOpenPalette={() => askAna('Open command palette')}
        />
        <div className="pdev-page">
          <div className="pdev-page-inner">{surface}</div>
        </div>
      </main>
      <PdevAnaDock
        open={anaOpen}
        setOpen={setAnaOpen}
        program={program.view?.program ?? null}
        readinessScore={effectiveReadiness}
        topBlocker={topBlocker}
        activeNav={activeNav}
        activity={activeActivity}
        onSend={askAna}
        isStreaming={!onAskAna && anaChat.isStreaming}
        messages={dockMessages}
      />

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
        <PdevConfirmDialog
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
