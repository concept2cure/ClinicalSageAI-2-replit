/**
 * Pyramid surface — submission work-breakdown pyramid (type selector →
 * dashboard → work breakdown → analytics → global browser).
 *
 * RE-ANCHOR (real-data standard — no mock in a shipped surface):
 * every view here was driven by the BX-204 NDA fixture (fixtures/pyramid-data.ts),
 * fetched with useLive from /api/v1/pyramids/types, /api/v1/pyramids/:type and
 * /api/v1/global-pyramids. Those routes DO NOT EXIST. The pyramid engine
 * (services/regulatory/SubmissionPyramidEngine.ts + globalPyramids.ts) is a pure,
 * deterministic computation layer with no server handler exposing it — no
 * server route references the engine, and docs/PYRAMID_UI_ADVISORY.md §7 states
 * verbatim "These routes do not exist yet. They must be created." All three data
 * slices are therefore MISSING, so this surface renders an honest "not yet
 * available" state instead of presenting a fabricated NDA program (BX-204 /
 * NDA 212345, its tasks, risk profile and resource load) as the user's real
 * submission plan.
 *
 * Restore the rich dashboard / work-breakdown / analytics / global-browser
 * views (they remain in git history and in PyramidAnalytics.tsx) once the engine
 * is wired to those routes; re-anchor each slice onto useLiveData/useLiveRows at
 * that point. The deterministic generators and vocab/role config in
 * pyramid-data.ts are canonical and stay as-is for that work.
 */
import { I } from '../icons';
import { EmptyState } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import '../styles/pyramid-v2.css';

export function PyramidShell(_props: SurfaceViewProps) {
  return (
    <div className="py" data-screen-label="Submission pyramid">
      <div className="reg-h">
        <div>
          <div className="ph-eyebrow">Submission · planning</div>
          <h1 className="reg-title">Submission pyramid</h1>
          <p className="reg-sub">Deterministic work breakdown for every submission type.</p>
        </div>
      </div>
      <EmptyState
        icon={I.gitBranch}
        title="Submission pyramid isn't connected yet"
        hint="The engine that derives the phases, tasks, critical path, risk profile and document coverage for a submission isn't exposed through an API yet, so there's no real submission plan to load here. This surface will populate once that engine is wired to its routes — it won't show placeholder data in the meantime."
      />
    </div>
  );
}

export default PyramidShell;
