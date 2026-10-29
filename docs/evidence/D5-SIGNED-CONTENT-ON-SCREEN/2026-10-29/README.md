# D5: the labeling and risk screens say whether a signature still binds the record

Row **D5**, electronic signatures (21 CFR Part 11 §11.70: a signature is linked to the record it signs). 2026-10-29.

Commit 84aada8f7 made three signed acts bind the content they attest:

- the labeling document's approval, its move to effective and its supersession;
- the translation's approval;
- the residual-risk acceptance.

It also added a read, `signedContent`, on `GET /api/mdx/labeling/:id` (the document and each nested translation) and on `GET /api/mdx/risk-items/:id`. No client read it (`../../D5-CONTENT-DIGEST-BINDERS/2026-10-29/README.md`, "Not done").

Separately, the translation approval refuses the translation's own creator, but the screen still offered that person Approve. The refusal arrived only after the password was typed (`../../D5-LABELING-TRANSLATION-SIGNATURE/2026-10-29/followups/README.md`, "Not done").

This change **completes** both on screen. It **reaches** the server's read from the screens that show these records. It **reaches** the existing advance check, `signerIndependenceOf`, from the Labeling screen.

## What already exists

### Searches run

- **Client.** `signedContent`, `contentBinding`, `changed-after-approval`, `bindsRecord`, `SignatureState`, `signatureState`, `stale signature`, `signatureDrift`, `SignedState`, across `client/src` and `shared`.
- **Server and client.** `signerIndependenceOf` across `server`, `shared` and `client`.
- **Callers.** `api/mdx/labeling` and `api/mdx/risk-items` across `client/src`.
- **Other signature-state reads.** The protocol, QMS, commitment, Vault-seal, report-seal and eCTD reads named in the binder README.
- **Deleted files.** `git log --all --diff-filter=D --name-only`, filtered for `signed content`, `signature state/line/status/badge/chip/drift`, `SignatureLine`, `stale sig`, `labeling`, `risk register` and `LabelingSign`. No deleted file matched. The clone holds 1,218 commits.
- **Earlier attempts.** `git log --all -S'signedContent' -- client`. The commits it lists touch the protocol fixture's `signedContentDigest`, not this facet.

### The server side, reached and not rebuilt

| Piece | Path | What it does | What it did not do |
|---|---|---|---|
| The signed-content read | `server/services/part11/signed-content-state.ts` `readSignedContentStates` | Takes the newest signature in force on a target and re-derives its binder now. Answers `matches`, `changed`, `unverified`, `withdrawn`, `unsigned` or `unavailable`, with the signer, the time, the meaning, the basis, both digests and a reason. | No client read it. |
| The labeling detail read | `server/routes/mdx-labeling.ts` `GET /labeling/:id` | Returns the document, its translations and symbols, and `signedContent` on the document and on each translation. | The Labeling screen never called it. It reads the list, `/translations` and `/symbols`. |
| The hazard detail read | `server/routes/mdx-risk-management.ts:248` `GET /risk-items/:id` | Returns the hazard, its controls and `signedContent`. | The register never called it. It reads the list. |
| The advance separation-of-duties answer | `server/services/governance/separation-of-duties.ts:673` `signerIndependenceOf` | Asks the enforcing check (`assertSignerIsNotAuthor`) in advance. Answers `independent`, `author`, `unresolved` or `unverified`. A lookup failure is `unverified`, never `independent`. | Only reached by `GET /api/submissions/sequences/:id/dispatch-readiness` (`server/routes/submissions.ts:2026`). Nothing asked it for a labeling translation. |
| The approval's own check | `server/routes/mdx-labeling-approvals.ts:113` `twoPersonRule` | Refuses a recorded creator, using the same `assertSignerIsNotAuthor`. Signs a translation with no creator recorded, as `not_applicable_no_author_recorded`. | — |
| Independence by meaning | `separation-of-duties.ts` `requiresIndependence` | Every meaning but authorship requires independence. That covers both meanings the approval offers, approval and responsibility. | — |

### Client renderings of a signature's state, read before writing one

