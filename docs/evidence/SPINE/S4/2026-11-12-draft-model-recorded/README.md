# S4 · A draft AnA saves in a live turn names the model that wrote it (2026-11-12)

Owner: `session_01KZK3jgtmQBgNepqLjXjS3k` (P-105). Found by walking the running app, fixed in the read, and walked again.

## What was wrong

A draft AnA saved from a conversation read "Drafted by AnA in a conversation · model not recorded" in the editor, on
every draft the drafting tool saved, although an approved model had just written it (`01`).

- `draft_authoring_document` runs mid-turn and names its run (`stream.ts` passes `turnId: runId`).
- The model on a drafted document comes from the turn's record, by design (`authoring-from-draft.ts` `governedWriteOf`).
- The turn's record is filed when the turn ends (`stream.ts` `fileTurnRecord`). So at the create, the run names no
  record, and the stored verdict is `governedWrite: 'unverified'`, "not a record id", with no model.
- Nothing resolved it later. The code's own comment expected this only for "a turn whose record was never filed (a
  failed turn)".
- The existing test files the turn's record first and creates the document second, which no live turn does.

## What already exists

- `server/services/authoring/authoring-record.ts` `servedModelsForTurnOrRun`: resolves a record id, or a run that names
  exactly one record, to the models that served the turn, each with RULE 2's verdict. Unchanged.
- `server/services/authoring/authoring-from-draft.ts` `governedWriteOf` and `readDocumentProvenance`: the verdict at the
  create, and the one read of a document's provenance (`authoring-document-read.ts` `readAuthoringDocument`).
- `client/src/concept2cure/v2/editor/provenance.ts` `describeProvenance`: draws the line from `provenance.model`.
  Unchanged.
- `server/routes/__tests__/authoringFromDraftProvenance.pglite.integration.test.ts`: the provenance cases, on real DDL.

## The fix

`readDocumentProvenance` now resolves the verdict for a reader once the run names one filed record: the record's
models, RULE 2's verdict and the record id, marked `resolvedAfterSave`. Nothing is rewritten:

- the stored row and the append-only creation receipts stay as created, saying what was known at the save;
- a run that names no record, or more than one, still reads `unverified`;
- a draft unverified for another reason (an import, a derivative, a record id that does not resolve) is not touched.

## Proof

| Check | Result |
|---|---|
| New case, live order: create with the run, read, file the record, read again | Red before the fix: the second read still had no model. Green after: `governedWrite: 'allowed'`, `model: 'claude-opus-5-5'`, the record id, `resolvedAfterSave` |
| New case: a run naming two records | Still `unverified`, no model |
| The stored row after resolution | Unchanged: `unverified`, the run |
| The provenance suite | 13 of 13 |
| Eight authoring and drafting suites that read or create drafts | 166 of 166 |
| Running app, real server and database, provider stood in (`walk-ana-prov.cjs.txt`) | The editor and the card read "model claude-opus-5-5" right after the turn (`02`) and after a reload (`03`) |

The walk's one substituted piece is the provider: `mock-anthropic-tools.cjs.txt` answers as the Messages API does when
a model calls a tool. The draft's text is synthetic and says so.

## Not fixed here

- **The release gate reads the creation receipt's reference**, which for these drafts is still the run
  (`governed-machine-claims.ts` `qualifiedMachineGenesis` passes it to `verifyMachineText`, which takes record ids). So
  when a model passes PQ, a draft the tool saved will still be held as unverifiable. No test today releases machine
  text by qualified generation (every case holds it, or a person replaces it), so this cannot be shown failing yet.
  It belongs with the PQ release branch (P-115, P-118): resolve the run there by the same one-record rule.
- **`workflow-import-governance.ts` is held by lane W1** (`COORDINATION.md`), so nothing in it was changed.
