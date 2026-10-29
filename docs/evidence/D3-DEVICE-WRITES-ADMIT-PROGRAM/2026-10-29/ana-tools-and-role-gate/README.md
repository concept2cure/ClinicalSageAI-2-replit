# AnA's device tools, and a role gate on the labeling writes

Launch row D3, tenant isolation. Date 2026-10-29. The work was done on a working tree over `ceea6843`, and re-run at `90512f55`. Between the two, the push changed none of the files below (`green.txt`).

This takes up the first two hand-ons in `../README.md` ("Not done").

**Status: done.**

- **Hand-on 1, the AnA tools.** It was already closed, so nothing was changed. `create_udi_record` and `create_labeling_document` do not run for a project the organization doesn't own. The registry wrapper refuses the call before either handler runs. It has done so since before `8d37e8ad`. That README read the handler bodies, which have no check of their own. The wrapper had no test for these two tools, so this slice adds one. It also shows the test going red when the wrapper's check is removed.
- **Hand-on 2, the labeling role gate.** Fixed. The six labeling writes now take `requireEditorAccess`, as the UDI writes do.

## What already exists

Re-verified in the working tree before any change. `AnaToolExecutor.ts`, `tool-record-scope.ts`, `editor-role.ts`, `program-access.ts`, `orgMembership.ts` and `mdx-labeling.ts` all matched HEAD.

| Piece | Path | What it does | What it does not do |
|---|---|---|---|
| `create_udi_record` | `server/services/ana/AnaToolExecutor.ts` (`registerToolHandler('create_udi_record')`, ~8528) | Inserts one `udi_records` row: `organization_id` from `ctx`, and `program_id` from the model's `program_id` if it is a UUID, else NULL. Refusals are a JSON string `{ error: '…' }`. | The body asks nothing about the project. |
| `create_labeling_document` | same file (~15092) | Inserts one `labeling_documents` row, the same way. Same refusal shape. | The same. |
| The registry wrapper | same file, `registerToolHandler` (586–622) | Every handler is stored wrapped, and every dispatch path resolves the wrapped one through `getToolHandler` or the map: `server/routes/ana-ri/stream.ts`, `utility.ts`, `server/mcp/tools/runtime.ts`, `sub-agent.ts`, and the executor's own loop. The raw closures are never exported. Before the handler it runs, in order: the launch scope check, the sub-agent read-only check, the approved-model check, and the person's confirmation (`preHandlerRefusal`). Then `writeRoleRefusal`, then `foreignProgramRefusal`, then `foreignRecordRefusal`. | — |
| Project ownership for every tool | `server/services/ana/tool-record-scope.ts` `foreignProgramRefusal` | For `program_id`, `programId` or `device_program_id`, it calls `programInOrganization` (`server/services/c2c/program-access.ts`). If the organization doesn't own the live project, it returns `{ error, code: 'PROGRAM_NOT_IN_ORGANIZATION', retry: false }`, without echoing the id. If the check can't run, it returns `PROGRAM_CHECK_UNAVAILABLE`. A call that names no project goes through without asking. This was in the wrapper at `8d37e8ad` and at its parent (`git show 8d37e8ad:…AnaToolExecutor.ts`, line 593). The file came in on the `c04ed02b` line, which is an ancestor of `8d37e8ad`. | Its words are not the HTTP routes' "Project not found" (below). |
| Role for every confirm-class tool | `writeRoleRefusal` in the wrapper, `server/services/part11/editor-role.ts` `editorRoleDecision` | Both tools are class `confirm` (`tool-authorization.register.json`). The caller's organization role is read for the verified principal, never from the input, and checked against `GOVERNED_WRITE_ROLES`, the set `requireEditorAccess` uses. A viewer is refused before the handler runs. | — |
| Wrapper tests | `server/services/ana/__tests__/tool-record-scope.test.ts`, `confirmed-write-role-gate.test.ts` | They prove the wrapper is wired, through a probe tool, `get_rbm_attention` and `create_qms_document`. | Neither runs either device tool. `tool-selection.test.ts` names `create_udi_record` only as a pinned tool. No test ran either handler. |
| One write path shared by the route and the tool? | `server/routes/mdx-udi.ts`, `server/routes/mdx-labeling.ts` | The routes insert inline, in the route handler. | There is no service either the route or the tool could call. Converging them means extracting one from `mdx-udi.ts`, which is not this slice's file. The ownership answer is already single-sourced (`programInOrganization`), and so is the role set (`GOVERNED_WRITE_ROLES`). What remains duplicated is the INSERT statement itself: two per table. Handed on. |
| Labeling writes | `server/routes/mdx-labeling.ts` | `POST /labeling` and `PATCH /labeling/:id` call `admitProject` (8d37e8ad). `POST /labeling/:id/translations` and `POST /labeling/:id/symbols` check the document with `requireDocInOrg`. `PATCH /labeling/translations/:transId` and `DELETE /labeling/symbols/:symId` are scoped by organization in their SQL. | None of the six had any middleware. The mount, `app.use('/api/mdx', mdxLabelingRoutes)` in `server/bootstrap/register-inline-routes.ts:1223`, adds none. |
| The UDI writes' gate | `server/routes/mdx-udi.ts` (`POST /udi`, `PATCH /udi/:id`, `POST /udi/:id/submit-gudid`) | `requireEditorAccess` (`server/middleware/orgMembership.ts`) on each route. 403 `{ error: 'Insufficient permissions' }` for a role outside `GOVERNED_WRITE_ROLES`. | — |
| Router-wide variant | `orgMembership.ts` `requireEditorAccessForWrites` | Gates every non-GET request on a router. | Not usable here: this router is mounted at `/api/mdx` beside 31 others, so a `router.use` would also run for their requests. |
| Client | `client/src/concept2cure/v2/surfaces/Labeling.tsx` `addTrans` | Posts translations. On a non-2xx it says "Couldn't add the translation — … Nothing was saved." | It does not withhold the control from a viewer. A viewer now gets that message, with the server's 403 words. |

