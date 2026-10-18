# Agency questions: signed answers (P-32 follow-up) — design record, 2026-10-15

Decided by the CPO under the founder's delegation of 2026-10-07, from two independent designs judged against the code (workflow wf_d45d56cc-529: four subsystem maps, two designs, one judge). This file is the build spec; the decision itself is recorded under "### P-32" in docs/LAUNCH_DEFINITION_OF_DONE.md when the surface opens.

## Judgement

**Chosen.** Design 2 (HAQ-SIGNED) is the base: a new program-scoped store with append-only answer revisions, and a signature from the service ceremony on 'haq-answer:<questionId>'. Four things come over from Design 1: the deterministic split proposal, reuse of the platform's response clock, reuse of its letter-class vocabulary, and its list of copy and document corrections. Design 2's CMC fold is taken out of this change. It waits on one founder decision and is recorded as a named exception.

I checked the disputed claims against the code on concept2cure-v2. As a baseline, the four existing HAQ and launch-claim test files pass (81 tests) on today's tree.

**1. Part 11: does the record still show what was signed? Design 2 wins.**
- Design 1 overwrites `c2c_correspondence_issues.answer_text` in place. The only trace is recordGovernedAction:
  - It writes only `payload_hash` to audit_logs (server/routes/c2c/actions.ts:386-390).
  - Its c2c_ana_actions payload carries the new digest, not the text.
- So after one edit, no record shows the words an approver signed. That fails §11.10(e) ("record changes shall not obscure previously recorded information") and weakens §11.70.
- Design 2's haq_answer_revisions is append-only, enforced by trigger and grant, and each signature names its revision id. The signed words stay readable for ever.

**2. Scope spine.**
- Respond already puts the letter in the project's data room (client/src/concept2cure/v2/surfaces/ProjectRespond.tsx:31-56). It already lists the program's markets from the canonical submissions table (client/src/concept2cure/v2/surfaces/programSequence.ts:30-32; shared/schema/submissions.ts:37-63).
- Design 2 binds each letter to that submission and to that data-room source, whose checksum is written once (migrations/20261008c_data_room_source_text.sql:31-36).
- Design 1 binds to c2c_submissions (db/migrations/20260331_regulatory_correspondence_os.sql:20-36). That is a second application register, and Design 1 would find-or-create rows in it from typed text.
- Design 1's intake also records attachment "checksums" computed from filename:size, not from the bytes (server/routes/regulatory-correspondence.ts:541-544). That is a fabricated integrity value.

**3. Access.**
- Design 1 keeps GET /correspondence/:id scoped to the organization only, with no project-sharing check (regulatory-correspondence.ts:792-815). Its requireActorContext defaults the user id to 0 (:66).
- Design 2 admits every request through requireCurrentProgramAccess (server/services/c2c/current-program-access.ts:103-119).

**4. Side effects.**
- Design 1's intake runs the operating layer once per issue. Each issue gets a canonical task (regulatory-correspondence.ts:690). A blocker issue linked to a package also gets a c2c_blockers publish blocker (server/services/regulatory-correspondence/operating-layer.ts:103-134).
- Run in question mode, a 15-question information request would create 15 tasks and could block publishing.

**5. Launch claim.**
- Design 1 claims /api/regulatory-correspondence sub-prefixes that locked surfaces also use. That reverses the P-32 narrowing that server/services/entitlements/__tests__/ind-launch-claim.test.ts:105-107 pins.
- Design 2 keeps the single claimed prefix (server/middleware/__tests__/launch-scope-api-gate.test.ts:558-560) and shrinks the router to exactly the screen's calls.

**6. One signing door.**
- 'correspondence-issue' already resolves as a row-backed target (actions.ts:239-246). Modelling its authors, as Design 1 does, would let the generic POST /api/c2c/actions/sign accept signatures on agency questions that authorize nothing.
- Design 2 keeps 'haq-answer' out of resolveTarget, so the domain route is the only way to sign.

**7. Where Design 1 is better, and what is grafted.**
- It has a deterministic split proposal, which is the "AnA proposes the split" step of WORKFLOW_DECISION §8 (docs/design/WORKFLOW_DECISION_2026-10-08.md:259-260) done by an engine.
- It reuses the canonical pure clock, correspondenceResponseClock (server/services/regulatory-correspondence/response-clock.ts:139). Design 2 would write a second, HAQ-local clock.
- Design 2's private letter-type list is replaced by the platform's AGENCY_LETTER_CLASSES (shared/regulatory/agency-interaction.ts:375-388), which is Design 1's reuse principle.
- Design 1 also lists the second document that already claims the surface is open (docs/evidence/D2-ONE-ANA/2026-10-15/f15-respond/README.md:15).

**8. Where Design 2 overreaches: the CMC fold.**
- CMC's Module 3 file is launch-claimed (shared/constants/ui-surface-registry.ts:532). It carries:
  - assignment;
  - a review step;
  - close and reopen;
  - a "Draft response" handoff into Authoring (client/src/concept2cure/v2/surfaces/CmcModule.tsx:2475-2660).
- Assignment and priority have no replacement in the signed-answer model. Under the working agreement, deleting a capability with no replacement is the founder's decision.
- The fold would also roughly double the slice. It becomes the one founder question, and an exception named in the P-32 amendment.

**9. Corrections to both designs.**
- Design 1 said nothing calls /reviews/pending, but tests/e2e/multi-user-review.e2e.ts:498 does. So Design 2's verbatim move of that route to reviews.ts is right.
- Both designs missed tests/artifact-change-invalidates-bundles.contract.test.ts:89-92, which lists server/routes/c2c/haq-sessions.ts as a wired artifact writer. Deleting that file must update the census.
- New tables need tenant-purge coverage: ci:purge-coverage only lets the residue shrink (scripts/ci/check-purge-coverage.mjs:24-31). An append-only table that refuses DELETE therefore needs a SECURITY DEFINER purge door. Design 2 has one, copied from migrations/20261014_ana_source_read_receipts.sql:95-200. If Design 1 were fixed with a revisions table it would owe the same door, so the cost does not separate them.

**How the final design does on the five criteria.**
- **Part 11:**
  - Content binding: the digest covers the question and the answer revision.
  - Edits lapse approval: the signature stands only on its own revision id, and the digest is re-derived at every use.
  - Single use: signature and act commit together, and the package records the signature ids it used.
  - No void needed: nothing persists on a refusal.
  - Separation of duties: authors are modelled from every revision author.
  - Audit chain: every write writes a ledger row, and the package writes an EXPORT_GENERATED row with its SHA-256.
- **Rule 2:** no model call anywhere in the path; every verdict and the clock come from deterministic engines.
- **Rule 1:** one guarded, replay-safe CREATE file with no DROP.
- **Honest UI:** every state shown is the server's verdict.
- **Buildability:** every piece copies an in-tree precedent, and each step has a red-first proof.

**Grafted from the other design.**

- From Design 1: the deterministic split proposal. GET /letters/:letterId/proposed-questions runs a pure proposeQuestionSplit over the data room's extracted text and keeps the letter's own numbers verbatim, never numbering by index. It writes nothing; the person records each question, and each is quote-checked. This satisfies WORKFLOW_DECISION_2026-10-08.md:259-260 ('AnA proposes the split' becomes an engine proposing it; the person confirms).
- From Design 1: reuse the canonical pure response clock, correspondenceResponseClock (server/services/regulatory-correspondence/response-clock.ts:139), for each letter's due state, instead of Design 2's HAQ-local daysUntilDue.
- From Design 1's reuse principle: letter_type uses the platform vocabulary AGENCY_LETTER_CLASSES (shared/regulatory/agency-interaction.ts:375-388), with a completeness test against the migration's CHECK list. The release subset lives in code (letter-scope.ts).
- From Design 1: the single 'standing' function (answerApprovalStanding) is the only source for the read, the client's Approve button and the package gate. There is also an explicit ALREADY_SIGNED refusal and a test that a signature from another door (no act.kind) counts for nothing.
- From Design 1: correct both documents that already say agency questions opened. These are the 20260823 customer-copy header (db/migrations/20260823_module_catalog_customer_copy.sql:23-25) and docs/evidence/D2-ONE-ANA/2026-10-15/f15-respond/README.md:15.
- From Design 1: the Respond tab gets an 'Answer it question by question' step to haq-manager, and the coming-later line drops question-by-question tracking.
- Verified addition, missed by both designs: deleting server/routes/c2c/haq-sessions.ts must also update the writer census in tests/artifact-change-invalidates-bundles.contract.test.ts:89-92.
- Verified correction of Design 1: /reviews/pending has a caller (tests/e2e/multi-user-review.e2e.ts:498), so it moves verbatim to server/routes/c2c/reviews.ts, as Design 2 says.
- Client reuse rather than copies: the IND and letter pickers use programSubmissionsPath (client/src/concept2cure/v2/surfaces/programSequence.ts:31-32) and sourcesUrl, isSourcesPage and sourceCanGround (client/src/concept2cure/v2/surfaces/projectSources.ts:51-71), which are already launch paths through ProjectRespond.
- Trimmed from Design 2: the CMC fold leaves this change. Retiring CMC's assignee, priority and Authoring-handoff controls without a replacement is the founder's call under the working agreement. Until then it is a named exception in the P-32 amendment.

## Summary

**Rows and evidence.**
- Moves D2 (launch catalog) and files Part 11 evidence toward D5.
- Workstream: Submission Center, as the P-32 follow-on.
- Evidence goes to docs/evidence/D2-FOUNDER-DECISIONS/2026-10-15/p32-agency-questions-signed/ (README, red/, green/, mutations/).
- All commits go to concept2cure-v2 only (Rule 0).

**What is built.**
1. **One store for agency letters and signed answers.** Three public tables, each with `organization_id INTEGER NOT NULL`:
   - haq_letters: one FDA letter on the project's US IND, filed from the project's data room, with that file's write-once checksum.
   - haq_questions: each question as the letter states it.
   - haq_answer_revisions: append-only answer history.
   The database enforces append-only history, one-time withdrawal and identity. It replaces the haq_question feature store (server/routes/haq-manager.ts:21; server/utils/feature-persistence.ts:13-155) and the dead haq-session path.
2. **Approval is a signature.** It runs the platform's service ceremony, signGovernedAct (server/services/part11/governed-signature-ceremony.ts:208-286), on 'haq-answer:<questionId>'. The ceremony checks, in order:
   - the meaning;
   - signing authority, before any credential;
   - re-authentication;
   - inside the tenant transaction, a row lock and program admission;
   - that the revision is the current one, is not empty, and that every commitment was acknowledged;
   - separation of duties against every revision author.
   The ledger pair and the electronic_signatures row then commit together, with a content binder over the question and that revision.
3. **No stored status.** "Approved" is computed at use time. It is true only when a not-withdrawn signature of this act kind, with meaning approval or responsibility, names the current revision id, and its bound digest equals the digest re-derived from the live rows. Any new revision lapses it. Nothing can create, forge or silently overwrite an approval.
4. **Every mutation follows one pattern:**
   - the router's token-role gate;
   - then, in one transaction: setTenantContextTx, requireCurrentProgramAccess, the live role, the domain write and a recordGovernedAction ledger row;
   - plus author span lineage for answer text.