| Piece | Path | What it renders | Why it is not the one used here |
|---|---|---|---|
| Protocol signature line | `client/src/concept2cure/v2/surfaces/ProtocolDevReviews.tsx:69` `SignatureLine` | The protocol read model's facet (`PdevSignatureFacet`: `signed`, `revoked`, `changed`, `unverified`, `none`, `unavailable`, with `signature` nested), plus the protocol's signing-policy qualification words. | It reads a different server facet, from `protocol-signature-manifestation.ts`, with another vocabulary and protocol-only claims. The binder README records that the server reads are not converged onto `readSignedContentStates`. The client line stays with its read, and the new module's header says so. |
| Artifacts center state | `shared/artifact-governance.ts:61` `artifactSignatureState`, drawn inline in `AdminSurfaces.tsx:1679` and `VaultGovernedArtifacts.tsx:48` | `none`, `current`, `stale` or `unknown`, by comparing the signed artifact version with the current one. | It is a version comparison over `concept2cure_artifacts`, not a content digest. Both files belong to another agent and were not touched. |
| Agency response state | `client/src/concept2cure/v2/surfaces/agencyQuestionState.ts:12` | The response workflow's states, including `changed-after-approval`. | A workflow state of one domain, not this facet. |
| Commitment fulfilment | `CommitmentRow.tsx:185` `VERDICT_SENTENCES`, over `bindsRecord` | A boolean verdict for a fulfilment. | Its own read and shape. |
| Vault seal verdict | `VaultSeals.tsx:64` `verdictSentence` | `intact`, `changed` or `could_not_verify` for a seal's documents. | Its own read and shape. |
| QMS release approval | Server `readCurrentQmsReleaseApproval` reports `changed`. | No client rendering of that state was found. `SopRegister.tsx` shows the approval rule in a button title. | — |
| Shared pieces | `_shared/components/GovernedTimestamp.tsx`, `_shared/signatureMeaning.ts`, the `rd-chip tone-*` classes, `useLiveData` (`v2/dataConnect.tsx`) | The UTC time, the meaning in words, the tones, the read. | Used as they are. |

So no existing client component read this facet. The work adds one, `client/src/concept2cure/v2/SignedContentState.tsx`. It is the only client reading of `signedContent`, and all three records use it: the label document, the translation and the hazard.

### Warning before the click: the patterns copied

- **Submission Center Dispatch tab** (`SubmissionSeqWorkspaces.tsx:2065`):
  - reads `signer.state` from `signerIndependenceOf`;
  - hides the buttons for `author`;
  - says `unverified` hides nothing ("unknown is not 'you cannot'").
- **Protocol review disposition** (`ProtocolDevReviews.tsx:93` `DispositionAction`):
  - a disabled button described (`aria-describedby`) by visible text;
  - the reason was moved out of a `title` because a disabled button takes no focus (GA-7, 2026-09-28).
- **The screens** before this change:
  - `Labeling.tsx`: the translation board, with its row inline;
  - `LabelingTranslationApproval.tsx`: the signature dialog and `TranslationStepControl`;
  - `RiskRegister.tsx`: the register and the drawer, mounted by `Risk.tsx` and `mdx/surfaces/EngineeringSurface.tsx`.

## What changed

| File | Change |
|---|---|
| `client/src/concept2cure/v2/SignedContentState.tsx` (new) | The one client reading of the facet: `signedContentFacetOf` (an unreadable facet is `unavailable`), `signedContentWords`, `showsSignedContent`, `SignedContentLine`, `signedContentForAna`, and `useSignedRecord`. `useSignedRecord` reads a record's GET and uses the answer only once it has settled and only if it is for the record asked for. |
| `client/src/concept2cure/v2/surfaces/LabelingSignatures.tsx` (new) | The Labeling screen's signatures from `GET /labeling/:id`: `useLabelingSignatures` (with `refresh`), the document's line, and the translation row. The row moved out of `Labeling.tsx` because it is what gains the signature line and the creator's note. `withLabelingSignatures` adds the states to AnA's context. |
| `client/src/concept2cure/v2/surfaces/Labeling.tsx` | Reads the signatures and draws the document's line above the lead. Draws each row through `TranslationRow`. Reads the signatures again after a translation is added and after an approval is signed here. Its AnA context goes through `withLabelingSignatures`. |
| `client/src/concept2cure/v2/surfaces/LabelingTranslationApproval.tsx` | `TranslationStepControl` takes `ownNoteId`. For a translation's creator, Approve is disabled and described by the sentence below the row. |
| `client/src/concept2cure/v2/surfaces/RiskRegister.tsx` | For a selected accepted hazard, reads `GET /risk-items/:id`. The drawer shows "Acceptance signature: …" under the hazard chain. AnA's selected hazard carries `residualAcceptanceSignature`, and the summary says it. |
| `server/routes/mdx-labeling.ts` | `GET /labeling/:id` adds `approvalSigner: { state }` to each translation, from `signerIndependenceOf('labeling-translation:<id>', org, reader)` (`approvalSignersOf`). If the reader has no user id, or the check throws, the state is `unverified` and the read still answers 200. This server file was approved by the lead. |

