# Trunk red sweep 2 (2026-10-29)

Six items found red on trunk today. Each was recorded red at head, traced to the commit that
made it red, and either fixed at the cause or reported with the reason. Head for items 1-5 was
`bbe7971e`; item 6 was added later and recorded at `ceea6843`. The clone is shallow: history
stops at `892739bb` (2026-10-22), so a cause older than that is named from the code and the
commit messages that still exist.

No product code changed. Items 1, 2, 3 and 6 were stale tests: a product commit tightened a
contract and updated some tests but missed these. There was no product fix, so there is no
mutation run. Each test is red on its case at head and green after the fixture or expectation
change. Items 4 and 5 are not fixed. The reasons are below.

## What already exists

- `client/src/concept2cure/v2/reportingPersona.ts`: the persona read. Since `182c4b0e` it sends
  `capturedActorHeaders(...)` as the fourth `apiRequest` argument.
- `client/src/utils/authToken.ts:156` `capturedActorHeaders`: parses the token's claims and refuses
  when they do not match the actor. A token with no claims is refused.
- `client/src/concept2cure/v2/surfaces/VaultLibraryResults.tsx:244` `isVaultSearchShape`: since
  `8c87144f` every search hit must carry a boolean `current`. The server always sends it
  (`server/routes/c2c/project-vault.ts`, `/:id/search`, `current: r.current`).
- `client/src/concept2cure/mdx/hooks/useDossier.ts` `pickDossierDocument`: since `62a8d5e7` it takes
  only an exact pathway document of the open project (`k510` for 510(k)). `c2c_documents.doc_type`
  admits `'k510'` and not `'510k'` (`migrations/20260528_phase9_document_schema.sql:108`).
  `useDossier.scope.test.ts` pins the exact match.
- `client/src/concept2cure/v2/editor/useSourceAssemblyTarget.ts`: since `4d8cf50d` a working document
  must carry `readScope: 'document' | 'sections'`. The server always sends it
  (`server/services/authoring/authoring-document-read.ts:111-113`).
- `server/services/entitlements/launch-scope-api.ts` and `shared/constants/ui-surface-registry*.ts`:
  the launch-scope verdict and the claims it reads. `scripts/ci/check-launch-scope-api.ts --list`
  lists every API path a launch or shell screen names.
- `client/src/concept2cure/hooks/useRejectWorkflow.ts` and
  `client/src/concept2cure/services/workflowDecisionService.ts` (`62a8d5e7`), with their tests, and the
  route `POST /api/approval-workflows/:id/reject` (`server/routes/approval-workflow.ts:109`).

## Results

| item | cause commit | stale test or product | fix | result |
|---|---|---|---|---|
| 1 insightsLabelCurrencyMatrix:41, insightsLifecycleCalendar:49 | 182c4b0e (2026-10-26) | stale test | the fixture token now carries `userId`/`organizationId` claims; the expectation is the 4-argument form from reportCatalogPersona.test.tsx, with the headers | red 1/1 and 1/1, then green 1/1 and 1/1 |
| 2 projectDocumentDisposition:100 | 8c87144f (2026-10-23) | stale test | the search hit fixture carries `current: true`, as the server sends and as 8c87144f did for vaultSearchSelection.test.tsx | red 1 of 6, then green 6/6 |
| 3 mdx-surfaces-interactive-smoke, Files tab | 62a8d5e7 (2026-10-23) | stale test | the documents fixture uses `doc_type: 'k510'`, the stored vocabulary | red 1 of 5, then green 5/5 |
| 4 launch-scope-api-gate, 5 cases | 62a8d5e7 (2026-10-23) | both: some expectations stale, some product | not fixed; see below | red 5 of 43, unchanged |
| 5 ci:check-client-reachability | 62a8d5e7 (2026-10-23) | neither: a real unreachable capability | not fixed and not deleted; see below | red, 2 files, unchanged |
| 6 projectFilesAssemblyFlow:106 | 4d8cf50d (2026-10-26) | stale test | the working-document list fixture carries `readScope: 'document'`, as 4d8cf50d did for four sibling tests | red 7 of 9, then green 9/9 |

### Item 1

The persona GET was never sent. `capturedActorHeaders` threw on the fixture token
`'signed-in-matrix-fixture'`, which has no claims, so the query failed before `apiRequest`. These two
tests use the real `authService` and the real `capturedActorHeaders`. That has been so since
`4f3ebaf7`; reportCatalogPersona.test.tsx mocks them instead. So the fix needs two parts: the
4-argument expectation, and a token that carries the actor's claims
(`fixture.<base64 claims>.synthetic`, the pattern `4d8cf50d` adopted in sourceDocumentStartChannel.test.tsx). The real header check
still runs.

### Item 2

`isVaultSearchShape` rejects a hit without a boolean `current`. The read then counts as failed, so
Vault shows search unavailable and no selection. `8c87144f` added the rule and updated
vaultSearchSelection.test.tsx. This fixture predates that change and was not updated.

### Item 3

The Files tab showed "No dossier sections yet". `62a8d5e7` replaced a substring match on `'510'`
with an exact match on `'k510'`. The fixture's `'510k'` is a value the table's CHECK refuses, so no
document was chosen. Red before today, as reported.

### Item 6

