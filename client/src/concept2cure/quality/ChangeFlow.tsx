/**
 * ChangeFlow — the change log's lifecycle stage filter.
 *
 * The controlled change pipeline (proposed → under assessment → approved → in
 * implementation → verification → closed, and the rejected and cancelled
 * off-ramps), each with how many changes sit at it, as one segmented control
 * that filters the log. "All" is the clear.
 *
 * Until 2026-11-10 (D7-B) this was a boxed "flowchart": six count tiles joined
 * by arrows, each with a coloured dot from its own hex palette and an orange
 * selected state, two off-ramp chips beneath, and an "Explain the pipeline"
 * link to AnA. Stat tiles and a second accent are retired patterns
 * (ONE_DESIGN_PLAN §2); the counts and the filter are the same, said quietly.
 * Every stage keeps its accessible name ("Proposed: 1 change. Change request
 * raised."). AnA's read-out of the pipeline is the tab's first starter.
 *
 * @module client/src/concept2cure/quality/ChangeFlow
 */

import * as React from 'react';
import { FLOW_STEPS, STATE_LABEL, type ChangeState } from './changeData';

export interface ChangeFlowProps {
  /** Live per-stage counts (how many changes currently sit at each lifecycle state). */
  counts: Record<ChangeState, number>;
  /** The stage the log is filtered to, or 'all'. */
  activeStage?: ChangeState | 'all';
  /** Select a stage (filters the log); 'all' clears. */
  onSelectStage: (stage: ChangeState | 'all') => void;
}

const OFF_RAMPS: { key: ChangeState; label: string; blurb: string | null }[] = [
  { key: 'rejected', label: STATE_LABEL.rejected, blurb: null },
  { key: 'cancelled', label: STATE_LABEL.cancelled, blurb: null },
];

export function ChangeFlow({ counts, activeStage = 'all', onSelectStage }: ChangeFlowProps) {
  const stages = [...FLOW_STEPS.map((s) => ({ key: s.key, label: s.label, blurb: s.blurb as string | null })), ...OFF_RAMPS];
  return (
    <div className="seg qcc-stages" role="group" aria-label="Lifecycle stage">
      <button type="button" className="seg-b" aria-pressed={activeStage === 'all'} onClick={() => onSelectStage('all')}>
        All
      </button>
      {stages.map((step) => {
        const n = counts[step.key] ?? 0;
        const on = activeStage === step.key;
        return (
          <button
            key={step.key}
            type="button"
            className="seg-b"
            aria-pressed={on}
            aria-label={`${step.label}: ${n} ${n === 1 ? 'change' : 'changes'}.${step.blurb ? ` ${step.blurb}.` : ''}`}
            onClick={() => onSelectStage(on ? 'all' : step.key)}
          >
            {step.label} <span className="qcc-stage-n">{n}</span>
          </button>
        );
      })}
    </div>
  );
}
