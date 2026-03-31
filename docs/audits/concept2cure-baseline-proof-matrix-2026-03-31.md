# Concept2Cure Baseline Proof Matrix (Pre-Consolidation)

Date: 2026-03-31

## Notes
This baseline is captured before major architectural consolidation. Automated checks were run where possible in this environment; end-to-end UI flows requiring seeded data and interactive browser execution are marked as **Not run in CI shell**.

| Flow | Baseline status | Evidence |
|---|---|---|
| Create project | Not run in CI shell | Requires authenticated UI/API integration test harness |
| Create/open artifact | Not run in CI shell | Requires project fixture + API token |
| Edit artifact | Not run in CI shell | Editor interaction path is browser-driven |
| Save artifact | Not run in CI shell | Save endpoint coupled to authenticated project context |
| Reopen artifact | Not run in CI shell | Requires persisted artifact fixture |
| Generate governed output through AI | Not run in CI shell | Requires model credentials and route integration |
| Place artifact into project/dossier context | Not run in CI shell | Requires placement fixtures and UI state |
| Export artifact | Not run in CI shell | Requires artifact and export format fixtures |

## Baseline Follow-up Requirement
Before enabling consolidation changes by default, run this same matrix in a seeded environment with:
- authenticated tenant fixture,
- project/artifact seed data,
- browser-driven e2e runner,
- export validation harness.
