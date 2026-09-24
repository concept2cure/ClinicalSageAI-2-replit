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
| Search & retrieval | **3** *(was 1; re-verified 2026-09-19)* | Functional — FTS + passage search, both wired. FAR to parity: no saved searches, facets or VQL |
| External collaboration / data room | **0** | **ABSENT** |
| Bulk ops & migration | 1 | FAR |
| Storage & scale | 1 | FAR |
| Reporting & analytics | 2 | FAR |
| API & integrations | 1 | FAR |
| Validation package (IQ/OQ/PQ, CSV) | 2 | FAR |

**Would win an evaluation on:** the AI authoring/agent layer, the packager's integrity
guarantees, the hash-chained audit.
**Would lose on day one on:** the data room (there isn't one) and per-document security (org
membership is the entire model). *(Corrected 2026-09-19: this line also read "and the fact that
a document in the vault cannot become a submission". That closed on 2026-09-17 — see §4.5 — and
the summary had not been updated with the section it summarises.)*

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

> **Progress 2026-09-18. (b) is done; (a) is now PROVEN rather than assumed, and the
> answer corrects a comment that would have misled whoever did (c).**
>
> `server/middleware/__tests__/tenant-scope-org-guc.test.ts` pins what the GUC actually
> receives, including the two middlewares composed exactly as `middleware/auth.ts:183`
> composes them:
>
> - **The uuid DOES reach `app.current_org_id`.** `enforceOrgMembership` resolves
>   `organizations.uuid` in its membership LEFT JOIN, `attachOrgUuid` puts it on
>   `req.user.organizationUuid` immediately before calling `next()`, and that `next()`
>   IS `establishRequestTenantScope`, whose `resolveOrgUuid` reads exactly that field.
>
> - **`orgMembership.ts` said the opposite**, in a note ending "it is NOT wired into
>   `app.current_org_id`, which the identity-FK family would deny-all against until the
>   C-48 unification lands." That is false and was not harmless: it describes the GUC the
>   vault's policies resolve a programme against, so anyone planning (c) — or C-48 — would
>   have been reasoning from it. Corrected in place, with the test named beside it.
>
> - **The residual risk is narrower than §4.4 assumed, and still real.** The empty string
>   is written only when the membership lookup resolves NO uuid — an organisation row
>   without one, or an enrichment JOIN that fell back (which `orgMembership` deliberately
>   declines to cache, so it self-heals). Under `FORCE` those requests read an EMPTY VAULT.
>   Not a leak: an outage that looks like "this customer has no documents".
>
> So (a) is no longer "prove the GUC works". It is the narrower, answerable question: can
> a member's organisation resolve no uuid on a deployed database?
>
> **Answered: no, not in steady state.** `organizations.uuid` is
> `uuid DEFAULT gen_random_uuid() NOT NULL` at the database level
> (`migrations/0000_sweet_joseph.sql:4188`) and `.notNull()` in the Drizzle model
> (`shared/schema.ts:155`). Every organisation row has one, guaranteed by the column.
> So the membership LEFT JOIN returns null only when
>
>   1. the JOIN itself failed at runtime — which `orgMembership` detects, refuses to
>      cache, and self-heals from on the next request; or
>   2. `organizations` is absent from the schema module, which is a partial-schema dev
>      fixture, not a deployed database.
>
> **What that means for (c).** The `''` risk is a TRANSIENT window, not a structural
> gap — so `FORCE` is much closer to the one-line `ALTER` §4.4 took it for than this
> section feared. The honest remainder: during such a window a FORCEd vault reads EMPTY
> for the affected requests, which is the worst-shaped failure available ("this customer
> has no documents"). The mitigation is small and precise — have the middleware REFUSE
> rather than pass `''` — and it must land **with** `FORCE`, not before: today those
> requests succeed because ENABLE-only policies never run for the owner role, so
> refusing now would break working requests to pre-empt a risk that does not yet exist.
>
> Deliberately NOT done here for that reason. (c) is now a two-line change with a stated
> order, rather than an unquantified risk.

### 4.5 A vault document can never become a submission — **CLOSED 2026-09-17**

> **This gap is closed.** A vault document can now be filed into a submission and
> assembled into a package. What it took, in order:
>
> 1. **Vault bytes moved onto the canonical storage seam.** Ingest writes through
>    `getStorageProvider()` and records `storage_version_id`. This was the blocker
>    nobody had written down, and it was the real one — see correction 3 below.
> 2. **`submission_leaves.document_uuid`** — one nullable sibling column beside the
>    integer `document_id`. NOT a widening: that is Option A of the identity
>    contract and stays rejected. Adjudicated with the product owner 2026-09-17.
> 3. **`vault_documents` moved from `EXTERNAL_DOCUMENT_TABLES` into
>    `RESOLVABLE_DOCUMENT_TABLES`**, with a resolver branch and a tenancy verifier
>    at the write boundary (the repo's own drift guard refused to let the first
>    land without the second).
>
> Four fail-closed gates on the read path, because the eCTD index md5 is computed
> from whatever is staged and nothing downstream would catch wrong bytes: an
> org-scoped row read through the programme, the provider's own orgId boundary on
> the bytes, a hash check against `content_hash`, and a `%PDF-` header verified on
> the bytes rather than trusted from the mime string. Bytes are staged RAW — the
> vault copy is the governed record, and re-rendering would file something the
> vault has never seen.
>
> **The control exists too.** "Place into submission…" on an uploaded document in
> the Vault: choose the submission and sequence (frozen and dispatched ones are
> excluded, with the reason), give a section code, file. The vault copy is filed
> as itself — no snapshot, so there is no second artifact to keep in step. The
> picker and the section-code rule are shared with the authoring dialog rather
> than copied, which already paid for itself: the copy written separately for the
> Vault would have accepted a bare module and filed a document at a container.
>
> **Still required before a customer sees it:** rows uploaded BEFORE the storage
> move must be backfilled — `npm run db:backfill-vault-storage -- --org N`, dry-run
> by default. Until that runs for a tenant, filing one of their older documents
> produces a leaf that resolves as unresolved and names that script as the fix.
> Nothing is lost and nothing is silent; it simply will not assemble yet.

The original assessment follows, for the record.

`server/services/ectd/leaf-document-tables.ts` declares `vault_documents` non-materializable.
The leaf is surfaced as **unresolved**, never dropped, and transmit fails closed on any
unresolved leaf — so this is a guard-stop, not a silent hole.

This is the single most important parity gap on the list. It means the Vault is not a RIM vault.
A customer can upload a CSR and then cannot put it in the NDA.

> **Corrected 2026-09-17 — the stated reasons were half wrong, and the real blocker was not
> written down anywhere.** This section originally gave two reasons, taken from the resolver's
> own comment. Investigating what it would take to close them produced a different answer:
>
> 1. **"`vault.documents` has no `organization_id`" — no longer true.**
>    `migrations/20260905_vault_documents_organization_id.sql` adds it and is on the deploy
>    path. It is nullable and carries no RLS policy, so it is attribution rather than
>    isolation — but it is not what stops a vault leaf. The comment was stale, and a stale
>    blocker invites the next person to unblock this by fixing something already fixed.
>    (Corrected in the resolver too, so the two agree.)
>
> 2. **The id space is real, but widening the column is the wrong fix — and is already
>    adjudicated against.** `docs/DOCUMENT_IDENTITY_CONTRACT_2026-08.md` (APPROVED 2026-08-13)
>    weighed exactly that as its Option A and rejected it, because it rewrites the two tables
>    "where a migration error is least recoverable", for a benefit its Option C delivers
>    additively. It says in terms: *"`submission_leaves` keeps integer `document_id`."* The
>    sanctioned bridge is the alias map (`c2c_document_aliases`), which is already built,
>    already has `submission_leaves` in its store vocabulary, and already resolves lineage for
>    coauthor leaves.
>
> 3. **The blocker nobody had recorded: the bytes.** Even with the identity solved, the
>    packager could not fetch a vault document. It fetches non-local content through
>    `getStorageProvider().get(vaultVersionId, organizationId)` — a lookup by a
>    *provider-minted version uuid* under `storage/vault/{orgId}/{projectId}/versions/`. Vault
>    ingest writes to `uploads/vault/{programId}/{contentHash}`, stores that relative **path**
>    in `s3_key` with `s3_bucket='local'`, and mints no provider sidecar. Different root,
>    different key space. `rendered_leaf_files` resolves only because `storeRenderedLeafFile()`
>    called the provider's `put()` and kept the version id it returned; `vault.documents` has
>    no such column.
>
> **So the ordering in §6 was wrong.** "Move bytes onto the existing storage seam" was filed
> under weeks 2–4 as a tidy-up. It is in fact the *precondition* for the leaf bridge, and the
> alias map — the part that was thought to be the work — is largely already built. The storage
> migration is the real item, and it is an infrastructure decision (which provider, what
> happens to bytes already written under the old layout), not a resolver change.
>
> Also worth recording, because it changes how urgent this reads: **nothing writes a
> `vault_documents` leaf today**, in any code path, seed or UI. Both leaf-creating surfaces
> hard-code `coauthor_documents`. The refusal is the intended state rather than an oversight,
> and `document_table` *is* whitelisted at both the route and the service
> (`isPlaceableDocumentTable`) — an earlier draft of this correction claimed it was not, and
> that claim was wrong.

---

## 5. The gap list, by area

Condensed from 220 verified findings. Severity as adjudicated after verification.

**Lifecycle & versioning.** **Partly closed 2026-09-19 — the `placed` transition is
reachable.** The orchestrator refused it outright (`PLACEMENT_BINDING_NOT_WIRED`) because the
live route built its bindings without an `upsertLeaf` writer; the real writer is injected now.
That refusal was correct and was not loosened: `lifecycleBindings.ts` records the default it
replaced, which minted a `leaf:${randomUUID()}` for a `submission_leaves` row that was never
written and attested it in the hash-chained audit trail.

The binding refuses rather than guesses in three places — no `sequenceId` on the placement
(`registryId` is an application *type*, and an org can hold several submissions each with a
sequence 0000), no source the assembler can materialise, and a key-space mismatch where the
STORE's declared id kind governs rather than the ref's claim. Refusals surface as a 409 in the
orchestrator's own shape, never a 500.

It works for vault documents specifically because `document_uuid` landed earlier this session:
`SOURCE_ID_KIND` already declared `vault_documents` uuid-keyed, so the model had anticipated
this seam before there was a column for it.

**Still open here:** `packaged` remains unwired (`ASSEMBLY_BINDING_NOT_WIRED`). The assembler
exists, but wiring it makes an HTTP transition build a real eCTD package — an architecture
decision about where that work runs, not the mechanical injection `placed` needed. And
`vault.documents` still has no stage column of its own; the lifecycle runs over the canonical
document store, not over the vault row.

Original finding: no lifecycle state on `vault.documents` at all — the UI renders the
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

**Security.** ~~Org membership is the whole authorization model in the Vault~~ —
**the WRITES are role-gated as of 2026-09-19.** Both governed writes into
`vault.documents` now carry `requireEditorAccess`, the repo's one governed-write gate,
which excludes `viewer`: the filing decision (`POST /:id/file`) and the upload
(`POST /api/vault/ingest`). Each creates or moves a regulatory record AND writes a Part 11
row attributing it to the caller, so a viewer could previously author an attributable
governed record. Ingest is gated BEFORE multer — refusing after the upload is buffered is a
denial-of-service shape rather than a permission one. The upload path was already READING the
role to stamp into its audit arguments and never deciding anything with it.

The READS are deliberately still open to a viewer: enumerating and downloading their own
organisation's dossier is the viewer role working as intended, and widening the fix there
would break the role rather than enforce it.

Nothing covered either route before this, so the tests came with the gate
(`server/routes/__tests__/vault-file-authorization.test.ts`).

> **Is this systemic? Partly — and NOT in the way it first looks. Recorded so the
> next person does not raise the alarm I nearly did.**
>
> A scan finds 279 router files with write routes and no role-gate reference, and 164
> of 174 router mounts pass only an auth middleware. Neither number is a finding list.
>
> - **They ARE authenticated.** `server/middleware/authBoundary.ts` is a default-deny
>   boundary mounted once (`server/startup/middleware.ts`) before any route
>   registration, covering the whole `/api` surface — `enforce` in production, `warn`
>   otherwise. A router with no auth middleware of its own, and no `req.user`
>   reference at all, is still behind it. `server/routes/mdx-qms.ts` is exactly that
>   shape and it is **not** an unauthenticated endpoint.
> - **What the scan actually measures is ROLE gating**, which this codebase applies
>   per-route rather than at the mount. Whether an ungated write is a defect depends
>   on whether that particular write is governed — which no scanner can adjudicate,
>   and which is why the two vault routes were fixed by reading them rather than by
>   running a list.
>
> So: worth a deliberate review of governed writes route by route, not a sweep, and
> not a count anyone should quote as a vulnerability total.

The original finding follows:

Org membership is the whole authorization model in the Vault:
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
governance — 16 flat document types (`shared/constants/domain/vault-taxonomy.ts`). The
Type→Subtype→Classification model remains the real gap and the real build.

> **Two narrower things fixed since.**
>
> - ~~`readinessEvaluator.ts` returns `completionPercent: required.length > 0 ? … : 100`, so a
>   filing type with no artifact matrix reports 100% complete with zero gaps.~~ **Fixed
>   2026-09-05.** It carries `assessed: false` and an `ARTIFACT_REQUIREMENTS_NOT_MODELLED` gap,
>   and no longer contributes its weight. 225 of 234 registry filing types were reporting 100%.
> - **The two vocabularies in that file were not reconciled** (fixed 2026-09-19).
>   `VAULT_INGEST_DOCUMENT_TYPES` are wire tokens; `VaultDocKind` is what the surface classifies
>   by; nothing mapped between them. So when the classifier had assigned no evidence kind, the
>   document list rendered the token itself — a reviewer read `MODULE_3` and `CORRESPONDENCE`.
>   There is a label map beside the enum now, for the reason the enum's own note gives (one
>   list, shared), with a test that the map covers the enum exactly: a type added to one and not
>   the other is precisely how the raw token comes back. A value outside the enum returns as
>   ITSELF rather than as "Other" — the column is TEXT with no CHECK, the token is ugly but
>   true, and "Other" would be a classification nobody made.

