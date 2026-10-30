# Fold F1, slice A: tenant safety for risk and design controls, and a signed "Accept residual"

Launch row D2 (one AnA; the device folds). Date 2026-10-29. Plan: `docs/design/DEVICE_FOLDS_2026-10-29.md`, F1 "Work":

- item 1, tenant safety;
- item 2, "Accept residual" as a signed act;
- item 3, the Engineering trace read by project. The lead added it once `mdx-engineering.ts` was free.

Items 4 (EngineeringSurface gains the trace, the hazard forms and the rest) and 5 (the fold itself) are later slices.

Read at `eb07bdcc` (the plan). Built on the working tree over `be1181958`. Every file changed here was byte-identical at both, so the drafts made during the freeze applied to the current files.

**Status: done for items 1, 2 and 3, with the limits under "Not done".**

## What already exists

Re-verified at head. The plan's F1 "What already exists" holds line for line.

| Piece | Path | What it does today | What it does not do |
|---|---|---|---|
| Design-controls read | `server/routes/design-controls.routes.ts:32-63` | `GET /api/design-controls`: the organization's design inputs in the display shape; 42P01 → `pendingStore`. | Takes no project, so it reads the whole store. |
| Design-controls write | same file `:74-124` | `POST`: one design input, scoped to the organization. | Takes no project and has no editor gate, so a viewer could add a design input. |
| Design-controls store | `db/migrations/20260717_design_controls_store.sql` | `c2c_design_controls`: in `public`, `organization_id INTEGER NOT NULL`, PK `(organization_id, id)`. | No project column. |
| Design-controls screen | `client/src/concept2cure/v2/surfaces/DesignControls.tsx` | The trace matrix and the §7.3 checklist over the read. | Sends no project and reads no scope. |
| Risk routes | `server/routes/mdx-risk-management.ts` | List `:114-139`, create `:142`, read one, PATCH `:201`, controls, summary `:386`. | See the list below this table. |
| Risk store | `migrations/20260507_mdx_beta_surfaces.sql:61` | `risk_items.program_id uuid REFERENCES regulatory_programs(id)`, NO ACTION. | Proves the project exists, not that it belongs to the risk's organization. A database provisioned by drizzle push (`shared/schema.ts` `riskItems`) has no key on the column at all. |
| Risk screen | `client/src/concept2cure/v2/surfaces/Risk.tsx:505`, `:769` | "Accept residual" calls `setStatus(id, 'accepted')`, which sends `PATCH { status: 'accepted' }`. | No reason, no signature. |
| The tour | `shared/navigation/demo-scripts.ts:309`, `:375` | Calls accepting residual risk "a signed human judgment". | That was not true. |
| Engineering trace | `server/routes/mdx-engineering.ts:247`, `:528` | Reads `c2c_design_controls` by organization and reports `scopes.trace: 'organization'`. | Since `10bbeeeea` the screen hides the panel behind "Shown once this screen reads this project's records". |
| Engineering screen gating | `client/src/concept2cure/mdx/surfaces/EngineeringSurface.tsx` (`keyedToProject`) | Draws a panel only when the route reports its scope as `'program'`. | Nothing; it needs no change here. |
| The ownership answer | `server/lib/admit-project.ts` over `server/services/c2c/program-access.ts` `programInOrganization` | 404 "Project not found" or 503, and the caller writes nothing. Used by UDI, labeling, human factors and engineering. | — |
| Program key pattern | `migrations/20261029_hf_engineering_files_program_key.sql`; `migrations/20260926b_program_same_org_keys.sql` | Nullable uuid, a NOT VALID same-org composite key, a partial index, placed before `UUID_TENANT_ISOLATION_NONPUBLIC`. In 20260926b's c2c_documents block, a second key on an already-keyed column takes the existing key's delete action. | — |
| The editor gate | `server/middleware/orgMembership.ts` `requireEditorAccess` (`43fb57cc`) | Answers 403 `Insufficient permissions` to a role outside `GOVERNED_WRITE_ROLES`. | — |
| The route-level signing ceremony | `server/routes/governed-signed-act.ts` `signGovernedAct`, `signedActAttempts` | Checks the components, the meaning set, signing authority, then `reverifySigner`. Then BEGIN, tenant context, an advisory lock, the domain write, the `sign` ledger pair, the signature row, COMMIT. | Separation of duties. |
| The pattern copied | `96537cfe`: `server/routes/mdx-labeling.ts`, `LabelingTranslationApproval.tsx` | `whenApproving` plus `signGovernedAct` with `DECISION_ACT_MEANINGS`. 409 for a re-approval, 400 for an approval that also edits fields, 428 for a create already approved. On the client, `EsignModal`; a 4xx is a refusal; a 5xx or a reply with no `signedAt` is unconfirmed. | — |
| The sign gate | `scripts/ci/check-sign-ceremony.mjs` | Every `sign` ledger write and every SQL approval stamp needs a signature-row write in its handler; `signGovernedAct(` counts as one. | Sees nothing in a handler that writes a status and no stamp (see "The gate's limit"). |
| AnA's risk tool | `server/services/ana/AnaToolExecutor.ts` `create_risk_item`; `tool-authorization.register.json` (class `confirm`) | Inserts `risk_items` with the model's `program_id` and status `'open'`. | No check of its own. None is needed (see "AnA's create_risk_item"). |

