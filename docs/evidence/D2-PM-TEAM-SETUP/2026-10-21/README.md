# D2 Projects — complete existing team setup reachability

## What already exists

Inventory captured before implementation at `b9a48ce7136b8eecb076126d22e387d4d1b0ba84`; the limits below describe that starting state.

- `server/routes/concept2cure.ts`: canonical integer-project sharing GET, member PUT/DELETE and visibility PATCH; existing audit outcome metadata. Member controls are not reached from the v2 ProjectHome. These handlers still use claimed actor role and legacy workspace/access helpers; membership removal currently deletes the share row.
- `server/routes/c2c/project-access.ts`: existing integer-project admission and durable sharing loader, including a missing-table legacy fallback. `server/services/project-sharing-access.ts` is the single canonical owner/edit/use and visibility policy. Neither freeform responsibilities nor task assignment constitute access grants.
- `server/services/c2c/current-program-access.ts`, `server/routes/c2c/project-route-access.ts`: UUID program admission against a unique integer-project anchor and current actor; client workspace and read/write boundaries are explicit. Do not add a second program-to-project resolver.
- `server/services/c2c/project-team.ts`, `shared/project-team.ts`, `client/src/concept2cure/v2/surfaces/ProjectTeamResponsibilities.tsx`: admitted, scoped team read, actual IDs, account verification, responsibility/sharing separation, unlinked name contacts, fail-closed UI. It provides no membership mutation controls.
- `shared/schema.ts` (`projectMembers`) and `db/migrations/20260401_project_sharing_visibility.sql`: existing active/revoked durable sharing memberships with inviter/accepted timestamps, plus visibility store. No new membership table is needed.
- `server/routes/taskManagement.routes.ts`, `server/routes/taskBoard.routes.ts`, `client/src/concept2cure/v2/surfaces/TaskBoard.tsx`: real task assignee IDs, creator/assigner history, organization roster, named assignment on task creation and existing automatic assignment of unfinished tasks. TaskBoard already reaches these operations. This is business work delegation, separate from access and document-specific approval.
- `client/src/concept2cure/v2/surfaces/ProjectHome.tsx`: existing project work panel and Team & activity; currently read-only team facts. `shared/utils/member-labels.ts` already disambiguates real identities.
- `server/services/part11/signing-authority.ts` and authoring review assignments: document-specific authority. Project sharing must not replace these policies.
- `server/services/ana/*tool*.ts`: searched member/sharing/delegation names; no project membership editing tool found. Existing surface actions reach the task board; governed mutations remain human-operated.

Searches covered member/team/sharing/access/delegation/assignee names across client surfaces, server routes/services/AnA, schema and migrations. `git log --all --diff-filter=D` for ProjectShare/project-sharing/ProjectTeam/project-team/project-member/delegat returned no deleted implementation matches. No existing client caller of sharing/members or sharing/visibility was found.

## Qualification status

Inventory preceded implementation prompts. The frozen contract and qualification below complete the bounded extension. This evidence concerns launch row D2 and PM-04 in the retained PM enhancement roadmap, across all requested client segments. It does not claim production deployment or completion of every roadmap row.

## Value across client workflows

The same verified account/sharing controls support Biotech's outsourced study and CMC contributors, Pharma's cross-functional document contributors, Medical device design/V&V contributors and IVD analytical/clinical performance contributors. CRO/consultancy delivery uses the same controls within each admitted client project. These are access and coordination controls: no study acceptance, design verification, performance claim, approval or filing verdict follows from membership. Existing task assignment remains on the task board and existing document-specific review/signing remains authoritative.

## Completed extension

`server/routes/c2c/project-sharing.ts` extracts and completes the four existing canonical sharing handlers; their old bodies in `server/routes/concept2cure.ts` are removed. `project-access.ts` extends the existing admission entry point with a request-pinned executor and canonical program binding. No alternate member store, permission system or API is introduced. `shared/project-sharing.ts` pins the extended response and control flags; ProjectHome reaches those handlers through `ProjectTeamSharing.tsx` and the envelope-preserving `projectSharingRequest.ts`. PM-03's team hook now retires reads synchronously when actor/organization changes at the same program UUID.

