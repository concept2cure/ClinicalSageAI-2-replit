# Quality closure and CMC batch release handoffs

Package: F1. Existing launch work: governed Quality records and CMC / Module 3 (D2/D4).
Inspected base: `f9631c065af8760d8b879232385fb94663d19a24`, branch `concept2cure-v2`.

## What already exists

| Existing path | Present behavior | Repair boundary |
| --- | --- | --- |
| `server/services/capa-mdr/capaMdr.service.ts`, `governed-context.ts`, `stateMachine.ts` | Current actor and project admission, programme and record locks, allowed transitions, one transaction for state, vigilance and chained audit. CAPA actions have terminal done/cancelled states. | The service does not enforce the existing action-completion or effectiveness prerequisites. The native transaction and permission machinery remains in use. |
| `shared/constants/capa-lifecycle.ts`, `shared/schema/capa-mdr.ts` | The lifecycle declares all actions done before implementation. The stored effectiveness shape includes outcome and narrative. CAPA codes are unique within a programme. | No lifecycle expansion or schema change. |
| `client/src/concept2cure/quality/qmsCapaRegister.tsx`, `CapaActions.tsx`, `qmsRecordData.ts` | The existing UI requires a closure effectiveness narrative and sends its stated outcome; action completion requires evidence. It hides Add action on a closed CAPA. | These requirements must also hold at the canonical service. Client files are held by the Quality lane and remain unchanged. |
| `server/services/qms/changeControl.service.ts`, `server/routes/mdx-qms.ts` | Existing change lifecycle, native typed relationships, optional programme, and independent signed approval. Ordinary closure accepts an omitted effectiveness review; links marked requires do not establish completion. | Repair closure and reference resolution in the existing service, keeping the signed approval route authoritative. Only declared required relationships may block closure. |
| `server/services/qms/change-approval-signature.ts`, `server/services/qms/deviations.ts`, `shared/constants/deviation-lifecycle.ts` | Approval and deviation closure have their own signing and independence controls. Deviation closed/cancelled states are terminal. | A required investigation needs its signed closed state: cancellation does not prove that required work was completed. Do not create a second approval or deviation lifecycle. |
| `server/services/qms/in-force-release.ts`, `current-release-approval.ts`, `db/migrations/20260724_qms_change_control_store.sql`, `client/src/concept2cure/quality/ChangeLinkForm.tsx` | Controlled documents have canonical signed-version, effective-date and exact approval readers. Change links carry a business reference and optional integer document ID, but no required version, signature or digest, and no typed-reference parser hands them to those readers. | An arbitrary released predecessor or a live effective status cannot establish that a particular change's required revision was accepted. The repair refuses an unverifiable required document/SOP link. |
| `server/services/cmc/batch-release-evidence.ts`, `server/api/cmc/batchRecordRoutes.ts` | Recorded QC results support the disposition; full release needs reviewed passing results and no embedded open deviation. Reauthentication precedes a locked signing transaction with ledger and electronic signature. | The final recheck omits deviations and the QC fingerprint omits the result/specification content. A project-less batch currently reads same-number QC from every project. |
| `server/services/part11/signing-authority-gate.ts`, `resolve-signer-role.ts` | The canonical authority gate already accepts a transaction executor, checks current active user/organization and holds membership rows for the transaction. | The batch release route called it only before reauthentication; reuse the existing transactional form after the wait. |
| `shared/schema.ts` (`qcTesting`), `db/migrations/20260907_qc_testing_batch_attribution.sql` | QC has organization, nullable programme (`project_id`) and batch number; no CMC batch-record foreign key. | Match nullable programme exactly. A missing programme is not permission to read every programme. |
| `shared/schema/qc-schemas.ts`, `migrations/20261029g_qc_deviations.sql` | Native GMP deviations have an optional integer `batch_id` and free-text batch number. The existing active Quality writer does not populate a CMC batch key; no foreign key names the target of `batch_id`. | No authoritative native QMS-to-CMC batch bridge can be inferred from this field or a matching label. Do not merge native deviations into a CMC batch by batch number alone. |
| `server/services/qms/__tests__/changeControl.pglite.integration.test.ts`, `server/api/cmc/__tests__/cmc-sign-signature-row.test.ts`, `tests/db/capa-governed-transactions.dbtest.ts` | Existing SQL lifecycle, signing ceremony, and native CAPA atomicity/authority qualification homes. | Extend these homes and add narrow component regressions in the existing service test folders. No previous checkout's pass counts are reused. |