5. **One package door.** POST /letters/:id/package calls the same readiness verdict as the read. A deterministic builder names each signature, and delivery goes through createGovernedExportConsequence, which writes the artifact and an EXPORT_GENERATED row with the SHA-256.
6. **No model call anywhere in this path.** /ai-draft and generateAIDraft are deleted. AI drafting stays on the PQ-gated Authoring door reached from Respond. A saved answer is the saving person's own assertion (P-30).
7. **Deterministic split proposal (graft).** The server proposes how the letter splits, using the letter's own numbering in the data room's extracted text. It never invents a number. The person records each question, and each is quote-checked against the letter.
8. **Clock and letter types are reused.** The clock comes from the canonical correspondenceResponseClock, and letter types are the platform's AGENCY_LETTER_CLASSES.
9. **Smaller router, real auth on the mount.** The router shrinks to the nine routes the screen calls, pinned by a route-enumeration test. The mount gains authenticateToken.
10. **The opening lands last.** 'haq-manager' joins Submission Center's surfaces with modules unchanged. The pinned tests flip, the catalog copy is amended in place, and the P-32 amendment records the commitments reading, the Correspondence OS boundary, the CMC exception awaiting the founder, and the revocation gap.

## Data model

**New migration.** migrations/20261015i_haq_agency_letters.sql. Take the next free letter at implementation time; the last entry today is 20261015h.
- Insert it in C2C_MIGRATION_FILES after 'migrations/20261015h_ibc_unrecorded_facts_nullable.sql' and before UUID_TENANT_ISOLATION_NONPUBLIC (scripts/db/migration-set.mjs:3283-3285).
- CHILD_TABLE_PARENT_SCOPE and TENANT_ISOLATION_SWEEP then still run last (:3302, :3313; ci:migration-set-order).

**Common to all three tables.** Each lives in `public` with `organization_id INTEGER NOT NULL CHECK (organization_id > 0)`. The final sweep therefore adds tenant_isolation_policy (CLAUDE.md Rule 1, third corollary).

**1. public.haq_letters**
- id SERIAL PK.
- organization_id.
- program_id UUID NOT NULL: regulatory_programs.id.
- submission_id INTEGER NOT NULL: submissions.id, the IND (shared/schema/submissions.ts:37-63).
- source_id INTEGER NOT NULL: the cre_evidence_sources row of the letter file.
- source_sha256 TEXT NOT NULL, CHECK ~ '^[0-9a-f]{64}$'.
- letter_type TEXT NOT NULL, CHECK IN the 12 values of AGENCY_LETTER_CLASSES (shared/regulatory/agency-interaction.ts:375-388). This is the platform vocabulary, not a HAQ-local one. A completeness test reads the migration's CHECK list and compares it to the TS constant. The release subset is enforced in code (letter-scope.ts), so widening it needs no migration.
- agency_reference TEXT NOT NULL, 1..200 characters after btrim.
- received_on DATE NOT NULL.
- response_due_on DATE NULL, "as the letter states it", CHECK NULL or >= received_on.
- recorded_by INTEGER NOT NULL > 0; recorded_at TIMESTAMPTZ NOT NULL DEFAULT now().
- withdrawn_at, withdrawn_by, withdrawn_reason: all null or all set, reason at least 8 characters.
- UNIQUE (id, organization_id).
- Partial UNIQUE (organization_id, submission_id, lower(agency_reference)) WHERE withdrawn_at IS NULL.
- BEFORE INSERT identity guard (the shape of migrations/20261006_document_data_dispositions.sql) raises 23514 HAQ_IDENTITY_REFUSED unless:
  - the program is in the organization and not deleted;
  - the submission is in the organization, not deleted, and its program_id equals NEW.program_id;
  - the source is in the organization, its client_program_id equals NEW.program_id, its source_type is 'client_document', it is not deleted, and its checksum is NOT NULL and equal to NEW.source_sha256.
  These columns are verified at db/migrations/20260724_clinical_regulatory_evidence_spine.sql:35-67 and migrations/20260726_cre_source_program_scope.sql. There are no foreign keys to external parents, so the file replays whichever applier created them.

**2. public.haq_questions**
- id SERIAL PK; organization_id.
- letter_id INTEGER NOT NULL, with FOREIGN KEY (letter_id, organization_id) REFERENCES haq_letters(id, organization_id).
- question_number TEXT NULL, CHECK NULL or ~ '^[A-Za-z0-9][A-Za-z0-9.()#-]{0,19}$'. NULL means "unnumbered in the letter", which is never invented.
- ordinal INTEGER NOT NULL > 0.
- discipline TEXT NULL, CHECK IN ('Clinical','Clinical pharmacology','Nonclinical','CMC','Statistics','Labeling','Safety','Regulatory').
- ctd_section TEXT NULL, CHECK ~ '^m?[1-5](\.[0-9A-Za-z]+)*$'.
- question_text TEXT NOT NULL, 1..20000 characters after btrim.
- quote_check TEXT NOT NULL, CHECK IN ('verbatim','not-found','no-source-text'). Server-computed.
- created_by, created_at, and the same withdrawal triple.
- UNIQUE (id, organization_id).
- Partial UNIQUE (letter_id, question_number) and (letter_id, ordinal), each WHERE withdrawn_at IS NULL.
- BEFORE INSERT guard: the letter is not withdrawn.

**3. public.haq_answer_revisions** (append-only)
- id SERIAL PK; organization_id.
- question_id INTEGER NOT NULL, with FOREIGN KEY (question_id, organization_id) REFERENCES haq_questions(id, organization_id).
- revision_number INTEGER > 0, UNIQUE (question_id, revision_number).
- response_text TEXT NOT NULL, 1..100000 characters after btrim.
- source_refs JSONB NOT NULL DEFAULT '[]', CHECK jsonb_typeof array: [{sourceId, title, sha256}] snapshots of same-program data-room sources, taken at save.
- commitments JSONB NOT NULL DEFAULT '[]', CHECK an array of at most 20 {text} entries.
- content_sha256 TEXT NOT NULL, hex64.
- author_id INTEGER NOT NULL > 0: governedActorId (server/middleware/orgMembership.ts:621).
- reason TEXT NULL, CHECK NULL or length >= 8.
- created_at.
- BEFORE INSERT guard: the question and its letter are not withdrawn and are in the same organization, and revision_number equals the current maximum + 1.

**Guards**
- Revisions: BEFORE UPDATE OR DELETE and BEFORE TRUNCATE raise IMMUTABILITY_VIOLATION, except a row DELETE run as ana_record_purger (copied from migrations/20261014_ana_source_read_receipts.sql:95-114).
- Letters and questions: BEFORE UPDATE permits exactly one change, the withdrawal triple going from NULL to set. Every other column must be unchanged (to_jsonb(NEW) minus the three keys IS NOT DISTINCT FROM to_jsonb(OLD) minus the three keys); after that the row is frozen. DELETE is allowed only as ana_record_purger, and TRUNCATE is refused.

**Purge door**
- public.purge_tenant_haq_records(p_org integer) RETURNS TABLE(revisions, questions, letters).
- SECURITY DEFINER, owned by ana_record_purger.
- The same preconditions as purge_tenant_source_read_receipts (:150-200): app_super_admin scope, the organization pending_deletion, and no active vault.legal_holds. It deletes children first.
- GRANT SELECT, DELETE on the three tables to ana_record_purger.
- Listed in PURGE_DOORS (server/services/tenant/tenant-offboarding.ts:591-620) and ahead of the parents in PURGE_CHILD_TABLES (:967). Also listed in scripts/db/security-definer-allowlist.json with its reason.
- This is required: ci:purge-coverage only lets the residue shrink (scripts/ci/check-purge-coverage.mjs:24-31).

**Grants.** scripts/db/provision-app-role.mjs APPEND_ONLY_TABLES (:199-252) gains:
- haq_answer_revisions, SELECT and INSERT;
- haq_letters and haq_questions, with updatableColumns ['withdrawn_at','withdrawn_by','withdrawn_reason'], as electronic_signatures has (:203-207). That column grant is also what SELECT … FOR UPDATE needs.

**Replay (Rule 1)**
- Every statement is one of: CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, CREATE OR REPLACE FUNCTION, or a trigger, role or grant inside a DO block guarded by pg_trigger or pg_roles.
- Constraints live inside the CREATE: no ALTER … ADD CONSTRAINT, no DROP, no seed.
- A PGlite test applies the file twice. ci:migration-drop-safety has nothing to refuse.
- The file carries a dated header saying what it creates and that any later removal is an in-place amendment of this file.

**Not changed**
- Legacy project_memory_entries 'haq_question' rows. Only the demo seed ever wrote letters, and their writer and readers are deleted.
- No drizzle table definition is added. API contract types go in shared/types/haq.ts (the '@shared/types/haq' the registry already names, shared/constants/ui-surface-registry.ui-v2.ts:342).

## Signing

**Target.** 'haq-answer:<haq_questions.id>'.
- It is deliberately not added to resolveTarget (server/routes/c2c/actions.ts:154-258). The generic POST /api/c2c/actions/sign therefore answers 400 TARGET_INVALID (:697-700), and the domain route is the one door.
- The 'haq' pointer stays pointer-only (:248-254).

**Route.** POST /api/haq-manager/questions/:questionId/sign.
- Middleware: signingAttemptLimiter('haq-answer-sign', …) (server/middleware/signing-attempt-limiter.ts:39-51) and the router's requireEditorAccessForWrites (server/middleware/orgMembership.ts:607).
- Zod body, .strict():
  - reason: governedReason, at least 8 characters (server/routes/governed-reason.ts:21-25)
  - meaning
  - reauth {password, totp?}
  - revisionId: integer
  - acknowledgedCommitments: sha256[], at most 20
- GovernedSignatureRefusal maps to its own status, code and message, as server/routes/protocol-development.ts:526-566 does.

**Intent.** The route is the intent. Nothing is signed ahead of a later act, so there is no payload.intent to validate.
- The act written to the ledger payload and to manifest.act is {kind:'haq-answer-sign', questionId, letterId, questionNumber, revisionId, revisionNumber, revisionContentSha256, commitments:[{index, text, sha256}]}.

**Meaning set.** SIGN_OFF_ACT_MEANINGS: review, approval, responsibility (server/services/part11/signature-meanings.ts:59).
- approval and responsibility (DECISION_ACT_MEANINGS, :55) approve the answer.
- review is a signed review that never authorizes assembly. It replaces the unsigned "Route to review".
- authorship is never offered. The client narrows EsignModal's meanings to match.

