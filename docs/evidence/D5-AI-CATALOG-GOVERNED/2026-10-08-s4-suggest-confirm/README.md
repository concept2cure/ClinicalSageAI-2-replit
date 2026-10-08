# D5 — AnA's catalog record is a suggestion a person confirms (Data Room catalog S4)

Date: 2026-10-08. Launch row: **D5** (Part 11 evidence: an attributed, audited, confirmable AI record).
Design: `docs/design/DATA_ROOM_CATALOG_AND_CLINICAL_DATA_2026-10-08.md`, slice S4.
Founder decision (2026-10-08): "Suggest, person confirms".

## The defect

`catalog_project_document` stored AnA's kind, purpose, summary and key data with
`cataloged_by` = the person whose session it was. Every member's session recall and
every later read then served that text as fact. The write had five gaps:

- It recorded no model, conversation or turn.
- It wrote no audit row.
- It took any kind the model typed. The tool told AnA to write free text such as
  "GLP 28-day rat toxicology study report", so the Vault's evidence-kind vocabulary was
  never applied.
- No screen let a person confirm or correct the record.
- The catalog was off by default.

## The change

- `migrations/20261008e_document_catalog_attribution.sql` adds these columns:
  - `catalog_state` (`suggested` | `confirmed` | `corrected`);
  - `proposed_by`, `proposed_model`, `proposed_thread_id`, `proposed_turn_id`;
  - `confirmed_by`, `confirmed_at`, `correction_reason`.

  The `document_catalog_state_chk` CHECK requires a confirmed record to name who and
  when, and a corrected record to also carry its reason. Every statement is guarded, the
  file has no DROP, and no row is rewritten. A description written before this change
  reads as `suggested` with its proposer "not recorded" (`catalogStateSql`).
- `server/services/vault/document-catalog-governance.service.ts` is the one writer for
  both sides:
  - **AnA's suggestion (`writeCatalogSuggestion`):** writes the agent, model, thread and
    turn, plus a chained `vault.document.catalog_suggest` audit row, in one transaction.
    It refuses to replace a record a person confirmed or corrected.
  - **A person's decision (`reviewCatalogRecord`):**
    - It needs a Vault write role, checked at the route and again in the service, and a
      session actor.
    - The request must name the record revision the person was shown. AnA may
      re-suggest between the read and the click, and that case gets a 409.
    - "Confirm as written" takes no reason. "Correct" requires a reason for change and
      a kind from the vocabulary.
    - Each decision writes a chained `catalog_confirm` or `catalog_correct` row with the
      before and after values, the proposer, the key-data paths and the reason.
  - A new-bytes re-upload clears the description and the decision together
    (`recordExtractionOutcome`).
- `completeCatalog` refuses a kind outside `VAULT_DOC_KINDS` (`filingVocabularyRefusal`,
  the same check placement uses). The tool schema now carries the enum, and its text
  says the record is a suggestion.
- Routes:
  - `GET /api/c2c/project-vault/:id/documents/:documentId/catalog`;
  - `POST …/catalog/confirm`;
  - `POST …/catalog/correct`.

  The `correct` route was added beside the planned `confirm` so that each action has
  its own clear request.
- UI: a **Catalog record** panel in the Vault document detail
  (`client/src/concept2cure/v2/surfaces/VaultCatalogRecord.tsx`).
  - It shows "Suggested by AnA (model) on … UTC", the full key data, and Confirm or
    Correct for a writing role.
  - A reader is told their role cannot decide, and gets no button that would fail.
  - A dropped connection on a write says the outcome is not known.
- Recall (`ana-session-bootstrap-format.ts`) marks each description in one of three ways:
  - "(your suggestion, not yet confirmed by a person)";
  - "(confirmed by a person)";
  - "(corrected by a person)".

  A suggested filing reads "filing suggested, not yet confirmed by a person".
  AnA's read of a document returns the record's `state`.
- The catalog is on by default: `ana.document_catalog` is now created ON
  (`document-catalog-bootstrap.ts`), and the per-upload embedding row
  (`ana.vault_chunking`) stays OFF. Only a missing row takes the default, so an
  existing row, on or off, keeps its state.
- One provenance helper (`anaToolProvenance`, `document-tools-shared.ts`) now serves both
  placement and catalog. Before, it was private to placement.

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | `tests/db/document-catalog-governed.dbtest.ts` against trunk's code: 15/15 fail. The kind "Certificate of Analysis" is stored with `ok: true`, there are no attribution columns, and the confirm and correct routes do not exist. |
| `02-green-real-pg.txt` | The governed suite, plus the role, catalog, recall and tenant-isolation catalog suites, on PostgreSQL 16 as `app_service` with `RLS_ENFORCE=on`: 52/52. |
| `03-migrate-twice.txt` | `deploy-migrate.mjs` run twice on the same database (replay is clean). |
| `04-revision-check-removed-red.txt` | With the revision check disabled, the stale confirmation is accepted (200, not 409). This shows the check catches the case it exists for. |

Also run:

- `npx tsc --noEmit -p tsconfig.json`: 0 errors.
- The ESLint ratchet `--since origin/concept2cure-v2`, with the new files included: no
  change.
- `ci:migration-set-order` and `ci:migration-drop-safety`: OK.
- The unit and PGlite suites for vault, ana, startup, c2c routes, schema-contract,
  lineage and the client v2 surfaces.

Reviews:

- The part11-ux-auditor and microcopy-reviewer agents reviewed the panel. Their
  findings were applied:
  - the revision token;
  - all key data is shown;
  - the suggestion is kept beside the decision;
  - the time is shown in UTC;
  - a session actor is required;
  - the buttons are role-gated;
  - a retry button after a failed read;
  - the copy changes.
- Left as noted debt: role-gating in the older Vault panels, which have the same gap as
  this panel had.
