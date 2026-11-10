# P-107 item 3 (1): the server refuses a read that would span clients (2026-11-10)

Packages F1 (the server rule) and S6 (the picker), of `docs/design/ONE_DESIGN_PLAN.md`. The decision is P-107 item 3
in `docs/LAUNCH_DEFINITION_OF_DONE.md` (2026-11-08, under the founder's delegation):

> No cross-sponsor library view for a CRO. With no project open, the Vault first asks which sponsor; every view is
> inside one sponsor. Search never spans sponsors.

**The Vault page's question is not this folder's.** Another session landed it on trunk first
(`client/src/concept2cure/v2/surfaces/vaultSponsors.ts` and `Vault.tsx`, `47a306700`; evidence in
`docs/evidence/SPINE/S6/2026-11-10/`). This lane had built its own page at the same time and withdrew it before it
reached trunk (`e2c4162ec`), so one implementation stands. This folder is what trunk did not have.

## The defect that remained

Trunk's page asks which sponsor before it reads anything, in the browser. The server still answered a request with no
project across every client:

1. `GET /api/artifacts-center` with no `sameClientAs` listed every client's governed artifacts.
2. `GET /api/c2c/project-vault/search` with no `sameClientAs` searched every client's Vaults. The document picker
   calls it that way (the company legal library, a commitment's fulfilment), so "search never spans sponsors" did
   not hold there, and any other caller of either route could still read across clients.

## What already exists

- **The sponsor of a project.** `projects.client_workspace_id`; a project's verified anchor carries it
  (`verifiedProgramAnchors`, `server/services/c2c/current-program-access.ts`).
- **Narrowing to an open project's sponsor.** `narrowToSponsorOf` (`server/services/artifact-registry-read.ts`) for the
  listing's `?sameClientAs=`; `librarySponsors` (`server/routes/c2c/project-vault.ts`) for the library's.
- **The page's question.** `sponsorGate` (`vaultSponsors.ts`): it reads the sponsors from the project list, asks when
  there is more than one, and then reads the listing by a project of the chosen sponsor (`sameClientAs`).
- **The picker.** `VaultVersionPicker` (`client/src/concept2cure/v2/surfaces/VaultLibraryResults.tsx`). It has no
  project list and no project, and searched the library bare.
- **A refusal's code on the client.** `useLiveData` (`client/src/concept2cure/v2/dataConnect.tsx`) passed a failed
  read's status and code and dropped its body.

Searches run: `sameClientAs`, `clientWorkspaceId`, `client_workspace_id`, `CLIENT_`, `narrowToSponsor`,
`project-vault/search`, `artifacts-center` over `server`, `client/src` and `tests`. `git log --all --diff-filter=D` on
`*ClientChoice*`, `*Sponsor*`, `*ClientPicker*`, `*ClientSwitch*`, `*SponsorPicker*` found no deleted file.

## What changed

**Server (F1, `6dac0b836`).** One rule, in `artifact-registry-read.ts`, for both reads:

- `askedSponsorScope(query, what)` reads how a request scopes itself: `sameClientAs` (a project), `client` (a client
  id, or `none` for the projects with no client), or neither. Both together, or a malformed one, is a 400.
- `narrowToOneSponsor` (the listing) and `librarySponsors` (the library search): projects of one client need no
  choice. Projects of more than one, with nothing asked, are refused before anything is read: `409 CLIENT_REQUIRED`,
  with the clients to choose from in the envelope's `meta` (`null` is "no client"). With a client asked for, only its
  projects are read. A client none of whose projects the caller can open is `404 CLIENT_NOT_FOUND`.
- The library search with `programId` named needs no choice when those projects are one client's.
- `dataConnect.tsx`: a refusal's own `meta` reaches the screen that asked, as a success's does.

The page's own requests are unchanged by it: it always passes a project of the sponsor it shows.

**Client (S6).**

- The picker asks which client when its search is refused, then searches that client's Vaults only, and can change
  client (`VaultLibraryResults.tsx`).
- A listing the server refuses is said as that: "Your projects belong to more than one client. The governed artifacts
  are listed one client at a time", with no retry and no claim that a read failed
  (`VaultOrganizationArtifacts.tsx`). The page meets it only when its project list did not show the second client
  (an archived project). AnA's context says the same.

**A repair found by using the page (F1).** In the governed artifacts listing an artifact's name was not visible at
1440px: its cell could not wrap, and the name was the only part that could shrink
(`client/src/concept2cure/v2/styles/misc-surfaces-v2.css`). It wraps now.

## Evidence

| File | What it shows |
|---|---|
| `01-red-artifacts.txt` | The listing's cases on trunk's server: 4 of 15 fail (it listed every client's artifacts). |
| `01-red-library.txt` | The library search's cases on trunk's server, real PostgreSQL with RLS on: 4 of 9 fail. |
| `02-green-library.txt` | The same 9 after the change. |
| `03-red-client.txt` | The picker's and the refused listing's cases on trunk's client: 3 fail. |
| `04-green-suites.txt` | The merged tree: the server and client suites, and the database suites. |
| `running-app-picker-asks.png` | The company legal library's picker, asked to search with no client chosen. |

## What is not done

- **AnA with no project open** (`resolveProjectReadScope`) and the reads beside the Vault (evidence retrieval,
  `mdx-search`, the governed-documents list, the MCP tools) still span the clients a person can open.
- **The shell's rail lists recent projects of every client** under Recents. It is the person's own navigation, as the
  Projects page is; whether it should follow a chosen sponsor is a product decision.
- The page reads its sponsors from the project list, which leaves out archived projects; the server counts them. A
  person whose second client has only archived projects is told the artifacts are listed one client at a time, and is
  not offered the choice on the page.
