# S4 · Anna runtime Phase 0, check 1: one run from a child's report to a filed record (2026-11-12)

Owner: `session_01KZK3jgtmQBgNepqLjXjS3k` (P-105). Plan §1d, expanded spike, check 1 (§14.4): independent verification
and decision rights. This closes the S4 test-only item the joined run of 2026-11-09 left open
(`../2026-11-09-spike-joined-run/README.md`): "No single test runs child check → parent merge → lock end to end."

**Verdict for check 1: the links are now joined in one run, up to a filed record. A signature is not in the join.
Phase 0 as a whole stays "acceptance pending".**

## What already exists

Every link was already built and already proven on a fixture of its own. Nothing in the product changed here.

| Link | Where | Proven before by |
|---|---|---|
| A parent assigns work, a worker reports, the parent decides; each is an audited event | `server/services/ana/run-events.ts` `openRunCoordination` | `turn-plan-and-context.test.ts`, `run-coordination-dispositions.test.ts` |
| A verify agent's deterministic comparison of a draft against stored sources | `server/services/ana/sub-agent-result.ts` `compareStoredSourceClaims` | `sub-agent-verifiers.test.ts` |
| A child may only read | `server/services/ana/AnaToolExecutor.ts` `preHandlerRefusal` (rule 0) | `tool-authorization-rule-zero.test.ts` |
| An AnA draft becomes a document through one write, which records where it came from | `server/services/authoring/authoring-from-draft.ts`, `POST /api/authoring/docs/from-draft` | `authoringFromDraftProvenance.pglite.integration.test.ts` |
| Machine text is held until a person's replacement and a current independent check | `server/services/authoring/workflow-import-governance.ts` `assertWorkflowImportRelease` | `_authoring-canvas-fixture.ts` `releaseAnaDraft` and its acceptance cases |
| The filing: rendered, hashed, admitted to the Vault, one governed action in the tenant's chain | `POST /api/authoring/docs/:docId/file-to-vault` | `authoringFileToVault.pglite.integration.test.ts` |

## What was added

- `server/routes/__tests__/anaChildReportToFiledRecord.pglite.integration.test.ts`: one case, one database, one run.
- `server/services/ana/__tests__/support/coordination-fixture.ts`: `setupCoordinationFixture` can join another
  store's DDL and migrations to its database, and `subject` can be given a run id shaped like production's
  (`run_…`). The two suites that already use the fixture still pass (35 of 35).

## What the case does, in order

1. A drafter and a verifier are assigned as distinct workers. The drafter reports a draft that says 999 patients
   were randomized. The recorded study says 300.
2. The verifier's check is the real comparison. It answers `fail`, `NUMERIC_SOURCE_CONTRADICTION`. The parent rejects
   the draft, bound to that report's event and hash.
3. A new drafter reports a corrected draft. The same check finds nothing to reject, and answers `see_result`, not
   "verified". The parent accepts it **as a proposal**.
4. Acceptance wrote no document: the count of documents is still 0.
5. A child holding a confirmation and an approved model calls `draft_authoring_document`, `save_document_to_vault`
   and `commit_document_revision`. Each is refused `SUB_AGENT_READ_ONLY`. The count is still 0.
6. The person makes the merge: `POST /docs/from-draft` with exactly the accepted sections, naming the run. The stored
   sections hash to the accepted report's hash.
7. The turn's record is filed. The document then names `claude-opus-5-5` to a reader. Filing it is refused: 409
   `INDEPENDENT_CHECK_REQUIRED`, and nothing reached storage.
8. The person replaces the machine text and runs the saved-document checks. Filing then succeeds: 201, and the Vault
   row's hash is the SHA-256 of the bytes that went to storage.
9. From the audit alone:
   - the run's ledger reads `assigned, assigned, report, report, disposition, assigned, report, disposition`, each
     decision naming its worker, the decision and the exact report (event id and hash);
   - neither reason, and neither draft's text, is in it;
   - the document's trail reads `CREATE`, `UPDATE`, `INDEPENDENT_CHECK_RECORDED`, `EXPORT`, in that order, all by the
     author; its creation receipts name the run and say `unverified`, which is what was known at the save;
   - in the tenant's one chain, the acceptance comes before the single `authoring.document.file_to_vault` action.

## Shown failing

Each mutation was made to the test, run, and removed.

| Mutation | Result |
|---|---|
| Nobody releases the draft (step 8's replacement and checks removed) | The filing answers 409 `INDEPENDENT_CHECK_REQUIRED`; the case fails |
| The child is treated as the parent (`agentDepth: 0`) | `draft_authoring_document` runs instead of refusing; the case fails |
| The first draft states the recorded figure | The check answers `see_result`, not `fail`; the case fails |

Run: `npx vitest run server/routes/__tests__/anaChildReportToFiledRecord.pglite.integration.test.ts`, 1 of 1
(`run.txt`).

## What is real, and what is not

- **Real:** the coordination host and its audit chain, the comparison, the tool gate, the authoring router, the
  release gate, the independent checks, the ingest and the placement, on PGlite with the repository's own migrations.
- **Replaced:** what leaves the process: storage, OCR, the Word-to-PDF engine, and the catalog and chunking toggles.
  The same replacements as `authoringFileToVault.pglite.integration.test.ts`.
- **No model is called.** The two drafts are fixed text. The comparison is exact matching of framed figures, which
  does not establish that a source supports a sentence.

## Still open for check 1

- **A signature is not joined.** The record filed here is a released draft, not a frozen or approved one. The seal is
  proven by `authoringFileToVaultApprovalCarry.pglite.integration.test.ts` and the signing routes' suites, on their
  own fixtures. Joining it needs the signing ceremony (authority, password re-entry) in this fixture.
- **The merge is a person's request, not AnA's tool call.** At depth 0 the drafting tool asks the person to confirm
  and then makes the same write; that path is walked in the running app
  (`../2026-11-09-claude-path-walk/`, `09`), not in this case.
- **What reaches the filing is the person's text.** No model has passed PQ, so no machine text can be released by
  qualified generation. When one does, the release gate must resolve a tool-saved draft's run to its record
  (`../2026-11-12-draft-model-recorded/README.md`, "Not fixed here").
- **There is no clock-mutation tool to test,** as on 2026-11-09.