Discovery used `rg` across services, routes, API handlers, schema, migrations, AnA callers and Quality surfaces. The bounded deleted-history search was `git log --all --since=2026-08-01 --diff-filter=D --format='%h %ad %s' --date=short --name-only -- server/services/capa-mdr server/services/qms/changeControl.service.ts server/services/cmc/batch-release-evidence.ts server/api/cmc/batchRecordRoutes.ts server/routes/capa-mdr.ts shared/schema/capa-mdr.ts db/migrations/20260724_qms_change_control_store.sql db/migrations/20260907_qc_testing_batch_attribution.sql tests/db/capa-governed-transactions.dbtest.ts`; it returned no deletions in that date/path boundary. This is not a claim about all older history.

## Decisions and limits

- Finish existing native prerequisites in their service; no route, service, table, surface, model, engine or integration is added.
- Preserve the CAPA actor/program admission and atomic audit, independent Quality approval, and CMC reauthentication, disposition meaning and transactional signature.
- Required links are distinct from descriptive references, impacts, triggers and addresses. An unrelated open Quality record does not block closure or release.
- A programme-bound CAPA reference resolves within that programme. An organization-level reference must resolve uniquely; a program-local display code cannot be treated as an organization-wide identifier.
- The CMC composer remains limited to its existing drug / small-molecule / US IND composition scope.

## Repairs completed in existing paths

### CAPA and actions

The canonical service now requires every action to be done before implementation, entry to effectiveness checking or an effective close, including legacy records already at the latter states. Both closure outcomes require a nonblank effectiveness narrative and the corresponding outcome. The service records the verified caller and time in that result and its audit payload. An unsuccessful outcome remains explicitly unsuccessful and retains the existing reopen transition.

Action completion requires recorded completion evidence in the existing reference shape. Closed CAPAs refuse new actions and action-state changes. These refusals use the existing transition error/HTTP 422 path, so the existing governed transaction rolls back before state, timeline or audit writes. The action reference's existence/content is not independently verified by this guard; a named reference is not a claim of source authentication.

### Quality change closure

Closure requires a verifier and effectiveness review. In the write statement, the verifier must still hold a current permitted editor role and active user/organization status. The role set comes from the existing `GOVERNED_WRITE_ROLES` policy. A full-precision database timestamp and current state compare-and-set refuse a stale transition.

Only active links marked `requires` are closure prerequisites. A required CAPA must resolve uniquely in the change's programme (or uniquely within the organization for an unassigned change) and be `closed_effective`; `closed_not_effective` does not satisfy it. A required deviation must be `closed`, and its numeric ID, when supplied, must agree with the reference. The write rechecks the exact resolved native targets with shared row locks and the unchanged required-link set. Descriptive references, triggers, impacts and addresses are not blockers.

Link insertion/removal atomically updates the parent revision and refuses terminal parents. A link writer waiting behind closure cannot append work after that close; a closure waiting behind a changed link must re-read. Ordinary content updates also refuse terminal changes. Independent electronic approval is unchanged. QMS route audit remains its existing post-write receipt mechanism; this repair does not claim to convert QMS closure and that audit into one transaction.

### CMC batch disposition

QC selection now matches organization, batch number and nullable programme exactly. An unassigned batch reads unassigned QC, not every project with the same number. The transient fingerprint includes the actual result, specifications, sample/method attribution, analyst, reviewer, dates, certificate and database revision, instead of only pass/review flags.

After reauthentication, the route reserves the batch, rechecks signing authority through the existing transaction-aware gate, reads the selected QC rows with shared locks and re-evaluates the requested disposition against the current embedded deviations. Newly opened deviations block full release. The existing conditional and rejected dispositions and their signature meanings remain intact. No rejected check reaches the release update, governed action or signature write.