**~~The eTMF File button does not work.~~ FIXED — but only half of it.**
*(Updated 2026-09-19.)* The button works. `Etmf.tsx` now resolves `programId` from the shell
channel that already carries the open `regulatory_programs` uuid to every project-scoped
surface, REFUSES with an honest message when no program is open rather than posting a request
that cannot succeed, and derives `documentType` through `tmfCodeToIngestType(code)` instead of
the literal `tmf_essential` the ingest enum rejects. Pinned by 18 tests in
`client/src/concept2cure/v2/__tests__/etmfFilingPayload.test.ts` — including one asserting
`tmf_essential` is not an accepted ingest type, and one asserting the literal is not
re-introduced into the source.

**The duplication half is still open — and "fix by deletion" would have deleted the only
upload path that worked.** Following that advice is what found this: `useVaultUpload`, the
canonical hook, sent `credentials: 'include'` and **no `Authorization` header**.
`/api/vault/ingest` is mounted behind `authMiddleware`
(`register-inline-routes.ts`), whose header reads "Validates Bearer JWT tokens only" and which
answers `401 { error: 'Bearer token required' }` — it reads `req.headers.authorization` and has
no cookie fallback. So **every upload through the canonical hook was refused, on all three of
its callers**: the v2 Vault, the MDX Document vault and the MDX pathway attach. `Etmf.tsx`'s
hand-rolled copy sent `getAuthHeaders()` and was the one that worked. Fixed 2026-09-19, with a
test that fails on the unfixed hook.

