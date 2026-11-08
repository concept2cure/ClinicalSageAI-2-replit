# S6 V2 (F1): a CRO's sponsors never mix in one Vault list (2026-11-05)

A repair of shipped behaviour (package F1), found while bringing the Vault onto the founder's statement of
2026-11-05:

> "For CROs, that also means working across authorized sponsor projects without mixing sponsor data or permissions.
> One platform and one catalog architecture do not mean unrestricted sharing across clients."

## The defect

A CRO is one organisation working for several sponsors. Each sponsor is a client workspace (`client_workspaces`, "For
CRO use case: different clients", `shared/schema.ts`), and each project names its sponsor
(`projects.client_workspace_id`).

The Vault's library search (`GET /api/c2c/project-vault/search`, "All my projects") read every project the person can
use in the organisation (`getCurrentAccessibleProgramScope`). It had no sponsor in its filter, and each hit named its
project only. So a consultant working in sponsor A's project, searching all their projects, got sponsor B's documents
in the same list, with nothing saying they were another client's.

The relationship finder in a document's record read the same library. So it offered to link one sponsor's document
to another's.

Shown on real PostgreSQL as the runtime role (`01-red-on-trunk-route.txt`), with trunk's route and two projects under
two sponsors:
- asked from sponsor A's project, the library returned 2 hits, A's and B's;
- no hit named its sponsor;
- another organisation's project was accepted as the scope (200, not 404).

## What already exists

- **The sponsor of each accessible project.** `verifiedProgramAnchors` (`server/services/c2c/current-program-access.ts`)
  returns the accepted anchors with their `clientWorkspaceId`. It is kept with the verified scope and cannot be
  forged.
- **The Projects list already filters by sponsor.** `GET /api/c2c/projects?clientWorkspaceId=`
  (`server/routes/c2c/projects.ts:596`, `portfolioClientFilter`) narrows the verified anchors and never widens them.
  `readPortfolioClients` names the sponsors (`server/services/c2c/project-portfolio.ts`).
- **The library already narrows by project.** `programId` filters (`parseLibrarySearchFilters`) narrow the verified
  set and never widen it.
- **The open sponsor gap was already recorded.** `docs/design/CLIENT_JOURNEY_2026-10-25.md`, row 10: *"a consultancy
  filters its projects by sponsor client … Sponsor filter open"*.

Searches run: `client_workspace`, `clientWorkspaceId`, `sponsor`, `CRO`, `verifiedProgramAnchors`,
`readPortfolioClients`, `project-vault/search` over `server`, `client/src`, `shared` and `docs/design`.

## What changed

- **Server** (`server/routes/c2c/project-vault.ts`, `librarySponsors`):
  - `sameClientAs=<project>` narrows the library to the projects of that project's sponsor.
  - The sponsor is read from the project's own verified anchor, never from the request. The narrowing only removes
    projects from the verified accessible set.
  - A project outside that set is not found (404). A malformed id is refused (400).
  - Every hit names its sponsor, or none when its project has none. The response names the sponsor it was narrowed
    to. A sponsor whose name cannot be read fails the search; it is never shown as "none".
- **The Vault library** (`VaultLibraryResults.tsx`):
  - From inside a project, it asks within that project's sponsor, and the headline says so ("3 documents in
    Northwind Diagnostics projects you can access match "summary"").
  - Across every project (no project open), each row names its sponsor.
  - The headline's "1 document … match" becomes "matches".
- **The relationship finder** (`VaultRelationships.tsx`) searches within the document's project's sponsor.

For an organisation without sponsors, nothing changes: every project has the same sponsor, or none.

## Evidence

| File | What it shows |
|---|---|
| `01-red-on-trunk-route.txt` | `tests/db/vault-library-search.dbtest.ts` with trunk's route on real PostgreSQL as `app_service` with RLS: the 3 new cases fail |
| `02-green.txt` | The same suite with the change: 7 of 7 |
| `03-client-red-on-trunk.txt` | `vaultLibrarySearch.test.tsx` with trunk's `VaultLibraryResults.tsx`: 3 fail. With the change, 9 of 9 |
| `04-vault-suites.txt` | The 70 Vault suites (794 tests), and both real-PostgreSQL suites that read the library route (49 tests), with the change |
| `sponsor-a-inside-biotech.png`, `sponsor-b-inside-device.png`, `05-running-app.json` | The running app, with a second sponsor added in the local dev database and the device project moved to it. Inside the biotech project, "All my projects" lists only Concept2Cure Therapeutics projects. Inside the device project, it lists only Northwind Diagnostics projects. Each request carries `sameClientAs`, with a clean console and no failed request. |

## Not done here

- **Creating a relationship across sponsors is not yet refused by the server.** Only its finder is scoped. The write
  (`POST …/relationships`) still accepts a target in another sponsor's project when its id is sent. That is the next
  slice.
- **The organisation's governed artifacts** (`VaultOrganizationArtifacts.tsx`, `GET /api/artifacts-center`) list
  every accessible project's artifacts, and name no sponsor.
- **The version picker** (`VaultVersionPicker`) searches the library when it has no project. Its callers are
  Company documents, which belong to the organisation, and Commitment fulfilment, when the commitment has no project.
- **A project with no sponsor in a CRO** keeps the generic headline, "projects you can access", although its library
  is the projects with no sponsor.
