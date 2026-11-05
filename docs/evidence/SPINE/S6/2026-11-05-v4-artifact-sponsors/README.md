# S6 V4 (F1): the organisation's governed artifacts stay inside the open project's sponsor (2026-11-05)

This follows V2 (`../2026-11-05-v2-sponsors/`), which did the same for the Vault's library.

## The defect

The Vault's "Governed artifacts across your projects" (`VaultOrganizationArtifacts.tsx`, `GET /api/artifacts-center`)
lists the governed artifacts of every project the person can open: AnA drafts and Module 3 compiles. It is the page
with no project open, and a section of the Governed artifacts view inside a project.

It named each artifact's project and nothing else. Inside sponsor A's project, it listed sponsor B's artifacts beside
A's. For a CRO, that is one client's work shown inside another client's project, the mixing the founder rules out.

Shown red in `01-red.txt`, the route's PostgreSQL-backed suite with trunk's route and two sponsors:
- every row's sponsor is undefined;
- asked from inside sponsor A's project, the listing returned A's, B's and an unsponsored project's artifacts;
- a project the caller cannot open, or another organisation's, was accepted as the scope (200).

## What already exists

- **Admission.** The listing already admits only the projects the caller can open
  (`getAccessibleReportProjectIds`, `server/routes/artifacts-center-routes.ts`).
- **The read.** It already joins each artifact's project (`readArtifactRegistry`,
  `server/services/artifact-registry-read.ts`). `projects.client_workspace_id` is the project's sponsor.
- **The same rule in the library.** The Vault's library (V2) and the Projects list (`clientWorkspaceId`) already apply
  it.

## What changed

- **The read** joins each artifact's project's client workspace and returns its sponsor.
- **The route:**
  - `sameClientAs=<project>` narrows the projects the caller can open to that project's sponsor's. The sponsor comes
    from the organisation's own project records, never from the request, and the narrowing only removes projects.
  - A project outside them is not found (404). A malformed id is refused (400). A project with two tracking records
    under two sponsors is refused (409).
  - Every row carries `client`, its sponsor or none. A sponsor whose name cannot be read fails the listing.
- **The Vault** asks within the open project's sponsor.
  - Its heading says whose projects it read: "1 governed artifact in the Northwind Diagnostics projects you can open".
  - With no project open, each row names its sponsor ("BX-204 · Northwind Bio").
  - AnA's facts carry the same scope and each artifact's sponsor.

For an organisation without sponsors, nothing changes.

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | `server/routes/__tests__/artifacts-center-accessible-projects.pglite.test.ts` against trunk's route: the 3 new cases fail |
| `02-client-red.txt` | `vaultOrganizationArtifacts.test.tsx`'s 2 new cases against trunk's components: both fail |
| `03-server-green.txt` | The route suite with the change: 11 of 11 |
| `04-suites.txt` | The Vault suites, the three artifacts-center suites and the AnA wave suites that read the listing: 75 files, 835 tests |
| `inside-biotech.png`, `inside-device.png`, `05-running-app.json` | The running app, with one governed artifact added under each sponsor's project in the local dev database. Inside each project, the listing asks within its sponsor, names it, and lists that sponsor's artifact only, with a clean console. |

One existing case, `vaultOrganizationArtifacts.test.tsx` "reads the listing only when asked", opens the listing inside
a project. It now expects the request within that project's sponsor (`?sameClientAs=`), which is the change.
