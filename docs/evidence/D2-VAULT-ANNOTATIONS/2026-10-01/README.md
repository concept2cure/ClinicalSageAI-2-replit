# Review annotations on a Vault version (rows D2 and D5)

**Plan item:** critique 15 of `docs/design/VAULT_VEEVA_PARITY_PLAN_2026-09-24.md` §4. **Date:** 2026-10-01.
**Founder decision:** none needed to ship. FD13 (added to §5) asks whether open annotations should ever block
an approval. Until it is answered, the dialogs show them and nothing blocks.

## The finding

A Veeva reviewer annotates the version under review, others reply, and the annotation is resolved; the
annotations are part of that version's record. This Vault had no way to comment on a version at all. The
five comment stores in the repository are keyed to authoring artifacts (`artifact_id`, `project_id`
integer NOT NULL) and lack the guards a review record needs. One of them can be deleted by the runtime
role from a trigger of its own (`docs/evidence/D5/2026-10-01-trigger-depth-bypass/`). None of them could
be extended without duplicating or weakening it.

The design work also found a hole in today's `vault_document_relationships`. Its delete guard admitted
any DELETE by the table's owner, and a foreign key's cascade runs as that owner. So a runtime-role
`DELETE FROM regulatory_programs` erased a program's relationships while both of its versions survived.

## The change

| Piece | File |
|---|---|
| **The record.** `public.vault_version_annotations`, org-keyed in `public` (Rule 1) and policied and forced by the sweep. The database re-checks every post, not only the writer: the version is live and is the program's and the organisation's; the content hash; the body's SHA-256; a passage at its position in the stored text, counted in characters (code points), with that text's SHA-256; a page against the recorded page count; a reply under an open root of the same version; a post is open. Words, anchor, author and time are frozen. The outcome (resolution or retraction) is write-once, there is only one, and only the author retracts. DELETE is admitted only to the owner, and only once the version is gone. It never reads `pg_trigger_depth()`. TRUNCATE is refused. It replays without DROP. | `migrations/20261001_vault_version_annotations.sql`, `scripts/db/migration-set.mjs` |
| **Relationships, amended in place** (Rule 1, dated note). Its delete guard now also requires either end's version to be gone. Only the function body changes. | `migrations/20261001_vault_document_relationships.sql` |
| **The writer.** List (across the version family, with each version's open counts), post, reply, resolve (with a note; it can name the version of the document that addressed it) and retract (by the author, with a reason). Each act is one transaction with one chained row on the version, carrying the words, their SHA-256 and the person's name. A text read for quoting is a chained row too, or nothing is served (`AUDIT_WRITE_FAILED`). | `server/services/vault/vault-annotations.ts`, `-core.ts`, `-post.ts`, `-thread.ts` |
| **One transaction helper.** A refusal decided inside a transaction rolls it back through the canonical `transaction()`. The relationships service moves onto it and loses its private copy (zero duplication). | `server/services/vault/vault-refusal.ts`, `vault-relationships.ts` |
| **Routes.** `GET /:id/documents/:documentId/annotations`, `GET …/text?from&length`, and `POST …/annotations`, `/:id/annotations/:annotationId/{replies,resolve,retract}`. The writes sit behind `requireEditorAccess`, and the service checks the role again. A refusal from the record is 409 `ANNOTATION_REFUSED`; it is never an empty list or a 500 that reads as success. | `server/routes/c2c/project-vault.ts` |
| **The history window.** A document's history was silently capped at 200 rows. It now asks for one more row and says `truncated`, and the pane says "Only the newest 200 entries are shown. Older entries exist and are not shown here." | `project-vault.ts` (`readFamilyHistory`), `client/.../Vault.tsx` |
| **The Vault.** A "Review annotations" section in the detail pane offers: an Open/Resolved/Retracted filter; per-version open counts; anchors shown as "Whole document", "Page 2 of 3" or the quoted passage; stale-anchor notes; replies; resolve with a note and an optional addressing version; and retract, for the author only. A passage is selected from the text as read, in windows of 200,000 characters. The Sign review and Approve dialogs say which annotations were open on every version when they opened, and that signing does not resolve them. A failed read is said as such. | `client/.../VaultAnnotations.tsx`, `VaultLifecycle.tsx`, `VaultVersions.tsx` |
| URS-VAULT-021, OQ-VAULT-22 (in its own step module), RA-001 v0.20, TM-001 rebuilt; FD13 and a §6 exclusion for annotation drawn on a rendered page | `docs/validation/`, `tests/validation/oq/vault/steps-annotations.mjs`, `tests/validation/lib/fixtures.mjs` (`ingestText`) |

## Verified by making it fail

| Check | Red | Green |
|---|---|---|
| `tests/db/vault-version-annotations.dbtest.ts`: PostgreSQL as `app_service` with RLS on, through the real routes | `red/db-annotations-on-trunk.txt`: 11 of 11 fail on trunk's code and schema | `green/db-annotations.txt` (with the record suite): 11 of 11. The three anchors are posted and listed with open counts. Each post is a chained row with its words and SHA-256. A passage is counted in code points: its UTF-16 offset is 409 `QUOTE_MISMATCH`. Refused: page 4 of 3, a page on a text file, a passage on a version with no text, a stale text hash, an unknown kind and an empty body. The text is read in character windows (`𝛼` at character 10), and each read is recorded. Replies work, and a nested reply is refused. Resolution needs a note, may name a version of the family (another document's version is refused), and happens once; a reply after it is refused. Only the author retracts, with a reason, and the words stay. A viewer is refused at the route and at the service. Another organisation reads nothing and changes nothing. A changed text or page count reads as not current, and the quote stays. |
| `tests/db/vault-version-annotations-record.dbtest.ts`: the record's own guards | `red/db-record-on-trunk.txt`: cannot start on trunk (its fixture posts through the new route). Each guard's red is its mutant below. | 9 of 9. A direct well-formed post is admitted, as the control. Refused at the record: another organisation, program or byte content; a body hash for other words; a passage off by one; a stale text hash; a page beyond the count; a page count that differs; a page on a version without one; a reply under a resolved or another document's annotation; a closed post; a deleted version. Changes to body, author, organisation and kind are refused, as are a second resolution note, a non-author retraction and retracting a resolved one. DELETE is refused, including a DELETE from a trigger `app_service` made itself; the owner's DELETE while the version exists is refused; TRUNCATE is refused. A runtime-role program DELETE is refused for annotations and for relationships, and both survive. The tenant purge removes the organisation's annotations and keeps others'; the table's owner is `vault.documents`' owner. The history cuts at 200 entries and says so; a short history says nothing is cut. |
| Mutants, each applied, run, then reverted (`red/mutants/`) | 15 server mutants, each caught by its case: M01 the organisation clause; M02 the delete guard on `pg_trigger_depth()`; M03 the body not frozen; M04 the resolution not write-once; M05 TRUNCATE admitted; M07 the service without its role check; M08 an unaudited reply; M10 an owner DELETE without the version check; M11 the body hash unchecked; M12 anyone retracts; M13 the page unchecked; M14 a reply under a closed root; M15 a silent history window; M16 an unaudited text read; MR1 the relationships guard as it was on trunk. Client mutants are listed below. | — |
| `client/.../__tests__/vaultAnnotations.test.tsx` | Client mutants: success before the server's 2xx; no alert on a failed read; UTF-16 offsets; a form kept open after success. Each turns its case red. | `green/client-annotations.txt`: 16 of 16 |
| `client/.../__tests__/vaultSignOffAnnotations.test.tsx` | `red/client-signoff-on-trunk.txt`: 2 of 2 fail with trunk's `VaultLifecycle.tsx` | `green/client-signoff.txt`: 2 of 2. The approval dialog names what was open on each version, and Approve stays enabled. A failed read says so, and is never "none open". |
| Every Vault client suite (23 files, including the lifecycle suite this change did not edit) | — | `green/client-vault-suites.txt`: 145 of 145 |
| Vault DB suites: annotations, relationships, where-used, fixity, archives | — | 6 files, 44 tests |