**Ceremony.** server/services/haq/answer-signature.ts is a thin wrapper, in the shape of server/services/adaptive-decision-signature.ts:68-84, over the SERVICE ceremony. It is not the route ceremony in governed-signed-act.ts, which has no separation of duties (:52-55). It fixes domain 'agency_correspondence', surface 'haq-manager' and subject 'agency answer'. Order of checks:
1. Meaning.
2. checkSigningAuthority, before any credential (admin, approver or reviewer, read live).
3. verifyReauth: the password, plus TOTP whenever one is enrolled.
4. BEGIN and setTenantContextTx.
5. prepare(client):
   - SELECT the question JOIN its letter FOR UPDATE OF the question row, org-scoped;
   - requireCurrentProgramAccess(client, {programId: letter.program_id, forShare: true});
   - refuse with 404 NOT_FOUND, 409 LETTER_WITHDRAWN or QUESTION_WITHDRAWN, 409 NO_ANSWER (a signature is never applied to empty content: server/services/part11/version-binding.ts:33-53), 409 ANSWER_CHANGED (revisionId is not the current revision), 409 COMMITMENTS_NOT_ACKNOWLEDGED (unless acknowledgedCommitments equals, in order, the sha256 of each commitment of that revision), or 409 ALREADY_SIGNED (this signer's decision, or review, already stands on this revision).
6. Authority again on the transaction client; strict RBAC when enforced; separation of duties with the declared meaning.
7. write(client): no domain UPDATE, because the signature is the approval. It returns the act.
8. recordGovernedAction('sign') and persistGovernedSignSignature on the same client. The act goes on the manifest; signature_purpose is the reason; authentication_method is 'password' or 'password+totp'.
9. COMMIT. A refusal writes nothing.

**Content binder.** CONTENT_BINDERS['haq-answer'] in server/services/part11/governed-target-binders.ts (beside :160-167).
- It reads, on the signing client and org-scoped, the question and its latest revision. It returns ledgerFallback for a malformed id, an unreadable row or no revision.
- Digest: haqAnswerDigest from server/services/haq/answer-content.ts, the one recipe = sha256CanonicalJson({organizationId, letterId, questionId, questionNumber, questionText, answer:{responseText, sourceRefs, commitments}}).
- CONTENT ONLY: no revision number, status, author or time (the binder rule at governed-target-binders.ts:41-47 and the ectd-sequence lesson at signature-persistence.ts:543-581).
- New basis BINDING_BASIS.HAQ_ANSWER_CONTENT = 'haq-answer-content-sha256'. binding_basis is free TEXT, so no migration is needed.
- A test pins act.revisionContentSha256 === bound_payload_digest. Both come from the one function.

**Verification: one reader.** server/services/haq/answer-approval.ts serves the read, the readiness verdict and the package.
- It selects electronic_signatures rows WHERE organization_id=$1 AND signed_target = ANY($2) AND manifest act.kind = 'haq-answer-sign'. A signature from any other door counts for nothing.
- An approval STANDS only if every one of these holds:
  - the meaning is in DECISION_ACT_MEANINGS;
  - isSignatureWithdrawn is false (server/services/part11/signature-persistence.ts:242-254);
  - act.revisionId equals the current revision id;
  - binding_basis is HAQ_ANSWER_CONTENT;
  - bound_payload_digest equals haqAnswerDigest of the live rows.
- Possible states: 'approved'; 'lapsed' (another revision, or cause 'content-mismatch'); 'revoked' (withdrawn); 'none'.
- A review stands by the same test with meaning review.

**Spending.** Inherent: act and signature commit together, and a signature only makes its own revision ready. The package records the signature ids it was built from.

**Voiding.** Not applicable. There is no precheck-then-act chain and a refusal persists nothing, so P-23's void is not called.

**Separation of duties.** New case 'haq-answer' in resolveTargetAuthors (server/services/governance/separation-of-duties.ts:402-445; the default NOT_MODELLED note at :439-443 is updated).
- Authors are the DISTINCT author_id of every revision of that question, org-scoped, counting every version as documentAuthors does.
- The person who recorded the question or the letter is not an author. A decision comment says so, as 'ectd-sequence' explains its own choice.
- No revision means modelled but no author, which is 409 AUTHOR_UNRESOLVED.
- signerIndependenceOf (:506-537) feeds the screen's advance notice from the enforcing check itself.

**Revocation.** Not reachable in this slice. That is the same standing gap as protocol-document, report-run, interim-snapshot and qms-document.
- In the product, a person withdraws an approval by saving a new revision with a stated reason. That lapses it on the record, and the ledger names the lapsed signature.
- The reader already honours revoked, voided and superseded rows, so a later revocation door needs no reader change.

**Audit chain.** Every write is in the chained ledger:
- create letter; create question; revise answer (with lapsedSignatureId); withdraw; sign;
- the package's EXPORT_GENERATED row with the SHA-256 of the delivered bytes.

## When an answer changes

**No status is stored.** Approval is re-derived at every read and every use.

**One way to change an answer.** POST /questions/:questionId/answers appends a revision.
- Body, .strict(): {basedOnRevisionId: integer|null, responseText, sourceIds: integer[] (same-program data-room sources, snapshotted to {sourceId, title, sha256} at save), commitments: string[] (at most 20), reason?}.
- One transaction:
  1. BEGIN and setTenantContextTx.
  2. SELECT the question JOIN its letter FOR UPDATE, then program admission and the live role.
  3. Refuse 409 ANSWER_CHANGED when basedOnRevisionId is not the current revision (optimistic concurrency).
  4. Refuse 409 NO_CHANGE for content identical to the current revision, so a no-op save cannot churn approvals.
  5. Compute standing approvals and reviews on the same client. If any stands and no reason of at least 8 characters was given, refuse 409 REASON_REQUIRED_TO_LAPSE: "This answer is approved by <name> under signature <id>. Saving a change withdraws that approval. Give a reason of at least 8 characters. Nothing was saved."
  6. INSERT the revision.
  7. enforceAuthorLineage on the same client, ref {documentTable:'haq_answer_revisions', documentId}, actor = the session user (server/services/clinical-regulatory-evidence/lineage-gate.ts:222-252).
  8. recordGovernedAction, command 'revise', target 'haq-answer:<qid>', payload {revisionId, revisionNumber, contentSha256, lapsedSignatureIds: [...]}.
  9. COMMIT.

**What lapses an approval**
- **A new revision.** The current revision id changes, so every approval and review on the earlier revision reads 'lapsed'. This holds even for a revision that restores identical earlier words.
- **An out-of-band change.** A superuser edit that bypasses the triggers changes the re-derived digest, so the approval reads 'lapsed' with cause 'content-mismatch'.
- **Withdrawal of the signature** (revoked, voided, superseded or is_valid=false) reads 'revoked'.
- **Question text and number, and letter identity,** are immutable in the database. A mistranscribed question is withdrawn with a reason and re-entered. A withdrawn question is never packaged.

**Who may approve after an edit.** Authorship comes from every revision, so whoever saved the new revision joins the author set. A different signer must approve.

**Paths deleted.** The routes that silently overwrote 'approved' go: assign, review and ai-draft (server/routes/haq-manager.ts:322-397), and create-with-status (:199, :212).

**What the screen says.** "Approval lapsed — the answer changed after <name> signed revision N. It needs a new signature."

**At packaging.** The package door re-derives every digest in the same transaction that reads the content, under FOR SHARE.

## The response package

**Route.** POST /api/haq-manager/letters/:letterId/package {format:'docx'|'markdown'}.
- It replaces POST /letters/:id/assemble.
- It also replaces the client's call to /api/concept2cure/artifacts/export-docx. In production that route refuses with 403 HUMAN_REVIEW_REQUIRED without a governance block (server/services/export/exportReviewGate.ts:60-65, :110-121). Because apiRequest throws on the 403 (client/src/lib/queryClient.ts:387-441), the client told the user the package was not assembled (client/src/concept2cure/v2/surfaces/HaqManager.tsx:311-320).

1. **Read, in one transaction.**
   - BEGIN and setTenantContextTx.
   - SELECT the letter FOR SHARE, org-scoped.
   - requireCurrentProgramAccess with forShare; the live role in GOVERNED_WRITE_ROLES.
   - Refuse 409 LETTER_WITHDRAWN.
   - Read the non-withdrawn questions FOR SHARE, ordered by ordinal; none gives 409 NO_QUESTIONS.
   - Read the current revisions and the signature rows on the same client.
2. **Verdict.** assessLetterReadiness (server/services/haq/haq-store.ts) is the same function GET serves as letter.readiness.
   - Ready means every non-withdrawn question has a current revision with a standing approval.
   - Otherwise 409 PACKAGE_NOT_READY with outstanding [{questionId, questionNumber, why: 'no-answer'|'not-approved'|'approval-lapsed'|'approval-revoked'}] and a sentence naming them.
   - A partial response is never produced (WORKFLOW_DECISION :261: "A partial response does not start FDA's clock").
3. **Build.** buildResponsePackage (server/services/haq/response-package.ts) is pure and deterministic.
   - Header: "Response to FDA <letter class label>", the agency reference, the IND submission title, received date and response due date, each as recorded.
   - Per question, in ordinal order:
     - the number (or "Question (unnumbered in the letter)") and the discipline;
     - the question verbatim;
     - the approved response text;
     - references rendered from the revision's snapshot as "<title> (data room source <id>, SHA-256 <hash>)". This fixes the String(object) "[object Object]" defect at haq-manager.ts:496;
     - the commitments, numbered;
     - "Approved by <signer name> (<meaning>) on <ISO time> under electronic signature <signatureId>. Reason: <reason>", read from the signature row.
   - Closing note: each approval is recorded in the platform's Part 11 record; this file renders the approved text and is not itself a signature.
   - packageSha256 is the sha256 of the markdown.
4. **Deliver, after COMMIT.**
   - DOCX comes from generateDocxBuffer(title, markdown); markdown is delivered as its bytes.
   - Both go through createGovernedExportConsequence (server/services/export/governedExportConsequence.ts:119-186) with:
     - projectId = the anchor that requireCurrentProgramAccess returned;
     - sourceType 'export_docx' or 'export_txt' (mime text/markdown);
     - contentForArtifact = the markdown;
     - metadata {haqLetterId, agencyReference, packageSha256, format, entries:[{questionId, questionNumber, revisionId, revisionNumber, contentDigest, signatureId, signatureActionId, signerId, meaning, signedAt}], withdrawnQuestionIds}.
   - That writes the concept2cure_artifacts row and the EXPORT_GENERATED audit row with the delivered bytes' SHA-256.
5. **Response.** {data:{artifactId, deliveredSha256, packageSha256, filename, mimeType, base64, questionCount}}. The client downloads exactly those bytes and states the artifact id and SHA-256.

**Not in this slice.** Placing the package in the response eCTD sequence (WORKFLOW_DECISION :262). Respond's "Start a response sequence" step remains that path (client/src/concept2cure/v2/surfaces/ProjectRespond.tsx:94-130).

## AI drafting

**No model is called anywhere in the agency-questions path.** Nothing in it can be served by a PQ-pending model, and nothing in it asks a model for a figure or a verdict (CLAUDE.md Rule 2). Readiness, the clock, the quote check, the split proposal and the package are all deterministic.

**Deleted:** POST …/ai-draft and generateAIDraft (server/routes/haq-manager.ts:346-370, :603-656). That door:
- drafted under taskType 'regulatory_review', which the production PQ rule does not cover (server/services/ai-governance/approved-models.ts:333, :343-347; server/services/ai-gateway/__tests__/pq-production-gate.test.ts:138-146);
- sent the model '{}' instead of the question (:628-640);
- persisted a stock sentence on an empty reply, and the demo fixture outside production (:649-656);
- answered every gateway refusal with a 500 (:366-368);
- recorded no provenance;
- had no screen caller.

**Its replacement, by path.** ProjectRespond's "Draft the response with AnA" (client/src/concept2cure/v2/surfaces/ProjectRespond.tsx:42-50) leads to AnA's canvas, then to POST /api/authoring/sections/:sectionId/ai/draft (taskType 'document_drafting', server/routes/authoring.router.ts:3866).
- In production that door refuses with 403 MODEL_NOT_QUALIFIED until a PQ passes.
- It keeps turn records, server-side provenance and governed-machine-claims.
- Reachability is held by client/src/concept2cure/v2/__tests__/projectRespondStage.test.tsx and tests/ui/filing-path-reachability.test.ts.

**Provenance of saved answers.**
- Answer text saved in agency questions is the saving person's assertion. author_id comes from the session.
- enforceAuthorLineage records every clause as theirs, and the writer file joins GUARDED in scripts/ci/check-lineage-save-gate.mjs.
- No request field names a model. This is P-30's honest path (docs/MODEL_GOVERNANCE_DECISION_2026-10-13.md:22-55).
- The editor says so: "Saved as your words. If AnA drafted any of it, saving adopts it as yours."

**The split (graft).** GET /letters/:letterId/proposed-questions runs a pure proposeQuestionSplit(text) (server/services/haq/letter-text.ts) over the data room's extracted_text.
- It recognises the letter's own leading enumerations ("1.", "Question 2", "IR #3", "Comment 4:") and keeps the captured number verbatim.
- Text without numbering becomes one unnumbered chunk; it never numbers by index.
- It returns {basis:'letter-numbering'|'unnumbered'|'no-source-text', proposals:[{questionNumber|null, text}]} and writes nothing.
- The person reviews, edits or drops each proposal and records the questions. Each is quote-checked against the same text. AnA never marks anything approved.

**Guard.** server/services/ana/__tests__/ana-cannot-approve-agency-answer.test.ts mirrors ana-cannot-disposition-shadow-finding.test.ts:24-58. It checks that:
- no AnA tool name or description approves, signs or answers an agency question;
- no file under server/services/ana, server/services/ana-ri or server/mcp names '/api/haq-manager', signHaqAnswer, 'haq-answer' or 'haq_answer_revisions' (grep today finds none);
- more than 50 files were scanned.
The surface keeps one view-state action, haq-manager.select-question (shared/navigation/surface-actions.ts:1175-1184), under GOVERNED_VERB_PATTERN (:92-103).

**Phantom tool families removed.** draft_haq_response and search_precedent_responses go (shared/constants/ui-surface-registry.ui-v2.ts:334), as do the document families mapped to this surface (client/src/concept2cure/v2/registryModel.ts:583). Both become [].

## Scoping

**Scope chain.** organization → program (regulatory_programs, the v2 project) → submission (an IND on submissions.program_id) → letter → question → revision.

**Admission.** Every request admits the caller through requireCurrentProgramAccess (server/services/c2c/current-program-access.ts:103-119):
- the program is in the organization;
- the actor is a current active member;
- the program has a unique project anchor;
- project sharing admits the actor.
Its 404, 403, 409 and 503 codes map through verbatim.

**Writes need more.** Read admission is not write admission, so writes also need actor.role in GOVERNED_WRITE_ROLES (server/middleware/orgMembership.ts:509), on top of the router's requireEditorAccessForWrites.

**Program from the row.** Question and answer routes take only the row id. The program is derived from the row's letter inside the same transaction, so no second id in the URL can disagree. That removes the ignored-:id defect (server/routes/haq-manager.ts:325-327, :402-404).

**Every statement is scoped.** Each SQL statement carries organization_id and a program or letter predicate. Reads are per program; there is no org-wide list. The org-wide query and the arbitrary cached first project (server/utils/feature-persistence.ts:13-56, :78-84) leave with the feature store. Letter numbers are no longer join keys.

**Release boundary.** server/services/haq/letter-scope.ts holds one constant, in the style of services/cmc/composition-scope.ts. Intake refuses with 409 HAQ_SCOPE, by name, unless:
- the submission's application_type is 'ind' and its primary_region is 'fda';
- the letter class is one of information_request, discipline_review_question or hold_letter.
Widening it is a founder decision and never needs a migration.

**Clock (graft).** The read computes each letter's clock with the canonical pure engine, correspondenceResponseClock (server/services/regulatory-correspondence/response-clock.ts:139), from {direction:'inbound', communicationType: letter_type, responseRequired: true, status: null, receivedAt: received_on, dueDate: response_due_on, submissionType: 'ind'}.
- The agency's stated date governs.
- With no stated date and no codified window, the clock is reported as that and never as invented overdue. No HAQ-local daysUntil is written.

**Database.**
- The identity trigger ties program, submission, source and organization together.
- Composite foreign keys keep each child in its parent's tenant.
- The tenant sweep adds tenant_isolation_policy.
- setTenantContextTx runs right after every BEGIN.

**Mount and middleware.**
- The mount becomes app.use('/api/haq-manager', authenticateToken, haqRouter) (server/bootstrap/register-document-routes.ts:192-207), and its false comment is corrected.
- The router chain is tenantContextMiddleware → requireOrganizationContext → requireEditorAccessForWrites (as server/routes/c2c/exports.ts:58-61).
- The private resolveOrgId (haq-manager.ts:35-45) is deleted, which shrinks scripts/ci/tenant-resolvers-baseline.json:86.

**Tenant purge.** It erases the three tables through the door. Ledger and electronic_signatures rows keep their own retention.

## The screen

client/src/concept2cure/v2/surfaces/HaqManager.tsx is rewritten as a view of one server read. It computes no verdict, and every key is a server id.

**Program and read**
- The program comes from useShellProject() (client/src/concept2cure/v2/shellProject.ts:246). With no program open it shows "Open a project to see its agency letters." and sends no request.
- The read: useLiveData('/api/haq-manager/programs/<pid>/letters', [pid, epoch], isHaqProgramRead), with a shape guard as ShadowFindingDisposition.tsx:238 has.
- Every successful act bumps epoch and re-reads (SubmissionCenter.tsx:983, :1004). The statusMap and overlay (HaqManager.tsx:110-120, :339-344) are deleted, so the in_review / in-review split disappears with them.

**Reuse, not copies (graft).**
- The IND picker reads programSubmissionsPath (client/src/concept2cure/v2/surfaces/programSequence.ts:31-32).
- The letter picker reads sourcesUrl, isSourcesPage and sourceCanGround (client/src/concept2cure/v2/surfaces/projectSources.ts:51-71).
- Both are already launch paths, used by ProjectRespond.

**Empty states.** Each is shown as itself:
- "This project has no US IND recorded. Agency questions in this release answer FDA letters on a US IND."
- "No letter in the data room has been recorded. Add it from the Respond tab, then record it here."
- "No agency letters recorded for this project."
- A read error is shown as an error, never as empty.

**Record a letter (C2CForm, writers only).**
- Fields: the IND (non-IND or non-FDA submissions are listed as not in this release); the letter file, from the data room (a source with no readable text is offered with the note that questions cannot be checked against it); the letter class (the release subset); the agency reference; received on; response due "as the letter states it" (optional); a reason (optional).
- Its note is true: "Recorded with your name, the time and your reason in the audit trail."

**Add questions.**
- "Propose from the letter" calls proposed-questions and prefills editable rows. The basis is shown, for example "split by the letter's own numbering" or "the letter's text could not be read".
- Each row: the number as the letter states it (may be blank = unnumbered), discipline, CTD section (optional), the text verbatim.
- One reason (optional) covers the batch. Rows save in one request; the server quote-checks each.

**Letter strip.** The letter class label, reference, IND, received date, due date and the server's clock: bucket and days from the engine; "no due date on record" when there is none.

**Question rows.**
- A state pill from the server: Unanswered, Answered — not approved, Reviewed, Approved, Approval lapsed, Approval withdrawn, Withdrawn.
- The quote check: "Found verbatim in the letter", "Not found verbatim in the letter's text — check it against the letter", or "The letter's text could not be read".

**Question detail.**
- The question verbatim.
- The answer: revision N of M, the author's name with GovernedTimestamp, references with titles and source ids, commitments numbered.
- "Edit answer" (writers): a textarea, references picked from the data room, commitments added or removed, and a reason. The reason is required and labelled when an approval stands: "Saving a change withdraws <name>'s approval." The save sends basedOnRevisionId.
- "Withdraw question" uses GovernedConfirmDialog with a required reason (client/src/concept2cure/_shared/components/GovernedConfirmDialog.tsx:16-26). It is not presented as a signature.

**Signing.** A new module, client/src/concept2cure/v2/surfaces/HaqAnswerSigning.tsx, mirrors ShadowFindingDisposition.tsx:86-268.
- HAQ_APPROVAL_MEANINGS = ['approval','responsibility']; HAQ_REVIEW_MEANINGS = ['review'].
- "Approve answer (Part 11 e-signature)" and "Sign review (Part 11 e-signature)" show only when the server says viewer.canSign, an answer exists, and signer = 'independent'.
- Notices replace the buttons otherwise:
  - signer 'author': "You wrote or edited this answer, so you cannot approve it. Another person with signing authority must sign."
  - 'unresolved', 'unverified' and no authority each get their own sentence.
- With commitments, a pre-step lists each one with a checkbox, "I approve this commitment". Continue is enabled only when all are ticked.
- Then EsignModal (client/src/concept2cure/_shared/components/EsignModal.tsx:118-176):
  - signer from esignSignerOf(useAuthUser()); requireMfa = authUser?.mfaEnabled === true; meanings narrowed;
  - target "Question <n> — <agency reference>";
  - targetMeta "Signs revision <r>: its text, <k> references and <m> commitments. Any later change to the answer withdraws this approval."
- onSign POSTs {reason, meaning, reauth, revisionId, acknowledgedCommitments} through mutateVerbatim (client/src/concept2cure/v2/surfaces/SubmissionSeqWorkspaces.tsx:158-205):
  - a dropped connection or 5xx reads "could not be confirmed";
  - a refusal shows the server's own sentence;
  - the manifest is built from the server's signedAt and sha256Chain (ProtocolDevSigning.tsx:85-115).

**Signature sentences**, from server fields only, with times in GovernedTimestamp:
- "Approved by <name> (<meaning>) on <time> under signature <id>. Reason: <reason>."
- "Approval lapsed — the answer changed after <name> signed revision <n>. It needs a new signature."
- "Approval withdrawn — signature <id> is no longer in force."

**Readiness and package.**
- "<approved> of <total> answers approved" and the outstanding list come from letter.readiness.
- "Assemble response package (Word)" and "Markdown" are enabled only when readiness.ready is true. They POST the package route and download the returned bytes.
- Toast: "Response package recorded as artifact <id> (SHA-256 <first 12>) and downloaded — <n> signed answers." A refusal shows the server's outstanding list.

**Copy removed.**
- "decomposed, source-traced, answered with precedent" (HaqManager.tsx:415-419, :447)
- "Traced to the locked dossier" (:607-614)
- the AnA analysis block (:592-602)
- "Precedent intelligence" (:638-646)
- "persisted to the HAQ store (a recorded approval…)" (:693-696)
- the "predates the id-mapped feed" jargon (:256-258)
- 'Refine with AnA' and 'Precedent compare' (it asked about NDAs, :669)
The two buttons become one "Ask AnA about this question" chat prompt, keyed to the question number and the IND, never to the question text.

**New header.** "FDA letters on this project's IND, question by question. Each answer is written by a named person and approved by electronic signature before the response package is assembled."

**AnA context.** It carries server readiness counts, clock buckets and question numbers, never question text.
- availableActions: explain what a question asks; find data-room sources for it; explain what is outstanding.
- client/src/concept2cure/v2/registryModel.surfaceCtx.ts:287-312 loses "Pre-draft the 3 predicted HAQs" and the predicted-HAQ triage.

**Writes.** All live in client/src/concept2cure/v2/surfaces/HaqWrites.ts: recordLetter, proposeQuestions, addQuestions, saveAnswer, withdrawQuestion, withdrawLetter, assemblePackage, each through mutateVerbatim.

**Respond tab.**
- ProjectRespond.tsx gains a step after "Add the agency's letter": "Answer it question by question", which calls onNav('haq-manager').
- client/src/concept2cure/v2/fixtures/project-home-data.tsx:309-310 drops "Question-by-question tracking of agency letters" from the coming-later line and keeps agency meetings and precedent responses.

## Opening the surface

The opening lands last, in its own commit, after every gate below is green.

**1. Launch scope.** In shared/constants/launch-scope.ts:122-130, add 'haq-manager' to Submission Center's surfaces.
- Modules stay ['submission-center','ectd-compile','gateway-transmittals'] (the P-28/P-32 rule).
- The comment is rewritten to say why it opens now: approval is a Part 11 signed act bound to the answer revision and its commitments; every write is ledgered; the router serves only the screen's routes.
- No quoted ids in the comment (:85-86). The app count stays 8.

**2. Registry entry** (shared/constants/ui-surface-registry.ui-v2.ts:323-343).
- apiPrefixes stays ['/api/haq-manager']. The router mounts exactly the nine routes the screen calls, pinned by a route-enumeration test with an empty ADMITTED_UNCALLED (the pattern at server/services/entitlements/__tests__/ind-launch-claim.test.ts:77-80, :153-158).
- anaToolFamilies becomes [].
- notes: "FDA letters on a US IND, question by question: each answer written by a named person, approved by Part 11 electronic signature bound to its text and commitments, and assembled into a recorded response package from the signed answers."

**3. Legacy registry.** report-engine drops '/api/haq-manager' (shared/constants/ui-surface-registry.ts:827). No report-engine screen calls it, so modulesForPath('/api/haq-manager/…') becomes {haq-manager}.

**4. Catalog copy.** Amend db/migrations/20260823_module_catalog_customer_copy.sql:112 in place, under a dated header (Rule 1).
- New text: "Health-authority questions — FDA letters on a US IND recorded from the project's data room, each question as the letter states it, each answer and its commitments approved by electronic signature, and the response package assembled from the signed answers."
- The same header corrects the earlier claim at :23-25 that both screens had opened.
- tests/schema-contract/catalog-module-claims.contract.test.ts:211-218 flips: the copy must match /electronic signature/i and /FDA/, and must not match /source-traced|precedent|Day-120/i.

**5. Pinned tests flip.**
- server/middleware/__tests__/launch-scope-api-gate.test.ts:455-560:
  - haq-manager is in scope;
  - the HAQ list becomes the nine real paths, each answering launch;
  - "No launch screen reaches /api/haq-manager" (:540) becomes "every /api/haq-manager path a screen names is launch, and only haq-manager names it";
  - the claim stays ['/api/haq-manager'].
- server/services/entitlements/__tests__/ind-launch-claim.test.ts:63-108: the HAQ calls are served; the claim set is ['haq-manager']; '/api/regulatory-correspondence/7' is still not haq-manager's.
- server/services/entitlements/__tests__/launch-scope.test.ts:182-206: the surfaces include it, and the module is still not granted.
- server/__tests__/routes/smoke.test.ts:286-288: the mount carries authenticateToken.

**6. Gates.**
- Pre-push and local: ci:launch-scope and ci:launch-scope-api, each with its selftest (0 violations; every HaqManager call answers launch); ci:sign-ceremony and its selftest; ci:lineage-save-gate; ci:migration-drop-safety and its selftest; ci:migration-set-order; ci:tenant-resolvers; ci:server-error-leaks; ci:fabricated-identity; the copy and tone gates.
- Blank-database CI job: ci:purge-coverage and the security-definer dbtest.

**7. Decision record.** A dated amendment under "### P-32" in docs/LAUNCH_DEFINITION_OF_DONE.md, after :469-473. It records:
- what opened and why the condition is met;
- the release boundary;
- the commitments reading: each commitment is enumerated, acknowledged and bound within its answer's single §11.50 ceremony, under WORKFLOW_DECISION :107 (g) and :261, and the manifest lists each one, so splitting them later needs no data change;
- that AI drafting is excluded from agency questions;
- that this is the one store of agency letters and signed answers. The locked Correspondence OS migrates onto it before communication-center or program-journey opens. CMC's Module 3 file is a named exception awaiting the founder's decision;
- the revocation gap.

Also updated:
- the D2 and D5 row notes, pointing at the evidence;
- dated notes at docs/SURFACE_DECISIONS_2026-10-08.md:158 and docs/design/FILING_SPINE.md:209, :375;
- a correction note at docs/evidence/D2-ONE-ANA/2026-10-15/f15-respond/README.md:15.

CLAUDE.md is not edited; the founder may update Rule 2's P-32 sentence.

## What is deleted, and what replaces it

**Before the deletion commit.** Run `git fetch --unshallow`, then the working agreement's history search: git log --all --diff-filter=D -- 'server/**/*haq*' 'client/**/*Haq*' 'scripts/seed/**/*haq*' 'client/**/*Editor*' 'client/**/*Canvas*'. Today's clone is shallow. The output goes into the evidence README, and any earlier HAQ surface it finds is named in the commit.

**1. server/routes/haq-manager.ts.** All 11 routes are rewritten in the same file.
- GET /rounds → GET /programs/:programId/letters.
- POST /questions → POST /programs/:programId/letters (record a letter) plus GET /letters/:letterId/proposed-questions and POST /letters/:letterId/questions (strict body; status is no longer accepted).
- POST …/review (the unsigned "Route to review") → POST /questions/:questionId/sign with meaning 'review'.
- POST …/approve → POST /questions/:questionId/sign with meaning approval or responsibility.
- POST …/assemble → POST /letters/:letterId/package.
- POST …/assign, GET /letters, GET /letters/:id, GET /letters/:id/questions and GET /dashboard had no screen caller (HaqManager.tsx:98, :194, :262, :292, :311), so no user outcome is lost:
  - the free-text owner and assignee are replaced by the recorded revision author;
  - the dashboard's false all-clear (:539-581) goes.
- POST …/ai-draft → ProjectRespond "Draft the response with AnA" → server/routes/authoring.router.ts POST /sections/:sectionId/ai/draft.
- New routes are added: POST /questions/:questionId/answers, POST /questions/:questionId/withdraw and POST /letters/:letterId/withdraw.
- Pinned by server/routes/__tests__/haq-manager-routes.test.ts (route enumeration) and the launch tests.

**2. createFeatureStore('haq_question') use** → the three tables, through server/services/haq/*. server/utils/feature-persistence.ts stays, because other features use it.

**3. server/routes/c2c/haq-sessions.ts is deleted.**
- No client calls /haq-session.
- Its GET /reviews/pending (:337-394) moves verbatim to server/routes/c2c/reviews.ts, which has the same middleware chain (:58-65) and the same mount (server/bootstrap/register-concept2cure-routes.ts:30). That keeps tests/e2e/multi-user-review.e2e.ts:498 and the '/api/concept2cure/reviews' claim working.
- Consequential edits:
  - remove the mount and import (register-concept2cure-routes.ts:12, :38);
  - server/routes/c2c/__tests__/c2c-router.parity.test.ts:250-267 (/reviews/pending now on the reviews router; the haq-session paths on no router);
  - remove the NOT_PROSE entry (scripts/ci/check-lineage-save-gate.mjs:83-87);
  - docs/reports/requestdb-coverage-baseline.json:49, :280;
  - remove it from WIRED_FILES in tests/artifact-change-invalidates-bundles.contract.test.ts:89-92 (missed by both designs).

**4. scripts/seed/ga-demo.d/94-haq.mjs.**
- It wrote feature-store rows that nothing reads after this change, carrying fabricated figures (ORR 42.1%, :38-41) and approvable drafts.
- It is not a user-facing capability. Demo letters are recorded through the product's own intake.

**5. Registry claim and families.**
- report-engine's '/api/haq-manager' claim (shared/constants/ui-surface-registry.ts:827).
- The never-implemented anaToolFamilies (ui-surface-registry.ui-v2.ts:334) and the document families mapped at client/src/concept2cure/v2/registryModel.ts:583.

**6. Client blocks with no writer behind them** are replaced in the same file: AnA analysis, Precedent intelligence and precedentNote, Precedent compare, and Refine with AnA → "Ask AnA about this question".

**7. Tests of removed behaviour,** each replaced by a test of the replacement:
- server/routes/__tests__/haq-manager-write.test.ts, haq-assemble.test.ts and haq-manager-rounds.test.ts → haq-manager-routes.test.ts plus the server/services/haq tests.
- The HAQ block of client/src/concept2cure/v2/__tests__/microWireups.test.tsx:56-90 → client/src/concept2cure/v2/__tests__/haqManager.test.tsx.

**Not deleted, with the boundary recorded instead:**
- **The Regulatory Correspondence OS** (db/migrations/20260331_regulatory_correspondence_os.sql; server/routes/regulatory-correspondence.ts). Its surfaces are locked, in the coming-later Agency correspondence family (docs/SURFACE_DECISIONS_2026-10-08.md:158). It migrates onto this store before it opens.
- **CMC's Module 3 file** (server/routes/cmc-agency-questions.routes.ts; CmcModule.tsx:2378-2870). A named exception, pending the founder question.

## Proof: tests and mutations

**Red first: written and run against today's code, outputs kept in red/.**
- R1 haq-manager-routes: a question created with status 'approved' is refused, and is never ready (today POST /questions keeps it, haq-manager.ts:199/:212, and assemble answers 200).
- R2 approval without a signature is refused (today /approve answers 200 with an empty body, :399-416).
- R3 an answer changed after approval reads lapsed and the package is refused.
- R4 a viewer gets 403 on every POST.
- R5 every write leaves a c2c_ana_actions row and an audit_logs row naming the actor and the reason.
- R6 two programs' letters with the same reference never merge (today byRound is keyed by letterId, :143-147).
- R7 router.stack equals the nine screen calls (today ai-draft, assign and dashboard are present).
- R8 resolveTargetAuthors('haq-answer:5') is modelled (today NOT_MODELLED, separation-of-duties.ts:439-443).
- R9 deriveGovernedTargetBinding gives the 'haq-answer-content-sha256' basis (today the ledger fallback).
- R10 the catalog contract expects /electronic signature/i.
- R11 the launch tests list haq-manager.
- R12 client: Approve opens EsignModal and posts reauth.

**Green: new and updated tests.**
- server/services/haq/__tests__/haq-schema.pglite.test.ts, over stub organizations, regulatory_programs, submissions, cre_evidence_sources, users and vault.legal_holds:
  - the file applies twice;
  - revisions refuse UPDATE, DELETE and TRUNCATE;
  - letters and questions allow exactly one withdrawal and refuse every other UPDATE;
  - the identity guard refuses a cross-program or cross-org source, a checksum mismatch, a NULL checksum, another program's submission and a deleted program;
  - composite foreign keys refuse a cross-org child;
  - revision gaps are refused, and so is a revision on a withdrawn question;
  - the purge door refuses without pending_deletion or under a legal hold, and erases children first;
  - the letter_type CHECK list equals AGENCY_LETTER_CLASSES.
- server/services/haq/__tests__/answer-approval.test.ts (pure): approved; lapsed by another revision; lapsed by a digest mismatch on the same revision; revoked, voided and superseded; wrong basis; no manifest act counts for nothing; a review never approves.
- server/services/haq/__tests__/answer-signature.pglite.test.ts: the real signGovernedAct over the real SoD and binder, with verifyReauth stubbed per case as in governed-signature-permissions.pglite.test.ts.
  - Refusals: no password 401 REAUTH_*; 'authorship' 400 MEANING_NOT_ALLOWED; a member without authority 403 ESIGNATURE_NO_AUTHORITY, before the credential; the author 403 SEPARATION_OF_DUTIES; 409 NO_ANSWER; 409 ANSWER_CHANGED for a stale revisionId; unacknowledged or reordered commitments 409; withdrawn 409; cross-org 404; the same signer twice 409 ALREADY_SIGNED.
  - Nothing is written on any refusal.
  - Success writes one ledger 'sign' row and one electronic_signatures row, whose basis is 'haq-answer-content-sha256', whose digest equals haqAnswerDigest, and whose manifest act lists the commitments.
- server/services/haq/__tests__/haq-writes.pglite.test.ts:
  - intake: IND/FDA accepted; NDA or EMA refused 409 HAQ_SCOPE; a future received date 400; due before received 400; a duplicate reference 409; another program's source 404;
  - questions: quote check (verbatim, not-found, no-source-text); a duplicate number 409; a batch is all or none;
  - answers: basedOn mismatch 409; NO_CHANGE 409; a lapse without a reason 409; with a reason, the ledger names lapsedSignatureIds; enforceAuthorLineage runs on the same client.
- server/services/haq/__tests__/letter-text.test.ts: the split keeps the letter's numbers verbatim; unnumbered text is one chunk with number null; quote normalization (whitespace, curly quotes, dashes) is case-sensitive.
- server/services/haq/__tests__/response-package.test.ts: deterministic bytes; ordinal order; references from snapshots (no "[object Object]"); one signature line per answer; withdrawn questions excluded.
- server/services/haq/__tests__/haq-clock.test.ts: the read's clock equals correspondenceResponseClock's output for the same inputs.
- server/services/part11/__tests__/haq-answer-binder.test.ts: the digest changes with text, references, commitments and question text, and not with author or time; fallback for a malformed pointer, no revision, or another org.
- server/services/governance/__tests__/separation-of-duties.test.ts: 'haq-answer' authors are every revision author; 'haq:x' stays unmodelled.
- server/routes/__tests__/haq-manager-routes.test.ts: R1-R7; strict bodies; program-admission codes mapped; the package refused 409 with the outstanding list; the package recorded through createGovernedExportConsequence with entries metadata; a viewer's GET allowed.
- Also: server/services/tenant/__tests__/tenant-offboarding.test.ts (door listed and invoked before the parents); c2c-router.parity.test.ts; artifact-change-invalidates-bundles.contract.test.ts; the launch tests, catalog contract and smoke test; server/services/ana/__tests__/ana-cannot-approve-agency-answer.test.ts (more than 50 files scanned).
- Client: haqManager.test.tsx covers:
  - no program → no request;
  - viewer vs writer controls;
  - Approve offers only approval and responsibility, posts reauth, revisionId and acknowledgedCommitments, and re-reads after success;
  - a 5xx reads "could not be confirmed";
  - the author notice; the lapsed sentence; all commitments must be ticked;
  - assemble enabled only when readiness.ready;
  - none of the removed strings render;
  - the proposal prefill keeps the letter's numbers.
  projectRespondStage.test.tsx gets the new step and the coming-later line without question-by-question tracking. noFabricatedProgramIdentity and biopharmaJourneyNoInventedHistory still pass.

**Mutations: each applied, observed red, reverted, and recorded in mutations/.**
- M1 drop the digest compare in the reader → the lapsed tests fail.
- M2 drop the act.revisionId equality → "restored identical text still lapses" fails.
- M3 remove the revisionId check in prepare → ANSWER_CHANGED fails.
- M4 remove the commitments check → its test fails.
- M5 remove the 'haq-answer' SoD case → success fails with 409, and author-refused fails.
- M6 drop the act.kind filter → "a signature from another door counts for nothing" fails.
- M7 replace the binder with ledgerFallback → the basis assertions fail.
- M8 accept unknown keys on POST /letters/:id/questions → the strict-body status test fails.
- M9 remove requireEditorAccessForWrites or the live role check → the viewer tests fail.
- M10 drop the program predicate in the GET → the cross-program test fails.
- M11 comment out the revisions append-only trigger → the PGlite UPDATE test fails.
- M12 import signHaqAnswer into server/services/ana/AnaToolExecutor.ts → the AnA scan fails.
- M13 re-add /dashboard → route enumeration fails.
- M14 re-add '/api/haq-manager' to report-engine → the claim-set test fails.
- M15 remove 'haq-manager' from the surfaces → the flipped launch tests fail.
- M16 restore the old pins with the surface listed → they fail (the P-32 "relisted → 10 fail" table, reversed).
- M17 skip enforceAuthorLineage → ci:lineage-save-gate fails on the GUARDED entry.
- M18 the splitter numbers unnumbered chunks by index → the split test fails.
- M19 drop the /reviews/pending move → the parity test fails.
- M20 leave haq-sessions.ts in WIRED_FILES after the delete → the census test fails.
- M21 remove one class from the letter_type CHECK → the completeness test fails.
- M22 show Approve to an author → the client test fails.
- M23 place the migration after TENANT_ISOLATION_SWEEP → ci:migration-set-order fails.

Each CI gate's own selftest is also run, red then green: launch-scope, launch-scope-api, sign-ceremony and migration-drop-safety.

## Files

- `CREATE /home/user/ClinicalSageAI-2-replit/migrations/20261015i_haq_agency_letters.sql`
- `MODIFY /home/user/ClinicalSageAI-2-replit/scripts/db/migration-set.mjs`
- `MODIFY /home/user/ClinicalSageAI-2-replit/scripts/db/provision-app-role.mjs`
- `MODIFY /home/user/ClinicalSageAI-2-replit/scripts/db/security-definer-allowlist.json`
- `MODIFY /home/user/ClinicalSageAI-2-replit/server/services/tenant/tenant-offboarding.ts`
- `MODIFY /home/user/ClinicalSageAI-2-replit/server/services/tenant/__tests__/tenant-offboarding.test.ts`
- `CREATE /home/user/ClinicalSageAI-2-replit/shared/types/haq.ts`
- `CREATE /home/user/ClinicalSageAI-2-replit/server/services/haq/letter-scope.ts`
- `CREATE /home/user/ClinicalSageAI-2-replit/server/services/haq/answer-content.ts`
- `CREATE /home/user/ClinicalSageAI-2-replit/server/services/haq/letter-text.ts`
- `CREATE /home/user/ClinicalSageAI-2-replit/server/services/haq/answer-approval.ts`
- `CREATE /home/user/ClinicalSageAI-2-replit/server/services/haq/haq-store.ts`
- `CREATE /home/user/ClinicalSageAI-2-replit/server/services/haq/haq-writes.ts`
- `CREATE /home/user/ClinicalSageAI-2-replit/server/services/haq/answer-signature.ts`
- `CREATE /home/user/ClinicalSageAI-2-replit/server/services/haq/response-package.ts`
- `CREATE /home/user/ClinicalSageAI-2-replit/server/services/haq/__tests__/haq-schema.pglite.test.ts`
- `CREATE /home/user/ClinicalSageAI-2-replit/server/services/haq/__tests__/answer-approval.test.ts`
- `CREATE /home/user/ClinicalSageAI-2-replit/server/services/haq/__tests__/answer-signature.pglite.test.ts`
- `CREATE /home/user/ClinicalSageAI-2-replit/server/services/haq/__tests__/haq-writes.pglite.test.ts`
- `CREATE /home/user/ClinicalSageAI-2-replit/server/services/haq/__tests__/letter-text.test.ts`
- `CREATE /home/user/ClinicalSageAI-2-replit/server/services/haq/__tests__/response-package.test.ts`
- `CREATE /home/user/ClinicalSageAI-2-replit/server/services/haq/__tests__/haq-clock.test.ts`
- `MODIFY /home/user/ClinicalSageAI-2-replit/server/services/part11/governed-target-binders.ts`
- `MODIFY /home/user/ClinicalSageAI-2-replit/server/services/part11/signature-persistence.ts`
- `CREATE /home/user/ClinicalSageAI-2-replit/server/services/part11/__tests__/haq-answer-binder.test.ts`
- `MODIFY /home/user/ClinicalSageAI-2-replit/server/services/governance/separation-of-duties.ts`
- `MODIFY /home/user/ClinicalSageAI-2-replit/server/services/governance/__tests__/separation-of-duties.test.ts`
- `MODIFY /home/user/ClinicalSageAI-2-replit/server/routes/haq-manager.ts (rewrite: nine routes)`
- `MODIFY /home/user/ClinicalSageAI-2-replit/server/bootstrap/register-document-routes.ts`
- `CREATE /home/user/ClinicalSageAI-2-replit/server/routes/__tests__/haq-manager-routes.test.ts`
- `DELETE /home/user/ClinicalSageAI-2-replit/server/routes/__tests__/haq-manager-write.test.ts`
- `DELETE /home/user/ClinicalSageAI-2-replit/server/routes/__tests__/haq-assemble.test.ts`
- `DELETE /home/user/ClinicalSageAI-2-replit/server/routes/__tests__/haq-manager-rounds.test.ts`
- `CREATE /home/user/ClinicalSageAI-2-replit/server/services/ana/__tests__/ana-cannot-approve-agency-answer.test.ts`
- `DELETE /home/user/ClinicalSageAI-2-replit/server/routes/c2c/haq-sessions.ts`
- `MODIFY /home/user/ClinicalSageAI-2-replit/server/routes/c2c/reviews.ts (receives GET /reviews/pending verbatim)`
- `MODIFY /home/user/ClinicalSageAI-2-replit/server/bootstrap/register-concept2cure-routes.ts`
- `MODIFY /home/user/ClinicalSageAI-2-replit/server/routes/c2c/__tests__/c2c-router.parity.test.ts`
- `MODIFY /home/user/ClinicalSageAI-2-replit/tests/artifact-change-invalidates-bundles.contract.test.ts`
- `MODIFY /home/user/ClinicalSageAI-2-replit/scripts/ci/check-lineage-save-gate.mjs`
- `MODIFY /home/user/ClinicalSageAI-2-replit/scripts/ci/tenant-resolvers-baseline.json`
- `MODIFY /home/user/ClinicalSageAI-2-replit/docs/reports/requestdb-coverage-baseline.json`
- `DELETE /home/user/ClinicalSageAI-2-replit/scripts/seed/ga-demo.d/94-haq.mjs`
- `MODIFY /home/user/ClinicalSageAI-2-replit/shared/constants/launch-scope.ts`
- `MODIFY /home/user/ClinicalSageAI-2-replit/shared/constants/ui-surface-registry.ui-v2.ts`
- `MODIFY /home/user/ClinicalSageAI-2-replit/shared/constants/ui-surface-registry.ts`
- `MODIFY /home/user/ClinicalSageAI-2-replit/shared/navigation/surface-actions.ts (select-question description only)`
- `MODIFY /home/user/ClinicalSageAI-2-replit/client/src/concept2cure/v2/registryModel.ts`
- `MODIFY /home/user/ClinicalSageAI-2-replit/client/src/concept2cure/v2/registryModel.surfaceCtx.ts`
- `MODIFY /home/user/ClinicalSageAI-2-replit/client/src/concept2cure/v2/surfaces/HaqManager.tsx (rewrite)`
- `CREATE /home/user/ClinicalSageAI-2-replit/client/src/concept2cure/v2/surfaces/HaqAnswerSigning.tsx`
- `CREATE /home/user/ClinicalSageAI-2-replit/client/src/concept2cure/v2/surfaces/HaqWrites.ts`
- `CREATE /home/user/ClinicalSageAI-2-replit/client/src/concept2cure/v2/__tests__/haqManager.test.tsx`
- `MODIFY /home/user/ClinicalSageAI-2-replit/client/src/concept2cure/v2/__tests__/microWireups.test.tsx`
- `MODIFY /home/user/ClinicalSageAI-2-replit/client/src/concept2cure/v2/surfaces/ProjectRespond.tsx`
- `MODIFY /home/user/ClinicalSageAI-2-replit/client/src/concept2cure/v2/fixtures/project-home-data.tsx`
- `MODIFY /home/user/ClinicalSageAI-2-replit/client/src/concept2cure/v2/__tests__/projectRespondStage.test.tsx`
- `MODIFY /home/user/ClinicalSageAI-2-replit/db/migrations/20260823_module_catalog_customer_copy.sql (amend in place, dated header)`
- `MODIFY /home/user/ClinicalSageAI-2-replit/tests/schema-contract/catalog-module-claims.contract.test.ts`
- `MODIFY /home/user/ClinicalSageAI-2-replit/server/middleware/__tests__/launch-scope-api-gate.test.ts`
- `MODIFY /home/user/ClinicalSageAI-2-replit/server/services/entitlements/__tests__/ind-launch-claim.test.ts`
- `MODIFY /home/user/ClinicalSageAI-2-replit/server/services/entitlements/__tests__/launch-scope.test.ts`
- `MODIFY /home/user/ClinicalSageAI-2-replit/server/__tests__/routes/smoke.test.ts`
- `MODIFY /home/user/ClinicalSageAI-2-replit/docs/LAUNCH_DEFINITION_OF_DONE.md`
- `MODIFY /home/user/ClinicalSageAI-2-replit/docs/SURFACE_DECISIONS_2026-10-08.md`
- `MODIFY /home/user/ClinicalSageAI-2-replit/docs/design/FILING_SPINE.md`
- `MODIFY /home/user/ClinicalSageAI-2-replit/docs/evidence/D2-ONE-ANA/2026-10-15/f15-respond/README.md`
- `CREATE /home/user/ClinicalSageAI-2-replit/docs/evidence/D2-FOUNDER-DECISIONS/2026-10-15/p32-agency-questions-signed/README.md (+ red/, green/, mutations/)`

## Risks

- CMC's Module 3 agency-question file (/api/cmc/agency-questions, launch-claimed at shared/constants/ui-surface-registry.ts:532) stays a second launched store of agency questions until the founder decides on the fold. It is recorded as a named zero-duplication exception. A CMC question inside an FDA letter must be answered in agency questions to be packaged, and CMC's card will not show it.
- The locked Regulatory Correspondence OS stays a parallel letter, issue and package model, also used by the locked device pathway tabs (client/src/concept2cure/mdx/hooks/usePathwayTabsData.ts:8). It must migrate onto this store before communication-center or program-journey opens.
- Separation of duties bars anyone who saved any revision of an answer from approving it. A one-person regulatory team needs a colleague with signing authority (admin, approver or reviewer). The service ceremony cannot be relaxed per act.
- The ceremony re-authenticates before prepare() runs, so a signer can enter a password and then be refused 409 NO_ANSWER or ANSWER_CHANGED in a race. The read offers signing only when it would be valid, and the refusal says nothing was signed.
- An IND row whose submissions.program_id is not yet set (nullable until every writer sets it: shared/schema/submissions.ts:58-61) is not eligible. That program gets the honest 'no US IND recorded' state.
- requireCurrentProgramAccess needs a unique project anchor. A program without one gets 409 PROJECT_ANCHOR_UNRESOLVED, the same as Submission Center's program-scoped reads.
- The purge door widens ana_record_purger's DELETE grants to three more tables. It needs the security-definer dbtest and security review, and ci:purge-coverage runs only in the blank-database CI job.
- There is no revocation door for 'haq-answer', the same gap as the other domain-signed targets. Withdrawal is by a reasoned new revision, which the ledger records with the lapsed signature ids.
- The quote check and the split proposal depend on extracted text. A scanned letter yields 'no-source-text', the person then enters each question by hand, and the screen says so.
- Response prose can exist in two places: an Authoring document AnA drafted from Respond, and the answers here. Only signed answers here are packaged. Pasted AnA prose becomes the person's own assertion (P-30).
- The package is a governed export artifact, not yet a leaf of the response eCTD sequence. A manual upload elsewhere loses the binding until a follow-up slice places it.
- Approvals are written with signature_type 'governed-action'. An inspector export that filters on signature_type sees generic governed actions, and telling them apart relies on manifest act.kind.
- Legacy project_memory_entries 'haq_question' rows (demo databases only) become inert but still reach getProjectMemory (server/services/intelligence/project-intelligence-service.ts:276-283).
- The deletion-history search could not run in this shallow clone. If the full-clone search finds an earlier HAQ surface, it must be named before the deletion commit.

## Out of scope

- Folding CMC's Module 3 agency-question file onto this store. It waits on the founder question.
- Any model drafting inside agency questions, and the draft_haq_response and search_precedent_responses tools.
- A revocation door for domain-signed targets (haq-answer, protocol-document, report-run, interim-snapshot, qms-document).
- Filing the package to the Vault, or placing it as a leaf of the response eCTD sequence (WORKFLOW_DECISION §8 steps 5-7).
- Letters other than FDA letters on a US IND, and letter classes outside information_request, discipline_review_question and hold_letter. They are refused by name; widening is a founder decision.
- Migrating the Regulatory Correspondence OS, or opening communication-center or program-journey.
- Migrating legacy rows (feature-store haq_question, haq_session artifacts, reg_questions).
- Assigning a named reviewer and notifying them.
- BiopharmaJourney's 'Predicted HAQs' card (client/src/concept2cure/v2/surfaces/BiopharmaJourney.tsx:610), which is on the locked program-journey surface.
- A category filter in getProjectMemory.
- Editing CLAUDE.md.

## Implementation order

1. **0. Preconditions and history. Check out concept2cure-v2 and pull --ff-only. Run git fetch --unshallow and the working agreement's deletion-history search over haq, Haq, Editor and Canvas paths. Name the row (D2, with Part 11 evidence for D5) and the evidence folder in the first message.**
   - Files: `/home/user/ClinicalSageAI-2-replit/docs/evidence/D2-FOUNDER-DECISIONS/2026-10-15/p32-agency-questions-signed/README.md`
   - Proof: The search output and the unshallowed commit count are saved in the evidence README. The baseline run of today's HAQ and launch tests is saved to green/baseline.txt (81 tests pass on today's tree).
2. **1. Red first. Write R1-R12 against today's code, before any implementation, and record the failures.**
   - Files: `/home/user/ClinicalSageAI-2-replit/server/routes/__tests__/haq-manager-routes.test.ts`, `/home/user/ClinicalSageAI-2-replit/server/services/governance/__tests__/separation-of-duties.test.ts`, `/home/user/ClinicalSageAI-2-replit/server/services/part11/__tests__/haq-answer-binder.test.ts`, `/home/user/ClinicalSageAI-2-replit/client/src/concept2cure/v2/__tests__/haqManager.test.tsx`
   - Proof: red/r1-r12.txt shows each test failing for the stated reason: create-as-approved passes assemble, /approve answers 200 with no body, a viewer's POST answers 201, router.stack contains ai-draft, assign and dashboard, 'haq-answer' is NOT_MODELLED, and the binder falls back to the ledger.
3. **2. Schema. Write the migration with three tables, the identity, append-only and withdraw-once triggers, and the purge door. Add the migration-set entry, the grants, the security-definer allowlist entry and the offboarding door.**
   - Files: `/home/user/ClinicalSageAI-2-replit/migrations/20261015i_haq_agency_letters.sql`, `/home/user/ClinicalSageAI-2-replit/scripts/db/migration-set.mjs`, `/home/user/ClinicalSageAI-2-replit/scripts/db/provision-app-role.mjs`, `/home/user/ClinicalSageAI-2-replit/scripts/db/security-definer-allowlist.json`, `/home/user/ClinicalSageAI-2-replit/server/services/tenant/tenant-offboarding.ts`, `/home/user/ClinicalSageAI-2-replit/server/services/tenant/__tests__/tenant-offboarding.test.ts`, `/home/user/ClinicalSageAI-2-replit/server/services/haq/__tests__/haq-schema.pglite.test.ts`
   - Proof: haq-schema.pglite.test is green: it applies the file twice and covers every refusal. ci:migration-set-order, ci:migration-drop-safety and its selftest are green. M11 (trigger commented out), M21 (one class removed from the CHECK) and M23 (entry placed after the sweep) each turn red, then are reverted.
4. **3. Pure engines: the digest recipe, the release boundary, the quote check and split proposal, the package builder and the clock adapter.**
   - Files: `/home/user/ClinicalSageAI-2-replit/shared/types/haq.ts`, `/home/user/ClinicalSageAI-2-replit/server/services/haq/answer-content.ts`, `/home/user/ClinicalSageAI-2-replit/server/services/haq/letter-scope.ts`, `/home/user/ClinicalSageAI-2-replit/server/services/haq/letter-text.ts`, `/home/user/ClinicalSageAI-2-replit/server/services/haq/response-package.ts`, `/home/user/ClinicalSageAI-2-replit/server/services/haq/__tests__/letter-text.test.ts`, `/home/user/ClinicalSageAI-2-replit/server/services/haq/__tests__/response-package.test.ts`, `/home/user/ClinicalSageAI-2-replit/server/services/haq/__tests__/haq-clock.test.ts`
   - Proof: The pure tests are green. M18 (the splitter numbers by index) turns red. String(object) citations are refused by a test.
5. **4. Part 11 plumbing: the HAQ_ANSWER_CONTENT basis, CONTENT_BINDERS['haq-answer'] importing the one digest recipe, and the 'haq-answer' authorship case.**
   - Files: `/home/user/ClinicalSageAI-2-replit/server/services/part11/signature-persistence.ts`, `/home/user/ClinicalSageAI-2-replit/server/services/part11/governed-target-binders.ts`, `/home/user/ClinicalSageAI-2-replit/server/services/governance/separation-of-duties.ts`, `/home/user/ClinicalSageAI-2-replit/server/services/part11/__tests__/haq-answer-binder.test.ts`, `/home/user/ClinicalSageAI-2-replit/server/services/governance/__tests__/separation-of-duties.test.ts`
   - Proof: R8 and R9 turn green. The binder digest is unchanged by author and time, and changes with text, references, commitments and question text. M5 and M7 turn red.
6. **5. Writes service: record letter (identity checks and the scope boundary), record questions (batch, quote-checked), append an answer revision (optimistic concurrency, NO_CHANGE, a reason required to lapse an approval, author lineage), and withdraw. Each runs in one transaction with setTenantContextTx, requireCurrentProgramAccess, the live role and recordGovernedAction.**
   - Files: `/home/user/ClinicalSageAI-2-replit/server/services/haq/haq-writes.ts`, `/home/user/ClinicalSageAI-2-replit/server/services/haq/haq-store.ts`, `/home/user/ClinicalSageAI-2-replit/server/services/haq/__tests__/haq-writes.pglite.test.ts`, `/home/user/ClinicalSageAI-2-replit/scripts/ci/check-lineage-save-gate.mjs`
   - Proof: haq-writes.pglite is green, and R5 (a ledger row with actor and reason per write) is green at service level. ci:lineage-save-gate is green with haq-writes.ts in GUARDED. M17 (lineage skipped) and M10 (program predicate dropped) turn red.
7. **6. The signed act and the one reader: a thin wrapper over the service signGovernedAct with prepare (lock, admission, revision, empty, commitments, already-signed), plus answerApprovalStanding and assessLetterReadiness.**
   - Files: `/home/user/ClinicalSageAI-2-replit/server/services/haq/answer-signature.ts`, `/home/user/ClinicalSageAI-2-replit/server/services/haq/answer-approval.ts`, `/home/user/ClinicalSageAI-2-replit/server/services/haq/__tests__/answer-signature.pglite.test.ts`, `/home/user/ClinicalSageAI-2-replit/server/services/haq/__tests__/answer-approval.test.ts`
   - Proof: The full refusal matrix is green, with zero rows written on every refusal. Success writes exactly one ledger 'sign' row and one electronic_signatures row whose digest equals haqAnswerDigest. An edit lapses the approval; a revoked row reads revoked; a signature from another door reads none. M1, M2, M3, M4 and M6 each turn red. ci:sign-ceremony and its selftest are green.
8. **7. Router rewrite and mount: nine routes; authenticateToken on the mount; tenant middleware and requireEditorAccessForWrites; the signing limiter on /sign; refusals mapped; serverError for the rest. Delete the three old route tests and the private resolveOrgId.**
   - Files: `/home/user/ClinicalSageAI-2-replit/server/routes/haq-manager.ts`, `/home/user/ClinicalSageAI-2-replit/server/bootstrap/register-document-routes.ts`, `/home/user/ClinicalSageAI-2-replit/server/routes/__tests__/haq-manager-routes.test.ts`, `/home/user/ClinicalSageAI-2-replit/server/__tests__/routes/smoke.test.ts`, `/home/user/ClinicalSageAI-2-replit/scripts/ci/tenant-resolvers-baseline.json`
   - Proof: R1-R7 turn green, including route enumeration with router.stack equal to the nine screen calls. The smoke test asserts authenticateToken on the mount. ci:tenant-resolvers and ci:server-error-leaks are green. M8, M9 and M13 turn red.
9. **8. Package door: the readiness verdict under FOR SHARE, the deterministic builder, DOCX or markdown, and createGovernedExportConsequence with entries metadata.**
   - Files: `/home/user/ClinicalSageAI-2-replit/server/services/haq/response-package.ts`, `/home/user/ClinicalSageAI-2-replit/server/routes/haq-manager.ts`, `/home/user/ClinicalSageAI-2-replit/server/routes/__tests__/haq-manager-routes.test.ts`
   - Proof: The route tests cover: 409 PACKAGE_NOT_READY with the outstanding list (none, lapsed, revoked); success records an EXPORT_GENERATED row whose sha256 equals the delivered bytes; metadata lists every signature id. R3 is green end to end.
10. **9. Deletions and their consequential edits: haq-sessions removed and /reviews/pending moved verbatim to reviews.ts; the mount and import; the parity test; the bundles census; NOT_PROSE; the requestdb baseline; the demo seed 94-haq.mjs. The commit message names each replacement file and its gate.**
   - Files: `/home/user/ClinicalSageAI-2-replit/server/routes/c2c/haq-sessions.ts`, `/home/user/ClinicalSageAI-2-replit/server/routes/c2c/reviews.ts`, `/home/user/ClinicalSageAI-2-replit/server/bootstrap/register-concept2cure-routes.ts`, `/home/user/ClinicalSageAI-2-replit/server/routes/c2c/__tests__/c2c-router.parity.test.ts`, `/home/user/ClinicalSageAI-2-replit/tests/artifact-change-invalidates-bundles.contract.test.ts`, `/home/user/ClinicalSageAI-2-replit/scripts/ci/check-lineage-save-gate.mjs`, `/home/user/ClinicalSageAI-2-replit/docs/reports/requestdb-coverage-baseline.json`, `/home/user/ClinicalSageAI-2-replit/scripts/seed/ga-demo.d/94-haq.mjs`
   - Proof: The parity test is green with /reviews/pending on the reviews router and no haq-session path anywhere. The bundles census contract is green. ci:lineage-save-gate is green. M19 and M20 turn red.
11. **10. AnA guard and registry honesty: the guard test; anaToolFamilies and registryModel families set to []; the surfaceCtx prompts corrected; the select-question description.**
   - Files: `/home/user/ClinicalSageAI-2-replit/server/services/ana/__tests__/ana-cannot-approve-agency-answer.test.ts`, `/home/user/ClinicalSageAI-2-replit/shared/constants/ui-surface-registry.ui-v2.ts`, `/home/user/ClinicalSageAI-2-replit/client/src/concept2cure/v2/registryModel.ts`, `/home/user/ClinicalSageAI-2-replit/client/src/concept2cure/v2/registryModel.surfaceCtx.ts`, `/home/user/ClinicalSageAI-2-replit/shared/navigation/surface-actions.ts`
   - Proof: The guard test is green and scans more than 50 files. M12 (signHaqAnswer imported into AnaToolExecutor) turns red. biopharmaJourneyNoInventedHistory.test.tsx is still green with the '3 predicted HAQs' suggestion gone.
12. **11. Client: the HaqManager rewrite, HaqWrites, HaqAnswerSigning, the Respond step and the coming-later line.**
   - Files: `/home/user/ClinicalSageAI-2-replit/client/src/concept2cure/v2/surfaces/HaqManager.tsx`, `/home/user/ClinicalSageAI-2-replit/client/src/concept2cure/v2/surfaces/HaqWrites.ts`, `/home/user/ClinicalSageAI-2-replit/client/src/concept2cure/v2/surfaces/HaqAnswerSigning.tsx`, `/home/user/ClinicalSageAI-2-replit/client/src/concept2cure/v2/__tests__/haqManager.test.tsx`, `/home/user/ClinicalSageAI-2-replit/client/src/concept2cure/v2/__tests__/microWireups.test.tsx`, `/home/user/ClinicalSageAI-2-replit/client/src/concept2cure/v2/surfaces/ProjectRespond.tsx`, `/home/user/ClinicalSageAI-2-replit/client/src/concept2cure/v2/fixtures/project-home-data.tsx`, `/home/user/ClinicalSageAI-2-replit/client/src/concept2cure/v2/__tests__/projectRespondStage.test.tsx`
   - Proof: R12 and every client case listed in the tests are green: no program means no request; the author notice; every commitment ticked; 5xx reads 'could not be confirmed'; assemble only when ready; none of the removed copy renders. M22 (Approve shown to an author) turns red. projectRespondStage, noFabricatedProgramIdentity and the accessibility, copy and tone gates are green.
13. **12. The opening, in its own commit: list the surface; registry notes; report-engine drops /api/haq-manager; the catalog copy amended in place with a dated header and the earlier wrong header corrected; the contract test and pinned launch tests flipped.**
   - Files: `/home/user/ClinicalSageAI-2-replit/shared/constants/launch-scope.ts`, `/home/user/ClinicalSageAI-2-replit/shared/constants/ui-surface-registry.ui-v2.ts`, `/home/user/ClinicalSageAI-2-replit/shared/constants/ui-surface-registry.ts`, `/home/user/ClinicalSageAI-2-replit/db/migrations/20260823_module_catalog_customer_copy.sql`, `/home/user/ClinicalSageAI-2-replit/tests/schema-contract/catalog-module-claims.contract.test.ts`, `/home/user/ClinicalSageAI-2-replit/server/middleware/__tests__/launch-scope-api-gate.test.ts`, `/home/user/ClinicalSageAI-2-replit/server/services/entitlements/__tests__/ind-launch-claim.test.ts`, `/home/user/ClinicalSageAI-2-replit/server/services/entitlements/__tests__/launch-scope.test.ts`
   - Proof: R10 and R11 turn green. ci:launch-scope and ci:launch-scope-api, each with its selftest, are green: 0 violations, every HaqManager path answers launch, report-engine no longer co-claims. M14, M15 and M16 turn red (the P-32 'relisted → 10 fail' table, reversed), then are reverted.
14. **13. Decision record, evidence, full checks and push: the P-32 amendment (commitments reading, release boundary, Correspondence OS boundary, CMC exception pending the founder, revocation gap, no AI drafting); the D2 and D5 row notes; the SURFACE_DECISIONS and FILING_SPINE notes; the f15 README correction; the evidence README with the red, green and mutation tables.**
   - Files: `/home/user/ClinicalSageAI-2-replit/docs/LAUNCH_DEFINITION_OF_DONE.md`, `/home/user/ClinicalSageAI-2-replit/docs/SURFACE_DECISIONS_2026-10-08.md`, `/home/user/ClinicalSageAI-2-replit/docs/design/FILING_SPINE.md`, `/home/user/ClinicalSageAI-2-replit/docs/evidence/D2-ONE-ANA/2026-10-15/f15-respond/README.md`, `/home/user/ClinicalSageAI-2-replit/docs/evidence/D2-FOUNDER-DECISIONS/2026-10-15/p32-agency-questions-signed/README.md`
   - Proof: The full typecheck and the pre-push hook pass (ci:sign-ceremony, migration gates, launch gates, lineage, tenant resolvers, fabricated identity). The pushed commit's CI run is green, including the blank-database job's ci:purge-coverage and the security-definer dbtest. The evidence README links each mutation's red output and the reverted green rerun. The push goes to origin concept2cure-v2 only.

## Founder question (open; the named exception stands until answered)

- CMC's Module 3 agency-question file (/api/cmc/agency-questions, launched under the CMC app) is a second store of agency questions. Folding it onto Agency questions, the one store of letters and signed answers that this change opens, would retire four controls that have no replacement in the signed-answer model:
- its free-text assignee;
- its priority and severity;
- its open/drafted/in-review/closed lifecycle with reopen;
- its 'Draft response' handoff into an Authoring document (client/src/concept2cure/v2/surfaces/CmcModule.tsx:2475-2660).
The signed-answer model replaces some of what they do: the answer's author is recorded, review is a signed review, approval is a signature, and the package is recorded.
The options:
(a) Retire the four controls, so the next slice folds CMC onto the agency-questions store.
(b) First add assignee and priority to the agency-questions store, then fold.
(c) Keep CMC's file as its own Module 3 triage register.
Until you decide, it stays as it is and is named as an exception in the P-32 amendment.
