/**
 * Project home's six steps: the segmented control that opens one, and the line under it.
 * Moved out of ProjectHome.tsx on 2026-10-25; its band retired on 2026-11-06 (D3-1); its guidance back as one line
 * on 2026-11-10 (P-122).
 */
import React from 'react';
import { I } from '../icons';
import { PJ_LIFECYCLE, type LifecycleStage } from '../fixtures/project-home-data';

/** The same steps as a device or diagnostic filing words them: its own blurbs for Author and Submit, its "now" lines
 *  and its suggestions. A lifecycle definition the page uses, so it lives with the steps, not under fixtures/ (moved
 *  2026-11-08: ci:launch-scope found ProjectHome importing it from fixtures/ with no allowlist reason). */
export const PJ_LIFECYCLE_DEVICE: LifecycleStage[] = PJ_LIFECYCLE.map((item) => {
  const device = { ...item, now: item.nowDevice ?? item.now, starter: item.starterDevice ?? item.starter };
  if (item.id === 'author') return { ...device, blurb: 'Author filing documents from the project’s device or diagnostic evidence' };
  if (item.id === 'submit') return { ...device, blurb: 'Assemble eSTAR or the applicable technical documentation' };
  return device;
});

/** The two wordings of the steps, by the filing's track. A choice between two definitions, not a fallback. */
const LIFECYCLES: Record<'device' | 'medicinal', LifecycleStage[]> = { device: PJ_LIFECYCLE_DEVICE, medicinal: PJ_LIFECYCLE };

/** The steps a project's filing has: a device or diagnostic filing's wording, or the medicinal one. */
export function lifecycleFor(deviceFiling: boolean): LifecycleStage[] {
  return LIFECYCLES[deviceFiling ? 'device' : 'medicinal'];
}

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

/* The band under the steps ("What to do now", "Next step") was retired on 2026-11-06 (D3-1), and with it the only
   place the step's guidance (PJ_LIFECYCLE[].now) was shown: a new team member could not tell what to do on a step or
   what came after. P-122 (2026-11-10) brings the guidance back, not as a band: one quiet line under the steps, the
   step's blurb, what to do on it, and its action, the next step. Respond is the last, and has no next. */

/** The open step's line under the steps: what it is, what to do on it, and the next step.
 *  `sequenced`: the filing builds an eCTD sequence (Submit's sentence promises one). `planListed`: Plan lists what
 *  this filing needs (its sentence promises that list). Without them the step says what it is, and no more. */
export function StepGuidance({ stage, lifecycle = PJ_LIFECYCLE, onStage, sequenced, planListed = true }: {
  stage: string; lifecycle?: LifecycleStage[]; onStage: (s: string) => void; sequenced: boolean; planListed?: boolean;
}) {
  const at = lifecycle.findIndex((s) => s.id === stage);
  const step = lifecycle[at];
  if (!step) return null;
  const next = lifecycle[at + 1];
  const now = (step.id === 'submit' && !sequenced) || (step.id === 'plan' && !planListed) ? null : step.now;
  return (
    <p className="pj-step-blurb" data-testid="pj-step-guidance">
      <span>{step.blurb}.</span>
      {now && <> <span data-testid="pj-step-now">{now}</span></>}
      {next && (
        <> <button type="button" className="btn small" onClick={() => onStage(next.id)} aria-label={`Next: ${next.label}, ${next.blurb}`}>
          Next: {next.label} {I.right}
        </button></>
      )}
    </p>
  );
}
