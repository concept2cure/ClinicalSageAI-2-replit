# Fix lane L8: device screens (GA-DEMO-07, GA-DEMO-08)

Plan package F1. 2026-11-10. Map: `../README.md`, `../ledger.json`.

## What already exists

- `client/src/concept2cure/mdx/surfaces/K510Surface.tsx`: the 510(k) and eSTAR page. It is opened from the project's Submit door "Assemble the eSTAR" (`v2/projectDoors.ts`, `v2/surfaces/ProjectMdxWorkflow.tsx`). It already shows an honest banner when predicate intelligence is not configured (fixed 2026-11-09, 3630a6e13). Under that banner it printed the reduced openFDA lookup's reason as the server sent it.
- `server/services/integrations/openfda-device-client.ts`: writes that reason for its log: "openFDA <dataset> unreachable: <error>", "timed out after <n>ms", "responded <status>". Not in this lane's files, and not changed.
- `client/src/concept2cure/mdx/components/DataGate.tsx`: the one gate for every device panel. Its error branch hands the message to `v2/dataConnect.tsx` `ErrorState`, which redacts internals (`client/src/lib/queryClient.ts` `redactInternals`). That filter does not know runtime network messages ("Failed to fetch", "fetch failed").
- `server/services/capa-mdr/capaMdr.service.ts`: `getTriageQueueTx` (GET `/api/capa-mdr/triage`, and the AnA tool `triage_capa_mdr_queue`). It asked for open complaints and open CAPAs, but for MDR events in every state. `listMdrEventsTx` had no open filter.
- `client/src/concept2cure/mdx/surfaces/PostmarketSurface.tsx`: the post-market page. It carried the caveat "filed MDRs not yet excluded" (slice 0) because of that read.
- MDR states: `server/services/capa-mdr/stateMachine.ts` (open, preparing, filed, acknowledged, followup_required, closed).

## What was wrong

- GA-DEMO-07: on the seeded device story, the 510(k) page read "Reduced openFDA fallback unavailable — openFDA device/510k.json unreachable: fetch failed" (`before-line.txt`, `shots/L8-k510-1440-before.png`). A dataset path and a runtime error, in front of a buyer.
- GA-DEMO-07 (same cause, second place): a device panel whose read failed at the network showed "Failed to fetch" under "Could not load …".
- GA-DEMO-08: the post-market queue counted filed, acknowledged and closed MDRs as due, and the screen said so in a caveat.

## What changed

- K510Surface: the line now reads "The openFDA clearance lookup could not run." and then the reason in words (`fallbackReasonInWords`): could not be reached, did not answer in time, answered with an error, or could not be searched. A reason already written as a sentence for a person is kept.
- DataGate: a runtime network message is said as "The service could not be reached. Check the connection and try again." Every other message goes to ErrorState as before.
- capaMdr.service: `listMdrEventsTx` takes `openOnly`, which leaves out filed, acknowledged and closed MDRs. `followup_required` stays in, because a supplemental report is owed. The triage queue passes `openOnly` exactly as it does for complaints and CAPAs. `open_only=false` still lists every state.
- PostmarketSurface: the caveats are removed. The section line now says "Filed, acknowledged and closed MDRs are left out."
- Tests: a new `server/services/capa-mdr/__tests__/triage-queue-open-mdrs.pglite.test.ts` (real service and migration SQL on PGlite). A new `client/.../surfaces/__tests__/K510Surface.fallbackReason.test.tsx`. New cases in `components/__tests__/dataGateContract.test.tsx`. `PostmarketSurface.reportingClocks.test.tsx` was updated to the new truth.

## Proof

- Red first. Each log has the failure, and each failure has the right cause:
  - `red-server.txt`: filed, acknowledged and closed MDRs were returned.
  - `red-k510.txt`: the rendered page contained "fetch failed".
  - `red-datagate.txt`: 5 network messages were shown raw.
  - `red-postmarket.txt`: the caveat was still on screen.
