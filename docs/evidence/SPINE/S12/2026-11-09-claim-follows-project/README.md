# The recorded-context claim follows the open project, across client workspaces

**Package:** S12 (`ProjectRecordedContext.tsx`, `ProjectSide.tsx`, `ProjectHome.tsx` are in its paths). **Session:**
`session_01FTWcmXm7At3ZXBE5VWn6oS`. **Asked by:** the coordinating session, 2026-11-09, after it reproduced the 409 on
trunk `8d104d190d`: "the claim must follow the open project, red-first, in a test that switches workspaces in one
session. Write a ProjectRecordedContext 409 as an error, never as 'No saved intelligence profile'." **Status: committed
locally; held under the project-page freeze until after 23:00 UTC.**

## What already exists (RULE 3)

| Piece | Path | Did | Did not |
|---|---|---|---|
| The profile read | `surfaces/ProjectRecordedContext.tsx` `TenantContextRead` / `ScopedRead`; GET `/api/c2c/projects/:id/intelligence` | Claimed the shell's current client (`tenant.currentClientWorkspace`) in `x-client-id` | Claim the **open** project's client: moving Projects → C2C-101 (workspace 2) → Projects → LMN-201 (16), the read went out with the previous project's workspace and the server answered 409 `PROJECT_WORKSPACE_MISMATCH` (`server/routes/c2c/project-recorded-context.ts:29`), both ways |
| The current client following the project | `clientFollowsProject.ts` `useClientFollowsProject` (V2App) | Makes the open project's client current, after its own read of the project | Run before the profile read: the read raced it |
| The project's own record | `ProjectHome.tsx` `progState` (GET `/api/c2c/projects/:id`, `client_workspace_id`) | Already holds the project's recorded client workspace | Pass it to the side cards |
| The error state | `ProjectRecordedContext.tsx` `Cards` | A refused read is already "Recorded project context could not be read…" with `role="alert"` and Retry | — (pinned below) |

`shellProject.ts` (catch-all packages only) is not changed: the project's workspace is passed as a prop from the page
that already read it, not added to the shell's project state.

## What changed

- `ProjectRecordedContext.tsx`: `projectWorkspaceId` (`number | null | 'reading'`). A recorded workspace is the claim;
  while the project's own record is still being read (`'reading'`) no profile read is sent and the card says it is
  reading; `null` or absent claims the shell's current client, as before. The existing foreign-tenant refusal and the
  no-workspace case are unchanged.
- `ProjectSide.tsx` passes it through; `ProjectHome.tsx` supplies it from its program read.

## Red first

`__tests__/ProjectRecordedContext.test.tsx` gains "the client claim follows the open project, across client workspaces
in one session":
- claims the open project's recorded workspace (21) while the shell still names the previous one (34) — **red on trunk**;
- sends no profile read while the project's own record is being read — **red on trunk**;
- writes a refused (409) read as an error, never as "No saved intelligence profile" — a pin: already true on trunk.

`red.log`: 2 fail, 28 pass on trunk. With the change, 30 of 30 pass; the 37 project-page, side-card and recorded-context
suites pass, 381 cases (`tests.log`). Lint is unchanged on every changed file.
