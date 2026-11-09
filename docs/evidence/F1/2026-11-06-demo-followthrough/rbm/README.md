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

## Receipt lifetime found in the browser

The native file-picker walk reached same-filename recovery but failed waiting
for the saved receipt. Existing `surfaces/Rbm.tsx` unmounts its child on reload
(and keys it by program/asOf); `RbmSurfacesA.tsx` holds this dialog in that child.
The dialog's `useRbmMutation(onReload)` thus erased both saved results and handled
duplicate prompts. The design above records the bounded deferred-refresh fix;
new genuine RED parent-unmount cases will qualify it before implementation.

## Final focused qualification

Initial input ownership RED: six failed, two passing controls, plus the expected
uncaught read-start exception. Exact component/test snapshots and hashes are
retained. Receipt-lifetime RED: three failed, ten passing cases, with its own
exact source snapshots. Selector calibration attempts are not RED evidence.

The final combined run passes 92 cases in seven UI suites, including 17 RBM
read/receipt cases. New-test lint has zero warnings; the component retains its
two existing warnings without any allowance change. Input selection, error,
paste, reversed completion, duplicate authorization, in-flight Escape and
parent-unmount behavior pass.

The final real Chromium check passes same-filename recovery, cleared native
file inputs, file/paste provenance and a visible saved receipt. It uses the
actual running browser UI/native successful FileReader, injects one local read
failure and intercepts both writes. It makes no database mutation or provider
call. The backend stamp is the named base; the served working-tree component
hash is recorded separately. Earlier browser calibration encountered an
asynchronously empty picker; that was not a product failure.

Board refresh is deferred until dismissal only for this existing modal. A
saved load remains eligible for refresh after later edits; duplicate refusal
alone does not refresh. Escape cannot dismiss an in-flight write. No parent
project/actor/read admission or backend parser/projection policy changed.

Source/cutoff follow-up: two genuine failures with fifteen passing controls
proved stale replacement authorization after metadata changed. Reusing the
existing clearOutcome in those two handlers fixes it while preserving bytes
and sourceRef. The final 92-case GREEN and zero-warning new test qualify this
change. The browser snapshot above precedes only these two handler edits.

The first full compiler found five unsupported exact options on Testing Library
role queries in this new test. They are corrected; the blocked push log is
retained. No gate, baseline or allowance was changed.