## Unresolved identity and acceptance contracts

1. **Native QMS deviation to CMC batch:** `qc_deviations.batch_id` has no authoritative target FK and no active writer setting a CMC batch identity. The native deviation register is not silently merged with embedded batch deviations by a matching label. A declared batch-reference contract and its writers are still needed.
2. **QC to native batch identity:** QC still has the existing organization/programme/batch-number attribution, not a batch-record FK. Exact nullable-project matching fixes the cross-project wildcard. It does not establish unique attribution when multiple native batch records share that label within the same programme. Selected-row locks prevent edits of the read QC rows during signing; they do not prevent a new matching QC row being inserted by another writer.
3. **Required document/SOP/validation acceptance:** existing links do not identify the exact required document version or accepted result. These declared required links now refuse closure explicitly. No note, effective status, unrelated released predecessor or typed reference is converted into completion. A supported acceptance identity is needed to finish this connection. The same limitation applies to required supplier/risk/other links without a completion contract.
4. **Durable CAPA link identity:** program-local display-code resolution is now unambiguous at admission and closure, but the integer `linked_id` cannot hold a CAPA UUID. No lossy conversion or new field was added. Native target IDs are rechecked during closure; this does not create an immutable versioned dependency receipt.
5. **Claim boundaries:** cancelled CAPA actions do not satisfy the existing all-actions-done implementation requirement. No waiver policy was invented. CMC retains its existing governed-action signature binding; the tests do not claim a new whole-batch content seal, a complete filing qualification or deployed production acceptance.

## Qualification

All commands use the installed Node 22 runtime and the repository's existing test configurations. Root owns full compiler/build, mandatory gates and publication.

| Evidence | Result | What it establishes |
| --- | --- | --- |
| `red.log` | 38 failed / 59 passed before the initial repair | Reproduced missing CAPA prerequisites, optional change closure, unresolved required work, stale closure and CMC release holes. |
| `signing-authority-red.log` | 1 failed / 46 skipped | A role changed during reauthentication still released a batch (200 instead of 403). |
| `closure-admission-red.log` | 4 failed / 26 skipped | Closure accepted a verifier with lost role, membership, account or organization admission. |
| `targeted-final.log` | **146 passed across 7 files** | Actual PGlite SQL for closure, scopes and controlled interleavings; actual route handlers with signing boundaries isolated; preserved tenant, existing authority, audit rollback and uncertain-commit controls. |
| `native-capa-combined.log` | **Native CAPA 13/13 passed** | Freshly provisioned PostgreSQL 17.7, actual authenticated HTTP writes, non-bypass runtime RLS, atomic state/timeline/chained audit, current permissions and lock controls. The combined log also contains a separate source-lineage fixture setup failure (5 skipped); it is not a green combined-suite claim. |
| `compatibility.log`, `ana-baseline-control.log` | AnA change-tool harness **17 failed / 1 passed** in both current and baseline-dependency control | The harness returns `SKILL_POLICY_UNAVAILABLE` before its handlers, including untouched create/revise cases. The control uses the exact base revision of `changeControl.service.ts` via a temporary Vite load hook; no production policy/executor is weakened. The two initial CMC compatibility failures were missing columns in its reduced test DDL and are corrected/green in `targeted-final.log`. |
| `native-qms-combined.log`, `tests/db/qms-project-records.dbtest.ts` | **Native QMS 7/7 passed** | Four existing project-read cases plus three added two-connection cases observe PostgreSQL's actual lock wait graph: content/link change wins over waiting close, and close wins over queued link. They start from a synthetic verification state and do not claim a full approval lifecycle. The combined log contains 17 passing cases across 3 files; only these 7 are this lane's QMS cases. |

Focused green command:

```sh
node_modules/.bin/vitest run --config vitest.config.ts \
  server/services/capa-mdr/__tests__/capa-closure.pglite.test.ts \
  server/services/qms/__tests__/changeControl.pglite.integration.test.ts \
  server/services/cmc/__tests__/batch-release-evidence.test.ts \
  server/api/cmc/__tests__/cmc-sign-signature-row.test.ts \
  server/routes/__tests__/qms-changes.test.ts \
  server/services/capa-mdr/__tests__/governed-context.test.ts \
  tests/schema-contract/cmc-batch-record-tenant-scope.contract.test.ts
```

Root-coordinated native files: `tests/db/capa-governed-transactions.dbtest.ts` and `tests/db/qms-project-records.dbtest.ts`, through `vitest.db.config.ts` with the provisioned native fixture. No browser, production deployment, external filing or scientific/regulatory qualification is claimed by this lane.

### Final SQL and lint follow-up

The repository pre-push scan found one new CMC SQL interpolation and a legitimate QMS count reduction. CMC now selects between two complete fixed SQL statements, both with bound organization, batch number and nullable programme values. The final signing branch retains `FOR SHARE` on the same selected QC rows and the full evidence projection. The ordinary preflight read remains unlocked. No query-spy adjustment was needed.

At the inspected base, the QMS transition UPDATE directly interpolated the SET list and two generated identity placeholder positions. The repaired statement interpolates the SET list and its composed guarded WHERE list: three counted expressions became two, so the file count fell from 9 to 8. Restoring an unnecessary expression would have served only the counter. Root tightened that one baseline entry to 8; this lane made no baseline or gate change. A focused application of the scanner's unchanged counting formula after the refactor reported CMC 0 / baseline 0 and QMS 8 / baseline 8; this is not a substitute for root's full scan.

CAPA effectiveness/result validation, action-evidence validation and date normalization are now named helpers. QMS transition prerequisite preparation is a separate helper in the same existing service. These extractions preserve validation order, bound identities, actor/state/content/link rechecks, locks and audit behavior. Long test groups were divided by behavior; assertions and native concurrency bodies were retained.

| Follow-up evidence | Measured result |
| --- | --- |
| `targeted-lint-final.log` | No new warnings in the eight checked files. The only two warnings are the existing CAPA service file-length warning and existing `getTriageQueueTx` complexity warning. No disables or ceilings were changed. |
| `targeted-refactor-fixture.log` | 158 passed / 1 failed across 8 files. Seven files passed all 152 cases, including all 10 CSR import/collaboration cases. The sole failure was a new CMC assertion assuming UTC midnight for a timestamp-without-time-zone fixture; the configured local timezone decoded that fixture as 07:00Z. |
| `targeted-cmc-static-sql-final.log` | **7/7 passed** after correcting that fixture expectation to its explicit local midnight. No production behavior changed after the preceding run. Both ordinary and locked reads retain exact programme scope and the same full evidence/fingerprint. |

Thus the current focused set is **152/152 in seven files plus 7/7 CMC cases**, qualified across those two runs. The earlier failed fixture assertion is retained transparently. The eight-file run used the focused command above with `--maxWorkers=1` and `server/routes/__tests__/authoringCsrImportIntoDocument.pglite.integration.test.ts` added. The final rerun was:

```sh
node_modules/.bin/vitest run --config vitest.config.ts --maxWorkers=1 \
  server/services/cmc/__tests__/batch-release-evidence.test.ts
```

Focused lint command:

```sh
node_modules/.bin/eslint \
  server/services/capa-mdr/capaMdr.service.ts \
  server/services/qms/changeControl.service.ts \
  server/services/cmc/batch-release-evidence.ts \
  server/services/cmc/__tests__/batch-release-evidence.test.ts \
  server/api/cmc/__tests__/cmc-sign-signature-row.test.ts \
  server/services/qms/__tests__/changeControl.pglite.integration.test.ts \
  tests/db/capa-governed-transactions.dbtest.ts \
  server/routes/__tests__/authoringCsrImportIntoDocument.pglite.integration.test.ts
```

The service and native test files were frozen and returned to root for fresh native CAPA/QMS reruns and the full mandatory gates. The native outcomes recorded earlier in this note precede this final helper/test-group refactor; no new native run is claimed here.
