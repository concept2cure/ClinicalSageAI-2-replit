# MR-06 — Part 11 record integrity: authority, signatures, immutable trails

| | |
|---|---|
| Phase | Phase 1 (stages 1–3) · Phase 2 (stage 4) · Phase 3 (stages 5–9) · Backlog (stage 10) |
| Highest open severity at head | P1 |
| Human testing | Degrades: Authoring approval lets the author self-approve with one signature and no review (CAT1-07); Reporting & analytics > Electronic signature register and the per-document "Export record" leave out Authoring signatures (P11-05); the two signing dialogs differ in meaning spellings and reason floors (P11-15, unverified). Nothing in this order blocks a journey. |
| Owner | engineering (stages 1, 3, 6, 8 and 9 need a founder decision first) |
| Effort | XL in total: M + M + M + M + L + S + M + L + M + S |
| Depends on | MR-11 (CAT2-09, one transmit spine), MR-12 (P11-03, QMS version history in the same handlers), MR-05 (SEC-03, owner credential can still DISABLE TRIGGER); F-12, F-13 |
| Findings | 21 total — open 8 · partially fixed 10 · fixed 2 · refuted 0 · unverifiable 1 |
| Basis | cold audit at `92ccdba1`; every status re-verified at `94b4f9238` on 2026-10-13 — [evidence](../evidence/reviews/2026-10-13-market-readiness/) · [findings register](MR-findings-2026-10-13.json). The branch moves about 1,500 commits a day: re-confirm each finding at the current head before starting its stage. |

## Goal

Every approval, release and transmission in a launch app is an electronic
signature applied by someone with signing authority who did not author the
record, after an independent review, and committed before the act takes effect.
The signed content, its history and its audit trail cannot be changed or deleted
by the application, and the boot check notices if that protection goes missing.
Each signature appears in every report and export that claims to list
signatures. A sponsor's QA auditor can walk 21 CFR 11.10(e), 11.10(f), 11.70 and
11.300 against the product and find nothing to write up.

## Why it matters

- A tester or pilot user who creates an Authoring document can approve and freeze
  it alone, with one signature and no review. Authoring then says Approved while
  the Vault copy says unapproved. `docs/LAUNCH_DEFINITION_OF_DONE.md` P-18 tells
  the customer the opposite. A GxP buyer's SOPs require four-eyes approval, so
  this is the first thing their auditor tests (CAT1-07).
- The frozen content that an Authoring freeze or approval signature covers, and the
  section version history shown as the Part 11 history, can still be rewritten or
  deleted by the application's database role. The signature rows are protected; the
  content they bind to is not (SEC-04, DATA-04).
- On the Gateway transmittals path, a submission can reach FDA with no signature on
  record. The signature is written after the bytes leave, and a failed write is
  reported as success. A test at head proves it (P11-07). The pilot deliverable is
  an FDA ESG transmission.
- The Electronic signature register in Reporting & analytics omits every Authoring
  and artifact signature and does not say so. An inspector who pulls it gets an
  incomplete record presented as complete (P11-05).
- QMS edits and eCTD leaf placement write their audit row after the commit, and
  `audit_logs.old_values` is never written, so "what was it before?" has no answer
  in the trail (P11-04, SEC-21).

## State at head

| Finding | Status at head | Severity (pilot) | Tester impact | Evidence at head |
|---|---|---|---|---|
| CAT1-07 | Still open | P1 | Degrades | `server/routes/authoring.router.ts:5294-5372` `/e-sign` sets APPROVED and frozen with no author≠approver or review check; `assertSignerIsNotAuthor` (`server/services/governance/separation-of-duties.ts:382`) never called |
| SEC-04 | Partially fixed | P1 | None | `frozen_documents` (`db/migrations/20260725_authoring_document_loop_tables.sql:120-131`) has no trigger and is not in `APPEND_ONLY_TABLES`; two signature INSERTs (`authoring.router.ts:4920`, `:7448`) |
| DATA-04 | Partially fixed | P1 | None | `c2c_document_section_versions` UPDATE/DELETE-able by `app_service`, 0 triggers; 20261001 triggers absent from `audit-immutability-triggers.ts:44-93` |
| P11-07 | Partially fixed | P1 | None | `server/services/submission-gateways/governed-transmit.ts:662` transmits, then `:736-857` signs; `ledgerWriteFailed` (`:852`) returns success |
| P11-01 | Partially fixed | P2 | None | `server/routes/scim.ts:70` lacks approver/reviewer; `/api/c2c/actions/lock` and `/api/c2c/documents/:id/lock` (`server/routes/c2c/documents.ts:942-963`) have no role check; `server/services/part11/signing-authority.ts:23` admins sign by default |
| P11-04 | Partially fixed | P2 | None | `server/services/auditService.ts:306-329` binds `old_values = null`; `server/routes/mdx-qms.ts:387,502,691` and `submission-service.ts:3134,3195` audit after commit |
| P11-05 | Partially fixed | P2 | Degrades | `server/services/audit/compliance-reports/queries/electronic-signatures.ts:51` reads only `electronic_signatures`; `server/services/authoring/authoring-record.ts:261-290` drops sign/freeze/e-sign chain rows |
| SEC-21 | Partially fixed | P2 | None | `submission-service.ts:249,596,710,1041` still `recordAuditRow` after the write; discarded-audit baseline 113–119 sites |
| P11-09 | Still open | P2 | None | `server/routes/auth.ts:106` imports `isPasswordExpired`, never calls it; `authEnterprise.ts:370,464` returns a flag no client reads |
| SEC-14 | Still open | P2 | None | `auth.ts:363,661,871,1937` echo `mustChangePassword`; no middleware enforces it |
| SEC-15 | Still open | P2 | None | Email OTP default second factor in `auth.ts`; no AuthnContext/MFA check in `server/routes/sso.ts` |
| SEC-16 | Still open | P2 | None | `client/src/concept2cure/auth/ZenLogin.tsx:203-206` stores access and refresh tokens in localStorage; no family revocation on reuse (`auth.ts:1601`) |
| P11-10 | Still open | P2 | None | `server/services/audit/audit-hmac-seal.ts:30` one `AUDIT_HMAC_KEY`, no key id per seal |
| P11-11 | Still open | P2 | None | `server/mcp/tools/governed.ts:59-71` calls `upsertLeaf` without reason or MCP marker; no AI-assisted disclosure in the authoring export |
| P11-12 | Partially fixed | P2 | None | 96 `\|\| 'system'` / `?? 'system'` actor fallbacks in `server/` |
| P11-13 | Partially fixed | P2 | None | `migrations/20261001_organization_retention_settings.sql` adds the setting; hard delete of governed Vault classes not blocked |
| DATA-16 | Partially fixed | P2 | None | `server/routes/mdx-qms.ts:672` clears `approver_id` in place on revise; no legal-hold trigger on `vault.documents` |
| SEC-27 | Still open | P3 | None | `server/startup/audit-trail.ts` matches skip patterns on mount-relative `req.path`, takes `resourceType` from index [1], logs `req.query` |
| P11-15 | Unverifiable | P3 | Degrades | Not re-checked: meaning spellings (`signature-meanings.ts:15-44`), reason floor 3 at `mdx-qms.ts:523`, app-clock timestamps |
| P11-02 | Fixed | none | None | Unsigned `approve-artifact`/`lock-artifact` routes removed (`server/routes/authoring-actions.ts:820-835`) |
| P11-14 | Fixed | none | None | Signed audit-trail review in `server/services/audit/compliance-reviews.ts` |

