# Part 11 UX lens: launch catalog, 2026-09-28 (Authoring / Submission Center / Submission Readiness first)

Auditor: this session, read-only, no gate run with `write-baseline`. Head reviewed: `aff7eae16`
(`concept2cure-v2`). Prior report read first: `docs/evidence/reviews/2026-09-24/part11-ux.md` (the
only part11-ux report on file; 2026-09-26 was security-lens only).

## Scope actually covered

Per the harness's charge, Authoring, Submission Center and Submission Readiness first:

- **Submission Center** (`submission-center`, `dossier-map`, `ectd-compile`, `ectd-coauthor`,
  `ectd-publishing`, `gateway-transmittals`): read `SubmissionCenter.tsx` in full (freeze/dispatch
  governed chain), `GatewayTransmittals.tsx` in full (governed transmit/rollback/assemble),
  `DispatchReadiness.tsx` (read-only gate, correctly so), `PublishingCenter.tsx` and `DossierMap.tsx`
  (read-only reference, correctly so), and skimmed `EctdCoauthor.tsx` (signoffs routed through the
  chat governed-action confirmation path, not independently re-traced end to end this run). Traced
  server-side: `server/routes/submissions.ts` (freeze/dispatch/transmit), `server/services/
  submission-service/submission-service.ts` (governed transition + transmit claim/release),
  `server/services/submission-gateways/governed-transmit.ts` and `server/routes/mdx-submission-
  gateway.ts` (the transmit route's re-auth, reason and §11.50 meaning enforcement, and the
  electronic-signature persistence).
- **Submission Readiness** (`dispatch-readiness`): read `DispatchReadiness.tsx` in full — it is a
  read-only deterministic gate with no mutation, so it carries no Part 11 finding of its own by
  design; confirmed it correctly consumes the server's composed gate rather than recomputing one.
- **Authoring**: re-verified Q1/Q3/Q6 at head (all still fixed, see Reverified). Skimmed
  `Review.tsx` (review-verdict reason floor, confirmed consistent with Q3) and `TemplateLibrary.tsx`
  / `templateStore.ts` (template CRUD is explicitly documented as *not* a governed mutation —
  canned audit reasons on create/update/deactivate are a product decision, not a Part 11 gap, since
  templates are formatting utilities, not regulated document content). Did not deep-trace
  `protocol-dev` (`ProtocolDev*.tsx` family) or `regulatory-workspace` (`BiopharmaProject.tsx`)
  beyond confirming `finalize_protocol_document`'s AnA tool correctly refuses to sign in chat.

Following a lead from the prior report's own "not independently re-traced" note (QMS AnA tools
beyond `approve_qms_document`/`retire_qms_document`), I traced `revise_qms_document` and
re-traced `retire_qms_document` against their HTTP-route siblings in `mdx-qms.ts`. This is
adjacent to, not inside, the three priority apps, but it directly answers a question the prior
report explicitly left open, so it is reported here rather than deferred again.

## What I did NOT get to

- `ProtocolDev*.tsx` (protocol-dev, six files) and its registers/derivation/reviews were not traced
  line-by-line for governed-action wiring beyond the AnA finalize tool's chat refusal.
- `EctdCoauthor.tsx`'s full signoff/approval chain (the `POST /api/ana-ri/governed-action` path
  feeding `EctdSignoffs`) was read but not traced end-to-end into its server confirmation route.
- `regulatory-workspace` (`BiopharmaProject.tsx`) beyond the `RegulatoryWorkspace` export used by
  the launch surface.
- No local-Postgres verification was run (nothing here required a live-data check beyond reading
  route/service code); the read-only constraint was otherwise honored throughout — no gate run with
  `write-baseline`.

## Reverified: every part11-ux finding from 2026-09-24, at head

