# Incoming editor integration review

Reviewed Claude's `30e80b571` editor integration and remote baseline
`22c0c85b2` alongside the reporting completion commit `728f6364f` during the
control tower's uncommitted merge. This review uses the merged source; it is not
a staging or model qualification claim.

## Preserved canonical paths

- `SourceImportDialog` validates the returned working-copy ID against the
  requested program, source kind, source ID and recorded SHA-256. Vault and
  data-room entry points use this same dialog and the same authoring store.
  Conversion warnings stay visible in `ImportSourceNotice` after intake.
- `DocumentWorkbench.openPulledDocument` refreshes the list and consults the
  current unsaved-work guard before opening the returned ID. Pinned canvases
  and filtered lists use the existing external-document target through that
  guard. The merge repair leaves this behavior unchanged.
- `AuthoringRemedies` uses the same version-anchored editor proposal door in
  the workbench and conversation canvas. Recorded model qualification,
  actual section, seal, saved base and exact quote remain prerequisites.
  Application creates an attributed tracked suggestion; it does not save,
  accept, sign or approve the document.
- Vault uploads now offer a working copy of the exact uploaded source.
  The IND reference library derives from the canonical catalogue. Pyramid
  deliverable actions preserve separate recorded task status and clearly
  distinguish narrative drafts from forms, data files and signatures.

## Merge repair

Four component regressions failed against incoming source: a completed import
survived a different selected source; a late import survived a program switch;
the project-files rail retained the previous intake; and an old download
completed after the rail had moved to a new program.

The repair keys only the intake by program/source identity and only the files
rail by program. Lifecycle guards ignore late import results, reads and
downloads. Existing source result validation, editor content, remedies and
unsaved-work decisions are preserved. The repaired behavior is covered by
`sourceImportScope.test.tsx`; no workflow bridge is implemented in this merge.

See `incoming-source-scope-red.txt` for the four original failures and
`incoming-source-scope-green.txt` for the focused repaired run. The fixtures
contain synthetic source and document IDs. No session credentials are recorded.

## Next workflow bridge UI proposal

The governing contract is
[GOVERNED_PROTOCOL_CSR_AUTHORING_BRIDGE_2026-10-13.md](../../../../design/GOVERNED_PROTOCOL_CSR_AUTHORING_BRIDGE_2026-10-13.md).
The backend owner is revising it to extend the new shared source-import contract
and `/api/authoring/import/source`. This proposal supersedes the earlier idea of
a separate workflow drawer or a direct browser copy into from-draft.

Extend `SourceImportDialog` with protocol/CSR selectors and a read-only preview
step. The preview must name the stored source, explicit target program, exact
sections, version fingerprint, recorded gaps, machine/template/unknown origin
and any required association decision. Creation supplies only the selector,
expected fingerprint and the actor's reason. Browser prose, model identities,
approval and signature states are never passed as source facts.

Extend the existing `authoringHandoff.ts` for preview/create orchestration;
retain its current specialist callers. The dialog must validate the workflow
receipt's kind, source, program and fingerprint, then open only the returned
document ID and actual returned section code. Use the existing editor target;
keep `docType: null` unless a valid stored filing type is known. A successful
draft is unbound and unapproved, with explicit reuse and provenance disclosure.

Extend `provenance.ts` and `ImportSourceNotice` for workflow receipts without
weakening the existing Vault/data-room origin parser or conversion warnings.
The workbench's saved-evidence context can disclose that workflow receipt;
it cannot treat the workflow pointer as a verified scientific source. Genuine
source receipts and the server's current-version verification/reservation must
remain separate. Preserve the existing remedies and review/signature/filing
actions for the imported copy.

Before connecting new protocol/CSR entry points, narrowly harden
`DocumentAuthoring` to subscribe to the canonical shell project and invalidate
old document-list requests. Preserve the workbench's unsaved-work decision when
opening another document. Tests should cover selection/version changes during
preview and creation, concurrent retries, stale program completion, exact-ID
handoff, partial output, unknown model disclosure and unchanged remedy gates.

This proposed bridge remains pending the control tower's bounded assignment.