## Already done at head — do not redo

- **P11-02** — 7038fec50 removed the unsigned approve and lock routes
  (`server/routes/authoring-actions.ts:820-835`); `server/routes/__tests__/authoringActionsUnsignedActsRemoved.test.ts`
  pins it. The signed replacements are `PUT /api/concept2cure/projects/:projectId/artifacts/:artifactId/status`
  (`server/routes/c2c/artifacts.ts`) and the AnA signed act (`server/services/ana-ri/ana-signed-artifact-act.ts`).
- **P11-14** — audit-trail review exists: `server/services/audit/compliance-reviews.ts` and
  `server/routes/audit-compliance-reviews.ts`, signed through `signGovernedAct` with meaning `review`.
- Fixed parts of partially fixed findings, which stages below build on:
  - One signing-authority check on every signing route, before the password:
    `server/services/part11/signing-authority-gate.ts:44-55` (0f961354c, b86baf55e, cf950eeb9),
    pinned by `ci:sign-ceremony` (27-case selftest).
  - Approver and reviewer roles assignable in Admin and access: `shared/constants/org-roles.ts:32` (ddc8c0db5).
  - `authoring_signatures` append-only by trigger (`migrations/20261001_domain_history_append_only.sql:166-181`, 00f94ee9f)
    and by grant (`scripts/db/provision-app-role.mjs:212,244,486-515`).
  - `authoring_audit_trail` triggers (`db/migrations/20260725_authoring_audit_trail.sql:69-110`, 7863cf830),
    already required by the boot gate (`audit-immutability-triggers.ts:60-61`).
  - Per-document record export `GET /api/authoring/docs/:docId/audit/export` (`authoring.router.ts:7703-7785`),
    wired into `DocumentWorkbench.tsx:2515`.
  - AI-draft accept writes its revision and audit row inside the content transaction (`authoring.router.ts:4288-4320`, 7863cf830).
  - Membership role changes audited in their transaction with `previousRole` (`server/services/tenant/membership-change.ts`, 8167aef12, 0adb1b3ec).
  - Transmit checks authority before re-auth and refuses the package creator and the `authorship` meaning (e7fdd5c39, f7973d225).
  - `DELETE /api/authoring/docs/:docId` is session, role and org gated, refuses sealed documents; the shared `ADMIN_TOKEN` is gone.

## Work, in order

### Stage 1 — Four-eyes approval in Authoring (Phase 1 · M · engineering, after F-12) — closes CAT1-07; carries P11-01 item (c)

1. Re-confirm CAT1-07 and P11-01 item (c) at the current head (statuses here are from 94b4f9238).
2. Write the failing tests first (pglite, or `tests/db` with three users holding signing roles plus one creator with the admin role):
   (a) the creator signs APPROVER on `POST /api/authoring/docs/:docId/e-sign` → expect 403 `SEPARATION_OF_DUTIES` (HEAD: 200 and APPROVED);
   (b) a non-author approver with no REVIEWER signature on the current hash → expect 409 `REVIEW_REQUIRED` (HEAD: 200);
   (c) the reviewer also signing APPROVER → 403;
   (d) author signs AUTHOR, a second user REVIEWER, a third APPROVER → APPROVED and frozen, and file-to-vault reports the approval carried.
   Repeat (a)–(c) on `POST /docs/:docId/sign`. File the red output.
3. Model authorship. In `server/services/governance/separation-of-duties.ts`, add an `authoring-document` case to `resolveTargetAuthors` (`:327-364`). The author set is:
   - `authoring_documents.created_by` (`WHERE id = $1 AND tenant_id = $2`);
   - `UNION DISTINCT doc_revisions.created_by`, joined through `authoring_sections s ON s.id = r.section_id AND s.doc_id = $1 AND r.tenant_id = $2` (include origin `genesis`, exclude `platform-generated`);
   - the actor who accepted an AI draft (`authoring_ai_draft_candidates`), if that column exists.
   Cast ids to integer. Add a unit test that a lookup failure throws on the 503 path.
4. Enforce in the routes. In `POST /docs/:docId/e-sign` (`authoring.router.ts:5294`), after meaning validation and before `reverifyAuthoringSigner` (`:5332`), call
   `assertSignerIsNotAuthor(\`authoring-document:${docId}\`, tenantId, Number(getActorId(req)), { command: 'sign', meaning: meaning === 'APPROVER' ? 'approval' : meaning === 'REVIEWER' ? 'review' : 'authorship' })`.
   Map errors exactly as `server/routes/document-lifecycle.ts:251` does: `SeparationOfDutiesError` → 403 `SEPARATION_OF_DUTIES`, `AuthorUnresolved` → 409, `Unverified` → 503. Repeat the call inside the `BEGIN` block with `{ client }` to close the race. Apply the same to `POST /docs/:docId/sign` (`:7373`) and, for meaning REVIEWER, `POST /docs/:docId/freeze` (`:5019`).
