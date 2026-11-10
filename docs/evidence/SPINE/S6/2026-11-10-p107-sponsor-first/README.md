# S6, P-107 item 3 (1): the Vault asks which client first (2026-11-10)

Package S6 of `docs/design/ONE_DESIGN_PLAN.md` (Vault at Veeva parity, on the existing Vault), with its F1 repairs. The
decision is P-107 item 3 in `docs/LAUNCH_DEFINITION_OF_DONE.md` (2026-11-08, under the founder's delegation):

> No cross-sponsor library view for a CRO. With no project open, the Vault first asks which sponsor; every view is
> inside one sponsor. Search never spans sponsors.

The product's word for a sponsor is "client" (the Projects filter, a project's Client fact, `client_workspaces`), so the
screens say client.

## The defect

A CRO is one organization working for several clients. Three reads have no project to scope them, and each listed
every client's records together:

1. `GET /api/artifacts-center`, the governed artifacts of the projects a person can open. The Vault page with no
   project open shows it.
2. `GET /api/c2c/project-vault/search`, the library search. The document picker uses it (the company legal library, a
   commitment's fulfilment).
3. The Vault page's own list of projects' Vaults.

S6 V2 and V4 (2026-11-05) narrowed the first two to one client when asked from inside a project, and named each row's
client otherwise. With no project open they still spanned clients.

## What already exists

- **The sponsor of a project.** `projects.client_workspace_id`; a project's verified anchor carries it
  (`verifiedProgramAnchors`, `server/services/c2c/current-program-access.ts`).
- **Narrowing to an open project's sponsor.** `narrowToSponsorOf` (`server/services/artifact-registry-read.ts`), used by
  the listing's `?sameClientAs=` and AnA's reads; `librarySponsors` (`server/routes/c2c/project-vault.ts`) for the
  library's `?sameClientAs=`.
- **The clients of a portfolio.** `GET /api/c2c/projects` returns each row's `client_workspace_id` and `client_name`,
  and `meta.clients` (`readPortfolioClients`, `server/services/c2c/project-portfolio.ts`). It leaves out archived
  projects by default; the accessible scope the Vault's reads use does not. So the page cannot decide from that list
  alone whether a person's projects span clients.
- **The page with no project open.** `ProjectVaults` and the organization view in
  `client/src/concept2cure/v2/surfaces/Vault.tsx`, `VaultOrganizationArtifacts.tsx`.
- **The picker.** `VaultVersionPicker` (`client/src/concept2cure/v2/surfaces/VaultLibraryResults.tsx`).
- **A refusal's code on the client.** `useLiveData` / `useLiveRows` (`client/src/concept2cure/v2/dataConnect.tsx`) pass
  a failed read's status and code. They dropped the error body, so a refusal could not carry anything else.

- **Choosing a client elsewhere.** The Projects page filters by client (`ProjectClientFilter.tsx`, "All clients"), and
  its New project form asks for a client workspace (`Projects.tsx`, "Choose a client workspace"). Neither scopes the
  Vault.

Searches run: `sameClientAs`, `clientWorkspaceId`, `client_workspace_id`, `CLIENT_`, `narrowToSponsor`,
`project-vault/search`, `artifacts-center` over `server`, `client/src` and `tests`; `Choose a client`,
`ClientChooser`, `SponsorChooser`, `client-choice` over `client/src`. No chooser of a client existed in the Vault.
`git log --all --diff-filter=D` on `*ClientChoice*`, `*Sponsor*`, `*ClientPicker*`, `*ClientSwitch*`,
`*SponsorPicker*` found no deleted file.

## What changed

**Server (F1).** One rule, in `server/services/artifact-registry-read.ts`, for both reads:

- `askedSponsorScope(query, what)` reads how a request scopes itself: `sameClientAs` (the open project), `client` (a
  client id, or `none` for the projects with no client), or neither. Both together, or a malformed one, is a 400.
- `narrowToOneSponsor` (the listing) and `librarySponsors` (the library search): projects of one client need no
  choice. Projects of more than one, with no client asked for, are refused: `409 CLIENT_REQUIRED`, and nothing is
  read. With a client asked for, only its projects are read. A client none of whose projects the caller can open is
  `404 CLIENT_NOT_FOUND`, as one that does not exist is.
- `sponsorRefusal` is the one response for those refusals. The clients to choose from are in the envelope's `meta`
  (`meta.clients`, by name, `null` last for "no client").
- The library search with `programId` named needs no choice when those projects are one client's.

**Client.**

- `dataConnect.tsx` (F1): a refusal's own `meta` reaches the screen that asked, as a success's does.
- `VaultProjectChoice.tsx` (S6, split out of `Vault.tsx`): the page with no project open. When the listing is refused
  with `CLIENT_REQUIRED`, or the project list itself spans clients, it asks which client and shows nothing of any
  client. Once chosen, the projects' Vaults and the governed artifacts are that client's (`?client=`), and "Change
  client" asks again. A person whose projects are one client's sees the page as before.
- `VaultLibraryResults.tsx` (S6): the picker asks which client when its search is refused, then searches that
  client's Vaults only.
- AnA's context for the page says the Vault is asking which client, not that a read failed.
- `paletteProjects.ts` (F1): a listed project carries its client.

**A repair found by using the page (F1).** In the governed artifacts listing, an artifact's name was not visible at
1440px: its cell could not wrap, and the name was the only part that could shrink
(`client/src/concept2cure/v2/styles/misc-surfaces-v2.css`). The name now wraps, with its kind and governance beneath.

## Evidence

| File | What it shows |
|---|---|
| `01-red-artifacts.txt` | The listing's cases on trunk: 4 of 15 fail (it listed every client's artifacts). |
| `01-red-library.txt` | The library search's cases on trunk, real PostgreSQL with RLS on: 4 of 9 fail. |
| `02-green-library.txt` | The same 9 after the change. |
| `03-red-client.txt` | The page's cases with the client question taken out: 5 of 7 fail. |
| `04-green-suites.txt` | 13 server and client files, 180 tests; 3 database suites, 61 tests; 102 client files. |
| `running-app-choose-a-client.png` | The Vault with no project open, signed in as a person with two clients' projects. |
| `running-app-one-client.png` | After choosing a client: its two projects and its 21 governed artifacts, names readable. |
| `running-app-picker-asks.png` | The company legal library's picker, asked to search with no client chosen. |

Opened and used in the running app (local server, seeded demo, a second client added and one project moved to it):
the chooser listed both clients and no project or artifact; each client showed only its own projects and artifacts;
"Change client" returned to the question; a project opened from the list showed its Vault; the picker asked which
client, then found the one matching document in the chosen client's Vault.

## What is not done

- **The shell's rail still lists recent projects of every client** under Recents. It is the person's own navigation,
  as the Projects page is, and not a Vault view; whether it should follow a chosen client is a product decision.
- **AnA with no project open** (`resolveProjectReadScope`) and the reads beside the Vault (evidence retrieval,
  `mdx-search`, the governed-documents list, the MCP tools) still span the clients a person can open. They are the
  next stage of this decision and are not started.
- The chosen client is kept for the visit to the page, not across visits.
