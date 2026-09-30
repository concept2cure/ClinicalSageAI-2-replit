# Protocol-dev & eCTD co-author sign-off gap — Part 11 UX audit, 2026-09-28 follow-up

Head: `232ecae9c` (`concept2cure-v2`). Read-only throughout; no gate run with `write-baseline`; no repository writes made. Local reference Postgres was not needed — both findings are pure code-path/wiring defects, confirmed by reading the route and middleware source directly, not by exercising live data.

Scope, per the assignment: `client/src/concept2cure/v2/surfaces/ProtocolDev*.tsx` and their server routes/services for every governed write, then the eCTD co-author sign-off chain end to end (`EctdCoauthor.tsx` → the shared sign-off dialog → `POST /api/ana-ri/governed-action` → the write) for tier, reason, re-authentication and signature manifestation.

## Findings, most severe first

### GP-P-1 — blocker — the entire protocol-development family has no role check outside its two signing routes

`server/routes/protocol-development.ts:183` (and the same pattern in `protocol-risks.ts`, `protocol-budget.ts`, `protocol-soa.ts`, `protocol-deviations.ts`, `protocol-reviews.ts`)

Every one of these routers is mounted with only `authMiddleware` (`server/bootstrap/register-inline-routes.ts:592` etc.) — authentication, not authorization. `requireEditorAccess` (`server/middleware/orgMembership.ts:531`, which enforces `GOVERNED_WRITE_ROLES`) is applied to exactly two routes across the whole family: `POST /documents/:id/finalize` and `PATCH /assignments/:id/disposition` — the two true electronic-signature acts. Every other governed write — create a protocol document, edit a section, add objectives/eligibility/visits, reassign the study team, request and assign a reviewer, patch the cover page, bind/unbind a study design, apply a derivation, update a risk's residual rating, add a budget line, assess or close a deviation — runs with no role check at all. The client adds no hiding either: `ProtocolDevWorkspace.tsx:318`'s `canWrite` is a document-id validity check, not a role check, and every register form renders every action fully enabled regardless of who is looking at it.

A viewer-role account — the exact role the family's own signing routes correctly turn away with 403 — can create and edit regulated protocol content end to end through this surface. This is the same class of defect the parent 2026-09-28 review found and fixed in AnA's tool-confirmation layer (`writeRoleRefusal` in `AnaToolExecutor.ts`) — but that fix does not touch this code path at all: these are plain HTTP routes, never dispatched through AnA's tool executor.

### GP-P-2 — blocker — the eCTD sign-off dialog collects a §11.50 meaning that the governed-action route then discards or overwrites

`server/routes/ana-ri/utility.ts:691` vs. `client/src/concept2cure/components/ana/GovernedActionSignoff.tsx:115,217-231`

`EctdCoauthor.tsx`'s sign-off prompts (`EctdSignoffs` → `SignoffList` → `GovernedActionSignoff`) require the signer to pick a §11.50 meaning (Authorship / Review / Approval) for every `esignature`-tier command — exactly the commands an eCTD-authoring chat turn proposes (`place_in_dossier`, `revert_to_version`, `create_submission_package`, among others). The chosen meaning travels as `params.signatureMeaning`. `POST /api/ana-ri/governed-action` re-verifies the password/MFA correctly, then builds the execution context with `signaturePurpose: 'approval' as const` — a literal, ignoring what was actually selected — and the pre-execution audit row omits the meaning entirely. The handlers behind the writes that actually succeed from this chain (`placeInDossier`, `createSubmissionPackage`) never persist an `electronic_signatures` row or read the meaning at all. The one handler that does read and persist it (`k510_workflow.transmit`, in `mdx-command-handlers.ts:768`) therefore always records "approval," whatever the signer chose.

The signer re-authenticates and declares a specific meaning; the record either has no signature at all, or has the wrong one. Both are §11.50 manifestation failures, and this is a "the server ignores the control" pattern, not merely a UI display gap.

### GP-P-3 — medium — deviation closure is ledger-labeled and audit-UI-bucketed as a signature though none occurs

`server/routes/protocol-deviations.ts:192`

`POST /deviations/:id/close` runs the plain governed-write helper (no role check, no re-authentication, no electronic-signature record) with `command: 'sign'`. The audit ledger's `deriveKind()` (`audit-trail-ledger.routes.ts:147-169`) tokenizes `c2c.work.sign` and buckets it under `'esign'` — the same category real electronic signatures land in, including in the admin audit view's color/count breakdown (`AdminSurfaces.tsx:1030-1036`). An auditor reading the ledger by signature category would see this event as a signed record when no signing ceremony ever ran.

## What was checked and found sound (not findings)

- Re-authentication on the `/governed-action` path is real: `reverifySigner` (password + conditional TOTP) is invoked server-side and never trusts a client-asserted flag.
- The audit-before-execute ordering in `utility.ts` is correct and fail-closed (an unpersisted sign-off audit row aborts the action).
- `ProtocolDevSigning.tsx` / `signProtocolAct` (the two real signing acts in this family) correctly implement re-authentication, §11.50 meaning, reason capture and role gating — these are the model the rest of the family and the AnA chain should be brought up to.
- `setDispositionTx` correctly refuses a disposition signed by someone other than the assigned reviewer (separation of duties for that one act).