5. Require a review. When meaning is APPROVER, and in `/sign` when the step clears the last workflow step, refuse with 409 `REVIEW_REQUIRED` and write nothing unless, inside the transaction:
   (a) an `authoring_signatures` row exists with meaning `REVIEWER` for this document and `content_hash` equal to the current docHash, signed by someone who is neither the approver nor in the author set; and
   (b) no `authoring_reviews` row for the document has `review_status = 'pending'`.
   Extract this predicate from `server/services/regulatory/authoring-approval-carryover.ts:34-41` into one exported function used by both the routes and the carry-over. Rewrite that file's header at `:44-45`, which currently states the gap.
6. Optional per-org tightening: an organisation setting `min_authoring_approvers`, default 1, which an admin may only raise. The APPROVED flip happens on the Nth distinct APPROVER signature over the same docHash. Audit the setting change in its transaction, as `membership-change.ts` does for settings.
7. Admin signing, per F-12. If the founder confirms admins administer but do not sign: remove `admin` from `DEFAULT_SIGNING_ROLES` (`server/services/part11/signing-authority.ts:23`); update `server/services/part11/__tests__/one-signing-authority-policy.test.ts`, `server/routes/c2c/__tests__/governed-sign-authority.test.ts`, the copy at `client/src/concept2cure/v2/surfaces/AdminMemberActions.tsx:91` and the `canSign` projection at `server/routes/tenant-users.ts:373`; and add an Admin and access warning when an organisation has no approver or reviewer, because otherwise nobody can sign. Land the warning in the same commit as the removal. If F-12 wants a per-org choice, read it in `signingAuthorityRoles()` from an org setting, not the `ESIGNATURE_SIGNING_ROLES` env var, and audit its change in-transaction.
8. Tell the user before the dialog. In `callerDocumentAccess` (`authoring.router.ts:1636-1745`), fold the separation-of-duties and review-required decisions into `esign`, so `DocumentWorkbench` and `AuthoringFilingBar.tsx:135-148` withhold Approval and show the server's reason. The server remains the enforcement point.
9. After the code lands, correct the P-18 text in `docs/LAUNCH_DEFINITION_OF_DONE.md` to match. Not before.
10. Run `npm run ci:sign-ceremony` and its selftest.

**Acceptance**
- On a document created by user A (admin role), A's APPROVER e-sign returns 403 `SEPARATION_OF_DUTIES`; document status, `authoring_signatures` and `frozen_documents` are unchanged. Red at HEAD.
- User B (approver, not an author) signing APPROVER before any REVIEWER signature on the current hash returns 409 `REVIEW_REQUIRED`. Red at HEAD.
- After C (reviewer) signs REVIEWER, B's APPROVER succeeds and file-to-vault reports the approval carried.
- The same refusals apply on `/docs/:docId/sign`; a reviewer who is an author is refused on `/freeze`.
- The E-sign dialog does not offer Approval to an author and shows the server's reason.
- F-12 is recorded. If admins no longer sign, an admin's `POST /api/c2c/actions/sign` returns 403 and an approver's reaches the credential check; Admin and access warns an organisation with no approver or reviewer.

### Stage 2 — Signed content and history are append-only and watched at boot (Phase 1 · M · engineering) — closes SEC-04, DATA-04; carries P11-05 item (1)

1. Re-confirm SEC-04, DATA-04 and P11-05 item (1) at the current head (statuses here are from 94b4f9238).
2. Failing tests first:
   - a pglite test next to `server/services/audit/__tests__/audit-immutability-triggers.pglite.test.ts` that applies `AUTHORING_SUBSYSTEM_FILES` (`scripts/db/authoring-subsystem.mjs`) and `migrations/20261001_domain_history_append_only.sql`, inserts a `frozen_documents` row, and expects UPDATE, DELETE and TRUNCATE to throw `IMMUTABILITY_VIOLATION`;
   - a case in `tests/db/domain-history-append-only.dbtest.ts` that, as `app_service` in its own tenant, runs UPDATE, DELETE and TRUNCATE on `c2c_document_section_versions` and expects 42501 or `IMMUTABILITY_VIOLATION`;
   - a pglite case that drops, then separately disables, `trg_authoring_signatures_append_only` and expects `assertAuditImmutabilityTriggers` to report it missing or disabled.
   All three are red at HEAD. File the output.
3. Census before adding triggers, and write it into the migration header:
   - `frozen_documents`: the only writers are `INSERT … ON CONFLICT DO NOTHING` at `authoring.router.ts:5126`, `:5271`, `:7256`; no UPDATE or DELETE on any server path; the tenant purge does not list it. Confirm that `DELETE /api/authoring/docs/:docId` refuses every document that has a `frozen_documents` row, so no cascade fires the new trigger as a 500.
   - `c2c_document_section_versions`: grep confirms no path UPDATEs or DELETEs it, `c2c_document_sections` or `c2c_documents`. A row trigger also fires on the `ON DELETE CASCADE` from `c2c_document_sections` (`migrations/20260528_phase9_document_schema.sql:127`). Check `PURGE_CHILD_TABLES` in `server/services/tenant/tenant-offboarding.ts:907` and the GDPR erasure path; if either must erase this history, add an owner-run door function as 06152498b did for turn records.
4. Add one migration, `migrations/<YYYYMMDD>_signed_record_append_only.sql` (the commit date). It reuses `public.domain_history_append_only()`, guards each table with `to_regclass`, does `DROP TRIGGER IF EXISTS` of its own trigger names only, and creates:
   `trg_frozen_documents_append_only` and `trg_c2c_document_section_versions_append_only` (BEFORE UPDATE OR DELETE, FOR EACH ROW), and `trg_frozen_documents_no_truncate` and `trg_c2c_document_section_versions_no_truncate` (BEFORE TRUNCATE, FOR EACH STATEMENT). It creates no table and drops nothing another file creates (Rule 1). Register it in `C2C_MIGRATION_FILES` immediately after `'migrations/20261001_domain_history_append_only.sql'` (`scripts/db/migration-set.mjs:2883`) and before the final sweep pair. Run `npm run ci:migration-set-order` and `npm run ci:migration-drop-safety`.
