# Existing editor runtime reconciliation, 21 October 2026

W1 / D2 integration of local `70a3db998` with concurrent canonical `30afd3bd1`.
The two parents and the merge retain all prior evidence. This packet records the
client conflict resolution; merged runtime tests and publication are root-owned.

## What already exists

- `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx` is the one editor used
  by Authoring and the conversation canvas. It already provides the unsaved-work
  decision, source assembly/history, review, creation recovery and governed acts.
- `editor/DocumentCanvas.tsx` hosts that editor, while canonical
  `editor/documentRecordRead.ts` provides normal and verified recovery reads.
  The local `editor/authoringCurrentRead.ts` added account/session revision,
  project-scoped GET paths and partial/refused-read handling. Their overlapping
  canvas transport is converged onto `documentRecordRead.ts`; there is one read
  implementation. The small ownership/projection helpers remain shared.
- `editor/FileToVaultDialog.tsx` already owns exact filing receipts, scoped
  account/project requests and uncertain-outcome reconciliation. Its closed
  mounted state is preserved, together with the current-read refusal gate.
- `editor/assemblyBuildTransport.ts` already verifies project inventory, exact
  parent and sections before assembly recovery. Exact project verification is
  composed with the local section-only refusal and scoped GETs.
- `surfaces/AuthoringPlaceIntoFiling.tsx` and `placeIntoFilingCopy.ts` already
  implement whole saved-document placement, study metadata and reconciliation.
  Current-read refusal is checked before a later write; sent outcomes remain
  truthful. `surfaces/DocumentAuthoring.tsx` keeps scoped list/recovery reads and
  the existing project switch and unsaved-work decision.
- Auto-merged `surfaces/AuthoringCreateExport.tsx`, `AuthoringFilingBar.tsx`,
  `TaskBoard.tsx` and `placeIntoFilingCopy.ts` were reviewed: existing template
  metadata/recovery, signature ceremony, team/personal filters and placement
  remain alongside the local template search and current-authority guards.

A path-limited deleted-history search is retained in `deleted-history-search.txt`.
No capability is replaced or newly registered. No dependency, baseline,
permission, model approval or audit rule was changed by this resolution.

All six production conflict files have no conflict markers. Syntax transpilation
of the eight pinned production files reports no syntax diagnostics, and scoped
`git diff --check` passes. This syntax check is not a full compiler or runtime
qualification. Tests, full compiler and normal push gates follow against the
merged tree; prior October 17–18 test counts are not relabeled as current results.
No Codespace, browser, approved-model or commercial validation is claimed here.