## Coverage

See the `covered` / `not_covered` fields for the exact file-by-file trace. In short: every route in the protocol-development/protocol-risks/protocol-budget/protocol-soa/protocol-deviations/protocol-reviews family was checked for a role gate (exhaustive for that question); sibling routers in the same mount block (amendments, consent, milestones, export, portfolio, templates) were not opened and should be assumed to carry the same gap until checked. The eCTD chain was traced through every handler an esignature-tier command reachable from that pane can hit; `command-rbac.ts`'s `authorizeCommand` (which runs after the Part 11 gate in `command-executor.ts`) was not read and might independently restrict which roles can reach these commands via chat specifically — that would not change GP-P-2 (the meaning is falsified/dropped regardless of who is authorized to trigger it), and would not touch GP-P-1 (the direct HTTP routes, a separate path with no AnA involvement at all).

---

**Covered.** Read the 2026-09-28 six-lens README + part11-ux.md (both the main pass and the ectd-lane-second-pass) and the 2026-09-24 part11-ux.md to identify exactly what this gap owed and what was already reported (so as not to duplicate). Traced, at head 232ecae9c, read-only, no write-baseline gates run:

1. The full ProtocolDev* client family for governed-write call sites: ProtocolDevSigning.tsx (the two true e-signature acts, finalize + disposition — both correctly run signProtocolAct/EsignModal with re-auth, §11.50 meaning and reason, and are role-gated server-side), ProtocolDevWrites.ts (the write layer — every call site, its client-side reason floor and error handling), ProtocolDevWorkspace.tsx (canWrite derivation), ProtocolDevForms.tsx, ProtocolDevReviews.tsx, ProtocolDevDesign.tsx, ProtocolDevSoa.tsx, ProtocolDevSection.tsx, ProtocolDevDerivation.tsx (all client-side gating, confirmed none check role).
2. Every server route file the writer module calls: server/routes/protocol-development.ts (full file, all ~20 routes), protocol-reviews.ts, protocol-risks.ts, protocol-budget.ts, protocol-deviations.ts, protocol-soa.ts — read in full or grepped exhaustively for `requireEditorAccess`/role checks against every `router.post/patch/put`.
3. Confirmed the mount chain (server/bootstrap/register-inline-routes.ts) applies only `authMiddleware` (authentication, no role) to every one of these routers, and confirmed `authMiddleware` (server/auth.ts) and `requireEditorAccess`/`GOVERNED_WRITE_ROLES` (server/middleware/orgMembership.ts) are genuinely separate middlewares — the latter must be applied per-route and is not.
4. The eCTD co-author sign-off chain end to end: EctdCoauthor.tsx (full file) → SignoffList.tsx → client/src/concept2cure/components/ana/GovernedActionSignoff.tsx (the shared Part 11 sign-off dialog) → useGovernedAction.ts (the client POST) → server/routes/ana-ri/utility.ts's `POST /governed-action` handler (full handler read) → server/services/ana-ri/part11-governance.ts (tier tables, `validateSignoff`) → server/services/ana-ri/command-executor.ts (the handlers for every esignature-tier command: `placeInDossier`, `revertToVersion`(location confirmed via grep), `createSubmissionPackage`, `freezeDocument`, `signDocument`, `submitDocument`) → server/services/ana-ri/mdx-command-handlers.ts (the one place `ctx.signoff.signaturePurpose` is actually read and persisted, for `k510_workflow.transmit`).
5. Confirmed re-authentication is real (`reverifySigner`, password + conditional TOTP, never a client-asserted flag) and the sign-off audit-before-execute ordering is sound — these are NOT findings.
6. A supporting check of `server/routes/audit-trail-ledger.routes.ts`'s `deriveKind()` to verify how a `c2c.work.sign` ledger action is classified in the audit-trail/admin surfaces.

**Not covered.** - protocol-amendments.ts, protocol-consent.ts, protocol-milestones.ts, protocol-export.ts, protocol-portfolio.ts, protocol-templates.ts — mounted alongside the same family, not opened; the pattern found here (no per-route role check outside the two signing routes) should be assumed to repeat until checked.
- ProtocolDevProjections.tsx, ProtocolDevPanes.tsx, ProtocolDevCompliance.tsx — skimmed for role-gating language only (none found), not read line-by-line for every write path.
- The underlying `*Tx` service functions in server/services/protocol-development/, protocol-reviews/, protocol-deviations/ were spot-checked for a role check (none found) but not read in full for other defects (e.g. tenant-scoping SQL correctness).
- On the eCTD chain: `revertToVersion`'s and `erasePersonalData`'s full bodies were not read in full (only grepped/located); `createSubmissionPackage`, `placeInDossier`, `freezeDocument`, `signDocument`, `submitDocument` were read in full. `command-rbac.ts`'s `authorizeCommand` (the role/RBAC gate that runs AFTER the Part 11 gate in command-executor.ts) was not read — it is possible it independently blocks a viewer from reaching `place_in_dossier`/`create_submission_package` via chat even though the HTTP-route family in finding GP-P-1 has no such gate; this would narrow GP-P-1's blast radius for the *chat* path specifically but does not touch the direct-HTTP-route path GP-P-1 documents, nor does it change GP-P-2 (the meaning-manifestation defect is present regardless of who is authorized to trigger it).
- No live-database verification was needed for either finding (both are pure code-path/reachability defects, confirmed by reading the route/middleware wiring), so the local reference Postgres was not used.
- Did not verify whether any other AnA esignature-tier command (outside command-executor.ts) reads `ctx.signoff.signaturePurpose`; the grep for that exact accessor found the one site reported.

