## Lane: Part 11 / GxP

Scope: I read the code cold. I did not open any evidence packs, VSRs or audit reports. I ran two read-only CI gates, with outputs quoted below. Nothing was edited. Items marked UNVERIFIED were read in code but not executed.

### Readiness score: 5/10

The foundation is well above what a startup usually has. The audit stores are append-only at the database level, and a narrow write-once carve-out lets a signature be superseded. The audit chain is hashed per tenant and HMAC-sealed with a key held outside the database. Production refuses to boot if the immutability triggers are missing, and a daily sweep checks them. Every signing path shares one re-verification ceremony and one write path into `electronic_signatures`. An IQ/OQ harness exists, and it generates traceability from URS to risk assessment to OQ.

What stops a customer QA audit is on top of that foundation:
- **Authority checks** on signatures are missing on the main signing path, and where they exist they only admit org admins.
- **An unsigned approval path** runs alongside the signed one.
- **QMS approval signatures** do not cover the SOP content, and the approved version is overwritten on revision.
- **User role changes and removals** leave no audit record.
- **Most mutations are audited best-effort** after the change has already committed.
- **Audit and signature data sits in about 10 stores.** The export an inspector would use leaves out the main authoring store.
- **Validation is not tied to releases.** There are no release tags or change-control records.

### What is genuinely strong (keep)
- **One signing ceremony.** `server/services/part11/reverify-signer.ts:229-289`:
  - checks account standing and lockout before comparing anything;
  - requires a second factor when one is enrolled, and refuses if enrolment state cannot be read;
  - counts wrong factors against the sign-in lockout;
  - derives the factors it records itself, never from the client.
- **One INSERT into `electronic_signatures`.** `server/services/part11/signature-persistence.ts`:
  - every row states what its digest is a digest of (`BINDING_BASIS`, :100-157);
  - an unanchored signature is refused;
  - the signature commits in the same transaction as its ledger rows.
- **Database immutability.**
  - Triggers on `audit_logs`, `audit_events`, `audit.tamper_proof_log`, `electronic_signatures`, `concept2cure_signatures` and `doc_revisions`.
  - `electronic_signatures` allows only the write-once supersession into a "revoked" state (`db/migrations/20260730_esign_audit_db_level_immutability.sql:62-107`).
  - The runtime role holds only SELECT and INSERT on the `audit` schema (`scripts/db/provision-app-role.mjs:138-152`).
- **Boot gate and daily sweep.**
  - Production refuses to boot when a trigger is missing or disabled (`server/startup/audit-enforcement.ts:199-249`, `server/services/audit/audit-immutability-triggers.ts:44-64`).
  - The daily sweep checks chains, seals and triggers (`server/jobs/auditChainIntegritySweep.ts:1-40`).
- **Per-tenant chain.** Writers serialize on an advisory lock and a trigger assigns the sequence (`server/services/audit/chain.ts:11-47`). The HMAC keys come from Secrets Manager (`terraform/stack/main.tf:204-205`).
- **Archive and offboarding.**
  - Old audit rows leave the hot table only through a SECURITY DEFINER function owned by `audit_archiver`, into an object-locked S3 bucket (`db/migrations/20260617_audit_logs_immutability.sql`, `terraform/modules/compliance-evidence/main.tf:122-161`).
  - Legal holds fail closed (`server/jobs/retentionCron.ts:183-201`).
  - Tenant offboarding has a waiting period, an export receipt and a legal-hold check (`server/services/tenant/tenant-offboarding.ts`).
- **Authoring.**
  - A reason is required on every content save (`server/routes/authoring.router.ts:2005-2012`).
  - FROZEN and APPROVED documents are write-locked by middleware (:423-470).
  - Revisions are hash-chained and append-only (`db/migrations/20260817_doc_revisions_immutable_ledger.sql`).
  - Signatures are shown on screen (`client/src/concept2cure/v2/surfaces/AuthoringSignatures.tsx`), and exports print the signature block with a verdict on whether the signature still covers the content (`server/services/authoring/authoring-export.ts:128-175`).