| # | Status at head | Evidence |
|---|---|---|
| Q1 (blocker, quorum-version binding) | **still fixed** | `server/services/artifact-approval-act.ts:56-111` — `reviewQuorumVerdict` still takes `currentVersion` and refuses on a stale `version_reviewed`. |
| Q2 (blocker, QMS retire role gate + reason) | **still fixed** | `server/routes/mdx-qms.ts:707-744` — retire still runs `requireEditorAccess` + `verifyApprovalSigner` (signing-authority role check + password/MFA) + an 8-char governed reason. |
| Q3 (medium, reason-for-change server-ignored) | **still fixed** | `server/routes/authoring.router.ts:62` still imports the governed-reason helper (renamed `requireGovernedReason`/`optionalGovernedReason`); `Review.tsx:166-172` still enforces the matching 8-char client floor. |
| Q4 (gap, bare actor id) | **still fixed** | `server/routes/c2c/projects.ts:1307-1311` still joins `users` and selects `actor_name`. |
| Q5 (gap, vault filing reason) | **still fixed** | `Vault.tsx:654-712` still captures and sends a reason as `note`. |
| Q6 (gap, revert not disabled on sealed doc) | **still fixed** | `DocumentWorkbench.tsx:2225-2277,3744` still shows the frozen/sealed state with its reason. |
| 2026-09-24's open follow-up note ("AnA QMS tool role-gate beyond approve/retire, worth the same check") | **traced — a real defect, now Q-0928-1/Q-0928-2** | See findings below: `retire_qms_document` itself has regressed past Q2's protection in a *different* code path (the AnA tool, not the HTTP route), and `revise_qms_document` has never had a role gate. |

Every finding the prior report carried as fixed is still fixed at `aff7eae16`. No regression found
in the three items the prior report itself verified. The one item it flagged as unchecked *was*
worth checking, and did turn up a real gap — but in the QMS AnA-tool layer specifically, not in
Authoring/Submission Center/Submission Readiness proper.

## New findings, this run

Most severe first.

### Q-0928-1 — blocker — `retire_qms_document` (AnA tool) bypasses re-authentication and signing authority

`server/services/ana/AnaToolExecutor.ts:13723-13766` vs. `server/routes/mdx-qms.ts:707-744`.

The HTTP route documents retirement as "the same electronic signature (P1-29/DP-32)" as approval:
signing-authority role check (`isSigningAuthorized`, 403 `QMS_NO_SIGNING_AUTHORITY` otherwise) THEN
password + MFA re-verification (`reverifySigner`, 401 on failure) — *before* the document is
retired. The AnA chat tool for the identical terminal transition checks only tenant/user context and
an 8-character reason, then directly flips the document to `retired` and records a ledger row (never
an electronic-signature row — no `persistGovernedActionSignature` call either). Any org member who
can drive an AnA turn — including one with no QMS signing authority — retires a controlled document
by asking for it in chat. The sibling tool `approve_qms_document` correctly refuses in chat
(`refuseSignatureInChat`, redirecting to the password-gated UI button); `retire_qms_document` does
not follow the same pattern, and the regression is invisible to `ana-cannot-sign.test.ts`, which
tests only `approve_qms_document`.

**Fix**: make `retire_qms_document` call `refuseSignatureInChat(...)` like its approve sibling; add
it (and any other terminal/signing QMS or authoring AnA tool) to the cannot-sign test suite.

### Q-0928-2 — high — `revise_qms_document` (AnA tool) has no editor-role gate

`server/services/ana/AnaToolExecutor.ts:13669-13721` vs. `server/routes/mdx-qms.ts:643-651`.

The HTTP route gates opening a controlled revision behind `requireEditorAccess`. The AnA tool
performs the identical status/version mutation with no equivalent check — `ToolContext` (line
202-241) carries no role field at all, so the handler as written cannot enforce one. A viewer-tier
member can reopen an effective, approved controlled document for revision via chat. The reason floor
is also inconsistent with the rest of the QMS surface (3 characters here vs. the 8-character
`QMS_REASON_MIN` used two tools down for retire).

**Fix**: resolve and check the caller's org role before the mutation, matching the HTTP route's
`requireEditorAccess`; raise the reason floor to 8 for consistency.

### Q-0928-3 — medium (gap) — Gateway Transmittals never manifests the §11.50 signature meaning it collects

`client/src/concept2cure/v2/surfaces/GatewayTransmittals.tsx:181-203,326-329,642-662` vs.
`server/services/submission-gateways/governed-transmit.ts:762-792`.