## Independent verification

Each finding went to three agents, each told to refute it through one lens: reachability, reproduction or intent. A finding is confirmed when two of the three could not. Low findings had one reproduction verifier.

### GP-P-1 — **confirmed** (3 of 3)

- **reach** — real: I could not refute it. The code is reachable in production and nothing else stops a viewer. HEAD is 494b4fc14.

What I checked:

(1) The routers are mounted. `startup/routes.ts:173` calls `registerInlineAiWorkflowRoutes`. That function mounts `/api/protocol-development` (register-inline-routes.ts:592), `/api/protocol-risks`, `/api/protocol-deviations` (:621), `/api/protocol-reviews` (:630), `/api/protocol-soa` (:729) and `/api/protocol-budget` (:738), each with only `authMiddleware`. None of the six router files has a `router.use(...)`.

(2) Nothing upstream checks the role.
- `authMiddleware` (server/auth.ts:186-300) only authenticates. It looks up the membership and sets `req.userRole` from `organization_users.role`.
- The global `/api` chain is betaRouteFence, authBoundary and validateTenantContext. None of them contains a role check.
- betaRouteFence blocks only the prefixes in `BETA_ROUTE_FENCE_PREFIXES`, and no deploy config sets that variable.
- The RLS `tenant_isolation_policy` on `protocol_documents`, `protocol_sections` and `protocol_risks` filters by tenant only. I confirmed this with `pg_policies` on c2c_full.
- `recordGovernedAction` (c2c/actions.ts:341) writes the ledger row and checks no role.
- The service functions (for example `createProtocolDocumentTx`) check no caller role. The one `GOVERNED_WRITE_ROLES` use in `protocol-reviews-service.ts:71` checks the reviewer being assigned, not the caller.
- The role gate that 370d9a75 added covers the Vault services only.

(3) A viewer is a normal member: `shared/schema.ts:1217` defaults `organization_users.role` to `'viewer'`.

(4) The client exposes the controls. The surface `protocol-dev` is registered: `surfaceViews.ts:549` maps it to ProtocolWorkspace, and the registry lists it under 'Author & assemble' (registryModel.ts:690/717/982/994). `ProtocolDevWorkspace.tsx:318` sets `canWrite` from the document id only, so a viewer sees every write control enabled.

(5) Reproduced. I wrote a throwaway tsx probe in the scratchpad. It mounts each real router behind a stub that sets `userRole='viewer'` and sends empty bodies, so validation stops before any write and nothing reached the database. Results:
- POST /documents: 400
- PATCH /sections/1: 400
- POST /documents/1/team: 400
- protocol-risks POST /documents/1/risks: 400
- protocol-reviews POST /documents/1/reviewers: 400
- protocol-budget POST /documents/1/items: 400
- protocol-deviations POST /deviations/1/close: 400
- POST /documents/1/finalize: 403
- PATCH /assignments/1/disposition: 403

Each write route passed the viewer through to the body validator. The two signing routes refused with 403. With a valid body and reason, the write handlers go straight to `governed()`, which runs BEGIN, the write and the ledger row, then COMMIT. So a viewer's governed write commits.

(6) This is new. The 2026-09-22 and 2026-09-24 reviews record the protocol signing fix (P1) and the role gates for tasks (T2), QMS (Q2) and Vault. The 2026-09-26 and 2026-09-28 reviews record DP-38 and the AnA QMS tools. None records the HTTP write routes of the six protocol routers as lacking a role gate. No CI baseline lists them either.

Scope: I traced every mutating route in protocol-development.ts and listed the mutating routes in the five sibling routers. I probed 9 routes directly and confirmed the rest by reading the code: none of them has `requireEditorAccess` or a `router.use`. I did not check protocol-amendments or the other protocol-* routers mounted nearby (IACUC, consent, portfolio), nor the AnA protocol tools that reach the same services (security.md 2026-09-24 lists 25 of them).

- **repro** — real: I reproduced this at HEAD 494b4fc14. That is two commits past 232ecae9c, and neither of those commits touches these files.

**How it was run.** A throwaway vitest file in the scratchpad (since deleted) mounted the real `server/routes/protocol-development.ts` and `server/routes/protocol-reviews.ts` routers. It stubbed the db, the ledger writer and the Tx service functions the same way `server/routes/__tests__/protocol-signatures.routes.test.ts` does. The request carried exactly what `server/auth.ts:186` authMiddleware sets for a viewer: `userRole` 'viewer', `user.role` 'viewer', `tenantContext.role` 'viewer'.