Searches run:

- `create_udi_record` and `create_labeling_document` across `server`, `tests`, `shared`, `client/src` and `scripts`. Hits: the two handlers, their definitions, the authorization register, the launch-scope inventory and `tool-selection.test.ts`.
- `programInOrganization` in `AnaToolExecutor.ts`: `predicateShadowCall` (6844), `get_submission_readiness_twin` (18037). The readiness tool's comment points to the wrapper's tool-record-scope. That led to `foreignProgramRefusal` in `registerToolHandler`.
- `toolHandlers` across `server`: one file, `AnaToolExecutor.ts`. The map is set only in `registerToolHandler`, and read through `getToolHandler` and the stream dispatch (16431).
- Writes to `udi_records` and `labeling_documents` (`INSERT INTO`, `UPDATE`, Drizzle `insert`/`update`) across `server`, `shared` and `scripts`. Writers: the two routes, the two AnA tools, and three demo seed scripts. No AnA tool updates either table, so no tool can move a record to another project.
- `router.(post|patch|delete)` in `mdx-labeling.ts`: six writes. Every test that imports the labeling router, and every reference to `/api/mdx/labeling` in `server`, `tests` and `client/src`.
- `mdx-labeling` in `scripts/ci`: it appears in the baselines of `ci:sign-ceremony`, `ci:sql-interpolation` and `ci:tenant-resolvers`. All three gates pass after the change, with counts unchanged.

## What changed

- **`server/routes/mdx-labeling.ts`.** It imports `requireEditorAccess` from `../middleware/orgMembership`, as `mdx-udi.ts` does, and puts it first on each of the six writes:
  - `POST /labeling`;
  - `PATCH /labeling/:id`;
  - `POST /labeling/:id/translations`;
  - `PATCH /labeling/translations/:transId`;
  - `POST /labeling/:id/symbols`;
  - `DELETE /labeling/symbols/:symId`.

  A comment says why it is per route. The five reads are unchanged and stay open to every member.
- **`server/services/ana/AnaToolExecutor.ts`.** Not changed. Adding a `programInOrganization` call to each handler would put a second copy of the check that already runs one frame above it.
- **New test: `server/__tests__/routes/mdx-labeling-writes-require-editor.test.ts`, 24 cases.** It mounts the real UDI and labeling routers over a database double that records every statement. For each of the six writes:
  - a viewer gets the same status and body as `POST /api/mdx/udi` gives a viewer, and nothing is sent;
  - a member with no role gets 403, and nothing is sent;
  - an editor's write goes through.

  It also checks the five reads as a viewer, and the UDI reference itself.
- **New test: `server/services/ana/__tests__/device-tools-admit-program.test.ts`, 16 cases.** It goes through `getToolHandler`, so the real wrapper, the real `tool-record-scope`, the real `programInOrganization` and the real handlers all run. Only the database and the role lookup are doubles. For each tool:
  - the premise: the tool is confirm-class;
  - another organization's project, a missing one, or the organization's own deleted one: `PROGRAM_NOT_IN_ORGANIZATION`, one ownership lookup, no write, and the id not echoed;
  - a check that can't run: `PROGRAM_CHECK_UNAVAILABLE`, and no write;
  - the organization's own project: written under it, after the lookup;
  - no `program_id`: written with NULL, and nothing asked, as before;
  - a viewer: refused with "needs an editor role", and no write.

## Proof

- `baseline.txt`: every related suite at head, and the gates.
  - `launch-scope-api-gate.test.ts` already fails 5 of 43 at head, before any change here.
  - Those five assert launch-scope verdicts for `/api/mdx/risk-items`, ESG transmit, eSTAR and predicate-intel paths. They don't touch this slice's files, so they are left out of the keep-green set.