5. Add `{ schema: 'public', name: 'frozen_documents' }` and `{ schema: 'public', name: 'c2c_document_section_versions' }` to `APPEND_ONLY_TABLES` in `scripts/db/provision-app-role.mjs` (`:199-250`), and update `server/db/__tests__/provision-app-role-append-only.test.ts`, including the note at `:156`.
6. Boot gate. First confirm that every table below exists after a blank-database `deploy-migrate` (CI job `blank-db-provisioning`); the 20261001 file skips missing tables, and a required trigger on a missing table makes production refuse to boot. Then add to `EXPECTED_AUDIT_IMMUTABILITY_TRIGGERS` (`server/services/audit/audit-immutability-triggers.ts:44-93`) the `_append_only` and `_no_truncate` pair for each of `authoring_signatures`, `workflow_history`, `document_audit_logs`, `regulatory_audit_logs`, `c2c_ana_actions` (source `migrations/20261001_domain_history_append_only.sql`), `frozen_documents` and `c2c_document_section_versions` (source the new file): 14 entries. Update `audit-immutability-triggers.test.ts` and `audit-immutability-triggers.pglite.test.ts` (expected counts; migration list at `:59`).
7. Add a gate so the next unprotected record table cannot ship: `scripts/ci/check-record-table-immutability.mjs` with a selftest and `scripts/ci/record-table-immutability-baseline.json`, wired into `package.json`, `.husky/pre-push` and `.github/workflows/ci.yml`. For every table created by a file on an applier whose name matches `/(signature|signatures|audit|audit_trail|_history|_versions)$/` or starts with `frozen_`, require an `APPEND_ONLY_TABLES` entry and an `EXPECTED_AUDIT_IMMUTABILITY_TRIGGERS` entry, or a baseline entry with a written reason. Show it failing on `frozen_documents` and `c2c_document_section_versions` before step 4, and on a fixture `*_signatures` table in the selftest.
8. One signature writer. Replace the inline INSERT at `authoring.router.ts:7448` (the `/sign` path) with a call to `insertAuthoringSignature` (`:4899`), extending its row type with an optional `signedAt` if needed. Run `npm run ci:sign-ceremony` and its selftest.

**Acceptance**
- As `app_service`, UPDATE, DELETE and TRUNCATE on `frozen_documents` and `c2c_document_section_versions` are refused; as the owner, UPDATE and DELETE raise `IMMUTABILITY_VIOLATION`. Both were red at HEAD (UPDATE 1 / DELETE 1).
- With `trg_authoring_signatures_append_only` dropped or disabled, `assertAuditImmutabilityTriggers` names it. Red against HEAD's list.
- The new gate fails on the two tables before the migration and on its fixture, and passes at the end.
- `deploy-migrate`'s grant audit shows UPDATE, DELETE and TRUNCATE withheld on both tables.
- Authoring e-sign, `/sign` and freeze still succeed; re-approving the same version inserts nothing; a section edit through the c2c documents route still appends a version row.
- `grep -n "INSERT INTO authoring_signatures" server/` finds one writer.

### Stage 3 — Transmission is signed before the bytes leave (Phase 1 · M · mixed) — closes P11-07

1. Re-confirm P11-07 at the current head (statuses here are from 94b4f9238). Check whether MR-11 has already removed a transmit path (CAT2-09).
2. Failing tests first, in `server/services/submission-gateways/__tests__/governed-transmit-signature.test.ts`: invert the case at `:159` so that with `failSignature`, `executeGovernedTransmit` rejects and the gateway transmit mock is called 0 times (HEAD: called once, `ledgerWriteFailed` true). Add: a pre-wire gateway refusal voids the signature; a receipt-write failure leaves the signature committed and reports `receiptWriteFailed`. Update the AnA handler tests in `server/services/ana-ri/__tests__` that assert the old ordering.
3. In `server/services/submission-gateways/governed-transmit.ts`, move the signature transaction before `gw.transmit` (`:662`). After `assertTransmitterIndependent` (`:658`): `pool.connect()`, `BEGIN`, `recordGovernedAction` (command `sign`, target as at `:743`, payload `{ meaning, region, gateway, bundleSha256, sequence, submissionType, contentFingerprint: { assembled, atTransmit }, intent: 'transmit' }`), `persistGovernedActionSignature` with binding `{ digest: bundle.sha256, basis: BINDING_BASIS.TRANSMITTED_BUNDLE_SHA256 }`, `COMMIT`. On any failure, `ROLLBACK` and throw `GovernedTransmitInternalError('transmit-signature-before-wire', err)`. The gateway is never called.
4. Wrap `gw.transmit` in try/catch. If `refusedBeforeWire(err)` (`server/services/submission-gateways/index.ts:152`), void the signature in its own transaction with `voidSignatureForRefusedAct` (`server/services/part11/signature-persistence.ts:253`), mirroring `voidingSignatureOnRefusal` (`submission-service.ts:1069`), and rethrow. Otherwise keep the signature, because the bytes may be at the agency, and rethrow.
5. After a successful transmit, write a receipt in a second transaction: a chained row (`recordGovernedAction` command `transmit-receipt`, or `writeChainedAuditRow`) naming `signatureId`, `transmittalId`, `transmissionId`, `contentAfterTransmit`, the filed-sequence facts and the pre-transmit findings, plus the existing `UPDATE submission_transmittals` metadata stamp (`:832-845`). If it fails, return `receiptWriteFailed` (replacing `ledgerWriteFailed`) and surface it through `transmitOutcomeNotices` (`server/routes/mdx-submission-gateway.ts:331-363`).
6. Fix the meaning to `release`. In `mdx-submission-gateway.ts` `transmitBody` (`:273-274`) replace `z.enum(SIGN_MEANINGS)` with `z.literal('release').default('release')`; keep `SIGN_MEANINGS` (`:82`) for the technical-rejection body (`:526`). In `executeGovernedTransmit`, refuse any other meaning with `GovernedTransmitRefusal` 422. In `client/src/concept2cure/v2/surfaces/GatewayTransmittals.tsx:271-279`, replace the select with the fixed statement "Release: I authorize submission to the agency". In `server/services/ana-ri/mdx-command-handlers.ts` (~`:837`), pass `release`.
7. One transmit path, after the founder decision (NEW, shared with MR-11). Today `POST /api/submissions/sequences/:seqId/transmit` (`server/routes/submissions.ts:1887`; signs first, `submission-service.ts:2100-2107`) and `POST /api/mdx/gateways/:region/:gateway/transmit` (`mdx-submission-gateway.ts:278`, plus the AnA command at `mdx-command-handlers.ts:821-860`) are both reachable under Submit & file (`client/src/concept2cure/v2/registryModel.ts:638`, `:670`). If package-model transmit is not in the pilot: return 410 from the gateway route naming `POST /api/submissions/sequences/:seqId/transmit` and `client/src/concept2cure/v2/surfaces/SubmissionCenter.tsx:856` as the replacement, remove only the transmit form from `GatewayTransmittals.tsx` (keep list, status, acknowledgement and technical rejection), and name the replacement file and its reachability test in the commit message. If both stay, steps 3–6 make their ordering equivalent; record the decision.

