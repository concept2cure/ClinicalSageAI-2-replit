# RC Beta Candidate Proof (Stage 9)

Generated: 2026-04-01

## Branch and baseline
- Branch: `rc/beta-candidate-01`
- Baseline commit at branch cut: `d4a24cc0`

## Merged slices in this RC line
See `docs/release/RC_MERGE_LEDGER.md` for exact slice ledger and deferred list.

## Commands run + observed outcomes
- `git checkout -b rc/beta-candidate-01` ✅
- `npx vitest run --environment jsdom tests/concept2cure/project-module-route-policy.test.ts` ✅ (9 passed)
- `npx vitest run tests/routes/ai-entry-point-contract.test.ts` ✅ (33 passed)
- `npx tsx scripts/seed/rc-beta-seed.ts` ✅ (deterministic seed contract emitted)
- `npx playwright test tests/e2e/rc-beta-path.e2e.ts --project=chromium` ⚠️ blocked by package-registry policy (`403 Forbidden` fetching playwright)

## Pulse checks run
- Route policy smoke for project-module paths: pass.
- AI entry-point contract smoke: pass.
- RC browser pulse test authored with Stage-9 required checks (root, aliases, client-portal fence, authenticated project route, workspace/review/provenance-return continuity, fail-closed smoke, command-safety smoke), but live execution blocked in this shell.

## Seeded projects / IDs
- `RC-BIO-001`
- `RC-DEV-001`
- Seed spec: `docs/proof/RC_SEED_CATALOG.md`

## Screenshots
- Planned screenshot output directory for RC pulse: `test-results/rc-beta-path-screenshots/`.
- No new screenshots generated in this shell because Playwright execution was blocked by package policy.

## Pass/fail status
- **PASS**: RC docs package generation, seed contract generation, route-policy and AI-entry contract tests.
- **WARN**: Browser pulse execution blocked by environment policy.

## What remains unproven here
- Full live founder walkthrough against running app + seeded DB.
- Browser screenshot evidence from this exact RC branch in this environment.

## Remaining blockers for broader beta promotion
- Run Playwright RC pulse in an environment with Playwright package/browsers available.
- Execute and capture founder click path with screenshots against seeded data.