What the risk routes did not do:

- They never checked project ownership on a read (the list and the summary).
- They stored `programId` from the body unchecked, on the create (`:163`) and on the PATCH (`programId` in `COL`, `:210`).
- No write had an editor gate.
- "Accepted" was a plain status.

Searches run:

- `design-controls`, `c2c_design_controls`, `designControls`, across `server`, `client/src`, `shared`, `migrations`, `db/migrations` and `scripts`.
- `risk_items`, `risk-items`, `risk_controls`, `riskItems`, across the same directories. The writers found: the route, AnA `create_risk_item`, the ga-demo seed and two test fixtures.
- `Accept residual`, `accepted` and `signed human`, across `client/src` and `shared`.
- `signGovernedAct(` across `server` (20 route files) and `EsignModal` across `client/src`.
- `same_org_fk` across `tests`, `server` and `scripts`.
- `PURGE_CHILD_TABLES` for `risk_items`: absent.
- `git log --all --diff-filter=D` for design-control and risk files: nothing deleted in the visible history. The clone is shallow (1,140 commits). The seed's own note records that `migrations/20260609_design_risk.sql`, a uuid-keyed duplicate of the risk tables, was deleted on 2026-09-11.

Nothing is built beside an existing piece:

- Both routes, both screens, the engineering read and the store are extended in place.
- The ceremony, the dialog, the ownership answer and the editor gate are reused as they are.
- No new component or route.

## The tenant check, per route

Every ownership check goes through `admitProject`, which answers:

- 404 "Project not found" for another organization's project, a missing project, a deleted project or a malformed id;
- 503 when the check cannot run.

In both cases nothing is read or written. A project is stored only after the check.

