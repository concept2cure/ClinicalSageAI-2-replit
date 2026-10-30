# Complete the existing project risk-file workflow

Launch row D2. Canonical branch: concept2cure-v2.

## Risk-file continuation on 2026-10-30

### What already exists

The previous environment's unfinished local risk changes were lost when that environment was replaced. Published workflow changes remain on the canonical branch. This continuation starts from `47ce1d3d95eff4a6b3614146cc79b670d7b20645` and follows the accepted direction in `.design/client-journey/INFORMATION_ARCHITECTURE.md`.

- `client/src/concept2cure/v2/surfaces/RiskRegister.tsx` is now the canonical ISO 14971 panel. `mdx/surfaces/EngineeringSurface.tsx` mounts it and the existing `DesignControlsTrace.tsx`; `engineeringPanelsContext.ts` reports their context into the host's single AnA publish. `Risk.tsx` was removed in fold F1c (`303f4901`). It must remain removed. The newer core feature includes signed acceptance and signed-content lock behavior.
- `ProjectMdxWorkflow.tsx` reaches Engineering from risk, design-control and manufacturing workstreams. `projectDoors.ts` owns job-based button labels. The missing handoff is focus on the requested existing subsection; a second Risk screen or Evidence register would reverse the accepted fold.
- `RiskRegister.tsx` already reads project lists and writes hazards with programId. Its list mapper does not hydrate persisted controls, its delayed mutations lack current-visit/session guards, and a malformed acceptance row can fall back to locally accepted status. Complete these paths while preserving the existing signature ceremony and lock.
- `projectScopedRead.tsx` verifies scope metadata. `dataConnect.tsx`, the authoring current-read/session helpers and `shellProject.ts` already provide current actor/read/visit ownership. Reuse those guards, rather than inventing an independent session mechanism.
- `server/routes/mdx-risk-management.ts` now checks organization ownership using `server/lib/admit-project.ts`, gates editing roles, and uses `governed-signed-act.ts`, `mdx-risk-acceptance-lock.ts` and existing signed-content services. It still needs current private/shared-project admission on all record/control reads and mutations; the same-project binding must survive ID substitution and reparenting.
- `server/services/c2c/current-program-access.ts` and `server/services/report-os/project-access.ts` already own current program visibility and shared edit policy. Extend the existing risk API with those policies. No migration, duplicate store or alternate signature implementation.
- `navParams.ts` already supplies TTL-bounded one-shot navigation parameters and events; `shared/navigation/index.ts` owns allowed navigation parameters. Extend that handoff for existing engineering subsections, with project/actor/visit binding and busy-dialog protection.
- Existing qualification includes `foldRiskDesignControls.test.ts`, `EngineeringSurface.riskRegister.test.tsx`, risk mapping/honesty, signed-acceptance/signed-content, route recomputation and current project-access suites. Deleted-history search in this shallow checkout shows `303f4901`; the earlier checkout also established the retired `/api/design-risk` deletion (`153481465`), whose incompatible tables must remain retired.

### Completion contract

The risk workstream reaches the existing engineering risk subsection with the selected project unchanged; design controls similarly reaches its existing trace. Feature access, project refusal, signed acceptance/reopen, content locks and the host's composed AnA context remain in force. Persisted controls are read for the selected hazard with explicit loading/refusal/error/empty states. A retired project visit, actor or mount cannot hydrate current state or report a late write as current work. The client never fabricates acceptance from a missing/malformed signed row.

Risk API reads apply current project visibility, including unfiltered lists, and retain NULL program organization records only where an organization list is explicitly requested. Writes require current actor and canonical shared-edit admission in the same transaction; scoped selectors must match records, both ends of reparenting require admission, and introduced-risk links cannot cross organization/project boundaries. Signature ceremony and signed-content locks are preserved. Exact implementation boundaries are reviewed against current signed helpers before edits.

D2 evidence is filed under `docs/evidence/D2-MDX-PROJECT-WORKFLOW/2026-10-30/`. Automated tests, actual-component synthetic browser evidence and source/build/gate receipts qualify this source change; they do not establish a deployed runtime or human client acceptance.

Integration review also traced `server/routes/mdx-engineering.ts`: its existing aggregate returns the same risk and control records before the register's separate read. It checks organization ownership and runs panel SQL through the global pool. Current project admission must therefore guard this existing aggregate too, on the pinned request executor and again after panel reads. Otherwise a private project's records could still reach the same screen through the aggregate. Extend that route and its existing qualification; no second engineering service or independent visibility rule.

Browser review traced the phone layout to the existing shared `.risk-split` two-column recipe in `v2/styles/misc-surfaces-v2.css`. The MDX host clips horizontal overflow, so document width alone missed a 333px matrix beside a 193px drawer in a 390px viewport. The existing MDX stylesheet now stacks those same components below 640px and constrains matrix tracks. A Chromium regression fails on the original computed columns and passes with one column; no replacement register or stylesheet is introduced. The MDX host also keys Engineering by project, retiring its cached aggregate and working state when the project changes.

## Qualification

