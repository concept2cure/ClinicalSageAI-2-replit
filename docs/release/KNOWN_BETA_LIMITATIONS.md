# Known Beta Limitations (RC Candidate 01)

Generated: 2026-04-01

## Tolerated debt
- Repo-wide typecheck is not fully green (pre-existing broad TS debt outside RC-safe slices).
- Some legacy route surfaces remain for compatibility but are not curated.

## Known rough edges
- Existing test drift in selected suites remains documented from prior stages.
- Some workspace sub-views can render sparse states depending on seeded depth.

## Known not-yet-exposed capabilities
- Legacy/secondary modules intentionally demoted from beta navigation.
- Deep experimental workflows not promoted into founder/tester click paths.

## Known environment-sensitive failures
- Browser E2E proof depends on a running local app + seeded database.
- Missing infra/API keys can degrade non-primary service behavior.

## Known test gaps
- Full live Playwright RC run not guaranteed in every CI/dev shell without active server boot.
- Some historical suites are retained as tripwires and can fail due to drift unrelated to RC-safe path.
