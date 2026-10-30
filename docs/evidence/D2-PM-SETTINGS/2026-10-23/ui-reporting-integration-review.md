# Reporting chooser merge: PM-06 interface review

Read-only review after the root normally merged Reporting chooser publication through `36a390c47` at `8b5fae9da`. No source/test edits or new tests were needed.

All **88/88** PM-06 `source-bindings.json` inputs match their recorded SHA-256 values. None imports `InsightsLegalPackage`, `InsightsPackageStationery` or `PagedCompanyLegalPicker`. Incoming runtime changes are confined to those three chooser components; they reuse the existing company-session/resource helpers, auth service, paged legal inventory and server ZIP path. They neither call the project settings endpoint nor change its actor, tenant, revision, audit or unknown-save contract. No actionable PM-06 interaction was found.

The bounded settings/Home/LaunchScope inputs therefore remain unchanged. The earlier 43-case integration run was not repeated, and Reporting cases are not added to PM-06 counts.

## Retained Reporting source and publication proof

Evidence root: `docs/evidence/D2-REPORTING-LEGAL-CHOOSER/2026-10-23/`.

- All **159/159** `qualified-source.json` pins match current merged bytes and the actual Git blobs at accepted code `75d277264e4d8dbae42d955fb9b98225d010dae9`.
- `code-push.txt` SHA-256 matches `code-publication.json` and `code-push-exit.json`: `6816f37d517833c176618050220dd50a8828800d6dc457d05e46ed2d135a91e3`.
- The actual push transcript records whole TypeScript **0 errors, compiler exit 0**, no added pushed ESLint warnings, all normal gates passed, and accepted `1eca721b1..75d277264 concept2cure-v2 -> concept2cure-v2`. The process exit receipt is 0; this is distinct from the separately retained earlier compiler rejection.
- The publication receipt records fresh local/remote equality at that accepted code, 159 matching source pins, clean worktree and no unmerged paths. The current incoming documentation commit is its descendant, not a replacement code qualification.

The retained final corrected Reporting cohort is **41/3**; the separate template integration is **157/7**. The earlier **231/13** run includes 11 PGlite inventory cases, 50 ZIP route cases and 19 legal-package service cases. These are retained upstream executions with their own source epochs, not new UI-agent runs or additional PM coverage. PGlite/service/route tests are not described as native PostgreSQL acceptance.

The upstream manual reader check remains Not run, and publication proof does not establish deployment, authenticated hosted-browser or agency acceptance. Root separately owns current combined build, TypeScript and final PM publication. This review used only read-only Git/filesystem checks; no Git mutation, provider call, build or TypeScript run was performed by the UI agent.
