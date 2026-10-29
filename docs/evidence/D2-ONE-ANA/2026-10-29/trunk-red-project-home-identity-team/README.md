# Trunk red: Project home's identity facts and team switch isolation (D2, 2026-10-29)

Lane: `…session_01T2wooCZu46W7msw4TJuuzr`, a subagent of the D2 lead. Starting point: `96ce3798` on `concept2cure-v2`.
Three client cases were red on trunk:

- `projectHomeIdentityFacts.test.tsx`: "renders sponsor, product, indication and the IND number from GET /api/c2c/projects/:id" (`Unable to find … Sponsor`).
- `projectHomeTeamResponsibilities.test.tsx`, "ProjectHome team program-switch isolation":
  - "hides the previous program roster immediately while its replacement loads" (`Unable to find "Loading team…"`);
  - "ignores a late successful roster from an abandoned program" (`Unable to find "Alex Chen · Account #9"`).

**Verdict: test drift in all three cases, not a product regression.** Both product changes were deliberate, documented in their slice's evidence and pinned by that slice's own tests. They were made without updating these two suites. No product file changed.

## What already exists

- **The identity facts** (`client/src/concept2cure/v2/surfaces/ProjectHome.tsx`, the `section[aria-label="Project identity"]`). Four facts are read from the row of GET `/api/c2c/projects/:id`: **Client**, Product, Indication, and the application number labelled by program type. A missing value says "not recorded" or "not assigned".
  - The server projects `client_workspace_id` and `client_name` from `client_workspaces` through the project's anchor (`server/routes/c2c/projects.ts`, the detail projection). It also still returns `sponsor_name`, the organization's name.
  - `ProgramRow.sponsor_name` is now documented as "Legacy organization display name, not the regulatory applicant identity".
  - `projectHomeStages.test.tsx`, "names the owning client rather than calling the CRO organization the sponsor", pins the Client label and that the organization's name is not shown.
- **The team** (`client/src/concept2cure/v2/surfaces/ProjectTeamResponsibilities.tsx`). It is rendered on the Plan step inside `ProjectPlan`'s `team` slot, under a "Team" heading.
  - `useProjectTeam` is called at the top of `ProjectHome`, whatever step is open. It retires the previous program's read synchronously on a program switch, and refuses a roster whose `program_id` is not the open program.
  - `useLiveData` (`client/src/concept2cure/v2/dataConnect.tsx`) cancels an abandoned read in its effect cleanup (`cancelled`). `useProjectTeam` passes no owner, so that flag is the only thing that drops a late reply.
  - The words are unchanged: "Loading team…", `member.label` ("Alex Chen · Account #7"), "Couldn't load the project team".
  - AnA's `facts.team`, `teamProgramId` and the related facts are published from the same `teamState`, whatever step is open.
- **The per-project step** (`ProjectHome.tsx`, `stepSelection` / `chooseStage`; `client/src/concept2cure/v2/shellProject.ts`, `publishShellProject`).
  - A project opens on its own remembered step: an explicit handoff, then a pending action, then the remembered `step`, then Author (Plan for an empty project).
  - A different project never inherits the previous project's step. `publishShellProject` drops `step` when the id changes.
  - Pinned by `projectHomeStepReturn.test.tsx` ("resets a different project to its own default without a surface remount") and `shellProjectStep.test.ts` ("drops the prior project step on A → B → A").

Searches run:
- `rg` over `ProjectHome.tsx` and its sub-components for `Sponsor`, `sponsor_name`, `client_name`, `Loading team`, `Account #`, `stepSelection`, `rememberedStep`.
- `git log --all -S'<dt>Sponsor</dt>'`: last touched by `a40f48f8`, which replaced it.
- `git log --all -S'<dt>Client</dt>'`: only `a40f48f8`.
- `git log --all -S'Loading team…'`: only integration and merge commits of 2026-10-22 and 2026-10-23, nothing since.
- `git log --all -S'stepSelection.pid'`: only `2aace71d`.
- `git log --all --diff-filter=D` over `client/**/*ProjectTeam*`, `*Identity*`, `*Sponsor*`, `*TeamRoster*`: nothing deleted.
- The lead's two suspects:
  - `2246406e` (2026-10-25) predates the step reset, and itself added the `openPlan()` lines these tests use.
  - `62a8d5e7` (2026-10-23) only gave `StageTracker` a device lifecycle. It touches neither the identity facts nor the team.

## Root causes

