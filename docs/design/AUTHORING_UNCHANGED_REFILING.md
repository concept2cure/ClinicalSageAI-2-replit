# Complete re-filing of unchanged saved Authoring text

W1 / D2. Continue the existing saved-section to filing path on
`concept2cure-v2`. Evidence belongs under
`docs/evidence/D2-AUTHORING-UNCHANGED-REFILING/2026-10-23/`.

## What already exists

- `server/routes/authoring.router.ts` owns section PATCH save, atomic revision,
  saved-source reservation, lineage, `commitSectionToFiling` and audit. Its
  `filingDivergedRefusal` explicitly records the open unchanged-body remedy:
  users must make an arbitrary edit because the editor Save requires dirty text.
- `server/services/c2c/commit-section-to-filing.ts` owns the canonical filing
  writer; `filing-section-target.ts` owns binding, assembly and agreement reads.
  These engines remain the only writers/verdicts, with existing locks and gates.
- `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx` owns editor/save;
  `surfaces/AuthoringFilingBar.tsx` owns freeze/sign actions and refusal display.
  `AuthoringPlaceIntoFiling.tsx` creates a whole-document snapshot/leaf, a
  different existing act, not an unchanged bound-section save remedy.
- `client/src/concept2cure/v2/__tests__/authoringSaveFilingCommit.test.tsx`
  and existing server assembly/save/filing/seal tests are the fixture starting
  points. Extend these boundaries rather than invent another save or version
  engine.
- `authoring-file-to-vault.ts`, `vault-version-checkin.ts` and the recorded
  derivation receipt already own Vault admission/check-in/provenance. Historical
  hash-labelled Vault supersession and sealed authored-document revision are
  separate open policies and remain outside this correction.

Searches covered re-file/refile, filing divergence, saved-body/dirty, section
commit, approval, revision and version in routes/services/client/designs,
plus deleted history for authoring versions/revisions/refiling and filing names.
No retired competing unchanged-section remedy was found. Existing deployed
capabilities are completed, not rebuilt.

## Discovery contract

Root owns Git, synchronization, this design, qualification and publication.
Two read-only reviews establish the smallest safe completion: server save/
filing/lock/lineage behavior, and client current-read/session/dirty/save behavior.
No worker source edits, tests or Git mutations until root records the exact
implementation contract and disjoint ownership. The correction must use the
existing canonical save/filing engine, preserve source/current-access/signature/
freeze gates and uncertain outcomes, and never invent a content revision to
explain an unchanged body. No new dependency, schema, editor, approval act or
historical version policy is proposed.

## Qualification

Retain meaningful failing proof before implementation; verify intentional
unchanged-body filing, current source and binding, assembly, authorization,
sealed and locked targets, uncertain writes and existing ordinary saves. Run
focused regressions, build, full TypeScript and mandatory repository push hooks.
No deployment, live approval or agency acceptance is inferred from local tests.

## Approved bounded completion and wire contract

Discovery confirmed that an identical content PATCH files, but also creates a
content revision and reasserts lineage, while RichSectionEditor intentionally
skips unchanged saves. Keep both ordinary behaviors unchanged. Add an explicit
filing-only intent before the ordinary PATCH pipeline, behind the same existing
section/object authorization and immutable-document gates.

Request: `PATCH /api/authoring/sections/:sectionId` with exactly
`filingOnly: true`, `expectedDocumentId`, `expectedFilingDocumentId`,
`expectedProgramId` (Authoring document/program UUIDs; filing identity is its
exact bounded nonempty native string because `c2c_documents.id` is TEXT),
`expectedUpdatedAt` (valid saved timestamp), and
`changeReason` (canonical governed reason). Reject other keys, including content,
editing metadata and claimed authors. Presence of an invalid filingOnly intent
must refuse rather than fall through to ordinary PATCH.

Success contains `success: true`, `refiled: true`, `revision_created: false`,
`source: {documentId, sectionId, programId, filingDocumentId, updatedAt}` and
`filing: {committed: true, documentId, sectionKey, partOf?}`. The source identity
and saved timestamp must match the captured request and the filing document must
match both source binding and committed target. No text enters the receipt.
A missing/ambiguous binding or canonical not-committed result is a refusal,
never a successful empty operation. A commit attempt or unconfirmed rollback
returns safe 503 `OUTCOME_UNKNOWN`; the client must hold against replay.

Server completion:

- Reserve saved source/disposition before parent/section locks, as canonical
  source-linked writes do. Reserve the writable parent, lock/read saved section
  and current binding, recheck every expected identity/timestamp inside the
  transaction, and preserve full current authorization/source/workflow gates.
- Reuse read-only canonical lineage coverage and hash checks for the actual
  contributing saved sections, preserving existing spans/authors. Converge the
  existing private workflow hash check onto one shared canonical verifier if
  needed. Never run lineage regeneration or accepted-claims attribution for an
  unchanged body. Retained machine facts may be passed only from exact verified
  recorded evidence; no human origin is inferred from who re-files.
