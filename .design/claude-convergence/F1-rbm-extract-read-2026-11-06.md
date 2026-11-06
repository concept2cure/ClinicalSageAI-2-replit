# F1: repair the existing RBM extract read

W1 / launch D2. Only the existing RBM import dialog and its tests are in scope.
No screen, route, service, table, tool or dependency is added. The current plan
and ledger retain F1 open; current coordination has no hold on RbmIngest.tsx.
D3 project pages, the editor/drafting lane and Codespace setup remain untouched.

## What already exists

- `client/src/concept2cure/v2/surfaces/RbmIngest.tsx`: the sole RBM extract dialog,
  with FileReader, pasted CSV, cutoff/source, duplicate/reprocess and outcome UI.
  Picking a file immediately changes its name but leaves the previous CSV
  loadable until the read finishes. Older reads can overwrite a newer choice or
  pasted rows. A read error has no handler. These are source findings pending RED.
- `surfaces/rbmWrites.tsx` in the same folder: canonical admitted RBM endpoint
  mapping, envelope/refusal messages and write/reload state; it will be reused.
- `surfaces/RbmSurfacesA.tsx`: existing overview opens that dialog for its board's
  program. The repair does not change navigation or which project is admitted.
- `client/src/concept2cure/v2/__tests__/rbmSurfaceWrites.test.tsx`: existing
  request/outcome/duplicate controls; no delayed-file selection qualification.
- `surfaces/ComplianceReportsVerify.tsx` and `VaultUploadManifestControls.tsx`:
  local FileReader promises handle read errors, but do not own RBM input state.
- `surfaces/useCompanyDocumentSettings.ts`: existing latest-ticket and session
  checks prevent stale file callbacks; reuse that ownership principle in place.
- `server/routes/mdx-rbm-data.ts`: existing admitted ingestion schema/route;
  `server/services/rbm/metric-ingestion.ts`: canonical parser, content hash,
  provenance/sourceRef, duplicate refusal, projection and audit. The server cannot
  know that the browser paired an older file's bytes with a new filename.
- `shared/schema.ts`: existing RBM ingest run/profile/metric storage. No schema
  change is necessary. No second import service or read helper is proposed.

Searches: file-reader/readAsText/readFileAsText/fileToText/readTextFile, RBM
metric ingest/sourceRef/contentHash, callers, tests and current coordination;
`git log --all --diff-filter=D` on RbmIngest, rbm-ingest and FileRead names found
no deleted replacement to restore. The current canonical base is f6127e722.

## Bounded repair and acceptance

First retain genuine failing component cases. Give each pending FileReader one
current owner, invalidate/abort it on replacement, paste and unmount, clear stale
CSV before reading, and refuse submission while reading. Render read failure
through existing ErrorState and permit choosing another file or pasting rows.
Only the current read may publish bytes; its filename and submitted sourceRef
must agree. Changing content clears prior outcome/duplicate authorization.

Qualify reversed completion, paste while pending, failed/throwing reads, current
successful read and normal duplicate/reprocess controls through the existing
transport. Do not change parsing, endpoint admission or supersession rules.
Root runs required checks and publishes directly with normal hooks.

## Browser-discovered receipt lifetime

What already exists additionally: `surfaces/Rbm.tsx` withdraws its board while
reloading and keys each child by program/asOf. `RbmSurfacesA.tsx` owns the import
modal inside that child. `useRbmMutation(onReload)` in the existing dialog
therefore unmounts the modal immediately after a saved load, and even after a
handled duplicate refusal. Root's real browser reached native same-filename
recovery and then timed out waiting for its intercepted successful run receipt.
No product success is claimed from that failed browser attempt.

Before changing this behavior, retain component RED cases with a parent that
actually unmounts on reload. Keep the existing receipt/reprocess prompt mounted
until the operator dismisses it; reload the board on dismissal if a load was
saved, even when a later edit clears its displayed outcome. A duplicate refusal
alone changes nothing and must not reload. Project/session replacement still
unmounts the dialog normally; do not retain a foreign board or optimistic data.

Receipt RED is retained: 3 failed / 10 passing cases with exact source copies.
The deferred refresh also requires clearing a previous result on each valid
new attempt (so a duplicate warning is visible), retaining saved-write intent
across input edits, and blocking Escape while a write is still in flight.
These stay in the existing dialog; no parent board/read admission changes.

## Source and cutoff edits use the same outcome boundary

Final source review found that the existing Source feed/Data cutoff handlers
still retained a previous duplicate's replacement authorization or saved
receipt after metadata changed. The same clearOutcome used for content changes
must apply here too, while retaining the selected file's bytes/sourceRef and
the saved-write refresh obligation. First prove each existing control exposes
that stale duplicate action, then reuse clearOutcome in place. No admission or
server reprocessing rule changes. The first push was blocked by five invalid
Testing Library selector options in the new test, not by runtime/product errors;
correct the options and repeat normal hooks without a baseline change.