- Green: `green-server.txt` 2/2, `green-k510.txt` 8/8 (10/10 after the repair below), `green-datagate.txt` 22/22, `green-postmarket.txt` 6/6.
- Mutations: `mutations.txt`, 6 of 6 caught, each file restored with its sha256 checked. Re-run on 2026-11-12 with the repair's test: 7 of 7 caught (`mutations-rerun.txt`, `mutation-v12.txt`).
- Importers: `importers-rerun.txt` (2026-11-12, the tree as it is now). Every test file that names a changed module, found with git grep over client, server and tests (36 files, a wider net than the verifier's 28): 36/36 files, 368/368 tests pass. The projectCreationDoors failure the verifier saw at 47a306700 does not reproduce now. The first run (`importers.txt`, 25 files, 215 tests) is kept as it was.
- Typecheck: `typecheck.txt` (the 8 changed files) and `typecheck-rerun.txt` (2026-11-12): the lane's client files with every client and tests importer (43 files), and the service with its test, show no error in any of them. Every line printed is in another file's ambient declarations. The server importers (the capa-mdr route, its tests, AnaToolExecutor) could not be typechecked: tsc was killed for memory three times. The only signature change there is an added optional field, `openOnly?: boolean`.
- Gates on the tree as it is now: `node scripts/ci/check-pushed-lint-warnings.mjs --base HEAD` names none of this lane's files (it fails on other lanes' files); `npm run ci:undefined-css-classes` passes; no lane file is over 100,000 bytes (largest 49,959).
- Running app (client served live), as ana, on "[Demo · MDX] NeuroPanel-Dx 510(k)":
  - Project, Submit, "Assemble the eSTAR" (`shots/L8-door-1440.png`, `shots/L8-door-390.png`) opens the 510(k) page.
  - At 1440 and 390 it reads "The openFDA clearance lookup could not run. The FDA's public clearance database could not be reached from this server. Try again later." (`shots/L8-door-opened-1440.png`, `shots/L8-door-opened-390.png`, `shots/L8-k510-1440.png`, `shots/L8-k510-390.png`).
  - No alert, no "fetch failed", no horizontal overflow (`walk-k510-door.txt`).
- Post-market at 1440 and 390: no caveat, and the section line says filed MDRs are left out (`shots/L8-postmarket-*.png`, `walk-postmarket.txt`).
- The server change is NOT live on the rehearsal app, which was not restarted. It is proven by PGlite only. The rehearsal organisation has no MDR events (triage read with open_only=false: 4 CAPAs, 0 MDRs), so until the restart no filed MDR can be miscounted there.
- To re-walk after the restart, as ana:
  1. Open the device project's post-market page and create a "Lane L8" MDR.
  2. File it and confirm it leaves the queue and the "MDRs due" figure.
  3. Check that "open_only=false" still lists it.

## Repair after the verifier (2026-11-12)

- V-L8-1 (fixed): no test reached the machine-text catch-all in `fallbackReasonInWords`. Red: mutation V12 (the catch-all narrowed to "openFDA unavailable") survived, 8/8 green (`mutation-v12.txt`, first line). Two cases added to `K510Surface.fallbackReason.test.tsx`: "openFDA device/510k.json returned an unexpected body" and "device/510k.json parse error", each must read "could not be searched". V12 is now caught, 2 failed of 10 (`mutation-v12.txt`, second line); the file was restored and its sha256 checked.
- V-L8-2 (no code change, by design): until the server restarts, the live post-market page says filed MDRs are left out while the running server still returns them. Today the rehearsal organisation has 0 MDR events, so nothing on screen is false. The client and server parts must be committed together, and the app restarted before any MDR is filed in the demo (rewalk steps 3 to 5).
- V-L8-3 (fixed): the importer line now reports the wider 36-file set, re-run on the current tree (above).
- P-122: this lane removes nothing a screen showed. The 510(k) reason is still shown, in words. The post-market caveat is replaced by a true line, made true by the server change.

## Not fixed here

- Ledger title, "a wrong predicate not re-checked": the seeded predicate of record is K223456 "SepsiScreen Panel (demo predicate)" on a CNS-infection panel. That is seed data (`scripts/demo/launch-demo/packs/*`), and nothing in this lane's files re-checks a claimed predicate. It belongs to the demo-seed lane and to the 510(k) device-profile route (`server/routes/510k-device-routes.ts`). Neither is in this lane.
- Ledger title, "empty eSTAR sections": 38 sections, 18 blockers, all empty. This is the honest state of the seeded submission ("eSTAR not ready"), not an error. To fill sections, the seed pack has to author them (demo-seed lane).
- The server's reason string (`openfda-device-client.ts`) is still machine text in the log and the API. That is right for the log. The screen now translates it.
- Seen on the walk, not this lane's: on the project page, GET `/api/c2c/projects/:id/source-changes` answers 409 ("The Quality record changed…"). At 390, the 510(k) header actions wrap and the stage strip is clipped inside its card. Both belong to the owners of those files.

## Questions for the founder

- None.