- **Vault.** Ingest and metadata edits write their chained audit row in the same transaction, with a reason and before/after values (`server/services/vault/vault-metadata-edit.service.ts:99-162`). There is no user-facing delete.
- **Transmit gates (§11.10(f)).** Transmit requires a dispatched sequence, a signature with transmit intent by the same actor, a clear dispatch gate, and structural-validation evidence (`submission-service.ts:1268-1288`, `governed-transmit.ts:469-510`).
- **Honesty.** The compliance-status endpoint reports "not_assessed" and does not certify itself (`server/routes/part11-compliance.ts:1165-1195`).
- **Validation harness.** `npm run validation:iq`, `validation:oq` and `validation:traceability`. The builder fails when traceability is broken, and a selftest proves that branch. All 71 URS rows are cited by OQ steps (see command below).
- **AI provenance.** The AI ledger records model, resolved model, pinned version and prompt hash (`db/migrations/20260813_ai_gateway_audit_log.sql`), and production fails closed at boot if it cannot write. Accepting an AI draft records the generator and whether the author edited it (`authoring.router.ts:3680-3700`).
- **Ratcheting CI gates.** `ci:sign-ceremony` and `ci:discarded-audit-write`.

### Requirement matrix
| Clause | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| 11.10(a) | Validation | Partially | `tests/validation/run-all.mjs`, `scripts/validation/run-iq.mjs`, `build-traceability.mjs`; 71/71 URS cited by OQ | Not run in CI or release workflows. Defaults are hard-coded (`harness.mjs:52-57`: RUN_DATE 2026-09-27, founder email, a fixed Chromium path). Evidence is written into the repo. `git tag`: 0 tags |
| 11.10(b) | Accurate, complete copies | Partially | Signed CSV/JSON audit export (`signedAuditExport.ts:309-350`); authoring export prints signatures; tenant JSON export | Audit export reads only `audit_logs` and `audit_events`, and caps at 50,000 rows. No human-readable QMS record. No PDF/A for records. Tenant export caps at 50,000 rows per table |
| 11.10(c) | Protection and retention | Partially | Legal holds; archive-before-delete; 35-day backups (`terraform/environments/production/main.tf:59`) | Retention policies are global with no tenant column and no admin API, and none are seeded. Hard-delete cascades to catalog and chunks. Vault S3 versioning and object lock UNVERIFIED |
| 11.10(d) | Limit access | Partially | Membership re-read on each request (`middleware/orgMembership.ts`); four org roles (`middleware/auth.ts:352-384`) | Every non-viewer is a "regulatory-author". QMS change-control writes have no role gate (`mdx-qms.ts:1325,1366,1389,1490`) |
| 11.10(e) | Secure, time-stamped audit trail | Partially | Chains, seals, triggers (above) | About 459 best-effort writer calls. The global catch-all only runs when an env flag is set, records only method/path/status, and has no tenant column. `old_values` is always NULL (`auditService.ts:306`). `authoring_audit_trail` and `authoring_signatures` are mutable. Role changes are not audited |
| 11.10(f) | Operational checks | Partially | Transmit gates; FROZEN lock | A QMS document can be approved straight from draft (`document-approval-signature.ts:112`). Unsigned `approve-artifact` path |
| 11.10(g) | Authority checks | **Not met** | `isSigningAuthorized` is called on 7 paths | Absent on `/api/c2c/actions/sign` and `lock` (`actions.ts:685-700`, off by default), on the AnA e-signature tier, and on ESG transmit (editor role only). Signing roles {admin, approver, reviewer} cannot be granted: assignable roles are {admin, manager, member, viewer} (`tenant-users.ts:24,38`, `scim.ts:65`) |
| 11.10(k) | Documentation controls | Partially | `docs/RELEASE_GOVERNANCE.md`, release-evidence manifest, policies in `docs/security/policies/` | Direct pushes to one branch with no PR review (CLAUDE.md Rule 0). No versions or tags. No per-release change record |
| 11.50 | Signature manifestation | Partially | Authoring UI and export; `signature-manifestation.ts` | QMS UI shows no approver, time or meaning. Retirement is signed with meaning "APPROVED" (`mdx-qms.ts:535`, `SopRegister.tsx:571`) |
| 11.70 | Signature/record linking | Partially | Content digests with a stated basis; supersession chain | QMS digest covers the register row and an artifact *pointer*, not the content (`document-approval-signature.ts:120-137`). Transmit signature is written after the bytes leave, and a failure there is tolerated (`governed-transmit.ts:696-700`) |
| 11.100 | Uniqueness | Partially | Signer identity resolved from the database | No per-user e-signature certification is captured. A shared `ADMIN_TOKEN` delete path exists (`authoring.router.ts:5292-5322`) |
| 11.200(a) | Two components; re-auth at each signing | Met / Partially | Password on every signing; TOTP when enrolled | User ID comes from the session and is not re-entered at first signing. Acceptable if documented |
| 11.300(b) | Periodic password revision | **Not met** | `isPasswordExpired` exists (`auth-security-service.ts:523`) | Never enforced. It is imported but unused in `routes/auth.ts:88`; `authEnterprise.ts:391` only returns a flag, and no client reads it |
| 11.300(d) | Safeguards and lockout | Met | Lockout after 5 failures for 30 minutes (`auth-security-service.ts:29-30`), shared with signing | — |
| Annex 11 §9 | Audit trail review | Not met | grep finds no review workflow | — |
| Annex 11 §12 | User administration traceable | Not met | `tenant-users.ts:523-600` | No audit, no reason, no old value; hard DELETE of the membership |
| AI (GxP) | Marked, attributed, human-accepted | Partially | Ledger; accept records the generator; span lineage | No reason required on accept; revision write is "non-fatal" (`authoring.router.ts:3670-3673`). No AI disclosure in exports. Ledger has no append-only trigger. MCP drops `reason` |

