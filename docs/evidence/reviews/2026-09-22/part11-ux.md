# Part 11 / GxP compliance-UX lens: launch catalog, 2026-09-22

Auditor: `part11-ux-auditor`, read-only. It traced UI action → route → server
write for every governed mutation. Its report is condensed here with every
finding and file:line kept.

**CT-verified** means the control tower re-read the server path itself. Findings
1–4 are CT-verified. 5–7 are auditor-verified and were not re-traced.

The first pass read the device-kit Vault by mistake; the real launch Vault and
Tasks files were covered by a second pass (end of file).

| App | Critical | High | Medium | Low |
|---|---|---|---|---|
| Projects | 0 | 0 | 0 | 1 |
| Vault | 0 | 0 | 0 | 1 (second pass) |
| Tasks (`TaskBoard`, under Projects) | 1 | 1 | 2 | 0 (second pass) |
| Authoring | 1 | 0 | 1 | 1 |
| Submission Center | 0 | 1 | 0 | 0 |
| Submission Readiness | 1 | 0 | 0 | 0 |
| QMS | 1 | 0 | 0 | 0 |

## Critical

### 1. Authoring / ProtocolDev: finalize and reviewer disposition are ledgered as `sign` with no signature ceremony (CT-verified)

- **UI.**
  - `client/src/concept2cure/v2/surfaces/ProtocolRegisterForms.tsx:133-137,189-192`:
    the finalize form has a reason field only; no password or PIN.
  - The disposition dialog comes from `ProtocolDevWorkspace.tsx:384-396`, and its
    done message reads "Disposition recorded as a signed governed action."
    (`:422`).
- **Server.**
  - `server/routes/protocol-development.ts:483` and
    `server/routes/protocol-reviews.ts:148` call a local
    `governed(req, res, 'sign', reason, …)` (`protocol-development.ts:81-108`).
  - That helper calls `recordGovernedAction` (`server/routes/c2c/actions.ts:312`)
    directly. `recordGovernedAction` takes no credential.
  - Both routers are mounted with `authMiddleware` only
    (`server/bootstrap/register-inline-routes.ts:592,630`).
  - Neither file references `verifyReauth`, `electronic_signatures`,
    `persistGovernedSignSignature`, `makeHandler` or `writeMutation`.
- **Effect.** A protocol is finalized and locked (`finalizeProtocolTx`), and a
  review disposition is recorded, with an `audit_logs` / `c2c_ana_actions` row of
  `command='sign'`, `risk='high'`. A reader of the ledger will take that as a
  governed signature. No credential was re-entered, the separation-of-duties check
  never ran, and no `electronic_signatures` row exists. **The ledger claims a
  signature that did not happen.**
- **Clauses.** §11.200(a)(1), §11.50, §11.10(e).
- **Fix.** Route both through the canonical `sign` path (`makeHandler` /
  `writeMutation`: re-auth, SoD, signature row). Or, if these are not meant to be
  signatures, record them under a non-`sign` command and change the UI copy.

### 2. QMS: activating, creating or deleting a Quality Management Plan writes no audit record (CT-verified)

- **UI.** `client/src/concept2cure/v2/surfaces/QmpWorkspace.tsx:112-117,203`: one
  click on "Activate" sends `PATCH /api/quality/plans/:id {status:'active'}`. There
  is no dialog, no reason and no confirmation.
- **Server.**
  - `server/routes/quality-management-api.ts:581` (POST), `:634` (PATCH) and
    `:726` (DELETE) do bare Drizzle writes.
  - The file contains **zero** calls to `recordGovernedAction`,
    `createAuditTrail`, `writeChainedAuditRow` or `audit_logs` (counted: 0).
  - The router is mounted by `mountAll` with `requireTenantContext` only
    (`server/bootstrap/register-project-routes.ts:94-99`,
    `server/bootstrap/mount-routes.ts:60-82`), so no audit middleware exists.
- **Effect.** The surface says a QMP "enforces hard/soft/info gates" across
  governed documents. Changing or deleting one leaves no ledger entry.
- **Clauses.** §11.10(e), §11.10(k).
- **Fix.** Route create, update and delete through `recordGovernedAction` with a
  required reason. Put a governed confirmation in front of Activate.

### 3. Submission Readiness: resolving a gate contradiction is unaudited, and the UI shows an invented resolver (CT-verified)