The active manager picker offers real organization accounts with disambiguated identities. Use/Edit grants and revocation are independently admitted using current persisted membership, existing governed role and sharing policy, the program's unique project anchor and its client workspace. Read-only owners and stale claimed administrator roles cannot mutate. Owner/creator and owner-role sharing rows are protected. Revocation updates the existing row to revoked, retaining original grant attribution, account and timestamps. Regrant retains the durable row identity; the current grant's inviter/accepted timestamp can change. Work assignment remains reachable through the existing project task panel and task board; this slice does not claim completion of manual reassignment or the whole PM-04 roadmap row.

A manager's directory is not disclosed to ordinary readers. Unverified reads cannot become empty verified rosters. During same-scope team refresh, private sharing rows and controls are hidden while a generic saved/audit notice can remain. Scope changes retire the component immediately. Each write validates its exact result and audit outcome; an uncertain transport or COMMIT outcome requires reread rather than an automatic replay.

## Qualification

- UI integration: 263 tests in 27 files passed, including all ProjectHome suites, both sharing contracts and team rendering; the focused UI run is a subset (93 tests in 7 files).
- Backend integration: 185 tests in 11 files passed, including the incoming strict AnA body-bound work.
- Focused backend: 100 unique cases passed (34 existing audit cases, 49 existing admission/policy cases, 17 sharing cases). The archive run repeats the initial 16 sharing cases and adds one case; do not sum that repetition as additional unique coverage.
- Native PostgreSQL 16: 31 tests in 2 files passed (11 sharing cases and 20 PM-03 cases), using a real restricted NOSUPERUSER/NOBYPASSRLS role and FORCE RLS on the tenant fixtures. Actual sharing HTTP handlers, SQL and the existing regulatory audit writer execute. A lost acknowledgement is injected *after the real COMMIT*, proving persisted Edit state, one connection discard and safe reread. The fixture supplies synthetic authentication/tenant middleware and narrow tables; it does not qualify full deployed schema/authentication, the separate tamper-proof audit chain, or independent-session offboarding concurrency. Locks are implementation evidence, not a claim of a separate concurrency-barrier test. Read requests use an explicit transaction to pin tenant GUCs in place of production's lazy request owner; write transactions are the actual sharing service's.
- Chromium: actual component/request helper and product CSS, synthetic auth/tenant providers and HTTP fixture. Desktop 1280 and phone 390 pass grant, revoke, reader controls, read retry, audit warning, no horizontal overflow or page errors. Screenshots and replay are retained. This is component/browser evidence, not a deployed session.
- Build passed. Pushed-file lint passed with zero errors and net one fewer warning; no new production dependency or schema change. Strict companion-file scan passed with two non-blocking filename warnings; it does not run tests, and the affected ProjectHome/admission behavior was actually exercised above.
- Repository-wide TypeScript passed with zero errors. The ordinary pre-push/remote verification is recorded in the publication receipt after completion. No PR or production deployment is requested by this slice.

## Red/green interpretation

`backend-red.txt` is the clean 14-case baseline (12 failures, 2 passes); the later suite adds zero-row cases and archive qualification. `backend-archive-red.txt` isolates the missing status fingerprint (stale management controls returned 200), followed by 17 passing sharing cases. `ui-red.txt` records three missing-control cases, followed by the completed focused and integration runs. Native initial logs are *integration diagnostics*: the baseline includes absent response fields/inactive-account acceptance, but also narrow-fixture audit columns and unpinned read GUC issues, fixed in the harness. They are not represented as an isolated native permission red. The first browser build caught a draft import of a private helper; the final implementation parses the existing canonical success envelope directly. All final qualifications use the sources hashed in source-bindings.json.

The initial repository-wide TypeScript run caught one test-only untyped PGlite row spread. Explicit row generics corrected it without changing runtime assertions; the 17-case route suite and scoped lint passed again (`backend-type-fix-green.txt`). `typecheck-initial.txt` retains the failure and `typecheck.txt` is the final rerun.

## Final concurrent Vault integration

Normal merge preserved incoming `90043b5ea` and `5bf4aef01` (authoring-to-Vault filing identity/uncertain outcomes). All 17 PM qualification source hashes remain unchanged. The 8 changed Vault/authoring component and SQL suites pass 139 cases, with 1 existing TODO explicitly excluded from passed counts; the combined branch rebuild passes (`build-final.txt`). This brings focused passing cases to 687, plus 31 native PostgreSQL cases. `incoming-source-bindings.json` identifies the additional source inputs. The local TypeScript log qualifies the PM source tree; the ordinary pre-push TypeScript gate checks the final combined tree, with its result retained in the external publication receipt and full push log.