The owned cohorts pass 26 suites / 423 tests: server 13 / 280, risk UI 9 / 94, and project/navigation 4 / 49. After merging canonical updates through `f0e0ff86352efde626a149a256c42303bc04dfd7`, the integration cohort passes 18 / 298, including the incoming project ownership, pending-action ordering and prompt-owner changes alongside MDX tests. This integration cohort repeats some owned tests; the counts must not be added together. Exact receipts and their hashes are in [receipt-manifest.json](receipt-manifest.json).

A later canonical Vault update through `13be18d3de41170072498f460ab92073638ec838` is retained by a normal merge. Its integration cohort passes 10 suites / 94 tests, including MDX host and risk ownership regressions, and the incoming lint-source snapshot tooling passes six Node tests. The combined production build passes. These cohorts also overlap earlier MDX runs. Independent read-only compatibility review found no changes to MDX project identity or central-service entitlements. All 44 browser input pins remain byte-identical after this merge.

The server cohort includes 61 real PGlite cases using the shipped risk DDL and canonical current-access/sharing SQL: private/revoked/shared read and edit access, current actor and signer identity, item/control substitution, introduced risks, reparenting, read-currentness changes and the Engineering aggregate. Existing signed acceptance/reopen and signed-content lock suites also pass. This does not qualify native PostgreSQL RLS, concurrent lock scheduling or a live credential ceremony.

RED evidence is deliberately bounded. The entry regression failed on the missing bound subsection; the Engineering owner regression fails without its project key; client ownership/detail regressions initially fail 10 of 12 cases. The server's initial diagnostic run mixes policy failures with obsolete pool-fixture failures: only the old acceptance/reopen assertions that returned 201 for the wrong project or a revoked share establish the policy RED, not every failure in that log. The renamed helper suites retain their earlier names in those historical receipts. The mobile browser RED records the actual two-column computed layout before the stylesheet correction.

[The Chromium result](ui/browser-result/result.json) passes eight checks with 44 selected production/fixture inputs pinned before and after the run. It imports the shipped `ProjectMdxWorkflow`, `MdxSurfaceHost`, `EngineeringSurface` and `RiskRegister`, uses explicit synthetic GET interception, refuses writes and unlisted reads, and reports zero unexpected requests and browser errors. It covers keyboard arrival, composed AnA context, saved/empty/unavailable controls, risk and aggregate refusals, and a stacked 390px layout. Screenshots are direct browser captures; none is an authenticated client acceptance or deployed application test.

Forced lint over the 37 changed executable inputs reports zero errors and 15 existing warnings. The warning ratchet verifies no increase. The combined production build and full pre-push gates pass, including zero TypeScript errors; exact receipts are recorded in [qualification.json](qualification.json). The strict companion-file scan passes for new helpers; its warnings on older filenames are presence checks, not executed test evidence. An independent read-only review found no scoped blockers, including after the canonical merge; it performed no additional tests.

No migration, production dependency, entitlement grant or application entry is added. Legacy unanchored program relationships return 409; unavailable current admission remains 503. Project risk reads and mutations use the existing governed records. Live deployment and `/api/version` remain unverified; no release dispatch was performed.

The final source integration through `84853e7bc5c3a81e1b0634703e0585954dac8b9c` retains CSR updates. Eighteen suites / 272 tests pass, including the MDX current-access SQL and risk ownership suites. Its SQL actor-admission branch remains compatible; the shared `csr/project-scope.ts` dependency is included in the 36 source fingerprints. The final combined build and full pre-push gates pass with zero TypeScript errors. This cohort overlaps earlier runs. The subsequent canonical commit `90e5c3a1a9530d4def1caf9a2d1299a36c4d7d8c` changes documentation only and is preserved; its commit and tree were imported byte-for-byte through the GitHub REST API when Git HTTP authentication was unavailable. All 36 source and 44 browser-input hashes remain verified.


The final integrations preserve editor source continuity, CSR follow-through,
Vault upload receipts and the project-initiation work through `819029e2c187f2a8d5f092fd3bce836b200977e3`.
The corresponding integration cohorts pass 7 / 69, 20 / 334, 8 / 124 and
5 / 78 respectively (suites / tests); these repeat some earlier tests.
The final CSR STF source correction also passes 5 / 59 targeted suites / tests.
The Vault saved-title convergence passes 7 / 128 suites / tests, including
the current MDX project host and risk read ownership; counts overlap earlier runs.
Read-only compatibility review found no scoped blockers. The latest actual-component
browser run passes all eight checks after the incoming project stylesheet changes.
All 37 source fingerprints and 44 browser input pins match the final tree.
The final combined production build and full pre-push gates pass with zero
TypeScript errors. The pre-push comparison is the canonical source at `b1455c944cae51296784cc5c50c719f1255e5888`;
any subsequent documentation-only publication is retained without rerunning source checks.
The earlier pre-push attempt during upload-receipt integration
ended before its typecheck result was captured; the final complete receipt
supersedes it. Publication checks the exact Git tree and uses a guarded branch
update to preserve every canonical change. Live runtime verification remains open.
