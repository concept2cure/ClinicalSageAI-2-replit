# An empty Documents list says the project is empty only to a person who is listed every document

**Package:** D3 (`ProjectHome.tsx`, the project page holder's row). **Session:** `session_01FTWcmXm7At3ZXBE5VWn6oS`.
**From:** the production walk with narrow roles, 2026-11-12 (`docs/evidence/F1/2026-11-12-production-walk-narrow-roles/`;
its note "For the Project page holder" in `.design/claude-convergence/COORDINATION.md`).

## What already exists (RULE 3)

| Piece | Path | Did | Did not |
|---|---|---|---|
| The Documents list | `surfaces/ProjectHome.tsx` `ProjectDocumentsBody`; GET `/api/authoring/docs?programId=` | Lists the documents the read returns | Know the list is per grant: empty, it always said "No documents in this project yet. Ask AnA in the box above to draft one." |
| Who is listed every document | `server/services/authoring/authoring-permissions.ts` `isGlobalAuthoringAdmin` (ADMIN, SUPER_ADMIN, PLATFORM_ADMIN), through `authoring-read-scope.ts` | Admits those roles to every document; everyone else by grant | — |
| The shell's admin check | `v2/orgAdmin.ts` `isOrgAdminRole` | Offers Admin to owner and business_admin too | Match the authoring ACL, so it is not used here |
| Sharing a document | the editor's More menu, "Access" (`editor/DocumentWorkbench.tsx`, `DocumentPermissionsPanel`) | Where a document's owner shares it | — |

So a Member, Reviewer, Approver or owner with no grant read "No documents in this project yet" on a project holding
five (LMN-201 in the walk) and was invited to draft a duplicate.

## What changed

`ProjectDocumentsBody` reads the signed-in person's roles (`useAuthUser`). `seesEveryProjectDocument(roles)` mirrors the
authoring ACL's three roles. An empty list then says:
- to a person who is listed every document: "No documents in this project yet. Ask AnA in the box above to draft one."
  (unchanged);
- to anyone else, and when no signed-in person is read: "No documents in this project are shared with you. This list
  shows the documents you have access to, so the project may hold others: a document’s owner shares it from the
  editor’s Access."

Nothing is removed or hidden (P-122): the list, its error state and its doors are unchanged.

## Red first

`__tests__/projectHomeDocuments.test.tsx` gains four cases: the administrator's sentence; the per-grant sentence for
member, reviewer, approver and owner; no signed-in person; and the screen and the server agreeing on who is listed
every document, for ten roles (the test calls the server's `isGlobalAuthoringAdmin`).

- On HEAD's `ProjectHome.tsx`: 3 fail, 33 pass (`red.log`).
- With the change: 36 of 36; the 34 project-page suites pass, 373 cases (`tests.log`). Lint unchanged (6 before and after).

## Not done

Not walked in the running app as a Member: this container's local database has one user, and the dev server is stopped
for the push. The production walk's second person can confirm it on LMN-201.
