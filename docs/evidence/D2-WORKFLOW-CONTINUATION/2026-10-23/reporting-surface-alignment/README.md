# Reporting surface wording, 23 October 2026

## What already exists

The existing `report-engine` specialist analyzes protocol synopses, drafts design recommendations, statistical insights and IND-readiness notes, reads organization-scoped CSR aggregates and hands drafts to Authoring. Its registry row feeds the shell's metadata; `shared/navigation/index.ts` supplies the existing AnA navigation target. Insights is the launch Reporting & analytics canvas. ReportGovernance is the separate intelligent-report lifecycle surface. The existing surface decision is recorded in `docs/SURFACE_DECISIONS_2026-10-08.md`; the specialist remains outside the current launch catalog. A path-limited search found no deleted predecessor for these three existing files.

## Change

The specialist's registry label, navigation label and heading now say **Protocol analysis**. Its descriptions name the actual draft outputs and CSR aggregates, replacing the registry's promise of immutable sealed reports. This changes four lines across three existing files. IDs, deep links, layouts, styling, launch scope, API claims, entitlements and report lifecycle behavior are preserved. No new application, report engine, API, dependency or test was added.

This corrects specialist wording. It is not a main-canvas redesign, a new launch surface, or broader regional reporting coverage. The earlier source assessment in `../reporting-current-state/` remains a historical assessment of its named snapshot; this follow-up resolves the naming/description mismatch it identified.

## Verification

The source base is published canonical commit `9d122d8d540524e3cc6f9a68e3a42591927352a8`. Its successful normal push, zero-error complete TypeScript check and remote ancestry verification are retained here separately from this wording patch. Hosted checks for that base were queued/pending when observed.

For this patch, all **45 tests in six existing suites pass**, with no failures, pending cases or TODOs, in 6.17 seconds. The three protocol-analysis suites cover honest findings, real/empty/error CSR reads and correct document tabs. Registry coverage/validity and shared navigation also pass. All nine target source/test hashes remained unchanged during execution.

The client production build passes in 19.18 seconds; server and audit-verifier builds pass. Lint exits zero with ten existing warnings and zero errors. The catalog-copy and implementation-in-copy checks pass. `checks.json` records exact commands and source pins; `archives.json` records decoded and encoded hashes for the lossless logs and test result. Final warning comparison, complete TypeScript and repository contracts run through the normal pre-push hook. Publication and the actual hosted CI state are verified after that push.

Live Codespace/approved-model acceptance and regulated release qualification remain open, as recorded in the adjacent delivery packet. The existing Vault re-filing TODO and earlier hosted-CI failures are not closed by this copy change.
