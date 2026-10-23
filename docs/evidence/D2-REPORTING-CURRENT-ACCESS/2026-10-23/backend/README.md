# Complete existing reporting authority checks

W1 / D2. Source base: `dd749f3e56f1d9055b19067e90680d70bf9a9fb9`. Root owns integrated build, full compiler, normal gates and publication.

## What already exists

`server/services/report-os/scheduling/generate-deliver.ts` already dispatches the correct report engine and commits the saved output, notification, chained audit and subscription cursor through `report-os/persistence.ts`. Its current creator/recipient checker previously ran only for a lifecycle calendar or a nonempty optional source-project list. `server/routes/report-os.ts#createRunOnChain` already contained the same enlisted current-actor/source check, but enabled it only for lifecycle calendars.

`report-os/project-access.ts` is the existing exact-scope and actual-source sharing policy, including refusal of malformed present source evidence. `c2c/current-program-access.ts` and `csr/project-scope.ts` already read active current organization actors and retain evaluated actor rows with `FOR SHARE`. `report-os/scope-ownership.ts` already checks the fresh report scope, nonarchived project, active workspace and client binding. These implementations are reused unchanged. `compute-run.ts` already records the admitted project set for program-group reports. Path-limited deleted-history searches found no predecessor to restore.

## Completion

Every schedule now calls its existing current-authority checker after computation and again on the enlisted persistence client before the occurrence cursor or notification effects. Optional source evidence no longer disables it. Every manual report installs its existing current-actor/source callback. Both late paths also re-read the existing fresh-run scope/workspace ownership using that supplied client; the earlier project-proof shortcut is not reused.

The creator must retain a writing role. Every recipient must remain an active organization member with current access to the exact scope and all actual recorded source projects. A malformed present source list refuses. The existing atomic persistence rolls back the report and its effects when an enlisted check refuses. Typed manual access and ownership errors retain their existing typed responses. No extra connection is acquired by an enlisted callback.

Only two runtime files changed. Eight test files changed, including the new `server/routes/__tests__/report-os-current-run-access.test.ts`. Three existing route fixtures now provide explicit valid current-actor/scope SQL responses; the negative calendar fixture explicitly withholds its actor. Unit tests isolating dispatch provide legitimate scoped actor/scope boundary fixtures. The real policy and rollback regressions use the existing canonical functions and SQL-backed fixtures. The shared route harness and all company/legal/PDF workflows remain unchanged.

## Verification

The final bounded execution passes **164 tests in 12 suites**, with no failures, pending cases or TODOs, in **54.93 seconds**. It covers creator demotion, recipient sharing revocation or deactivation during computation, malformed source evidence, enlisted rollback without saved output/notification/cursor advancement, project archival, workspace movement/deactivation, and an authorized non-manager program-group counterexample with its actual computed project set. Existing dispatch, regional context, audit, canonical persistence, scope ownership, configuration and subscription lifecycle checks also pass.

Earlier phases remain separate RED records: initial ordinary-access/manual proof **14 passed / 11 failed**; initial atomic proof **3 passed / 3 failed**; expanded scope proof **3 passed / 12 failed**. The first successors retain **32 passed / 3 failed** and **113 passed / 1 failed**. Those successor failures were test setup issues: a mock omitted the typed configuration error export, an assertion counted a non-SQL audit marker as a query parameter entry, and one lineage fixture replaced its newly required current-actor response. Their lossless logs/results are retained; none is relabeled as an all-green execution.

Scoped lint passes with zero errors. Warnings remain **5 → 5**, all existing warnings in `report-os.ts`, across ten changed source/test paths. No suppression or baseline was increased. `checks.json` records exact commands, phase results, the initial RED target pins and 20 final target source/test/helper hashes. Final pins were captured after the bounded run and compared before handoff; they are not a claim about the entire transitive program. `archives.json` pins every decoded and encoded lossless artifact.

## Boundary

Current actor rows are retained through commit; project-sharing policy is re-evaluated on the supplied client. This does not establish serialization against every independent sharing writer. It does not add a report engine, jurisdiction, model approval, permission grant or commercial/agency qualification. Native hosted acceptance and final publication remain separate root-owned results.
