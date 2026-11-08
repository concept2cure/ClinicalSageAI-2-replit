# S6 V3: the server refuses a relationship across sponsors (2026-11-05)

This follows V2 (`../2026-11-05-v2-sponsors/`). V2 scoped the relationship finder to the document's sponsor. But the
write itself, `POST /api/c2c/project-vault/:id/documents/:documentId/relationships`, still recorded a relationship to
a document of another sponsor's project whenever that document's id was sent. That would put one client's document
into another client's record. In a CRO, that is the mixing the founder rules out (*"without mixing sponsor data or
permissions"*).

## What already exists

- **The write** is `addRelationship` (`server/services/vault/vault-relationships.ts`). It already admits both
  documents' projects through `requireCurrentProgramAccess`.
- **The sponsor** is that admission's result, which already carries each project's `clientWorkspaceId`, the sponsor
  recorded on its verified anchor (`server/services/c2c/current-program-access.ts`).
- **The finder** (`VaultRelationships.tsx`) searches within the sponsor since V2.

Searches run: `addRelationship` and `vault_document_relationships` over `server`. The only other `addRelationship` is
the evidence spine's (`clinical-regulatory-evidence/evidence-spine.service.ts`), a different record.

## What changed

`addRelationship` compares the two admitted projects' sponsors. When they differ, it refuses with 409 `OTHER_CLIENT`:
*"That document belongs to another client's project. A document is related only to documents of its own client's
projects."* It does this before anything is written. The rule is unchanged for an organisation without sponsors, and
for one sponsor's projects. Removing a relationship that already exists is unchanged, so an old one can still be
removed.

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | `tests/db/vault-document-relationships.dbtest.ts` with trunk's service, on real PostgreSQL as `app_service`: a relationship to another sponsor's document is recorded (201). The case is 1 of 10 to fail. |
| `02-green.txt` | With the change, the relationships, library and parent-access suites: 59 of 59 |

**The fixture is changed.** The suite's fixture gave every program its own client workspace, so its case "relates to
a version in another project of the organisation" was relating across two sponsors. That case keeps its intent, two
projects of one sponsor: the second program is moved under the first's workspace, as a sponsor's projects share one. A
third program under its own sponsor carries the refused case.

`vaultRelationships.test.tsx` (10 of 10) still says a refused relate in the server's words and claims nothing.
