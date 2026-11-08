# Fresh local runtime and CSR preparation

The corrected real `npm run dev` starts the existing application on port 5000.
At 20:16:30 UTC, `/api/version` returned
`c50f8782ad8ef622872578ae4fae41e14d18caa1`, matching the published source HEAD.
The actual database role is `app_service`, with `rolsuper=false` and
`rolbypassrls=false`. Ana Author's dev-login returns 200. The frozen public-CDISC
CSR study survived the application restart and remained readable through its
authenticated API.

`npm-dev-final-receipt.json` records those observations. Readiness is honestly
HTTP 503: database, schema and storage are `ok`; AnA is `no_provider`/down.
Redis, worker and virus-scan dependencies are skipped in this local runtime.
No model-backed drafting or complete production readiness is claimed.

## Original startup failure and repaired command

`npm-dev-startup-red.log.gz` and its JSON status preserve the actual Node
22.23.4 failure: the Codespace doctor verified database/runtime prerequisites,
then `bash -lc` could not find `tsx` and exited 127. An explicit Node/tsx entry
was used temporarily to prepare the disposable demo; its separate
`manual-entry-serving-status.json` is diagnostic evidence, not proof of the
original npm command.

After the startup fix was pushed, that fallback was stopped gracefully and the
actual `npm run dev` command was launched against the same persisted database.
`npm-dev-startup-green.log.gz` records its successful preflight and listening
server. The final receipt records the exact served commit, actual runtime role,
login and dependency outcomes. No startup check or permission gate was bypassed.

## Fresh database, credential split and public inputs

This uses a separate disposable PostgreSQL 16.15/pgvector container on loopback
port 55433. The earlier narrow native-test database on 55432 was preserved.
The existing `npm run db:provision` path installed the full schema and verified
its readiness contract as the separate non-owner runtime role: all 19 authoring
tables, 27/27 readable contract relations and 1328/1328 relations with the
expected grant recipe. The final app-role contract is saved in
`full-provision-final-contract.log.gz`.

The host lacked psql. The actual PostgreSQL 16 client executable was copied
from the disposable image, and the canonical provisioning scripts ran it; no
SQL interpreter or installer step was mocked. Existing Codespace account
helpers created seven fictional people. Random local credentials and application
secrets stay in private files outside Git. Only runtime configuration was passed
to the app; owner/maintenance connection variable names were removed.

The existing public-CDISC fetcher downloaded its ten inputs outside the
repository, using the configured HTTPS proxy and CA trust. Every file matched
its pinned SHA-256. `public-cdisc-inputs-status.json` contains only names, sizes,
hashes and attribution/source metadata. No study row, raw input or screenshot
was copied into Git.

## Actual CSR preparation through frozen study data

The existing CSR lifecycle scripts were copied byte-for-byte outside the
repository so their logs and screenshots stayed outside Git. Their source
hashes are recorded. The run explicitly stopped at `freeze`, before drafting.
`csr-prepare-status.json` records all six passing steps at 20:09:04 UTC:

1. Create/find the project through New project.
2. Upload the study inputs and manifest through the actual Vault API.
3. Send, review-sign and approve all seven selected files using three distinct
   fictional people and the actual password-bearing signature ceremony.
4. Find exactly one CSR entry under M5 in New document.
5. Create the CSR in the existing shared editor and reach its study-data action.
6. Preview the clinical tables and freeze the selected data in that document.

The program is `d8e5065c-c55a-43de-9879-cdaa7c230cde`; the document is
`7a430471-3692-4575-a1ff-1abe010210fc`. After the real npm restart, the
authenticated study-data read returned 200 and the same frozen study-data ID.
These are local demo records and synthetic authenticated identities, not a
deployed identity or real-person approval qualification.

## Other seeded demo data

The post-seed RBM subject-import gap was subsequently repaired through its
existing creator migration. `rbm-subject-import-red.json` preserves the original
500/42P10 and missing-index catalog. `rbm-subject-import-green.json` records
exact-file isolated replay, two owner replays on the disposable live database,
valid/ready/immediate/nonpartial three-column uniqueness with NULL-distinct
semantics, actual fixture intake 201 and read 200, and same-identity upsert 201
with 12 stable profile rows and zero duplicate triples. The actual runtime is
non-owner `app_service` with ENABLE and FORCE RLS. No subject values were
exported. A catalog-only receipt query initially used an ambiguous `oid`; that
diagnostic was corrected separately after all HTTP checks had passed.

The existing all-pack API seeder covers biotech, MDX and Lumen, excluding the
dedicated Faux tenant by design. Its bounded final status is recorded in
`bulk-seed-status.json`; full logs and manifests remain outside Git. Its own
`seeded_unqualified` result is not converted into browser qualification. Optional
signer steps and unavailable provider work retain their actual not-executed
states; incomplete demo submissions are not described as cleared for dispatch.

Run seeding and browser preparation serially: they share the normal IP rate
limit. A fresh dev-login for the same person also ends the previous session;
after startup qualification the old bulk session correctly returned
`SESSION_ENDED`. The existing idempotent seeder was relaunched with a fresh
session and 750ms normal request pacing, preserving previously created records.
No database reset, limiter change or direct data injection was used.

The running app, database, downloaded inputs and private credentials are local
execution state. The published startup change is reusable by a fresh Codespace;
this receipt does not publish a hosted deployment or AI credential. Root owns
the separate final GUI walk. `SHA256SUMS` covers the bounded evidence files.
