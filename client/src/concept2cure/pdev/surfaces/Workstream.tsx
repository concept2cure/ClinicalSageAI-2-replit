/**
 * PDEV Workstream drill-down surface — PHASE_7_INSTALL.md §0 row 2.
 *
 * Port of design-system/ui_kits/pdev/Surfaces.jsx > PdevWorkstream with
 * fixture rows replaced by live data from usePdevWorkstream.
 *
 * Brief §9 Q2 defaults: grid for ≤ 12 activities, list otherwise; user
 * preference persists in `localStorage` as `pdev.viewMode`.
 *
 * Read-only — clicking an activity opens the Activity detail sheet
 * (read tabs only in PR 1).
 */

import * as React from 'react';
import { PdevIcon } from '../icons';
import {
  PDEV_COMPLETED_STATES,
  PDEV_STAGES,
  PDEV_STAGE_LABELS,
  PDEV_STATE_LABELS,
  PDEV_WORKSTREAM_LABELS,
  statePillTone,
} from '../data/enums';
import type {
  PdevActivityState,
  PdevStage,
  PdevWorkstream,
} from '../data/enums';
import type {
  PdevActivityView,
  PdevWorkstreamPayload,
} from '../data/types';
import { useSurfaceActionHandlers } from '../../v2/surfaceActions';

interface WorkstreamProps {
  ws: PdevWorkstream;
  programCode: string;
  payload: PdevWorkstreamPayload;
  onAskAna: (text: string) => void;
  onSelectActivity: (a: PdevActivityView) => void;
}

const VIEW_MODE_KEY = 'pdev.viewMode';
const GRID_THRESHOLD = 12;

type ViewMode = 'grid' | 'list';

function readStoredViewMode(): ViewMode | null {
  try {
    const v = window.localStorage.getItem(VIEW_MODE_KEY);
    if (v === 'grid' || v === 'list') return v;
  } catch {
    /* localStorage may be unavailable (private mode, SSR). Ignore. */
  }
  return null;
}

function writeStoredViewMode(v: ViewMode) {
  try {
    window.localStorage.setItem(VIEW_MODE_KEY, v);
  } catch {
    /* swallow */
  }
}

function effectiveState(a: PdevActivityView): PdevActivityState {
  return (a.state?.state ?? 'not_started') as PdevActivityState;
}

