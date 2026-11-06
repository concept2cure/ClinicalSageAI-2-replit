/**
 * Project home's six steps: the segmented control that opens one.
 * Moved out of ProjectHome.tsx on 2026-10-25; its band retired on 2026-11-06 (D3-1).
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
   panels: each stage renders below the conversations, so a nav is what it is.
   D3-1 (2026-11-06, .design/claude-convergence/D3.md §4.6): drawn as D0's
   segmented control (`.seg` / `.seg-b` / `data-on`), not a stepper: the open
   step is the one being viewed, never where the project is. `.pj-lc`,
   `.pj-lc-stage`, `data-status="active"` and `aria-current="step"` stay, for
   the code and the tests that find a step by them. */
export function StageTracker({ stage, setStage, lifecycle = PJ_LIFECYCLE }: { stage: string; setStage: (s: string) => void; lifecycle?: typeof PJ_LIFECYCLE }) {
  return (
    <nav className="pj-lc" aria-label="Project lifecycle">
      <div className="seg">
        {lifecycle.map((s) => {
          const on = s.id === stage;
          return (
            <button key={s.id} type="button" className="seg-b pj-lc-stage" data-status={on ? 'active' : undefined} data-on={on || undefined}
              aria-current={on ? 'step' : undefined} onClick={() => setStage(s.id)} title={s.blurb}>
              <span className="pj-lc-ic" aria-hidden="true">{I[s.icon] || I.grid}</span>
              <span className="pj-lc-l">{s.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/* The band under the steps ("What to do now", "Next step") was retired on
   2026-11-06 (D3-1; ONE_DESIGN_PLAN §2: guidance boxes move into AnA and the
   composer). Its guidance lives on as each step's starter in the composer
   (PJ_LIFECYCLE[].starter, ProjectHome.tsx stepStarters) and its blurb as one
   quiet line under the steps; its "next step" is the next item of this
   control. */
