# Repository Audit & Remediation Plan (Phase Continuation)

_Last updated: 2026-03-24_

## Current blocking state

The audit cannot progress to meaningful type/lint/test triage until dependency resolution is stable in CI/local dev:

1. `npm install` fails with a registry policy `403 Forbidden` on scoped packages.
2. `yarn run lint` fails because the workspace isn't represented in lockfile state.
3. `npm run -s typecheck` fails early with missing ambient type packages (`jest`, `node`, `react`, `react-dom`) before file-level diagnostics can be trusted.

## Plan overview

### Phase 0 — Environment unlock (must finish first)

- [ ] Decide and standardize package manager (`npm` vs `yarn@4`) for this repo.
- [ ] Restore a single source of truth lockfile and commit it.
- [ ] Ensure registry/auth policy allows all required packages.
- [ ] Add a bootstrap check in CI:
  - install succeeds
  - lockfile is immutable
  - node/yarn versions are pinned and printed

**Exit criteria:** clean dependency install in CI and local without manual overrides.

### Phase 0.1 — Dependency policy alignment

- [ ] Confirm whether private registry mirrors or allow-lists are required for:
  - `@anthropic-ai/*`
  - `@tiptap/*`
  - any transitive scoped packages blocked by org policy.
- [ ] Document `.npmrc` / Yarn npmScopes configuration in repo docs.
- [ ] Add a one-command environment verifier:
  - `node -v`
  - `npm -v`
  - `yarn -v`
  - registry endpoint echo
  - auth/token presence check (without printing secret values)

**Exit criteria:** dependency install failures become deterministic and actionable (not opaque 403 surprises).

### Phase 1 — Fast safety scan

- [ ] Run and archive baseline outputs:
  - `npm run typecheck` (or `yarn tsc --noEmit` once standardized)
  - `npm run lint`
  - `npm test`
- [ ] Bucket issues by class:
  - parse/syntax blockers
  - type-level regressions
  - lint/security warnings
  - flaky tests / environment-coupled tests
- [ ] Prioritize "build blockers" over quality-only warnings.

**Exit criteria:** a machine-readable baseline artifact checked into CI artifacts.

### Phase 1.1 — Baseline artifact schema

Store baseline diagnostics as structured files to compare trendlines over time:

- `artifacts/audit/baseline/typecheck.json`
- `artifacts/audit/baseline/lint.json`
- `artifacts/audit/baseline/test-summary.json`
- `artifacts/audit/baseline/environment.json`

Minimum metadata per artifact:

- timestamp (UTC)
- git SHA
- command
- exit code
- error count
- warning count
- top 20 failing files (if applicable)

### Phase 2 — Batch remediation strategy

Fix in small, reviewable batches to reduce regression risk:

- **Batch A:** parser + JSX/TS syntax breakages (must compile).
- **Batch B:** strict TypeScript errors by domain (`client`, `server`, `shared`).
- **Batch C:** lint rule violations with autofix-safe rules first.
- **Batch D:** test failures, then flaky test stabilization.

Each batch should include:
- scope list
- owner
- expected risk
- rollback plan

### Phase 3 — Guardrails to prevent backslide

- [ ] Add CI gates:
  - typecheck required
  - lint required
  - test required (or required subset + nightly full)
- [ ] Add changed-files checks for faster PR feedback.
- [ ] Enforce generated artifact consistency checks (if codegen exists).
- [ ] Document troubleshooting for registry and lockfile failures.

### Phase 4 — Continuous quality budgets

- [ ] Define and publish budgets (ratcheting targets):
  - max TypeScript errors
  - max lint warnings
  - max flaky tests
- [ ] Enforce non-regression gate:
  - PRs may not increase any budget metric.
- [ ] Add weekly scheduled audit run that posts trend report to team channel.

## Execution template for each batch PR

1. Baseline failing command(s).
2. Minimal focused code changes.
3. Re-run failing command(s).
4. Record before/after count.
5. Note deferred issues explicitly.

## Ownership model

Use explicit ownership to avoid “everyone owns it” drift:

- **Environment/Tooling owner:** lockfile, registry, CI bootstrap.
- **Frontend owner:** TSX parser/type errors in `client/`.
- **Backend owner:** type/lint/test errors in `server/`.
- **Shared schema owner:** issues in `shared/`, contracts, and generated types.
- **QA owner:** flaky test triage and stabilization.

Each batch PR should name:

- primary owner
- reviewer from adjacent domain
- fallback owner

## Definition of done (repo audit milestone)

The audit milestone is complete only when all of the following are true:

1. Clean install in CI and local developer bootstrap documentation validated.
2. Typecheck passes in CI with stable command.
3. Lint passes in CI with agreed warning policy.
4. Test suite passes (or approved quarantined list with owner + expiry date).
5. Baseline artifacts generated automatically and retained for comparison.
6. CI prevents regression on key quality metrics.

## Risks & mitigations

- **Risk:** registry policy changes block installs unexpectedly.  
  **Mitigation:** mirror critical packages + alerting on install failures.
- **Risk:** giant PRs create review and rollback risk.  
  **Mitigation:** enforce batch-size limits and domain-scoped PRs.
- **Risk:** flaky tests hide true regressions.  
  **Mitigation:** quarantine with expiration and owner accountability.
- **Risk:** inconsistent local setups produce non-reproducible failures.  
  **Mitigation:** publish environment verifier + pinned versions.

## 14-day execution cadence (proposed)

- **Days 1-2:** Phase 0 / 0.1 environment unlock.
- **Days 3-4:** Phase 1 baseline capture and issue bucketing.
- **Days 5-8:** Batch A+B fixes (parser + highest-impact TS errors).
- **Days 9-11:** Batch C lint reductions and autofix-safe cleanup.
- **Days 12-13:** Batch D tests and flaky stabilization.
- **Day 14:** CI guardrails + budget enforcement rollout.

## Progress tracking table

| Area | Metric | Baseline | Current | Target | Owner | Status |
|---|---:|---:|---:|---:|---|---|
| Install | clean install success | TBD | blocked | pass | Tooling | 🔴 |
| Typecheck | TS error count | TBD | blocked early | 0 blockers | FE/BE | 🔴 |
| Lint | error count | TBD | blocked | 0 | FE/BE | 🔴 |
| Tests | failed tests | TBD | blocked | 0 critical | QA | 🔴 |


## Immediate next actions (next PR)

1. Resolve lockfile/registry constraints and produce a successful install transcript.
2. Capture full typecheck output into `artifacts/typecheck-baseline.txt`.
3. Open Batch A PR for remaining parser/syntax issues repo-wide.