| Case | Root-cause commit | What changed on purpose |
|---|---|---|
| Identity facts | `a40f48f8` (2026-10-26, Codex) "D2 A2.2: project client filtering uses the verified canonical anchor" | `<dt>Sponsor</dt>{sponsor_name}` became `<dt>Client</dt>{client_name}`. Slice A2 README: "Project home labels this fact **Client**, leaving the regulatory applicant sponsor concept in its existing forms." The suite's fixture carried only `sponsor_name`, so it found "Client: not recorded". |
| Hides the previous roster | `2aace71d` (2026-10-26, Codex) "D2 A2.1: keep the selected project step through editor and Vault visits" | `useState('author')` became `stepSelection`, reset when `pid` changes ("so the old project's step cannot drive the new one"). Before this, Plan stayed open across a switch. Now program B opens on its own default (Author), so the Team section is not mounted and "Loading team…" is absent. |
| Ignores a late roster | `2aace71d` (same) | Same mechanism. The test switched to B and waited for B's roster without opening B's Plan step, so `findByText('… #9')` timed out. |

Neither commit's filed evidence ran these two suites (`docs/evidence/D2-CLIENT-JOURNEY/2026-10-26/slice-A2/A2.1/*`, `A2.2/*`).

## What changed

Only the two test files. They now reach the facts the way a person does, and pin the current words with the same meaning.

- `client/src/concept2cure/v2/__tests__/projectHomeIdentityFacts.test.tsx`
  - The fixture row carries the server's shape: `client_workspace_id: 11`, `client_name: 'Concept2Cure Therapeutics'`, and a distinct organization `sponsor_name: 'Example CRO Organization'`.
  - The case is retitled "renders client, product, …". It asserts the label `Client` and the row's `client_name`, and that the organization's name is not shown as the client.
  - The "not recorded" case now nulls `client_name` and `client_workspace_id`. Before, it passed only because the fixture lacked `client_name`. It is retitled "for client, product or indication".
  - The header comment states the Client / `sponsor_name` distinction with its commit.
- `client/src/concept2cure/v2/__tests__/projectHomeTeamResponsibilities.test.tsx`
  - In both switch cases, after the switch to B the person opens Plan again (`openPlan()`), as a person must since `2aace71d`.
  - Every isolation assertion is kept. Under B's Plan, with B's roster pending: A's roster is absent, "Loading team…" is shown, and AnA's `facts.team` is null. B's roster appears after it resolves. A's late reply never replaces it.
  - Two assertions are added right after the switch, before Plan opens: A's roster is not on screen, and AnA's `facts.team` is null.
  - A comment on the describe block names `2aace71d`.

Eslint, per file: 0 errors and 0 warnings at HEAD and after the change (`green.txt`).

## Red, then green

| | File | Result |
|---|---|---|
| Red at `96ce3798` | `red.txt` | 3 failed, 16 passed: the identity case (found "Client: not recorded", no "Sponsor") and both switch cases (no Team section under B) |
| Green | `green.txt` | 19/19 across both files |
| Mutations | `mutations.txt` | 3/3 red, each restored to its pre-mutation sha256 with an empty `git diff` |

## Mutations

Each was one exact-string swap, one run of the pinning file, then the inverse swap.

- **M1**, `ProjectHome.tsx`: `clientName = prog?.sponsor_name`, the pre-A2.2 source, so a CRO's own name is shown as the client. Red: the identity case (`Unable to find "Concept2Cure Therapeutics"`, line 82) and the "not recorded" case (1 instead of 2).
- **M2**, `ProjectTeamResponsibilities.tsx` (`useProjectTeam`): while the new program's read loads, serve the previous program's verified roster instead of retiring it. Red: "hides the previous program roster…" at line 111. "Loading team…" never appears under B's Plan.
  - From the code, not observed (the DOM dump is truncated): the panel's own `program_id` check would then show "Couldn't load the project team" rather than A's names.
- **M3**, `dataConnect.tsx` (`useLiveData`): drop the `cancelled` check, so an abandoned read's late reply is applied. Red: "ignores a late successful roster…" at line 131. B's roster disappears once A's late reply lands.

## Limits and what was not done

- The new assertion right after the switch, that AnA's `facts.team` is null, holds partly because B's project record is still loading at that instant. ProjectHome then publishes only `{ projectId, stage }`. The check that does the work is the one after Plan opens (M2 is caught there, at line 111).
- After `2aace71d` no single change can show A's names on B's screen. Three independent guards stand in the way: the step reset, the hook's retirement and `program_id` check, and the panel's own `program_id` check. M2 and M3 each break one guard, and the suite catches each one.
- Nothing was escalated. No capability was removed: Client replaces Sponsor as the same fact, and the team is where it was, on Plan.
- Not committed or pushed. The lead commits.