**Results:**
- **Create a document:** `POST /api/protocol-development/documents` with a valid body and reason returned **201** `{"id":77,"sectionsSeeded":10,...}`. The write log was `BEGIN | CREATE_TX | LEDGER:create:11 | COMMIT`. The document and the ledger row were committed for the viewer.
- **Finalize (control):** `POST /api/protocol-development/documents/77/finalize` returned **403** `{"error":"Insufficient permissions"}`. So `requireEditorAccess` does refuse this principal where it is mounted.
- **Assign a reviewer:** `POST /api/protocol-reviews/documents/77/reviewers` returned **201**. The write log was `BEGIN | ASSIGN_TX | LEDGER:create:11 | COMMIT`.

**Why nothing else stops it:**
- **Where the gate is used.** `requireEditorAccess` is imported and used only at `protocol-development.ts:496` (finalize) and `protocol-reviews.ts:165` (disposition). Neither file has a `router.use`.
- **Unguarded routes.** Every other mutating route has only the handler, with no role check:
  - protocol-development.ts: :183, 220, 242, 266, 281, 328, 358, 374, 387, 400, 414, 430, 446, 466, 480
  - protocol-reviews.ts: :106, 127, 140
  - protocol-risks.ts: :85, 105
  - protocol-budget.ts: :58, 71
  - protocol-soa.ts: :57, 70, 81
  - protocol-deviations.ts: :98, 124, 161, 174, 187
- **Mounts.** `server/bootstrap/register-inline-routes.ts:592/601/621/630/729/738` mount all six routers with `authMiddleware` only.
- **No role check below the route.** `authMiddleware` checks membership, tenant scope, lifecycle and quota, but not role. `governed()`/`governedScoped()` (protocol-development.ts:95-163) only resolve the user and org ids. `recordGovernedAction` (server/routes/c2c/actions.ts:341) never looks at role.
- **Database.** In the reference DB (read-only `pg_policies` query), the RLS policies on `protocol_documents`, `protocol_sections` and `protocol_review_assignments` key on tenant and org only, never on role.
- **Other `/api` middleware.** None of it filters writes by role: `authoringObjectAuthorization` only covers the authoring prefix, and the other global middleware was checked by grepping for `viewer`.
- **Client.** `client/src/concept2cure/v2/surfaces/ProtocolDevWorkspace.tsx:318`: `canWrite = Number.isInteger(numericDocId) && numericDocId > 0` does not depend on role. No `ProtocolDev*.tsx` file reads `userRole` or `GOVERNED_WRITE_ROLES`.

**Not already reported.** No open entry in `docs/evidence/reviews/2026-09-24`, `-26` or `-28` covers these routers. The only mentions are 09-24 P1 (the signing routes, fixed), the AnA-tool role findings, and the 09-28 coverage notes listing the ProtocolDev family as not traced.

**Covered:**
- a live reproduction of 2 of the 32 routes: create, and reviewer assign
- a live control on finalize
- a static read of the route list and mounts for all six routers
- the auth middleware chain
- the governed helper
- the RLS policies on three tables

**Not covered:**
- live runs of the other 30 routes. They share the same mount and the same helpers, and grep shows no route-level gate on any of them.
- risks, budget, SoA and deviations were not run; that finding rests on grep plus the shared mount.
- the client pane files other than ProtocolDevWorkspace.tsx:318, beyond the grep for role-reading.
- the AnA tool equivalents of these writes. The 09-24 security.md table already records those as missing a role gate.

- **intent** — real: I could not refute it. The gap is not a deliberate design decision, and the repository's own rules and code say the viewer role must not write.

Checked on the working tree at HEAD 494b4fc14. The task named 232ecae9c, but none of the cited lines differ in a way that matters.

1. **The mount has no role gate.** server/bootstrap/register-inline-routes.ts:592 mounts /api/protocol-development with only authMiddleware. Lines 601, 621 and 630 do the same for protocol-risks, protocol-deviations and protocol-reviews. No /api-wide middleware in server/startup/middleware.ts (authBoundary, validateTenantContext and the rest) checks the role on a write.

2. **The router imports the gate but applies it once.** server/routes/protocol-development.ts:52 imports requireEditorAccess, and it appears only on POST /documents/:id/finalize (:496). The shared governed() and governedScoped() helpers (:95-160) resolve the user and org from the JWT and write a recordGovernedAction ledger row. Neither checks a role. recordGovernedAction's own role check (c2c/actions.ts:694-707) is off by default. POST /documents (:183) and every other mutation run with no gate.

3. **The sibling routers have no gate on any of the listed writes.**
   - protocol-risks (:85, :105), protocol-budget (:58, :71), protocol-soa (:57, :70, :81) and protocol-deviations (:98, :124, :161, :174, :187) have zero requireEditorAccess, requireRole or userRole references.
   - protocol-reviews gates only :165 (the disposition signature). :106, :127 and :140 are open.