### Tests added

| File | Tests | What it covers |
|---|---|---|
| `client/src/concept2cure/v2/__tests__/signedContentState.test.tsx` | 20 | The wording table, the unreadable facet, when a line is drawn, words beside the tone. |
| `client/src/concept2cure/v2/__tests__/labelingSignedContentOnScreen.test.tsx` | 28 | Each state on an approved translation and on the document. An unread state is never "Not signed". The re-reads. The creator's warning. AnA's context. |
| `client/src/concept2cure/v2/__tests__/riskSignedContentOnScreen.test.tsx` | 10 | The accepted hazard's drawer, only accepted hazards read, the re-read after an acceptance signed here, AnA's context. |
| `server/__tests__/routes/mdx-labeling-approval-signer.pglite.test.ts` | 7 | The real router on PGlite, with `20260511` and `20261029b`: `author`, `independent`, `unresolved`, organisation scope, a failed lookup, a throwing check, no user id. |

## The wording

The server decides which state a record is in. The screen only says it.

| `signedContent.state` | On screen | Tone and icon | Also shown |
|---|---|---|---|
| `matches` | **Signed content unchanged** | ok, check | Signed by *name* · meaning · UTC time |
| `changed` | **Changed since it was signed** | err, warning | Signer, meaning, time, and the server's reason |
| `unverified`, basis `governed-action-sha256-chain` (signed before 84aada8f7) | **Signed before content binding; not verifiable** | warn, info | Signer, meaning, time |
| `unverified`, any other reason (the row does not hash to its manifest, no digest, or content not derivable now) | **Signed; the signed content could not be verified** | warn, info | Signer, meaning, time, and the server's reason |
| `withdrawn` | **Signature withdrawn** | idle, history | The withdrawn signature's signer, meaning and time |
| `unsigned` | **Not signed** | idle | — |
| `unavailable`, or any facet this client cannot read, or a read that failed or answered for another record | **Signature state could not be read** | warn, info | — Never shown as "Not signed" |

The task's wording for `unverified` fits only a pre-binding signature. Saying "signed before content binding" over a row whose manifest no longer hashes would be false. So the other reasons get their own words, with the server's sentence.

Each line starts with what the signature is: "Label signature", "Approval signature" or "Acceptance signature". The state is always in words inside the chip. The tone and icon sit beside the words, so colour is never the only signal (mutation M5).

### When a line is drawn

A line is drawn in three cases:

- the record's status says it is signed:
  - a document approved, effective or superseded;
  - a translation approved;
  - a hazard accepted (status `accepted` or `acceptable` true);
- the facet carries a signature (`matches`, `changed`, `unverified`, `withdrawn`), for example a translation back in review whose approval was withdrawn;
- the state is still being read, for a record expected to be signed: "…: reading its state…".

A record that was never signed and is not expected to be shows nothing. A record that is expected to be signed always shows a line, including "Not signed" or "Signature state could not be read" (mutation M6).

### Reads

- **The label document.** It is read once when the screen opens, alongside the translation and symbol reads. It is read again on Try again, after a translation is added here (its creator is the signed-in user), and after an approval is signed here.
- **A hazard.** Only an **accepted** hazard is read, while it is selected. It is read again when its status changes, for example after an acceptance signed here. That keeps the Risk and Engineering screens' existing reads exact for every other hazard (mutation M18 turns those keep-green suites red).

## A translation's creator is told before approving

`approvalSigner.state` comes from the approval's own check, asked in advance, so the screen cannot disagree with the signed PATCH. The signed PATCH remains the authority.

| State | Screen |
|---|---|
| `author`, for a translation in review | Approve is **disabled** and described by a visible sentence under the row: *"You added this translation, so you cannot approve it. Separation of duties requires a different colleague with signing rights to approve it."* AnA is told the same, and its actions say not to approve that translation. |
| `independent` | Approve, as before. |
| `unresolved` (no creator recorded, rows from before 20261029b) | Approve, with no warning. The approval signs it as `not_applicable_no_author_recorded`, so withholding it would contradict the server (mutation M10). |
| `unverified`, or not read (the read failed, or a translation it did not carry) | Approve, with no warning. Unknown is not "you cannot". The server still decides (mutation M11). |

A viewer is offered no step, so no creator note is shown to them.

The lead asked that a failed check give "an unavailable signer state". The server uses the check's own word, `unverified`, which `SignerIndependence` already defines for a lookup that could not run. A second word for the same state would be a second vocabulary. The client treats it exactly as asked: Approve is offered with no warning.

