# CMC remedies F04, F10, F21 — verification

The implemented contract is [cmc-contract.md](cmc-contract.md). No dependency, migration, commit, push or deployment was added.

## Behavior delivered

* The server's launch-scope decision is available through the existing navigation provider. Production/unknown scope offers change recording and explicitly refuses postapproval variation assessment. An explicitly deferred deployment runs the existing canonical classifier with dosage form, change category and the required scale/site/process factors. The browser risk-to-filing map and six-market guessed matrix were removed. The newly claimed narrow API prefix is not a scope expansion: the actual route returns `409 CMC_VARIATIONS_OUT_OF_SCOPE` while launch enforcement is on.
* Every successful CMC register save consumes its link receipt separately from the saved row. A persistent CMC panel derives missing/outdated/unfiled status from saved register records and canonical source hashes. Its retry accepts only identity, loads the tenant's program-filed row, holds it while projecting through the same writer, attributes source provenance to the authenticated actor and changes no register/signature fields. A failed retry stays pending. Automatic queue delivery is not claimed.
* CMC dossier/doc controls now open the existing Module 3 build in the current program. They no longer send the user into the off-catalog dossier surface. Draft assessments still use the existing governed Authoring handoff.

## Negative verification

Each temporary mutation was restored immediately after the test; no mutation remains in source.

| Recreated defect | Check that failed |
| --- | --- |
| Disable the server's launch refusal | `register-link-recovery.routes.test.ts`: expected 409, received 200 |
| Ignore the successful save's failed-link receipt | `cmcAuditRemediation.test.tsx`: the server warning was absent while the saved method row remained present |
| Restore literal dossier navigation | `cmcAuditRemediation.test.tsx`: the reachable Compile Module 3 control did not appear |

## Positive verification

Seven focused suites, 102 tests passed: `cmcAuditRemediation`, `cmcCorrCrossLinks`, `cmcSuiteWrites`, `register-link-recovery`, `register-link-recovery.routes`, `cmc-write-role-gate`, and `module3Linkage.routes`. They cover canonical deferred dispatch, launch/unknown refusal, durable pending reads, failed/successful retry, stored-row/actor forwarding, foreign/unfiled and SQL-identifier refusal, source-payload refusal, viewer write denial, preserved saved rows and accessible build navigation.

Targeted lint: zero errors across the nine touched CMC/navigation files. The four new/recovery implementation files have zero warnings; existing warnings remain in legacy CMC files. The global API walker additionally detected the independently owned notification-subscriptions prefix while that workstream was in progress; the CMC calls themselves were attributed after the registry update.

Runtime: Node 22.23.3, Vitest 4.1.7. These are source/component/route tests with controlled stores, not live production/database/browser evidence. Actual production behavior and existing deployed schema are not claimed as verified.

### Canonical portfolio follow-up

The CMC board convergence now returns `submissions: null` when the submission portfolio is unavailable. The UI accepts the nullable contract and renders `— submissions`, never `0 submissions` or an empty-register claim. A dedicated null-without-meta-flag regression passed in the final D02/D03 scoped run (14 suites / 228 tests); the board SQL lane is owned by submission_quality.