- **UI.**
  - `client/src/concept2cure/v2/surfaces/Inconsistency.tsx:269` sets
    `resolvedBy: 'AnA + you'` in local state.
  - `transition` POSTs only `{ reviewState }`, and the client never re-fetches, so
    the invented string is what the user sees.
  - `:784` admits it on screen: "the governed audit-trail write + re-approval
    routing is not yet wired."
- **Server.**
  - `server/routes/assumption-decision-contradiction.ts:358-372` has no audit
    call; the file contains none (counted: 0).
  - `server/services/contradiction-engine-service.ts:697-716` is a bare
    `UPDATE contradiction_findings`.
  - `req.body.reviewState` is passed through without validation.
- **Effect.** Resolving a finding clears the submission promotion gate
  (`giPromotionGate`, "Submission gate — CLEAR/BLOCKED"). That decision leaves no
  audit record, and the attribution shown does not match what is stored.
- **Fix.** Write the audit record in `transitionReviewState`. Validate the state
  enum. Render the server's `resolved_by` instead of a literal.

## High

### 4. Submission Center: the eCTD "Release signature · §11.70" panel shows no signer, time or meaning (CT-verified)

- **UI.** `client/src/concept2cure/v2/surfaces/EctdCompile.tsx:961-1008` shows the
  signature id, digest and seal verdict. `SignedPackageView.signature`
  (`:233-239`) has no signer fields.
- **Server.**
  - `GET /api/ectd/export/by-run/:runId/signed` (`server/routes/ectd-export.ts:311-325`)
    returns `{ payloadDigest, signatureId, sealVerdict }`.
  - Root cause: `findActiveReleaseSignature`
    (`server/services/submission-package-orchestrator.ts:970-976`) runs
    `SELECT id FROM electronic_signatures …`. The signer, time and meaning are in
    that row and are never selected.
- **Clause.** §11.50(b).
- **Fix.** Select those fields, thread them through, and render them as
  `AuthoringSignatures.tsx` does.

## Medium

### 5. Authoring: reason-for-change is enforced on the client only, on three endpoints

- **Section save.** `DocumentWorkbench.tsx:3472-3502` requires a reason, but
  `server/routes/authoring.router.ts:1919-1950` accepts an absent `changeReason`.
- **Freeze.** `AuthoringFilingBar.tsx:99` requires one, but
  `authoring.router.ts:3700,3836-3838` stores an empty reason as null.
- **Review verdict.** `Review.tsx:166-172` requires at least 8 characters, but
  `authoring.router.ts:2740,2760-2787` accepts empty comments on a rejection.
- **Clause.** §11.10(e)/(k).
- **Fix.** Validate server-side with zod (`protocol-development.ts` already does:
  `z.string().trim().min(8)`).

## Low

### 6. Authoring: "Revert" is not disabled on a sealed document

- **Where.** `DocumentWorkbench.tsx:4420-4426`.
- **Server.** Already refuses with `DOCUMENT_FROZEN` (`authoring.router.ts:293-372,407-448`).
  This is an affordance gap only.
- **Fix.** Add `disabled={docSealed}`.

### 7. Projects: the activity feed shows `User <id>` instead of a name

- **UI.** `ProjectHome.tsx:1062`.
- **Server.** `server/routes/c2c/projects.ts:1224-1254` selects `actor_id` without
  joining `users`.
- **Fix.** Join `users`, as `GatewayTransmittals.tsx:622-623` does.

## Clean

- **Authoring e-sign ceremony** (`AuthoringFilingBar.tsx`, `AuthoringSignatures.tsx`):
  - required reason
  - server-verified PIN re-entry
  - captured meaning
  - printed name, or an honest "no printed name on record"
  - frozen-version binding
- **QMS document approval** (`server/services/qms/document-approval-signature.ts`):
  solid.
- **Submission Center transmit and rollback** (`GatewayTransmittals.tsx`,
  `BiopharmaProject.tsx` eSTAR freeze/dispatch, `SubmissionCenter.tsx`):
  - `EsignModal` → `POST /api/c2c/actions/sign` (password + TOTP, reason ≥ 8,
    meaning)
  - 401, 409 and 412 are handled as refusals
- **Read-only surfaces:** `PublishingCenter.tsx`, `DossierMap.tsx`,
  `EctdCoauthor.tsx`, `Projects.tsx`, `BiopharmaJourney.tsx`, `FilingsCatalog.tsx`.
- **`Review.tsx`:** tells the user a review verdict is not a §11.50 signature.

**SUSPECT, not traced.** QMS SOP register and change control (`SopRegister.tsx`,
`ChangeControl.tsx`) do no mutation themselves; they hand every action to AnA. The
AnA tool-execution path was outside this pass, so whether it runs the full
re-auth, reason and manifestation ceremony end to end is unverified.

