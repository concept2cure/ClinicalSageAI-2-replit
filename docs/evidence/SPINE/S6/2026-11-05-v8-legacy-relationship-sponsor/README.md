# S6 V8: a relationship across sponsors recorded before V3 is named, not hidden (2026-11-05)

This follows V3 (`../2026-11-05-v3-relationship-sponsor/`), where the server began refusing a new relationship between
two sponsors' documents (409 `OTHER_CLIENT`). A relationship recorded before that rule still exists and is still
listed. It read like any other: *"Investigator brochure v2.0 (in NW-110)"*. In a CRO that is one client's record
quietly linked to another's, the mixing the founder rules out (*"without mixing sponsor data or permissions"*).

The relationship is not removed automatically. Removing one is a governed act with a reason, recorded in both
documents' histories, so it is a person's decision. The Vault now says what the relationship is, and the person can
remove it there.

## What already exists

- **The list.** `listRelationships` (`server/services/vault/vault-relationships.ts`) reads both directions of a
  version's live relationships. It is limited to the projects the caller can open (`getCurrentAccessibleProgramScope`).
- **The sponsor.** Each project of that scope has a verified anchor carrying its `clientWorkspaceId`
  (`verifiedProgramAnchors`, `server/services/c2c/current-program-access.ts`). It is the same value V3's
  `addRelationship` compares.
- **The words.** `describeOther` (`client/src/concept2cure/v2/surfaces/VaultRelationships.tsx`) already names the
  other project, and says when a later version exists.
- **Removal.** `removeRelationship` and the row's **Remove**, with a reason (critique 15), are unchanged.

Searches run: `listRelationships`, `describeOther`, `vault_document_relationships`, `OTHER_CLIENT` and
`clientWorkspaceId` over `server` and `client/src/concept2cure`.

## What changed

- **The server.** Each listed relationship's `other` carries `otherClient`. It is true when the other document's
  project has a different sponsor from this project's, compared as `addRelationship` compares them. It reads nothing
  new: the anchors are the scope the list already admitted. A project with no anchor in that scope is not claimed to
  differ.
- **The view.** That row reads: *"Investigator brochure v2.0 (in NW-110, another client's project). It relates two
  clients' records, which the Vault no longer allows; it was recorded before that rule."* **Remove** stays offered.
  An older server, which omits the field, is read as before.

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | Against trunk's service and view: the new real-PostgreSQL case (`tests/db/vault-document-relationships.dbtest.ts`, as `app_service` under RLS) and the new view case (`vaultRelationships.test.tsx`) fail, 1 of 11 each |
| `02-green.txt` | With the change: the relationships and library-search dbtests 18 of 18, and the view suite with every `server/services/vault` unit suite. See the note below. |

The new database case writes the old relationship as the database owner, because the write path now refuses it. It
then relates the same document to a document of its own sponsor's other project. The list names the first as another
client's and the second as not.

**Not this change: `catalog-actor-scope-wrapper.test.ts` (7 cases) fails in `02-green.txt`.** It mocks the pool and
tests `document-catalog-actor-access.ts`, whose imports this change does not touch. It was red on trunk: its mock of
`db/tenantStore` predates `a06ae96c83`, which made `setTenantContextTx` read another export of that module. Fixed in
`81fbd0702b` (`../2026-11-05-catalog-actor-scope-mock/`).
