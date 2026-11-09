# P-94: an onboarding upload is released only when its bytes are approved in the project's Vault (row D7, 2026-11-09)

## The decisions, verbatim

- **P-94** (founder, 2026-11-02, `docs/LAUNCH_DEFINITION_OF_DONE.md`): "An uploaded leaf goes through the same
  approval as an authored one before it can be placed in a sequence. Readiness and transmit both refuse an unapproved
  upload, as they do an unapproved authored leaf." … "the approval itself uses the existing approval act, nothing
  new."
- **P-108 item 3** (founder, 2026-11-08):
  - (a) "An upload counts as approved when the same bytes, matched by content hash, are already approved by the
    Vault's existing act in the same project, with no new act."
  - (b) "Retire ctd_onboarding_documents as a source of placeable leaves; it has no upload caller in any history and
    no deploy applier. Its replacement is VaultPlaceIntoSubmission.tsx."
  - Answer: "Accept both."
- **The coordinating session's ruling of 2026-11-08** reads "placed" in P-94 as "filed". So readiness and transmit
  refuse, and placement is not refused by this change. Item 3(b) is its own commit, after this one.

The design is `docs/evidence/RIM/2026-11-08-designs/p94-onboarding-upload-approved.design.md`. Its reading (B) is the
one P-108 3(a) accepted.

## What already exists (RULE 3), re-anchored on the tree at `4a6546508`

- `ctd_onboarding_documents` (`migrations/0007_ctd_onboarding_pipeline.sql`) holds no approval.
  - Its `status` is a processing status, written `'uploaded'` and never changed, and the row names no uploader.
  - It is on no deploy applier.
- Uploads reach a sequence only through `upsertLeaf`'s three API doors: REST `PUT …/leaves`, AnA's
  `place_into_sequence`, and MCP. No client screen places one.
- **The readiness resolver** (`server/services/ectd/leaf-document-resolver.ts`, `INTEGER_LOOKUPS.ctd_onboarding_documents`)
  set no `notTransmittable` for an upload. Every other store's lookup sets one. `contentFindings` turns that field
  into `DOCUMENT_NOT_APPROVED`, which the release gate (`evaluateReleaseApprovalGate`) and every precheck read.
- **The assembler** (`server/services/ectd/leaf-source-resolver.ts`, the onboarding branch of
  `materializeLeafSources`) staged an upload without calling `noteUnfinalized`. So `assembledTransmitBlockers` never
  refused one at freeze, dispatch or transmit.
- **The Vault's existing act** is the only approval that exists for an uploaded file.
  `vaultVersionNotTransmittable` (`server/services/vault/vault-lifecycle.ts`) clears a Vault version only when its
  lifecycle record is at a steady stage, the version is current, and it is approved for exactly these bytes.
- **The upload's project** is reached by the join the Builder's reader already uses
  (`submission-leaf-source-evidence.ts`, `onboarding`): `ctd_onboarding_projects` → `projects.regulatory_program_id`.
- So the upload store missed the release rule that every other store follows. This completes it; nothing is
  rebuilt.

## The change

- **`onboardingUploadNotTransmittable(q, organizationId, uploadId, uploadSha256)`** is the one verdict.
  - It reads the upload's project program through the Builder's join.
  - It finds current Vault versions in that program whose `content_hash` equals the upload's SHA-256.
  - It clears the upload only if one of them passes `vaultVersionNotTransmittable` for those bytes.
  - Otherwise it gives one sentence: "an uploaded file whose bytes no Vault version of this project has approved, so
    approve the same file in the Vault".
  - A read that fails gives "… whose approval in the Vault could not be checked, so it is not released", failing
    closed.
  - Neither sentence has a `;` or `:`, because `assembledTransmitBlockers` joins items with `'; '` after a label.
- **Reader 1, readiness:** the upload lookup sets `notTransmittable` from it. Validation and Dispatch show
  `DOCUMENT_NOT_APPROVED`, a release warning: Validated is not held (P-22). The release gate and every precheck
  refuse before anyone signs.