`green/migrate-twice.txt` shows two `deploy-migrate` runs. Each applied both files, and the sweep
policied the new table on the first run only. Afterwards row security is on and forced, and the policy
and four triggers are present.

`green/gates.txt` lists every gate. All pass except `ci:launch-scope-api`, which fails on
`client/src/concept2cure/v2/surfaces/GatewayAccountsSetting.tsx` (`723395ed4`, another lane, untouched
here). `ci:tenant-isolation` now also lists `vault_version_annotations` and `vault_document_relationships`.
Listing them found two writes without an organisation predicate, the relationships removal UPDATE among
them, and both now carry one. `tsc` is clean.

Lint: every changed file has the same counts as on trunk, and every new file has none.

The full DB tier is in `green/db-tier.txt`: 1517 of 1517.

## Limits, stated

- **A passage names no page.** It is anchored to the stored text, which carries no page boundaries. A
  page anchor is checked against the recorded page count only.
- **No re-anchoring.** When a version's text or page count changes, the annotation says so and keeps the
  quote as the reviewer saw it.
- **Approval is not refused for open annotations.** That is FD13's question.
- **OQ-VAULT-22 is written but not executed.** It runs with OQ-002 in W3. The author-only retraction
  needs a second identity, and the DB suite covers it.
- **Not built.** The plan's design proposed one further case: an approval with an open change request,
  through the real signing ceremony. Approval code is not touched by this change, so nothing new can make
  that case fail. FD13 records the question instead.