- Call only `commitSectionToFiling`, preserving assembly, market, lock and
  approval-withdrawal behavior. Record a COMMIT audit on the same transaction,
  with exact source/destination and stated reason. No section content/timestamp,
  content revision, signature or source span is rewritten. The canonical parent
  reservation's timestamp touch remains necessary for seal-race safety.
- No new schema, dependency, Vault numbering or sealed-document revision policy.

Client completion:

- Reach a deliberate “Re-file saved text” from the existing document action
  toolbar, using `GovernedConfirmDialog` with a dedicated reason and explicit
  confirmation. Name the selected saved section and filing destination; explain
  that this changes the filing copy without creating an Authoring content
  revision. Ordinary Save and RichSectionEditor remain unchanged.
- Require current full read, admitted binding/project/session, editable document,
  a clean actual editor, and no pending save/navigation/session change. Recheck
  at submission; dirty text must be saved or discarded deliberately first.
- Use `mutateVerbatim` and exact pinned receipt validation. Retain pending and
  uncertain state across ordinary close/reopen and source navigation in the
  mounted workbench; never automatically replay on network errors, malformed or
  contradictory receipts, 5xx, or unknown outcomes. A reload of Authoring text
  alone does not reconcile an uncertain filing/audit commit. Suppress obsolete
  callbacks and success claims after actor/project/source access changes.

Ownership: server worker owns `authoring-refile-saved-section.ts`, the narrow
existing router dispatch/refusal copy, canonical lineage helper/workflow
convergence, optional shared request/response types and focused server fixtures.
Client worker owns one contained `editor/AuthoringRefileSavedText.tsx` controller,
its exact local receipt/state helpers if needed, minimal DocumentWorkbench call
site and focused component/workbench fixtures. No shared confirmation, generic
mutation classifier, RichSectionEditor, Vault writer or existing company/PDF
engine changes. Root owns integration evidence, Git and whole-tree gates.
Both workers retain functional RED against the existing mounted path before
production edits, then GREEN and directly affected regressions. A missing new
module/import error alone is not functional RED.

### Narrow canonical membership extraction

The server worker may extract the existing sibling membership read in
`server/services/c2c/filing-section-target.ts` into `filingSectionMembers` and
reuse it unchanged from both existing text assembly and new read-only lineage
admission. This is one canonical membership policy, with identical ordering and
text output. This path is the sole approved exception to the pre-completion
unchanged-boundary pin set; the remaining 13 boundaries stay untouched.

### Independent access and receipt review

A client full-document read is not server write authority. Inside the reserved
transaction, require canonical full-document view permission as well as selected
section edit permission, and reuse the current QMS content-write refusal. A
section-only author cannot use this act to assemble private sibling text.
Meaningful negative regressions must demonstrate these checks. Ordinary section
save behavior is outside this correction.

Client receipt review additionally rejects unrelated or bare-module assembly
keys using the shared `filingSectionKey` policy, contradictory positive/refusal
bodies and unknown outcome aliases. Confirmed presentation belongs to the
originating current review/visit; bookkeeping for pending/unknown attempts
survives ordinary close/reopen and source navigation independently of display.
The confirmation discloses that combined sections file their saved text together.

## Concurrent canonical update

The discovery inventory above records base `0a7abf314`. Before publication,
upstream `26d850156` was reviewed and merged cleanly at `90facc53e`. Its separate
Vault rendition-version completion is described in
`docs/design/AUTHORING_REFILING_VERSIONS_2026-10-23.md`; new supported PDF/Word
filings use canonical numeric Vault successors, while historical hash-labelled
families still refuse automatic renumbering. This section-to-filing completion
neither implements nor replaces that work. The prior parity TODO has been
replaced upstream with actual versioned-PDF placement proof. A sealed authored
document's editing revision remains a separate policy.

The concurrent Unicode change preserves surrogate pairs through UTF-8 storage.
Combined qualification includes its three dedicated suites, Vault version and
filing/derivation suites, existing PDF/working-copy flows and this completion.
Of the original 14 boundary pins, 11 remain unchanged: the canonical membership
extraction is this completion's one approved change, and the filer/version
check-in files exactly match the incoming update. Renderer, converter, rich
editor, generic mutation policy and company-original packaging remain unchanged.

A later upstream template/planning and Unicode-reading update at `43cde0d11`
merged cleanly at `ee160a52b`. Independent review confirmed no change to this
completion's 13 owned paths or 71 qualified source pins. Planning remains
internal/manual without filing authority; Unicode reads retain current access
and receipt-span checks. The separate late-incoming evidence records the
affected 14-suite run and fresh whole-tree build/compiler results.

Final upstream release-identity work at `4cd0215a5` merged cleanly at
`6794c76f6`. Its identity reader and default snapshot bytes are unchanged;
regional facts bind the existing non-US release proof. This completion's 13
paths remain unchanged. The sole original-pin overlap is a comment in
`SubmissionSeqWorkspaces.tsx`. Final integration evidence preserves prior
counts separately and records focused merged checks and whole-tree gates.
