# PF-13 (D5): a project that holds sealed, filed or transmitted records is archived, never deleted

**Founder decision, 2026-09-26:** a project that holds only drafts may be deleted,
with an audit row. A project with any sealed, filed or transmitted record can only
be archived, and its chain stays readable. The decision is recorded in
`docs/design/PROJECT_FIRST_PLAN_2026-09-26.md` §6.

## The defect

`DELETE /api/c2c/projects/:id` soft-deletes the program (`deleted_at = now()`).
Its only guard was "not already deleted". Every placement and resolution of a
Vault leaf requires a live project (the leaf verifier joins
`regulatory_programs … deleted_at IS NULL`). So deleting a project whose filing had
already been transmitted made its Vault leaves stop resolving, and the project's
chain stopped reading from the project.

## The fix (`server/routes/c2c/projects.ts`)

`projectHolds` counts what a project holds. Each count uses the project's recorded
key and is scoped to the caller's organization:

- `transmitted`: transmittals;
- `frozenOrDispatched`: sequences of the project's submissions;
- `filed`: live Vault documents;
- `sealed`: frozen authoring documents.

The counts run under the program's row lock, one savepoint per store. A store this
database does not carry holds nothing, and any other failure propagates. When the
project holds anything, DELETE answers 409 `PROJECT_HOLDS_RECORDS` with the counts
and "Archive it instead", and nothing is written. Archive is unchanged.

## Evidence (the LX-00 founder walk, new `retention` hop)

**`01-red.txt`**: before the guard, the walk's project is deleted although it
holds a transmitted filing and Vault documents. It then cannot be archived.

**`02-green.txt`**: 13 of 13.
- The same DELETE is refused with 409, naming `filed` and `transmitted`, and the
  project stays live.
- It is archived, and `GET /:id/records` still lists its submission and its Vault
  documents.
- A new draft-only project (created through intake with its own spine and its
  scaffold) is deleted, and `c2c.project.delete` is audited.

The c2c routes, the program routes, the Projects client tests and every golden
journey pass: 48 files, 308 tests. No client surface calls DELETE; it is API-only.