This is a class, not an instance, and the mechanism is why it survives: `authBoundary` runs in
mode `warn` outside production and `enforce` in it, so a call missing its bearer token **works
in development and 401s in production**. (The vault hook was worse still: `/api/vault/ingest`
carries `authMiddleware` inline as well, so it failed in every environment.) Work already in
flight upstream fixes two MDX hooks on the same diagnosis — see
`client/src/concept2cure/mdx/hooks/__tests__/mdx-hooks-send-auth.test.ts`, whose opening line is
"`credentials: 'include'` is not authentication in this app."

**Corrected 2026-09-24 — the sweep below was incomplete, and its "no gate" conclusion was
wrong.** It read, in part: *"A repo-wide sweep of `fetch('/api/…')` across `client/src` found
one more real instance"* (`useSubmissions.ts`, fixed), *"The other 13 hits … are false
positives"* (that part was right), and *"No CI gate is proposed for this class"*.

The sweep searched for the **string** `/api/`. Three more call sites of this defect reach
`fetch()` in a form that string search cannot see, and all three fail in **every** environment
because their routes carry auth inline, not only in production:

- **`useEsignature` — the shared e-signature modal.** It builds its URL as
  `` `${BASE}${path}` ``. `<EsignModal>` gates every governed confirm on its verify-password
  call, and `/api/esignature` refused that call in both authBoundary modes, so **no signer
  could be verified anywhere** — Submission Center, the task board, authoring signatures and
  filing, the document workbench. The validation OQ did not see it: it signs through
  `/api/c2c/actions/sign` with its own bearer token. A D5 blocker; D4 coverage gap.