**Acceptance**
- With `persistGovernedActionSignature` forced to throw, `executeGovernedTransmit` rejects with `transmit-signature-before-wire` and the gateway mock is called 0 times. Red at HEAD.
- A gateway refusal before the wire leaves the `electronic_signatures` row voided and no transmittal row.
- A receipt-write failure leaves the signature committed and the response carries `receiptWriteFailed`.
- `POST /api/mdx/gateways/fda/esg/transmit` with meaning `review` returns 422; the form offers no meaning choice. Red at HEAD (accepted).
- Either exactly one transmit route remains and the other returns 410 naming its replacement, or the decision to keep both is recorded and both sign before the wire.

### Stage 4 — Every signature appears wherever signatures are reported (Phase 2 · M · engineering) — closes P11-05

P2 at pilot severity, scheduled in Phase 2 because the release-bound validation pack and the pilot's first inspection rely on the signature register and the per-document record being complete.

1. Re-confirm P11-05 at the current head (statuses here are from 94b4f9238). Item (1), the boot gate, closes in stage 2.
2. Failing tests first: in `authoring-record-export.pglite.test.ts`, after `/sign`, `/freeze` and `/e-sign`, expect every exported event to have a chain entry with `intact === true` and `body.signatures` to hold each `authoring_signatures` row for the document and none from another tenant. In `tests/db/compliance-reports.dbtest.ts`, expect an authoring signature and a `concept2cure_signatures` row in the register for their organisation and not for another. Both red at HEAD.
3. Make signing acts verifiable in the record. Change `writeAuthoringAuditTrail` (`server/services/authoring/authoring-evidence.ts`) to return the inserted `authoring_audit_trail` id. In the freeze (`authoring.router.ts` ~`5160-5195`), e-sign (~`5405-5440`) and sign (~`7490-7524`) handlers, add `trailId` and `metadataSha256(metadata)` to the details passed to `writeChainedAuditRow`. In `server/services/authoring/authoring-record.ts:279-288`, widen the filter to `action LIKE 'authoring.%'` (still keyed on `details.trailId`), and make `verifyAuthoringTrailRow` accept the signing-row shape (trailId, reason, metadataSha256, SIGN/FREEZE/ESIGN mapping).
4. Include signatures in the export. In `loadAuthoringRecord`, or the route at `authoring.router.ts:7703`, select the document's `authoring_signatures` rows (`doc_id = $1 AND tenant_id = $2`, by time) into a `signatures[]` array, with a `howToVerify` line explaining how `content_hash` and `covered_content_hash` relate to the `doc_revisions` snapshot. Bump `AUTHORING_RECORD_EXPORT_FORMAT` to `authoring-record-export/2` and update `DocumentWorkbench.tsx` if it reads the format.
5. Register. In `server/services/audit/compliance-reports/queries/electronic-signatures.ts:40-60`, add `UNION ALL` branches over `authoring_signatures` (`tenant_id = org`) and `concept2cure_signatures` (`organization_id = org`), mapped to the report's columns, plus a `store` column. Each branch carries its own organisation predicate. Name any unmappable column in `notRecorded` (`:107-109`); never omit a store silently.
6. AI gateway ledger, after the founder decision (NEW). Either amend `db/migrations/20260813_ai_gateway_audit_log.sql` in place, with a dated header note naming this change, to add BEFORE UPDATE/DELETE and BEFORE TRUNCATE triggers and a SECURITY DEFINER owner-run retention function modelled on the purge door in `migrations/20260926_ana_turn_records.sql`, then add the triggers to `EXPECTED_AUDIT_IMMUTABILITY_TRIGGERS`; or record the decline and its rationale in that same header. Do not append a new file.
7. Correct the stale `authoring_audit_trail` entry in `server/services/audit/domain-history-link.ts:167-171` (it is chained in-transaction by `writeAuditIndexOrChain`). Check how the coverage endpoint counts `table_name`: the chained rows use `authoring_section` and `authoring_document`.
8. Org-wide signed export: `server/services/audit/signedAuditExport.ts` reads only `audit_events` (`:280`, `:474`) and `audit_logs` (`:406`) with a 50,000-row cap (`:382`). State the cap and the covered stores in the export manifest, so a truncated or partial export says so.
9. (P3, may defer to backlog) Render the per-document record as PDF alongside the JSON.

**Acceptance**
- The export test passes: every sign, freeze and e-sign event verifies (`intact === true`) and `signatures[]` is present and tenant-scoped. Red at HEAD.
- The register test passes for both stores and excludes other tenants. Red at HEAD.
- If step 6 is adopted, owner UPDATE and DELETE on `ai.gateway_audit_log` raise, and the boot gate reports the trigger when dropped (shown failing first). If declined, the header records why.
- The Part 11 coverage endpoint no longer reports `authoring_audit_trail` as unlinked.

### Stage 5 — The audit row commits with the change and records what it was before (Phase 3 · L · engineering) — closes P11-04, SEC-21, P11-11, P11-12, SEC-27

Coordinate with MR-12 (P11-03), which rewrites the same `mdx-qms.ts` revise handler; land one change to that handler, not two.

