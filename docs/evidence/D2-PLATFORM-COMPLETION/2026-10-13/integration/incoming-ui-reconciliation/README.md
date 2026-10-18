# W1 / D2: reconcile canonical authoring UI and saved workflow intake

The local workflow implementation was checkpointed at `0e4ccf46f` before
merging the concurrent `cfb8f99de` branch head. Three UI files required manual
reconciliation: DocumentWorkbench, SourceImportDialog and ImportSourceNotice.
RichSectionEditor and DocumentAuthoring merged automatically and were reviewed
for retained runtime behavior. This work resolves contents only; root owns
staging, final whole-tree checks and merge publication.

The merged UI preserves the incoming canonical ConversationThread and its
DocumentCanvas, saved document/section identity, confirmed PATCH timestamp,
composer prefill and explicit submission. It removes the former second editor
conversation pane as the incoming changes intend. The same leave decision now
handles conversation, project, document and exact-section destinations.
Pending-target identity and navigation generations prevent an older save or
asynchronous section lookup from erasing a newer decision. A held project switch
cannot write a conversation prefill using the prior project's buffer.

An explicit unbound working copy shows its actual saved sections and supplies
no implied dossier, submission type or regulator binding in authoring context.
The project remains the actual saved record's scope. Workflow source identity,
fingerprints, original authorship, model evidence and gaps remain disclosed.
Reviewer adoption and the document-revision consent guard are preserved.

The existing import dialog combines incoming source availability explanations,
governed reason constants, required field descriptions, receipt styling and
source-panel helpers with workflow preview, expected fingerprint, explicit
association reason, exact returned document/section navigation and stale-scope
guards. Both reasons use the same bounds; no alternate import door or store is
introduced. The styled source notice supports binary and workflow receipts.

The automatic editor merge retains the incoming accessible ribbon labels and
all verified local fixes: stored-parse and trailing-node hydration baselines,
real unsaved buffer protection, inert HTML serialization, current-viewer figure
authorization, owned object URLs and authenticated node-view teardown fallback.
The authoring surface still keeps the active buffer until the existing project
leave decision succeeds and discards stale scoped list replies.

Verification groups overlap and must not be added:

- Incoming saved conversation and source tests: 60 tests in 10 files pass.
- Workflow, deep links, project races, signing UI, hydration and figure tests:
  102 tests in 11 files pass.
- Combined reconciliation contracts, including no implied IND binding and an
  old conversation save versus a newer project choice: 20 tests in 2 files pass.
- Converted AnA flows, canvas/refusals, sources, accessibility, remedies,
  honest reads, editor save integrity, account cache and plain text: 138 tests
  in 13 files pass.

Scoped lint reports zero errors and 17 existing Workbench/section-editor
warnings. The reconciled import dialog, source notice and combined tests have
no warnings. No warning baseline was increased. Conflict markers are removed
and the source diff check is clean. Final browser evidence must be produced
against the merged UI, whose canonical conversation replaces the old editor
pane; earlier pre-merge screenshots are not its release evidence.
