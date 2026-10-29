# Trunk red: the assembly termination message and the Vault working copy (D2, 2026-10-29)

Lane: `…session_01T2wooCZu46W7msw4TJuuzr`, a subagent of the lead. Two client cases were red on trunk at `96ce3798`:

1. `client/src/concept2cure/v2/__tests__/authoringDraftTermination.test.tsx:141`, "actual assembly queue preserves completed work on a termination refusal > retains the first candidate, fails the second, and never starts the third or accepts/retries automatically".
2. `client/src/concept2cure/v2/__tests__/vaultOpenInEditorCarriesDoc.test.tsx:152`, "pulls an uploaded document through verified intake and opens the exact saved working copy".

Both tests were stale. The product was right in both cases, so no product file changes.

## What already exists

**Case 1: the assembly draft queue**

- `client/src/concept2cure/v2/editor/assemblyDraftQueue.ts`, `runAssemblyDrafts`: prepares section candidates one at a time. It checks each saved row fresh, keeps completed candidates for individual review, and accepts nothing. Since `13bafc62` it prepares at most 20 per explicit action, and its last line (`:82`) reports the retained count, the count still pending, and that continuing is explicit.
- `client/src/concept2cure/v2/editor/AuthoringAssemblyBuild.tsx:41`: the explicit continue that message refers to. The button reads "Prepare next candidates (up to 20)", or "Prepare selected candidate" when one section is chosen. `13bafc62` renamed it from "Retry remaining candidates".
- `client/src/concept2cure/v2/editor/__tests__/authoringAssemblyBuild.test.tsx:361`, "bounded full-report candidate continuation" (`13bafc62`): pins 20 per action, the remaining count (`/21.*(?:remain|not.started)/`), resumption, and no accept call.
- `client/src/concept2cure/v2/editor/__tests__/assemblyDraftQueueCompletion.test.tsx` (`a85d6885`): pins that saved text is preserved without starving later candidates.
- `docs/design/EDITOR_CSR_CRF_COMPLETION_2026-10-26.md`, contract item 3: "prepares at most 20 eligible pending candidates per explicit action. Remaining slots stay visible and resumable … no automatic save or endless queue."

**Case 2: the Vault's "Work on document"**

- `client/src/concept2cure/v2/surfaces/Vault.tsx:719` `VaultSourceWorkButton` ("Work on document", for an uploaded file in an open project) and `:2272` `SourceImportDialog`. The dialog's `onOpenDocument` calls `openImportedDocument` (`editor/SourceImportDialog.tsx:48`), which sets the editor target to the saved copy's id and navigates to `document-authoring`.
- `client/src/concept2cure/v2/editor/useSourceIntake.ts:40` `captureIntakeVisit` (`8c86a44a`): captures the signed-in account, its session revision, the project visit and the source. A visit with no signed-in account, or with a token in storage that was never adopted, is retired at once. The dialog then shows the retirement notice and no reason field (`SourceImportDialog.tsx:154`).
- `client/src/concept2cure/v2/authoringHandoff.ts:269` `validSavedCopy`, `:311` `readSourceImportResult`, `:332` `capturedCopy` (`8c86a44a`): a receipt is accepted only if it is the saved row. It must have a UUID, the tenant, the project and the creator of the captured account, `provenance.importSource` matching the origin, and (for a fresh copy) at least one saved section with its own UUID, parent and tenant. A thinner 200 response is treated as an unconfirmed save and is never opened.
- `server/services/authoring/authoring-source-import.ts:296`: the import route returns exactly that: the saved document row, its provenance, its saved sections and the origin.
- `client/src/concept2cure/router/ZenRouter.tsx:86` `ProtectedRoute`: the v2 shell, and so the Vault, renders only for an authenticated user. `client/src/services/portal/authService.tsx:1175` `loadStoredAuth` restores that user on reload. So a real Vault visit always has the account that intake captures.
- The editor tests that already use the signed-in fixture: `editor/__tests__/sourceImportDialog.test.tsx` (full receipt, captured headers asserted), `editor/__tests__/sourceIntakeOwnership.test.tsx:187` ("does not dispatch %s intake anonymously or through storage-only credentials"), and `editor/__tests__/projectVaultSearch.test.tsx`.
- `docs/design/SOURCE_INTAKE_OWNERSHIP_2026-10-23.md:52-58` ("Refuse anonymous or unadopted bearer fallback") and `:138-141`. The second passage records the same stale-fixture class in `sourceUiRules`, fixed there by aligning "only its adopted account/project setup". The Vault test was the one that commit missed.

**Searches run:** the names `assemblyDraftQueue`, `runAssemblyDrafts`, `retained for individual review`, `Prepare next candidates`, `SourceImportDialog`, `useSourceIntake`, `captureIntakeVisit`, `readSourceImportResult`, `openImportedDocument`, `Work on document`, `import/source`, `ProtectedRoute`, across `client/src`, `server`, `shared` and `docs/design`. The deleted-history search, `git log --all --diff-filter=D` on `*assemblyDraftQueue*`, `*SourceImportDialog*`, `*useSourceIntake*`, `*sourceIntake*`, `*vaultOpenInEditor*` and `*authoringDraftTermination*`, returned nothing.

Nothing was built. Two test files changed.

## Root causes

Each one was found by running the test at the commit and at its parent. Each revision was exported with `git archive` into a scratch directory: no checkout, no worktree. See `red.txt`.