Transmit correctly requires a declared signature meaning (release/approval/responsibility/review/
authorship) alongside password re-authentication, and the server persists it as a proper electronic
signature. The UI never shows it back: the confirmation toast states region/gateway/ref/ledger-status
only, and the persisted transmittal log (the artifact's own history view) has no column for the
meaning and the list query does not select it. Compare `SubmissionCenter.tsx`'s own freeze/dispatch
flow, which states "signed by {name} ({meaning})" in its own confirmation — the manifestation
`GatewayTransmittals` omits for the more consequential, irreversible transmit-to-agency act. This is
a UI-only gap: the control exists and is enforced server-side; the user (or a later auditor working
from this screen) just cannot see it here.

**Fix**: include the declared meaning and signer name in the transmit success toast; add the meaning
as a column or expandable detail on the transmittal-log row, joined from the electronic-signature
record by target.

## Notes on what held up well

Both the Submission Center freeze/dispatch chain (`runGoverned`, `SubmissionCenter.tsx:569-621`) and
the Gateway Transmittals transmit/rollback chain enforce re-authentication, an 8-character reason,
and a declared §11.50 meaning server-side, with atomic gate + signature verification
(`applySequenceChangeWithAudit`, `claimTransmitSlot`/`releaseTransmitSlot` for transmit's
single-use guarantee). `finalize_protocol_document`'s AnA tool correctly refuses to sign in chat.
Dispatch Readiness is read-only by design and consumes the server's composed gate verbatim rather
than recomputing one. Template CRUD's unaudited-reason pattern is a documented product decision
(templates are formatting utilities, not regulated content) and is not treated as a finding.

---

## Independent verification (2026-09-28)

Each high, medium or blocker finding above went to a separate agent told to refute it (read the code at head, trace the real call path, reproduce where possible; default to refuted). Low findings were not independently verified.

### Q-0928-1 — **confirmed**

I tried to refute this at aff7eae16 and could not. The defect is real. It is not new, though: it is the deferred "Part B" of DP-32 / P1-29. One detail in the finding needs correcting.

1. The unsigned write exists. server/services/ana/AnaToolExecutor.ts:13723-13766 (`registerToolHandler('retire_qms_document', ...)`) checks only `ctx.organizationId`, `document_id`, `reason.length >= QMS_REASON_MIN` and `ctx.userId`. It then runs `UPDATE qms_documents SET status='retired'` (:13737-13745) and `recordGovernedAction` (:13750). It never checks a password, MFA, `isSigningAuthorized` or an editor role, never locks the row, computes no digest and writes no electronic_signatures row. The sibling `approve_qms_document` (:13661-13667) returns `refuseSignatureInChat`.

2. The HTTP route treats retiring as an electronic signature. server/routes/mdx-qms.ts:707-744 runs `requireEditorAccess`, then `verifyApprovalSigner` (403 QMS_NO_SIGNING_AUTHORITY, then 401/423 from re-verification), then `retireQmsDocumentSigned` with a signature row. Commit 59be4566a introduced this and states in its own message: "Not done here (Part B ...): the AnA tool retire_qms_document refuses in chat". Part B never landed.

3. The chat door is reachable in the launch catalog:
   - The tool is listed under `inScope` in server/services/ana/ana-launch-scope.inventory.json:894.
   - Its definition is at qms-labeling-analytics-tool-defs.ts:77-89.
   - `/api/ana-ri` is mounted with only `authenticateToken, aiCircuitBreaker, weeklyRequestLimit` (server/bootstrap/register-ai-routes.ts:35). There is no role middleware.

4. Correction to the finding: the model cannot run the tool on its own word. Since P1-34, tool-authorization.register.json:3017 classes the tool `confirm`. That means `preHandlerRefusal` (AnaToolExecutor.ts:340-345) refuses it without `humanConfirmed`, and the stream holds the turn (stream.ts:1582, 1636-1690). But the only thing the person supplies is a click:
   - `governedTierOf('retire_qms_document')` returns `'confirm'`, because the tool is not in `PART11_ESIGN_COMMANDS` or `PART11_GOVERNED_COMMANDS` (part11-governance.ts:156-162).
   - `/governed-action` asks only for `body.confirm === true` on that tier (server/routes/ana-ri/utility.ts:593-597). `reverifySigner` runs only when `tier === 'esignature'` (:611-620).
   - `runConfirmedTool` (utility.ts:222-240) then calls the handler with `humanConfirmed: true`. There is still no role check, signing-authority check or re-authentication.
   
   So any authenticated org member, including a viewer whom the HTTP route would refuse with 403, can retire an effective controlled document by asking AnA and clicking "yes". No password, no MFA and no signature record are involved. This bypasses §11.200 re-authentication, §11.10(g) authority checks and §11.50 signature manifestation.

5. Reproduced: `npx vitest run server/services/ana/__tests__/qms-change-tools.test.ts -t retire` passes 4/4. The test "retires a document (terminal)" (:257-264) calls the tool with ctx `{organizationId:1, userId:10, humanConfirmed:true}` and only a reason. It gets `ok:true, status:'retired'`, so the suite currently pins the unsigned retirement as intended behaviour.

6. Coverage gap confirmed: `SIGNING_TOOLS` in ana-cannot-sign.test.ts:42-55 lists `approve_qms_document` but not `retire_qms_document`.

Status for the register: this is not NEW. It is DP-32 Part B. It was flagged in 2026-09-24 security.md:104 and 2026-09-26 security.md:43/85, deferred in 59be4566a, and is still open at head. Severity blocker is justified.

### Q-0928-2 — **confirmed**

Head aff7eae16. The core claim holds. The reason-floor sub-claim is partly wrong.

Call path, traced at head:
(1) `/api/ana-ri` is mounted with only `authenticateToken, aiCircuitBreaker, weeklyRequestLimit` (server/bootstrap/register-ai-routes.ts:35). There is no org-role middleware, so a `viewer` can chat with AnA.
(2) `revise_qms_document` is in the launch catalog: it is listed under `tools.inScope` in server/services/ana/ana-launch-scope.inventory.json:910, and it is defined in qms-labeling-analytics-tool-defs.ts:64.
(3) The tool register classes it `confirm` (tool-authorization.register.json:3228). The only gate this adds is `ctx.humanConfirmed` (AnaToolExecutor.ts:340). That is whether a person said yes. It says nothing about the person's role.
(4) The yes arrives at POST /api/ana-ri/governed-action (server/routes/ana-ri/utility.ts:558). That route checks only that `numericOrgId` and `userId` exist. `governedTierOf` returns 'confirm' for this tool (part11-governance.ts:156-162), so the only body check is `body.confirm === true` (utility.ts:594-597). The route then calls `runConfirmedTool` (utility.ts:696), which calls the handler with `{organizationId, userId, projectId, projectRef, servingModel, humanConfirmed: true}` (utility.ts:233-240). No role is resolved or passed.
(5) `ToolContext` (AnaToolExecutor.ts:202-245) has no role field. The handler at 13669-13721 checks only org, id, `reason.length >= 3` and `userId`, then runs the same `UPDATE ... status='draft', version=$3, approver_id=NULL, approved_at=NULL` as the HTTP route.

By contrast, the HTTP sibling POST /qms/documents/:id/revise (server/routes/mdx-qms.ts:643) goes through `requireEditorAccess`. That check (server/middleware/orgMembership.ts:531-535) refuses any role outside `GOVERNED_WRITE_ROLES` = {admin, manager, member, owner, super_admin} (orgMembership.ts:503-511), so `viewer` gets a 403.

Platform commands that reach the same governed-action route are role-checked by command-rbac `authorizeCommand` (command-rbac.ts header, lines 1-50). Confirmed tools skip it, because the route branches to `runConfirmedTool` instead of `executeCommands` (utility.ts:696). No other layer stops this: a grep for `userRole`, `viewer`, `GOVERNED_WRITE_ROLES` and `resolveSignerOrgRole` finds no role check in stream.ts, governed-tool-gate.ts or AnaToolExecutor.ts.

Reproduced at the handler level: `npx vitest run server/services/ana/__tests__/qms-change-tools.test.ts -t "opens a controlled revision"` passes. The handler reopens an effective SOP, bumps the version 3.1 to 4.0 and nulls `approver_id`, with a context of only `{organizationId, userId, humanConfirmed: true}`. Because no role is ever consulted, a viewer's call behaves the same.

Correction to the finding: the HTTP revise route has no 8-character floor. It accepts any non-empty reason (mdx-qms.ts:651), so the AnA tool's floor of 3 is stricter than its HTTP sibling, not weaker. The 8-character `QMS_REASON_MIN` (AnaToolExecutor.ts:13593) is applied only by `retire_qms_document`, which makes it an inconsistency between the two AnA tools. Also, `QMS_REASON_MIN` is defined above the revise tool, not two tools below it.

The gap is wider than one tool. Every `confirm`-class tool that runs through `runConfirmedTool` has no org-role check.

### Q-0928-3 — **confirmed**

I could not refute this at head aff7eae16. The surface is reachable in the launch catalog: `gateway-transmittals` is registered in client/src/concept2cure/v2/surfaceViews.ts:574 and appears in the "Submit & file" nav group next to submission-center (registryModel.ts:564, :592). The legacy `submission-gateway` id aliases to it (registryModel.ts:1057).

What I confirmed:
(1) GatewayTransmittals.tsx:192-198 requires a signature meaning, and transmit() sends it (`meaning: v.meaning || 'release'`, around line 282). The success toast at lines 326-329 is built only from region, gateway, transmission id, the ledger-lost warning and the content-drift warning. It includes no signer, no meaning and no time.
(2) The transmittal log (lines 642-662) has the columns #, Route, Gateway ref, Status, Submitted, Transmitted by and Actions. It has no meaning column and no detail row. The Status button (statusView, around line 666) renders only the gateway's poll body.
(3) GET /gateways/transmittals (mdx-submission-gateway.ts:116-127) selects t.* columns plus u.name and never touches the signature. submission_transmittals has no meaning column; I checked on the reference DB inside BEGIN/ROLLBACK. The columns are: id, organization_id, program_id, package_id, parent_transmittal_id, region, gateway, format, submission_type, transport, bundle_path, bundle_sha256, bundle_size_bytes, transmission_id, mdn_raw, status, http_status, error_class, error_message, submitted_by, submitted_at, ack_received_at, completed_at, metadata, audit_trail_ref, created_at, updated_at. The meaning is not written into transmittal metadata either: governed-transmit.ts:628 passes only the caller's metadata plus the environment, and the client sends no metadata. audit_trail_ref is never written by any server code (grep finds nothing).
(4) No other layer shows it. The meaning is persisted only in the c2c_ana_actions payload and in electronic_signatures via persistGovernedActionSignature (governed-transmit.ts:762-792). The audit_logs row that recordGovernedAction writes (server/routes/c2c/actions.ts:374-398) stores only payload_hash, not new_values. The Audit Trail surface's ledger reads audit_logs meaning from new_values (audit-trail-ledger.routes.ts:223), so it would show meaning=null for this transmit.
(5) The only reader of electronic_signatures is /api/part11/signatures/by-target and /:id/manifest (part11-compliance.ts:373, :471). No client code calls either one; grep of client/src finds no caller. Part11Console uses only chain-integrity, compliance-status and soc2.

Net effect: the §11.50 manifestation for the irreversible transmit exists server-side, but no launch-catalog display shows it. That includes the transmittal record's own view, which §11.50(b) requires ("included as part of any human readable form of the electronic record"). SubmissionCenter.tsx does state "signed by … (meaning)" in its freeze/dispatch notice, so the omission is specific to this flow.

A caveat on the proposed fix: signedTarget is `submission:<packageId>` (governed-transmit.ts:712), so every transmit of the same package shares one target. Joining electronic_signatures by target in the list query would attach the wrong signature to a re-transmitted package.

Severity medium is right. The signature is recorded correctly; the gap is where it is shown (§11.50(b) display), not a missing record.

