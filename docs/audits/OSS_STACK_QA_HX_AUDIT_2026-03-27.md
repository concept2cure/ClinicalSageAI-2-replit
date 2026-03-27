# OSS Stack QA + Human Experience Audit (2026-03-27)

## Scope
- Validate control-tower OSS gating scripts introduced in the prior rollout.
- Perform a UX-flow and aesthetics heuristic audit of the current Concept2Cure interface routing and loading flow.
- Confirm at least one concrete remediation in code from audit findings.

## Skill / instruction note
No local `SKILL.md` audit skill files were found in the repository tree at audit time (`rg --files -g '**/SKILL.md'` returned no matches). Audit was performed using repository-native scripts and manual heuristic review.

## QA automation audit runs

### 1) Supervisor/control-tower integrity
- Command: `npm run oss:supervisor:audit`
- Result: **PASS**
- Notes: Required docs, feature-flag registry keys, protected surfaces, and required npm scripts all validated.

### 2) Regulatory coverage gate
- Command: `npm run oss:reg:check -- docs/evals/oss_stack_regulatory_uat_catalog.json`
- Result: **PASS**

### 3) Golden-task eval plane
- Command: `npm run oss:eval:check`
- Result: **PASS**

### 4) GA/Beta scorecard gate
- Command: `npm run oss:ga:check -- docs/evals/oss_stack_scorecard.beta.sample.json`
- Result: **PASS** (beta readiness)

### 5) UAT metric pipeline
- Command: `npm run oss:uat:metrics -- docs/evals/oss_stack_human_sessions.template.json`
- Result: **PASS**
- Observed output: 1 session total, 100% core task success, citation trust mean 4.0, critical defects 0.

### 6) Medical-writing draft validation (positive control)
- Command: `npm run oss:medwrite:check -- docs/evals/oss_stack_medical_writing_checklist.json docs/evals/oss_stack_regulatory_uat_catalog.json docs/evals/medical_writing_drafts/fda_510k_pass_sample.md fda_510k`
- Result: **PASS**

### 7) Medical-writing draft validation (negative control)
- Command: `npm run oss:medwrite:check -- docs/evals/oss_stack_medical_writing_checklist.json docs/evals/oss_stack_regulatory_uat_catalog.json docs/evals/medical_writing_drafts/fda_510k_fail_sample.md fda_510k`
- Result: **EXPECTED FAIL** (missing required tokens + forbidden claims detected)

### 8) General code-quality checks
- `npm run lint` → **BLOCKED** (missing `@eslint/js` package in environment)
- `npm run typecheck` and `npm run check` → **BLOCKED** (missing type definition packages: `jest`, `node`, `react`, `react-dom`)
- `npm test` / `npm run test:ana` → **BLOCKED** (`jest` / `vitest` not available in environment)

## Human-experience (HX) flow and aesthetics audit

## Method
Heuristic review of route orchestration and loading/auth transitions in:
- `client/src/concept2cure/router/ZenRouter.tsx`
- `client/src/App.jsx`

### UX strengths observed
1. **Consistent branded loading state** across auth and protected flows (logo, neutral palette, subtle motion).
2. **Auth gating and return URL preservation** in protected routes (`returnTo` query construction).
3. **Progressive loading** via lazy routes and deferred route prefetching.
4. **Error boundary scaffolding** around top-level app container.

### UX/flow risks identified
1. **Potential runtime route bridge failure** in `ZenRouter.tsx`: `useRoute` was used without import from `wouter`, which can break project deep-link bridges (`/concept2cure/project/:projectId/...`) and degrade onboarding flow.
2. **Loading-state consistency risk**: duplicated loading components across old/new app shells can drift over time.
3. **Automated visual QA gap**: unable to run screenshot-based regression or interactive journey in this environment due unavailable browser automation tool in current session.

### Remediation implemented
- Added missing `useRoute` import in `ZenRouter.tsx` so project bridge routes for 510k/PMA resolve correctly and preserve intended deep-link UX.

## Recommended next steps (follow-up)
1. Add CI target that installs lint/type/test dependencies in a pinned QA container and runs:
   - `npm run lint`
   - `npm run typecheck`
   - `npm test`
2. Add browser-based journey checks for:
   - `/concept2cure/login`
   - `/concept2cure/project/:projectId/510k`
   - `/concept2cure/project/:projectId/pma`
3. Consolidate loading-screen primitive into a shared component used by both legacy and Zen app shells.