| Case | Root-cause commit | Parent | At the commit |
|---|---|---|---|
| 1 | `13bafc62` "Complete full CSR and saved-study CRF authoring" | `df1a3cc2`: 4/4 green | 1 failed, 3 passed |
| 2 | `8c86a44a` "Guard source intake ownership and recover uncertain working copies" | `62a8d5e7`: 4/4 green | 1 failed, 3 passed |

**Case 1 is not `a85d6885`.** That commit added the `preserved` status and the "N saved sections preserved." clause. It kept the wording "Preparation stopped; retry failed or not-started sections explicitly.", which the old regex matched. `13bafc62` replaced the refusal above 20 with bounded continuation. It changed `remaining` from a boolean to a count and changed the message to "N failed or not-started candidates remain. Continue explicitly to prepare up to 20; nothing is accepted automatically." It updated its own tests and the button label, and it missed this assertion.

**Case 2** has two layers, both in `8c86a44a`:
1. The fixture had no signed-in account, only `window.C2C_PROJECT`. Intake now captures the account and retires an anonymous visit, so the dialog shows "This source intake belongs to an earlier account, session or project visit …" and no reason field. That is the red at line 152.
2. With the sign-in added alone, the dialog is reachable but the fixture's receipt (`doc: { id, title }`, `sections: []`, a partial origin) fails the strict decoder. The save is held as unconfirmed, and the copy is not opened (`mutations.txt`, F1). That is correct fail-closed behaviour.

**The F3 commits `55673579` and `96ce3798` are not involved.** Both cases are already red at `142c133d`, the parent of `55673579`. Neither commit touches the files on either path. `96ce3798` adds one optional field, `sectionWithin`, to `editorTarget.ts`. Case 2 fails before the editor target is written.

## Decision: stale test, not a product dead end

- **Case 1.** The new message is what `13bafc62` intended (design contract item 3, its own tests, the renamed button). The test still asserted the pre-continuation wording.
- **Case 2.** A real Vault user is always signed in (`ProtectedRoute`, `loadStoredAuth`). The real import route returns the full saved row. So "Open in editor" does not dead-end in the product. The fixture described a state the shell cannot render, and a receipt the server does not send. Refusing an anonymous intake is the contract `8c86a44a` was built to enforce, and `sourceIntakeOwnership.test.tsx:187` pins it.

## What changed

- `client/src/concept2cure/v2/__tests__/authoringDraftTermination.test.tsx`: one regex became four anchored assertions on the meaning:
  - the message starts "1 candidate retained for individual review.";
  - "2 failed or not-started candidates remain" (the failed second plus the never-started third);
  - "Continue explicitly to prepare up to 20";
  - it ends "nothing is accepted automatically.".

  All other assertions are unchanged: the slot statuses, the retained candidate, the guard, the refusal message, two POSTs only, `programId` on every GET, no saved content and no accept.
- `client/src/concept2cure/v2/__tests__/vaultOpenInEditorCarriesDoc.test.tsx`:
  - a signed-in account (`authService.setToken`, the same fixture shape the editor intake tests use), set before each case and ended after it;
  - the import reply is the receipt the route actually returns: the saved row with tenant, project, creator and `provenance.importSource`, one saved section, and the full origin;
  - the dispatch assertion now also pins the captured account's headers (`Authorization: Bearer <token>`, `x-organization-id`). It is one POST, exactly.

  Every assertion about the exact saved working copy is kept: no navigation before "Open working copy", then the editor target is `{ docId: <saved copy id>, programId: <project> }`, then `document-authoring`. The other three cases are untouched and still pass.

## Red, then green

| | File | Result |
|---|---|---|
| Red at `96ce3798` | `red.txt` | 2 failed, 6 passed, plus the bisect for each case and the pre-F3 run |
| Green | `green.txt` | 8/8 in the shared tree, and 8/8 in the isolated copy before mutation |
| Mutations | `mutations.txt` | 7/7 red. Case 1 (4): the remaining count, "explicitly", "nothing is accepted automatically" and the retained count, each removed. Case 2 (3): the Vault opens the upload id; intake dispatches without the captured bearer; the dialog opens the origin id. Each product file was restored byte-for-byte to its `HEAD` blob. |

Mutations ran in an isolated copy (`git archive HEAD` plus the two edited tests) rather than in the shared tree. Other agents were running tests against this tree at the same time, so a mutated `Vault.tsx` or `assemblyDraftQueue.ts` could have reached them. After every run, `git diff` on `assemblyDraftQueue.ts`, `Vault.tsx`, `useSourceIntake.ts` and `SourceImportDialog.tsx` in the shared tree is empty.

eslint per file: at `HEAD` 0 and 0, now 0 and 0.

I ran a narrowed `tsc` over the two files and everything they import. It reports no error in either file. It does report three errors, all in other files: `styles.module.css` imports in three `components/ana` panels whose declaration lies outside the narrowed include. The full `npm run typecheck` was not run, because it sets a 24 GB heap and this machine has 15 GB. A plain `tsc --noEmit` was killed (exit 137).

## Not done, and observed

- Nothing was committed or pushed. The lead commits.
- The editor intake tests (`sourceIntakeOwnership`, `sourceImportDialog`, `projectVaultSearch`, `authoringAssemblyBuild`) were not re-run, because this session was scoped to its own two files. No product file changed, so their result cannot have moved.
- Observed and not changed: `Vault.tsx` shows "Work on document" whenever `projectId` is any non-empty id. `useSourceIntake` retires a visit whose shell id is not a project UUID (`shellProgramId` is null for a legacy numeric workspace id). The notice then names an "earlier account, session or project visit", which is imprecise for that case. Before `8c86a44a` the same click was refused with "Choose a saved source and an existing project." No test covers it, and it is outside this scope.
