/**
 * PDEV Overview surface — Program dashboard (PHASE_7_INSTALL.md §0 row 1).
 *
 * Port of design-system/ui_kits/pdev/Surfaces.jsx > PdevOverview with
 * fixture rows replaced by live data from usePdevProgram + usePdevReadiness.
 * Read-only — no Snapshot mutation in PR 1 (the button surfaces a request
 * to AnA in lieu of POSTing /readiness/snapshot, which is a 7.2 concern).
 */

import * as React from 'react';
import { PdevIcon } from '../icons';
import {
  PDEV_WORKSTREAMS,
  PDEV_WORKSTREAM_LABELS,
} from '../data/enums';
import type {
  PdevProgramView,
  PdevWorkstreamRollup,
} from '../data/types';

interface OverviewProps {
  view: PdevProgramView;
  /** Latest readiness score — prefer live recompute if loaded, else fall
   *  back to the most recent snapshot. */
  readinessScore: number;
  /** Top blocker hint to surface in the header card. */
  topBlocker: string | null;
  /** Optional threshold pulled from the readiness service; falls back to
   *  the project-wide IND filing threshold (85 in the design brief). */
  readinessThreshold: number;
  /** Asks AnA — the right-rail dock handles routing. */
  onAskAna: (text: string) => void;
  /** Switch the rail / surface to a workstream drill. */
  onSelectWorkstream: (ws: string) => void;
}

const IND_READINESS_THRESHOLD_DEFAULT = 85;

export function PdevOverview({
  view,
  readinessScore,
  topBlocker,
  readinessThreshold,
  onAskAna,
  onSelectWorkstream,
}: OverviewProps) {
  const { program, workstreams } = view;
  const rollupByWs = React.useMemo(() => {
    const m = new Map<string, PdevWorkstreamRollup>();
    for (const r of workstreams) m.set(r.workstream, r);
    return m;
  }, [workstreams]);

  const targetIndIso = program.targetSubmissionDate
    ? program.targetSubmissionDate.slice(0, 10)
    : null;

  return (
    <>
      <div className="pdev-page-header">
        <div>
          <div className="pdev-page-eyebrow">Domain · PDEV</div>
          <h1 className="pdev-page-title">
            {program.code} · {program.productName}
          </h1>
          <div className="pdev-page-sub">
            {program.primaryAgency}
            {targetIndIso && ` · target IND ${targetIndIso}`}
            {program.phase && ` · ${program.phase}`}
          </div>
        </div>
        <div className="pdev-page-actions">
          <button
            className="pdev-btn ghost"
            onClick={() => onAskAna(`What is blocking IND for ${program.code}?`)}
            type="button"
          >
            <PdevIcon name="sparkles" /> Ask AnA
          </button>
        </div>
      </div>

      <div className="pdev-readiness-card">
        <div className="pdev-readiness-num">
          {Math.round(readinessScore)}
          <span className="unit">%</span>
        </div>
        <div className="pdev-readiness-body">
          <div className="pdev-readiness-label">Overall readiness</div>
          {topBlocker && (
            <div className="pdev-readiness-sub">{topBlocker}</div>
          )}
          <div className="pdev-readiness-meta mono">
            Threshold {readinessThreshold || IND_READINESS_THRESHOLD_DEFAULT}%
            {view.latestSnapshots.length > 0 && (
              <>
                {' '}
                · last snapshot{' '}
                {new Date(view.latestSnapshots[0].computedAt).toLocaleDateString()}
              </>
            )}
          </div>
        </div>
        <div className="pdev-readiness-bar">
          <div
            className="pdev-readiness-fill"
            style={{ width: `${Math.min(100, Math.max(0, readinessScore))}%` }}
          />
        </div>
      </div>

      <section className="pdev-section">
        <div className="pdev-section-head">
          <h2>Workstream rollup</h2>
          <span className="pdev-section-sub">Click any workstream to drill in</span>
        </div>
        <div className="pdev-workstream-strip">
          {PDEV_WORKSTREAMS.map((ws) => {
            const r = rollupByWs.get(ws);
            const total = r?.totalActivities ?? 0;
            const done = r?.completedActivities ?? 0;
            const blocked =
              (r?.blockedActivities ?? 0) +
              0; /* changes_requested already in blocked via service */
            const readiness = r ? Math.round(r.readinessScore) : 0;
            return (
              <button
                key={ws}
                className="pdev-workstream-card"
                onClick={() => onSelectWorkstream(ws)}
                type="button"
              >
                <div className="pdev-workstream-card-head">
                  <span className="pdev-workstream-name">
                    {PDEV_WORKSTREAM_LABELS[ws]}
                  </span>
                  <span className="pdev-workstream-readiness mono">
                    {readiness}%
                  </span>
                </div>
                <div className="pdev-workstream-mini-row">
                  <span className="pdev-mini-label">complete</span>
                  <div className="pdev-mini-bar">
                    <div
                      className="pdev-mini-fill ok"
                      style={{
                        width: total > 0 ? `${(done / total) * 100}%` : '0%',
                      }}
                    />
                  </div>
                  <span className="pdev-mini-count mono">
                    {done}/{total}
                  </span>
                </div>
                <div className="pdev-workstream-mini-row">
                  <span className="pdev-mini-label">blocked</span>
                  <div className="pdev-mini-bar">
                    <div
                      className="pdev-mini-fill err"
                      style={{
                        width: total > 0 ? `${(blocked / total) * 100}%` : '0%',
                      }}
                    />
                  </div>
                  <span className="pdev-mini-count mono">
                    {blocked}/{total}
                  </span>
                </div>
                <div className="pdev-workstream-card-foot">
                  <span>View workstream</span>
                  <span className="arr">
                    <PdevIcon name="arrowRight" />
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}