### Findings
**P11-01 · P0 · Signing authority is not enforced where most signatures are made, and cannot be granted where it is enforced**
- *Evidence:*
  - `/api/c2c/actions/sign` and `/lock` run only authentication, a reason, re-auth and a not-the-author check. The RBAC gate needs `GOVERNANCE_RBAC_ENFORCE === 'true'` (`server/routes/c2c/actions.ts:685-700`), which is not set in terraform, compose or `.env.example`. A **viewer** can therefore apply an "approval" signature. UNVERIFIED by execution.
  - The AnA e-signature tier (`routes/ana-ri/governed-esignature.ts`) and ESG transmit (`mdx-submission-gateway.ts:195`, `requireEditorAccess`) have no `isSigningAuthorized` call.
  - `DEFAULT_SIGNING_ROLES = ['admin','approver','reviewer']` (`part11/signing-authority.ts:23`), but only admin/manager/member/viewer can be assigned (`tenant-users.ts:24,38`; `scim.ts:65`). On the checked paths only **org admins** can sign, and self-service signup makes the first user an admin (`middleware/auth.ts:331-335`).
  - Admins both administer accounts and sign, which is a segregation-of-duties conflict.
- *Impact:* A critical §11.10(g)/(d) finding in the first customer QA audit. A sponsor cannot map its approver matrix onto the product.
- *Fix:*
  - Add approver and QA signing roles that can actually be granted.
  - Route every sign/lock/transmit path through one authority check that runs before re-auth.
  - Turn on per-org, per-resource permissions.
  - Refuse an admin granting themselves a signing role.
  - Add a CI gate that every entry on the `ci:sign-ceremony` list calls the authority check.
- *Effort:* M. *Dependencies:* none.

**P11-02 · P0 · An unsigned approval/lock path runs parallel to the signed one**
- *Evidence:*
  - `POST /api/authoring-actions/approve-artifact` (`authoring-actions.ts:822`) sets `status:'approved'` and `approvedVersionId` (:991) with no re-auth and no signature row. The same holds for `lock-artifact` (:1079).
  - The code's own note says they "do not sign yet" (`services/artifact-approval-act.ts:32`), and the remedy text shown to users names them as alternatives (:130-136).
  - `node scripts/ci/check-sign-ceremony.mjs --list` shows 24 baselined sign writes without the full ceremony. Launch-catalog ones: `governed-transmit.ts:730`, `estar-submission-service.ts:273`, `ana-ri/governed-command-signature.ts:118`.
