# D5: the Vault says who filed a document, and when (Part 11 review F4, 2026-10-29)

The Part 11 review of the Vault uploader (`docs/evidence/D2-VAULT-UPLOAD-METADATA/2026-10-22/README.md`) recorded F4: "Who filed a document, and when, is stored but not shown. The read model returns no `placed_by` or `placed_at`." 21 CFR 11.10(e) and ALCOA+'s "attributable" ask for an action's person and time to be shown with the record it changed. The filing block said where a document is filed and not who decided it.

## What already exists

- **The fields are recorded.** `vault.documents.placed_by` and `placed_at` exist since `migrations/20260823_vault_document_placement.sql`, and every filing decision a person makes writes them:
  - at ingest into a chosen folder (`vault-ingest.service.ts`: `placedBy: userId`, "Filed by the uploader at ingest.");
  - on a confirm, move or unfile (`vault-placement.service.ts` `writePlacement`), each under a chained `vault.document.file` audit row.
- **Suggestions name nobody.** A classifier's or AnA's suggestion writes `placed_by` NULL and `placed_at` NULL (D5 placement attribution, 2026-09-24). A check-in inherits its head's filing (`inheritedPlacement`).
- **The read and the display.** The Vault read (`GET /api/c2c/project-vault/:id`, `server/routes/c2c/project-vault.ts`) projects each upload into a `filing` block through `uploadLeaf`. The block carries folder, kind, CTD section, status, confidence and rationale; it already reads `owner_name` through `public.actor_name`, which answers only within the request's organisation. The detail (`Vault.tsx`, `vault-filing-block`) renders Folder, Looks like, CTD section and the rationale.
- **The record history.** `RecordHistory.tsx` lists the chained audit rows, the filing among them, with actor and time. It is a separate list, not the filing block, and it is the trail, not the current state.
- **Recorded-time convention.** The audit ledger shows a recorded time as `YYYY-MM-DD HH:MM` in UTC (`audit-trail-ledger.routes.ts`).
- **Searches:** `placed_by`, `placed_at`, `placedBy`, `placedAt`, `Filed by` across `server/` and `client/src/concept2cure`.
  - The other readers are the legal-hold columns of the same names, on `vault.legal_holds` (`LegalHoldsCard.tsx`, `vault-legal-holds.ts`), and the check-in's inherited placement.
  - No client read the document's fields.
  - Deleted history (`git log --all --diff-filter=D` on `*Filing*`, `*Placement*`, `*Filed*` under `client/src/concept2cure`) finds only `FilingsCatalog.tsx`, the filing-type catalog. Nothing deleted showed a filer.

## The change

- **The read** joins `public.actor_name(d.placed_by)` beside the owner's, and `uploadLeaf` adds `placedBy` (the name), `placedByRecorded` and `placedAt` (ISO) to the filing block.
  - A suggestion has all three empty.
  - A person who is recorded but whose name this organisation cannot read is `placedByRecorded: true` with `placedBy: null`. It is never shown as nobody.
- **The detail** shows "Filed by Fern Filer, 2026-10-29 05:04 UTC" for a filing, and "Unfiled by …" for a person's unfile.
  - A filing that records no person reads "Not recorded".
  - A suggestion has no line, because nobody decided it yet.
  - A server that predates the fields adds nothing.

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | At trunk with the implementation stashed. The read on real PostgreSQL 16 (`RLS_ENFORCE=on`, `app_service`) fails 3/3; the leaf mapper 3/3; the detail 2 of 3 (the suggestion case is already right: nothing is shown). |
| `02-green.txt` | The read on PostgreSQL with the Vault placement, where-used and re-upload suites: 33/33. Every suite under `server/routes/c2c/__tests__` and the Vault surface suites, the editor's Vault search included: 78 files, 879 passed, 0 failed. That run includes the trunk-red fix filed beside this (`../../D2-VAULT-SEARCH/2026-10-29-trunk-red/`), without which three of those cases are red on trunk. |
| `03-mutation.txt` | Four mutations, each caught: the read drops the name; a recorded person whose name cannot be read is reported as nobody; the detail shows no filer; a filing with no person recorded shows nothing. |

`tests/db/vault-where-used.dbtest.ts` is in the green run. The where-used change `dc1f87a6e` (session `011Dpx`) recorded that suite as owed because that session had no PostgreSQL; it passes at current trunk.