## AnA

**Labeling.** The published context adds three things:

- `facts.document.signedContent` and, on each translation, `signedContent` and `approvalSigner`;
- a summary sentence for each shown signature (for example "Translation approval signatures: German, Changed since it was signed.") and for the creator's own translations in review;
- an action that withholds those approvals.

**Risk register.** On the Risk screen and in Engineering, the selected hazard carries `residualAcceptanceSignature`, and the summary says it.

In both, `unavailable` carries a note: "The signature state was not read. This is not a statement that the record is unsigned."

## Proof

### Red at HEAD: `red.txt`

The four new test files were run against HEAD's product code at 6b70fd0a4. The four changed product files held HEAD's bytes, and the two new modules were removed. Every file was then restored from the bytes copied before the run, with sha256 checked.

**All 4 files red.** 36 of the 45 collected tests failed, and the shared-module unit file (20 tests) could not load, because its module does not exist at HEAD. The 9 that pass at HEAD are behaviour that stays the same:

- no line for a translation never signed and not approved, or for a draft document;
- Approve offered to a non-creator, and for `unresolved`, `unverified`, not-read or failed checks;
- no creator note for a viewer;
- no read for a hazard that is not accepted.

### Green: `green.txt`

**39 files, 561 tests, all green.**

| Side | Files | Tests | Suites |
|---|---|---|---|
| Client | 28 | 239 | The 3 new files; every `labeling*` and `risk*` suite in `v2/__tests__`; every `EngineeringSurface.*` suite; `engineeringAnaContext` and `engineeringAnaContextSettles`. |
| Server | 11 | 322 | The new route test; `content-digest-binders.pglite` (16); `labeling-risk-content-binders` (74); `mdx-labeling-approval-controls.pglite` (54); `mdx-labeling-translation-approval-signature` (24); `mdx-labeling-writes-require-editor` (24); `mdx-risk-accept-residual-signature` (33); `labeling-translations-shape` (3); `separation-of-duties` (32); `tests/mdx-qms-labeling-search-analytics-routes` (28); `tests/mdx-beta-surfaces-routes` (27). |

### Mutations: `mutations.txt`

**24 of 24 red.** The script is `mutate.py.txt` in this folder. It was run from a scratch copy that differs only in its usage line. Each mutation:

1. is an exact replacement in product code, its old string checked to occur once;
2. runs the named tests (`--reporter=json`);
3. is restored from the bytes read before it;
4. has its restore checked by sha256.

The file ends with each file's sha256, equal to its value before the run.

| | Mutation | File | Red |
|---|---|---|---|
| M1 | "Changed since it was signed" said as "Signed content unchanged" | `SignedContentState.tsx` | 7 of 58 |
| M2 | A facet this client cannot read taken as unsigned | `SignedContentState.tsx` | 8 of 58 |
| M3 | A failed record read shown as unsigned | `SignedContentState.tsx` | 4 of 58 |
| M4 | Another record's answer taken as this record's (id check dropped) | `SignedContentState.tsx` | 2 of 58 |
| M5 | **Colour only**: the chip keeps its tone and icon, loses the words | `SignedContentState.tsx` | 15 of 58 |
| M6 | **Silent when expected**: an approved or accepted record with no readable signature shows nothing | `SignedContentState.tsx` | 9 of 58 |
| M7 | A changed signature without the server's reason | `SignedContentState.tsx` | 3 of 58 |
| M8 | A pre-binding signature said as the generic "could not be verified" | `SignedContentState.tsx` | 3 of 58 |
| M9 | **The creator offered Approve** as if it would work | `LabelingSignatures.tsx` | 3 of 28 |
| M10 | `unresolved` withholds Approve, though the approval signs it | `LabelingSignatures.tsx` | 1 of 28 |
| M11 | A signer state not read withholds Approve (unknown taken as "cannot") | `LabelingSignatures.tsx` | 2 of 28 |
| M12 | The creator's Approve enabled and opening the dialog | `LabelingTranslationApproval.tsx` | 2 of 28 |
| M13 | Not read again after an approval signed here | `Labeling.tsx` | 1 of 28 |
| M14 | Not read again after a translation added here, so its creator is not warned | `Labeling.tsx` | 1 of 28 |
| M15 | AnA's translation facts without `signedContent` | `LabelingSignatures.tsx` | 2 of 28 |
| M16 | AnA's summary does not say the states | `LabelingSignatures.tsx` | 2 of 28 |
| M17 | AnA still offered the approval the screen withholds | `LabelingSignatures.tsx` | 1 of 28 |
| M18 | Every selected hazard read, not only an accepted one | `RiskRegister.tsx` | 6 of 33, including the keep-green `riskAndDesignControlsSharedMounts` (2) and `EngineeringSurface.riskRegister` (1) |
| M19 | The drawer does not show the acceptance signature | `RiskRegister.tsx` | 6 of 10 |
| M20 | AnA's selected hazard without its acceptance signature | `RiskRegister.tsx` | 2 of 10 |
| M21 | The server asks the check about the document, not the translation | `mdx-labeling.ts` | 2 of 7 |
| M22 | **Fail open**: a check that throws reads `independent` | `mdx-labeling.ts` | 1 of 7 |
| M23 | **Fail open**: a reader with no user id reads `independent` | `mdx-labeling.ts` | 1 of 7 |
| M24 | A check that throws fails the whole read | `mdx-labeling.ts` | 1 of 7 |