- **`usePdevData` `postJson`** — all nine PDEV writes. The URL arrives as a parameter.
- **`EvidencePicker`** — PDEV evidence search, shown to the user as "HTTP 401".

All three fixed 2026-09-24, with evidence at `docs/evidence/D5-ESIGN-TOKEN/2026-09-24/`. The
conclusion against a gate was reasoned from the crude scan's false positives; the fix for
false positives was a better scan, not no scan. **`ci:unauthenticated-fetch`** (pre-push)
checks every raw `fetch()` whatever its URL, resolves local header helpers and init objects
passed by name, reads what is public from the server's own `PUBLIC_API_ALLOWLIST`, and needs
**zero** baseline entries; its self-test builds each shape above and shows it refused.

The remaining duplication is still worth closing, and it is not forty lines: the hook's outcome
reports file NAMES (`succeeded: string[]`), while eTMF needs the id of the row the vault wrote
in order to bind the TMF artifact to it, and it sets its own `documentCode`/`documentTitle`
from the TMF vocabulary rather than the filename. Closing it means widening the hook's contract
and migrating all four callers onto it.

**~~Search.~~ CLOSED.** *(Re-verified 2026-09-19 — every clause of the original finding is now
false, and it is reproduced here so the correction is checkable: "`Vault.tsx` has exactly one
`<input>` and it is the file picker at `:774`. There is no search box. What filtering exists is
a client-side substring match over rows already in memory and cannot match document content.
`vault.document_chunks` has no reachable caller in the shipped product — the entire hybrid
retrieval stack is unwired. No full-text index on `extracted_text`. No pagination anywhere.")*

- **Document search.** `Vault.tsx:1047` is an `<input type="search">` reading "Search titles and
  document text", served by `GET /api/c2c/project-vault/:id/search`
  (`project-vault.ts:1196`): `websearch_to_tsquery` over
  `vault.document_search_vector(document_title, file_name, extracted_text)`, ranked with
  `ts_rank_cd`, with a `ts_headline` snippet so a hit on body text is legible as one. Tenant
  predicate in the same statement as the match, and the count taken over the same predicate as
  the page.
- **The index exists.** `migrations/20260906_vault_documents_fulltext.sql:69` creates
  `idx_vault_documents_fts` as a GIN index on the exact expression the query uses.
- **Pagination.** `limit`/`offset` on the search route, capped at 100; the browse view reports
  its own window.
- **An empty query is not "match everything"** — it returns `EMPTY_QUERY` with no rows, because
  returning the whole vault would make an empty box look like a search that found everything.
- **The chunk corpus is reachable.** `vault.document_chunks` is read by
  `server/services/vault/document-passage-search.ts` (a thin adapter over `ragRouter` with
  `corpus: 'vault'`, not a second SQL path), exposed to AnA as the `search_document_passages`
  tool and registered through `document-catalog-tools.ts:51`. It refuses rather than returning
  empty when it has no usable tenant, because "nothing matched" and "I could not look" are
  different statements.

**Score raised 1 → 3.** Not higher: this is good document and passage search, but a Veeva buyer
also expects saved searches, faceted metadata filters in the UI, search across a binder, and a
query language in the VQL class. None of those exist.

**Storage & scale.** *(Re-verified 2026-09-19 — mixed: the seam is closed, the deployment
default is not.)*

- ~~`s3Bucket` is the literal string `'local'` and `s3Key` is a `process.cwd()`-relative path;
  a storage seam exists at `server/services/storage/index.ts` and the vault does not use it.~~
  **CLOSED.** Ingest now writes through `getStorageProvider().put()`; `s3_key` carries the
  provider's own handle and `s3_bucket` the provider name, so a row stays readable after a
  backend change. `storage_version_id`/`storage_provider` columns record which provider minted
  the handle, the read path is a dual read (rows predating the provider are still addressed by
  `s3_key`), and `scripts/backfill-vault-storage.mjs` moves the backlog without deleting
  originals.
- **STILL OPEN, and now a configuration problem rather than a code one.**
  `STORAGE_PROVIDER` defaults to `local` (`storage/index.ts:29`), and
  `infra/k8s/bff-with-predicate-shadow.yaml:18` still runs `replicas: 2` with no shared volume.
  A deployment that does not set `STORAGE_PROVIDER=s3` still has two pods with private disks.
  The fix is now a one-variable change instead of a rewrite, which is the part that moved.
- **STILL OPEN.** Uploads are buffered fully in memory (`multer.memoryStorage()`,
  `vault-ingest.ts:47`), capped at 50 MB.
- **`processing_status` is written `PENDING` and never advanced — still true**, and worth more
  than the one line it had. See below.

**The four-layer "draft · 64%" defect** *(found 2026-09-19 while verifying the line above; fixed
in the same pass).* Every file uploaded into the MDX Document vault rendered as **"draft ·
64%"** — a working copy two-thirds written, for a finished PDF nobody was authoring. Four
independent layers each arrived at that, which is why no single-layer fix would have moved it:

1. `vault.documents.processing_status` is written `PENDING` at ingest and **nothing in the repo
   ever advances it** — no code writes `EXTRACTING`, `VECTORIZING` or `INDEXED`, although the
   pipeline those states describe does run (text is extracted, chunked and embedded).
2. `server/routes/mdx-vault.ts:261` mapped `processing_status === 'INDEXED' ? 'final' : 'draft'`
   — a category error even if layer 1 had worked. Indexing is an ingest stage, not an approval.
3. `useVault.toStatus` did not recognise `'final'` at all (only `'approved'` maps to it), so the
   server's value fell through to the `'draft'` default. **Fixing layers 1 and 2 alone would
   have changed nothing on screen.**
4. `VaultSurface.fileToDoc` assigned `completion: … : 64` — the else-branch of a ternary written
   for authored documents — and `deriveVaultKpis` counted "Drafts" as a RESIDUAL
   (`total − locked − review`), so every uploaded PDF was tallied under "Working copies".

**The interaction is the lesson.** "Fixing" layer 1 so uploads reported `INDEXED` would have
turned *draft · 64%* into **final · 100%** — asserting an approval and a completion nobody gave,
in a regulated vault. The honest value is neither: an ingested file is complete AS a file and
has no drafting lifecycle. It now carries its own status, `uploaded`, and **no** completion
percentage (rendered as an em dash), the counts are counted rather than inferred by
subtraction, and the same reasoning is already written down twice in this codebase — beside
`uploaded` in `v2/fixtures/vault-data.ts`, and beside `assessed: false` in
`readinessEvaluator.ts`. Layer 1 remains open and is now inert: nothing user-facing reads
`processing_status` as a lifecycle any more.

**Project management.** The PM read-model is unreachable from the product: two id-spaces, the
numeric `projects` spine and the UUID `regulatory_programs` spine, with
`ProjectHome.tsx:14-19` explicitly documenting that `/api/project-home/:projectId` is
deliberately not called. `regulatory_programs.progress_percent` has no `UPDATE` writer anywhere
in `server/` (confirmed; `server/routes/c2c/projects.ts:416` comments that "nothing has ever
updated" it). A due-date tile tests `/days/.test(p.due)` against a value formatted as
`'Mon DD, YYYY'` (`c2c/projects.ts:404`) — permanently zero. No milestone dependencies, no
critical path, no risk/issue/decision log, no portfolio view. Task CRUD exists and works
(modulo §4.1).

**Data room.** ~~Nothing.~~ **Corrected 2026-09-19 — more exists than this said, and it
dead-ends at one precise point.** The distinction matters because it changes where the work
starts.

What exists and is sound:

- `/api/client-portal` is MOUNTED (`register-tenant-routes.ts:54`) and its scoping is
  fail-closed. An external caller is restricted to their own `client_access` grants; a
  `?clientWorkspaceId=` they were not granted cannot pivot them, because the parameter only
  reorders a result set the WHERE has already restricted to their own rows. Staff "preview"
  is separately restricted to workspaces their own organisation owns.
- `client_workspaces` rows ARE created, by two writers (`clients-routes.ts:316`,
  `projects-management.ts:200`).

What does not exist, at all:

- **`client_access` is never written.** No INSERT anywhere in `server/`, `scripts/`,
  `migrations/` or `db/`. So a workspace can be created and the portal will scope correctly to
  it, and no human being can ever be granted access to one. The external path is complete on
  the read side and absent on the grant side — one missing write, not a missing subsystem.
- The portal serves a single route, `GET /overview`. No document objects reach it.

Still true from the original finding: no code path sets a document to a client-visible status,
and there are no per-folder or per-file permissions, tiers, watermarking, expiry, per-viewer
analytics, or Q&A.

**Why this is not just "add the INSERT".** Who may grant, whether the recipient is an existing
account or an invitation, and whether a grant expires or is revocable are policy decisions with
regulatory consequence — this is external access to a governed document store. Building them on
an assumption would be the wrong kind of initiative. Deliberately left for a decision.

**API & integrations.** *(Updated 2026-09-19.)* Three of the four claims here are now closed.
**The score stays at 1**, deliberately: what closed the first one is a read-only metadata index
of two endpoints, and Veeva's document API is CRUD over documents, binders, workflows and bulk
loads. Closing a hole is not parity.

- ~~No document or vault objects on the public API; `documents:read` is a grantable scope that
  unlocks nothing.~~ **CLOSED.** It was worse than "unlocks nothing". The scope was grantable
  (`shared/schema/api-keys.ts:66`), offered in the admin key editor
  (`AdminSurfaces.tsx:2578`), and *advertised* by `/api/v1/docs` — while no route anywhere in
  the codebase required it. An operator could tick it, hand the key to an integrator, and
  reasonably believe programmatic document access was on; the integrator had nothing to call,
  and no error explained why, because there was no endpoint to receive the call. A permission
  that unlocks nothing is worse than a missing one: it reads as a decision somebody made.
  `GET /api/v1/documents` and `GET /api/v1/documents/:id` now require it
  (`server/routes/public-api.ts`; read model in
  `server/services/vault/vault-document-index.service.ts`).
  **Metadata only, deliberately** — never bytes, never `extracted_text`, never storage
  addressing (`s3_key`, `storage_version_id`). Returning document text from an endpoint named
  "index" would be a content egress wearing a metadata endpoint's name, and would route around
  the byte-level gates the in-app read path enforces. Whether a bearer API key may pull
  regulated content at all is a separate egress decision and is **not** made here.
  Tenancy is enforced by joining through `regulatory_programs`, not by trusting the nullable
  `vault.documents.organization_id`. A test asserts that **every scope `/docs` advertises is
  required by some endpoint `/docs` lists**, so this class of defect cannot recur silently.
- ~~The tenant data export cannot see the `vault` schema.~~ **CLOSED** earlier in this pass:
  `EXPORT_SCHEMAS` is `['public', 'vault']` (`tenant-full-export.service.ts:70`).
- ~~The purge it gates silently skips vault documents, so a GDPR erasure request leaves the
  bytes.~~ **CLOSED TWICE — the second time is the interesting one.** The first fix named the
  tables where they actually live (`vault.documents`, not `public.vault_documents`, which
  resolved to nothing and was skipped as "absent from this schema"). Fixing the table names
  exposed a narrower version of the same bug underneath: both vault entries were keyed on
  `organization_id = $1`, and that column is **nullable by design** — the schema records
  "NULL = unattributable — the program is missing or soft-deleted". A document whose programme
  had been soft-deleted therefore carried NULL, matched nothing, and survived the erasure with
  its bytes — in precisely the rows old enough for someone to ask about. The purge now scopes
  through `regulatory_programs` (the authoritative owner, since the column is backfilled from
  it) unioned with the column: `VAULT_DOCUMENT_TENANCY` in `tenant-offboarding.ts`. Proven
  against real Postgres, including a test that runs the *old* predicate and asserts it leaves
  the row behind.
- **`VaultSyncService` (the Veeva-migration story) has no importer outside its own file.**
  **STILL OPEN** — re-verified 2026-09-19. The only references anywhere are its own definition
  (`server/integrations/veeva-vault/vault-sync-service.ts`) and its own test. No route, service
  or script constructs it, so the migration story remains a class nobody can invoke.

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
4. ~~`submission_leaves.document_id` widened `INTEGER → TEXT` plus a `document_version_id`.~~
   **Withdrawn 2026-09-17 — do not do this.** It is Option A of
   `docs/DOCUMENT_IDENTITY_CONTRACT_2026-08.md`, which was weighed and rejected on 2026-08-13;
   that contract states `submission_leaves` keeps its integer `document_id`, and the alias map
   is how a uuid-native document finds its integer-addressable representation. Widening would
   also not have worked: the packager still could not fetch the bytes (§4.5, correction 3).
   Replace with: **move vault ingest onto `getStorageProvider()`** — persist the provider's
   version id on `vault.documents`, and migrate bytes already written under
   `uploads/vault/{programId}/`. That is the item this list actually needed.
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

~~Still open from §4: a vault document has a tenant now but still cannot become a submission
leaf (§4.5).~~ **CLOSED 2026-09-17.** The storage seam (the real blocker) and the leaf id
space were both closed; a vault document can be filed and assembled. Remaining: backfill
pre-existing rows onto the provider, and build the UI affordance. See §4.5.

**Weeks 2–4 — make the vault usable**
Server-side vault search with a GIN index and pagination; a search box in `Vault.tsx`; wire the
retrieval stack to the chunks table or delete it; move bytes onto the existing storage seam.

**Quarter 1 — the spine (§6).** 18–20 engineer-weeks. Ordered: prove the tenant GUC → add
`organization_id` + backfill + quarantine → dual predicate → `FORCE` → version table →
non-destructive ingest → canonical binding → **vault bytes onto the storage provider** →
leaf bridge via the alias map → consolidation and deletions. (Reordered 2026-09-17: the
storage move is the precondition for the leaf bridge, not a later tidy-up — §4.5.)

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