1. Re-confirm P11-04, SEC-21, P11-11, P11-12 and SEC-27 at the current head (statuses here are from 94b4f9238). Re-count the discarded-audit baseline (the two verifications read 113 and 119 sites).
2. Failing tests first (PGlite where suites already use it): force the audit insert to fail (a mocked `writeChainedAuditRow` throw or a trigger in the test DB) and assert the QMS document or `submission_leaves` change persists (red at HEAD) and, after the fix, nothing is written. Assert `audit_logs.old_values` is non-null for a QMS PATCH, a leaf re-point and a membership role change (red at HEAD).
3. `old_values`. Extend `AuditLogEntry` in `server/services/auditService.ts` with an optional `oldValues` object and bind it to parameter 13 in `writeChainedAuditRow` (~`:322`, currently `null`), JSON-stringified like `new_values`. Keep the hashed payload over `new_values` unchanged so existing chains verify. If `oldValues` must be tamper-evident, add it to the hashed payload only for rows after a dated cut-over, documented in the function header. Pass `previousRole` as `oldValues` from `membership-change.ts`.
4. QMS create (`server/routes/mdx-qms.ts:361-399`): one transaction (`pool.connect()`, `BEGIN`, `setTenantContextTx(client, orgId)`), `INSERT … RETURNING *`, `writeChainedAuditRow(client, { action: 'mdx.qms.document.create', resourceType: 'qms_document', resourceId, details: <created fields> })`, `COMMIT`; `ROLLBACK` and 500 with nothing created on any throw. Return `meta.auditTrail { persisted: true, chained: true }`.
5. QMS PATCH (`mdx-qms.ts:448-507`, including Send for review): one transaction, `SELECT … FOR UPDATE` (same org, status draft or in_review), UPDATE, chained row with `oldValues` = prior values of exactly the changed columns and `newValues` = the new values, not just their names. HTTP revise (`:650-712`): before and after version, `approver_id` and `approved_at` in the same transaction, mirroring `revise_qms_document` in `AnaToolExecutor.ts` (~`14307-14343`).
6. Submission service. Move the `LEAF_UPDATED` and `LEAF_CREATED` writes (`server/services/submission-service/submission-service.ts:3134`, `:3195`) inside the `lockSequenceForLeafWrite` callback on its transaction (drizzle tx through `queryableFromDrizzle` with `writeChainedAuditRow`), with `oldValues = previousDocument`; a throw rolls back the placement. Convert the remaining post-write `recordAuditRow` sites at `:249`, `:596`, `:710` and `:1041` (createSubmission, createSequence and peers) the same way, as sequence transitions already do.
7. MCP and AI provenance (P11-11). In `server/mcp/tools/governed.ts:59-71`, pass `input.reason` and `surface: 'mcp'` into `svc.upsertLeaf` and through to its audit row (same function as step 6). Require a reason on AI-draft accept in `authoring.router.ts` (the revision is already in-transaction at `:4288-4320`). Add an "AI-assisted" section to the authoring export listing, per section, the accepted AI drafts, model id, accepting user and time, read from the accept records; the content is deterministic facts, not model-written text (Rule 2).
8. Attribution (P11-12). Replace `|| 'system'` and `?? 'system'` actor fallbacks on request paths (for example in `server/routes/authoring-actions.ts` and `authoring.router.ts`) with 401 when there is no verified principal; keep `system` only in cron and job contexts. Add a ratchet gate (or a rule in an existing one) that counts request-path `'system'` fallbacks against a baseline that can only shrink, with launch-catalog route files at 0, and a selftest that fails on a reintroduced site.
9. HTTP audit observer (SEC-27). In `server/startup/audit-trail.ts`, match `SKIP_PATH_PATTERNS` and derive `resourceType` from the full request path (`requestFullPath`), not the mount-relative `req.path`, and drop or redact `req.query` from the logged record.
10. Gate. Extend `scripts/ci/check-discarded-audit-write.mjs` (or add `ci:after-commit-audit`) to refuse `recordAuditRow(` in the `mdx-qms.ts` document handlers and the `submission-service.ts` leaf, submission and sequence functions, baseline only shrinking, with a selftest that fails on a reintroduced site. Then run `node scripts/ci/check-discarded-audit-write.mjs --write-baseline` to shrink the baseline.

**Acceptance**
- With the audit insert forced to fail, `POST` and `PATCH /api/mdx/qms/documents`, `POST /qms/documents/:id/revise` and leaf create/update leave no row change and return an error. Red at HEAD.
- `audit_logs.old_values` holds prior field values for QMS PATCH, HTTP revise, leaf re-point and membership role change. Red at HEAD.
- An MCP `c2c_file_draft_for_review` call records its reason and `surface: 'mcp'` on the leaf audit row; an AI-draft accept without a reason returns 400; the authoring export lists AI-assisted sections.
- A request-path handler with no principal returns 401, not a `system`-attributed write; the fallback gate's selftest fails on a reintroduced site.
- An `/api/...` request matching a skip pattern is skipped, `resourceType` is the resource name not an id, and no query string is logged (test red at HEAD).
- The discarded-audit baseline has no entries for `mdx-qms.ts` or `submission-service.ts`, and the gate's selftest fails on a reintroduced site.

### Stage 6 — Signing-authority residuals: SCIM, lock, dark RBAC branch (Phase 3 · S · engineering) — closes P11-01