| Route | Project it takes | Check | Editor gate | Scope reported |
|---|---|---|---|---|
| `GET /api/design-controls` | `?program_id=` | admitProject, then `WHERE organization_id = $1 AND program_id = $2` | read (open) | `meta.scope` is `'program'` plus `programId`, or `'organization'` |
| `POST /api/design-controls` | body `programId` | admitProject, then INSERT with `program_id` `$7` | `requireEditorAccess` | `meta.scope` on the 201 |
| `GET /api/mdx/risk-items` | `?program_id=` (UUID or 422, as before) | admitProject, then the existing filter | read (open) | `meta.scope` added |
| `GET /api/mdx/risk-summary/:programId` | the path | admitProject, then the aggregate | read (open) | — |
| `POST /api/mdx/risk-items` | body `programId` | `writeRefused`: admitProject, then the assignee check | `requireEditorAccess` | — |
| `PATCH /api/mdx/risk-items/:id` | body `programId` (`null` clears it, with no question asked) | `writeRefused` | `requireEditorAccess` | — |
| `POST /api/mdx/risk-items/:id/controls` | none (the item's organization is checked, as before) | — | `requireEditorAccess` | — |
| `PATCH /api/mdx/risk-controls/:controlId` | none | — | `requireEditorAccess` | — |
| `GET /api/mdx/engineering/:programId` (item 3) | the path, admitted before anything is read (unchanged since `ad0b119b`) | the trace now reads `WHERE organization_id = $1 AND program_id = $2` | read (open) | `scopes.trace: 'program'` |

A request with no project behaves as before and says the scope is the organization's.

An input or hazard recorded with no project belongs to the organization, unscoped. No project read returns it.

**Engineering's trace panel (ruling 3, item 3).** The panel takes its scope from `GET /api/mdx/engineering/:programId`. It does not read `/api/design-controls` or `/api/mdx/risk-items`. So it is item 3 that brings the panel back, not the two routes above:

- `mdx-engineering-trace-by-project.test.ts` pins the server side. Only the admitted project's inputs are returned: never a sibling project's, an unscoped one, or another organization's. A foreign project is refused before the read. A store without the column is a failed panel (`meta.unavailable`), never an empty one.
- `EngineeringSurface.traceKeyed.test.tsx` pins that, given the route's new scope report, the trace panel is drawn while DHF, change requests and non-conformances stay hidden. It was green before the change: the screen needed no change, as `10bbeeeea` said.

**AnA's `create_risk_item` (ruling 4).** It is covered already:

- it is class `confirm` (`tool-authorization.register.json`);
- `registerToolHandler` runs `writeRoleRefusal` and then `foreignProgramRefusal` before the handler;
- `program_id` is in `PROGRAM_ID_FIELDS`.

Nothing pinned this for the risk tool. `risk-tool-admits-program.test.ts` now does, on the `43fb57cc` pattern. It also pins that the tool always inserts status `'open'` and never writes `acceptable`, so AnA cannot accept a residual risk. No second check was added.

## The migration and Rule 1

`migrations/20261029c_design_controls_and_risk_items_program_keys.sql`, in `C2C_MIGRATION_FILES` after 20261029b and before `UUID_TENANT_ISOLATION_NONPUBLIC`:

1. `c2c_design_controls.program_id UUID`, nullable. Existing inputs keep NULL. Nothing guesses a project for them.
2. `idx_c2c_design_controls_org_program` on `(organization_id, program_id, id)` WHERE `program_id IS NOT NULL`.
3. `regulatory_programs_id_org_uq`, created when absent, the same statement 20260926b and 20261029 use.
4. `c2c_design_controls_program_same_org_fk`: `(program_id, organization_id)` → `regulatory_programs (id, organization_id)`, ON DELETE SET NULL (program_id), NOT VALID. This is the hf pattern.
5. `risk_items_program_same_org_fk`, the same composite key, NOT VALID. Ruling: it is added. It is additive and replay-safe. Its delete action is the one the table's existing program key has:
   - **20260507 lineage:** `program_id REFERENCES regulatory_programs(id)` is NO ACTION, so the new key is NO ACTION too. Opposite actions on one column fire in RI trigger-name order, so a program delete would un-anchor on one database and refuse on another (20260926b, the c2c_documents block). A program delete with anchored risks is refused, as it already was.
   - **Drizzle lineage:** no key exists, so the new key is ON DELETE SET NULL (program_id), the hf pattern. A program delete un-anchors its risks and keeps their organization, as it left them before.

Rule 1:

- The file is replayed on every deploy. Every statement runs only when its object is absent (`to_regclass`, `pg_attribute`, `pg_constraint`), so a replay runs no DDL. The delete-action choice in step 5 is made once, when the key is created.
- No DROP, no backfill, no COMMENT.
- `NOT VALID` scans no rows. A legacy cross-organization risk row does not fail the deploy, and it keeps accepting updates that leave its key alone (pinned).
- Both tables are in `public` with `organization_id INTEGER NOT NULL`, so the sweep at the tail of the set already polices them. No table is created.

`tests/schema-contract/design-controls-risk-items-program-keys.pglite.test.ts` runs the real creating DDL on both lineages, deploys twice and replays a third time, and pins:

- the shape;
- legacy rows: the unscoped input stays NULL; the cross-organization risk survives and accepts a status update;
- refusals: another organization's project, a missing project, and a change of key or organization (23503);
- the delete behaviour on each lineage.

## The signature

**Accept residual (item 2).** `PATCH /api/mdx/risk-items/:id` with status `accepted` now runs `signGovernedAct`, wired as `96537cfe` wires the labeling translation approval:

- **Before the ceremony:**
  - `requireEditorAccess`;
  - `whenAccepting` mounts `signedActAttempts` only when the status is `accepted`, so the per-signer limit applies;
  - `refuseUnsignedAcceptability`, below.
- **The ceremony** (`signGovernedAct`):
  - target `risk-item:<id>`, domain `risk`;
  - meanings `DECISION_ACT_MEANINGS` (approval, responsibility);
  - the components, then the meaning, then signing authority, then `reverifySigner`, each before anything is written;
  - then, on the request's pinned connection: BEGIN, the tenant context and the advisory lock;
  - the domain write: `SELECT … FOR UPDATE` on the organization's live row, then one `UPDATE risk_items SET status = 'accepted', acceptable = TRUE`;
  - then the `sign` ledger pair, the `electronic_signatures` row, and COMMIT.
- **What the ledger and the signature manifest record:** the hazard as it stood. That is the id, ref code, project, hazard, harm, previous status, severity, probability, initial and residual figures, the previous acceptability and whether a rationale was recorded.
- **Refusals,** each ending "Nothing was signed.":
  - 404 `RISK_ITEM_NOT_FOUND`;
  - 409 `RISK_ALREADY_ACCEPTED`;
  - 400 `RESIDUAL_ACCEPTANCE_EDITS_FIELDS` when the same request also edits a field, because the signature covers the hazard as it stands.
- If the signature row fails, the acceptance rolls back.
- Any other status change asks for nothing, as before.
- A create with status `accepted` answers 428 `RESIDUAL_ACCEPTANCE_REQUIRES_SIGNATURE`.

**`acceptable: true` (ruling 1).**

- It is the same judgment: ISO 14971 residual-risk acceptability, which the Risk screen counts as a recorded acceptance.
- A plain PATCH setting it answers 428 `RESIDUAL_ACCEPTANCE_REQUIRES_SIGNATURE` before the body is read. Before this change, `red.txt` shows the route sending `UPDATE risk_items SET acceptable = $1 … [true, 1, 7]`.
- Only the signed run sets it, in the same UPDATE as the status.
- A signed request that also says `acceptable: true` is the one act.
- `false` and `null` record no acceptance and ask for nothing, as before.

**The client.** "Accept residual" in `Risk.tsx` opens the shared `EsignModal` (on `useEsignature`):

- it offers the act's two meanings, with the signer from `useAuthUser` and `requireMfa` from `mfaEnabled`;
- `postResidualAcceptance` sends `{ status: 'accepted', meaning, reason, password, mfaToken }`;
- a 4xx or 401 shows the server's sentence and keeps the dialog open;
- a 5xx, a dropped connection or a reply with no `signedAt` is "unconfirmed", never "nothing was signed";
- the row is adopted from the server's accepted row only after the signature is confirmed.

The old `setStatus` had no other caller and is replaced.

**`ci:sign-ceremony` and its selftest:** both pass (29 of 29).

### The gate's limit (ruling 2)

The gate does not see this act. `npm run ci:sign-ceremony:list` lists no site in `mdx-risk-management.ts` (`sign-ceremony-list.txt`). The gate finds `sign` ledger writes and SQL approval stamps (`approver_id`, `approved_by`, `approved_by_user_id`, `approved_at`). `risk_items` has no stamp column, and the acceptance writes a status and a boolean. A status-only act signed through `signGovernedAct` is therefore invisible to it. A later unsigned `status = 'accepted'` write would be invisible too.

The behavioural tests are the proof here. Mutation M11, which puts the plain PATCH back, is red on the route test and still green on the gate. The gate is not changed in this slice.

## Make the check fail

`mutation-M*.txt`. Each mutation is applied alone, its test is run, and the file is restored byte for byte (sha256 checked in the runner and recorded in each file). `git diff` afterwards shows only this slice's changes.

| Id | Mutation | Test | Result | Restored |
|---|---|---|---|---|
| M1 | design-controls GET drops admitProject | `design-controls-program-scope` | red (6 failed, 12 passed (18)) | yes |
| M2 | design-controls POST drops admitProject | `design-controls-program-scope` | red (7 failed, 11 passed (18)) | yes |
| M3 | design-controls POST drops the editor gate | `design-controls-program-scope` | red (1 failed, 17 passed (18)) | yes |
| M4 | risk list drops admitProject | `mdx-risk-program-scope` | red (5 failed, 30 passed (35)) | yes |
| M5 | risk-summary drops admitProject | `mdx-risk-program-scope` | red (5 failed, 30 passed (35)) | yes |
| M6 | risk create and update drop admitProject (writeRefused) | `mdx-risk-program-scope` | red (10 failed, 25 passed (35)) | yes |
| M7 | risk POST /risk-items drops the editor gate | `mdx-risk-program-scope` | red (1 failed, 34 passed (35)) | yes |
| M8 | risk PATCH /risk-items/:id drops the editor gate | `mdx-risk-program-scope` | red (2 failed, 33 passed (35)) | yes |
| M9 | risk POST controls drops the editor gate | `mdx-risk-program-scope` | red (1 failed, 34 passed (35)) | yes |
| M10 | risk PATCH controls drops the editor gate | `mdx-risk-program-scope` | red (1 failed, 34 passed (35)) | yes |
| M11 | accepting goes back to a plain PATCH (no signature) | `mdx-risk-accept-residual-signature` | red (21 failed, 12 passed (33)) | yes |
| M12 | acceptable:true without a signature is let through | `mdx-risk-accept-residual-signature` | red (2 failed, 31 passed (33)) | yes |
| M13 | a hazard can be created already accepted | `mdx-risk-accept-residual-signature` | red (1 failed, 32 passed (33)) | yes |
| M14 | the signed acceptance stops setting acceptable | `mdx-risk-accept-residual-signature` | red (1 failed, 32 passed (33)) | yes |
| M15 | the signed acceptance runs off the signing transaction (pool) | `mdx-risk-accept-residual-signature` | red (3 failed, 30 passed (33)) | yes |
| M16 | the signing-attempt limit is skipped | `mdx-risk-accept-residual-signature` | red (1 failed, 32 passed (33)) | yes |
| M17 | engineering trace reads the organization again | `mdx-engineering-trace-by-project` | red (3 failed, 3 passed (6)) | yes |
| M18 | engineering reports the trace as the organization's | `mdx-engineering-trace-by-project` | red (3 failed, 3 passed (6)) | yes |
| M19 | Accept residual opens no dialog | `riskAcceptResidualSigned` | red (8 failed (8)) | yes |
| M20 | the signed acceptance sends no password | `riskAcceptResidualSigned` | red (1 failed, 7 passed (8)) | yes |
| M21 | an answer with no signature is shown as accepted | `riskAcceptResidualSigned` | red (1 failed, 7 passed (8)) | yes |
| M22 | DesignControls reads the organization with a project open | `designControlsReadsOpenProject` | red (1 failed, 6 passed (7)) | yes |
| M23 | DesignControls draws an answer not keyed to the project | `designControlsReadsOpenProject` | red (3 failed, 4 passed (7)) | yes |
| M24 | a new design input names no project | `designControlsReadsOpenProject` | red (1 failed, 6 passed (7)) | yes |
| M25 | the AnA wrapper stops asking program ownership | `risk-tool-admits-program` | red (5 failed, 4 passed (9)) | yes |
| M26 | the migration adds no risk_items key | `design-controls-risk-items-program-keys.pglite` | red (5 failed, 7 passed (12)) | yes |
| M27 | the risk key always nulls the program (ignores the existing key) | `design-controls-risk-items-program-keys.pglite` | red (1 failed, 11 passed (12)) | yes |
| M28 | the migration adds no design-controls column | `design-controls-risk-items-program-keys.pglite` | red (1 passed, 11 skipped (12); the setup fails (42703)) | yes |

28 of 28 red, each on its own target. All seven mutated files hash the same as before the run (`sha256sum -c`). The only difference in `git diff` between before and after the run is in `server/routes/mdx-labeling.ts`, which another session edited at the same time. M25 mutates `AnaToolExecutor.ts`, the wrapper: removing `foreignProgramRefusal` sends the risk INSERT under a foreign, missing or deleted id, so the existing wrapper is what the pin holds. M11 (the plain PATCH back) is red on the route test and would be green on `ci:sign-ceremony`, which is the gate limit above.

## Not done

- **The sign gate cannot see a status-only signed act** (above). The fix is a gate change, or a stamp column on `risk_items`. Neither is in this slice.
- **The tenant purge omits `risk_items` (ruling 5).** `server/services/tenant/tenant-offboarding.ts` `PURGE_CHILD_TABLES` does not list `risk_items` or `risk_controls`.
  - On the 20260507 lineage, its NO ACTION program key already makes the purge of a tenant with project-anchored risks fail at `regulatory_programs` (23503). The new key does not change that.
  - On the drizzle lineage, the risks are left behind.
  - Not changed here.
- **Separation of duties.** `risk_items` records no author, so there is no one to compare the signer with. The route ceremony leaves it out, as it does for labeling.
- **No content digest binder for a risk item.** The signature binds the ledger chain hash, with that basis named (`persistGovernedSignSignature`).
- **Acceptance of an unestimated residual.** A hazard with no residual estimate can still be accepted. Whether that should be refused is a domain rule for the founder, not this slice.
- **Viewers still see Accept residual.** The server refuses them (403, pinned).
- **Not in this slice:** `Risk.tsx` still reads the organization's register with no project (plan "What already exists", `:154`), and Add hazard sends no `programId`. Both are item 4, along with the rest of the EngineeringSurface extension and the `risk.*` AnA actions moving. The fold itself is item 5.
- **The other three Engineering panels** (DHF, change requests, non-conformances) and the documents panel are still read by organization and still hidden under a project. Their stores have no project column.
- **Not run:** the rest of `tests/schema-contract`. Only the tenant-isolation sweep contract (20 of 20) and this slice's PGlite test (12 of 12) were run, one file at a time.

## Files

- **Route changes:** `server/routes/design-controls.routes.ts`, `server/routes/mdx-risk-management.ts`, `server/routes/mdx-engineering.ts`.
- **Client changes:** `client/src/concept2cure/v2/surfaces/Risk.tsx` (the Accept residual control only), `client/src/concept2cure/v2/surfaces/DesignControls.tsx` (the open project and `meta.scope` only).
- **Migration:** `migrations/20261029c_design_controls_and_risk_items_program_keys.sql` and its entry in `scripts/db/migration-set.mjs`.
- **New tests:**
  - `server/routes/__tests__/design-controls-program-scope.test.ts`
  - `server/routes/__tests__/mdx-risk-program-scope.test.ts`
  - `server/__tests__/routes/mdx-risk-accept-residual-signature.test.ts`
  - `server/routes/__tests__/mdx-engineering-trace-by-project.test.ts`
  - `server/services/ana/__tests__/risk-tool-admits-program.test.ts`
  - `client/src/concept2cure/v2/__tests__/riskAcceptResidualSigned.test.tsx`
  - `client/src/concept2cure/v2/__tests__/designControlsReadsOpenProject.test.tsx`
  - `client/src/concept2cure/mdx/surfaces/__tests__/EngineeringSurface.traceKeyed.test.tsx`
  - `tests/schema-contract/design-controls-risk-items-program-keys.pglite.test.ts`
- **Existing tests updated (ruling 6):** a role was added to the user stub, and no assertion was changed.
  - `server/routes/__tests__/design-controls-write.test.ts`
  - `server/routes/__tests__/mdx-risk-recompute.test.ts`
  - `server/routes/__tests__/mdx-risk-assignee-membership.test.ts` (its `orgMembership` mock now keeps the real `requireEditorAccess` through `importOriginal`)
- **Evidence:** `red.txt`, `green.txt`, `eslint.txt`, `typecheck.txt`, `sign-ceremony-list.txt`, `mutation-M*.txt`.

Typecheck: `npm run -s typecheck:fast` over the whole tree exits 0 with no diagnostics (`typecheck.txt`).

eslint, plain, on every changed and new file: 0 errors and 11 warnings, against 13 at head on the five source files:

| File | Head | Now | Note |
|---|---|---|---|
| `design-controls.routes.ts` | 1 | 0 | |
| `mdx-risk-management.ts` | 2 | 1 | The unused `getUserId` is gone. |
| `mdx-engineering.ts` | 1 | 1 | |
| `Risk.tsx` | 7 | 7 | |
| `DesignControls.tsx` | 2 | 2 | |

The new test files add none. The `mdx/surfaces/__tests__` file is outside eslint's patterns.
