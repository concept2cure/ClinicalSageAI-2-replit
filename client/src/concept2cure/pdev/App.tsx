/**
 * PDEV App composer — orchestrates the 3-pane shell, surface routing,
 * and AnA dock state for sub-phases 7.0 + 7.1.
 *
 * Mounted by PdevRoute. Reads from four endpoints:
 *   - GET /api/regulatory-programs (filtered to programType='IND' for
 *     the program selector — programs themselves live in the existing
 *     regulatoryPrograms table, not a new PDEV-specific list)
 *   - GET /api/pdev/programs/:id (the unified program view)
 *   - GET /api/pdev/programs/:id/readiness (live recompute)
 *   - GET /api/pdev/programs/:id/workstreams/:ws (workstream drill)
 *
 * Mutations, FDA stream, contradictions, IND assembly, AI drafting,
 * evidence picker, and confirm dialog are intentionally absent — they
 * ship in later sub-phases (7.2, 7.3, 7.4).
 */

import * as React from 'react';
import { useFetchJson } from '../mdx/hooks/useFetchJson';
import { PdevRail } from './shell/Rail';
import { PdevTopBar } from './shell/TopBar';
import { PdevAnaDock } from './shell/AnaDock';
import { PdevOverview } from './surfaces/Overview';
import { PdevWorkstreamSurface } from './surfaces/Workstream';
import { PdevActivityDetail } from './surfaces/ActivityDetail';
import {
  usePdevProgram,
  usePdevReadiness,
  usePdevWorkstream,
} from './hooks/usePdevData';
import { isWorkstreamNav } from './data/nav';
import type { PdevActivityView } from './data/types';
import type { PdevWorkstream } from './data/enums';

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
}

interface IndProgramListPayload {
  data: IndProgramRow[];
}

export interface PdevAppProps {
  /** Initial nav id from a deep-link, e.g. 'cmc'. */
  initialNav?: string;
  /** Optional pre-selected program id (deep-link). */
  initialProgramId?: string | null;
  /** AnA gateway adapter. The dock collects prompts; routing them to
   *  the real chat surface is the host app's responsibility. */
  onAskAna?: (text: string, context: { programCode: string | null; activityKey: string | null }) => void;
}

export function PdevApp({ initialNav, initialProgramId, onAskAna }: PdevAppProps) {
  // ── Program selector — list of IND programs from the existing
  //    /api/regulatory-programs endpoint. The PDEV surfaces anchor to
  //    one program at a time per brief §2.0.
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

  // ── Surface routing ────────────────────────────────────────────────
  const [activeNav, setActiveNav] = React.useState<string>(initialNav ?? 'overview');
  const [collapsed, setCollapsed] = React.useState(false);
  const [anaOpen, setAnaOpen] = React.useState(true);
  const [activeActivity, setActiveActivity] = React.useState<PdevActivityView | null>(
    null,
  );

  // ── Data fetches gated by programId ───────────────────────────────
  const { view: programView, loading: viewLoading, error: viewError } =
    usePdevProgram(programId);
  const { report: readinessReport } = usePdevReadiness(programId);
  const workstreamId: PdevWorkstream | null = isWorkstreamNav(activeNav)
    ? activeNav
    : null;
  const { payload: workstreamPayload, loading: wsLoading } = usePdevWorkstream(
    programId,
    workstreamId,
  );

  // ── AnA bridge ─────────────────────────────────────────────────────
  const askAna = React.useCallback(
    (text: string) => {
      onAskAna?.(text, {
        programCode: programView?.program.code ?? null,
        activityKey: activeActivity?.registry.key ?? null,
      });
      setAnaOpen(true);
    },
    [onAskAna, programView, activeActivity],
  );

  // ── Derived readiness ──────────────────────────────────────────────
  const effectiveReadiness =
    readinessReport?.overall.readinessScore ??
    programView?.latestSnapshots.find((s) => s.workstream === 'overall')?.readinessScore ??
    programView?.program.progressPercent ??
    0;

  const topBlocker =
    typeof programView?.program.metadata?.blocker === 'string'
      ? (programView.program.metadata.blocker as string)
      : null;

  // ── Render ─────────────────────────────────────────────────────────
  let surface: React.ReactNode;
  if (viewError) {
    surface = (
      <div className="pdev-page-error">
        <h2>Couldn't load this program</h2>
        <p className="pdev-page-error-detail">{viewError}</p>
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
  } else if (!programView) {
    surface = (
      <div className="pdev-loading-state" aria-busy="true">
        <p>Loading PDEV program…</p>
      </div>
    );
  } else if (activeNav === 'overview') {
    surface = (
      <PdevOverview
        view={programView}
        readinessScore={effectiveReadiness}
        topBlocker={topBlocker}
        readinessThreshold={READINESS_THRESHOLD_DEFAULT}
        onAskAna={askAna}
        onSelectWorkstream={(ws) => setActiveNav(ws)}
      />
    );
  } else if (workstreamId) {
    if (wsLoading || !workstreamPayload) {
      surface = (
        <div className="pdev-loading-state" aria-busy="true">
          <p>Loading {workstreamId}…</p>
        </div>
      );
    } else {
      surface = (
        <PdevWorkstreamSurface
          ws={workstreamId}
          programCode={programView.program.code}
          payload={workstreamPayload}
          onAskAna={askAna}
          onSelectActivity={setActiveActivity}
        />
      );
    }
  } else {
    surface = (
      <div className="pdev-coming-soon">
        <h2>{HERE_LABEL[activeNav] ?? 'Surface'}</h2>
        <p>This surface ships in a later sub-phase of Phase 7.</p>
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
        program={programView?.program ?? null}
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
          program={programView?.program ?? null}
          onOpenPalette={() => askAna('Open command palette')}
        />
        <div className="pdev-page">
          <div className="pdev-page-inner">
            {viewLoading && !programView && !viewError && (
              <div className="pdev-loading-state" aria-busy="true">
                <p>Loading PDEV program…</p>
              </div>
            )}
            {surface}
          </div>
        </div>
      </main>
      <PdevAnaDock
        open={anaOpen}
        setOpen={setAnaOpen}
        program={programView?.program ?? null}
        readinessScore={effectiveReadiness}
        topBlocker={topBlocker}
        activeNav={activeNav}
        activity={activeActivity}
        onSend={askAna}
      />

      {activeActivity && (
        <PdevActivityDetail
          activity={activeActivity}
          onClose={() => setActiveActivity(null)}
          onAskAna={askAna}
        />
      )}
    </div>
  );
}
