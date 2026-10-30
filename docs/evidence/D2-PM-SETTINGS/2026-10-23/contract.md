# D2 Projects — PM-06 settings contract

## What already exists

The pre-design inventory is in [README.md](README.md#what-already-exists), captured at `df869f281`. Existing ProjectHome displays the UUID program; `programme-profile-write.ts` owns description, priority and target-date writes; `project-route-access.ts` owns current actor/project admission; existing transaction/audit services own regulated history. The integer legacy PATCH is another entity and cannot stand in for this program. No canonical ownership-transfer policy was found. No parallel profile writer, settings store or permission policy will be introduced.

## Frozen bounded completion

Reach settings from the existing ProjectHome header. Only `description`, `priority` and `targetSubmissionDate` may change, through `applyProgrammeProfilePatch`. Keep name/code, product and filing identities, lead/ownership, client placement, roster, lifecycle/status, metadata/settings JSON and all other fields outside this input. The existing canonical device-profile endpoint and its entitlement remain unchanged. Ownership transfer requires its own retained policy and is not implemented or implied here.

No schema, dependency, new top-level surface, second profile writer or parallel session/permission store. A target-date edit does not regenerate plans or change milestone actuals, approved evidence, document/signature versions or submitted history. Existing readers naturally see the edited program columns.

## Wire

Existing projects router gains `GET /api/c2c/projects/:id/settings` and `PATCH /api/c2c/projects/:id/settings`.

GET success is `{success:true,data:{programId:string,projectId:number,organizationId:number,actorUserId:number,clientWorkspaceId:number|null,canChange:boolean,revision:string,description:string|null,priority:'low'|'medium'|'high'|'critical',targetSubmissionDate:string|null}}`. All identities and capabilities derive from current saved scope, not an echoed claim. `projectId` is the canonical positive integer anchor, `programId` the real UUID. Reads still require current active actor/program/sharing admission. An authorized reader lacking mutation authority receives `canChange:false`; archived programs are read-only. Failed verification is an unavailable response, never blank defaults.

PATCH body is strict at both levels: `{revision:string,reason:string,patch:{description?:string|null,priority?:'low'|'medium'|'high'|'critical',targetSubmissionDate?:string|null}}`. Refuse unknown or forbidden keys, empty patch, unchanged-only patch, malformed revision, missing/short reason, invalid dates or non-string descriptions. Description is bounded to 4000 characters and canonical blank/whitespace/null clears it; priority has no fabricated default. Date is a real `YYYY-MM-DD` in years 0001–9999 or null to clear, using the existing calendar-day validator extracted to shared code and re-exported from its old server path. Reason reuses the existing governed 8–2000-character rule.

PATCH success is the same scoped data envelope plus `meta:{auditTrail:{persisted:true,chained:true},changedFields:('description'|'priority'|'targetSubmissionDate')[]}`. Changed fields are unique/nonempty and actually changed. The new revision differs from the supplied revision, and saved values agree with every supplied normalized patch field. Clients require the exact program/actor/org/anchor/client, saved values, revision and chained-audit receipt before calling a save confirmed. A pending-store marker is never a successful receipt.

`revision` is opaque `v1:` plus 64 lowercase hex characters: the existing SHA-256 helper over a fixed-key object binding organization, program UUID, canonical anchor/workspace, `xmin::text` and exact `updated_at::text`. It is not a permission token or schema column. Read and compare it under the program row lock. An anchor/workspace change or any committed program-row change retires the old revision; return 409 `PROJECT_SETTINGS_STALE`, requiring an explicit reload. Supplied `x-client-id` is only a consistency claim; malformed claims refuse, mismatches refuse, and no claim grants admission or moves a parent. PATCH uses the canonical workspace returned by its verified GET even when the global selector was initially empty.

## Admission, transaction and audit

Reuse `requireProjectRouteAccess` and the existing Projects `canCreateProgram`/`canMutateProgram` decision using the freshly admitted role and saved lead. A share Edit grant or display roster alone is not the existing program-management policy. Do not substitute the separate stricter governed-record role helper or a stale JWT role. Recheck in the actual transaction and before commit; current actor locks are retained. Deleted, foreign, private/unshared or unresolved anchors remain refused through canonical admission.

PATCH owns its pool connection and BEGIN/COMMIT/ROLLBACK in the existing verified tenant ALS. Take the program `FOR UPDATE` before calling `requireProjectRouteAccess(...forShare:true)`: taking its program SHARE lock first would let two editors deadlock upgrading. Repeat the canonical scope after the row lock and ensure the anchor/workspace and any claim remain exact. Preserve current row/actor/reservation scope until commit.

Use `drizzle(client)` with `applyProgrammeProfilePatch` and its existing canonical schema, after the strict three-key input check. The writer's audit callback calls `writeChainedAuditRow` on that same client. Record actual actor, reason, changed fields, before/after values, anchor/workspace and before/after revisions. Audit failure rolls the profile change back. Read and validate the final saved receipt on this client before COMMIT, so no post-commit projection read is needed. Emit persisted/chained success only after acknowledged commit.

A thrown COMMIT or unacknowledged rollback discards the owned connection exactly once and returns 503 `PROJECT_SETTINGS_OUTCOME_UNKNOWN`; never claim that no save happened. Do not issue further SQL on that uncertain connection or clear session scope through a second connection wrapper. Confirmed refusals do not write or audit. No provider/recipient operation is part of this transaction.

## UI and session ownership

Mount `ProjectSettings({programId,onSaved})` at the retained header location, within the existing ProjectHome. Lazy authoritative GET opens a named panel; only `canChange:true` enables editing. Reuse the governed confirmation dialog for reason/review and existing form/CSS controls. Show the target as a recorded target whose milestone replanning is a separate action.

Reuse captured actor headers, existing auth session revision and shell-project guards and tenant workspace ownership. Retire fields, notices and late replies on account/role/session/org/workspace/program changes, including A→B→A; ordinary same-account bearer refresh remains valid. Do not publish parent refreshes from retired responses. Capture guards before each read/write and check again after async boundaries and before callbacks. No scope fallback to an arbitrary organization or workspace.

The settings owner remains mounted outside its collapsed panel. A synchronous pending ref prevents duplicate save and panel close/Escape while saving. Network/status-0/5xx, explicit unknown outcome and malformed successful receipts block another submission across panel close/reopen until an explicit authoritative reload. A stale 409 likewise requires reload; no automatic replay. Reload reports current saved facts without claiming that an earlier uncertain write/audit succeeded. A verified current success calls one parent callback to refresh metadata and activity through a local read epoch, preserving the open workflow tab and unrelated evidence/schedule state.

## Qualification and publication

Show meaningful fail-first HTTP/PGlite and UI regressions before correction, then pass canonical writer/device/date callers and relevant ProjectHome regressions. Root owns shared wire guards/tests, native PostgreSQL evidence with restricted role/FORCE RLS, two-client concurrent stale-edit serialization, actual update+chained audit rollback, lost actual COMMIT acknowledgement, untouched actuals/history sentinels, and desktop/phone component browser evidence with honest synthetic auth/API seams. This does not claim deployed authentication, live customer testing or new ownership-transfer policy.

Root owns branch/merges/commit/push. Workers own disjoint server and UI scopes. Run scoped lint, build and whole-program TypeScript without weakening baselines; normal direct push hooks remain required. Preflight TypeScript before opening the push connection reduces the concurrent-ref window. No PR, force push, hook bypass or production deployment. Retain final source hashes and actual remote publication/hosted-CI state.