- **Reader 2, the assembler:** after staging, as the Vault branch does, it calls `noteUnfinalized` with the same
  sentence. An unusable upload (not a PDF, unreadable or cross-tenant) is reported once, as unresolved, and never
  counted twice.
- **The split (RULE 6, "split, don't add").** Adding the verdict took `leaf-source-resolver.ts` over its 500-line
  limit.
  - The release-verdict family moved unchanged into `server/services/ectd/leaf-release-verdicts.ts`: the finalized
    sets, `isFinalizedStatus`, `notFinalizedStatus`, `renderedLeafNotTransmittable`, and the new verdict.
  - `leaf-source-resolver.ts` re-exports every name, so no caller changed.
- Two comments are made true: `leaf-document-resolver.ts`'s approval paragraph, and `dispatch-readiness.ts`'s note
  that uploads had no verdict.
- No migration, no route, no screen, no new act, no client change.

## What a person reads

- **Validation and Dispatch:** "Leaf "Signed Form 3514" (1.1) points at ctd_onboarding_documents 900, which is not
  yet approved (an uploaded file whose bytes no Vault version of this project has approved, so approve the same file
  in the Vault). Validation does not wait for approval, but only approved documents are released: freeze, dispatch
  and transmit refuse this sequence until the document is approved."
- **The release gate and every precheck:** "1 leaf points at a document not yet approved. Only approved documents are
  released, so freeze, dispatch and transmit refuse this sequence until each is approved."
- **What they do:** upload the same file to the project's Vault, review and approve it there (the signed Vault act).
  The upload then clears. The leaf is unchanged, and so are its bytes.

## Proof

| File | What it shows |
|---|---|
| `red-readiness.txt` | at `4a6546508`: an upload with no approved copy, an unreviewed copy, and a copy approved in another program are all cleared (3 fail). The approved-copy case passes because nothing blocks yet |
| `red-assembler.txt` | at `4a6546508`: a staged PDF upload is not counted unapproved (`unfinalized` 0) |
| `green.txt` | every test naming the upload store or either reader, and the ectd, submission-service and pathway-engines suites: 2145 pass, none fail |
| `mutation-1` | the readiness lookup sets no verdict: the three refusal cases fail |
| `mutation-2` | the assembler counts nothing: the staged-upload case fails |
| `mutation-3` | the verdict always clears: the three refusal cases fail |
| `mutation-4` | a copy approved in any program clears it: the other-project case fails |
| `mutation-5` | an unapproved copy clears it: the unreviewed-copy case fails |
| `mutation-6` | judged before the PDF checks: the unusable-upload guard and the staged cases fail |

The tests:
- `assess-dispatch-readiness.vault-leaf.pglite.test.ts`: readiness end to end, four cases.
- `leaf-source-resolver.test.ts`:
  - the staged upload is counted with the same sentence;
  - an approved copy clears it in the assembler too, so the two readers agree;
  - the four unusable uploads stay `unfinalized` 0.

The design's T3 (a resolver-only case) is covered by the end-to-end readiness cases and by mutation 1.

## Not done here

- **P-108 3(b):** retiring `ctd_onboarding_documents` as a placeable leaf source, with `VaultPlaceIntoSubmission.tsx`
  as the replacement by path. It is the next commit, with its own deletion record.
- **Legacy locked sequences carrying an upload** (design §10 Q2). Reading (B) is the path: approve the same bytes in
  the Vault, and the re-send carries them unchanged. The coordinating session's sizing query is in the design.

## Plan

`Plan: F1`, `Completes: server/services/ectd/leaf-source-resolver.ts`. The holds on `leaf-source-resolver.ts`,
`leaf-document-resolver.ts` and `dispatch-readiness.ts` are recorded and released in
`.design/claude-convergence/COORDINATION.md` with this commit.