4. **The repository's intent is explicit: a viewer is read-only.**
   - server/middleware/auth.ts:370 maps `viewer → nothing (read-only is the point)`.
   - GOVERNED_WRITE_ROLES (orgMembership.ts:503-511) excludes viewer.
   - program-access.ts:64-83 says "a role that is explicitly read-only cannot write."
   - The comment at protocol-development.ts:60 cites §11.10(g) for the viewer refusal, but it is applied only to signing.

5. **Recent commits treat this same gap as a defect elsewhere.**
   - T2 (tasks, 2026-09-22), fixed by a7955fc10.
   - Q2 (QMS routes), fixed by 6582e3a3.
   - 370d9a75 (the Vault write services).
   - Commit 41e7c539f gated the AnA path for create_protocol_document. Its message says "the HTTP routes refuse the same writes (requireEditorAccess)". For this router that is false: the HTTP route is now the open door that commit believed was closed.

6. **No test or commit records the ungated writes as a choice.** No test or commit message says a viewer may write protocol content. The only viewer tests, in protocol-signatures.routes.test.ts:180 and :303, pin the refusal for signing.

7. **The client offers every write to everyone.** The canWrite flag in ProtocolDevWorkspace.tsx:109/131 is not role-derived, so the controls are enabled for a viewer.

8. **Not already recorded.** The 09-24, 09-26 and 09-28 review files do not list these HTTP routes as open. 09-28's part11-ux.md:41 and README:46 explicitly say the ProtocolDev* family was not traced.

**Result:** a viewer can create and edit protocol documents, reassign the study team, assign reviewers, change risk ratings and budget lines, and assess or close deviations. Each write lands in the Part 11 ledger as an authorised governed act by someone never authorised to make it (§11.10(g)).

**Severity:** high rather than blocker by the repo's own precedent (T2 was rated high). Every write stays inside one tenant and is attributed to the real actor.

**Coverage:** I did this by reading the code; I did not run a live HTTP request against the reference database. I read the six routers' mutation route lines, the mount lines, the /api middleware stack, orgMembership, auth.ts role mapping, program-access, recordGovernedAction's role branch, the git log for protocol-development.ts and 41e7c539f, and the review files for 09-22, 09-24, 09-26 and 09-28. I did not open protocol-amendments, protocol-consent, protocol-milestones or protocol-templates. They are mounted the same way (register-inline-routes.ts:612, 639, 702, 711) and likely share the gap, but I did not verify them.

### GP-P-2 — **confirmed** (3 of 3)

- **reach** — real: I could not refute GP-P-2 on reachability, and it is not in the open findings. I checked 2026-09-24/26/28 and ectd-lane-second-pass: part11-ux.md:43-44 for 2026-09-28 says the EctdCoauthor → governed-action chain "was read but not traced end-to-end", and no finding covers the meaning being dropped. Q-0928-3 is a different flow, the GatewayTransmittals display.

**The path is reachable in the production configuration:**
- **Route mounted, no feature flag.** `server/startup/routes.ts:140` calls `registerAiRoutes`, and `server/bootstrap/register-ai-routes.ts:35` mounts `/api/ana-ri` with `authenticateToken` only. `server/routes/ana-ri.ts:61` mounts the utility routes, which include POST `/governed-action` (`utility.ts:558`).
- **Surface registered.** `client/src/concept2cure/v2/surfaceViews.ts:305,468` registers `'ectd-coauthor'`. `EctdCoauthor.tsx:815-816` renders `EctdSignoffs` → `SignoffList` → `GovernedActionSignoff`. The same component is also reached from Shell, ConversationThread, DocumentWorkbench and RbmSurfaces.
- **The model is told to emit these commands.** `orchestrator.ts:665` adds `buildCommandContextForPrompt()` to the system prompt. That lists `COMMAND_REGISTRY`, which includes `place_in_dossier` (`command-executor.ts:4550`), `create_submission_package` (`:4604`) and `revert_to_version` (`:4683`).
- **The e-signature prompt appears whatever the tenant setting.** `post-processing.ts:377` → `processCommandsInResponse` → `executeCommands`. With the per-tenant Part 11 flag off, the propose-only gate (`command-executor.ts:5349`) returns `buildHumanConfirmationRequiredResult`. That result carries `tier: governedTierOf(command)`, which is `'esignature'` for these commands (`part11-governance.ts:157,289`). With the flag on, the result is PART11_SIGNATURE_REQUIRED instead. Either way, `extractPendingSignoffs` (`useGovernedAction.ts:139-147`) turns it into a pending sign-off at the e-signature tier.
- **The client collects and sends the meaning.** `GovernedActionSignoff` requires a meaning when the tier is e-signature (`meaningOk`, :85) and sends it only as `params.signatureMeaning` (:115).

