# F22: Add a market (part a), and review item 6: a market not offered is refused everywhere

Launch row **D2**. `docs/design/FILING_SPINE.md` F22. The proposed workflow decision deferred F22. The founder said on 2026-10-15 to proceed ("get past it, go").

## What changed

**`POST /api/c2c/projects/:id/markets`** (`server/routes/c2c/projects.ts`, `server/services/c2c/add-project-market.ts`). Requirements: `{ agency, applicationType, reason, title?, clientType? }`, a stated reason, and someone who may change the project (the lead or a manager, as for the other project changes). In one transaction it:
- scaffolds a governed document, `filing_scope = 'market'`, holding only the market's Module 1 subtree and 3.2.R from the market's own rule pack, with their ancestors (insert-only). The common modules stay the home filing's;
- adds the market to `target_agencies`;
- creates the market's submission anchored to the project (`ensureSubmissionSpine`, the intake's own path), with the person's title and client type;
- records the governed action with the reason.

**Refused by name, writing nothing.**
- 422: a market the server's statement does not offer (a UK IND), Health Canada (no outline), a device project, a class with no document type, and a market with no rule pack of its own. Module 1 is regional, so the harmonised fallback is not taken.
- 409: a market the project already files.
- The project's own market without a submission (a project from before intake wrote one) gets the submission only: its document is the filing.

**Which document is the filing** (`migrations/20261015e_c2c_documents_filing_scope.sql`). The column is additive: `'home'` by default, `'market'` for an added market, with a partial unique index of one market document per (project, class, agency). It is in `C2C_MIGRATION_FILES`, and the migration gates pass.
- The editor's outline asks for the home filing (`scope=home` on `GET /api/c2c/documents`, `useFilingOutline.ts`). It used to read the newest document, which after an add would have been the market's partial outline.
- An authored section binds to the home filing's agency or its harmonised fallback (`governed-document-binding.ts`), never to a newer same-class market document.

**New submission inside a project, and Add a market** (which opens it) both call the route. The drawer asks for the reason. The org-wide New submission is unchanged.

**Review item 6.**
- `POST /api/submissions` refuses a market the statement does not offer, with its line (422 `MARKET_NOT_OFFERED`). An unreadable statement creates nothing (503).
- The region picker lists such a market and does not let it be chosen (`C2CForm` options take `disabled`).

## Not in this part (F22b)

A market's Module 1 is not yet shown in the editor beside the home outline. The spec asks for "common nodes from the home document; Module 1 from the market's document" in `useFilingOutline`, binding Module 1 sections to the market document, and refusing a section in the wrong scope. The spec's "required keys missing from the home tree become gap rows" is also not done. The market document exists and is listed with the project's documents; until F22b, its sections are reached through the documents list, not the outline.

## Red, then green

| File | Before the change |
|---|---|
| `red/binding-same-class-red.txt` | The old binding takes a newer same-class market document over the home filing. |
| `red/outline-home-scope-red.txt` | The outline asked for every document of the project. |
| `red/create-in-project-red.txt` | Inside a project the drawer had no reason field and created through the organisation's route. |
| `red/create-not-offered-red.txt` | A UK IND was created (201). |
| `red/picker-not-offered-red.txt` | A market not offered could be chosen. |

The service suite (`add-project-market.pglite.test.ts`, 8 cases on PGlite with the real packs) and the route suite (4) are new with the route. `submissionCenterOpenProject.test.tsx`'s create case is amended in place with a dated note: the project's route, with a reason.

In `green/`:
- `vitest.txt`: the suites above.
- `wide-summary.txt`: c2c routes and services, the binding and outline contracts, submissions routes, Submission Center, New submission, the outline and editor, Project home, two golden journeys and `tests/ui`. 1,297 pass. The 4 failures (`submissions-program-anchor`, `submissions-leaf-remove-and-precheck`) also fail on trunk without this change.

Typecheck: 0 errors. Copy, design, scope and migration gates are green. No lint count changed. `ci:tenant-entry-points` fails on trunk too, on another lane's `auditChainIntegritySweep.ts`.