1. Re-confirm P11-01 at the current head (statuses here are from 94b4f9238). Item (c), admin signing, is handled in stage 1.
2. Failing tests first: extend `server/routes/c2c/__tests__/governed-sign-authority.test.ts` with "refuses a viewer lock with 403 before the password is read, writing nothing" for `POST /api/c2c/actions/lock`, and a `documents.ts` lock test asserting no `UPDATE c2c_documents` and no `password_hash` query for a viewer. Add a SCIM test: `PATCH /scim/v2/Groups/approver` add member → `organization_users.role = 'approver'` and one chained `audit_logs` row; `GET /scim/v2/Groups` lists six groups. All red at HEAD.
3. SCIM. In `server/routes/scim.ts`, replace the local `VALID_ROLES` (`:70`) with `ASSIGNABLE_ORG_ROLES` from `shared/constants/org-roles.ts`, so `GET /Groups` (~`:1147`), `GET /Groups/:id` (~`:1180`) and `PATCH /Groups/:id` (~`:1192`) accept approver and reviewer. Keep the remove semantics at ~`:1214` (demote to member only from the group's own role) and the chained audit row through `changeMemberRole`.
4. Lock. In `server/routes/c2c/actions.ts` `makeHandler` (`:642-680`), for `lock` and `unlock`, call `checkSigningAuthority(userId, orgId)` before `verifyReauth` and return its status and code exactly as for `SIGNATURE_COMMANDS` (`:113`). Do the same in `server/routes/c2c/documents.ts` `POST /:id/lock` (`:942`) before `verifyReauth` (`:959`). If the founder prefers editor-level lock (NEW decision below), use `editorRoleDecision` from `server/services/part11/editor-role.ts` instead. Either way fail closed with 503 when the role lookup throws. Shrink the `authority` entries for `documents.ts` in `scripts/ci/sign-ceremony-baseline.json` to 0.
5. `GOVERNANCE_RBAC_ENFORCE` is set nowhere. Either enable it in `terraform/stack/main.tf` `boot_environment` after validating permission atoms against real role data, or delete the two dark branches (`server/routes/c2c/actions.ts:705-721`, `server/services/part11/governed-signature-ceremony.ts:190`) and their tests, so `checkSigningAuthority` is the single authority path. Name `checkSigningAuthority` in the commit.
6. Run `npm run ci:sign-ceremony` and its selftest.

**Acceptance**
- Viewer and member get 403 `ESIGNATURE_NO_AUTHORITY` (or the editor refusal) on both lock routes, with no `password_hash` query and no INSERT or UPDATE. Red at HEAD.
- SCIM approver and reviewer groups are listed and assignable, each change with exactly one chained `audit_logs` row. Red at HEAD (404 "Group not found.").
- `node scripts/ci/check-sign-ceremony.mjs` passes and the selftest passes; one authority path remains.

### Stage 7 — Retention and governed deletion (Phase 3 · M · engineering) — closes P11-13, DATA-16

1. Re-confirm P11-13 and DATA-16 at the current head (statuses here are from 94b4f9238).
2. Failing tests first: a dbtest that hard-deletes a governed `vault.documents` row under legal hold, and one whose `retention_until` is in the future, expects refusal (red at HEAD), and one that deletes a `qms_documents` parent expects its training records to survive.
3. Retention API. Confirm that an admin governed action writes the per-organisation retention settings added by `migrations/20261001_organization_retention_settings.sql`, with the change audited in its transaction. If none exists, add it on the existing admin settings route.
4. Legal hold and retention in the database. Add a BEFORE DELETE trigger on `vault.documents` that refuses while the document is under legal hold or `retention_until` is in the future, with an owner-run disposal door for the retention cron (`retentionCron.ts:127`). Put it in a new file in `C2C_MIGRATION_FILES` before the final sweep pair; it drops nothing another file creates.
5. Cascades on governed children. Replace `ON DELETE CASCADE` with `RESTRICT` for governed history: `document_audit_logs` ← `unified_documents`, `qms_training_records` ← `qms_documents`, `stab_audit` ← `stab_studies`, `vault.document_read_receipts` ← `vault.documents`, and the catalog and chunk cascades in `migrations/20260905_document_catalog.sql:80,106`. Amend each creating migration in place with a dated header note (Rule 1), and make the constraint replacement conditional on `pg_get_constraintdef` so replay does not re-validate or flip it. Run `npm run ci:migration-drop-safety` and show its NARROWED rule passing.
6. Frozen and dispatched leaves (from DATA-04, P2). In a new set file, add a BEFORE UPDATE OR DELETE trigger on `submission_leaves` that refuses when the parent sequence is frozen or dispatched, reading the status column defined in `migrations/20260604_submission_core_canonical.sql`. It mirrors the service-level refusal in `submission-service.ts`.
7. QMS revise history. `server/routes/mdx-qms.ts:672` clears `approver_id` in place. The append-only QMS version table is built once, in MR-12 (P11-03): public schema, `organization_id INTEGER NOT NULL`, inserted before the final sweep pair, written by the revise handler before approval is cleared. Do not build a second one here. DATA-16 closes when MR-12's table lands and steps 3–6 pass.

**Acceptance**
- Deleting a held or in-retention Vault document is refused by the database, not only by the service. Red at HEAD.
- Deleting a governed parent no longer destroys its audit or training children; `ci:migration-drop-safety` passes; a second `deploy-migrate` run is a no-op on the constraints.
- UPDATE or DELETE of a leaf in a frozen or dispatched sequence is refused at the database. Red at HEAD.
- An admin changes the organisation's retention period through a governed action and the change has a chained audit row.

### Stage 8 — Credentials, password ageing and second factor (Phase 3 · L · mixed) — closes P11-09, SEC-14, SEC-15, SEC-16

1. Re-confirm P11-09, SEC-14, SEC-15 and SEC-16 at the current head (statuses here are from 94b4f9238).
2. Failing tests first: a user with `mustChangePassword` or an expired password (`PASSWORD_MAX_AGE_DAYS`) calls a protected route and expects 403 `PASSWORD_CHANGE_REQUIRED` (HEAD: 200); presenting a revoked refresh token revokes the whole token family (HEAD: other tokens still valid); a signer without TOTP or WebAuthn is refused at login (HEAD: email OTP accepted).
3. Password ageing and forced change (P11-09, SEC-14), one mechanism. Add a middleware after `authBoundary` that returns 403 `PASSWORD_CHANGE_REQUIRED` when `user.mustChangePassword` or `isPasswordExpired(user.id)`, except the password-change and logout routes. Call it from the login handler in `server/routes/auth.ts` (where `isPasswordExpired` is imported at `:106` and never called) and return `AUTH_007`; route the client to change-password on that code (`client/src/services/portal/authService.tsx:174` defines it unused). SSO users are exempt. If the founder chooses a NIST 800-63B rationale over ageing (NEW decision), enforce `mustChangePassword` only and record the rationale in the validation pack.
4. Second factor (SEC-15), per F-13. In the `auth.ts` login MFA branch, require TOTP or WebAuthn enrolment for admin and signing roles (approver, reviewer, admin while it signs); keep email OTP for others. In `server/routes/sso.ts`, reject SAML assertions lacking an MFA `AuthnContextClassRef` unless the tenant has an "IdP enforces MFA" attestation, stored as an audited org setting.
5. Tokens (SEC-16). Set the refresh token as an HttpOnly, Secure, SameSite cookie from `/api/auth/login` and refresh in `auth.ts`; add a token-family id and revoke the family when a revoked refresh token is presented (`auth.ts:1601`). Keep the access token in memory in `client/src/concept2cure/auth/ZenLogin.tsx:203-206` and `Concept2CureLogin.tsx`. Remove the localStorage writes.

**Acceptance**
- An expired or must-change user gets 403 `PASSWORD_CHANGE_REQUIRED` on every route except change-password and logout, and the client shows change-password. Red at HEAD.
- An approver without TOTP or WebAuthn cannot complete login; a SAML assertion without an MFA context is refused for a tenant without the attestation. Red at HEAD.
- After login, no token is in localStorage; replaying a rotated refresh token ends every session in its family. Red at HEAD.

### Stage 9 — Rotatable audit seal keys (Phase 3 · M · engineering) — closes P11-10

1. Re-confirm P11-10 at the current head (statuses here are from 94b4f9238). Coordinate with MR-05 (SEC-03), which moves the seal key out of the API and worker environment.
2. Failing test first: seal rows with key A, rotate to key B, and expect verification of the old rows to pass and a row sealed with an unknown key id to fail (HEAD: no key id; rotation breaks verification).
3. Add a `seal_key_id` column to the sealed table. It is additive (`ADD COLUMN IF NOT EXISTS`); put it in the creating migration amended in place with a dated header note, or in a new set file before the final sweep pair.
4. In `server/services/audit/audit-hmac-seal.ts` (`:30`, `:71`), resolve a keyring (current key plus retired verification keys), stamp each seal with its key id, and verify by key id. Replace the "store the key id if you rotate" comment.
5. Measure the single global chain in `tamper-proof-audit.ts` (one advisory lock at `:423`, daily full walk). If contention is measurable at pilot volume, partition the chain per tenant; otherwise record the measurement and defer.

**Acceptance**
- Rows sealed before a rotation verify after it; a row with an unknown key id fails verification. Red at HEAD.
- The daily verification walk passes across a rotation boundary.

### Stage 10 — Signing ceremony consistency (Backlog · S · engineering) — closes P11-15

1. Re-confirm P11-15 at the current head (statuses here are from 94b4f9238). It is unverifiable from the register; settle it by checking each item at head and recording present or absent:
   - meaning spellings differ between EsignModal and GovernedActionSignoff (`signature-meanings.ts:15-44`);
   - GovernedActionSignoff lets the signer choose a meaning the act should fix;
   - the reason floor is 3 at `mdx-qms.ts:523` against 8 elsewhere;
   - audit timestamps come from the application clock (`tamper-proof-audit.ts:435`, `auditService.ts:269`) rather than database `now()`;
   - `tamper_proof_log` has no TRUNCATE trigger (mitigated: no TRUNCATE grant).
2. For each item present, write a failing test, then fix: one meaning vocabulary in `signature-meanings.ts`; the act fixes the meaning in GovernedActionSignoff (stage 3 already does this for transmit); reason floor 8 in `mdx-qms.ts`; database `now()` for audit timestamps; a TRUNCATE trigger on `tamper_proof_log` by amending its creating migration in place.
3. Update `statusAtHead` for P11-15 with what was found, including items found absent.

**Acceptance**
- Each of the five items is recorded as present (with a test red before and green after) or absent (with the file:line that shows it).

## Definition of done

- No Authoring document can be approved by its author or without a REVIEWER signature from someone else over the same content hash, on `/e-sign` or `/sign`, and the dialog says why before the user tries.
- `frozen_documents`, `c2c_document_section_versions`, `authoring_signatures` and every 20261001 domain-history table refuse UPDATE, DELETE and TRUNCATE from the application role; every one of their triggers is required by the boot gate; `ci:record-table-immutability` blocks the next unprotected record table.
- No gateway transmission leaves without a committed `release` signature, and at most one transmit path remains unless the founder recorded otherwise.
- The Electronic signature register and the per-document record export include Authoring and artifact signatures, and every signing event in the export verifies.
- Launch-catalog QMS and submission writes commit their audit row in the same transaction with `old_values`, and the P2 stages (5–9) are closed or carried in the register with an owner.
- Every closed finding has a failing-then-passing record under `docs/evidence/MR-06/<date>/` and an updated `statusAtHead`.

## Founder decisions this order needs

- **F-12** (signing roles and segregation of duties: admins administer but do not sign; author ≠ approver by default) — blocks stage 1 step 7. Author ≠ approver is not optional: stage 1 enforces it regardless. F-12's "qa" role corresponds to the existing `reviewer` role in `shared/constants/org-roles.ts:32`; do not add a seventh role unless the founder asks for one.
- **F-13** (TOTP or WebAuthn for admin and signing roles) — blocks stage 8 step 4.
- **NEW: one transmit path for the pilot.** Is package-model transmit (Gateway transmittals, and the AnA command) in the pilot, or does Submission Center's sequence transmit become the only one? Blocks stage 3 step 7; shared with MR-11 (CAT2-09), which should take the same answer.
- **NEW: AI gateway ledger immutability.** Trigger plus owner-run retention door on `ai.gateway_audit_log`, or keep the grant ceiling only, with the rationale recorded. Blocks stage 4 step 6.
- **NEW: who may lock.** Signing authority or editor role for `/api/c2c/actions/lock` and `/api/c2c/documents/:id/lock`. Blocks stage 6 step 4; fail closed either way.
- **NEW: password ageing.** Enforce a maximum age, or rely on SSO plus a recorded NIST 800-63B rationale. Blocks stage 8 step 3 (forced change on `mustChangePassword` proceeds either way).

## Do not

- Do not append a DROP to remove a trigger, change a cascade or decline the AI-ledger trigger. Amend the creating migration in place with a dated header note, and make constraint replacement conditional on `pg_get_constraintdef` (Rule 1).
- Do not add an entry to `EXPECTED_AUDIT_IMMUTABILITY_TRIGGERS` for a table you have not seen exist after a blank-database `deploy-migrate`. A required trigger on a missing table stops production from booting.
- Do not fix self-approval in the client only, and do not copy the review predicate into the router: extract it from `authoring-approval-carryover.ts` into one function both use. Do not leave the second `authoring_signatures` INSERT at `authoring.router.ts:7448`.
- Do not keep any transmit path that reports success when no signature was committed, and do not delete Gateway transmittals without naming its replacement by path and the test that proves it reachable.
- Do not remove `admin` from the signing roles without the Admin and access warning for an organisation with no approver or reviewer, and do not edit the P-18 text in `docs/LAUNCH_DEFINITION_OF_DONE.md` before the code enforces it.
- Do not treat CMC / Module 3 or Reporting & analytics as out of scope while working the audit and signature stores. The Electronic signature register is a Reporting & analytics surface and must be fixed, not fenced; the scope boundary is the one in `shared/constants/launch-scope.ts`.

## How to run this order

- Claim it with one line in `docs/work-orders/README.md` §0 before starting; release it when you stop.
- Commit to `concept2cure-v2` only; merge, never rebase.
- Show each acceptance check failing on the current code before the fix, then passing; file that evidence under `docs/evidence/MR-06/<date>/`.
- When a finding closes, update its `statusAtHead` in `docs/work-orders/MR-findings-2026-10-13.json` with the closing commit.
