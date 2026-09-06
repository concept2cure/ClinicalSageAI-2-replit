# Vault, Data Room & Project Management — technical assessment against Veeva

**Date:** 2026-09-05 · **Scope:** the Vault (document repository + data room) and Projects
(project management) modules, judged as a technical rival to Veeva Vault (RIM / eTMF /
QualityDocs / Clinical).

**Method.** Nine capability dimensions, each reviewed against the source and then
adversarially re-verified by an independent pass, followed by a completeness critic and a
skeptic that re-read the load-bearing claims. 220 findings survived: 30 blockers, 104 major,
86 moderate/minor. Every claim below cites `file:line`. Claims that the review got wrong and
the critics overturned are marked and corrected in place.

**One caveat that colours everything.** Every schema statement here is a claim about files in
the tree, not about a running database. The repo's own applier says so:
`scripts/db/migration-set.mjs:11-13` ("merged ≠ applied") and
`scripts/db/migration-journal.mjs:5-11` ("merged and applied have diverged silently across 358
migrations"). Before acting on any DDL recommendation, confirm the current state of a real
database.

---

## 1. The bottom line

The engineering here is better than the product is. There is an unusual amount of genuinely
careful, fail-closed, honestly-commented code — hash-chained audit trails, deterministic gates,
magic-byte upload verification, content-hash verification on download, a database trigger that
refuses an unattributed section edit. Several individual mechanisms are better than Veeva's
equivalents.

But the object a Veeva buyer actually evaluates — the Vault — is a file drop with a classifier
attached. `vault.documents` has no lifecycle state, no version history, no tenant column, no
per-document permission, no search index, and no path into a submission. Four of those five are
not features that are missing; they are the primitives everything else assumes.

The gap is not evenly distributed, and that is the useful part of this assessment:

- **Sell today, honestly:** the AI authoring layer, the eCTD packager, the QMS/controlled-document
  module, the per-document hash-chained audit.
- **Weeks from credible:** vault search, the audit/inspection export, the honesty defects.
- **A quarter of real work:** the document spine (identity, version, tenant, lifecycle).
- **A quarter more:** the data room, which does not exist in any form.

**Do not start differentiation work until §4 is closed.** Nothing else matters if the vault
leaks across tenants or cannot publish a submission.

---

## 2. What you actually have

This is the part most audits get wrong by omission. These are verified, shipped, and in several
cases genuinely ahead of the incumbent.

| Capability | Where | Assessment |
|---|---|---|
| **Deterministic eCTD packager** | `server/services/ectd/leaf-pdf-renderer.ts`, `orchestrator-real-package.ts:164` | Real XML backbone, real leaf rendering, md5+sha256, verifies the actual PDF magic number rather than trusting the DB mime string (`leaf-source-resolver.ts:65`). Publishing alone would score **4/5** against Veeva. |
| **Hash-chained per-document audit** | `server/services/regulatory/canonicalDocumentStore.ts:171-203`, `shared/regulatory/document-lifecycle.ts:247-253` | Tamper-evident chain with a verifier, `chainValid` returned on read. Veeva's audit trail is not hash-chained. **Ahead.** |
| **Correct Part 11 e-signature service** | `server/routes/esignature.ts:97` (bcrypt re-auth), `:305-311` (`SIGNER_NOT_ATTRIBUTABLE`), `:322-360` (§11.70 content binding) | Genuinely compliant. The problem is that a second, non-compliant signature route also exists — see §4.3. |
| **QMS / controlled documents** | `server/services/qms/qms.service.ts:21` (`DOC_TRANSITIONS`), `:75` (effective date on approval), `:87-118` (training records + compliance), `server/routes/mdx-qms.ts:338-353` (periodic review due), `client/src/concept2cure/quality/SopRegister.tsx` | **The review's parity scorecard missed this entirely; the completeness critic caught it.** A live, client-reachable, QualityDocs-shaped module: guarded state machine, effective dates, periodic review, training assignment, change control, suppliers, audits, NC. Score it **3/5, CLOSE** — not 0. |
| **Ingest safety** | `server/routes/vault-ingest.ts:1-30` (documented pipeline), magic-byte + ClamAV verification, storage failure is fatal rather than a partial success | Better than most competitors' upload paths. |
| **Download integrity** | `server/routes/c2c/project-vault.ts:892-905` | Re-hashes the bytes and refuses to serve on mismatch, with an honest error. Veeva does not do this. **Ahead.** |
| **Immutable authored versions** | `server/services/ana/artifactVersionStore.ts:243-353` | `FOR UPDATE`, SHA-256 de-dupe, `max(version)+1` append, refuses a null author on Part 11 grounds. The strongest versioning code in the repo — it just does not govern the Vault. |
| **Section-level version ledger enforced in the database** | `migrations/20260528_phase9_document_schema.sql:125-142`, `:186-190` | A `BEFORE UPDATE` trigger that raises rather than writing an unattributed change. No application path can bypass it. **Ahead** — Veeva enforces this in the application layer. |
| **Default-deny auth boundary** | `server/middleware/authBoundary.ts:60-119`, `server/middleware/tenantContext.ts:93-134` | Exact-match allowlist over `/api`; a forged `x-org-id` is logged as an impersonation attempt. |
| **AI agent layer over the corpus** | `server/services/ana/` | Nothing comparable in Veeva. This is the wedge — see §9. |

The honesty culture is itself an asset. `shared/schema/vault.ts:9-11` declares its own inactive
tables. `server/services/ectd/leaf-source-resolver.ts:78-88` documents the exact reason a vault
document cannot become a submission leaf rather than silently dropping it. That candour is why
this assessment could be written at all.

---

## 3. Parity scorecard

0 = does not exist · 5 = a Veeva buyer finds nothing missing.

| Capability area | Score | Verdict |
|---|---:|---|
| Document lifecycle & states | 1 | FAR (quarters) |
| Versioning & renditions | 1 | FAR |
| Security model (roles, ACLs, dynamic access) | 1 | FAR |
| Part 11 e-signature | 2 | FAR |
| Audit trail & inspection readiness | 2 | **CLOSE (weeks)** |
| Metadata / taxonomy / controlled vocabularies | 2 | FAR |
| eTMF (DIA reference model) | 1 | FAR |
| **QMS / QualityDocs** *(added on correction)* | **3** | **CLOSE** |
| RIM: registrations, submissions, publishing | 3 | FAR overall; publishing alone 4, **AT PARITY** |
| Search & retrieval | 1 | **CLOSE** to functional, FAR to parity |
| External collaboration / data room | **0** | **ABSENT** |
| Bulk ops & migration | 1 | FAR |
| Storage & scale | 1 | FAR |
| Reporting & analytics | 2 | FAR |
| API & integrations | 1 | FAR |
| Validation package (IQ/OQ/PQ, CSV) | 2 | FAR |

**Would win an evaluation on:** the AI authoring/agent layer, the packager's integrity
guarantees, the hash-chained audit.
**Would lose on day one on:** the data room (there isn't one), per-document security (org
membership is the entire model), and the fact that a document in the vault cannot become a
submission.

---

## 4. The five things that decide everything

Each of these I re-verified in the source personally, beyond the review and the critics.

### 4.1 Cross-tenant read *and* write on project tasks — live, trivially exploitable

`server/routes/c2c/tasks.ts` — four of six handlers carry no `organizationId` predicate, only
`projectId`, which is a serial:

- `:146` `GET /projects/:projectId/tasks` — `where(eq(projectTasks.projectId, projectId))`
- `:186` `POST /projects/:projectId/tasks` — resolves the project with no org check, then inserts using *that project's* `organizationId`
- `:314` `POST /projects/:projectId/tasks/bulk` — same
- `:372` `GET /projects/:projectId/tasks/summary` — same

Mounted behind `authenticateToken` at `server/bootstrap/register-concept2cure-routes.ts:33`.
Any authenticated user of any tenant reads and writes any other tenant's project tasks by
counting up.

The `PUT` and `DELETE` twins were already fixed, and the comment at `:218-230` describes this
exact bug class. `and` and `getOrganizationId` are already imported at `:18`/`:26`. **This is a
four-line fix.** Write the failing test first — a user in org A reading org B's tasks — and
watch it pass before you patch.

### 4.2 A re-upload destroys the governed record

`server/routes/vault-ingest.ts:396-436`:

```sql
ON CONFLICT (program_id, document_code, version) DO UPDATE SET
  s3_key = EXCLUDED.s3_key, content_hash = EXCLUDED.content_hash,
  file_size = ..., extracted_text = ...
```

`version` is a free-text client field defaulting to `'1.0'` (`:74`, `:443`). The client sends
the raw filename as `documentCode` and no version at all
(`client/src/concept2cure/v2/useVaultUpload.ts:82-84`). So this is not an edge case — it is the
default path. Upload `Protocol.pdf` twice and the first document's bytes and hash are gone from
the record. No `vault_document_versions` table exists.

Two mitigations found on re-verification, worth knowing but not sufficient: the superseded hash
survives in the chained audit row written in the same transaction (`:489-527`), and storage is
content-addressed (`:228`) so the prior bytes remain on disk as an orphan. Neither is a
retrieval path — there is no supported way to open the prior edition.

**Second constraint nobody noticed:** `db/migrations/044c_gcc_vault_schema.sql:106` also
declares `UNIQUE (program_id, content_hash)`. The `ON CONFLICT` targets only the other
constraint and there is no `23505` handling in the file, so uploading the same bytes under a
different filename raises an unhandled unique violation and 500s today.

### 4.3 A Part 11 signature route trusts the client's own MFA claim

`server/routes/c2c/artifacts.ts:196-204` — `authenticationMethod: z.string()` and
`secondFactorVerified: z.boolean().optional()`, taken from the request body. `:1602-1604` —
both persisted verbatim onto the signature row. The only gate is a role check at `:1510-1527`.
No password, no bcrypt, no TOTP.

`POST /api/part11/signatures` was deleted for precisely this defect — the rationale is still in
the tree at `server/routes/part11-compliance.ts:359-380` ("it recorded `mfa_verified` from
`!!req.body.mfaToken` — a client-asserted boolean, never verified"). The same defect is live on
a different router.

This is simultaneously a §11.200 compliance hole and a zero-duplication violation: the correct
implementation already exists at `server/routes/esignature.ts:97`. The fix is consolidation, not
a third signing path.

### 4.4 Vault retrieval has no tenant predicate, and RLS may not be enforcing

`server/services/advancedRAGPipeline.ts:895` and `:935` carry **no organization predicate in
SQL**, with inline comments asserting `tenant-isolation-safe: RLS-scoped`. Everything rests on
Postgres RLS. Three things about that:

1. `vault.documents` and `vault.document_chunks` are `ENABLE ROW LEVEL SECURITY`, never `FORCE`
   (`db/migrations/044c_gcc_vault_schema.sql:112`, `migrations/20260905b_vault_document_chunks.sql:76`).
   Postgres does not apply ENABLE-only policies to the table owner. **19 other migrations in
   this repo do use `FORCE`** — the vault is the exception, so the fix is a one-line
   `ALTER` that matches an established house pattern.
2. `server/db/getDatabaseUrl.ts:77-83` falls back from `APP_DATABASE_URL` to the owner
   `DATABASE_URL`, "preserving today's single-role behavior for deployments that have not split
   the roles yet." In that shape the app connects as owner and bypasses the policies.
3. **Correction the skeptic made, and it matters.** The review claimed the policy predicate is a
   constant `TRUE`. It is not, on a fully-provisioned database:
   `db/migrations/069_gcc_multitenant_rls_expansion.sql:268` rewrites `core.can_access_program`
   to delegate to `identity.can_access_program` (`:155`), and
   `db/migrations/20260828_program_org_resolution_canonical.sql:47-64` resolves
   `regulatory_programs.id → organizations.uuid`, the exact value
   `establishRequestTenantScope.ts:179` writes into `app.current_org_id`. The `RETURN TRUE` at
   `069:298` is only the fall-through when neither the `identity` nor the `auth` schema has the
   function.

**Consequence for the plan — do not skip this.** `FORCE` is therefore a *behaviour change*, not
a hardening no-op. And `establishRequestTenantScope.ts:179` writes `orgUuid ?? ''` — an empty
string that `identity.current_org_id()` cannot resolve. Adding `FORCE` casually would take the
vault **offline**, not merely harden it. `migrations/20260828`'s own header records that vault
ingestion under `RLS_ENFORCE=on` "has never worked on a fresh install."

The safe order: (a) prove `app.current_org_id` carries a real UUID on the vault request path, or
make the middleware refuse rather than pass `''`; (b) add the explicit org join to
`advancedRAGPipeline.ts:895,:935` — unconditional, cheap, no schema change, and the correct fix
regardless; (c) only then `FORCE`.

### 4.5 A vault document can never become a submission

`server/services/ectd/leaf-source-resolver.ts:77-88` declares `vault_documents`
non-materializable, and gives two honest reasons: `submission_leaves.document_id` is `INTEGER`
while `vault.documents.id` is a `UUID`, and `vault.documents` has no `organization_id`, so there
is no tenant-safe lookup.

This is the single most important parity gap on the list. It means the Vault is not a RIM vault.
A customer can upload a CSR and then cannot put it in the NDA.

---

## 5. The gap list, by area

Condensed from 220 verified findings. Severity as adjudicated after verification.

**Lifecycle & versioning.** No lifecycle state on `vault.documents` at all — the UI renders the
*filing* status in the status slot because there is nothing else
(`server/routes/c2c/project-vault.ts:312`). A good, default-deny, unit-tested state machine
exists (`shared/regulatory/document-lifecycle.ts:146-195`) and is mounted
(`register-regulatory-routes.ts:426`), but `grep` over `client/` finds zero callers. Six
incompatible state vocabularies elsewhere. The QMS lifecycle is bypassable by an unaudited
`PATCH` (`server/routes/mdx-qms.ts:96-110`, `:381-406`) that reaches `effective` with
`approver_id` NULL. No renditions: the deterministic PDF renderer runs only at packaging time,
so a reviewer approving a `.docx` approves a file they must open in Word. The write gate tells
users "Create a new version to make further changes"
(`server/services/authoring/document-lock.ts:68-73`) and **no such route exists** in either
governed store.

**Security.** Org membership is the whole authorization model in the Vault:
`project-vault.ts:562`, `:823`, `:925` resolve `orgId` and nothing else, so any authenticated
`viewer` can enumerate every program's dossier, download every byte, and re-file any document —
after which a chained audit row is written for a move nobody was authorized to make (`:1069`).
`server/routes/program-access.ts:22-28` says so in the file: *"READ ROUTES ARE NOT GATED, on
purpose."* `classification` is written at ingest and appears in no `WHERE` clause anywhere:
CONFIDENTIAL is as visible as PUBLIC. One genuinely Veeva-shaped ACL does exist —
`doc_permissions` with principal, grant reason, validity window, revocation, fail-closed
middleware and a boot invariant (`db/migrations/20260727_authoring_object_permissions.sql:35-52`,
`server/middleware/authoringObjectAuthorization.ts:175-266`) — but it governs
`authoring_documents` only, and mutations only, so it confers no confidentiality.

**Part 11 / GxP.** The vault download handler at `project-vault.ts:823-923` contains **zero
audit calls** — §11.10(e) requires that reads of governed records be recorded.
`logDocumentAccess` exists with zero call sites outside its own export. The inspector export
cannot see the vault's audit trail. No legal hold anywhere: `retentionCron.ts:121-123` issues an
unconditional `db.delete(vaultDocuments)` when a policy sets `hardDelete`, and the audit write at
`:132-146` is not awaited. `retention_until` is never written by any code, so the retention
subsystem is inert today — which is the only reason the missing legal hold has not yet destroyed
a record under litigation.

**Taxonomy & metadata.** No subtype/classification hierarchy, no per-type fields, no picklist
governance — 16 flat document types (`shared/constants/domain/vault-taxonomy.ts:71-76`).
`readinessEvaluator.ts:176-184` returns `completionPercent: required.length > 0 ? … : 100` — so a
filing type with no artifact matrix reports **100% complete with zero gaps**, which is exactly
the honesty failure `CLAUDE.md` names ("nothing-assessed is not assessed-and-clear"). The
adjacent unknown-id path at `:95-113` gets this right and returns 0 with a critical gap; copy
that.

**The eTMF File button does not work.** `client/src/concept2cure/v2/surfaces/Etmf.tsx:286` posts
`documentType: 'tmf_essential'` and no `programId`. The server requires a UUID `programId` and one
of the 16 enum values (`vault-ingest.ts:71-88`). Every eTMF filing attempt is a 400.
`tmf_essential` appears nowhere else in the codebase. Meanwhile `useVaultUpload.ts` — the
canonical hook — does it correctly. `Etmf.tsx` hand-rolled a duplicate upload path and broke it;
the taxonomy file's own comment (`:68`) says the picker "can never offer a type the server will
refuse." Fix by deletion.

**Search.** `Vault.tsx` has exactly one `<input>` and it is the file picker at `:774`. There is
no search box. What filtering exists is a client-side substring match over rows already in
memory and cannot match document content. `vault.document_chunks` has no reachable caller in the
shipped product — the entire hybrid retrieval stack is unwired. No full-text index on
`extracted_text`. No pagination anywhere.

**Storage & scale.** Bytes live on the app container's local filesystem — `s3Bucket` is the
literal string `'local'` and `s3Key` is a `process.cwd()`-relative path
(`vault-ingest.ts:227-247`). `docker-compose.yml:258-263` declares volumes only for Postgres and
Redis; `infra/k8s/bff-with-predicate-shadow.yaml:18` runs `replicas: 2`. Two replicas, no shared
volume: **half your downloads 409 on a file the other pod holds.** A storage seam exists at
`server/services/storage/index.ts:26-48` and the vault does not use it. Uploads are buffered
fully in memory (`multer.memoryStorage()`), capped at 50 MB. `processing_status` is written
`PENDING` and never advanced.

**Project management.** The PM read-model is unreachable from the product: two id-spaces, the
numeric `projects` spine and the UUID `regulatory_programs` spine, with
`ProjectHome.tsx:14-19` explicitly documenting that `/api/project-home/:projectId` is
deliberately not called. `regulatory_programs.progress_percent` has no `UPDATE` writer anywhere
in `server/` (confirmed; `server/routes/c2c/projects.ts:416` comments that "nothing has ever
updated" it). A due-date tile tests `/days/.test(p.due)` against a value formatted as
`'Mon DD, YYYY'` (`c2c/projects.ts:404`) — permanently zero. No milestone dependencies, no
critical path, no risk/issue/decision log, no portfolio view. Task CRUD exists and works
(modulo §4.1).

**Data room.** Nothing. No external principal exists in the auth model — an outside party can
only be given a full internal seat. `client_access` is read but never written. No code path
sets a document to a client-visible status. No per-folder or per-file permissions, no tiers, no
watermarking, no expiry, no per-viewer analytics, no Q&A.

**API & integrations.** No document or vault objects on the public API; `documents:read` is a
grantable scope that unlocks nothing. The tenant data export cannot see the `vault` schema —
and the purge it gates silently skips vault documents, so a GDPR erasure request leaves the
bytes. `VaultSyncService` (the Veeva-migration story) has no importer outside its own file.

---

## 6. Design: the document spine

**The problem.** At least seven parallel document stores: `vault.documents` (binary, UUID,
program-scoped, no org, no lifecycle), `canonical_documents` (lifecycle spine, text PK,
org-scoped), `concept2cure_artifacts` + versions, `c2c_documents` + sections,
`unified_documents`, `coauthor_documents`, `authoring_documents`. Under the zero-duplication
rule the answer is not an eighth.

**Target.** `canonical_documents` becomes the identity spine — it already carries stage,
signatures, placement and a hash-chained audit. The others become *facets*, each keeping one
version ledger per facet kind, reached through typed `sourceRefs` (the machinery already exists
at `shared/regulatory/canonical-document.ts:56,124`).

**The schema changes:**

1. `organization_id` on `vault.documents` — backfilled from `regulatory_programs`, `NULL`
   quarantined and never guessed. This is what unblocks the leaf resolver, the storage-provider
   ownership check, the per-tenant quota aggregate, and the export/purge hole.
2. `vault.document_versions` — immutable, append-only, `UNIQUE (document_id, content_hash)`,
   shaped after `artifactVersionStore.ts:243-353` rather than invented.
3. Ingest becomes non-destructive: replace the `DO UPDATE` body with an idempotence check
   (`WHERE content_hash = EXCLUDED.content_hash`), returning `409 VERSION_CONTENT_CONFLICT` on
   a genuine conflict — **plus** an explicit `23505` branch distinguishing the two unique
   constraints (see §4.2), or the refusal story is incomplete in the direction users hit first.
4. `submission_leaves.document_id` widened `INTEGER → TEXT` plus a `document_version_id`, so
   the resolver can address a vault document. ~56 files, ~105 call sites; mechanical, and the
   risk is a surviving `Number()` coercion, not logic.
5. A lifecycle vocabulary parameterised by document class, so a controlled SOP does not travel
   the submission graph.

**Do not rebuild QualityDocs.** The design as originally proposed added a `controlled_document`
lifecycle to `canonical_documents` without knowing that `qms_documents` already implements
exactly that (`server/services/qms/qms.service.ts:21`). Bind to it instead.

**Deletions.** `vaultService.ts`, the duplicate signing path in `artifacts.ts`, the hand-rolled
upload in `Etmf.tsx`, and the two rival vault read models. One exception: **never drop
`public.document_versions`** — it holds §11.70 binding evidence for signatures already applied.
Freeze it and write the exception into `CLAUDE.md`.

**Sizing: 18–20 engineer-weeks sequential; ~11–12 calendar weeks with two engineers.** Do not
believe a number below 15. This touches the ingest transaction, the tenant boundary, the
signature binding and the packager — each has a failure mode invisible in a demo.

**Failing checks to write first, per step:** a cross-tenant vault read that currently succeeds;
a re-upload that currently destroys a hash; a leaf resolution that currently returns unresolved;
a vault SELECT under `FORCE` that returns zero rows for a foreign org.

---

## 7. Design: the data room

**One mechanism, two binding modes.** The BD/diligence room (curated, frozen, numbered,
watermarked) and the regulated-ops room (a live, least-privilege slice for a CRO, notified body
or inspector) differ in what is in the room and for how long — not in the authorization model.
Building two would be the duplication the rules forbid.

**The external principal.** A non-tenant human authenticates into an opaque, revocable
*room session* — deliberately not a JWT, because a JWT cannot be revoked mid-flight and
revocation is the product here. Magic link plus email OTP, invitation and acceptance recorded,
three levels of revocation (principal, party, room) all enforced per-request. It composes with
tenant scoping by carrying a room scope rather than an org seat, so it never widens the existing
boundary.

**Permissions.** `room → section → item`, three grant levels, **minimum wins**, default-deny
resolved in SQL. Tiers: no access / view-watermarked / view / download-PDF / download-original.
A document with no rendition is invisible at every tier rather than silently served raw.

**The download path is the whole thing.** `project-vault.ts:823` currently streams bytes from
local disk with no audit row. One `serveVaultDocument` function, audit-before-send inside a
transaction, 5xx if the audit write fails. Watermarking consolidates onto the existing
`pageAdded` renderer — do not add a second.

**Phase 0 is worth shipping even if the room is never built (1 engineer-week):** audit the
vault download, add `actor_kind`/`external_principal_id` to `audit_logs`, and delete the false
watermark claim at `ClientPortal.tsx:236` and the client-controlled
`req.body.watermark` at `cerv2-export-routes.ts:938`. That alone closes a §11.10(e) hole.

**Phases 0–4: ~21 engineer-weeks** (~1 quarter with two engineers) to a defensible BD room plus
a least-privilege ops room. Phase 4 (live rooms) has a hard dependency on §4.4 being closed — a
live room is a standing window onto the live vault.

**One caution.** Do not ship `sql/redaction_rules.sql:69-80` as an automatic PHI regex redactor.
A regex that has only ever been seen to pass is exactly the gate `CLAUDE.md` warns about. Ship
it as a proposal queue with mandatory human review.

---

## 8. Project management

The module needs one design decision more than it needs features: **the milestone ↔ document
binding.** A milestone that knows which documents satisfy it, and a document that knows which
milestone it unblocks, is the same model as the eTMF expected-document list and the dossier
completeness calculation. Build it once and it drives project readiness, TMF completeness and
submission readiness from one source. Build it three times — which is the current trajectory —
and all three disagree.

Before that: reconcile the two id-spaces (§5), and delete or honestly compute every readiness
percentage that currently reports a number nothing assessed.

---

## 9. Where this product actually wins

Parity is not the strategy. This will never out-checklist a 20-year incumbent, and it does not
need to — Veeva's weaknesses are cost, rigidity, implementation burden, and medtech/IVD.

The assets that are real and that Veeva does not have: the AnA agent layer over the corpus, the
hash-chained per-document audit, the deterministic gate patterns, the packager's byte-level
integrity verification, and the honesty discipline itself (a readiness figure that refuses to
report when nothing was assessed is a *sellable* property to a quality organisation).

The wedges worth building, in order of how well they fit what already exists:

1. **The inspection-ready vault.** An inspector asks "show me every version of this SOP, who
   approved each, and prove it wasn't altered." The hash chain can answer that in one click.
   Veeva cannot — its audit trail is not tamper-evident. Needs §6 to land first.
2. **Submission-grounded authoring.** The authoring layer plus the packager plus a real spine
   means "draft it, review it, sign it, and publish it into the sequence" is one continuous
   path. Veeva sells that as three products with an integration project between them.
3. **The medtech/IVD buyer.** Veeva is weakest here. `design-controls.ts`, the GSPR schema, the
   IVD completeness surface and the technical-file assembler already exist. A 510(k)/technical-file
   vault that understands design controls is a category Veeva does not seriously serve.
4. **Diligence-grade data room inside the RIM vault.** Biotechs today run Veeva *and* Datasite.
   One system that does both, with the regulatory metadata already attached, is a real saving.

**Anti-goals — deliberately do not build:** PromoMats/MedComms, a configurable admin-time
lifecycle designer, and a full Veeva-shaped reporting/dashboard builder. Each is quarters of
work and wins nothing against an incumbent that already has them.

---

## 10. Two systemic constraints the plan must respect

**Migrations replay on every deploy.** `scripts/db/migration-set.mjs:1899-1913` executes every
file in `C2C_MIGRATION_FILES` unconditionally; `migration-journal.mjs` records a content hash and
reports drift but **never skips**. `migrations/20260821_vault_documents_canonical_shape.sql:59-113`
re-`ADD`s the vault columns with `IF NOT EXISTS` and re-creates the three-column unique
constraint. So any `DROP COLUMN` against `vault.documents` is silently undone on the next
deploy, and dropping `content_hash` will hard-fail the apply run because
`db/migrations/044c_gcc_vault_schema.sql:106` still indexes it.

Every "delete this column / constraint / policy" recommendation in any plan must therefore, in
the same commit, either amend the replaying migration or remove it from the set. Add a CI gate
that parses proposed `DROP` targets and fails when an earlier file re-creates the same object —
the repo already has ~40 such gates in `scripts/ci/` and the pattern is established. Verify it
by writing a migration that trips it.

**`FORCE ROW LEVEL SECURITY` is a behaviour change, not hardening.** See §4.4. The precondition
is mandatory, not advisory.

---

## 11. One roadmap

The section plans were written independently and double-count. Reconciled:

**This week — 3 engineer-days, no schema changes, all independently valuable.
ALL SEVEN SHIPPED**, each verified by making the check fail first.

| | Fix | Outcome |
|---|---|---|
| 1 | Org predicate on the unscoped task handlers | Done — it was **five of seven**, not four of six: the `assess` route was also unscoped. |
| 2 | Explicit org join on both vault retrieval arms | Done, plus a refusal when no tenant is resolvable. |
| 3 | Delete the duplicate signing route | Done — extracted to `services/part11/reverify-signer.ts`; both routes consolidated onto it. |
| 4 | Audit-before-send on the vault download | Done — a failed audit refuses the download. |
| 5 | `completionPercent` when no matrix exists | Done — and it was **225 of 234** filing types, not an edge case. |
| 6 | Fix the eTMF File action | Done — the program comes from the shell channel; no trial→program link was needed. |
| 7 | Refuse the destructive `ON CONFLICT` | Done, plus the second unique constraint that was 500ing. |

**Also shipped, beyond that list:**

- `CLAUDE.md` RULE 1 and `ci:migration-drop-safety` — every migration replays, so
  removing schema is an amendment, not a DROP. In pre-push, proven on the real case.
- `organization_id` on `vault.documents`, backfilled, unattributable rows quarantined.
- `ci:drizzle-tenant-scope` — ratchets the class the raw-SQL scanner structurally
  cannot see. **151 pre-existing sites baselined** so no new one lands.
- Vault full-text search: GIN index, ranked and paginated org-scoped endpoint, and
  the search box the surface never had.
- Legal holds — the retention sweep cannot destroy a record under hold, and fails
  closed if it cannot read them.
- The tenant purge and the tenant export both reach the vault now. Both named it and
  neither touched it: the purge used `public.vault_documents`, the export swept
  `public` only.

Still open from §4: the leaf id-space (§4.5) — a vault document has a tenant now but
still cannot become a submission leaf until `submission_leaves.document_id` widens.

**Weeks 2–4 — make the vault usable**
Server-side vault search with a GIN index and pagination; a search box in `Vault.tsx`; wire the
retrieval stack to the chunks table or delete it; move bytes onto the existing storage seam.

**Quarter 1 — the spine (§6).** 18–20 engineer-weeks. Ordered: prove the tenant GUC → add
`organization_id` + backfill + quarantine → dual predicate → `FORCE` → version table →
non-destructive ingest → canonical binding → leaf id-space → consolidation and deletions.

**Quarter 2 — the data room (§7).** ~21 engineer-weeks. Phase 0 can ship in week 1 of Q1.

**Then, and only then, differentiation (§9).**

Roughly two engineers for two quarters to a product that survives a Veeva bake-off on
architecture. That is a real number, and it is smaller than it looks only because the hard parts
— the packager, the audit chain, the authoring layer — are already built.

---

## 12. What I would do first

The seven items in §11 week one. They are small, independently valuable, and three of them are
live security or compliance defects rather than gaps. Nothing in the longer plan is blocked on
them, and none of them are blocked on anything.