- `red-labeling-role-gate.txt`: the new route test in the tree, against `mdx-labeling.ts` at HEAD. **12 of 24 red.**
  - Every viewer and no-role write sent its statement: the INSERT, the UPDATE, or the DELETE.
  - The translation PATCH to `approved` stamped `approved_by`, so a viewer could approve a translation.
  - The 12 that pass are the editor writes, the reads and the reference.
- `red-ana-tools.txt`, in two parts.
  1. In the tree, the tools test is **16 of 16 green at head**, with nothing changed. That is the finding: the gap was already closed.
  2. With the wrapper's program check removed (A1), both handlers send their INSERT under every id the model names. That is another organization's (`bbbb…`), a missing one (`cccc…`), a deleted one (`dddd…`) and, unchecked, `aaaa…`. This is the gap `8d37e8ad` described, and it shows the test catches it.
  - The wrapper's modules are not this slice's to edit, even for a moment. So A1 and A2 run through a scratch vitest config that aliases the executor's imports `./tool-record-scope.js` and `../part11/editor-role` to scratch copies. The tree was not touched.
  - Each copy prints a load marker, and the unmutated control is 16 of 16.
- `green.txt`: each file run alone after the change, all green.
  - The two new tests: 24/24 and 16/16.
  - `device-project-writes-admit-program` 39/39, `device-project-reads-admit-program` 20/20, `labeling-translations-shape` 3/3 and `tests/mdx-qms-labeling-search-analytics-routes` 28/28. The last mocks `requireEditorAccess` to a pass-through.
  - `tool-record-scope` 18/18, `confirmed-write-role-gate` 9/9 and `tool-selection` 17/17.
  - `ci:program-ownership-single-source` and its self-test, `ci:sql-interpolation`, `ci:sign-ceremony` and `ci:tenant-resolvers`.
- Mutations. Each red is confined to its target.

  | File | Mutation | Red |
  |---|---|---|
  | `mutation-L1.txt` … `mutation-L6.txt` | One labeling write loses `requireEditorAccess`, in the tree, then restored | 2 each: that write's viewer and no-role cases |
  | `red-ana-tools.txt` (part 2) | A1: `foreignProgramRefusal` returns null (scratch alias) | 10: the foreign, missing, deleted and unavailable cases, and the own-project write's "after asking", for both tools |
  | `mutation-A2.txt` | A2: `editorRoleDecision` admits everyone (scratch alias) | 2: the viewer case for both tools |

  - After each L mutation, the file was restored from a copy, and its sha256 matched the fixed file (`ce7c3bfa…`).
  - Later, one word in the new comment was corrected ("a dozen" → "31"; now `b56e532a…`). The gate test was re-run on that file: 24/24.
  - `git diff -- server/routes/mdx-labeling.ts` shows only the import, the comment and the six `requireEditorAccess,` insertions.
- `eslint.txt`: plain `npx eslint <file>`. `mdx-labeling.ts` has 0 problems at head and now. The two new tests have 0.
- `typecheck.txt`: `tsc` over the three changed files and everything they import (the executor included), exit 0.

## Not done

- **The tools' refusal is not worded "Project not found".** The wrapper says "program_id does not name one of this organization's programs, so nothing was read or changed. Use a program from this organization's project list." The code is `PROGRAM_NOT_IN_ORGANIZATION`. That wording is shared by every AnA tool, and `tool-record-scope.test.ts` asserts it. Rewording it is a change to `tool-record-scope.ts`, not to these handlers.
- **The confirmation is asked before ownership.** `preHandlerRefusal` runs before `foreignProgramRefusal`. A tool call that names a foreign project can therefore be put to the person to confirm, and then be refused once they confirm. Nothing is written either way. This is from reading the code; it is not tested here.
- **Two INSERTs per table.** The route and the tool each write `udi_records` and `labeling_documents` with their own statement and their own column set. One service called by both would end that. It needs `mdx-udi.ts`.
- **A handler quirk.** The wrapper checks `program_id` trimmed. The handlers test it untrimmed against an anchored UUID pattern. So the organization's own id with surrounding spaces passes the check, and is then stored as NULL. That loses the project link, not tenancy.
- **The sign-ceremony baseline's reason for `mdx-labeling.ts` is stale.** It says MDX labeling is "outside the launch catalog", but labeling joined it on 2026-10-26 (`ana-launch-scope.inventory.json`). The stamp it counts, a translation PATCH to `approved` setting `approved_by` and `approved_at`, now needs an editor. It still has no signature.
- **The labeling screen** shows a viewer the add-translation control and reports the 403 after the click. It does not withhold the control.
- From `../README.md`, still open: the check and the write are not in one transaction; project sharing is not applied; `labeling_documents.artifact_id` has no key; and `mdx-engineering.ts` answers 500 where it should answer 503.