- *Impact:* "Approval without an electronic signature" on the filing path — a critical data-integrity finding.
- *Fix:* Delete or 410 both routes, pointing to the signed status route (following CLAUDE.md's deletion rule). Fix the remedy strings. Clear the launch-catalog entries from the baseline.
- *Effort:* S. *Dependencies:* P11-01.

**P11-03 · P1 · QMS controlled documents are not controlled records**
- *Evidence:*
  - The approval digest covers the `qms_documents` row plus the `artifactId` pointer (`document-approval-signature.ts:120-137`). The artifact content is neither included nor locked, so the SOP text can change after approval.
  - There is no version table. Revise overwrites `version`, `approver_id` and `approved_at` in place (`mdx-qms.ts:662-684`; grep for a `qms_document_versions` table finds none).
  - Approval is allowed straight from draft (`:112`).
  - Retirement is signed with meaning "APPROVED" (`mdx-qms.ts:535`).
  - No approver, time or meaning appears in the QMS UI (grep of `client/src/concept2cure/quality` for approver fields finds nothing).
  - PATCH writes its audit row after commit, with field names only (`:500-506`).
  - The AnA `create_qms_document` tool has no role check (`AnaToolExecutor.ts:13712`).
- *Impact:* A QMS customer's document-control audit fails on §11.70, on §11.10(e) ("shall not obscure previously recorded information") and on 21 CFR 820.40.
- *Fix:*
  - Add an append-only `qms_document_versions` table that snapshots content.
  - Include the content digest in the signature and lock the artifact.
  - Require a signed review step before approval.
  - Use distinct meanings: review, approval, retirement.
  - Show the signature block in the register and in a PDF.
  - Add editor role gates on change control and on the AnA tools.
- *Effort:* L. *Dependencies:* P11-01.

**P11-04 · P1 · Most audit writes are best-effort, after commit, with no old values**
- *Evidence:*
  - Call-site counts: `auditService.logAction` 273, `recordAuditRow` 186 (separate connection, never throws; `audit-write-outcome.ts:55-60`), against 29 `writeChainedAuditRow` and 149 `recordGovernedAction` inside the transaction.
  - `ci:discarded-audit-write`: "122 baselined across 54 file(s)".
  - `old_values` is always NULL (`auditService.ts:291,306`).
  - The global interceptor needs `AUDIT_TRAIL_ENABLED`, records only method/path/status, and the table has no tenant column (`startup/audit-trail.ts:101-138`, `db/migrations/20260813_audit_tamper_proof_log.sql`). Compose files leave it off, and production only warns.
- *Impact:* A governed change can exist with no audit record. Before/after values are missing for most edits.
- *Fix:* On launch-catalog paths — QMS create/edit/revise, leaf upsert, AI accept, users — write the chained row in the same transaction with before and after values. Drive the discarded-audit baseline to zero for launch files. Add an org id to the catch-all and make it mandatory.
- *Effort:* L. *Dependencies:* none.

**P11-05 · P1 · Audit and signature data is split across stores; the inspector export misses the authoritative authoring trail**
- *Evidence:*
  - `authoring_audit_trail` is the authoritative record for content edits. It has no immutability trigger, is absent from `EXPECTED_AUDIT_IMMUTABILITY_TRIGGERS`, and is not mirrored into `audit_logs` for transactional writes (`authoring/authoring-evidence.ts:114-140`). `domain-history-link.ts:167-171` marks it `linked: false`, as are 22 of the 23 domain history tables.
  - `signedAuditExport` reads only `audit_logs` and `audit_events`.
  - `authoring_signatures` has no trigger.
  - The standalone `audit_logs` rows for authoring have a NULL actor: an email is passed as `userId`, and `Number()` turns it into NULL (`auditService.ts:262-263`).
  - `ai.gateway_audit_log` has no append-only trigger.
- *Impact:* "Show me the complete audit trail for document X" cannot be answered from one tamper-evident export.
- *Fix:* Add append-only triggers to the four tables and list them in the boot gate. Link domain writes into `audit_logs` in the same transaction. Add a per-record export (PDF plus JSON) that covers every store and every signature. Fix actor resolution.
- *Effort:* M. *Dependencies:* P11-04.

**P11-06 · P1 · User administration is not audited**
- *Evidence:*
  - `PATCH /api/tenant-users/:org/:user` (role change, `tenant-users.ts:523`) and `DELETE` (hard delete of the membership, :569) write no audit row, take no reason, and keep no old role.
  - A role change does not invalidate the membership cache.
  - Suspension exists only for platform admins, and is audited under tenant 0, so the customer's tenant export cannot show it (`admin/master-admin.ts:406-460`).
- *Impact:* Annex 11 §12 and §11.10(d) finding. Access reviews cannot be done.
- *Fix:* Chained, same-transaction audit with old/new role, reason and actor. A tenant-level suspend action. Cache invalidation.
- *Effort:* S. *Dependencies:* none.

**P11-07 · P1 · FDA ESG transmit: the signature is recorded after the irreversible act, and there are two transmit paths**
- *Evidence:*
  - `governed-transmit.ts:696-700`: "Record the governed sign AFTER the external transmit … if the ledger write fails we … still return."
  - The signer picks any of five meanings, including 'authorship' (`mdx-submission-gateway.ts:186`).
  - Parallel paths: `/api/submissions/sequences/:id/transmit` (`submissions.ts:1724`) and `/api/mdx/gateways/:region/:gateway/transmit` (:195).
- *Impact:* A submission can reach FDA with no Part 11 signature on record.
- *Fix:* Commit the signature and a "transmit intent" row before any bytes leave, then append the receipt afterwards. Fix the meaning to 'release'. Merge onto one path.
- *Effort:* M. *Dependencies:* P11-01.

**P11-08 · P1 · The validation package and change control are not tied to releases**
- *Evidence:*
  - The harness is not referenced in `.github/workflows` (grep for `run-iq` / `validation:oq` finds nothing).
  - Hard-coded defaults (`tests/validation/lib/harness.mjs:52-57`, `run-iq.mjs:24`).
  - `git tag | wc -l` returns 0.
  - Pushes go to a single branch with no PR review.
- *Impact:* A supplier audit fails on the questions "which validated version am I running?" and "show me the change control and regression evidence for release N".
- *Fix:* Version tags and release notes. A per-release change record (change, impact, testing, approval). A CI job that runs IQ/OQ against staging and publishes a versioned validation pack as a release artifact. Parameterize the defaults.
- *Effort:* M. *Dependencies:* none.

**P11-09 · P2 · Password ageing is not enforced (§11.300(b))**
- *Evidence:* `routes/auth.ts:88` imports `isPasswordExpired` but never calls it. `authEnterprise.ts:391` returns only a flag, and no client code reads `passwordExpired`.
- *Fix:* Either enforce a forced change at login or document a NIST 800-63B rationale plus SSO policy.
- *Effort:* S.

**P11-10 · P2 · Seal keys cannot be rotated, and the global chain is a bottleneck**
- *Evidence:* No key id or epoch is stored with seals (`audit-hmac-seal.ts:30,71`; `AUDIT_SEAL_SEQ = 0` in `chain.ts`). `tamper_proof_log` is one global chain behind one advisory lock (`tamper-proof-audit.ts:423`), with a daily full walk.
- *Fix:* Store a key id per row and support multiple verification keys. Chain per tenant or partition.
- *Effort:* M.

**P11-11 · P2 · AI and MCP governance gaps**
- *Evidence:*
  - Accepting an AI draft does not require a reason (`authoring.router.ts:3690-3693`), and its revision write is non-fatal (:3670-3673).
  - `authoring-export.ts` has no AI disclosure.
  - The MCP tool `c2c_file_draft_for_review` takes `reason` (`mcp/tools/governed.ts:47`) but never passes it to `upsertLeaf`, and the audit row does not mark the MCP surface.
- *Fix:* Require a reason and write the revision in the transaction. Add an "AI-assisted" section to exports. Pass the reason and an agent-surface marker through MCP.
- *Effort:* S.

**P11-12 · P2 · Attribution fallbacks**
- *Evidence:* 85 sites fall back to `|| 'system'` or `?? 'system'`, including `authoring-actions.ts:3485` and `authoring.router.ts:914`. Some take the actor from the request body (`ana-cortex-ft.ts:1334`). `DELETE /api/authoring/docs/:id` uses a shared `ADMIN_TOKEN` with no actor (`authoring.router.ts:5292-5322`).
- *Fix:* Fail closed with 401 when there is no verified principal. Remove the shared-token delete.
- *Effort:* S.

**P11-13 · P2 · Retention cannot be configured**
- *Evidence:* `vault.retention_policies` has no `organization_id`, no API, and no seed (`shared/schema/vault.ts:254-268`). Hard delete cascades to catalog, chunks and citations (`migrations/20260905_document_catalog.sql:80,106`).
- *Fix:* Per-tenant policies managed through a governed admin action. Forbid hard delete on governed classes.
- *Effort:* M.

**P11-14 · P2 · No audit-trail review workflow (Annex 11 §9)**
- *Fix:* Periodic review tasks with the reviewer's signature, scoped to high-risk events.
- *Effort:* M.

**P11-15 · P3 · Ceremony inconsistencies**
- Two signing dialogs (EsignModal and GovernedActionSignoff) use different meaning spellings (`signature-meanings.ts:15-44`).
- In GovernedActionSignoff the signer chooses the meaning, where the act should fix it.
- Reason length floors differ: 3 in `mdx-qms.ts:523` versus 8 elsewhere.
- Timestamps come from the app clock (`tamper-proof-audit.ts:435`, `auditService.ts:269`), not the database `now()`.
- `tamper_proof_log` has no TRUNCATE trigger. The runtime role has no TRUNCATE grant, so this is mitigated.
- *Effort:* S.

### Recommended work orders
1. **WO-A: Signing authority, one check for every signer (P11-01, -02).**
   - *Scope:* granted approver/QA roles; one authority check before re-auth on every sign/lock/transmit path; delete the unsigned approve/lock routes.
   - *Acceptance:*
     - A table-driven test over every endpoint on the `ci:sign-ceremony` list returns 403 for viewer and member without the role, and 200 for an approver.
     - `approve-artifact` returns 410.
     - The sign-ceremony baseline has no launch-catalog entries.
     - Self-grant of a signing role returns 403.
   - *Effort:* M.
2. **WO-B: User administration audit (P11-06).**
   - *Acceptance:* Role change, removal and suspend each create exactly one chained `audit_logs` row, with old/new values, a reason and the actor, in the same transaction. A forced audit failure rolls the change back. The rows appear in the tenant's signed export.
   - *Effort:* S.
3. **WO-C: QMS controlled-document integrity (P11-03).**
   - *Acceptance:*
     - Editing the linked artifact after approval makes the signature verdict "does not cover".
     - v1 content and approval can be retrieved after v2 is created.
     - Approval from draft returns 409.
     - Retirement is stored with meaning 'retirement'.
     - The register and the PDF show printed name, UTC time and meaning.
   - *Effort:* L.
4. **WO-D: Transmit ordering (P11-07).**
   - *Acceptance:* With a simulated signature-write failure, no gateway call is made. One transmit route remains. The meaning is fixed to 'release'.
   - *Effort:* M.
5. **WO-E: Unified tamper-evident trail and record export (P11-05).**
   - *Acceptance:* The boot gate lists the four new triggers. The per-record export includes `authoring_audit_trail` and all signature stores. Authoring rows carry a non-null actor. A UPDATE on each of the four tables raises.
   - *Effort:* M.
6. **WO-F: Transactional audit on launch paths (P11-04, -11).**
   - *Acceptance:* `ci:discarded-audit-write` shows 0 for launch-catalog files. `old_values` is populated on edits. AI accept requires a reason. The MCP reason is persisted.
   - *Effort:* L.
7. **WO-G: Release-bound validation pack (P11-08).**
   - *Acceptance:* A tagged release runs IQ, OQ and traceability against staging in CI and publishes a versioned bundle. `/api/version` reports the tag.
   - *Effort:* M.
8. **WO-H: Credential policy, seal key rotation, audit review (P11-09, -10, -14).**
   - *Acceptance:* An expired password forces a change at login, or a signed rationale is recorded. Verification still passes after a key rotation. A review task is generated and signed off.
   - *Effort:* M.

### Open questions / needs from the founder
- Which org roles should carry signing authority? Should admins sign at all, given the segregation-of-duties conflict?
- Is the QMS "document" the register entry or the linked artifact content? Where is the SOP body the system of record?
- Password ageing: enforce it, or rely on SSO plus a documented NIST rationale?
- Retention: per-tenant policies? Is hard delete ever allowed for governed classes?
- Are the two transmit paths both intended for launch?
- Customer deliverables not found in the repo:
  - customer-facing SOPs: e-signature use, audit-trail review, account management, periodic review, backup/restore test;
  - a supplier audit pack: QMS/SDLC description, release change records, training records, pen-test report;
  - a per-release validation summary;
  - the §11.100(c) certification template.
  Who owns these?
- Vault S3 bucket versioning and object lock: it is not in terraform. Where is it managed? (UNVERIFIED)

Commands run:
- `node scripts/ci/check-sign-ceremony.mjs` → "OK … 24 baselined site(s) remain"
- `node scripts/ci/check-discarded-audit-write.mjs` → "122 baselined across 54 file(s)"
- `git tag | wc -l` → 0
- URS/OQ comparison (scratch files in `<scratch>/part11/`) → 71 URS, 0 uncited.