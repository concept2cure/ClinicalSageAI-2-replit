# Launch definition of done — read this before any session does anything

**Status:** binding from 2026-09-20 until the launch rows below are green.
**Owner:** founder (control tower). **Companion rule:** `CLAUDE.md` Rule 2.
**Dashboard:** `node scripts/ops/ga-readiness-report.mjs` (4/40 on 2026-09-20)
and `node scripts/ops/submission-preflight.mjs` (2/15 on 2026-09-20).

"Commercially deployed" means every row D1–D10 is green with the evidence named
in the row filed under `docs/evidence/`. A session that cannot point to a row it
moved should not be running. A session reports **blocked**, not done, when it
cannot produce the row's evidence.

## The rows

| Row | Done means | Evidence | Who |
|---|---|---|---|
| **D1** Hosted production — *code side done 2026-09-21: `npm run db:provision` proven on an empty database, PDF/A toolchain in the image; `docs/evidence/W2/`. Owed: AWS account, IAM, DNS, secrets, the apply itself. 2026-09-23: the application side holds; the Terraform side did not. `terraform validate` had never run, and production failed it (fixed in `b6d7a7d7b`, which also adds the KMS release-signing key: SOP-SEC-001 §2a). Ten more blockers stand between it and a booting task, among them `DATABASE_URL` wired to a JSON credential, an illegal RDS database name, the preflight's required variables absent, and an ECS health check calling `wget`, which the image lacks; three of them are founder decisions (AI placement, Redis, worker). Ordered brief: `docs/evidence/W2/2026-09-23/README.md`. 2026-09-24, B9 (`docs/evidence/W2/2026-09-24-b9/`): the ALB answers CloudFront alone (origin-facing prefix list + origin secret header), and the way in through CloudFront works. Before, every `/api/*` request would have failed its origin certificate check, API 403/404 came back as `200 index.html` (so `/readyz` read green for any deployment), and `/readyz`, `/collab`, SCIM and the connector had no route. Production trusts two hops; the smoke test reads `/readyz` through the public URL and fails closed. Offline proof only (mocked-provider `terraform test`, each check shown failing first); nothing applied. Adds to the founder list: a custom domain that both certificates cover, and the origin secret. 2026-09-24, B1–B3 and B5: built twice in parallel (`docs/evidence/W2/2026-09-24-b1-b5/`, `docs/evidence/W2/2026-09-23b/`) and reconciled into one: the task definition carries every name deploy-aws.yml's preflight requires (read from the workflow by `terraform test`), composed `verify-full` URLs replace the RDS JSON secret, the database name is legal, and the health check probes `/healthz`, not `/readyz` (a readiness probe replaces tasks it cannot heal). `.github/workflows/terraform-tests.yml` runs the tests and the pipeline's own preflight against the rendered task definition on every push. The RDS CA is vendored (`docs/evidence/W2/2026-09-24-rds-ca/`); the bundle itself had been dropped by `.gitignore`'s `*.pem`, so trunk named a missing file until 2026-09-24 (`2026-09-23b/rds-ca-vendored-bundle-missing.txt`). Found and fixed the same day (`2026-09-23b/`): the production image could not load its own bundle (`vite`, a devDependency, imported at load time); minting `app_service` as the RDS master always failed, and its password went to CloudWatch in plaintext; a crash exited 0; the preflight checked one revision and deploy rolled another. 2026-09-24, B8, same day (`docs/evidence/W2/2026-09-24-b8/`): staging is now production's composition. There is one `terraform/stack` with two thin roots, so staging cannot drift from what it proves. Staging runs at smaller sizes with its own names and signing key, and passes the same boot-contract test. A test also reads the six names deploy-aws.yml targets and checks production creates them. deploy-aws.yml still deploys to production only. Still blocked: no path provisions the empty RDS database (next), deploy IAM, the apply itself. Founder: B4, B6+B7, audit trail on first boot, document-storage retention. 2026-09-24, vault storage (`docs/evidence/W2/2026-09-24-vault-storage/`): a deployment had nowhere durable to keep a filing's source documents. `STORAGE_PROVIDER=s3` threw in every production build (the SDK was loaded with `require()` in an ESM bundle), and the task definition named no store, so bytes went to the task's own disk and would be deleted with it. Now the provider loads, finds every object (it had stopped at the first 1000 keys bucket-wide) and reports a refused read as an error rather than a missing document. Production refuses to boot without a durable store, and the stack creates a private, versioned bucket per environment that only the task role can reach. The pipeline's own preflight refuses `local`, a missing bucket and a missing provider, and `/readyz` reports the store, so a task that cannot reach it is not ready. Each fix was shown failing first. How long deleted versions are kept is the retention decision above. 2026-09-24, TRIVY-01 (`docs/evidence/W2/2026-09-24-trivy/`): the deploy's blocking IaC scan failed on 16 HIGH/CRITICAL findings, so no tagged release could pass `security-gate`; each is fixed or excepted at its resource with a reason, the scan exited 0; red again on merge from `terraform/stack/vault_storage.tf` (AWS-0132 ×2), fixed by the vault-storage lane (`2fe4ec4b2`); exits 0 on trunk and CI's copy now blocks. Founder decision added: a WAF on CloudFront. 2026-09-24, SMTP (`docs/evidence/W2/2026-09-24-smtp/`): login OTP is the mandatory second factor and the stack carried no SMTP, so a deploy would boot, read ready, and admit no one; the stack now carries it (port 465 only) and the preflight refuses a task definition without it. Founder: an SMTP provider with a verified sending domain, then `pilot:verify-otp` to a real inbox* | One AWS environment from `terraform/environments/production`, image promoted by `.github/workflows/deploy-aws.yml`, `/readyz` 200 with schema and ana `ok`; redis and worker read `skipped` by decision B6 (2026-10-01, CPO: production runs without Redis and coordinates through Postgres; `docs/evidence/W2/2026-09-24-multi-task/u20-sessions-across-tasks.md`). | Readiness JSON + `terraform apply` log | Claude + founder (account, DNS, IAM) |
| **D2** Launch catalog — *local green 2026-09-20, see `docs/evidence/W1/2026-09-20/`; staging owed with D1. 2026-09-23: every self-serve signup answered 500 under `RLS_ENFORCE=on` after `a264e291a` (the default client workspace written from the pre-auth scope); fixed in the writer, shown on real PostgreSQL 8/16 red → 16/16 green (`docs/evidence/W1/2026-09-23-workspace/`). 2026-09-28, deterministic AI responses (`docs/evidence/D2-DETERMINISTIC-PROD/2026-09-28/`): `AI_GATEWAY_DETERMINISTIC=true` served fixed responses in production — "Draft section 2.7.3" answered `**AnA (Demo Mode):** …` with no error — while `/readyz` read ready. Production now refuses it at boot, per request and in the deploy preflight unless `AI_GATEWAY_ACCEPT_DETERMINISTIC=true` records the risk (the CI boot job does); each shown failing first. The fixed responses no longer mark claims about unread input `[KNOWN]` or `[INFERRED]` 2026-10-01: a Vault document takes its next version from the server (check-in by naming the document: version assigned 1.0 → 2.0, code and filing kept, predecessor linked), and the database refuses a version link outside its family or a second successor (VR-08, `docs/evidence/D2-VAULT-VERSIONS/2026-09-30-checkin/`). 2026-10-01: a document is one entry at its current version; every version is listed with its hash, downloads hash-verified, and is in the document's history; search shows current versions unless asked; a changed file uploaded under an existing name is offered as the next version (VR-09, `docs/evidence/D2-VAULT-VERSIONS/2026-10-01-version-list/`). The data room's capture record is append-only in the database, and its Filed chip names the Vault version the file became (VR-16, `docs/evidence/D2/2026-10-01-data-room-capture-immutable/`). Captured sources are filed into the Vault from the data room, through the one upload-to-Vault path AnA's tool also uses, with a result for every source; changed bytes are refused (VR-11a, `docs/evidence/D2-DATA-ROOM-FILE/2026-10-01/`). Suggested filings in a folder are confirmed together with one required reason, each with its own audit row, and one changed since it was listed is refused; the header counts what awaits confirmation (VR-11b, `docs/evidence/D2-DATA-ROOM-FILE/2026-10-01-confirm/`). A capture names who made it, and its capture, supersession and filing into the Vault are in the audit chain (VR-16b, `docs/evidence/D2/2026-10-01-data-room-capture-provenance/`). Any earlier version compares with the current one: bytes, recorded details and the changed lines (critique 15, `docs/evidence/D2-VAULT-VERSIONS/2026-10-01-compare/`). The Vault searches every project of the organisation at once, each hit naming its project (critique 15, `docs/evidence/D2-VAULT-LIBRARY/2026-10-01/`). A version names the documents that support it, that it references or that it is based on, in any project of the organisation; both ends list it, removal needs a reason, and each change is chained on both documents (critique 15, the replacement for `parentDocumentId`, `docs/evidence/D2-VAULT-RELATIONSHIPS/2026-10-01/`). Each version says which submission sequences and sections carry it, with the leaf's operation (VR-14a, `docs/evidence/D2-VAULT-WHERE-USED/2026-10-01/`), and which official eSTAR exports attached it, from the export's own record of its sources (VR-14c, `docs/evidence/D2-VAULT-WHERE-USED/2026-10-01-estar-uses/`). A version is annotated on a page or a passage of its text, replied to, resolved with a note or retracted by its author, each act chained and the record guarded in the database; the review and approval dialogs say what was open (critique 15, `docs/evidence/D2-VAULT-ANNOTATIONS/2026-10-01/`).* | Seven apps on by default for a new organisation: Projects, Vault, Authoring, Submission Center, Submission Readiness, QMS controlled documents, Reporting & analytics (the seventh by the founder's decision of 2026-09-26, landed 2026-10-01: `docs/evidence/D2-REPORTING-LAUNCH-APP/2026-09-30/`). Every other surface behind a flag that is off in production. Zero fixture imports reachable in production; `ci:fixture-fallback` and `ci:no-mock-in-prod-routes` set to block. | Fresh-org screenshots on staging; a CI run showing the gate block on a reintroduced fixture | Claude |
| **D3** Tenant isolation proven — *app_service role and boot as non-superuser proven locally (`docs/evidence/W2/`); all six OQ protocols pass locally with `RLS_ENFORCE=on` as `app_service`, after F-14 — Vault refused every upload under that role — was fixed (`docs/evidence/W3/2026-09-22/`). 2026-09-24: governed decisions added to the two-tenant contract (`docs/evidence/D3/2026-09-24-governed-decisions/`), run as `app_service` with RLS enforcing on a from-blank install, 23/23; the positive control found every listed decision answering 404 on fetch (two ids for one decision, fixed), and one mutation showed the database had already been refusing a cross-tenant write this effort had reported as live. Same day, Report OS (`docs/evidence/D3/2026-09-24-report-os-tenant/`), 37/37: seven of its request schemas took the tenant from the request and now take it from the session; RLS contained all but one leak, a program group holding another tenant's project, since memberships carry no RLS policy. An UPDATE crossed too (`docs/evidence/D3/2026-09-24-update-boundary/`, 39/39): with RLS enforcing, a traceability item could be re-pointed at another tenant's QMP, because RLS checks the row's organization and not a foreign key. 2026-09-24, signed approvals and Submission Center (`docs/evidence/D3/2026-09-24-signatures-and-runs/`): `electronic_signatures` and `submission_orchestrator_runs` added, 43/43 with the Report OS cases; each shown failing with only its own table's policy removed (A lists B's signatures, B's runs are edited and deleted, a forged row lands). Signatures had been excluded because §11.70 makes a fixture undeletable; they are in without disabling the trigger. The contract's forge handler turned out to test `risk_items` for any domain without its own branch, so a new domain could pass having tested nothing; shown passing with signatures' RLS off, and now a compile error (an exhaustive `Record<Domain, Forge>`). And an edit could approve (`docs/evidence/D3/2026-09-24-governed-edit/`, 46/46): any member's PATCH could mark a PCCP plan or post-market document approved and locked without its gate, or re-parent it onto another tenant's program, with RLS enforcing. 2026-09-24, the cortex query route (`docs/evidence/D3/2026-09-24-cortex-tenant-header/`): its tenant key was the client's `x-org-uuid` header and nothing else, since the router it is mounted under drops the session's uuid; RLS contained it for atoms but not for the vault, whose RLS the RAG pipeline scoped to whatever uuid its caller passed (see the RAG pipeline note). The key is the session's now, 6/6 with RLS on and off. Found on the way and handed on: `search_atoms_hybrid` fails on every install built from empty, so Authoring's AI draft and AnA chat retrieve no evidence. Six more writes RLS never refused (`docs/evidence/D3/2026-09-24-request-parents/`, 58/58): another tenant's complaint relinked, a preference row written for another user, an AnA profile planted onto a colleague, and three foreign-key pins, each shown landing with RLS on. And the writes only RLS was stopping (`docs/evidence/D3/2026-09-24-project-scope/`, 72/72): project intelligence read and written by project id alone, memory entries archived and verified by id, AnA's project update spreading the body (re-pointing a project at another tenant's workspace with RLS on), a bundle linked to another tenant's plan, a corpus ingest taking another org's report over, and `/api/users/me` reading the account for a password-only token. Each is shown leaking red and holding green with RLS off, since every policy passes all rows when enforcement is off. And the control plane (`docs/evidence/D3/2026-09-24-control-plane-access/`, 82/82): the kernel's process-wide log, every tenant's paths, tenant ids and actor ids, was readable and clearable by any role containing "admin" and by everyone outside production. It is now for platform operators, and an org's governed decisions for its own administrators. And the vault RAG pipeline (`docs/evidence/D3/2026-09-24-rag-pipeline-tenant/`): it wrote its caller's org uuid into the GUC vault RLS reads, so tenant A's session handed B's uuid read B's vault passage as `app_service` with RLS enforcing; it now refuses any uuid that is not the session's, 5/5 (unfixed 3 fail). And child tables (`docs/evidence/D3/2026-09-24-child-tables/`): 67 with no tenant column had row security off, four live paths reached other tenants' rows through them, and 66 now inherit their parent's isolation through the canonical child migration, the five grandchildren through their parent's own policy, and sixteen more outside `public` the same way, one of which was taking audit rows against any tenant's export job; a CI rule across every schema fails on any child left open. The staging run is owed with D1 2026-09-24, the Vault's write services (AnA client-files lane): a viewer could add files to the Vault or file them through AnA and authoring, and row-level security did not stop it, since the write policy scopes by program, not role. The shared services now check the scope's `organization_users` role; red then green on real PostgreSQL as `app_service` (`docs/evidence/D3/2026-09-24-vault-write-role/`). 2026-09-24, the vault's own authorization inputs (`docs/evidence/D3/2026-09-24-vault-program-ownership/`): a program's owner was resolved from GCC tables any tenant could write ahead of the canonical registry, and the delegate-grant table had no RLS, so one row written as `app_service` with RLS enforcing gave tenant A tenant B's vault to read and rewrite. No application writer reaches either table. Canonical registry first, sponsor-only grants; 6/6, and from empty 207/207 across the vault and fixture suites. 2026-09-25, the tables RLS decisions read (`docs/evidence/D3/2026-09-25-organizations-tenant-key/`): a sweep of every relation a policy or policy function reads found `public.organizations` without RLS and writable, and its uuid is the tenant key; a tenant gave another org its own uuid and read that org's vault. The key is now immutable, and the sweep is a live-database contract with self-tests, 13/13. Writes to the table's other columns stay open, handed on. 2026-09-26, `organizations` writes (`docs/evidence/D3/2026-09-26-organizations-writes/`): any tenant scope could rewrite any organization's tier, settings, Stripe ids and API key. Own-org-or-platform write policy, after moving five platform-staff override paths onto the system scope for cross-org edits (the policy alone made one answer success while writing nothing); 19/19. Found: `organization_users` has no RLS at all. 2026-09-26, memberships (`docs/evidence/D3/2026-09-26-memberships/`): `organization_users` had no RLS, so a member's scope placed its user in another tenant — whose route then admitted its token — and made its own member platform staff. Writes are now own-org-or-platform and staff roles platform-minted; signup, persona and cross-org admin writes moved into the membership's organization; 10/10. 2026-09-28/29 (`…01YZFCXR`), each red then green on a from-blank database as `app_service` with RLS enforcing: `public.users` was readable and rewritable from any tenant scope, credentials included — now scoped by membership, pre-auth and system scopes keep sign-in (`docs/evidence/D3/2026-09-28-users-rls/`); a member's scope could write itself a `super_admin` platform grant, which the console then admitted — writes are platform-only (`docs/evidence/D3/2026-09-28-platform-role-grants/`); generated drafts were readable and rewritable across tenants — scoped to their program (`docs/evidence/D3/2026-09-28-drafting-tasks/`); an invitation to another organization could not be accepted under enforcement — a member-only definer lookup, then the inviting organization's scope (`docs/evidence/D3/2026-09-28-invitation-acceptance/`); a blank database's first deploy left a child table unscoped — the child scope now runs in the isolation tail, and CI checks coverage after the first deploy (`docs/evidence/D3/2026-09-29-child-scope-first-deploy/`); `GET /api/users/:id` read any account in the pre-auth scope behind a default-org check — it now looks up by membership in the caller's organization (`docs/evidence/D3/2026-09-29-pre-auth-scope/`); and the audit trail and displays lost, or dropped, people who had left — named through `actor_name`, members and past actors only (`docs/evidence/D3/2026-09-29-actor-names/`). 2026-10-04: the pre-auth scope read and wrote every account, credentials included — it now reaches only the one account the request is bound to, so a steered handler reads nothing at the database (`docs/evidence/D3/2026-10-04-pre-auth-narrowing/`); `user_presence` (IP address, current page) was readable and writable from any scope — members read, only the person writes (`docs/evidence/D3/2026-10-04-user-presence/`); five legacy digest routes took the target user from the request, one with a path-traversal write — removed, replacements by path (`docs/evidence/D3/2026-10-04-digest-routes/`). 2026-09-29, SECURITY DEFINER functions (`docs/evidence/D3/2026-09-29-definer-functions/`): each one the runtime role can call runs past RLS; 73 swept, none reachable on a launch path with a caller-chosen tenant, and a new one now fails `tests/db` until it is reviewed with a reason. 2026-09-30 (`docs/evidence/D3/2026-09-30-definer-revoke/`): the runtime role's grant recipe now revokes EXECUTE on every unreviewed SECURITY DEFINER function (48), so an unreviewed one fails closed on every deploy; the whole `tests/db` tier 843/843 after the revoke.* | Runtime connects as the non-superuser app role (`APP_SERVICE_DB_PASSWORD` set); `RLS_ENFORCE=on`; the two-tenant isolation contract passes against staging with the production image. | Contract-test log from staging | Claude |
| **D4** Validation package — *drafted and executed locally: VMP, six URS, RA, IQ, six OQ protocols, TM-001 generated from the runs, VSR-001 §1–§18 (`docs/validation/`, `docs/evidence/W3/`, `WA`–`WF`). Latest local run 2026-09-27, at one commit (`89ee3a81`), on an installation provisioned from empty, in the production posture *and* with production authentication, the auth boundary enforcing as in production. Every identity but the run identity was created through user administration: the run identity added each colleague; each set its own password through the activation link and enrolled its own authenticator (`docs/evidence/W3/2026-09-27/`). IQ 12/0/3; OQ 101 pass / 0 fail / 2 deviation of 103; TM-001 69 of 71 requirements pass, 0 uncovered (URS-AUTH-012 partial, no provider; URS-SRDY-006 partial, its positive half outside the release). It found F-41, which that way of creating an account exposes: a colleague's sign-in and credential events were written outside its organisation. It also found F-42: the ledger named the account that acted by display name alone, and two accounts were "JM Smith". Both are fixed, each shown failing first, and three protocol steps now follow the product's week (VSR-001 §18). The 2026-09-23 run and the sweep after it found F-18 to F-22, all fixed (VSR-001 §13). This run found F-23 (the readiness review reported an all-clear for a project it could not read; fixed, proven on real PostgreSQL as the non-superuser role) and P-11 (the records misstated 22 steps' assurance kind; fixed, and gated in CI) (VSR-001 §14). The sweep after it found F-24 to F-33 and three signing sites that took the session's word, all fixed and each shown failing first: every signature re-verifies through one ceremony, an account taken out of use can do nothing (URS-PROJ-012, OQ-PROJ-18), and the PIN, F-15 and Submission Readiness decisions are taken (VSR-001 §16). F-6 closed (VSR-001 §11). Owed: staging execution with the production image and a second account created through user administration with a real mail server (done locally 2026-09-27), a PQ-passed provider for the model step (2026-09-22: only registry-approved models may now serve drafting or review — enforced at every gateway selection point, where before nothing read the approval; 0 of 4 approved models have a PQ, shown as a blocker in `ga-readiness-report.mjs`; 2026-09-23: the PQ is executable (`npm run pq:run`) and a "passed" claim is checked against its record, but the protocol is a draft awaiting owner approval, the gold bank is below its floor and there is no product provider key; tools and routes that store model-authored content refuse an unapproved serving model, and every remaining pin to an unapproved model is listed with its reason behind a CI gate; `docs/evidence/MODEL-GOVERNANCE/`), signatures 2026-09-24, Vault honest state (AnA client-files lane), each red on the unfixed code first: a refused upload kept its file while saying nothing was saved; spreadsheets were extracted to row 300, and a blank row or column hid the rest, while the catalog called them read in full; "N documents" counted rule-pack sections and a capped page, so URS-VAULT-004 now holds; passage search was unavailable in deep investigations; the index backfill could not run with RLS enforced (`docs/evidence/D4/2026-09-24-*`).* | CSA-aligned: validation plan, URS per launch app, risk assessment, IQ, OQ with executed Playwright evidence, traceability matrix generated from tests, summary report. Signed by the founder and one qualified contractor. | Signed PDFs under `docs/evidence/validation/` | Claude drafts and executes; humans sign |
| **D5** Part 11 evidence — *signer modes and KMS envelope implemented and tested against a fake KMS, second signature route deleted (`docs/evidence/W3b/`); audit chain made one chain per tenant with `chain_seq` ordering after the concurrency and RLS defects were reproduced on real Postgres, local verifier 262/262 OK, ledger surface reads the chained store and shows the server verdict (`docs/evidence/WA/`); QMS approval and authoring e-sign proven end to end with a credentialed second signer (`WB`, `WF`). 2026-09-23: every signing path re-verifies the signer through one ceremony (`server/services/part11/reverify-signer.ts`: the account's standing, its lockout, the password, the enrolled second factor) and records what it verified; the Authoring PIN and a second verifier are deleted; the release, the AnA rewrite and the document lock no longer take the session's word (VSR-001 §16.3). 2026-09-24: an exported signature manifest verifies each printed hash against the content it is printed on, and a sealed record that no signature covers is refused (F-40, VSR-001 §17, `docs/evidence/DOCUMENT-FIDELITY/2026-09-24/`). 2026-09-24, two exceptions to "every signing path" found and fixed. The shared `<EsignModal>` could verify no signer in any environment, because its fetch sent no bearer token; `ci:unauthenticated-fetch` now gates the class (`docs/evidence/D5-ESIGN-TOKEN/2026-09-24/`). And `/api/regulatory/documents` recorded sign-offs and approvals with no re-verification; it now uses the one ceremony, with the gate asked first (`docs/evidence/D5-LIFECYCLE-SIGNING/2026-09-24/`). 2026-09-26/29: the database refuses any change to a recorded Vault version's identity, hash or lineage (VR-06) and any deletion except the tenant purge's owner-run function, which also makes the purge erase the Vault it used to leave in place (VR-07; `docs/evidence/D5/2026-09-26-vault-record-immutability/`, `docs/evidence/D5/2026-09-29-vault-record-no-delete/`). 2026-09-30: a lifecycle review or approval on `/api/regulatory/documents` is a Part 11 `electronic_signatures` record, with printed name and meaning, bound to the Vault version's hash read by the server. It commits with its chained audit row and the stage change or not at all, and it cannot be signed by the document's creator or uploader (VR-12, `docs/evidence/D5-LIFECYCLE-SIGNING/2026-09-29-part11-records/`). 2026-09-26/10-01: every AnA turn is an append-only record chained per tenant, and comments, quoted passages and AI-suggestion decisions are on the authoring trail. Each comes with its verdict and an export an inspector checks offline. A reason is recorded only when a person gave one; this now covers AnA's 98 governed tools and every task event (`docs/evidence/D5-ANA-RECORD/2026-09-26/`, `…/2026-09-26-authoring/`). The runtime role holds no UPDATE, DELETE or TRUNCATE on the ten append-only record tables (P0-8, grant half). The tenant purge erases turn records only through a door the trigger admits, after the export returns them; each turn's chained audit row stays (`…/2026-10-01-erasure-and-grants/`). A review-thread comment on the Review surface is fixed once posted. A retraction is recorded, and every comment and retraction commits with its chained row. The GDPR erasure keeps review comments as part of the review record (`…/2026-10-01-review-comments/`). 2026-10-01: a Vault version is sent for review, reviewed and approved in the Vault, each sign-off an e-signature with the signer's own reason, bound to the version's bytes. The uploader, whoever sent it and the reviewer cannot approve it. Approving v2 supersedes v1 in the same transaction, and an approved version's details cannot be edited (VR-13, `docs/evidence/D5-VAULT-APPROVAL/2026-10-01/`). Every stored Vault version can be re-proven against its recorded SHA-256 on demand, each verdict a chained `vault.document.fixity` row (`docs/evidence/D5-VAULT-FIXITY/2026-10-01/`); its schedule is owed by the jobs lane. The deletion archive is deployed, append-only, tenant-scoped and erased by the tenant purge (critique 13, `docs/evidence/D5/2026-10-01-vault-archives/`). Owed: the KMS key, one live signed release, the production verifier run* | `AUDIT_HMAC_KEY` and `MFA_ENCRYPTION_KEY` in KMS; a KMS-backed signer behind the existing signer seam; the second non-compliant signature route deleted; audit-chain verifier run on production and its output filed. | Verifier output; route deletion commit | Claude |
| **D6** Security posture — *policy set, SIG-Lite questionnaire and trust statement drafted; AI gates fail closed in production (`docs/evidence/W3b/`, `W2/`). 2026-09-23: three sign-in defects closed, each reproduced on real PostgreSQL as the non-superuser role before its fix (VSR-001 §13.9). `/api/users/login` issued sessions without the second factor (MFA bypass). Logout never ended a session (July audit AUTH-03). The enterprise sign-in recorded nothing. Later on 2026-09-23 (`docs/evidence/D6/2026-09-23/`, VSR-001 §15), each shown failing on real PostgreSQL before its fix: a TOTP code, an emailed code and a reset token are each accepted once, including under concurrency; the session states the account's real second factor; the client address in signature and audit rows is the one the load balancer saw, never the one the client wrote (`ci:client-ip-single-source`); a session alone can no longer replace an enrolled authenticator (F-26); the TOTP secret no longer reaches a third-party QR service; reset links are never built on the request's Host. W3, same day (VSR-001 §16), each shown failing first: a suspended or deprovisioned account signs nothing, cannot sign in, and every session it holds ends (F-28, F-29; OQ-PROJ-18); a wrong factor at signing counts against the account, and an unreadable lockout refuses (F-27, F-30); each user behind the load balancer has their own sign-in allowance (F-24); a platform administrator reaches Master Administration on the platform role alone (F-31). Closed 2026-09-26, on both sign-in doors: a recovery code is redeemable once at the login challenge, and an authenticator account cannot finish sign-in with an emailed code (`fdc1e53e4`, `e93c7878f`, P1-38 `fc5f5d31f`; re-run 2026-10-01, 8/8). 2026-10-01 (`docs/evidence/D6/2026-10-01-purge-signed-tenant/`): the tenant purge completes on its real table list for a client that has done real work. It had failed for every client with a project, because workspaces were deleted before projects, and for every client with a signed or locked artifact, because those records refused the cascade. The signatures are erased through a database door; each signing's chained ledger row stays. The ALB reachable from the internet is fixed in Terraform 2026-09-24 (W2 B9, `docs/evidence/W2/2026-09-24-b9/`): CloudFront alone, `TRUST_PROXY_HOPS=2`; live once D1 is applied. 2026-09-28 (`docs/evidence/D6/2026-09-28-owner-grant/`, shown failing first and live): the platform-owner grant no longer names an address in source. It is decided inside platform administration, so it never exceeds what the Master Administration guard admits, and a single-sign-on e-mail never earns it (finding 43; INF-27, master-admin half). Closed 2026-10-01 (`b221cd641`): Terraform passes both owner allowlists to the container (`terraform/stack/main.tf` `owner_environment`, from `platform-owners.auto.tfvars`), and first-run setup needs the deployment's `SETUP_TOKEN` in production. 2026-10-05 (`docs/evidence/D6/2026-10-05-ci-and-gates/`, `2026-10-05-pm-decisions/`), each shown failing first: fifteen CI gates no longer read string literals as comments and skip the code after them; the tenant data return withholds credential material (OAuth tokens, gateway credentials, session keys), with a schema-wide guard against a new unclassified one; four org-keyed tables, client gateway credentials among them, are now reached by the tenant purge; Security Scan is green in CI (run 37252785865), and the full-history secret scan, run locally with CI's own command, finds no unrecorded credential (CI confirmation pending its runner backlog). Owed by the founder: revoke the two Neon owner passwords and the Hugging Face token committed to history (P0-17; runbook in `2026-10-05-pm-decisions/`). Owed: SOC 2 platform, pen test, Anthropic BAA, signatures* | SOC 2 Type II observation window open on a compliance platform; third-party pen test with findings closed; standard security questionnaire answered; Anthropic BAA signed; per-tenant data-retention and residency statement published. | Pen-test report; questionnaire; trust page | Claude + founder (subscriptions, signatures) |
| **D7** One real sequence — *engineering half closed 2026-09-20: one AS2 transport for ESG and ICSR, typed refusal for the unverified REST path, PDF/A OutputIntent fixed (`docs/evidence/W5/`). 2026-09-24: the FDA regional backbone no longer defaults the application type to NDA or codes an IND as an IND safety report. It states the identity it was given or refuses to build (F-38, VSR-001 §17). The DTD hosts are still refused by the environment's egress policy (403 on CONNECT to www.fda.gov and admin.ich.org, one attempt each). Owed: DTDs and other agency artifacts (downloads refused by the sandbox proxy), agency accounts, the test submission* | eCTD DTDs vendored (B3); external validator seam live or FDA-criteria fallback declared (B4); ESG transport gap closed (B16); one test sequence accepted by FDA's test environment for a real sponsor with the ack chain filed. | Ack chain; preflight 15/15 | Claude builds; founder holds accounts |
| **D8** Connector for Claude — *built 2026-09-21: 19 tools, OAuth 2.1 with PKCE (`docs/evidence/W7/`). Corrected 2026-09-30: that suite connected as a superuser, so RLS never bound it, and under enforced RLS no client could connect (the grant store wrote tenant-policied rows in the pre-auth scope); a signed-out session kept the connector; a connector token was a full /api session. Fixed in `3bdb50458` and proven as the runtime role with RLS on, with suspended and deprovisioned accounts refused with the reason (`docs/evidence/D8/2026-09-24-account-standing/`). 2026-10-01: the tools' tenant isolation proven as the runtime role — with a tool's own tenant filter removed, the database still refuses the other organisation's rows (`docs/evidence/D8/2026-10-01-connector-tenant-proof/`). Owed: staging, a second machine's client, the directory submission* | Remote MCP server in `server/mcp/` (streamable HTTP, OAuth 2.1 + PKCE) exposing 15–20 hand-curated tools with exact scope, governed flag and annotations; privacy policy, docs, support contact; submitted to the Connectors Directory; skills pack public. | Transcript of a second machine's Claude client calling the readiness tool against staging; submission acknowledgement | Claude |
| **D9** Commercial paper — *drafts complete under `docs/commercial/` (`docs/evidence/W6/`). Owed: lawyer review, the pricing decision* | Pilot agreement, subscription agreement, DPA, order form, pricing page, onboarding runbook, support policy. One lawyer review. | Files under `docs/commercial/` | Claude drafts; founder approves |
| **D10** One customer | A signed pilot with a fee and logo rights; a named regulatory user who has filed at least one governed document into a sequence on production. | Signed agreement; audit-trail entry for the filing | Founder only |

## Gates

- **Week 8:** D10 signed and D1 staging green. Without D10, sessions stop building
  and the founder spends four weeks only on conversations. Without green staging,
  W2 takes every session until it is.
- **Week 16:** the pilot user has filed on production and D7's sequence is
  accepted. If not, the launch date moves and the pilot and any investor are told.

## Rules that follow from the founder's notes (2026-09-20)

### Multi-model is a governance feature, not a marketing feature

The gateway (`server/services/ai-gateway/types.ts`) already routes to
`openai`, `anthropic`, `moonshot` (Kimi), `bedrock`, `vertex`, `azure` and
`local`. The approved-models registry
(`server/services/ai-governance/approved-models.ts`) carries Anthropic (5),
OpenAI (2, dated GPT-4o pins), Moonshot (3), Bedrock, Vertex (Claude only),
Azure and `local-default`. **Gemini has no generation lane and no approved
entry today**; adding it is a build item under W2's gateway scope, not a toggle.

- Every model a tenant can select is an entry in the approved-models registry
  with a pinned version, a rationale and an eval reference. Nothing else is
  selectable. This is what a GxP buyer is sold: *approved-model governance with
  evidence*, never "four models".
- Only models with a passed PQ against `server/eval/rag/` and
  `server/eval/doc-quality/` are approved for **high-risk regulatory drafting**.
  For launch that is Claude Opus 5.5 (primary, per the founder 2026-09-25; `docs/evidence/MODEL-GOVERNANCE/2026-09-25-opus-5-5/`) and one validated fallback, Opus 5. Kimi,
  Gemini, GPT and `local` ship as *available* with `riskTier` capped below
  high-risk until their PQ executes. More approved models means more validation
  surface; approve them one at a time, with evidence.
- Sensitive dispatch stays governed by `AI_PROVIDER_PLACEMENT_APPROVALS`. A
  tenant's residency or zero-data-retention policy decides which providers it
  may reach; the ladder never fails over across that boundary.
- Every gateway call is CI-enforced through `getGateway()`
  (`scripts/ci/check-gateway-bypass.mjs`). A new provider is added behind that
  seam or not at all.
- In the Claude connector (D8) and all Anthropic-facing material, Claude is the
  named model. Multi-model is how Veeva positions too; it is not a conflict.

### AnA is the regulatory operating system; the LLM is a swappable narrator

The platform's real strength is deterministic: eCTD packager, validators,
clocks, conformance checkers, the SE flowchart, the sample-size solvers, rule
packs, the tool registry. The direction is to keep moving truth into that layer
so that the model only frames, drafts and explains, and any approved model can
be substituted without changing an answer.

- **Numbers, verdicts and governed content come from engines, never from the
  model.** The rule already stated for AnA advisory applies platform-wide: the
  model calls the deterministic tool, renders its result, and adds language.
  A tool that asks the model for a figure is a defect.
- **The corpus is the OS's memory and it is empty until ingested.** Corpus
  ingestion (runbook B9) moves from advisory to launch-critical: a local
  regulatory-intelligence OS with empty precedent tables is a chat wrapper.
  Guidance freshness stays in the regulatory-currency registry with dated
  versions.
- **Retrieval is local by default.** pgvector, the eight-corpus embedding
  policy and the RAG router already exist; the local embedding lane must
  respect the per-corpus dimension contract before any on-prem tenant is
  accepted (see `LOCALAI_ONPREM_INFERENCE_PILOT_PLAN_2026-07-30.md` §4).
- **Local inference is for low-risk lanes until PQ.** `local-default` stays
  "not approved for high-risk regulatory drafting" until it passes the eval
  harness. "Limit the need for LLM" means fewer and cheaper model calls per
  governed action, not building a model.
- **Not in scope for launch, and not what "operating system" means here:** the
  regulatory digital twin, epistemic / causal / self-evolving engines,
  federated learning and the manufacturing digital twin. They stay in the tree
  behind flags and get no sessions until D1–D10 are green.

## Product decisions, 2026-10-01 (product owner, under the founder's delegation)

The founder delegated these to the product owner on 2026-10-01 ("make those decisions … as the product manager and
product owner"). Each is recorded with its reason so no later session re-opens it without new facts.

### P-1 — A password change ends every connector grant authorised before it

A password is changed in a regulated tenant most often because it may be known to someone else. A connector grant
authorised with that password is a credential derived from it: left alone, the remedy would leave it minting access
for the refresh token's 30 days. §11.300(b) and (d) ask that a compromised credential can be recalled; this recalls the
credentials made from it too. The cost to a legitimate user is one reconnection. The platform already ends sessions
and connector access tokens issued before a change (`verifyLiveToken`, D6 P0-4); grants now end on the same
comparison (`sessionPredatesPasswordChange`). Implemented in `server/mcp/auth/provider.ts`; evidence
`docs/evidence/D8/2026-10-01-product-decisions/`.

### P-2 — The connector ships at launch, enabled, and registers clients from Claude's origins only

D8 is one of the ten rows that define "commercially deployed", and the connector now meets the posture the rest of
the platform holds (account standing, revocation, token class, tenant isolation proven as the runtime role —
`docs/evidence/D8/`). So production runs with `MCP_ENABLED=true`, `MCP_PUBLIC_URL` set to the production origin, and
`MCP_CLIENT_REDIRECT_ALLOWLIST=https://claude.ai,https://claude.com`: the connector serves Claude, the client the
directory submission and the D8 evidence name. Production with no allowlist **refuses** every registration rather
than warning and admitting any https origin — a missing list is a configuration fault and it fails closed
(`server/mcp/index.ts`). Loopback redirects (local CLI clients) stay refused in production at launch; admitting them
is a later decision on its own evidence. The three values belong in `terraform/stack`'s boot environment and the
deploy preflight (W2), handed on in `docs/work-orders/README.md`.

### P-3 — Repository and release controls fit the one-branch model

- **No required-status-check ruleset on `concept2cure-v2`.** Under RULE 0 every change lands by a direct push, and a
  required check must pass before a push is accepted — which no commit can do before it is on the branch. Such a
  ruleset would refuse every push. P0-14's "required checks" is replaced by the next two items.
- **Apply now, in GitHub settings (founder; needs repository admin):** a ruleset on `concept2cure-v2` that blocks
  force-pushes and deletion (it costs nothing and protects the code's own history); secret scanning with push
  protection; and a required reviewer — the founder — on the `production` environment, so no deploy reaches
  production without a named human approving it (§11.10(k)(2), change control of the system itself).
- **The release gate is at deploy:** production deploys only a commit whose CI run on `concept2cure-v2` passed the
  release-evidence gate (Integration Tests, Boot Smoke, Blank DB Provisioning, Build and the security jobs included;
  these now run whatever Lint says, `17ba398e7`). `deploy-aws.yml` verifies that verdict for the tagged commit before
  `build-push` (W2, handed on). A release therefore needs a green trunk commit, which is the standard a regulated
  customer's auditor will ask about.

### P-4 — Uploads are scanned inside the API task, and a file the scanner could not finish is refused

A ClamAV sidecar runs in every API task (`terraform/modules/ecs-fargate`, image pinned by digest, `CLAMAV_HOST`
on loopback), the deploy preflight refuses a stack without it, and a scan that did not complete answers 422
`FILE_SCAN_INCOMPLETE` rather than admitting the file. No third-party scanning service sees a tenant's files, the
scanner scales with the API tasks, and it fails closed. The cost is memory: each API task is sized at 6 GB
(`api_memory`). Evidence `docs/evidence/D1/2026-10-01-production-blockers/`.

### P-5 — The first account is created by the deployment's operator, and the platform owner is named in Terraform

An open first-run setup lets whoever reaches a fresh deployment first become its administrator and inherit the owner
allowlists' cross-tenant access. In production `POST /api/setup/initialize` requires the deployment's `SETUP_TOKEN`
(generated by Terraform into Secrets Manager), and `platform_owner_emails` is required, lower-case, non-empty.
The owners are named (founder, 2026-10-01) in `terraform/environments/{production,staging}/platform-owners.auto.tfvars`. Still owed: the apply and the one setup call. Evidence `docs/evidence/D1/2026-10-01-production-blockers/`.

### P-6 — Every write to a co-author document states its reason; a document with saved history is not deleted

The editor's other two hosts already required a reason on every save, and three hosts of one editor hold one rule.
The replaced text is kept as a version and the change is an audit event in the same transaction. Deleting a document
with versions is refused (409), because its versions are its record. Evidence
`docs/evidence/D5/2026-10-01-coauthor-save-trail/`.

### P-7 — A tool with no engine says it is unavailable, and stays until its replacement exists (plan open decision 8)

`pdf_overlay` answers `unavailable` until the bind engine ships (plan WS13), and is deleted in the change that ships
`bind_pdf_package`. The PMDA and NMPA connectors refuse every search and fetch, say where to look by hand, and are
never offered as configured, until a licensed data source exists. Removing them now would delete a capability with no reachable replacement (working
agreement); an honest refusal costs nothing and fabricates nothing. Evidence `docs/evidence/D4/2026-09-30-honest-tools/`.

### P-8 — The deployment's own mailbox, calendar and CRM serve one named organisation (plan open decision 10)

The regulatory mailbox (`GMAIL_OAUTH_JSON`), the team calendar and the HubSpot CRM are each one account for the whole
deployment, and every organisation's AnA could read the mailbox and the CRM and write the calendar (ANA-03). They now
serve only the organisation `PLATFORM_INTEGRATIONS_ORGANIZATION_ID` names, read from the request's tenant scope;
every other organisation is told none is connected for it, and the account is not reached. Unset, no one reaches
them. Retiring them outright was the alternative; this keeps the operator's own use and a single-tenant deployment's.
A tenant's own mailbox or CRM, on its own credential, is a connector capability after launch.
`server/services/integrations/platform-integration-owner.ts`; evidence
`docs/evidence/D6/2026-10-01-platform-integrations-owner/`.

### P-9 — The FDA guidance index is the reviewed registry (plan open decision 11)

What AnA states about an FDA guidance — that it exists, its status, its date — comes from the currency registry's
reviewed entries, never from a live page. The fda.gov guidance datatable's stability and terms are unverified, and a
scrape that drifts would turn into a wrong fact without anyone noticing. A live fetcher (plan WS14) is post-launch and
feeds review; it never answers directly. Until then `fetch_fda_guidance_list` is `unavailable` and
`check_guidance_freshness` answers `unverified` on a miss (`docs/evidence/D4/2026-09-30-honest-tools/`).

### P-10 — No separate worker at launch (B7)

With no Redis (B6, `docs/evidence/W2/2026-09-24-multi-task/u20-sessions-across-tasks.md`), the Bull action queue has
nothing to consume, and scheduled jobs run once across the API tasks (`scheduledOnce`). So `worker_desired_count`
stays 0 and the deploy builds no worker image. A worker returns when a job has to be isolated from request latency
(the sandbox of plan WS16 is the first candidate), on its own evidence.

### P-11 — A WAF on CloudFront at launch (AWS-0011)

Security questionnaires will ask, and it costs about $10 a month. The web ACL on the distribution blocks with the IP
reputation and known-bad-inputs managed groups and a per-IP rate rule. AWS's common rule set runs in count mode for
two weeks, then blocks, with its body-size rule excluded on the upload and AnA paths (it refuses bodies over 8 KB).
A CloudFront web ACL lives in `us-east-1`, which both environments use. The Terraform is handed on to the holder of
`terraform/modules/cloudfront` (`docs/work-orders/README.md`); until it is applied, the ALB admits CloudFront alone
and the app applies its own limits.

### P-12 — No public-only connector scope at launch

P-2 admits only Claude's origins as connector clients. A public-only scope for third-party agents (plan WS9,
`c2c:public`) is built with the first such client, not before.

## Product decisions, 2026-10-08 (product owner, under the founder's delegation)

The founder delegated these on 2026-10-08 ("you can make these decisions without me"), while the client-journey
fixes from the browser QA walk of that day were landing (`docs/evidence/QA-2026-10-08/`).

### P-13 — Members may create a program

`canCreateProgram` (`server/services/c2c/program-access.ts`) refuses only read-only roles. A member creating a
regulated program is how a regulatory user starts work, and the organisation's role vocabulary is open, so an
allow-list would lock out every role nobody listed. Kept as it is. The program's lead is its creator, and mutating
another person's program still needs `canMutateProgram`.

### P-14 — A document is placed only into a submission anchored to its program

The filing picker already offers only the program's own submissions (`24e8cb5f4`). A direct API write of a
program's document into a submission that belongs to no program is now refused as well, with a named error. A
placement the server cannot judge is a placement into an unknown dossier; failing closed is the rule. A legacy
submission with no program is anchored first, through the Submission Center, and then accepts placements.

### P-15 — Documents already split across two codes are not merged

Before `38179495f`, the data room and the Vault derived different codes for one file, so some documents exist as two
version families (for example Vorelinib STB-0042). Merging them would rewrite recorded rows. They stay as recorded;
the shared code rule stops new splits, and a person retires the duplicate through the existing disposition flow.

### P-16 — The recorded type labels a document; the classifier's kind is the fallback

An edited type shows in the tree, list, uploads lane and header (`cc96676e3`). The classifier's evidence kind is
used only when the recorded type is empty or OTHER (the ingest's "not told" value), and it stays visible in the
filing block's "Looks like" line.

### P-17 — A project's record counts are its current records

Superseded versions, retired sources and withdrawn sources are not counted as records (`cc96676e3`), so the project
home agrees with the Vault tree and the Data room.

### P-18 — Signing authority is assigned, by role, to named people

The signing policy stays as the security review left it (admin, approver, reviewer; P1-44b): a manager's password does
not make a signature. The QA walk found the consequence: `approver` and `reviewer` could not be assigned, so only an
administrator could sign anything, and an administrator who authored a document could not approve it. An administrator
can now assign `approver` and `reviewer` in Admin Access, with a reason, like every membership change. An approver may do
everything a manager may, and sign; a reviewer may do everything a member may, and sign. An author still cannot approve
their own document. A deployment may still widen the policy with `ESIGNATURE_SIGNING_ROLES`.

### P-19 — Every program a client can open has its project record

Programs created after the dossier anchor existed (BX-256, Vorelinib in QA) have no `projects` row, so the schedule,
tasks and AnA's project context answer "no record" for them. Intake creates the anchor in the same transaction as the
program. Existing unanchored programs are anchored by an idempotent statement in the migration set (Rule 1), not by a
laptop script.

The fixer raised three questions about P-19, decided the same day:
- An organisation with several workspaces and none marked as its own is refused (409) rather than having one guessed.
  The workspace decides who may see a project. The follow-up is a workspace choice in the New Project wizard for
  multi-client organisations (a CRO), not a default.
- When a backfilled program's recorded creator is not a user id, its project owner is left empty. Ownership grants
  access, so it is not inferred.
- The demo seeds use the code BX-204 for two different products. The seed's dossier-map project gets its own code;
  demo data must not depend on a code collision.

### P-20 — A safety report never infers what nobody stated

The onset date is stated either as a date or explicitly as unknown; a blank is refused. When expectedness is not
recorded, the expedited-reporting verdict is "not determined: expectedness not assessed", never "not reportable". A
missing determination produces no verdict at all, so it cannot become an unsent 15-day report.

### P-21 — Regulated choices start unstated

Every select whose value lands in a regulated record starts on "Not stated — choose" and sends nothing until chosen. This
covers safety-report determinations, the briefing-book meeting type, the LOA file type, the amendment category and the
forms panel's phase. The filing-target picker pre-selects a sequence only when exactly one is open.

### P-22 — Approval gates the release, not the technical validation

A Vault leaf whose version is not approved and current blocks Freeze, dispatch and transmit. At Validated it is reported
as a warning ("not yet approved"), not an error. Publishers validate while final approvals are still being collected, and
the release gates already refuse an unapproved leaf.

### P-23 — A signature serves only the act it was given for

A signature collected for a freeze or transmit that the server then refuses is void. It cannot be reused later when the
gate clears. Transmit checks a typed application number against the program's recorded one, as the export already does.

### P-25 — Each person manages their own account; administrators manage membership

The 2026-10-08 onboarding fix (`ddc8c0db5`) raised these:
- **An account panel is built.** A person can see their profile, change their password, and enrol or remove an
  authenticator from the shell's account menu. It is a shell surface, so it is inside the launch catalog. The server
  routes already exist (`/password/change`, `/mfa/setup`, `/mfa/enable`, `/mfa/disable`). Without the panel, the
  authenticator that ADR-0014 expects of signers cannot be enrolled anywhere in the product.
- **Removing a member is the organisation-level deactivation.** No "disabled but kept" membership state is added.
  Suspending an account globally stays a platform action.
- **A setup link is re-issued** by re-inviting a member who never activated, through the existing invite route. The
  link is never logged, in any environment.
- **Scopes are derived from the checks that enforce them.** Organisations do not edit them, and the "Edit scopes"
  control does not offer it. Approver and reviewer as SCIM groups come after launch.

### P-26 — A report shows only what an engine computed, for the program asked about

From the reporting fix (`4ac15bdd1`):
- **No program is picked for the person.** With none open, the canvas asks which program the report is for. The
  earlier "flagship" fallback chose by lowest id.
- **Confidence is a measured figure or nothing.** The executive digest does not require one, and finalizes on the
  readiness evaluator's verdict. The evidence & provenance trace does require one, so it stays below final until its
  confidence is the lineage engine's measured provenance completeness. That is a follow-up, and the registry change is
  a new version row, never an edit in place (Rule 1).
- **Packs list only types an engine computes.** Engine-less types are listed once, as "not computed in this release",
  rather than as tiles inside packs.
- **Registers are organisation-wide.** They live in Audit & compliance reports and are not offered on a program's
  canvas.
- An older run with no blockers that was never signed now renders below final and can be finalized. This is
  accepted: it was never final.

### P-24 — AnA works like Claude, and the client sees the Summary of the work

The founder asked for this on 2026-10-08, with screenshots of Claude's per-task Summary. The design is
`docs/design/ANA_AGENT_WORK_VIEW_2026-10-08.md`, and its decisions are recorded there ("Decisions taken"). In short:
- `ANA-SUMMARY` is a founder-directed lane that moves no D-row.
- Order of work:
  - S1: reads deliver what they record.
  - S2: connector search defects.
  - S3: one step label table.
  - S4: the Summary, live and sealed.
  - S5: task attribution.
  - S6: Drive listing and import into the Vault, limited to admin-allowed folders.
- A turn keeps running when the phone locks. This is designed after S4.
- The Summary is visible to whoever can read the thread. The full record stays with the asker and administrators.
- Glyphs are neutral and name their source, with no third-party logos.
- One 5,000-character read window applies to every windowed read.
- Round budgets are unchanged.

## How sessions run under this file

- One control-tower session, at most four scoped workers, each with one
  workstream (W1–W7 in the launch playbook) and one directory set. Workers
  commit to `concept2cure-v2` (Rule 0); the control tower reviews and merges.
- Every worker prompt names the evidence it must produce and the row it moves.
- Weekly: run the repo's Part 11 UX, honest-state, design-system and security
  auditors on the launch catalog; file their reports as periodic-review
  evidence under `docs/evidence/reviews/`.
- Nightly on staging: readiness probe, isolation contract, smoke suite; the
  delta is Monday's agenda.