M21 is red in 2 of 7 rather than more. In the fixture, the document and the creator's translation share an id and a creator, so "author" still comes back for the wrong target. The independent-colleague and failed-lookup cases catch it.

### Type check, lint, gates

- **`typecheck.txt`.** Scoped `tsc`: two scratch tsconfigs extend `./tsconfig.json`, listing the changed files, the tests, and the repo's declaration files.
  - Client: the changed and new files, `Risk.tsx`, `EngineeringSurface.tsx`, the three new tests, and `ZenLogin.tsx` for `*.module.css`.
  - Server: `mdx-labeling.ts`, the new test, and the three modules that augment `Express.Request`.

  Exit 0 for both.
- **`eslint.txt`.** 0 errors. Every file's warning count is at or below HEAD's:
  - `Labeling.tsx`: 2 = 2, the same two rules. HEAD's file was at exactly 500 counted lines, so the row moved to `LabelingSignatures.tsx` rather than adding lines.
  - `RiskRegister.tsx`: 3 = 3. Its existing `max-lines` warning goes from 749 to 769 counted lines; the warning count does not change.
  - Every other file: 0.
- **`gates.txt`.** All exit 0: `ci:sign-ceremony`, `ci:sql-interpolation`, `ci:server-error-leaks`, `ci:undefined-css-classes`, `ci:ana-surface-context`, `ci:unreferenced-modules`, `ci:unverified-verdicts`, `ci:unauthenticated-fetch` and `ci:class-vocabulary`.

## Not done

- **Nothing in the client approves a labeling document, makes it effective or supersedes it.** The document's signature state is shown. The creator warning covers translations only, because the document acts are reached through the API only (parent README).
- **The list reads still do not carry `signedContent`.** These are `GET /labeling?program_id`, `GET /labeling/:id/translations` and `GET /risk-items`. The screens read the detail GET instead: one more request per open label, and one per selected accepted hazard. Adding the facet to the list reads would be a server change outside this task.
- **"Changed" is detected, not refused.** A symbol can still be added to an approved label, and an accepted hazard edited. Whether either should be refused is the founder's domain rule (binder README).
- **No remedy is offered from a "changed" line.** The screen does not offer re-approval or re-acceptance from it. Re-signing an approved translation means withdrawing it first, which the client does not offer (parent README).
- **The protocol `SignatureLine` is not converged onto this component.** Its server read is not converged onto `readSignedContentStates`; when that happens, the client line should follow.
- **Not run:** the full-repo typecheck (it runs out of memory under parallel load) and the rest of the test tree.

## Files

- New:
  - `client/src/concept2cure/v2/SignedContentState.tsx`
  - `client/src/concept2cure/v2/surfaces/LabelingSignatures.tsx`
  - `client/src/concept2cure/v2/__tests__/signedContentState.test.tsx`
  - `client/src/concept2cure/v2/__tests__/labelingSignedContentOnScreen.test.tsx`
  - `client/src/concept2cure/v2/__tests__/riskSignedContentOnScreen.test.tsx`
  - `server/__tests__/routes/mdx-labeling-approval-signer.pglite.test.ts`
- Changed:
  - `client/src/concept2cure/v2/surfaces/Labeling.tsx`
  - `client/src/concept2cure/v2/surfaces/LabelingTranslationApproval.tsx`
  - `client/src/concept2cure/v2/surfaces/RiskRegister.tsx`
  - `server/routes/mdx-labeling.ts`
- Evidence: `red.txt`, `green.txt`, `mutations.txt` (and `mutate.py.txt`, which produced it), `typecheck.txt`, `eslint.txt`, `gates.txt`, this README.