**No other layer keeps the meaning:**
- **The route never reads it.** `/governed-action` does not look at `params.signatureMeaning` anywhere in `utility.ts:558-719`. The pre-execution audit row's `details` are `{ command, tier, reasonForChange, eSignRequired, secondFactorVerified }` (:648), with no meaning. The execution context hard-codes `signaturePurpose: 'approval' as const` (:691).
- **For a run AnA is holding, the meaning is lost even earlier.** `resolveAuthorisedAction` takes the params from the run row, not the request body, so the posted meaning never reaches the handler.
- **The only reader records the wrong value.** The only server reader of `ctx.signoff.signaturePurpose` is the `k510_workflow.transmit` handler (`mdx-command-handlers.ts:768`). It passes `meaning: signatureMeaning` to `executeGovernedTransmit`, so a signer who picked Authorship or Review is recorded as `'approval'`.
- **The handler that succeeds today writes no signature.** `placeInDossier` (`command-executor.ts:875-926`) runs only `UPDATE concept2cure_artifacts SET ctd_section`. It writes no `electronic_signatures` row and records nothing about the meaning.
- **Nothing else picks it up.** A grep of `command-executor.ts` finds no generic signature persistence after the handler runs; the only other `signoff` reference is the gate itself (:5306).

**Result:** the signer declares a §11.50 meaning after re-authenticating. That declaration reaches no durable record. The one record that does carry a meaning (the ESG transmit's signature) shows a value the signer may not have chosen.

**Two reservations:**
- **Severity.** I rate this high, not blocker. The re-authentication and the audit row are real, and `freeze_document`, `sign_document` and `submit_document` are propose-only in their handlers.
- **Not run.** I did not run the path against the reference database. This is traced statically.

- **repro** — real: I reproduced this at HEAD 494b4fc14. None of the relevant files differ from 232ecae9c: `git diff --stat` on utility.ts, command-executor.ts, mdx-command-handlers.ts and GovernedActionSignoff.tsx is empty. It is not a duplicate: grep across docs/evidence/reviews/2026-09-2{4,6,8}/ finds no open finding on utility.ts:691 or on the governed-action signature meaning being dropped.

**Client side.**
- GovernedActionSignoff.tsx:33-37 offers the meanings AUTHOR, REVIEWER and APPROVER.
- canSubmit (line 86) requires one of them to be chosen for the esignature tier.
- Line 115 sends the choice as `params.signatureMeaning`.
- EctdCoauthor.tsx:816 reaches this component through EctdSignoffs, then SignoffList.tsx:88, then GovernedActionSignoff.

**Server side.**
- utility.ts:691 hard-codes `signaturePurpose: 'approval' as const`.
- The audit details at line 648 are `{ command, tier, reasonForChange, eSignRequired, secondFactorVerified }`, with no meaning.
- No code under server/ reads `params.signatureMeaning`.
- On a held run, resolveAuthorisedAction (utility.ts:114-120) takes params from the pending run row. The body's `signatureMeaning` is therefore thrown away before execution.
- executeCommands only calls validateSignoff (command-executor.ts:5306).
- placeInDossier (:875), createSubmissionPackage (:1846) and revertToVersion (:2875) contain no `electronic_signatures`, `persistGovernedActionSignature` or `signaturePurpose` reference.
- The only reader of the purpose is mdx-command-handlers.ts:768. It passes the value as `meaning:` into executeGovernedTransmit, so it is always 'approval'.

**Reproduction.** I wrote a scratchpad vitest file that mounts the real mountUtilityRoutes and mocks only reverifySigner, auditService.logAction, executeCommands and run-control, as the repo's governedActionConfirmTier.test.ts does. I ran it with `npx vitest run --config <scratch config>`, and all four requests returned 200.
- POST `place_in_dossier` with `params.signatureMeaning` set to AUTHOR, REVIEWER and APPROVER in turn: every time the executor received `ctx.signoff = {signatureVerified:true, signaturePurpose:"approval", ...}`. The audit details had no meaning field. `params.signatureMeaning` was carried along unread.
- Held-run POST (`runId`/`toolUseId`) for `create_submission_package` with AUTHOR in the body: the executed params were `{"projectId":3}`, so the meaning was gone entirely, and `signaturePurpose` was still "approval".

**Result.** A signer who declares Authorship or Review is recorded with nothing, or with Approval.

**Coverage.**
- Covered: the route, the propose-only executor gate, the three dossier/package/revert handlers, the k510 transmit handler's reading of the purpose, and the client chain from EctdCoauthor to GovernedActionSignoff.
- Not covered: the runtime DB write inside executeGovernedTransmit, which is already documented in the 2026-09-28 part11-ux review; the internals of freeze_document, sign_document, submit_document and erase_personal_data; and a live browser run.
- No repository files were edited and no DB rows were written.

- **intent** — real: I tried to show this was a deliberate design choice and could not. The finding is real; the evidence is below.

1. The value is hard-coded. At HEAD (494b4fc14), server/routes/ana-ri/utility.ts:691 stamps `signaturePurpose: 'approval' as const` on every signoff that is not in the confirm tier. The only explanation near it (lines 688-689) covers `signatureVerified` for the reason tier. Nothing there says the meaning is fixed on purpose. `git blame` puts the line in 94036a279 (2026-09-26, the P0-12 tier refactor), which carried over an earlier literal `signaturePurpose: 'approval'` without changing it. That commit message does not mention the signature meaning.

2. The repository's own comments say a fixed meaning is a defect:
   - server/services/ana-ri/mdx-command-handlers.ts:766-767 (c8c7aad3e, 2026-09-05): "The §11.50 meaning is the signer's declaration, carried on the sign-off. It was hardcoded downstream; a meaning nobody chose is not a signature meaning." The handler refuses when no meaning is present. The route then fills in 'approval' anyway, so that check always passes with a meaning nobody chose.
   - server/services/submission-gateways/governed-transmit.ts:316-318 says the same thing about the old constant 'submission'.
   - client/src/concept2cure/components/ana/GovernedActionSignoff.tsx:114 says "The declared §11.50 meaning travels with the action for the audit trail." The dialog requires the choice before it can be submitted (`meaningOk`, :85) and sends it at :115. The server never reads it: there are no matches for `signatureMeaning` under server/routes/ana-ri. The route's audit `details` at :648 do not include it either.

3. For a held run the chosen meaning is lost even earlier. `resolveAuthorisedAction` (utility.ts:114-120) takes `params` from the pending-run row, not from the request body, so `params.signatureMeaning` from the client is dropped before execution.

4. It ends up in a stored signature. `k510_workflow.transmit` is an e-signature-tier write (command-rbac.ts:331, part11-governance.ts:94). Its handler passes `meaning: signatureMeaning`, which is always 'approval' (mdx-command-handlers.ts:836), to `executeGovernedTransmit`. That function writes the meaning into the sign payload (governed-transmit.ts:726/742) and into the electronic-signature record through `persistGovernedActionSignature` (:767) and the manifest stamp (:804). A signer who picks "Authorship" or "Review" gets an electronic-signature record for an irreversible FDA ESG transmission that says "approval". That is a false §11.50 manifestation, and it breaks CLAUDE.md's "never fabricate" rule.

5. It is not a known open item. The 2026-09-24/26/28 review folders mention `signatureMeaning` only for the EctdCompile release panel (P4, fixed). They do not record this route.

Not verified or not covered:
- I did not run the path end to end against Postgres.
- I did not confirm that the eCTD Co-Author pane itself proposes `k510_workflow.transmit`. The defect is in the shared route, so it applies to every e-signature-tier command posted through it.
- The finding's second claim, that `place_in_dossier` and `create_submission_package` write no `electronic_signatures` row, is weaker. The pre-execution `ana.governed_action.esign` audit row does persist. Whether those handlers must also write a signature row is a broader design question that I did not settle. The confirmed core of the finding is that the declared meaning is discarded and replaced.

### GP-P-3 — **refuted** (0 of 3)

- **reach** — not real: The code does what the finding says, but the finding is neither new nor reachable from the launch catalog. (1) Mounted: server/bootstrap/register-inline-routes.ts:620-621 mounts /api/protocol-deviations behind only authMiddleware. protocol-deviations.ts:192 calls governed(req,res,'sign',...), and recordGovernedAction writes action 'c2c.work.sign' (c2c/actions.ts:384). deriveKind in audit-trail-ledger.routes.ts would bucket that as 'esign'. (2) No launch surface calls it. A grep of client/src for the close path finds only ProtocolRegisterForms.tsx:187 (POST /deviations, create) and ProtocolDevWrites.ts:262 (POST /deviations/:id/assessment). Nothing calls /deviations/:id/close. AnaToolExecutor.ts:10983-11014 imports createDeviationTx, addCapaActionTx and getDeviation/getCapaClosure only, never closeDeviationTx. So no launch-catalog user can produce this row through the product. It takes a hand-crafted API call from an authenticated user. (3) Already recorded as open. docs/evidence/reviews/2026-09-24/lenses.md:66-69 lists this exact site under residuals: "Protocol consent-form approve and deviation close write a `sign` ledger row through plain `governed()` ... protocol-deviations.ts:192 ... baselined as DEFECT in sign-ceremony-baseline.json:64-70. No client calls either one." scripts/ci/sign-ceremony-baseline.json has the entry for server/routes/protocol-deviations.ts with reason "DEFECT. Deviation close: sign ledger row, no re-authentication, no signature row. No launch surface calls it ... Route it through protocol-signature.ts, or record it as a non-sign closure, before any surface does." The task excludes findings already recorded as open in the 2026-09-24/26/28 reviews, so GP-P-3 re-reports a known, baselined defect. Covered: the route mount, the governed helper, the audit-row action string, deriveKind, client and AnA callers of the close endpoint, the prior review ledgers and the sign-ceremony baseline. Not covered: I did not run the live server or query the local database; static reading was enough.

- **repro** — not real: The mechanism is correct as described at head. I checked HEAD 494b4fc14; the task named 232ecae9c, but the code is the same. However, this defect is already recorded as open, so it is not a new finding. Under the task rules it must not be re-reported.

Trace at head:
- server/bootstrap/register-inline-routes.ts:620-621 mounts /api/protocol-deviations behind authMiddleware only.
- server/routes/protocol-deviations.ts:187-197: POST /deviations/:id/close calls plain governed(req,res,'sign',...). governed() (lines 56-80) checks only that userId and orgId resolve. It has no editor-access check, no password/MFA re-verification and no electronic_signatures insert.
- server/routes/c2c/actions.ts:376-403: recordGovernedAction writes audit_logs.action = `c2c.work.${command}`, which here is 'c2c.work.sign'.
- server/routes/audit-trail-ledger.routes.ts:159-166: deriveKind tokenizes 'c2c.work.sign' into [c2c, work, sign]. SIGN_TOKENS contains 'sign', so the kind is 'esign'.
- auditLogEntry (line 228) sets kind: deriveKind(row.action, null) and sig: false (line 230).
- client/src/concept2cure/v2/surfaces/AdminSurfaces.tsx:1019-1045 filters, counts and colours entries by e.kind === 'esign'.

So an API caller who closes a deviation does produce a ledger entry bucketed as an e-sign with no ceremony behind it.

Two things limit it:
1. sig is false on audit_logs rows. The ledger does not claim §11.50 signed status, only the 'esign' kind bucket.
2. No client surface calls the close route. A grep of client/src finds only the create and assessment deviation calls (ProtocolRegisterForms.tsx:187, ProtocolDevWrites.ts:262).

Why it is a duplicate:
- docs/evidence/reviews/2026-09-24/lenses.md:65-68 already records this exact site as an open residual: "Protocol consent-form approve and deviation close write a `sign` ledger row through plain `governed()` ... `protocol-deviations.ts:192`. Both are already baselined as DEFECT ... No client calls either one."
- scripts/ci/sign-ceremony-baseline.json:68-70 baselines server/routes/protocol-deviations.ts, count 1, as "DEFECT. Deviation close: sign ledger row, no re-authentication, no signature row ... Route it through protocol-signature.ts, or record it as a non-sign closure."

The auditor's proposed fix is the one already written there.

Covered: the route and governed() helper, the recordGovernedAction action string, the ledger's deriveKind and entry mapping (including sig=false), the AuditTrail client bucketing, route mounting, client callers, and the 2026-09-24/26/28 review records and sign-ceremony baseline.

Not covered: I did not run a live HTTP request or a database round-trip. The path is deterministic string handling and was fully traced in code, and the item is disqualified as a duplicate either way. I did not re-audit the sibling protocol-consent.ts:157 site beyond noting it is baselined alongside.

- **intent** — not real: This is a real defect under the repository's own rules, but it is not new. The workflow says open findings from docs/evidence/reviews/2026-09-2{4,6,8}/ must not be re-reported, and this one is already recorded there and in a CI baseline.

What checks out at head (232ecae9c):
- server/routes/protocol-deviations.ts:192 calls the plain `governed(req, res, 'sign', …)` helper (defined at :56-75). It does no re-authentication and writes no electronic_signatures row.
- recordGovernedAction (server/routes/c2c/actions.ts:341-434) writes `action = 'c2c.work.sign'` and marks the c2c_ana_actions row `risk='high'` (HIGH_RISK_COMMANDS, :105).
- audit-trail-ledger.routes.ts:228 runs audit_logs rows through `deriveKind(row.action, null)`. The `sign` token maps that row to `kind: 'esign'`, which AdminSurfaces.tsx:1030-1036 counts and colours.
- The ledger header (:55-58) says outright that for audit_logs rows "a signing event shows through `kind: 'esign'`". The esign bucket is therefore designed to trust the `sign` command, and the problem is the mislabelled command at the call site, not the classifier.

This is not a deliberate design choice. scripts/ci/sign-ceremony-baseline.json lists this site under "server/routes/protocol-deviations.ts" with count 1 and the reason: "DEFECT. Deviation close: sign ledger row, no re-authentication, no signature row. No launch surface calls it (grep of client/src, 2026-09-23). Route it through protocol-signature.ts, or record it as a non-sign closure, before any surface does." The file's $note says it may only shrink.

It is already recorded as open:
- docs/evidence/reviews/2026-09-24/lenses.md:66-69 lists "Protocol consent-form approve and deviation close write a `sign` ledger row through plain `governed()`" and names `protocol-deviations.ts:192`.
- The same entry says it is baselined as DEFECT in sign-ceremony-baseline.json:64-70.
- The esign-bucket effect in this finding follows from that same root cause and needs the same fix, so it is not a separate defect.

It is also not reachable from a launch surface today. A grep of client/src finds calls to POST /api/protocol-deviations/deviations (ProtocolRegisterForms.tsx:187) and /deviations/:id/assessment (ProtocolDevWrites.ts:262), but nothing that calls /deviations/:id/close. So no user or auditor currently sees a "deviation closed" row in the esign bucket from a launch-catalog action.

What I covered: the route and governed() helper, recordGovernedAction, the Command type and high-risk set, the ledger's deriveKind and audit_logs mapper and header, the AdminSurfaces kind counts and colours, the file's git history (the `sign` has been there since the file was added in 4876e2829), the sign-ceremony baseline, the 2026-09-24 review, and client/src callers. What I did not do: run the route against Postgres, check whether rows are already in the esign bucket in any deployed database, or read the 2026-09-26 and 2026-09-28 reports beyond a grep.

