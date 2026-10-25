/**
 * Project home's six steps: the tracker that opens one, and the band that says
 * what the open step is, what to do on it, and which step comes next.
 * Moved out of ProjectHome.tsx on 2026-10-25 with the band's second line.
 */
import React from 'react';
import { I } from '../icons';
import { PJ_LIFECYCLE } from '../fixtures/project-home-data';

/* ════ Lifecycle (canonical stage catalog — not data) ════
   The tracker is navigation over the stage catalog, not a progress meter.
   Every stage before the open tab used to be marked `done` — filled node,
   filled connector — from the tab's POSITION alone. `stage` defaults to
   'author', so Plan and Evidence rendered as completed on every project,
   including with no project loaded at all, and opening Submit "completed"
   Review. Nothing this surface reads records per-stage completion, so the one
   state stated is the one that is true: which stage is open. */

/* A nav of one button per step, the open one marked aria-current="step". It was a
   role="tablist" over plain buttons carrying aria-selected, which is not valid
   on a button, so a screen reader was told of no open stage at all (design
   review 2026-10-08, a11y lens, WCAG 4.1.2). The stage bodies are not tab
   panels: each stage renders below the conversations, so a nav is what it is. */
export function StageTracker({ stage, setStage, lifecycle = PJ_LIFECYCLE }: { stage: string; setStage: (s: string) => void; lifecycle?: typeof PJ_LIFECYCLE }) {
  return (
    <nav className="pj-lc" aria-label="Project lifecycle">
      {lifecycle.map((s) => {
        const status = s.id === stage ? 'active' : undefined;
        return (
          <button key={s.id} type="button" className="pj-lc-stage" data-status={status} aria-current={stage === s.id ? 'step' : undefined}
            onClick={() => setStage(s.id)} title={s.blurb}>
            <span className="pj-lc-node"><span className="pj-lc-ic">{I[s.icon] || I.grid}</span></span>
            <span className="pj-lc-l">{s.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

/* ════ The open step: what it is, what to do now, and the next step ═════════
   docs/design/CLIENT_JOURNEY_2026-10-25.md, pass 2. The band named the step and
   described it; a new client still could not tell what to do on it or what came
   after. It now says what to do, in one sentence that is guidance about the
   step and never a claim about the program, and offers the next step, so the
   steps read as a sequence. Respond is the last, and has no next. */
export function StageBand({ stage, lifecycle = PJ_LIFECYCLE, onStage, sequenced, planListed = true }: {
  stage: string; lifecycle?: typeof PJ_LIFECYCLE; onStage: (s: string) => void; sequenced: boolean;
  /** Plan lists what this filing needs (a US IND, a device filing). Its sentence promises that list, so a
   *  filing without one is not told to "see every document" (design review, pass 3). */
  planListed?: boolean;
}) {
  const at = lifecycle.findIndex((s) => s.id === stage);
  const step = lifecycle[at];
  const next = at >= 0 ? lifecycle[at + 1] : undefined;
  if (!step) return null;
  const now = (step.id === 'submit' && !sequenced) || (step.id === 'plan' && !planListed) ? null : step.now;
  return (
    <div className="pj-stageband" data-testid="pj-stageband">
      <div className="pj-stageband-l">
        <span className="pj-stageband-stage">{step.label}</span>
        <span className="pj-stageband-blurb">{step.blurb}</span>
        {now && <span className="pj-stageband-now"><strong>What to do now:</strong> {now}</span>}
      </div>
      {next && (
        <button type="button" className="pj-stageband-next" onClick={() => onStage(next.id)}>
          <span className="pj-stageband-next-k">Next step {I.right}</span>
          <span className="pj-stageband-next-v">{next.label}: {next.blurb}</span>
        </button>
      )}
    </div>
  );
}
