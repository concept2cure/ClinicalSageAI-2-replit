/**
 * ChangeFlow — the change-control lifecycle flowchart.
 *
 * Renders the controlled change pipeline (proposed → under assessment →
 * approved → in implementation → verification → closed) as a horizontal chain
 * of nodes, each showing how many changes currently sit at that stage — the
 * "ongoing maintenance of the change control log" made visible. Terminal
 * off-ramps (rejected / cancelled) are shown beneath. Every node is a button
 * that filters the register to that stage; the whole thing is keyboard- and
 * screen-reader-navigable.
 *
 * @module client/src/concept2cure/quality/ChangeFlow
 */

import * as React from 'react';
import { I } from './icons';
import { FLOW_STEPS, STATE_LABEL, type ChangeState } from './changeData';

export interface ChangeFlowProps {
  /** Live per-stage counts (how many changes sit at each lifecycle state). */
  counts: Record<ChangeState, number>;
  /** Currently-filtered stage, if any — highlights that node. */
  activeStage?: ChangeState | 'all';
  /** Select a stage (filters the register). */
  onSelectStage: (stage: ChangeState | 'all') => void;
  /** Ask AnA about the flow / a stage. */
  onAsk: (q: string) => void;
}

export function ChangeFlow({ counts, activeStage = 'all', onSelectStage, onAsk }: ChangeFlowProps) {
  const rejected = counts.rejected ?? 0;
  const cancelled = counts.cancelled ?? 0;

  return (
    <div className="qcc-flow" role="group" aria-label="Change-control lifecycle">
      <div className="qcc-flow-track">
        {FLOW_STEPS.map((step, i) => {
          const n = counts[step.key] ?? 0;
          const on = activeStage === step.key;
          return (
            <React.Fragment key={step.key}>
              <button
                type="button"
                className="qcc-node"
                data-on={on || undefined}
                data-empty={n === 0 || undefined}
                aria-pressed={on}
                aria-label={`${step.label}: ${n} ${n === 1 ? 'change' : 'changes'}. ${step.blurb}.`}
                onClick={() => onSelectStage(on ? 'all' : step.key)}
              >
                <span className="qcc-node-top">
                  <span className="qcc-node-dot" data-stage={step.key} />
                  <span className="qcc-node-count">{n}</span>
                </span>
                <span className="qcc-node-label">{step.label}</span>
                <span className="qcc-node-blurb">{step.blurb}</span>
              </button>
              {i < FLOW_STEPS.length - 1 && (
                <span className="qcc-arrow" aria-hidden="true">{I.arrowRight}</span>
              )}
            </React.Fragment>
          );
        })}
      </div>

      <div className="qcc-flow-foot">
        <div className="qcc-offramps">
          <button
            type="button"
            className="qcc-offramp"
            data-on={activeStage === 'rejected' || undefined}
            onClick={() => onSelectStage(activeStage === 'rejected' ? 'all' : 'rejected')}
          >
            <span className="qcc-offramp-dot" data-stage="rejected" />
            {STATE_LABEL.rejected} · {rejected}
          </button>
          <button
            type="button"
            className="qcc-offramp"
            data-on={activeStage === 'cancelled' || undefined}
            onClick={() => onSelectStage(activeStage === 'cancelled' ? 'all' : 'cancelled')}
          >
            <span className="qcc-offramp-dot" data-stage="cancelled" />
            {STATE_LABEL.cancelled} · {cancelled}
          </button>
        </div>
        <button
          type="button"
          className="qms-link"
          onClick={() =>
            onAsk(
              'Walk me through the change-control lifecycle — where every open change sits right now, ' +
                'what is blocking the ones in assessment, and which are overdue for implementation.',
            )
          }
        >
          {I.sparkle} Explain the pipeline
        </button>
      </div>
    </div>
  );
}