## Second pass: `v2/surfaces/Vault.tsx` and `TaskBoard.tsx`

Re-run because the first brief named the device-kit components; see `README.md`,
§ "Scope correction".

| Surface | Critical | High | Medium | Low |
|---|---|---|---|---|
| Vault | 0 | 0 | 0 | 1 |
| Tasks (`TaskBoard`) | 1 | 1 | 2 | 0 |

### T1. Critical (CT-verified): task ledger writes are best-effort and their outcome is discarded, including a PIN-signed completion

- `server/services/tasking/task-audit.ts:180-196`: when `auditTaskAction` owns
  its transaction, it catches a write failure, logs `console.warn` and returns
  `{ recorded: false, reason: 'WRITE_FAILED' }` without throwing.
- `server/routes/taskManagement.routes.ts` calls it at 9 sites:
  `:215, 395, 506, 678, 865, 906, 1020, 1260, 1392`. Each is a bare `await`.
  - None reads the `TaskAuditOutcome`.
  - None passes `executor`, which would enlist the write in the task's own
    transaction; the control tower checked each call.
- On the client, `move()`, `ESignTaskModal.sign()` and `TaskDetail.archive()`
  report success on `res.ok` of the primary write alone.
- **Effect.** "Sign & complete" can show a completed, signed task whose
  `audit_logs` / `c2c_ana_actions` entry never landed.
- **Clauses.** §11.10(e), §11.50.
- **Precedent.** `vault-placement.service.ts:246-341` writes in one transaction,
  and `project-vault.ts:1389-1405` returns 500 `AUDIT_WRITE_FAILED`.
- **Fix.** Pass `executor` (the task write's client), or answer 5xx when
  `recorded:false`.
- **Known debt.** All nine sites are baselined in
  `scripts/ci/discarded-audit-write-baseline.json:36`. The pre-push ratchet stops a
  tenth; it does not retire these nine.

### T2. High (CT-verified): no authority check on task writes

- `taskManagement.routes.ts` references no role gate (counted: 0).
- It is mounted at `register-core-routes.ts:125` (no middleware) and at
  `register-advanced-platform-routes.ts:219`.
- Create, transition, archive, dependency, auto-assign and from-template are
  therefore open to an org `viewer`, the role `orgMembership.ts:452-454` says must
  not write. `project-vault.ts:1430-1444` and `vault-ingest.ts:136-149` gate with
  `requireEditorAccess` for exactly this reason.
- The UI has no role plumbing.
- **Clause.** §11.10(g).
- **Fix.** `requireEditorAccess` on the six routes; disable the controls with a
  reason for non-writers.

### T3. Medium (auditor-verified): `archive()` and `sign()` swallow a 401

- `apiRequest` returns rather than throws on 401.
- `TaskBoard.tsx:1083-1102,1267-1288` have no `!res.ok` branch, so an expired
  session silently resets the form.
- `move()` (`:478-490`) and `Vault.tsx` `fileDocument()` (`:589-610`) already
  guard this.

### T4. Medium (auditor-verified): archive reason is optional on the server

- The UI requires ≥3 characters (`TaskBoard.tsx:1078,1202-1214`) and says the
  reason is written to the Part 11 trail.
- `archiveTaskSchema` (`taskManagement.routes.ts:1358-1360`) is
  `z.string().max(1000).optional()`.

### V1. Low (auditor-verified): Vault filing captures no reason

- "Confirm filing" and "Move to…" (`Vault.tsx:1352-1389`) send no `note`, so
  `placementRationale()` stores a canned sentence.
- The write itself is audited, atomic and reversible.

### Clean

- **Vault.**
  - Upload (`vault-ingest.ts:150`), filing (`project-vault.ts:1445`) and download
    (`:1318-1422`) are role-gated.
  - Each writes its audit row atomically or fails closed.
  - Owners resolve to names (`LEFT JOIN users`).
  - Both `fileDocument` and `downloadVaultDoc` guard the 401 case.
- **TaskBoard signature ceremony.**
  - PIN re-verified against the same bcrypt and lockout store as document sealing
    (`server/services/part11/pin-verification.ts:34-96`).
  - Designated-approver scoping (`task-signoff.ts:105-129`).
  - Meaning and reason validation.
  - Full manifestation shown (`TaskBoard.tsx:1140-1162`).
  - Correct reopen semantics.
  - The defects are in the plumbing around the ceremony, not the ceremony
    itself.
