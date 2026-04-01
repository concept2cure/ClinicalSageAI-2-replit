# Stage 8 — Partner Demo Runbook (Founder-Selected Path)

Date: 2026-04-01  
Branch: `cursor/customer-shaped-harness-build-5841`  
Audience: Founder + technical partner (guided beta)

## Demo objective

Show one honest, governed document-first flow with visible consequence:

1. Auth + project context
2. AnA-guided generation
3. Governed artifact consequence
4. Lifecycle + provenance/audit
5. Governed export checks

## Preconditions

- Env has `DATABASE_URL` configured and reachable.
- App is running (`npm run dev`) and login works.
- At least one project exists for the demo user.
- Use the guided path in `docs/proof/GUIDED_DEMO_CHECKLIST.md` as the script source.

## Path script (recommended)

### Step 1 — Login and open Concept2Cure shell

- Route: `/concept2cure/login` then `/concept2cure`.
- Verify the shell loads with global nav and project context.

### Step 2 — Select project and open workspace/editor path

- Navigate to an active project.
- Use sidebar/global nav:
  - Projects / AI Assistants / Documents / Setup (global)
  - Overview / Tools / Submit (project tabs)
- Note: Stage 8 included a low-risk nav mapping fix so these IDs resolve to the correct layouts.

### Step 3 — AnA-assisted generation to artifact consequence

- In chat/workspace, issue a regulatory drafting request.
- Demonstrate the save/governed consequence action (e.g., artifact creation from generated content).
- Confirm the artifact appears and can be opened in editor.

### Step 4 — Governance visibility

- In editor, show:
  - status/lifecycle controls
  - provenance panel
  - audit panel
  - version/compare where available

### Step 5 — Governed export posture

- Show that export is governed and consequence-aware.
- Use proof language from governed export suites (`tests/routes/governed-export-e2e.test.ts`).

## Partner-safe talking points

- "This is a controlled guided beta; broad beta is intentionally blocked."
- "Governed export and authoring workflow suites are green in this RC pack."
- "Known limits are documented in `docs/beta-work/stage-8-known-limits.md`."
- "Unresolved test reds are explicit and not hidden."

## Do-not-demo surfaces

- Paths listed as experimental/demoted in existing proof docs.
- Any flow requiring env/secrets that are absent in this environment.
- Any unsupported "broad beta" claim.

## Quick rollback notes for live demo failure

- Revert isolated Stage 8 nav mapping commit if shell nav regressions appear.
- Keep guided demo to validated paths; skip known-red flows.
- Fall back to static proof artifacts:
  - `docs/proof/BETA_LAUNCH_LANE_PROOF.md`
  - `docs/proof/GUIDED_DEMO_CHECKLIST.md`
  - `docs/beta-work/stage-8-known-limits.md`