The chooser showed only its placeholder. `workingDocument()` refuses a row without `readScope`, so
the list read failed with READ_FAILED. `4d8cf50d` made the field required and added it to
four sibling tests: projectFilesSourceAssembly, sourceAssemblyEntry, sourceDocumentStartFlow and
sourceFirstAssemblyFlow. It missed this file.

## Not fixed

### Item 4: launch-scope-api-gate.test.ts, 5 cases (blocked on a scope decision)

`62a8d5e7` added 25 device surfaces to the Projects launch app (`shared/constants/launch-scope.ts`).
Eleven of them claim all of `/api/mdx`, `device-510k` claims all of `/api/programs`, and
`device-validation`/`device-submission` claim all of `/api/submission-ops`. Those surfaces are now
launch surfaces, so everything under those prefixes is served at launch. The five cases split in
two (`item4-launch-screen-calls.txt`):

- **The expectation is stale.** A screen the founder admitted calls these paths: `/api/mdx/risk-items`
  (risk), `/api/mdx/clinical-studies` (device-clinical-studies), `/api/mdx/vault` and `/vault/:p/versions`
  (device-vault), `/api/mdx/labeling/:id` (labeling, so `/labeling/documents` hits `GET /labeling/:id`),
  and `/api/510k/estar/official` and `/build` (device-510k, pma and diagnostics, from 8c87144f).
  Refusing them would refuse admitted screens.
- **The product is wrong, by the existing rule** (launch-scope-api.ts header; 0682d505: "the launch
  serves what launch screens and apps use, not every route under a broad claim"). No launch screen
  calls these, and they are served only through the broad claims: the package transmit
  (`/api/mdx/gateways`, `/gateways/fda/esg/transmit`, `/gateways/transmit-independence`), which
  F12/LX-13 refused on 2026-10-17, and `/api/programs/:id/predicate-intel`, `/se-matrix` and `/rtm`.

Proposed fix, not applied:

1. Narrow `'/api/mdx'` on the eleven admitted surfaces to the families their screens call:
   - device-analytics: analytics
   - device-diagnostics: audit, cdx, clia, ivdr
   - device-510k, device-pma, device-cer: audit
   - device-workstream: client-review
   - device-clinical-studies: clinical-studies, effective-context, rbm-attention, rbm-summary, study-archetypes
   - device-engineering: engineering
   - labeling: labeling
   - device-postmarket: postmarket
   - risk: risk-items
   - device-software: software, software-summary
   - device-udi: udi
   - device-vault: vault

   The hidden `labeling-pi` keeps `'/api/mdx'`, so the rest stays attributed and out of scope.
   `ci:launch-scope-api` would then catch any launch call that was missed.
2. Add `'/api/programs'` to `LAUNCH_EXCLUDED_API` as HIDDEN APP.
3. Move the stale paths in the test from "refused" to "served", citing 62a8d5e7, and keep an
   upper-case refused device-kit example in the letter-case case.

Why it is not applied:

- The founder saw these five failures on 2026-10-26 and left them as "MDX policy/expectation
  mismatches ... No MDX admission or expectation was changed to hide them"
  (`docs/evidence/D2-CLIENT-JOURNEY/2026-10-26/slice-A2/A2.7/README.md`, "Known baseline").
- The fix changes what production serves to device customers.

The same cause makes `server/services/entitlements/__tests__/launch-reproof-narrowing.test.ts` red,
24 of 203: `/api/mdx/vault` and eleven `/api/submission-ops/*` paths, each in two cases
(`item4-reproof-narrowing-red.txt`). Also seen and not judged: `device-workstream` and
`device-diagnostics` claim `/api/manufacturing`, `/api/ivdr` and `/api/cer`, and the list shows no
launch screen calling `/api/manufacturing`.

### Item 5: ci:check-client-reachability (a real unreachable capability; not deleted)

The gate reads these files correctly. Nothing in `client/src` imports `useRejectWorkflow.ts` or
`workflowDecisionService.ts` except their own tests. The hook also had no caller before `62a8d5e7`:
at `0b3aaa10` it was an export of the reachable `useProgramTabs.ts` that nothing called. `62a8d5e7`
moved it into its own file ("isolated from program-tab read imports"), and that is when the tracer
started to see it. The reason for the move is visible in the registry:
`/api/approval-workflows/:id/reject` is claimed only by the hidden `orchestration` surface, so a launch
screen that named it would fail `ci:launch-scope-api`. Its last caller was the Communication Center
Approvals screen (`communication/surfaces/Approvals.tsx`, deleted in `2895218b8`, before the shallow
history; see `docs/design/FULL_FEATURE_INVENTORY_FOR_DESIGN.md:1921`).

This is a capability the founder kept, with tests, and nothing wires it. Wiring it is a product
decision with three parts:

- a reject control on a launch screen (the Approvals pane in PathwayPanes is read-only);
- the Part 11 reason-for-change ceremony;
- launch-scope admission of the reject route.

Separately, the route passes no organization to `approvalOrchestrator.processApproval` (not
verified further). Deleting the files would also be wrong: the working agreement names no
replacement that delivers the same outcome. Adding them to the baseline would loosen the gate.

## Checks

- Each edited test file was run alone under `timeout 240`, green on the working tree after HEAD moved
  to `ceea6843`.
- Plain `npx eslint <file>`: 0 problems on each edited file, before and after.
- A scoped `tsc -p` over the five edited test files reports no errors in them. Its 42 errors are in
  untouched server files and come from the scoped include (for example TS7016 for jsonwebtoken).
