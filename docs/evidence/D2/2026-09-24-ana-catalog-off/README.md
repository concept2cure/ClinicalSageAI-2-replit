# D2 — with the catalog off, AnA sent a Vault user to a refusal or told them their file did not exist

**Row:** D2 (Launch catalog), `docs/LAUNCH_DEFINITION_OF_DONE.md` — the Vault
app is on for every new organisation; AnA's conversation is a launch shell
surface (`shared/constants/launch-scope.ts`, `LAUNCH_SHELL_SURFACES`).
**Workstream:** the AnA client-files lane. **Date:** 2026-09-24.
**Scope:** a defect fix in what exists. **Nothing is turned on** — whether AnA
may read Vault documents at launch (`ana.document_catalog`) is the founder's
decision and is unchanged here.

## The defect

`ana.document_catalog` is off for every new organisation — bootstrapped
disabled, and written nowhere as on. In that state a regulatory user who
uploaded a file to the Vault and asked AnA about it met one of two answers,
both false:

1. **A refusal naming an internal setting.** The seven catalog tools
   (`list_project_documents`, `read_project_document`, `catalog_project_document`,
   `search_project_documents`, `file_chat_upload_to_vault`,
   `place_project_document`, `search_document_passages`) were offered on every
   turn anyway, and the persona's client-files rule told AnA to call
   `list_project_documents` the moment a user mentioned their material. Every
   call refused with "The document catalog is not enabled for this organization
   (feature ana.document_catalog). Say so plainly" — so AnA told the user about
   a feature key they cannot see or change.
2. **A false statement of absence.** The only other document tools with "vault"
   in the name, `list_vault_documents` and `read_vault_document`, read
   `concept2cure_artifacts` — the Artifacts Center — not `vault.documents`,
   where the Vault app stores uploads. Their descriptions called that store "the
   organization's vault", and their empty answers were "No vault documents match
   the filters." and "No vault document '…' in this organization." About a file
   sitting exactly where the user put it. The progress label shown in the UI
   read "Reading the vault document".

The second is the complaint this whole lane was opened for — "she doesn't
remember the file is there" — live in the launch default.

## Red

| File | What failed at the parent commit (`red/HEAD.txt`) |
|---|---|
| `red/governed-toolset.red.txt` | the catalog tools offered to an org whose catalog is off, to one whose toggle cannot be read, and to an org-less turn (3 failed) |
| `red/persona-client-files.red.txt` | the client-files section has no instruction for the state where its tools are not offered (1 failed) |
| `red/vault-named-tools.red.txt` | the empty listing says "No vault documents match"; the unknown id says "No vault document"; neither description names the store it reads (3 failed) |

## Fix

- **`governedToolsetFor`** — the one place all three chat doors compose their
  toolset through (`chat-path-parity.test.ts`) — withholds the seven gated tools
  when the organization's catalog is off, when the toggle cannot be read (fail
  closed), and on an org-less turn. A tool that can only refuse is not offered.
  The startup line's "no document tools" is now true.
- **`CATALOG_GATED_TOOLS`** in `document-tools-shared.ts`, derived and checked
  against every `requireCatalog(ctx, '<name>')` call by
  `catalog-gated-tools.test.ts`, so a new gated tool cannot be left offered.
- **The persona** says what is true when those tools are absent: AnA cannot open
  the Vault files from the conversation, the files are still in the Vault, a
  file attached to the conversation can be read, and never name an internal
  setting or say a document does not exist.
- **`DISABLED_MESSAGE`** no longer asks AnA to relay the feature key; the key
  stays in it as an operator note.
- **The Artifacts Center tools** now say which store they read, in their
  descriptions, their empty and not-found answers, and their progress labels,
  and say explicitly that their result is not evidence about the Vault.

## Green

`green/catalog-off.green.txt` — the four suites, 33/33. The wider sweep
(`server/services/ana`, `ana-ri`, `server/routes`, `server/services/__tests__`):
7,049 passed, 0 failed. ESLint: 105 warnings before and after in the modified
files, 0 in the two new test files.

## Owed — for the founder

Whether AnA may read Vault documents at launch at all. Until it may, the
honest answer above is the best one available; if it may, the catalog tools
return and URS-002 / OQ-002 need rows for them (row D4). Chunking is a separate
decision with a data-residency consequence: it embeds every upload through the
configured embedding provider, which is OpenAI in the production terraform.