function dueLabel(a: PdevActivityView): { text: string; tone: 'overdue' | 'soon' | 'idle' } {
  const completedAt = a.state?.completedAt;
  if (completedAt) return { text: 'completed', tone: 'idle' };
  const due = a.state?.dueAt;
  if (!due) return { text: 'no due date', tone: 'idle' };
  const target = new Date(due);
  const days = Math.round((target.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return { text: `overdue ${Math.abs(days)}d`, tone: 'overdue' };
  if (days < 14) return { text: `${days}d`, tone: 'soon' };
  return { text: target.toISOString().slice(5, 10), tone: 'idle' };
}

export function PdevWorkstreamSurface({
  ws,
  programCode,
  payload,
  onAskAna,
  onSelectActivity,
}: WorkstreamProps) {
  const wsActivities = payload.activities;

  const [view, setView] = React.useState<ViewMode>(() => {
    const stored = readStoredViewMode();
    if (stored) return stored;
    return wsActivities.length <= GRID_THRESHOLD ? 'grid' : 'list';
  });

  /* If the user has never expressed a preference, default to the
     density-appropriate mode whenever the workstream changes. Stored
     preference still wins. */
  React.useEffect(() => {
    if (readStoredViewMode() !== null) return;
    setView(wsActivities.length <= GRID_THRESHOLD ? 'grid' : 'list');
  }, [ws, wsActivities.length]);

  const setViewAndPersist = (next: ViewMode) => {
    setView(next);
    writeStoredViewMode(next);
  };

  const [filterState, setFilterState] = React.useState<'all' | PdevActivityState>('all');
  const visible =
    filterState === 'all'
      ? wsActivities
      : wsActivities.filter((a) => effectiveState(a) === filterState);

  /* AnA operates this workstream through the SAME chips and view buttons the
     person uses. One component serves four surfaces (pdev-cmc, -nonclinical,
     -clinical, -regulatory), so the bus id — and the handler keys — come from
     `ws`; the leaf registers because it mounts exactly when its surface is
     shown. State changes, evidence, drafts and workflow decisions are governed
     and stay in conversation. */
  const surfaceId = `pdev-${ws}`;
  useSurfaceActionHandlers(surfaceId, {
    [`${surfaceId}.filter-activities`]: (params) => {
      const target = String(params.state ?? '');
      const legal = ['all', 'drafting', 'in_review', 'revision_required', 'approved'];
      if (!legal.includes(target)) {
        return { ok: false, reason: `No activity state named "${params.state}".` };
      }
      if (filterState === target) return { ok: true, detail: `Already filtered to ${target}` };
      /* The chip row only renders a state that has activities in it. Driving a
         filter the person cannot click would empty the board with no way back
         on screen, so an empty state refuses instead. */
      if (target !== 'all') {
        const n = wsActivities.filter((a) => effectiveState(a) === target).length;
        if (n === 0) {
          return {
            ok: false,
            reason: `No activities are in ${target} right now — that filter is not offered on screen.`,
          };
        }
      }
      setFilterState(target as 'all' | PdevActivityState);
      const shown =
        target === 'all'
          ? wsActivities.length
          : wsActivities.filter((a) => effectiveState(a) === target).length;
      return { ok: true, detail: `Filtered to ${target} — ${shown} activity(ies) listed` };
    },
    [`${surfaceId}.set-view`]: (params) => {
      const target = params.view === 'list' ? 'list' : 'grid';
      if (view === target) return { ok: true, detail: `Already in ${target} view` };
      setViewAndPersist(target);
      return { ok: true, detail: `Switched to ${target} view (sticky in this browser)` };
    },
  });

  const stageRollup = React.useMemo(
    () =>
      PDEV_STAGES.map((s: PdevStage) => {
        const inStage = wsActivities.filter((a) => a.registry.stage === s);
        const done = inStage.filter((a) =>
          (PDEV_COMPLETED_STATES as readonly string[]).includes(effectiveState(a)),
        ).length;
        const blocked = inStage.filter(
          (a) => effectiveState(a) === 'revision_required',
        ).length;
        let state: 'idle' | 'active' | 'done' | 'blocked';
        if (inStage.length === 0) state = 'idle';
        else if (blocked > 0) state = 'blocked';
        else if (done === inStage.length) state = 'done';
        else if (inStage.some((a) => effectiveState(a) !== 'not_started'))
          state = 'active';
        else state = 'idle';
        return { id: s, label: PDEV_STAGE_LABELS[s], state, count: inStage.length, done };
      }),
    [wsActivities],
  );

  return (
    <>
      <div className="pdev-page-header">
        <div>
          <div className="pdev-page-eyebrow">PDEV · {programCode}</div>
          <h1 className="pdev-page-title">
            {PDEV_WORKSTREAM_LABELS[ws]} workstream
          </h1>
          <div className="pdev-page-sub">
            {wsActivities.length} activities across 5 stages
          </div>
        </div>
        <div className="pdev-page-actions">
          <div className="pdev-seg" role="tablist" aria-label="View mode">
            <button
              className="pdev-seg-btn"
              data-on={view === 'grid' || undefined}
              onClick={() => setViewAndPersist('grid')}
              type="button"
              role="tab"
              aria-selected={view === 'grid'}
            >
              Grid
            </button>
            <button
              className="pdev-seg-btn"
              data-on={view === 'list' || undefined}
              onClick={() => setViewAndPersist('list')}
              type="button"
              role="tab"
              aria-selected={view === 'list'}
            >
              List
            </button>
          </div>
          <button
            className="pdev-btn ghost"
            onClick={() =>
              onAskAna(`Summarize ${PDEV_WORKSTREAM_LABELS[ws]} progress for ${programCode}`)
            }
            type="button"
          >
            <PdevIcon name="sparkles" /> Ask AnA
          </button>
        </div>
      </div>

      <section className="pdev-section">
        <div className="pdev-stage-strip">
          {stageRollup.map((s, i) => (
            <div key={s.id} className="pdev-stage-node" data-state={s.state}>
              <div className="pdev-stage-dot">
                {s.state === 'done' ? <PdevIcon name="check" /> : i + 1}
              </div>
              <div className="pdev-stage-label">{s.label}</div>
              <div className="pdev-stage-meta mono">
                {s.done}/{s.count}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="pdev-section">
        <div className="pdev-section-head">
          <h2>Activities</h2>
          <span className="pdev-section-sub">
            {visible.length} of {wsActivities.length} shown
          </span>
        </div>

        <div className="pdev-filter-row">
          <button
            className="pdev-filter-chip"
            data-on={filterState === 'all' || undefined}
            onClick={() => setFilterState('all')}
            type="button"
          >
            All ({wsActivities.length})
          </button>
          {(['drafting', 'in_review', 'revision_required', 'approved'] as PdevActivityState[]).map(
            (s) => {
              const count = wsActivities.filter((a) => effectiveState(a) === s).length;
              if (count === 0) return null;
              return (
                <button
                  key={s}
                  className="pdev-filter-chip"
                  data-on={filterState === s || undefined}
                  onClick={() => setFilterState(s)}
                  type="button"
                >
                  {PDEV_STATE_LABELS[s]} ({count})
                </button>
              );
            },
          )}
        </div>

        {view === 'grid' ? (
          <div className="pdev-activity-grid">
            {visible.map((a) => {
              const state = effectiveState(a);
              const due = dueLabel(a);
              return (
                <button
                  key={a.registry.key}
                  className="pdev-activity-card"
                  onClick={() => onSelectActivity(a)}
                  type="button"
                >
                  <div className="pdev-activity-head">
                    <span className="mono pdev-activity-key">{a.registry.key}</span>
                    <span className={`pdev-state-pill state-${statePillTone(state)}`}>
                      {PDEV_STATE_LABELS[state]}
                    </span>
                  </div>
                  <div className="pdev-activity-title">{a.registry.title}</div>
                  <div className="pdev-activity-meta">
                    <span>{a.state?.documentCount ?? 0} doc</span>
                    <span className="dot-sep" aria-hidden="true">·</span>
                    <span>{a.state?.evidenceLinkCount ?? 0} evidence</span>
                  </div>
                  <div className="pdev-activity-foot">
                    <span className={`pdev-due mono ${due.tone}`}>{due.text}</span>
                    {a.registry.dependsOn.length > 0 && (
                      <span className="pdev-deps-chip">
                        <PdevIcon name="link" /> deps
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="pdev-activity-list">
            <div className="pdev-activity-list-head">
              <div>Activity</div>
              <div>State</div>
              <div>Stage</div>
              <div>Due</div>
              <div>Docs</div>
            </div>
            {visible.map((a) => {
              const state = effectiveState(a);
              const due = dueLabel(a);
              return (
                <button
                  key={a.registry.key}
                  className="pdev-activity-list-row"
                  onClick={() => onSelectActivity(a)}
                  type="button"
                >
                  <div>
                    <div className="pdev-activity-title">{a.registry.title}</div>
                    <div className="mono pdev-activity-key">{a.registry.key}</div>
                  </div>
                  <div>
                    <span className={`pdev-state-pill state-${statePillTone(state)}`}>
                      {PDEV_STATE_LABELS[state]}
                    </span>
                  </div>
                  <div>{PDEV_STAGE_LABELS[a.registry.stage]}</div>
                  <div className={`mono ${due.tone}`}>{due.text}</div>
                  <div className="mono">{a.state?.documentCount ?? 0}</div>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
