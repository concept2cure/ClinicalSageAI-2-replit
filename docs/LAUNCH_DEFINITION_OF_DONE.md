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
| **D1** Hosted production — *code side done 2026-09-21: `npm run db:provision` proven on an empty database, PDF/A toolchain in the image; `docs/evidence/W2/`. Owed: AWS account, IAM, DNS, secrets, the apply itself. 2026-09-23: the application side holds; the Terraform side did not. `terraform validate` had never run, and production failed it (fixed in `b6d7a7d7b`, which also adds the KMS release-signing key: SOP-SEC-001 §2a). Ten more blockers stand between it and a booting task, among them `DATABASE_URL` wired to a JSON credential, an illegal RDS database name, the preflight's required variables absent, and an ECS health check calling `wget`, which the image lacks; three of them are founder decisions (AI placement, Redis, worker). Ordered brief: `docs/evidence/W2/2026-09-23/README.md`. 2026-09-24, B9 (`docs/evidence/W2/2026-09-24-b9/`): the ALB answers CloudFront alone (origin-facing prefix list + origin secret header), and the way in through CloudFront works. Before, every `/api/*` request would have failed its origin certificate check, API 403/404 came back as `200 index.html` (so `/readyz` read green for any deployment), and `/readyz`, `/collab`, SCIM and the connector had no route. Production trusts two hops; the smoke test reads `/readyz` through the public URL and fails closed. Offline proof only (mocked-provider `terraform test`, each check shown failing first); nothing applied. Adds to the founder list: a custom domain that both certificates cover, and the origin secret. 2026-09-24, B1–B3 and B5: built twice in parallel (`docs/evidence/W2/2026-09-24-b1-b5/`, `docs/evidence/W2/2026-09-23b/`) and reconciled into one: the task definition carries every name deploy-aws.yml's preflight requires (read from the workflow by `terraform test`), composed `verify-full` URLs replace the RDS JSON secret, the database name is legal, and the health check probes `/healthz`, not `/readyz` (a readiness probe replaces tasks it cannot heal). `.github/workflows/terraform-tests.yml` runs the tests and the pipeline's own preflight against the rendered task definition on every push. The RDS CA is vendored (`docs/evidence/W2/2026-09-24-rds-ca/`); the bundle itself had been dropped by `.gitignore`'s `*.pem`, so trunk named a missing file until 2026-09-24 (`2026-09-23b/rds-ca-vendored-bundle-missing.txt`). Found and fixed the same day (`2026-09-23b/`): the production image could not load its own bundle (`vite`, a devDependency, imported at load time); minting `app_service` as the RDS master always failed, and its password went to CloudWatch in plaintext; a crash exited 0; the preflight checked one revision and deploy rolled another. 2026-09-24, B8, same day (`docs/evidence/W2/2026-09-24-b8/`): staging is now production's composition. There is one `terraform/stack` with two thin roots, so staging cannot drift from what it proves. Staging runs at smaller sizes with its own names and signing key, and passes the same boot-contract test. A test also reads the six names deploy-aws.yml targets and checks production creates them. deploy-aws.yml still deploys to production only. Still blocked: no path provisions the empty RDS database (next), deploy IAM, the apply itself. Founder: B4, B6+B7, audit trail on first boot, document-storage retention. 2026-09-24, vault storage (`docs/evidence/W2/2026-09-24-vault-storage/`): a deployment had nowhere durable to keep a filing's source documents. `STORAGE_PROVIDER=s3` threw in every production build (the SDK was loaded with `require()` in an ESM bundle), and the task definition named no store, so bytes went to the task's own disk and would be deleted with it. Now the provider loads, finds every object (it had stopped at the first 1000 keys bucket-wide) and reports a refused read as an error rather than a missing document. Production refuses to boot without a durable store, and the stack creates a private, versioned bucket per environment that only the task role can reach. The pipeline's own preflight refuses `local`, a missing bucket and a missing provider, and `/readyz` reports the store, so a task that cannot reach it is not ready. Each fix was shown failing first. How long deleted versions are kept is the retention decision above. 2026-09-24, TRIVY-01 (`docs/evidence/W2/2026-09-24-trivy/`): the deploy's blocking IaC scan failed on 16 HIGH/CRITICAL findings, so no tagged release could pass `security-gate`; each is fixed or excepted at its resource with a reason, the scan exited 0; red again on merge from `terraform/stack/vault_storage.tf` (AWS-0132 ×2), fixed by the vault-storage lane (`2fe4ec4b2`); exits 0 on trunk and CI's copy now blocks. Founder decision added: a WAF on CloudFront. 2026-09-24, SMTP (`docs/evidence/W2/2026-09-24-smtp/`): login OTP is the mandatory second factor and the stack carried no SMTP, so a deploy would boot, read ready, and admit no one; the stack now carries it (port 465 only) and the preflight refuses a task definition without it. Founder: an SMTP provider with a verified sending domain, then `pilot:verify-otp` to a real inbox. 2026-11-10 and 2026-11-11, re-measured at head (`docs/evidence/D1/2026-11-10-aws-readiness/`, `docs/evidence/D1/2026-11-11-aws-readiness/`): the WAF is on the distribution (P-11); `/readyz` is cached, answers the public `{ ready }` alone, and gives its detail to the deployment's `READYZ_TOKEN`, which the stack now generates and the deploy's smoke test presents, so a failed deploy says which dependency failed; a task that cannot read the shared session store is not ready; the deploy preflight refuses live co-editing while more than one task serves; the ALB's 60 s is pinned to CloudFront's and the server's keep-alive; and both roots export every output the first apply reads (the staging root exported neither deploy role, and neither root the first-run setup). Offline proof only, each shown failing first; nothing applied. Blocking a deploy: trunk CI is red (MR-02), and the founder's inputs in MR-03's checklist. Owed by decision: a table for shared rate limits (RULE 6)* | One AWS environment from `terraform/environments/production`, image promoted by `.github/workflows/deploy-aws.yml`, `/readyz` 200 with schema and ana `ok`; redis and worker read `skipped` by decision B6 (2026-10-01, CPO: production runs without Redis and coordinates through Postgres; `docs/evidence/W2/2026-09-24-multi-task/u20-sessions-across-tasks.md`). | Readiness JSON + `terraform apply` log | Claude + founder (account, DNS, IAM) |
| **D2** Launch catalog — *local green 2026-09-20, see `docs/evidence/W1/2026-09-20/`; staging owed with D1. 2026-09-23: every self-serve signup answered 500 under `RLS_ENFORCE=on` after `a264e291a` (the default client workspace written from the pre-auth scope); fixed in the writer, shown on real PostgreSQL 8/16 red → 16/16 green (`docs/evidence/W1/2026-09-23-workspace/`). 2026-09-28, deterministic AI responses (`docs/evidence/D2-DETERMINISTIC-PROD/2026-09-28/`): `AI_GATEWAY_DETERMINISTIC=true` served fixed responses in production — "Draft section 2.7.3" answered `**AnA (Demo Mode):** …` with no error — while `/readyz` read ready. Production now refuses it at boot, per request and in the deploy preflight unless `AI_GATEWAY_ACCEPT_DETERMINISTIC=true` records the risk (the CI boot job does); each shown failing first. The fixed responses no longer mark claims about unread input `[KNOWN]` or `[INFERRED]` 2026-10-01: a Vault document takes its next version from the server (check-in by naming the document: version assigned 1.0 → 2.0, code and filing kept, predecessor linked), and the database refuses a version link outside its family or a second successor (VR-08, `docs/evidence/D2-VAULT-VERSIONS/2026-09-30-checkin/`). 2026-10-01: a document is one entry at its current version; every version is listed with its hash, downloads hash-verified, and is in the document's history; search shows current versions unless asked; a changed file uploaded under an existing name is offered as the next version (VR-09, `docs/evidence/D2-VAULT-VERSIONS/2026-10-01-version-list/`). The data room's capture record is append-only in the database, and its Filed chip names the Vault version the file became (VR-16, `docs/evidence/D2/2026-10-01-data-room-capture-immutable/`). Captured sources are filed into the Vault from the data room, through the one upload-to-Vault path AnA's tool also uses, with a result for every source; changed bytes are refused (VR-11a, `docs/evidence/D2-DATA-ROOM-FILE/2026-10-01/`). Suggested filings in a folder are confirmed together with one required reason, each with its own audit row, and one changed since it was listed is refused; the header counts what awaits confirmation (VR-11b, `docs/evidence/D2-DATA-ROOM-FILE/2026-10-01-confirm/`). A capture names who made it, and its capture, supersession and filing into the Vault are in the audit chain (VR-16b, `docs/evidence/D2/2026-10-01-data-room-capture-provenance/`). Any earlier version compares with the current one: bytes, recorded details and the changed lines (critique 15, `docs/evidence/D2-VAULT-VERSIONS/2026-10-01-compare/`). The Vault searches every project of the organisation at once, each hit naming its project (critique 15, `docs/evidence/D2-VAULT-LIBRARY/2026-10-01/`). A version names the documents that support it, that it references or that it is based on, in any project of the organisation; both ends list it, removal needs a reason, and each change is chained on both documents (critique 15, the replacement for `parentDocumentId`, `docs/evidence/D2-VAULT-RELATIONSHIPS/2026-10-01/`). Each version says which submission sequences and sections carry it, with the leaf's operation (VR-14a, `docs/evidence/D2-VAULT-WHERE-USED/2026-10-01/`), and which official eSTAR exports attached it, from the export's own record of its sources (VR-14c, `docs/evidence/D2-VAULT-WHERE-USED/2026-10-01-estar-uses/`). A version is annotated on a page or a passage of its text, replied to, resolved with a note or retracted by its author, each act chained and the record guarded in the database; the review and approval dialogs say what was open (critique 15, `docs/evidence/D2-VAULT-ANNOTATIONS/2026-10-01/`). 2026-10-11, biostatistics (`docs/evidence/D2-BIOSTATISTICS/2026-10-11/`): 163 checks of the statistical engines against published reference values found 37 wrong, all on parallel copies reachable from live routes while the canonical `server/services/stats/*` passed. Fixed against the published method and pinned by four new reference suites (74 tests; 69 of them fail against the previous code): Φ and Φ⁻¹ to full double precision (z(0.975) was off by 1.2e-6 and every sizing, power and boundary is built on them), TOST 69/group, crossover 32, AUC 10/group, real Dunnett, exact noncentral-t 64, binary 93/arm, Schoenfeld 247 events (the time-to-event sizer had labelled events as subjects), Lan–DeMets O'Brien–Fleming 2.963/1.969 and conditional power 0.8903 where the service answered 3.258/2.259 and 0.185. The engine now refuses rather than substituting a silent default (a hazard ratio of 0.5 for an effect ≥ 1, an 0.85 performance goal, 0.90/0.90/0.50 diagnostic accuracy). Five launch-reachable paths carried figures a model supplied, each closed: a model-drafted CSR §11.4 reached Module 2.5/2.7 as the study's primary result inside eCTD compile; AnA's M2.5/M2.7 tools composed from model-written `csrs[]` and now read the program's CSR records; statistical defensibility was a model's 0-100 scores and is now the deterministic judgment engine; figure generation asked a model for a Kaplan–Meier HR and 95% CI; the design optimizer invented sample sizes by endpoint keyword. Four engines that were both unreachable and wrong were deleted (10,247 lines), among them a Schoenfeld with a factor of 2 that halved every event count. Owed and named there: no pre-dispatch statistical gate, no statistical qualification package, and the `biostatistics` surface scrapped by `docs/SURFACE_DECISIONS_2026-10-08.md` but not yet removed. 2026-10-14, no example data (`docs/evidence/D2-NO-SAMPLE-MODE/2026-10-14/`): sample mode and its datasets are deleted, and `ci:fixture-fallback` refuses their return, shown blocking a reintroduced fixture. 2026-10-22, invented values (`docs/evidence/D2-NO-SAMPLE-MODE/2026-10-22/`): 155 commits from a codebase-wide inventory. A fact nobody recorded stays unrecorded instead of a default confidence, actor, year or submission type. A failed read is an error, not "none". A score covers only what was measured. Tenant and actor come from the session. Each is pinned by a test shown failing first. Owner decisions owed are listed there.* | Seven apps in the launch catalog: Projects, Vault, Authoring, Submission Center (with the IND lifecycle and forms tools as its features, P-32, and Submission Readiness, the one dispatch verdict per sequence, as its screen since P-36; P-33), QMS controlled documents, Reporting & analytics (the seventh by the founder's decision of 2026-09-26, landed 2026-10-01: `docs/evidence/D2-REPORTING-LAUNCH-APP/2026-09-30/`) and CMC / Module 3 (the eighth, decision P-28 under the founder's delegation of 2026-10-07, landed 2026-10-12: `docs/evidence/D2-CMC-LAUNCH-APP/2026-10-12/`). Six of the seven are granted to a new organisation by default (the modules granted are unchanged by P-36). CMC / Module 3 grants no module on purpose: its surface is inside the boundary, and the professional band the product owner set on 2026-08-24 still decides who holds it — a launch app's surface list lifts the launch-scope lock, and `applyLaunchScope` never widens a verdict. What it composes is small-molecule Module 3 for a US IND; a biologic, a marketing application or a non-US clinical-trial application is refused by name and authored in the editor instead (`services/cmc/composition-scope.ts`). Every other surface behind a flag that is off in production. Zero fixture imports reachable in production; `ci:fixture-fallback` and `ci:no-mock-in-prod-routes` set to block. | Fresh-org screenshots on staging; a CI run showing the gate block on a reintroduced fixture | Claude |
| **D3** Tenant isolation proven — *app_service role and boot as non-superuser proven locally (`docs/evidence/W2/`); all six OQ protocols pass locally with `RLS_ENFORCE=on` as `app_service`, after F-14 — Vault refused every upload under that role — was fixed (`docs/evidence/W3/2026-09-22/`). 2026-09-24: governed decisions added to the two-tenant contract (`docs/evidence/D3/2026-09-24-governed-decisions/`), run as `app_service` with RLS enforcing on a from-blank install, 23/23; the positive control found every listed decision answering 404 on fetch (two ids for one decision, fixed), and one mutation showed the database had already been refusing a cross-tenant write this effort had reported as live. Same day, Report OS (`docs/evidence/D3/2026-09-24-report-os-tenant/`), 37/37: seven of its request schemas took the tenant from the request and now take it from the session; RLS contained all but one leak, a program group holding another tenant's project, since memberships carry no RLS policy. (Corrected 2026-10-08: since `2ddbfb6a6c` memberships are policied through their group, though not through the project they name; the route's member check still guards the project.) An UPDATE crossed too (`docs/evidence/D3/2026-09-24-update-boundary/`, 39/39): with RLS enforcing, a traceability item could be re-pointed at another tenant's QMP, because RLS checks the row's organization and not a foreign key. 2026-09-24, signed approvals and Submission Center (`docs/evidence/D3/2026-09-24-signatures-and-runs/`): `electronic_signatures` and `submission_orchestrator_runs` added, 43/43 with the Report OS cases; each shown failing with only its own table's policy removed (A lists B's signatures, B's runs are edited and deleted, a forged row lands). Signatures had been excluded because §11.70 makes a fixture undeletable; they are in without disabling the trigger. The contract's forge handler turned out to test `risk_items` for any domain without its own branch, so a new domain could pass having tested nothing; shown passing with signatures' RLS off, and now a compile error (an exhaustive `Record<Domain, Forge>`). And an edit could approve (`docs/evidence/D3/2026-09-24-governed-edit/`, 46/46): any member's PATCH could mark a PCCP plan or post-market document approved and locked without its gate, or re-parent it onto another tenant's program, with RLS enforcing. 2026-09-24, the cortex query route (`docs/evidence/D3/2026-09-24-cortex-tenant-header/`): its tenant key was the client's `x-org-uuid` header and nothing else, since the router it is mounted under drops the session's uuid; RLS contained it for atoms but not for the vault, whose RLS the RAG pipeline scoped to whatever uuid its caller passed (see the RAG pipeline note). The key is the session's now, 6/6 with RLS on and off. Found on the way and handed on: `search_atoms_hybrid` fails on every install built from empty, so Authoring's AI draft and AnA chat retrieve no evidence. Six more writes RLS never refused (`docs/evidence/D3/2026-09-24-request-parents/`, 58/58): another tenant's complaint relinked, a preference row written for another user, an AnA profile planted onto a colleague, and three foreign-key pins, each shown landing with RLS on. And the writes only RLS was stopping (`docs/evidence/D3/2026-09-24-project-scope/`, 72/72): project intelligence read and written by project id alone, memory entries archived and verified by id, AnA's project update spreading the body (re-pointing a project at another tenant's workspace with RLS on), a bundle linked to another tenant's plan, a corpus ingest taking another org's report over, and `/api/users/me` reading the account for a password-only token. Each is shown leaking red and holding green with RLS off, since every policy passes all rows when enforcement is off. And the control plane (`docs/evidence/D3/2026-09-24-control-plane-access/`, 82/82): the kernel's process-wide log, every tenant's paths, tenant ids and actor ids, was readable and clearable by any role containing "admin" and by everyone outside production. It is now for platform operators, and an org's governed decisions for its own administrators. And the vault RAG pipeline (`docs/evidence/D3/2026-09-24-rag-pipeline-tenant/`): it wrote its caller's org uuid into the GUC vault RLS reads, so tenant A's session handed B's uuid read B's vault passage as `app_service` with RLS enforcing; it now refuses any uuid that is not the session's, 5/5 (unfixed 3 fail). And child tables (`docs/evidence/D3/2026-09-24-child-tables/`): 67 with no tenant column had row security off, four live paths reached other tenants' rows through them, and 66 now inherit their parent's isolation through the canonical child migration, the five grandchildren through their parent's own policy, and sixteen more outside `public` the same way, one of which was taking audit rows against any tenant's export job; a CI rule across every schema fails on any child left open. The staging run is owed with D1 2026-09-24, the Vault's write services (AnA client-files lane): a viewer could add files to the Vault or file them through AnA and authoring, and row-level security did not stop it, since the write policy scopes by program, not role. The shared services now check the scope's `organization_users` role; red then green on real PostgreSQL as `app_service` (`docs/evidence/D3/2026-09-24-vault-write-role/`). 2026-09-24, the vault's own authorization inputs (`docs/evidence/D3/2026-09-24-vault-program-ownership/`): a program's owner was resolved from GCC tables any tenant could write ahead of the canonical registry, and the delegate-grant table had no RLS, so one row written as `app_service` with RLS enforcing gave tenant A tenant B's vault to read and rewrite. No application writer reaches either table. Canonical registry first, sponsor-only grants; 6/6, and from empty 207/207 across the vault and fixture suites. 2026-09-25, the tables RLS decisions read (`docs/evidence/D3/2026-09-25-organizations-tenant-key/`): a sweep of every relation a policy or policy function reads found `public.organizations` without RLS and writable, and its uuid is the tenant key; a tenant gave another org its own uuid and read that org's vault. The key is now immutable, and the sweep is a live-database contract with self-tests, 13/13. Writes to the table's other columns stay open, handed on. 2026-09-26, `organizations` writes (`docs/evidence/D3/2026-09-26-organizations-writes/`): any tenant scope could rewrite any organization's tier, settings, Stripe ids and API key. Own-org-or-platform write policy, after moving five platform-staff override paths onto the system scope for cross-org edits (the policy alone made one answer success while writing nothing); 19/19. Found: `organization_users` has no RLS at all. 2026-09-26, memberships (`docs/evidence/D3/2026-09-26-memberships/`): `organization_users` had no RLS, so a member's scope placed its user in another tenant — whose route then admitted its token — and made its own member platform staff. Writes are now own-org-or-platform and staff roles platform-minted; signup, persona and cross-org admin writes moved into the membership's organization; 10/10. 2026-09-28/29 (`…01YZFCXR`), each red then green on a from-blank database as `app_service` with RLS enforcing: `public.users` was readable and rewritable from any tenant scope, credentials included — now scoped by membership, pre-auth and system scopes keep sign-in (`docs/evidence/D3/2026-09-28-users-rls/`); a member's scope could write itself a `super_admin` platform grant, which the console then admitted — writes are platform-only (`docs/evidence/D3/2026-09-28-platform-role-grants/`); generated drafts were readable and rewritable across tenants — scoped to their program (`docs/evidence/D3/2026-09-28-drafting-tasks/`); an invitation to another organization could not be accepted under enforcement — a member-only definer lookup, then the inviting organization's scope (`docs/evidence/D3/2026-09-28-invitation-acceptance/`); a blank database's first deploy left a child table unscoped — the child scope now runs in the isolation tail, and CI checks coverage after the first deploy (`docs/evidence/D3/2026-09-29-child-scope-first-deploy/`); `GET /api/users/:id` read any account in the pre-auth scope behind a default-org check — it now looks up by membership in the caller's organization (`docs/evidence/D3/2026-09-29-pre-auth-scope/`); and the audit trail and displays lost, or dropped, people who had left — named through `actor_name`, members and past actors only (`docs/evidence/D3/2026-09-29-actor-names/`). 2026-10-04: the pre-auth scope read and wrote every account, credentials included — it now reaches only the one account the request is bound to, so a steered handler reads nothing at the database (`docs/evidence/D3/2026-10-04-pre-auth-narrowing/`); `user_presence` (IP address, current page) was readable and writable from any scope — members read, only the person writes (`docs/evidence/D3/2026-10-04-user-presence/`); five legacy digest routes took the target user from the request, one with a path-traversal write — removed, replacements by path (`docs/evidence/D3/2026-10-04-digest-routes/`). 2026-09-29, SECURITY DEFINER functions (`docs/evidence/D3/2026-09-29-definer-functions/`): each one the runtime role can call runs past RLS; 73 swept, none reachable on a launch path with a caller-chosen tenant, and a new one now fails `tests/db` until it is reviewed with a reason. 2026-09-30 (`docs/evidence/D3/2026-09-30-definer-revoke/`): the runtime role's grant recipe now revokes EXECUTE on every unreviewed SECURITY DEFINER function (48), so an unreviewed one fails closed on every deploy; the whole `tests/db` tier 843/843 after the revoke.* | Runtime connects as the non-superuser app role (`APP_SERVICE_DB_PASSWORD` set); `RLS_ENFORCE=on`; the two-tenant isolation contract passes against staging with the production image. | Contract-test log from staging | Claude |
| **D4** Validation package — *drafted and executed locally: VMP, six URS, RA, IQ, six OQ protocols, TM-001 generated from the runs, VSR-001 §1–§18 (`docs/validation/`, `docs/evidence/W3/`, `WA`–`WF`). Latest local run 2026-09-27, at one commit (`89ee3a81`), on an installation provisioned from empty, in the production posture *and* with production authentication, the auth boundary enforcing as in production. Every identity but the run identity was created through user administration: the run identity added each colleague; each set its own password through the activation link and enrolled its own authenticator (`docs/evidence/W3/2026-09-27/`). IQ 12/0/3; OQ 101 pass / 0 fail / 2 deviation of 103; TM-001 69 of 71 requirements pass, 0 uncovered (URS-AUTH-012 partial, no provider; URS-SRDY-006 partial, its positive half outside the release). It found F-41, which that way of creating an account exposes: a colleague's sign-in and credential events were written outside its organisation. It also found F-42: the ledger named the account that acted by display name alone, and two accounts were "JM Smith". Both are fixed, each shown failing first, and three protocol steps now follow the product's week (VSR-001 §18). The 2026-09-23 run and the sweep after it found F-18 to F-22, all fixed (VSR-001 §13). This run found F-23 (the readiness review reported an all-clear for a project it could not read; fixed, proven on real PostgreSQL as the non-superuser role) and P-11 (the records misstated 22 steps' assurance kind; fixed, and gated in CI) (VSR-001 §14). The sweep after it found F-24 to F-33 and three signing sites that took the session's word, all fixed and each shown failing first: every signature re-verifies through one ceremony, an account taken out of use can do nothing (URS-PROJ-012, OQ-PROJ-18), and the PIN, F-15 and Submission Readiness decisions are taken (VSR-001 §16). F-6 closed (VSR-001 §11). Owed: staging execution with the production image and a second account created through user administration with a real mail server (done locally 2026-09-27), a PQ-passed provider for the model step (2026-09-22: only registry-approved models may now serve drafting or review — enforced at every gateway selection point, where before nothing read the approval; 0 of 4 approved models have a PQ, shown as a blocker in `ga-readiness-report.mjs`; 2026-09-23: the PQ is executable (`npm run pq:run`) and a "passed" claim is checked against its record, but the protocol is a draft awaiting owner approval, the gold bank is below its floor and there is no product provider key; tools and routes that store model-authored content refuse an unapproved serving model, and every remaining pin to an unapproved model is listed with its reason behind a CI gate; `docs/evidence/MODEL-GOVERNANCE/`), signatures 2026-09-24, Vault honest state (AnA client-files lane), each red on the unfixed code first: a refused upload kept its file while saying nothing was saved; spreadsheets were extracted to row 300, and a blank row or column hid the rest, while the catalog called them read in full; "N documents" counted rule-pack sections and a capped page, so URS-VAULT-004 now holds; passage search was unavailable in deep investigations; the index backfill could not run with RLS enforced (`docs/evidence/D4/2026-09-24-*`).* | CSA-aligned: validation plan, URS per launch app, risk assessment, IQ, OQ with executed Playwright evidence, traceability matrix generated from tests, summary report. Signed by the founder and one qualified contractor. | Signed PDFs under `docs/evidence/validation/` | Claude drafts and executes; humans sign |
| **D5** Part 11 evidence — *signer modes and KMS envelope implemented and tested against a fake KMS, second signature route deleted (`docs/evidence/W3b/`); audit chain made one chain per tenant with `chain_seq` ordering after the concurrency and RLS defects were reproduced on real Postgres, local verifier 262/262 OK, ledger surface reads the chained store and shows the server verdict (`docs/evidence/WA/`); QMS approval and authoring e-sign proven end to end with a credentialed second signer (`WB`, `WF`). 2026-09-23: every signing path re-verifies the signer through one ceremony (`server/services/part11/reverify-signer.ts`: the account's standing, its lockout, the password, the enrolled second factor) and records what it verified; the Authoring PIN and a second verifier are deleted; the release, the AnA rewrite and the document lock no longer take the session's word (VSR-001 §16.3). 2026-09-24: an exported signature manifest verifies each printed hash against the content it is printed on, and a sealed record that no signature covers is refused (F-40, VSR-001 §17, `docs/evidence/DOCUMENT-FIDELITY/2026-09-24/`). 2026-09-24, two exceptions to "every signing path" found and fixed. The shared `<EsignModal>` could verify no signer in any environment, because its fetch sent no bearer token; `ci:unauthenticated-fetch` now gates the class (`docs/evidence/D5-ESIGN-TOKEN/2026-09-24/`). And `/api/regulatory/documents` recorded sign-offs and approvals with no re-verification; it now uses the one ceremony, with the gate asked first (`docs/evidence/D5-LIFECYCLE-SIGNING/2026-09-24/`). 2026-09-26/29: the database refuses any change to a recorded Vault version's identity, hash or lineage (VR-06) and any deletion except the tenant purge's owner-run function, which also makes the purge erase the Vault it used to leave in place (VR-07; `docs/evidence/D5/2026-09-26-vault-record-immutability/`, `docs/evidence/D5/2026-09-29-vault-record-no-delete/`). 2026-09-30: a lifecycle review or approval on `/api/regulatory/documents` is a Part 11 `electronic_signatures` record, with printed name and meaning, bound to the Vault version's hash read by the server. It commits with its chained audit row and the stage change or not at all, and it cannot be signed by the document's creator or uploader (VR-12, `docs/evidence/D5-LIFECYCLE-SIGNING/2026-09-29-part11-records/`). 2026-09-26/10-01: every AnA turn is an append-only record chained per tenant, and comments, quoted passages and AI-suggestion decisions are on the authoring trail. Each comes with its verdict and an export an inspector checks offline. A reason is recorded only when a person gave one; this now covers AnA's 98 governed tools and every task event (`docs/evidence/D5-ANA-RECORD/2026-09-26/`, `…/2026-09-26-authoring/`). The runtime role holds no UPDATE, DELETE or TRUNCATE on the ten append-only record tables (P0-8, grant half). The tenant purge erases turn records only through a door the trigger admits, after the export returns them; each turn's chained audit row stays (`…/2026-10-01-erasure-and-grants/`). A review-thread comment on the Review surface is fixed once posted. A retraction is recorded, and every comment and retraction commits with its chained row. The GDPR erasure keeps review comments as part of the review record (`…/2026-10-01-review-comments/`). 2026-10-01: a Vault version is sent for review, reviewed and approved in the Vault, each sign-off an e-signature with the signer's own reason, bound to the version's bytes. The uploader, whoever sent it and the reviewer cannot approve it. Approving v2 supersedes v1 in the same transaction, and an approved version's details cannot be edited (VR-13, `docs/evidence/D5-VAULT-APPROVAL/2026-10-01/`). Every stored Vault version can be re-proven against its recorded SHA-256 on demand, each verdict a chained `vault.document.fixity` row (`docs/evidence/D5-VAULT-FIXITY/2026-10-01/`); its schedule is owed by the jobs lane. The deletion archive is deployed, append-only, tenant-scoped and erased by the tenant purge (critique 13, `docs/evidence/D5/2026-10-01-vault-archives/`). 2026-10-08: a filing section is approved only by the approver's signature. The Authoring approval (`/e-sign` as APPROVER, or the `/sign` that clears the last workflow step) moves the bound sections whose filing text is the text signed to `approved` in the signature's transaction, recorded through `recordGovernedAction`; any other meaning, and a `/sign` that decides no workflow step, moves nothing, and a rolled-back signature leaves them as they were. Text that is not the signed text does not stay approved: a save or a section PATCH that changes an approved section's text moves it to `drafted` and records the withdrawal; a locked section is not written. The old-store section PATCH refuses `approved` and `locked` with 409 `APPROVAL_REQUIRES_SIGNATURE`, and a save with text moves `todo` to `drafted` (spine F1, `docs/evidence/D2-ONE-ANA/2026-10-08/spine-f1-section-status/`). Owed: the KMS key, one live signed release, the production verifier run* | `AUDIT_HMAC_KEY` and `MFA_ENCRYPTION_KEY` in KMS; a KMS-backed signer behind the existing signer seam; the second non-compliant signature route deleted; audit-chain verifier run on production and its output filed. | Verifier output; route deletion commit | Claude |
| **D6** Security posture — *policy set, SIG-Lite questionnaire and trust statement drafted; AI gates fail closed in production (`docs/evidence/W3b/`, `W2/`). 2026-09-23: three sign-in defects closed, each reproduced on real PostgreSQL as the non-superuser role before its fix (VSR-001 §13.9). `/api/users/login` issued sessions without the second factor (MFA bypass). Logout never ended a session (July audit AUTH-03). The enterprise sign-in recorded nothing. Later on 2026-09-23 (`docs/evidence/D6/2026-09-23/`, VSR-001 §15), each shown failing on real PostgreSQL before its fix: a TOTP code, an emailed code and a reset token are each accepted once, including under concurrency; the session states the account's real second factor; the client address in signature and audit rows is the one the load balancer saw, never the one the client wrote (`ci:client-ip-single-source`); a session alone can no longer replace an enrolled authenticator (F-26); the TOTP secret no longer reaches a third-party QR service; reset links are never built on the request's Host. W3, same day (VSR-001 §16), each shown failing first: a suspended or deprovisioned account signs nothing, cannot sign in, and every session it holds ends (F-28, F-29; OQ-PROJ-18); a wrong factor at signing counts against the account, and an unreadable lockout refuses (F-27, F-30); each user behind the load balancer has their own sign-in allowance (F-24); a platform administrator reaches Master Administration on the platform role alone (F-31). Closed 2026-09-26, on both sign-in doors: a recovery code is redeemable once at the login challenge, and an authenticator account cannot finish sign-in with an emailed code (`fdc1e53e4`, `e93c7878f`, P1-38 `fc5f5d31f`; re-run 2026-10-01, 8/8). 2026-10-01 (`docs/evidence/D6/2026-10-01-purge-signed-tenant/`): the tenant purge completes on its real table list for a client that has done real work. It had failed for every client with a project, because workspaces were deleted before projects, and for every client with a signed or locked artifact, because those records refused the cascade. The signatures are erased through a database door; each signing's chained ledger row stays. The ALB reachable from the internet is fixed in Terraform 2026-09-24 (W2 B9, `docs/evidence/W2/2026-09-24-b9/`): CloudFront alone, `TRUST_PROXY_HOPS=2`; live once D1 is applied. 2026-09-28 (`docs/evidence/D6/2026-09-28-owner-grant/`, shown failing first and live): the platform-owner grant no longer names an address in source. It is decided inside platform administration, so it never exceeds what the Master Administration guard admits, and a single-sign-on e-mail never earns it (finding 43; INF-27, master-admin half). Closed 2026-10-01 (`b221cd641`): Terraform passes both owner allowlists to the container (`terraform/stack/main.tf` `owner_environment`, from `platform-owners.auto.tfvars`), and first-run setup needs the deployment's `SETUP_TOKEN` in production. 2026-10-05 (`docs/evidence/D6/2026-10-05-ci-and-gates/`, `2026-10-05-pm-decisions/`), each shown failing first: fifteen CI gates no longer read string literals as comments and skip the code after them; the tenant data return withholds credential material (OAuth tokens, gateway credentials, session keys), with a schema-wide guard against a new unclassified one; four org-keyed tables, client gateway credentials among them, are now reached by the tenant purge; Security Scan is green in CI (run 37252785865), and the full-history secret scan, run locally with CI's own command, finds no unrecorded credential (CI confirmation pending its runner backlog). Owed by the founder: revoke the two Neon owner passwords and the Hugging Face token committed to history (P0-17; runbook in `2026-10-05-pm-decisions/`). Owed: SOC 2 platform, pen test, Anthropic BAA, signatures* | SOC 2 Type II observation window open on a compliance platform; third-party pen test with findings closed; standard security questionnaire answered; Anthropic BAA signed; per-tenant data-retention and residency statement published. | Pen-test report; questionnaire; trust page | Claude + founder (subscriptions, signatures) |
| **D7** One real sequence — *engineering half closed 2026-09-20: one AS2 transport for ESG and ICSR, typed refusal for the unverified REST path, PDF/A OutputIntent fixed (`docs/evidence/W5/`). 2026-09-24: the FDA regional backbone no longer defaults the application type to NDA or codes an IND as an IND safety report. It states the identity it was given or refuses to build (F-38, VSR-001 §17). 2026-10-22: the IND reference lane (WO-9, BX-512) was clicked end to end at head on a deploy-shaped database, and a later Vault version now files as a `replace` of the version on file (P-42; `docs/evidence/W5/2026-10-21-ind-reference-lane/`). The DTD hosts are still refused by the environment's egress policy (403 on CONNECT to www.fda.gov and admin.ich.org, one attempt each). Owed: DTDs and other agency artifacts (downloads refused by the sandbox proxy), agency accounts, the test submission* | eCTD DTDs vendored (B3); external validator seam live or FDA-criteria fallback declared (B4); ESG transport gap closed (B16); one test sequence accepted by FDA's test environment for a real sponsor with the ack chain filed. | Ack chain; preflight 15/15 | Claude builds; founder holds accounts |
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

**Amended 2026-10-22 (NEW-1 of MR-03, decided under the CPO mandate): removed, not kept at zero.** The worker's ECS
service, task definition, log group and ECR repository are deleted from `terraform/`, with every variable and output
that fed them. Kept at zero, they were a hazard rather than an option. The task definition named no command, so one
change of `worker_desired_count` (whose production default was still 1) would boot a third copy of the API server,
outside the load balancer, from a repository nothing pushes to. Since MR-08 Stage 1 that copy could not boot anyway: a
production process with no scanner beside it fails the boot self-test. Nothing user-facing is removed. Background
work runs in the API's own schedulers (`server/index.ts`, `server/startup/services.ts`), once per window across tasks
(`server/db/scheduledOnce.ts`; `tests/db/scheduled-once-lease.dbtest.ts`, `scheduled-once-window.dbtest.ts`). A
worker that returns under this decision's condition comes back as a new service with its own entrypoint, its own
command and its own evidence, not by raising a count. `terraform/stack/tests/boot_contract.tftest.hcl` asserts one
service and one repository. Evidence: `docs/evidence/MR-03/2026-10-21-stage-1/`.

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
- The New Project wizard records an active client-workspace choice, with its name on Configure and Review
  (PM-05, 2026-10-23; [evidence](evidence/D2-PM-CLIENT-INTAKE/2026-10-23/README.md)). With several active workspaces,
  intake requires an explicit choice (409 if missing), even with an organisation default; a sole active workspace
  remains compatible. The project anchor, dossier/submission links and audit commit together under that parent.
  This controls placement and preserves the existing project-sharing policy, including organisation-public visibility;
  it creates no client-portal or sharing grant. Legacy anchor callers retain their existing default-marker policy.
- When a backfilled program's recorded creator is not a user id, its project owner is left empty. Ownership grants
  access, so it is not inferred.
- The demo seeds use the code BX-204 for two different products. The seed's dossier-map project gets its own code;
  demo data must not depend on a code collision.

The bounded PM-06 maintenance extension (2026-10-23; [evidence](evidence/D2-PM-SETTINGS/2026-10-23/README.md))
reaches the existing program-profile writer from Project home for description, priority and recorded target date.
Current lead/organization-manager authority, a current-row revision and a stated reason protect the change; its
chained audit commits in the same transaction. Concurrent/stale edits refuse, and uncertain outcomes require a
fresh read. Target maintenance does not regenerate milestone plans or change actuals, approved versions or ownership.

2026-10-30, the existing Author-side Memory and Instructions cards reach the saved project intelligence profile
through the current UUID/actor/anchor/client access path ([evidence](evidence/D2-PM-RECORDED-CONTEXT/2026-10-30/README.md)).
They distinguish recorded notes from verified evidence and profile instructions from authored instructions/skills.
The existing AnA profile formatter also uses recorded risk/decision fields rather than invented severity/status.
This bounded completion adds no instruction precedence, profile writer, provider or launch-row green claim.

### P-20 — A safety report never infers what nobody stated

The onset date is stated either as a date or explicitly as unknown; a blank is refused. When expectedness is not
recorded, the expedited-reporting verdict is "not determined: expectedness not assessed", never "not reportable". A
missing determination produces no verdict at all, so it cannot become an unsent 15-day report.

Follow-up decisions on P-20, from the second IND pass (`d155ef099`):
- "Not determined" applies only where expectedness decides the outcome. An event recorded as non-serious, or as not
  suspected, is not expedited on those stated facts, and the verdict says so.
- Every IND submission carries a Form 1571, under 21 CFR 312. A continuing IND sequence is held to its 1.1 form even
  though it is not held to the original's Module 1 list.
- Save to dossier for a program with no project record answers 409, not 200 with `governed:false`.
- No screen matches a program to an application by name, including Dispatch readiness.
- The sponsor address and IND type are stored on the program, in additive columns under Rule 1. Today they are sent
  with each build.

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

Follow-up decisions on P-25, from the account panel (`e6fbacf33`):
- A person's name stays read-only in the panel. It is printed on their future signatures, and the route that writes
  it validates nothing and leaves no audit record.
- `GET /session` names no organisation when the session has none. It must not fall back to "Concept2Cure".
- Now that enrolment exists, ADR-0014 P1-2b is enforced for electronic signatures in production. A signer with no
  authenticator is refused, with "Enrol an authenticator in Account to sign. Nothing was signed."
- Wrong codes at `/mfa/enable` and `/mfa/disable` count against the per-account limit, as at `/mfa/verify`.
- `authService.updateProfile` points at a route that does not exist, and is removed.

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

Follow-up decisions from the second Submission Center and IND/reporting passes (`d5176f241`, `aac603a1b`):
- **Registers.** The 16 research-compliance registers stay on the canvas, labelled organisation-wide, until each
  becomes a compliance-report definition, sealed and chained like the eight Part 11 reports. They are never left
  unreachable.
- **Trace finalisation.** A trace finalises at 70% measured provenance completeness. Machine-drafted text counts as
  having a recorded origin, as on Authoring's bar. Review state is a separate fact.
- **Pack copy.** A pack's description names only the reports it computes.
- **Form 356h.** Every submission to an NDA, BLA or ANDA carries a Form 356h, so a continuing sequence of those
  types is held to 1.1, as an IND sequence is to its 1571.
- **Protocol reviewers.** A protocol reviewer is assigned only if they hold signing authority, so an assignment
  cannot end at a 403.
- **EU application numbers** are recorded in dash form, as the export and package spine already require.
- **Malformed requests.** A request refused before anything is read voids no signature. Only a refused act does.
- **Report finalize** keeps one authority check: the ceremony's floor. The route's own copy is removed.

### P-27 — Only a person with signing authority signs, and a package carries only recorded identity

From the third Submission Center pass (`b86baf55e`):
- **AnA's e-signature tier requires signing authority.** A member or manager cannot place a document in the dossier,
  revert to a version or submit a document through AnA. Placement through the authoring route is not a signature and
  stays open to authors.
- **Task sign-off on an approval-gated task requires signing authority.** Members and managers are refused.
- **An inspection copy needs a recorded application number.** Until FDA assigns one, an IND's compile fails and says
  why. It does not print a placeholder.
- **The applicant's D-U-N-S number is recorded on the organisation.** A package that needs one is refused without
  it. Until that lands, packages on the sequence path still write `UNASSIGNED-ORG-n` there. That is a known gap,
  tracked as a follow-up.
- **AnA's `package_ectd_for_region` takes the sponsor and application number from the package-identity engine, not
  from model input** (Rule 2). The dry runs (packageability check, `assemble` dry run, orchestrator validation) may
  keep placeholders only because they produce no package. Their output says it is a dry run.
- **One signing-authority policy.** The remaining inline checks (`actions.ts` `signingAuthorityRefusal`,
  `cmc-signer`, and others) move onto `checkSigningAuthority` and are deleted.

Follow-up decisions from the P-27 pass:
- **Signed orchestrator snapshots made before P-27** keep the placeholder applicant inside their signed `index.xml`.
  They are not altered, because a signed record is never rewritten. The signed-package export marks them as not
  submittable. That is a follow-up.
- **An orchestrator run signs only against a recorded submission** whose project's application number matches the
  run's. Without one, a run validates as a dry run and cannot be signed.
- **The MDR/IVDR technical-file assemble and the `submission-ops` package spine** still write placeholder identity
  into real output. They move onto `package-identity.ts` next.
- **The signature record carries the membership role that authorised it**, not the role on the request. A follow-up
  in `esignature` and `document-lifecycle`.

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

### P-28 — CMC / Module 3 ships in the launch catalog, with a composition boundary

Under the founder's delegation of 2026-10-07, and the instruction to decide on client need and platform
readiness. CMC / Module 3 is the eighth launch app (`shared/constants/launch-scope.ts`). An IND without
Module 3 is not an IND, and nothing downstream had ever asked whether the CMC work was done: Projects opens a
"Draft IMPD / CMC (M3)" task for every IND programme, and a sequence carrying Module 1 alone read
dispatch-clear.

**What ships.** The registers (substance, product, methods, specifications, batches, stability, process
validation, change control, comparability, QbD), one deterministic compile, the contradiction sweep, the
fail-closed final-export gate, Part 11 section approvals, governed placement into the program's own IND
sequence, and the Module 3 audit chain. Numbers come from the engines; the model narrates.

**What it refuses, by name, with a 409** (`services/cmc/composition-scope.ts`): a biologically derived or ATMP
substance — ICH Q6B, Q5A(R2) and Q5C are not modelled and Q3A was being applied to biologics; a program the
person recorded as anything but a drug; an NDA, ANDA, BLA or MAA — the 3.2.R location statements are false for
a marketing application, there is no §3.2.S.4.5 / §3.2.P.5.6 justification, and 4-level granularity is
required; an EU or Health Canada CTA — an IMPD Quality part is not CTD Module 3; a Japanese CTN or J-NDA. Each
refusal names Document editor & authoring, Vault (DMS) and the Submission center.

**Entitlement is unchanged.** The app lists its surface and **no module**. A launch app's surface list lifts
the launch-scope lock and `applyLaunchScope` never widens a verdict, so the professional band the product
owner set on 2026-08-24 (`db/migrations/20260824_cmc_professional_tier.sql`), with its grandfather grants,
still decides who holds the module. Listing the module would have `provisionLaunchModules` write an explicit
grant for every new organisation, and a grant outranks tier permanently — overturning a pricing decision as a
side effect of a scope list. Pricing stays the founder's call.

**What is withheld.** The change simulator and the "Filing path by market" matrix are hidden, not deleted:
they are a client-side lookup that contradicts the server classifier and uses post-approval categories that
are wrong for an IND. `POST /api/cmc/variations/classify` and
`GET /api/cmc/projects/:id/process-capability` stay unclaimed — deterministic and sound, but no screen calls
them. An interview whose answers reach no record (protocol, CSR, 510(k), CER, SOP, NDA, BLA) is refused at
`start_intelligence_flow` where the boundary is enforced, because only the CMC specification flow commits.
Calling what CMC produces a "fileable, DTD-valid eCTD Module 3 sequence" is withheld until D7's F00/F02 land,
and calling it "validated" until OQ-008 executes in the W3 posture beside IQ and OQ-001…007 with a named
expert's signature on the reference-record verification.

**What this decision does not do.** It does not write OQ-008. The requirements
are specified (`docs/validation/URS-007-CMC-MODULE-3.md`, 20 requirements with
their sources), but `ci:validation-traceability` refuses a protocol that names
no runner — correctly, since a protocol its runner does not implement is not a
protocol — so no OQ-008 document is filed ahead of one. OQ-007 for Reporting &
analytics does not exist either, so "OQ-001…007" above names a set that is not
yet complete. Both are owed for row D4, with the runner, the local execution
and the expert's signature.

Evidence: `docs/evidence/D2-CMC-LAUNCH-APP/2026-10-12/`, and the slice records under
`docs/evidence/CMC-M3-GA/`.

### P-32 — The IND lifecycle and forms tools are features of Submission Center; agency questions follow when their approval is signed

Decided 2026-10-15 under the founder's delegation ("take them all yourself"), on the proposal in
`docs/design/WORKFLOW_DECISION_2026-10-08.md` §1 item 1. The beta sells the next sequence on a US commercial
IND; an amendment needs its 1571, its cover letter and, often, a Letter of Authorization, and the engines
that build them were behind a locked surface.

**What opens.** The `ind-checklist` (IND lifecycle and forms) surface joins the Submission Center app's
surface list (`shared/constants/launch-scope.ts`). **Modules are unchanged**,
as in P-28: a surface list lifts the launch-scope lock; listing a module would write a grant for every new
organisation and outrank the tier the product owner set. Only the API paths those screens call are claimed:
the `/api/ind-lifecycle` cover letter, briefing book, Letter of Authorization, right of reference, annual
report, amendment and 30-day clock routes; `/api/ind-forms`; `/api/ind-checklist`. Each claimed path has a
screen caller, which a test pins. The screen computes no verdict of its own: readiness is the verdict
`GET /api/ind-checklist` returns (computed by `evaluateIndReadiness` over the section state and lifecycle
issues), and the 30-day clock is `POST /api/ind-lifecycle/clock`; the browser copies of both engines are gone.

**Agency questions (`haq-manager`) stay locked, amended 2026-10-15 on implementation.** Approving a response
there records a status change with no Part 11 signature, reason or role check, and the response package to the
agency is assembled from those approvals. It opens when approval is a signed act. Answers to agency letters
are also third in the beta's job order (`WORKFLOW_DECISION_2026-10-08.md` §1). Its claim is narrowed to the one
prefix it calls and its catalog copy no longer says "signed".

**2026-10-18: approval is a signed act, on the project inbox (rows D2, D5).** The questions on an agency letter
are now `agency_communication_questions` on the project's inbox, worked in Communication and Project home's
Respond, both already in the catalog. A response is approved through the one signing ceremony
(`governed-signed-act.ts`), by someone other than its author, and the signature binds the question and the exact
response text (`agency-response-content-sha256`); approval is read from the signature table, so an edit after
signing ends it. The response package assembles only when every response is approved, through the audited export,
and a letter with recorded questions closes only then. Commitments made in a response name their letter and
question. The `/api/haq-manager` store is deleted; the `haq-manager` screen is a view of the same inbox, claims no
prefix and stays outside the catalog. Opening it as a second home is a catalog decision, not taken here.
Evidence: `docs/evidence/D2-CORRESPONDENCE-SIGNED-RESPONSES/2026-10-18/`. Map of the remaining RIM gaps and
duplicates: `docs/design/RIM_GAP_ANALYSIS_2026-10-18.md`.

**What stays shut, by name.** 15-day safety reporting and ICSR transmission (21 CFR 312.32): every
`/api/ind-lifecycle/safety-report*`, `/safety-reports*` and `/icsr-transmissions*` route is claimed by an
out-of-scope pharmacovigilance surface, so it is refused 403 `LAUNCH_SCOPE` even when unattributed paths are
only reported. The IND screen's safety-report card is hidden, not deleted. `/api/ind-master-data` has no
screen caller and is not claimed. The `/submission/:id/*` register routes stay unclaimed: a prefix cannot
admit them without admitting the safety routes beside them.

### P-33 — One dispatch verdict per sequence; Submission Readiness is that verdict, inside Submit

Decided 2026-10-15 under the same delegation, on `WORKFLOW_DECISION_2026-10-08.md` §1 item 2 and §4 Q3.
Agencies and buyers care whether the sequence passes, not what the screen is called. Submission Readiness
remains a catalog and entitlement entry; what it shows is the one verdict `assessSequenceDispatchReadiness`
computes, which the Submit tab and the Submission Center render.

`server/services/ind-lifecycle/ind-dispatch-gate.ts` is merged into the assessor and deleted. What it
checked and the assessor did not, and how each is carried:
- **A cross-reference with no Letter of Authorization on file** blocks, for every sequence of the IND, as
  the IND gate did.
- **An overdue IND safety report** is a warning, never a block: FDA does not refuse an amendment for a late
  safety report, and a safety-report sequence is never refused for its own lateness.
- **A clinical hold** (21 CFR 312.42) is stated as *not assessed* on every US IND sequence, visibly and
  without blocking. Nothing on the server records a hold, and the IND gate read it from the request body,
  so it blocked every sequence its caller did not describe — including the complete response that lifts a
  hold (312.42(e)). When a hold register exists, an active hold blocks dispatch of anything but a response.
- **Continuing-sequence completeness** (1.2 and the content the sequence type requires) comes from the same
  `validateSequenceLeaves` the IND routes used, not a copy.
- **Not carried, on purpose:** "already dispatched" (transmit requires a dispatched sequence with a clear
  gate, so it would make transmit unreachable) and "missing checksums" (the governed leaf route cannot set
  the column and the packager computes checksums from the bytes, so it would refuse every sequence the
  product builds).

The IND routes keep their paths and answer from the one assessor. A dispatch snapshot records which gate
produced it, so cockpit drift does not report every old row as drifted.

### P-34 — Shadow Review stays a dispatch gate, with a signed human waiver for a provider outage

Decided 2026-10-15 under the same delegation, on `WORKFLOW_DECISION_2026-10-08.md` §1 item 3. A
never-reviewed dossier is not cleared for dispatch, and an AI outage must not stop a regulatory deadline.

- A waiver is offered only when the sequence has **no completed Shadow Review**, and its **newest run failed
  because every AI provider failed or was overloaded**, recorded on the run as a closed failure code within
  the last 24 hours. A model reply that was not an assessment, a governance or placement refusal, a rate
  limit and "no provider configured" are not outages and are never waivable.
- The waiver is a Part 11 electronic signature on the sequence (`ectd-sequence:<id>`, intent
  `shadow-waiver`, meaning responsibility or approval) with its own reason, by a person with signing
  authority who did not author the sequence. It is used once, binds the leaf manifest it was signed over and
  **lapses when the leaves change**; a revoked or lapsed waiver blocks with its own sentence.
- **It never waives an unacknowledged critical finding.** It answers only "no review has run".
- The verdict shows the dispatch as cleared *not assessed by Shadow Review*: who waived it, under which
  signature, because of which failed run. The waiver, the failed run and the freeze and dispatch that rely on
  it are each in the audit chain.
- No AnA tool can waive.

### P-35 — A critical Shadow Review finding is closed by a named person's signature, never by silence

Decided 2026-10-15 under the same delegation, found while implementing P-34. The dispatch gate blocks on
every open critical Shadow Review finding across every run of the sequence, and nothing in the product could
ever close one: the finding's status column had `accepted`, `fixed` and `waived` in its vocabulary and no code
that wrote them. One critical therefore blocked a sequence for ever, even after the sponsor fixed the issue and
a later review found nothing.

- Each open critical finding is dispositioned on its own by a Part 11 signature on the sequence
  (`ectd-sequence:<id>`, intent `shadow-finding-disposition`, the finding named in the payload), with the
  signer's reason, by a person with signing authority who did not author the sequence:
  - **Risk accepted** (`accepted`): the finding stands and the signer accepts going forward with it;
    meaning approval or responsibility.
  - **Fixed** (`fixed`): the signer states what changed. Offered only when a completed Shadow Review ran after
    the finding's run; it does not need to be the clean one, because a model's silence is not proof.
- A later review never closes an earlier critical by itself. The disposition, its signature and its reason are
  in the audit chain and on the finding; the readiness view names who closed each critical and how.
- No AnA tool can disposition a finding. A non-critical finding is not gated and is not part of this act.

Each of P-32 to P-35 lands failing-first with its evidence under `docs/evidence/D2-FOUNDER-DECISIONS/2026-10-15/`.

### P-36 — Submission Readiness is a Submission Center screen, not an app

Decided 2026-10-17 by the founder, from the app audit of that day (`docs/evidence/D2-APP-AUDIT/2026-10-17/`).
The readiness screen reads the same per-sequence verdict as Submission Center's Validation and Dispatch tabs
(`/sequences/:id/dispatch-readiness`), and P-33 already shows that verdict inside Submit, so a separate app gave
one verdict two homes. The launch catalog goes from eight apps to seven: the `dispatch-readiness` surface and its
module move into Submission Center unchanged. The surfaces a client can reach and the modules a new organisation
is granted are the same sets as before (`server/services/entitlements/__tests__/launch-scope.test.ts`). The name
stays as a catalog and entitlement entry. The left rail is not changed: the founder kept Home, Apps catalog,
Tasking and Communication on it (request of 2026-10-16, reconfirmed 2026-10-17).

## Product decisions, 2026-10-18 (under the founder's delegation of that day)

The founder, on the open questions of `docs/design/RIM_GAP_ANALYSIS_2026-10-18.md`: "I will follow you guidance
and SME level intelligence and allow you do make these product level choices." Each is decided on what the launch
customer files (P-28: a sponsor composing small-molecule Module 3 for a US IND) and on Rule 2.

### P-37 — Regulatory information management at launch is the IND sponsor's RIM; registrations, labels and a multi-region planner wait for a marketing application

In the launch catalog, and finished in this order (gap analysis, "Next in-catalog work"): correspondence with the
agency and the signed answer to each question (P-32), the commitments made in those answers and their fulfilment,
submission assembly and the eCTD viewer Submission Center already has (`EctdCompile.tsx`, completed, not
rebuilt: CLAUDE.md RULE 3), and the dossier templates the project wizard
scaffolds.

**Not in the launch catalog: registrations and labels** (`server/routes/rim.ts`, `rim_*`). A launch customer holds
no marketing authorisation and has no approved label: the register would be empty for every one of them, and the
signed label approval would have nothing to approve. `migrations/20260610_rim_lite.sql` stays off the deploy path
and no session builds on it. **Not in the launch catalog: a multi-region submission planner.** P-28 refuses a non-US
clinical-trial application by name, so a plan across markets has one market. Both are reopened together with any
widening of the P-28 boundary to a marketing application or a non-US application, which is the founder's decision.
**A workflow designer** is new capability under Rule 2: the platform's governed acts (signatures, reasons, the
ledger) are fixed and validated, and a configurable one would need its own validation for every configuration.

### P-38 — Agency questions have one home: the letter they came in

`haq-manager` does not reopen as a screen. P-32's condition is met (approval is a signed act), but the same record
is worked on the letter, in Communication and in Project home's Respond, and a second screen would give one
capability two homes (the P-36 reasoning). Its catalog entry keeps no API prefix; the HAQ view inside Communication
reads the project inbox.

### P-39 — The duplicate correspondence and commitment stores converge in this order

Each store moves onto its canonical record and is retired in the same change (zero duplication), with the
deletion record the working agreement requires:

1. **`reg_questions`** (`/api/cmc/agency-questions`), onto `agency_communication_questions`. It is the one inside a
   launch app (CMC / Module 3), and closing a question there is a status update, not a signature.
   *2026-10-19:* converged, and the file made read-only rather than retired: CMC reads a program's Module 3 questions
   from the letters and opens each on its letter, writing none; `/api/cmc/agency-questions` answers 410 to a write and
   the database refuses one (`migrations/20261019b_reg_questions_read_only.sql`); its rows stay as history. The act
   that moves a row not closed there onto a letter is owed, deferred until a deployed estate shows such rows
   (`docs/evidence/D2-CMC-QUESTIONS-ONTO-INBOX/2026-10-19/`).
2. **`c2c_commitments`** (`/api/c2c/commitments`), onto `regulatory_commitments`: an AI extraction with an
   ungoverned create.
   *2026-10-29:* converged. The routes and the service had no client, no AnA tool and no MCP tool, and launch scope
   refused them in production; they are deleted. The table is read-only, and its rows stay as history
   (`migrations/20261029i_c2c_commitments_read_only.sql`). Recording a commitment and moving its status were already
   governed on `regulatory_commitments`. The model extraction is not carried over (RULE 2; G3's no-model rule)
   (`docs/evidence/D2-COMMITMENTS-CONVERGED/2026-10-29/`).
3. **The `c2c_correspondence` family** (`/api/regulatory-correspondence`), onto the project inbox, keeping its issue
   parser and response clock as the inbox's.
4. **`haq_session`**, **`lifecycle_obligations`** and the **`c2c_agency_meetings`** minutes, onto the inbox,
   `regulatory_commitments` and `ha_interactions` respectively.
   *2026-10-30 (under the founder's delegation; inventory in
   `docs/evidence/D2-HAQ-SESSION-RETIRED/2026-10-30/`):*
   - **`haq_session`: converged.** No client has called it since 2026-05-01. Its PUT was reachable in production and
     rewrote a session in place with no reason and no ledger row. `server/routes/c2c/haq-sessions.ts` is deleted, as
     `HAQ_SIGNED_ANSWERS_2026-10-15.md` §3 laid out, and `GET /reviews/pending` moved verbatim to `reviews.ts`. The
     rows stay as history. They are not moved: a session names no letter and the inbox does not invent one, and its
     model drafts and unsigned "finalized" statuses do not carry over (RULE 2).
   - **`lifecycle_obligations`: deferred, and the destination corrected.**
     - Its tables are on no applier, so no deployed database holds a row. Its route and surface are outside launch
       scope.
     - `regulatory_commitments` cannot hold a recurrence or its dated occurrences, so converging onto it would lose
       the capability.
     - It converges when post-approval lifecycle (variations, periodic reports, renewals) enters the catalog, onto a
       register that can hold a recurrence.
     - Owed by the Reporting lane: the `lifecycle.obligation_calendar` report reads these tables, so on a deployed
       database the run fails (an error, not an empty calendar). Install the tables or withdraw the report type.
   - **`c2c_agency_meetings` minutes: no data to move, and decided.**
     - Nothing in a deployed organisation writes them, and the route and surface are outside launch scope.
     - When Communication records a meeting (`ha_interactions`, whose governed create exists), its minutes are an inbox
       letter (`source_type` `meeting_minutes`, already in the vocabulary) linked to the interaction. Its agreements
       and commitments become that letter's questions and `regulatory_commitments` (`meeting_commitment`).
     - `c2c_agency_meetings` and the Agency Meetings surface retire in that change.
     - *2026-10-30:* Communication records and moves meetings, admitted by the meeting's project
       (`docs/evidence/D2-MEETINGS-IN-COMMUNICATION/2026-10-30/`). A meeting names its minutes letter
       (`ha_interactions.minutes_event_id`; `docs/evidence/D2-MEETING-MINUTES-IN-INBOX/2026-10-30/`).
       `c2c_agency_meetings` is read-only with its rows kept, and its routes and surface are deleted; `agency-meetings`
       is an alias to Communication (`docs/evidence/D2-AGENCY-MEETINGS-RETIRED/2026-10-30/`). Step 4 is done but for
       `lifecycle_obligations`, deferred above.

### P-40 — A sealed editing copy is revisable, and the refusal says so

Decided 2026-10-19 under the founder's delegation of 2026-10-13 (document creation and editing).

A QMS register entry at `draft` whose bound editing copy had been frozen or approved could go **nowhere**. It
could not be sent for review — correctly, because `decideAuthoringPermission` refuses an edit of an immutable
document ahead of every grant and bypass, which is what keeps the freeze meaningful. And it could not be revised:
`reviseControlledQmsDocument` admitted `effective`, `retired`, `superseded` and `in_review`, not `draft`. There is
no unfreeze anywhere (a freeze is the platform's one signing ceremony, DP-35 / P1-32) and no new-version route on
the authoring side at all, so the frozen message's own remedy — "Create a new version to make further changes" —
had nothing behind it.

**A `draft` whose editing copy is sealed is revisable, and nothing else about `draft` is.** A revision is what
"create a new version" means here: the sealed text is copied onto a new editing copy, the version is bumped, the
old document id is retained in `metadata.retainedAuthoringDocuments`, and the seal and every signature over it are
untouched. The condition is the seal, because without it this would be a free version bump on any draft — a new
door, not a remedy.

**The refusal names it.** `requireContentAccess` collapsed every permission outcome into 403
`QMS_DOCUMENT_PERMISSION_DENIED`, "You do not have permission to read or change this authored document" — said to
the owner-administrator of a sealed document, which is false and names no way forward. The decider already returns
`document-immutable` separately; that is now a 409 `QMS_DOCUMENT_SEALED` which says the text is sealed and points at
the controlled revision. Naming a remedy that did not exist would have repeated a mistake this lane had already
made once, so the two halves ship together.

**What was NOT changed, deliberately.** The seal still refuses the send-for-review and the rename; `IN_REVIEW`
remains a non-sealing status, because review is a state a document is edited during and the review board finds its
work by `upper(d.status) = 'IN_REVIEW'`. The two disagreeing definitions of which statuses seal content —
`LOCKED_DOCUMENT_STATUSES` (two) in `document-lock.ts` against `IMMUTABLE_DOCUMENT_STATUSES` (eight) in
`authoring-permissions.ts` — are recorded as open, not reconciled here: both are load-bearing in different places
and each list has mutants that open a real hole.

### P-41 — A PMR, PMC or REMS is recorded fulfilled by a signature that names what met it

Decided 2026-10-19 under the founder's delegation of 2026-10-18. Recording a postmarketing requirement, a
postmarketing commitment or a REMS as fulfilled takes the obligation off the overdue register and out of the annual
status report (21 CFR 314.81(b)(2)(vii), 601.70; FD&C 505(o)(3), 505-1). It is an attestation, so it is a Part 11
signed act, as the platform's comparable acts are (label approval, a QMS document becoming effective, the Shadow
dispositions of P-34 and P-35, an agency response's approval under P-32): meaning approval or responsibility, the
signer's reason, password and second factor, through the one ceremony (`server/routes/governed-signed-act.ts`
signGovernedAct). The signature names the dispatched sequence the agency received (sent or acknowledged), or the
Vault version that met it at its sha256, or both, and the date, and binds them
(`BINDING_BASIS.COMMITMENT_FULFILMENT_CONTENT`). The database holds it: a fulfilled PMR, PMC or REMS commits only with
such a signature written by the same transaction, by the person recorded, over the same evidence and date; a
commitment's type never changes, so a PMR cannot be retyped out of its signature; and a recorded fulfilment cannot
change or be hidden by an UPDATE (`migrations/20261019_commitment_fulfilment_evidence.sql`). It does not hold the
record against a hard DELETE by the runtime role, which the tenant purge needs; a delete guard needs a purge door
with it.
A meeting commitment or other is fulfilled by a governed write with a reason; what met it may be named. AnA cannot
sign, so its fulfil tool refuses a PMR, PMC or REMS and points to Communication, Meetings & commitments. There is no
separation of duties: the signer attests to the record, not to another person's work. Correcting a fulfilment
signed in error (§11.70 supersession, or a reopen) is owed. Evidence: `docs/evidence/D2-COMMITMENT-FULFILMENT/2026-10-19/`.

### P-42 — A later Vault version files as the `replace` of the version on file

Decided 2026-10-22 under the founder's delegation of 2026-10-18. It closes the question WO-9 §20 left open (D7, Click
6): how a revised document reaches a follow-up sequence as an eCTD `replace` of what was filed. A declared replace
bound to the filed leaf by section plus file name, and a Vault version's file name carries its own uuid, so version 2
of a filed document never matched version 1's leaf. Declared `replace`, it was left out ("no filed leaf named … to
supersede"). Placed as `new`, it shipped beside the filed version, and the agency would have held both as current.

**The recorded lineage is the binding.** The Vault records each version's predecessor at check-in (VR-08). The
database admits that link only within one document: same program, document code and organization, and one live
successor. A Vault leaf whose own file is not on file in its section binds to the one filed leaf there carrying a
recorded earlier version of the same document. Declared `replace`, or placed as `new`, it files as a `replace`;
declared `append`, it files as an `append`. Either way its `modified-file` names that leaf, and the new version ships
under its own name. A withdrawal naming the current version withdraws the earlier version that is on file. The
folded prior state takes the superseded leaf off file whatever its name, so the next sequence holds only the new
version, and the IND checklist's inventory counts it once.

**Never guessed.** Each of these leaves every version concerned out, named in `skipped`, which blocks transmit:

- two filed leaves carrying earlier versions;
- two versions of one document in one sequence;
- a version beside an act on its own filed predecessor.

A link the database rules refuse is not lineage. Withdrawing the filed version and placing the new one as `new` in
the same sequence is honoured as declared, in either placement order.

**Not changed.** No signature, approval or freeze. P-22 still holds freeze, dispatch and transmit until the leaf
names an approved, current version.

**Still open: authored documents.** An approved authored document is frozen and has no new-version route; P-40 covers
a QMS draft only. A revised authored section therefore cannot be filed as a `replace` of its filed leaf. It is
withdrawn and placed again, which is the decision for the founder with the authoring lane.

Code: `server/services/ectd/version-lineage-binding.ts` and its callers in `package-from-core.ts`,
`prior-sequence-loader.ts` and `ind-checklist-view-assembler.ts`. Evidence:
`docs/evidence/W5/2026-10-21-ind-reference-lane/`.

## Product decisions, 2026-10-22 (CPO, under the founder's mandate of 2026-10-01)

### P-43 — The hosted deployment refuses every operator override at boot; a self-hosted install keeps its written acceptances

The `*_ACCEPT_*` variables (`AUDIT_SEAL_ACCEPT_UNSEALED`, `AI_GOVERNANCE_ACCEPT_PERMISSIVE`, `STORAGE_ACCEPT_LOCAL_DISK`,
`CONCEPT2CURE_SIGNER_ACCEPT_HMAC`, `AI_GATEWAY_ACCEPT_DETERMINISTIC` and any later one) each switch a production
refusal off on the operator's written word. MR-03 SEC-18 proposed refusing them in every production boot. Done
literally, that would stop the canonical self-host install (`docker-compose.yml`, "the install SKU"): with no KMS and
no object store it runs on an HMAC signer and a local volume, and it says so through exactly these variables. The
hosted product never needs one: it has a KMS signer, an S3 vault and a sealed chain.

So the line is drawn by where the process runs, not by `NODE_ENV`:

- **Hosted (an ECS task).** The boot refuses any `*_ACCEPT_*` variable set to anything but `false`, and
  `AUDIT_REQUIRE_ENFORCE=false`. It recognises ECS by `ECS_CONTAINER_METADATA_URI_V4`, which the ECS agent sets in
  every task and a task definition cannot remove. The deploy preflight already refused these by name before a revision
  rolled (`deploy-aws.yml`); the boot now refuses them too, so a revision registered or edited outside the pipeline
  cannot run with one.
- **Self-hosted (compose, Helm, the CI single-container boots).** Each acceptance stays what it was: an explicit
  operator statement in the install's own configuration.
- **Everywhere in production:** `ENABLE_TEST_ROUTES` is refused, like the dev, mock and demo route flags before it.
  Nothing sets it, and test routes have no production use. `AUDIT_REQUIRE_ENFORCE` defaults to enforce: a production
  process whose tamper-proof audit trail is off refuses to boot unless the operator writes `AUDIT_REQUIRE_ENFORCE=false`,
  which only a self-hosted install may.

No CI escape variable is added. The CI boots are not ECS tasks, so they keep working without one, and an escape would
be one more override to guard. Evidence: `docs/evidence/MR-03/2026-10-22-stage-2/`.

### P-44 — A package carries its own market's application number; the project's number is its home market's

Decided 2026-10-22 under the founder's delegation of that day ("You decide and continue"). It answers the open question
of the package-identity rule's owner (`b86baf55`; FILING_SPINE F22): a project records one application number
(`regulatory_programs.application_number`), and every package read it, whatever its market.

That was a live defect, not a hypothetical one. The EU packager writes the number verbatim into `<procedure-number>`,
JP into `<application-number>` and CA into `<dossier-id>` (`regional-packager.ts`). So an MAA added to an NDA project
(F22) would be compiled, exported or transmitted under the US NDA number. AnA's `package_ectd_for_region` did the
same for any region it was asked for.

- **The project's number belongs to its home market**, the market of its primary agency. It is never written into
  another market's package.
- **A submission for another market carries the number its own agency assigned**, recorded on that submission
  (`submissions.application_number`). A home-market submission keeps reading the project's number, so there is one
  source for each number and no second copy of either.
- **Until a market's number is recorded, its packages refuse by name.** This covers compile, export, transmit and
  AnA's package tool. Nothing borrows another market's number. Dry runs keep their placeholder (P-27).
- **The number is recorded by one governed act.** It takes the project lead or an organisation manager, a stated
  reason, a chained audit row that names the old and new value, and the existing identifier rules (`usableIdentifier`;
  six digits when the market is FDA). A home-market submission is refused there: its number is the project's.
- **AnA packages a project's home market only, from the record.** For any other region it refuses and points to the
  submission that market's package is built from.
- Not decided here, and handed to the identity lane (MR-10 Stage 4): `REGULATORY_IDENTIFIER_PATTERN` refuses the slash
  that EMA's `EMEA/H/C/…` form carries, while rule EMA-CESP-002 expects it.

### P-45 — The Planner's multi-region compare (F21's remainder) waits until after D10

Decided 2026-10-22 under the same delegation. F21's remaining part is the Planner calling `POST /api/submissions/:id/plan`
with a "Compare with". The defect F21 existed for, the Cross-region model verdict (a model producing a verdict, Rule 2),
was retired on 2026-10-08. What remains would put a new multi-region comparison in front of a route that has no client
caller at head. That is new capability, and no launch row needs it (Rule 2). An added market's own Module 1 outline
(F22b) is where a filer now sees that market's sections. `WORKFLOW_DECISION_2026-10-08.md` §6 already places F21 after D10.

When it is taken, one rule applies from its design. A region the reasoning engine holds no rules for shows "No rule data
for <agency>" and no sections. Today `buildSubmissionStructure` answers such a region with FDA's sections, discloses
the substitution in a note, and still marks it `supported: true`. AnA's two tools that call the engine read that answer,
so F21's design owns correcting `supported` for a proxied region.

### P-46 — Vault saved views are both personal and organisation-wide; filters and counts are scheduled now

Decided by the founder, 2026-10-22. Asked "Should a saved view belong to one person or the whole organisation?", the
founder answered **"Both"**, in the same session as the direction to close the gap with Veeva ("Continue as we need to
close the gap between what we have and what Veeva offers here"). That direction also amended FD8 in
`docs/design/VAULT_VEEVA_PARITY_PLAN_2026-09-24.md` §5: facets (VR-18) are no longer deferred, and the parity plan's
§6 exclusion of saved searches and views no longer holds for the Vault.

- **A personal view** is seen, renamed and deleted by its owner only.
- **An organisation view** is seen by every member of the organisation. Who may create, rename and delete one is set by
  the saved-views design, which must start from its What already exists section: the one saved-query store today is
  `saved_precedent_queries` (precedent-only, off the deploy path, and editable by any member).
- **A view stores parameters, never results or counts.** It holds the text, the metadata filters the search already
  validates, and whether it is one project's view or the library. A view naming a project or a folder is re-scoped
  when it runs. A project the reader can no longer open contributes nothing, and a folder must still be in that
  project's cabinet. A view can never hold a filter the search would refuse.
- **No fixture or browser-only store.** The deleted views (`ProjectsListFilters`, `AdvancedSearchPanel`) kept views in
  `localStorage` or fixtures. A Vault view is a tenant-scoped server record.
- Filters and facet counts on the one Vault search landed the same day (`docs/evidence/D2-VAULT-SEARCH/2026-10-22/`,
  `…-find-view/`, `…-facets/`).

## Product decisions, 2026-10-25 (founder)

- **Who may change an organisation view (left open above; answered 2026-10-29 by the saved-views design,
  `docs/design/VAULT_SAVED_VIEWS_2026-10-29.md` §3.3, as the founder's delegated product call).** Any member may
  save a personal view, viewers included, because a personal view is a search remembered. Publishing to the
  organisation, sharing a personal view, and changing a shared view's parameters take a writing role and are the
  creator's. An organisation manager may rename or delete any organisation view. The creator may always withdraw
  their own (make it personal, or delete it), even after losing a writing role. A view is a preference, not a
  governed record: no chained audit row, with the creator, last editor and time kept on the row. The day a view
  drives a governed act it becomes a governed record, audited and versioned.

### P-47 — A client starts at their projects; features live in the project, not in an app list

Decided by the founder on 2026-10-25, after testing the product as a client and finding they could not tell how
to use it: "I have no idea what we're doing with apps, what the apps do, how to use them, when to use them."
What was built are features within a client's regulatory project, not separate applications. The design, the
findings and what already existed are in `docs/design/CLIENT_JOURNEY_2026-10-25.md`; evidence in
`docs/evidence/D2-CLIENT-JOURNEY/2026-10-25/`.

- **The left rail** is the five places a client works in (Home, Projects, Tasks, Communication, Vault), then a
  *Work areas* group: CMC / Module 3, Quality, Reporting & analytics. This replaces the rail the founder kept on
  2026-10-16 and 2026-10-17 (P-36's last sentence). Tasking and My work are one entry. Submission Center opens
  from a project's Submit step. The rail starts open, with labels.
- **The module catalog** ("Workflows", formerly "Apps") is **Plan & features**: an organisation administrator's
  licensing view, in the account menu. Its entitlement logic and governed writes are unchanged; Home no longer
  links to it.
- **Home** is where a client starts: their projects, their tasks, Ask AnA, their recent conversations.
- **Risk-based monitoring and Biostatistics** are work areas by the founder's model and join the rail's *Work
  areas* when each is in the launch catalog. Not before (Rule 2).
- **Inside the project** (pass 2, the same day): a project with no documents opens on Evidence; each step states what
  to do now and offers the next step; Author offers CMC / Module 3 and Submit the IND forms for a US IND, each opened
  on the project.
- **Plan** (pass 3, the same day; founder decisions 3 and 4): the project's first step, and where a new project opens.
  It holds what the filing needs — for a US IND every deliverable of the IND plan of work by phase, each started from
  its template, the phases that a feature composes opening it (Module 3 → CMC / Module 3, Module 1 → IND forms); for a
  device filing its workstreams — with **Assign** writing one task for one person with a due date to the one task
  store, then the team and the project's tasks, moved from Author. No new store, catalogue or route.
- **Nothing in the catalogue is lost** (the founder, later the same day): "we must not lose any functionality that
  is in our apps catalog, but take all that and place it in the core product, and get away from calling the needed
  functionality and features apps." Every capability of every catalogue entry gets a home in the product — a place,
  a project step, a document's build, AnA, or administration — and a duplicate is folded into its canonical
  capability only after each of its functions is shown to exist there or is carried over (no retirement by
  deletion). "App" leaves the product's words for these capabilities. A capability is shown to a client in its home
  when it works on the client's real data; until then its home says it is coming, in words (fail closed).

Launch scope, module grants and every route are unchanged by this decision.

### P-48 — The QMS app holds the quality records a biotech keeps: CAPA, nonconformances, suppliers, internal audits, management reviews

Decided 2026-10-29 by the founder ("we need to offer everything www.weave.bio does and much more plus what Veeva
basics offers biotechs"). The QMS app was controlled documents and change control. Veeva QMS Basics also keeps
deviations, CAPA, the approved supplier list, internal audits and management review. The nonconformance register is
product-keyed (a product or material, a lot): a deviation with no product, such as a missed environmental-monitoring
reading, has no record of its own yet, and the QC deviation routes (`server/routes/qc.routes.ts`) are a stub with no
store. Whether deviations get their own record is open to the founder. The routes for all four
were already in `server/routes/mdx-qms.ts`, built with the device QMS. Their tables are on the deploy path
(`migrations/20260511_qms_and_labeling.sql`), they are tenant-scoped, writes need editor access, and every write
records its audit row. No screen called them. The launch scope refused them in production as "HIDDEN APP".

The four become tabs of Quality (`client/src/concept2cure/quality/QmsRecords.tsx`). Their paths leave
`LAUNCH_EXCLUDED_API` and fall under the quality surface's existing `/api/mdx/qms` claim. The catalog entry keeps its id,
surface and module (`qms`, `quality`), so no grant changes. CAPA is reached the same way. Its register already existed
(`server/routes/capa-mdr.ts`, tables `capa_records` and `capa_actions` from `migrations/20260504_capa_mdr.sql`). Its routes
were already in the launch scope through `device-postmarket`, a device-project feature of Projects since 2026-10-23, but
no Quality screen reached them. *(Corrected 2026-10-29: this entry first called that surface hidden.)* The quality
surface now also claims `/api/capa-mdr/capa`, so Quality reaches CAPA for every project type. Complaints, MDR and
vigilance stay with device post-market. The CAPA lifecycle map moves to
`shared/constants/capa-lifecycle.ts`, so the server enforces and the screen offers one set of moves. Evidence:
`docs/evidence/D2-ONE-ANA/2026-10-29/p48-quality-records/`.

### P-49 — Training on a controlled SOP is assigned by role and by name, opens at approval, and reaches the people assigned

Decided by the founder, 2026-10-29, answering MR-12's NEW-2 and NEW-3 and the distribution question in
`docs/design/PARITY_WEAVE_VEEVA_BASICS_2026-10-29.md` §8 item 8 (the recommendations, chosen as offered):

- **Assignment (NEW-2): roles, plus named people.** Each controlled document lists the job roles and any named people
  who must train on it. The organisation manages its own list of job roles; a role is a job function (QA,
  Manufacturing, Clinical Operations), not a permission role, so assigning by role never means "everyone with access".
  Curricula (sets of documents assigned to a role together) can be added later without moving data.
- **Training before the effective date (NEW-3): yes, once approved.** Between approval and the effective date is the
  training period. An acknowledgment of an approved version binds that version's digest and release signature, and it
  counts toward compliance from the moment that version is in force. Nothing counts toward a version that is not yet
  in force.
- **Distribution: the people assigned.** When a version is approved, each person it is assigned to (by role or by
  name) receives a task to read and acknowledge it, due by its effective date. The task uses the existing
  deadline-task infrastructure; there is no second scheduler. Nobody else is notified.
- **Compliance counts the assigned people.** The denominator is the distinct people assigned, the numerator their
  unexpired acknowledgments of the version in force. A document assigned to nobody reads "not assigned", never 0/N.

Not decided here: MR-12 NEW-4 (review quorum and the retirement meaning).

### P-50 — Training: a 14-day grace for late assignment, assignment grants reading the released version, and personal training status is QA's to see

Decided 2026-10-29 under the founder's delegation of that day ("You can make founder decisions"), answering the three
questions `docs/design/QMS_TRAINING_ASSIGNMENT_2026-10-29.md` §1.4 left open within P-49:

- **Q1, late assignment: 14 days.** Someone assigned after a version is already in force is due 14 days after they are
  covered (`TRAINING_LATE_ASSIGNMENT_GRACE_DAYS = 14`). A version approved ahead of its effective date keeps P-49's
  rule: due by the effective date. Due "today" would make every new hire overdue on their first day; Veeva offers
  "N days after assignment" for the same reason.
- **Q2, reading what you must train on: yes (the design's D3).** An active person covered by a live assignment may
  read, through the training reader only, the immutable signed snapshot of that document's version in force and of
  its pending version. It grants nothing on the editing copy, the editor, the versions route or the project. A task
  nobody can complete is not distribution.
- **Q3, who sees each person's training status: the person, administrators and designated QMS approvers.** Every
  other member sees the coverage counts ("x of y assigned"), not names. Training status is a personnel record; a
  colleague's lapse is QA's business, not the whole organisation's. The per-person reads (`GET /qms/training`, the
  expiry list G10, the outstanding-training list) apply this when compliance moves onto assignments (the design's
  slice 3).

### P-51 to P-57: decided under the founder's delegation of 2026-10-29

The founder delegated, on 2026-10-29: "make founder level decisions based on the best situation for the platform and
our paying clients and human users … we're not ready for ETMF or CTMS. You could park those completely … We're
focusing on completing what we have started and perfecting it all." These decide the questions that sessions had
left open (`docs/design/PARITY_WEAVE_VEEVA_BASICS_2026-10-29.md` §8,
`docs/work-orders/MR-12-qms-controlled-document-control.md` NEW-2 to NEW-4, and
`docs/evidence/D2-FILING-TYPE-TEMPLATES/2026-10-18/FOUNDER-DECISIONS-OWED-2026-10-26.md`). Training assignment,
training before the effective date and distribution (MR-12 NEW-2, NEW-3; parity §8 item 8) are P-49, the training
lane's, and are not decided again here. *(Corrected 2026-10-29: this block first carried its own training entry and
numbered the deviation decision P-49, then P-50; both numbers were taken by the training lane's P-49 and P-50 as these
landed, and those govern. The deviation decision is P-57.)* The
test for each was:
does it complete something already in the catalog, for the client who pays for it, without widening the catalog?
None widens it.

### P-51 — Review and approval follow the review-routing decision; retirement has its own meaning (NEW-4)

NEW-4 was decided on 2026-10-29 by the review-routing coordinator, under the founder's delegation of 2026-10-07
(`docs/design/REVIEW_ROUTING_2026-10-23.md` §4, with D-Q in §7). RR4 is building it. For a QMS controlled document:
- at least one approver holds the QMS approver designation, and that approver is not the author or a contributor;
- reviewers are optional; when any are named, all of them sign before the approval;
- sending for review is a governed act with a reason, not a signature.

That decision stands and is recorded here. *(Corrected 2026-10-29: this entry first read "review is a signed act; the
same person may review and approve", written before the review-routing decision was found. That decision governs.)*

What NEW-4 left open is retirement's meaning. Retirement is signed with its own meaning, `retirement` ("you withdraw
this document from use"), not `approval`. Stored retirements keep the meaning they were signed with. This unblocks
MR-12 Stage 5 step 3. Stage 7's review step is RR4's.

### P-52 — Controlled output: Letter, the FDA PDF specification, a default confidentiality line (MR-09 NEW)

- Page size is US Letter, because the launch boundary is a US IND (P-28).
- The PDF target is FDA's PDF specification for eCTD: PDF 1.4 to 1.7, fonts embedded, no security settings.
- The default footer reads "CONFIDENTIAL. Proprietary information of {organisation}. Do not distribute without
  permission." An organisation may change it.
- This unblocks CAT1-09 and template formatting (W5).

### P-53 — Parked, with no sessions

*2026-10-30: superseded for eTMF, registrations, NDA/BLA, QC/LIMS and study start-up by P-74, which admits them in order.*

- eTMF;
- CTMS;
- safety case processing and E2B;
- EDC;
- an NDA workflow;
- re-admitting the Template Library;
- any widening of P-28's composition boundary.

Safety and EDC are "partner or integrate" when they return, and no partner is approached now. eTMF is not a source
for `assess_inspection_readiness`, which answers from stated inputs, labelled (2026-10-26 list, row 9).
(Parity §8 Q9, Q10, Q11.)

### P-54 — Lanes, order and scope corrections

- **Lanes released.**
  - The Weave-gap lane's items (G2, G3, G6, G15, and G11 and G17 with them) are released to the next free session.
  - The training-assignment lane is not released: it is active, and landed P-49 on 2026-10-29.
- **P-39's order stands.** Commitments converge (step 2) before the correspondence family (step 3), so G3's parser
  waits; zero duplication outranks speed.
- **Device post-market stays in Projects**, as P-48's correction of 2026-10-29 already reads (Q6).
- **SSO signing (MR-09 Stage 6) keeps its phase.** It moves to Phase 1 only if a signing customer signs in through SSO
  alone (Q12).
- **Support for D9** is the drafted Mon–Fri 08:00–18:00 US Eastern (Q13).
- **Claims policy confirmed (Q14):** no claim of doing everything Weave does, and §4's claims only with their basis.
- **The old IND briefing-book assembler goes.** Its replacement is `IndBriefingBookStart.tsx`, starting the US
  meeting-package templates (5894e1aaa). The server routes and service it called are deleted once a search shows
  they have no caller.
  *2026-10-30:* deleted. Agency Meetings, the last caller, opens the editor's meeting package instead
  (`docs/evidence/D2-BRIEFING-BOOK/2026-10-30-assembler-retired/`).

### P-55 — The Authoring questions of 2026-10-26 are decided as recommended

Rows 1 to 22 of `FOUNDER-DECISIONS-OWED-2026-10-26.md` are decided as each row recommends:
- a conditional heading may be recorded not applicable, with a reason and the approver's signature;
- R-1: 2.4 and 2.6 read `nonclinical_studies`, counting `in_reporting` for an IND and never `planned` or `cancelled`.
  The ingest path converges onto it;
- 2.6's tabulated summaries are a preparation worksheet;
- calculators over stated inputs stay, labelled `basis: 'stated'`;
- no standalone QOS, drug substance or drug product project;
- folds only after their functions are carried over, and the digital twin is retired;
- the M2, M4 and M5 QC rules are carried into Submission Readiness as named findings, not a score;
- and so on through row 22, each as its row recommends.

The guideline hosts in row 14, and §8 Q15's network access, are owner actions in the environment settings, not
decisions.

### P-56 — No model is approved until the PQ evidence exists

PQ-DRAFT-001 stays unapproved until P-31's items 4 and 6 land:
- item 4, gold-bank coverage for CMC / Module 3 and Module 2.5 to 2.7, authored from real source text and never
  invented. It is scheduled as a W3 slice;
- item 6, a product provider key, which is an owner action.

Then approval is a signature, with P-31 as its reasoning. Until then, production refuses governed drafting and every
drafting claim says "staging". Approving a model without its evidence would give a paying client a qualification
their own QA would reject. (Parity §8 Q1.)

### P-57 — Deviations are their own record in Quality

A GMP deviation is a departure from an approved procedure or instruction (21 CFR 211.192, 211.100(b); EU GMP
Chapter 1, 1.4(xiv)). It is often not product-keyed: a missed environmental-monitoring reading, a skipped step, an
out-of-window calibration. The nonconformance register is keyed to a product or material and a lot, so it cannot hold
one. Veeva QMS Basics keeps deviations, and P-48 already named them. The Quality app gains a deviation register:
- classification as minor, major or critical;
- what happened, where and when, and the procedure departed from;
- immediate action, investigation and root cause;
- the impact on product or batch, when there is one;
- a CAPA raised from it, through the existing `raiseCapaFrom`;
- closure as a signed decision, through the one signing ceremony.

The store is `qc_deviations`, as `shared/schema/qc-schemas.ts` has defined it since the QC module. No migration had
ever created it. `migrations/20261029g_qc_deviations.sql` creates it with `client_workspace_id` nullable, because a
Quality record is the organisation's, and appends it to `C2C_MIGRATION_FILES` before the final sweep pair (Rule 1). It
is public with `organization_id INTEGER NOT NULL`. *(Corrected on building: this entry first said "a new public table";
the existing definition is reached instead, under Rule 3.)*

The `/api/qc/deviations` routes (`server/routes/qc.routes.ts`) and both storage implementations behind them are deleted
in the same change: the in-memory one that answered 501, and a database one over the table that did not exist. They
would have become a second writer of the record. Their OOS stub stays, because OOS is not a deviation. The
nonconformance tab stops being described as deviations. (Parity §8 Q5; slice G16.)

### P-58 to P-69: decided under the founder's delegation of 2026-10-29 (regulated clients and longevity)

A second delegation the same day: "make the best decisions based on our highly regulated clients and their needs and
the longevity of our product for our clients, which are biotech, pharma, medical device, diagnostic, and so forth."
*(These were first written as P-51 to P-62 in a session working beside the block above, which took P-51 to P-57 as
both landed; they are renumbered, and the commits that introduced them name the old numbers.)*

### P-58 — A departing tenant's regulated records leave with the tenant, after custody passes to the customer

Decided 2026-10-29 under the founder's delegation of that day ("make the best decisions based on our highly
regulated clients and their needs and the longevity of our product"). The question came from
`docs/evidence/D6-TENANT-PURGE-BLOCKING-KEYS/2026-10-29/`: 18 tables are held out of the tenant purge
(`PURGE_REFERRERS_NOT_ERASED`), so a tenant holding a signature, an audit row or an approval cannot be purged at all.

- **Every held record is exported, then erased with the tenant.** That covers `electronic_signatures`,
  `document_audit_trail`, `immutable_report_records`, the account and outcome logs and receipts,
  `evidence_chain_records`, `data_lineage_records`, `governance_boundary_transitions`, `gate_approvals`,
  `cer_approvals`, the IVDR Part 11 histories, `reg_questions`, `review_routes` and their route tasks. The export
  carries each chain's integrity verdict and each signature's manifest, so the customer can show an inspector that
  the copy is whole.
- **Custody is a signed act.** Before the purge erases a held record, the customer's administrator signs that they
  have received the export and taken custody of it. Where the organization's retention period has not elapsed for
  any record, the attestation names those records and the customer accepts the retention obligation.
- **The platform keeps one offboarding certificate per tenant**: the export manifest's hash, the counts per table,
  the custody signature and the purge time. No customer content.
- **A table whose trigger refuses DELETE is erased through a reviewed purge door** (SECURITY DEFINER, platform
  scope, `pending_deletion`, no active legal hold), as `purge_tenant_vault_seals` is. A session-settable setting is
  never a door.

Why: retention is the sponsor's and the manufacturer's obligation (21 CFR 312.57 and 312.62, 21 CFR 820.180 and ISO
13485 §4.2.5, EU GMP Annex 11 §17), and the platform is their processor. A customer can only keep their records for
years if they leave with a complete, verifiable copy. Records a vendor keeps after the customer has gone cannot be
inspected by that customer and remain a data-protection liability. Erasing them before custody passes would break
the customer's retention. So: export, sign for custody, then erase.

### P-59 — The review-route guard admits a role, not a session setting

`unified_tasks_route_rows_guard` (`migrations/20261023_review_routes.sql`) lets any session that sets
`c2c.review_route_writer = 'on'` past it, and the runtime role can set it (`guc-probe.txt` in the purge evidence). It
converges on the platform's pattern for append-only guards: a NOLOGIN role that only the route writer's path
assumes, as `ana_run_events_purger` does (`20261008f_ana_run_events.sql`). The file is amended in place (Rule 1), and
the tenant purge reaches route rows through a door (P-58), not the setting. Why: a signed review workflow is a
Part 11 record, and a control any session can switch off is not a control.

### P-60 — Design history and design changes are kept per product

Engineering's change-request panel reads the QMS change-control register (`qms_change_controls`) by a project key.
`change_requests`, which nothing writes, leaves the panel. The DHF panel reads the project's own document sections
(`c2c_document_sections`); the organization's one-kit store (`cerv2_510k_sections`) is not shown under a project.
Why: a device or diagnostics company runs several products, and their design history file and design changes are
per product (21 CFR 820.30(j), ISO 13485 §7.3.10). Change control has one register (zero duplication).

### P-61 — The device folds' five decisions (`docs/design/DEVICE_FOLDS_2026-10-29.md`)

1. **One device-filing store: `estar_submissions`.** It is on the deploy set and admits the project.
   `c2c_submission_packages`, whose creator is on no applier, is migrated behind `to_regclass` guards and retired.
2. **No organization-wide blocker list.** Blockers belong to a filing, from that filing's deterministic readiness
   (EstarFilingPanel). `device-validation` and its `c2c_blockers` list retire. Its "Pass" for low-severity
   blockers is not carried: a blocker is closed by fixing it or by a named person's signed waiver.
3. **Device analytics joins Reporting & analytics at its tier (standard).** Reporting is a central service for
   every client type (decision of 2026-09-26). It reads accessible projects only.
4. **Grant continuity, not new grants.** A subscription to a folded module entitles its holder to the fold's target,
   through one mapping in code that the entitlement resolver reads (`FOLDED_MODULE_SUCCESSORS`). No grant row is
   written and subscriptions are kept. This covers risk and design-controls into device-engineering, ivd-completeness
   into device-diagnostics, and every fold already made (device-vault and artifacts-center into vault,
   part11-console into audit-trail, ana-memory into conversation-thread, setup into admin-console, ectd-publishing
   into ectd-compile, billing into licensing). Why: a customer who paid for a capability keeps it when its screen
   moves.
5. **Device workstream into Projects** shows only figures computed from the project's own records; any strip figure
   no engine computes is dropped. The Client Review Room admits the project (`admitProject`) before anything is read
   or shared.

### P-62 — A project's CMC data has one home: the CMC / Module 3 register

The CMC data that `GET` and `PUT /api/concept2cure/projects/:projectId/cmc` keep in project metadata converges on
the CMC / Module 3 register (`server/api/cmc`). Its one reader (`server/routes/c2c/tasks.ts`) moves onto the
register, and the routes retire. Why: two CMC answers for one project is a filing risk (zero duplication).

### P-63 — Signed content is not edited in place

An approved or effective label, an approved translation and an accepted hazard refuse edits to the fields their
signature binds (the content-digest recipes of `84aada8f7`). A change is a new version or a reopening, signed in its
turn. "Changed since it was signed" stays as the detector for records signed before this rule. Why: a signature must
stay attached to what was signed (21 CFR 11.10(e) and 11.70), and controlled records change only under change
control (21 CFR 820.40, ISO 13485 §4.2.4).

### P-64 — A translation's approval binds the source it translates

The translation recipe (`labeling-translation`) moves to v2: it binds the source document's version and content
digest as well as the translation. Why: a translation is valid only against the text it translates; approving it
against a later source would be approving the wrong thing. RIM's label approval (`rim-product:`) binds content too
when RIM reopens (outside the launch catalog under P-37; no session now).

### P-65 — An audit-chain verdict is for those who may review the audit trail

`GET /api/part11/audit-trail/chain-integrity` takes the gate the ledger takes (`requireAuditReader`). Why: audit
trail review is a role-scoped duty, and both of Audit trail's verdicts should answer to one policy.

### P-66 — Three tenant-isolation hardenings

- An evidence citation may cite only its own organization's document. The Vault citation policy checks both ends
  (`20260911_vault_evidence_citations.sql`, amended in place, made conditional on `pg_get_constraintdef` and policy
  text). Until then, one organization can cite another's document, and that document's purge deletes the citing
  organization's row.
- The Vault child tables FORCE row-level security, so the table owner is no exception.
- The public CDI reference (`migrations/20261027_cdi_public_reference_seed.sql`) carries no tenant's study as its
  "fit" target. Today every tenant can see that a reference was tailored to NCT05330182. A new seed version drops
  the field (Rule 1: a seed is never corrected in place), and fit is computed for each project when it is read.

### P-67 — The GAMP 5 validation kit is reached in Settings, over the real route

The kit (`server/routes/validation-kit.ts`, with a recorded download) is reached on administration's Settings,
claiming only what its contents are. The unmounted `AdminConsole`, unmounted since `af973c5e8`, is deleted once the kit is reached
there (zero duplication). Why: a regulated customer must validate the system they use (21 CFR 11.10(a), EU GMP
Annex 11 §4), and a vendor validation package is what they ask for first. It must describe the deployed system
truthfully, or it is worse than none.

*Amended 2026-10-29, same day, on implementation:* "its contents" is the launch package and nothing else:
VMP-001, the documents that name it as their parent (URS, RA, IQ, OQ, VSR) and TM-001, each with the version and
status its own header records. The route listed every file in `docs/validation/`, so a customer was also handed
the CORTEX series (a second validation master plan, for the AI engines VMP-001 §3 puts out of scope), an internal
CI work order and a generated evidence pack. Those stay in the repository and are not offered as the customer's
package. The route's note no longer promises "executed and approved records … through QA at contract", which
nothing provides. One gap is the plan's own, and is its owner's to change: VMP-001 §5 lists URS-001…006 and
OQ-001…006, while URS-007 and OQ-008 (CMC / Module 3) name VMP-001 as their parent and are offered.

### P-68 — One subscription entry, one rate-limit source

A billing administrator's account menu has one entry, "Subscription & billing", opening Licensing
(INFORMATION_ARCHITECTURE.md §9); every member keeps "Usage & limits". The usage screen reads its rate-limit table
from `GET /api/billing/rate-limits` instead of a copy in the client.

*Amended 2026-10-29, same day:* that route served a hand-written per-tier grid that nothing enforces, and invented
"standard" for an organization with no tier. What the product applies is `server/config/platform-limits.ts`, per
identity and the same for every subscription. So the route returns the limits actually enforced, the usage screen
shows them as the same for every subscription, and the unenforced grid is deleted. Limits that differ by tier would
be a new enforcement capability (Rule 2), not a label.

### P-69 — Module enforcement stays off until no gated prefix denies everyone

`MODULE_ENFORCEMENT` is not switched to `enforce` while any gated prefix has only claimants without a catalog row
(38 of 283 on 2026-10-29, among them `/api/chat`, `/api/setup`, `/api/onboarding` and `/api/tenant-users`). A gate
that fails on such a prefix comes first; enforcement follows when it is green. Why: turning enforcement on today
would lock every customer out of AnA's own conversations.

### P-70 — No session setting lifts row-level security

`app.bypass_rls` is a custom setting any session can set, and it lifts every Vault policy (found 2026-10-29,
`docs/evidence/D6-ISOLATION-HARDENING/2026-10-29/`). The runtime role must not be able to switch tenant isolation off
from inside its own connection. Every policy that reads it converges on the platform scope the reviewed purge doors
already require (a role the runtime role cannot assume), and the settings readers that remain are deleted. A
code path that genuinely needs to read across tenants does it through a reviewed SECURITY DEFINER door or a role
granted only to that path, with its reason on the definer allowlist. Why: P-59's reasoning, at the scale of the whole
Vault: a control any session can switch off is not a control, and a regulated customer's isolation cannot rest on
every line of server code never issuing one `SET`.

*Amended 2026-10-29, same day, on implementation (`08619d5cc`):* the "platform scope the reviewed purge doors
already require" is not a role. It is two more session settings (`app.rls_enforce` not `'on'`, or `app_super_admin`).
Converging onto it would have moved the switch, not removed it, so the bypass and admin terms were deleted with no
replacement, and the deploy now fails if any policy or function reads either. The platform scope itself is P-72.

### P-71 — The product ships no customer's analysis

`server/data/public-csr-reference/` carries `lmn-target-profile.json` and `comparator-fit-matrix.json`: one
customer's target study (NCT05330182) and a comparator fit made for it. Nothing reads them. They leave the shipped
product; the evidence of the 2026-10-27 work keeps its copies as history. Public registry records stay in the
reference set when they are genuinely public and in scope for it, chosen by the therapeutic area, not by one
customer's programme. A customer's own targets and fits are that customer's project data, in their tenant. Why: a
sponsor's competitors use the same product, and what the product ships is visible to all of them.

### P-72 — Platform scope is a role, not a session setting

`app.rls_enforce` (read by about 1020 policies) and the `app_super_admin` arm (about 973) are custom settings the
runtime role can set, as `app.bypass_rls` was (P-70's inventory,
`docs/evidence/D6-NO-SESSION-RLS-BYPASS/2026-10-29/`). Today, only these stand in the way: the session pins in
`server/db/sessionScope.ts`, the gates and the SQL-interpolation freeze. No caller-controlled `SET` reaches the
database, but one injected or careless `SET` would lift tenant isolation for every table at once.

Platform scope moves onto a NOLOGIN role that the runtime role cannot become: not granted, or granted `WITH SET
FALSE` (PostgreSQL 16). It is entered only through reviewed SECURITY DEFINER doors on the definer allowlist. The
policies' setting arms are amended in place to role checks (Rule 1), and the deploy fails if any policy or function
still reads either setting.

Design comes first. It is an inventory of every path that sets either setting today, and the door each one moves
to, before any policy changes. The tenant selector itself (`app.current_org_id` and its kin) stays a session value
that the server pins per request; binding it cryptographically is not in scope.

Why: the reason given for P-59 and P-70. A control any session can switch off is not a control, and a regulated
customer's isolation is the product's first promise.

*Amended 2026-10-29, same day, on the design* (`docs/design/PLATFORM_SCOPE_AS_A_ROLE_2026-10-29.md`). Production
and staging run PostgreSQL 15, so the role is simply not granted to the runtime role; `WITH SET FALSE` is not used.
Its five questions are decided:

- **F1:** shadow mode is replaced by a login exemption for the migration applier and single-role dev
  (`CURRENT_USER = SESSION_USER` and membership of a NOLOGIN exemption role), never held by the runtime role.
- **F2:** `app_service` may call the platform doors now; a second runtime role is a per-door grant change later.
- **F3:** the purge's lifecycle columns are writable only through platform doors, and the database also holds
  `purge_eligible_at`, so no door erases before the retention window closes without a recorded override.
- **F4:** no PostgreSQL upgrade is needed.
- **F5:** if slice 0 shows that the tenant export lacks the Vault, its rows leave through a reviewed door
  (`platform_export_vault_rows`); no Vault policy is widened. Slice 0 measures this first, because a departing
  customer must get their Vault back (P-58).

One defence-in-depth point is in scope for slice 1: the request path passes the token's role claim to the database
verbatim. No assignable role is `app_super_admin`, and no route mints such a token, but the database must not take
the platform scope from a request's string.

### P-73 — Trial-application drafting covers every region, therapeutic area and modality; CMC composition does not widen with it

Decided by the founder on 2026-10-30. Asked to "build out all IND build and drafting capabilities across all
therapeutic areas and all geographical regions", the founder chose drafting first over widening everything at once.

- **Widened.** Section drafting and its requirements (AnA's drafting tools, the editor's "Draft from sources", and the
  canonical requirements resolver behind both) cover the trial application of each region, not only the US IND:
  - the EU CTA under CTR, filed in CTIS (Part I, Part II and the IMPD);
  - the UK MHRA CTA;
  - the Health Canada CTA, with the QOS-CE;
  - Japan's clinical trial notification;
  - Australia's CTN/CTA;
  - China's NMPA IND;
  - the remaining regions as the region profiles record them.
  They also cover every therapeutic area and modality the existing vocabularies hold.
- **What this changes for drafting.** A region, therapeutic area or modality that drafting reports as "unassessed"
  today becomes work to do. It does not become a reason to stop. The rules of `ANA_IND_COVERAGE_PLAN.md` still hold:
  - Requirements come from recorded sources, with dates.
  - An unknown fact stays a visible gap.
  - A declared label is never treated as qualified evidence.
- **Unchanged.** CMC / Module 3 composition stays small-molecule Module 3 for a US IND
  (`services/cmc/composition-scope.ts`, P-28). It widens only by a later decision, slice by slice, as biologic
  content (Q5A(R2), Q6B, Q5C), the EU IMPD quality part, the QOS-CE and regional 3.2.R are built and verified.
- **Unchanged.** Submission Center's packaging and transmission bounds, and the agency gateways, are not widened by
  this decision.

### P-74 — Six areas outside the catalog are admitted, in order: eTMF, nonclinical and IB authoring, registrations, NDA/BLA, QC/LIMS, study start-up

Decided by the founder on 2026-10-30, answering the six catalog questions of the Weave and Veeva Basics parity work
(`docs/design/PARITY_WEAVE_VEEVA_BASICS_2026-10-29.md` §6, P-48): "Yes to the sequence but all are needed."

- **Admitted, in this order.** Each is worked only after the one before it lands:
  1. **eTMF** — `Etmf.tsx`, `etmf.routes.ts`, `tmf-completeness.ts`.
  2. **Nonclinical study-report ingest into 2.4/2.6, and Investigator's Brochure authoring** — `routes/preclinical.ts`,
     `m26-nonclinical-summaries.ts`, the `nonclinical` and `investigator-brochure` surfaces.
  3. **Registrations (RIM lite)** — `routes/rim.ts`, `Registrations.tsx`.
  4. **NDA/BLA** — `nda-cockpit`, `maa-cockpit`; and CMC / Module 3 widened beyond P-28, slice by slice as P-73 sets
     out (biologic content, marketing-application Module 3), each verified before it is admitted.
  5. **QC operations / LIMS** — batch release, CoA, external results, stability; the CMC registers and the `/api/qc`
     stubs are the starting point, and integrating a CMO's LIMS is weighed against building.
  6. **Study start-up** — site activation, over the IRB, ICF, 1572 and budget pieces already in the catalog.
- **This decides timing and scope, not readiness.** The parity design recommended "after D10" for these; the founder
  overrides the timing. The prerequisites its §6 names still bind each slice, and an area joins `LAUNCH_APPS` in
  `shared/constants/launch-scope.ts` only when its slice lands with them:
  - one study store, and one TMF store (`etmf.ts` and `etmf.routes.ts` converged; the losing migration amended in
    place, RULE 1);
  - every migration a surface needs added to `C2C_MIGRATION_FILES` (`rim_lite`, the TMF store);
  - a URS and OQ for each new regulated function, as CMC had (`URS-007`, `OQ-008`);
  - extracted values confirmed by a person before any composer reads them, and PQ for any model step (RULE 2).
- **Unchanged.** RULE 3 holds for every slice: each is named "complete", "reach" or "converge" against the existing
  code listed in the parity design, never "build". Safety/PV, EDC and a content LMS stay "partner or integrate" as the
  parity design recommends; this decision does not admit them.

### P-75 — eTMF files against the protocol-design study, lives inside Vault, and is a professional-tier module

Decided by the founder on 2026-10-30, the three questions the eTMF slice of P-74 raised
(`docs/design/ETMF_CONVERGENCE_2026-10-30.md`):

- **Study record.** eTMF files against `cdisc_prm_studies`, the study created in Protocol Development (project-scoped,
  same-organisation keyed), picked from the open project. It is reached, not rebuilt. Device and CRO trials get no
  TMF until CTMS converges the study stores.
- **Placement.** eTMF is a feature of the **Vault** app: `LAUNCH_APPS` vault gains the `etmf` surface, and the app
  count stays seven.
- **Tier.** eTMF is a **professional**-tier module. Its catalog row is kept and healed with that tier; it is not
  listed in the launch `modules`, which would grant it to every organisation.

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


### P-76 — Risk-Based Monitoring is a central rail service and an optional project setup choice

Founder request, 2026-10-30: focus on the existing risk-based monitoring module,
put it on the main left rail beside CMC, Projects, Tasking, Communication, Vault
and the other core services, and allow it to be chosen while setting up a project.
This explicitly admits the existing `rbm` surface; the central-service direction
of2026-10-26 already names its owner. It is the eighth launch app. Existing
professional-tier licensing and commercial enforcement mode stay in force;
`modules:[]` creates no automatic subscription grant.

The optional project choice is recorded on the existing regulatory project, not
as a filing type or a new clinical-study store. Real project UUIDs/names and current
sharing scope carry into monitoring and cross-service navigation. The canonical
monitoring engines, source records, audit and signed assessment/plan approvals
remain their owners. Admission includes the exact live RBM API families, current
project/record access and draft-only assessment seeding; it does not admit the
whole MDX namespace or merge clinical-ops/study/deviation stores.

Contract `docs/design/RBM_NAVIGATION_PROJECT_SETUP_2026-10-30.md`; engineering
and publication evidence `docs/evidence/D2-RBM-NAVIGATION/2026-10-30/`.
Hosted deployment, clinical validation and agency acceptance need their own proof.

### P-77 — Biostatistics is a work area on the rail

*Amended 2026-11-01 (P-79, commit "Biostatistics is reached from the project"): Biostatistics is in the catalog and
reached from the project's "Start work in this project" (`ProjectCoreWork.tsx`) and ⌘K, not from a rail entry.
RULE 4's gate refuses a rail entry outside its baseline, and P-36 named none. The rest of this record stands.*

Founder, 2026-10-31, after a client demo: "My cmc, biostatistics, tasking, projects is
all gone or utter trash now." Both biostatistics screens existed — `biostatistics`
(the project's study designs, sized by the deterministic engine, and the governed
statistical documents it writes) and `biostat-workbench` (29 design calculators and
the reviewer-risk assessment) — and neither was on the rail or in the catalog, so a
person could reach them only through ⌘K. The founder's model already named
Biostatistics a work area to join the rail once in the catalog (the rail decision
above). It is the ninth launch app: surfaces only (`modules: []`), so the
professional-tier band and explicit grants keep deciding who holds it, as for CMC
(P-28) and risk-based monitoring (P-76). The rail's *Work areas* are now CMC /
Module 3, Risk-based monitoring, Biostatistics, Quality, Reporting & analytics; the
entry opens `biostatistics`, which loads the open project's own study design and
links to the calculators. The workbench declares the CLSI engines it calls
(`/api/diagnostics-performance`), and AnA's `assess_defensibility` is in scope.
Evidence `docs/evidence/DEMO-RECOVERY/2026-10-31-work-areas/`.

### P-78 — One design, one plan: Concept2Cure is Claude for life sciences

Founder, 2026-10-31: "This platform should look like Anthropic built this. It should match how Claude is designed
entirely, from projects to the canvas to the editor to the details. This is basically Claude for life sciences." And:
"everyone must work from the same design and goals and never breach your plans. Never build anything outside of the
plans and to bring the code base beneath the UI fully to life inside this new UI framework."

The plan is `docs/design/ONE_DESIGN_PLAN.md`, with its ledger `docs/design/one-design-plan.json`. It sets the goal,
the binding design (§2: Claude's patterns for the sidebar, home, projects, the project, the conversation, the
canvas, the editor and the work areas, plus the retired patterns), the work packages and their order, and the rules
of engagement. It binds every developer and every agent from any tool: `CLAUDE.md` RULE 5, `AGENTS.md` and the
Copilot instructions. `npm run ci:one-design-plan` in `.husky/pre-push` enforces it with no bypass. Every pushed
commit names an open package, stays inside it, and adds no unapproved screen, mount or table. The plan changes only
by founder decision. The selftest shows each refusal. The design system's own "Claude-clone look" rejection is
reversed for layout and character. Its typeface decision stands for licensing reasons.

### P-79 — The product spine: the project, its data room, the protocol's question, AnA's narrative, the filing

Founder, 2026-11-01, on what the one plan (P-78) is a plan *for*:

> "The system should be obviously centered around document building, ECTD, filing, formatting it correctly, like
> ECTD 4.0 is an example. That's kind of our center product, what we are, with the Viva parity tools, you know, our
> DMS, and Anna's ability to do all of this, just like Claude." "A project is where everything starts. You gotta have
> a project. Okay, what's your project and what's the goal of the project?" "Inside the project, there's gonna be a
> ton of historical records, AKA the data room, where we catalog everything. So we need to have a very sophisticated
> data catalog." "Make sure that that data in that catalog is immutable and has a whole history. It might change, it
> might get amended and updated, but the data lineage of everything that goes into that must be continually captured
> in perpetuity." "The project needs a protocol. The data room needs to understand the protocol, and then the goal,
> and then the data." "The statistics, the biostatistics, the safety profile, all that needs to then be written and
> narrated from the greatest medical writer there is, Anna." "A client needs to be able to see what Anna's written
> and choose to edit it … and direct Anna to enhance something or strengthen something, or Anna needs to push back
> and say that, no, this isn't a good idea, or your data doesn't support this, but it may support this." "We also
> have a risk-based monitoring module that should be profiled. Our CMC module needs to be centered and profiled …
> the CMC module is complete module 3 in the IND, but we built a data capture environment to be used in the study
> conduct for chemical manufacturing and controls." "Vault needs to compete with actually Viva." "Our three clients
> are going to be medical device and diagnostics, and biotech and big pharma. Located in Japan, Australia, Canada,
> Europe, and the United States. And potentially, we may go to China someday … but that's not now."

What this decides:

- **The centre of the product is the document and its filing.** That means building it, formatting it correctly
  and filing it in eCTD (3.2.2 and 4.0), with Vault as the document management system and AnA doing the work in
  conversation. Every work package serves that path.
- **The spine runs in this order:**
  1. project and goal;
  2. data room (catalog, immutability, lineage);
  3. protocol (hypothesis, endpoints);
  4. evidence (biostatistics, safety), computed by deterministic engines;
  5. AnA's narrative, which a person reads, edits, directs or is pushed back on;
  6. the one editor (review, sign);
  7. eCTD assembly, validation and filing;
  8. Vault throughout.

  CMC and risk-based monitoring are the two work areas the spine features. Biostatistics lives inside the project's
  evidence.
- **AnA may refuse a claim.** When the data do not support what a person asks it to write, AnA says so, names what
  the data do support, and cites the engine result or source behind its answer. The figures come from the engines;
  AnA narrates (RULE 2).
- **Clients and regions.**
  - Clients: medical device and diagnostics, biotech, and big pharma. Each is a document-type catalog, not an app
    (RULE 4).
  - Regions: the United States, Europe, Japan, Canada and Australia.
  - China is not now. The NMPA code that exists stays as it is and is not extended.
- **CMC is two things.** One is Module 3 composition. The other is a data-capture environment used during study
  conduct. Both stay one CMC work area.
- **Not decided here** (each needs the founder):
  1. whether CMC is licensed separately (today it is a professional-tier band, 2026-08-24);
  2. whether the CMC composition boundary (P-28: small-molecule Module 3 for a US IND) widens to the five regions,
     biologics or marketing applications;
  3. whether the clinical-dataset readers deferred on 2026-10-08 (`.xpt`, `.sas7bdat`, Dataset-JSON) come back, so
     that EDC and ePRO data can enter the catalog as data.

Recorded in `docs/design/ONE_DESIGN_PLAN.md` §1a. That section lists, by path, what already exists for each step
of the spine and what does not. Its work packages S1–S8 are in the ledger, `docs/design/one-design-plan.json`.

### P-80 — RULE 6: nothing new. Finish what exists, in the Claude UI

Founder, 2026-11-01:

> "There's another hard, absolute rule that no agent is allowed to build anything new. However, they're allowed to
> continue and finish and conclude with brilliant working UI everything that's in place." "It all exists. Everything
> is already in existence, mostly. But in a project, I don't think that you have the ability to set what the ultimate
> objective of the study was. But you can add that. Otherwise, it's just the UI that needs to match that." "That's
> another problem I have with Claude Code, is you just jump in and do things and make assumptions without seeing if
> it's been already done before." "If you had Veeva, Weave Bio, Artos, and you merged them all together and had
> that built by Anthropic as life sciences for Claude, that would be who you are, who I'm building." "Veeva -
> www.weave.bio - Artos - centara - all merged as one and than build by anthropic Claud for life sciences: that is
> what you must build and never break from the Claud type UI."

What this decides:

- **RULE 6, absolute, for every developer and agent.** Nothing new is built. Work continues, finishes and concludes
  what is in place, and brings it to life in the Claude UI (P-78).
- **Every commit names what it finishes.** It carries a `Completes: <path>` trailer naming a file or folder that
  existed before it. `ci:one-design-plan` refuses a commit without one, or one naming nothing that existed.
- **These count as new, and need a founder decision in `approvedAdditions`:**
  - a route file, a service (a new folder, or a new file directly under `server/services/` or `services/`) and an
    AnA tool, which `ci:one-design-plan` now refuses;
  - a screen, a mount and a table, which it already refused.
- **The one addition the founder named.** The project states its ultimate objective. This completes the objective
  record that exists (`ana_client_objectives`, its API in `server/routes/client-intelligence.ts`, and AnA's context
  in `server/services/ana-context-router.ts`). It reaches that record from the project.
- **The vision.** Concept2Cure is what Veeva, Weave Bio, Artos and Certara would be if merged into one and built by
  Anthropic as Claude for life sciences. The founder wrote "centara", read here as Certara. Each brings:
  - **Veeva:** the regulated content and submission platform, which is our Vault, Submission Center and Quality;
  - **Weave Bio:** AI-native IND and submission authoring, which is AnA and the one editor;
  - **Artos:** document drafting from the study's own data, which is the data room to AnA's narrative;
  - **Certara:** biostatistics, modelling, data standards and regulatory writing, which are the evidence engines,
    CDISC conformance and the medical writer.

  Nothing in that list is built new. Each is the existing code of a spine package, finished. The UI never breaks
  from Claude's.
- **The UI work starts now.** The design packages D1–D7 open without waiting for D0. The UI is what has not yet
  brought the code to life.

### P-81 — The significance of a project: AnA grows with it, its team works in it, and it runs to the agency and back

Founder, 2026-11-01:

> "Anna must retain complete knowledge and understanding of every project she works on for any customer and grow with
> that project. She needs to grow in understanding more about the human that's using her, and remember things and
> have friendly conversation and ask all the right questions. She needs to be an expert at asking questions to get to
> the right answers, to get information that may be missing that she needs. She needs to be a critical thinker." "It's
> her job to bring their science to life, to reality, and to get approved and to be used. We are a major bridge from
> concept to the idea to cure." "In a project, you might have multiple team members, which would require other
> licenses to work in a project at any given time, simultaneously or collaboratively. And those team members need to
> be able to see tasking in the project too. Okay, what's due? What is required of me by this date?" "When we dump
> information into the project documents, extracting all the commitments is a major part of it … Extract commitments,
> I think, needs to be even a feature." "Over the life of a project, you need to be able to map it out and schedule it
> and have goals and be able to see visually how you're doing against those goals." "A project needs to go all the way
> through to document assembly and publishing electronically, and then submission to a government agency with
> communications that then come back from the agency in the form of sometimes letters or more. And then that needs to
> come into a communications, messaging, submission center, all of that in that flow."

What this decides:

- **AnA's character.** AnA holds every project it works on and grows with it. It remembers the person it works with.
  It is friendly. It asks the questions that find what is missing, and it thinks critically, including pushing back
  (P-79). The memory and project-intelligence code that exists is finished for this. Package S4 widens to it.
- **The team.** A project is worked by its team at once, each person on a licensed seat. Each person sees the
  project's tasks: what is due, and what is required of them by when.
- **Extract commitments is a feature.** It finishes the `/extract-commitments` capability that is registered with no
  handler (`server/services/ana-capability-registry.ts`). AnA proposes each commitment found in an agency document.
  A person confirms it; the risk tier is high and it requires review (`server/services/ai-governance/risk-tiers.ts`).
  The commitment lands in the existing regulatory commitments store with its source location, owner and due date. It
  then shows in the project's tasks as what is due.
- **The plan.** Over its life a project is mapped, scheduled and given goals. Progress against those goals is
  visible.
- **The flow runs to the agency and back.** Document assembly, electronic publishing, submission, then the agency's
  letters coming back into Communication and Submission Center, and their commitments into tasks.

Packages: S4 widens to AnA's memory and questioning. S9 (team, tasks, commitments and schedule) and S10 (the
agency's communications back into the project) join the ledger. `docs/design/ONE_DESIGN_PLAN.md` §1b says by path
what already exists for each. Nothing new is built (P-80).

### P-82 — The project is the program: a filing run as a program manager runs it

Founder, 2026-11-01:

> "Study what a professional project manager or program manager would do if assigned the build of a major regulatory
> filing for a phase three successful study after billions of dollars. How would they define that? How would they
> design the project? How would they assign tasks to what niche industry specialists? … How is the project broken
> into miniature projects based off of area of assignment … the full IND pyramid. How are those projects managed?
> We need to be that. A global project perspective." And: "The study objective is always in, starts with the study
> protocol, but it's always in all the publicly available information relative to the study … all that needs to be
> cataloged and categorized inside the project … The user interface is really the last mile."

The study is `docs/design/THE_PROGRAM_2026-11-01.md`. What this decides:

- **A project runs as a program.** It has:
  - a charter: the objective, target label, pathway and region order, gating agency interactions, scope and
    governance;
  - a work breakdown: the CTD modules crossed with the functions that write them;
  - workstreams, each with a lead, tasks, documents and a status;
  - an integrated schedule, built backwards from the target submission date, with its critical path and gates;
  - a RACI per deliverable;
  - a content plan per leaf;
  - risk, issue, decision and action logs;
  - the agency's review cycle.

  A global schedule and a portfolio sit across projects.
- **It is finished from what exists** (RULE 6):
  - the submission pyramid engine, already one work breakdown per application type, with roles, dependencies,
    critical path and CTD bindings (`services/regulatory/SubmissionPyramidEngine.ts`, `pyramids/`);
  - the project charter (`migrations/0012_project_charter_timeline.sql`, `server/routes/charters.ts`);
  - the project hierarchy;
  - tasking;
  - the team and seats;
  - the timelines;
  - Submission Center's leaves.

  The pyramid's progress becomes per project, its tasks get owners and back-scheduled due dates, and the result is
  shown in the project's Plan step.
- **Workstreams are sections of the one project**, so the filing keeps one data room, lineage, team and dossier. The
  project hierarchy stays for the portfolio. This is a session recommendation the founder may overrule.
- **The objective is catalogued with its source.** AnA reads it from the protocol and from the public record (trial
  registries, the sponsor's releases and publications) with the abilities it already has. A person confirms it.

Package S11 (the program plan) joins the ledger. The study's §9 gives the order.

### P-83 — Work projects and their downstream deliverables

Founder, 2026-11-01: "There's a couple non-document build projects that then are producing documents downstream. There
might be a CMC project. There might be a biostatistics project. There might be a risk-based monitoring project. And
all those projects have deliverables downstream. And that needs to be thought about and mapped."

This amends P-82 item 1. What it decides:
- **Two kinds of project under one product program.**
  - Work projects produce evidence and data: CMC, a study's biostatistics, risk-based monitoring and data
    management, clinical pharmacology, nonclinical.
  - Filing projects build and file documents.

  One work project can feed several filings. The writing workstreams stay sections of the filing project.
- **Every deliverable is mapped downstream.** Each work project's deliverable has a version with lineage, an owner,
  a due date, and the downstream documents and CTD sections it feeds. A section records the version it was written
  from. A new version flags the sections that used the old one.
- **The map is in `docs/design/THE_PROGRAM_2026-11-01.md` §7a.** It covers CMC, biostatistics, risk-based
  monitoring, data management, safety, clinical pharmacology, nonclinical and clinical operations, each to its
  documents and CTD places.
- **It is finished from what exists** (RULE 6):
  - the project hierarchy and the rollup service (Program → Project → Study → Sub-project);
  - CMC's Module 3 composition;
  - Biostatistics' governed documents;
  - the RBM risk review;
  - the editor's build from the study's data;
  - the pyramid's "feeds into" dependencies;
  - change propagation.

Package S12 joins the ledger.

### P-84 — Two package paths, approved by the founder

The founder, 2026-11-01, answering the session's question. A session had added a path to S1 itself, and the gate was
right to refuse the same move for S10: under RULE 5 only the founder changes the plan. The founder chose "Approve
both":

- **S1** (the project's objective) names `server/services/c2c/charter-objectives.ts`. This is where the charter's
  objectives section is read and recorded (fef3d80f84). This decision ratifies the ledger change in `e2d63319a7`,
  which had cited P-80.
- **S10** (the agency's communications back into the project) names:
  - `server/services/agency-responses/**`, the letter's data-room read;
  - `shared/agency/**`, the deterministic letter splitters;
  - `client/src/concept2cure/v2/surfaces/AgencyResponses*.tsx` and `LetterQuestion*.tsx`, the agency questions and
    proposals screens.

  Extract commitments (P-81) is finished on these: the existing G3 path that proposes a letter's questions also
  proposes the commitments the letter imposes, and a person records each one.

Nothing else in the plan changes.

### P-85 — Home, the dock and Quality join their design packages

The founder, 2026-11-01, answering the coordinating session's question. The merged build order
(`.design/claude-convergence/BUILD_ORDER.md` §0) listed two ledger fixes that the D1 and D7 specs request, and only
the founder changes the plan. The founder chose "Approve both":

- **D1** (the shell, Home and the conversation) names:
  - `client/src/concept2cure/v2/surfaces/Surfaces.tsx`, where `Home` is defined: the greeting, the composer row and
    the starters (`D1.md` §0.2, §D1.C);
  - `client/src/concept2cure/v2/workDock.ts`, so that the progress dock opens on request, not by default (§D1.E);
  - `client/src/concept2cure/v2/surfaceViews.ts`, for the lazy fallback's wording. D1 adds no view.
- **D7** (Submission Center, Quality, risk-based monitoring, and Reporting & analytics) names
  `client/src/concept2cure/quality/**`, the Quality work area (`D7.md` §D7-B).

Nothing new is built: these files exist, and the packages only gain the paths to finish them. Nothing else in the
plan changes.

### P-86 — A sequence that was never filed may be retired, by signature

The founder, 2026-11-01, answering the RIM session's question, put to the founder by the coordinating session. RIM
recommended yes, and the founder chose "Yes".

The problem it answers: a dispatched eCTD sequence whose test-environment send found a content defect could be
neither changed nor replaced, because its number stayed taken.

Such a sequence may be retired by a signed, audited act, which frees its number, only while:
- no production send is bound to it; and
- it is not filed.

The act reuses the filed-elsewhere baseline's existing removal of drafts. It goes under launch row D7 (`Plan: L1`).
Nothing new is built beyond that act.

### P-87 — The unreached IND diff and manifest routes are retired (R1)

The founder, 2026-11-01, on the RIM session's question. These have no caller in any screen, in AnA or in any test:
- `GET /sequence/:currentId/diff` and `/diff/pdf`;
- `GET /sequence/:seqId/manifest` and `/manifest/pdf`;
- the manifest embedded in `POST /sequence/:seqId/dispatch-gate`.

They read the mutable `submission_leaves` table. They are retired with their two services,
`ind-sequence-diff.ts` and `ind-package-manifest.ts`. Their outcome is delivered today by:
- "On file at the agency" (`client/src/concept2cure/v2/surfaces/EctdFiledState.tsx`);
- the compile's lifecycle view (`EctdCompile.tsx`).

The deletion commit names the `git log --all --diff-filter=D` search and those replacements by path (the working
agreement). This was checked with the R1 inventory first. CLAUDE.md RULE 3 cites these routes as an example of "reach,
don't rebuild". This decision closes that example by retirement, because their outcome is now reached through the
filed-state and compile views.

### P-88 — The commitments re-cut, confirmed under RULES 5 and 6

The founder, 2026-11-01, on the RIM session's question, confirming all four points:
1. A fulfilment signed in error is corrected by set-once correction columns on the successor `regulatory_commitments`
   row. No new table.
2. No purge role or `SECURITY DEFINER` function is added. The DELETE gap stays owed (P-41).
3. A milestone's "missed" is derived from its dates and never stored.
4. The signed PMR, PMC and REMS milestone acts and the correction go under launch rows D2 and D5 (`Plan: L1`), not
   under new S9 paths.

The unsigned milestone work for meeting commitments (listing, adding, met and withdrawn) is S9 and needed no decision.

Nothing else in the plan changes.

### P-89 — An unverified figure blocks an approval or a seal unless the signer acknowledges each one

The founder, 2026-11-01. The AI architecture session asked: "Two decisions are still open for you: should an
unchecked figure block a signature unless the signer acknowledges it, and should the self-hosted Docling layout
reader be enabled?" (`docs/design/AI_PLATFORM_BLUEPRINT_GAP_2026-10-25.md`, decisions 1 and 2). The founder answered:
"Yes to all". This is the first of the two; P-90 is the second.

- **What it covers.** An approval, meaning `/e-sign` or `/sign` as APPROVER, and a seal (`/freeze`) of an Authoring
  document. Each is refused while the text being signed states a figure that its section's cited project sources do
  not hold. It may go ahead only when the signer acknowledges every such figure, one by one.
  - Review and authorship signatures are not approvals and are not asked.
- **What "unverified" means.** It means what the existing figure check says (`draft-figure-check.ts`): a figure in a
  section that cites saved project sources, and that those sources do not state.
  - The check runs again at signing, inside the signing transaction, on the text being signed. The save's record goes
    stale on the first edit, so it is not used.
  - When a cited source no longer verifies, its section's figures are listed as unchecked.
  - A figure in a section that cites no sources is never compared with anything, so the checker has no "unverified"
    to report for it. Such figures are outside this decision. Widening the gate to cover them is a further founder
    decision.
- **The record.** The acknowledgement is written on the act's own transaction as a chained trail row,
  `UNVERIFIED_FIGURES_ACKNOWLEDGED`, naming each figure. The act's chained row names its digest. An acknowledgement
  of an earlier text does not cover a changed figure.
- **RULE 2 holds.** The engine says whether a number is in its source. It never supplies one.

Nothing new is built. The figure check, the signing routes and the signing dialog exist; the gate is added to them,
under `Plan: L1` (row D5, Part 11 evidence).
Evidence: `docs/evidence/D5-SIGNATURE-FIGURE-GATE/2026-11-01/`.

### P-90 — The self-hosted Docling layout reader is admitted

The founder, 2026-11-01, in the same answer as P-89. The AI architecture session asked "… and should the
self-hosted Docling layout reader be enabled?", and the founder answered: "Yes to all". This is the second of the
two.

- **What is admitted.** The Docling layout reader (docling-serve), run by the deployment on its own infrastructure.
  - It is reached only through the existing client (`server/integrations/docling/`), behind the existing flag
    `oss.ingestion.docling_primary`.
  - It gives table-cell structure that the current text extractors do not.
- **Where it sits under RULE 2.** It is inside RULE 2's gateway and connector scope, as a self-hosted document
  reader on the deployment's own network. It is not a model and drafts nothing. No document text leaves the
  deployment through it.
- **The one addition.** The reader's service definition: the `docling` service in `docker-compose.yml`, profile
  `ingestion`. It is listed in `docs/design/one-design-plan.json` `approvedAdditions` under L1.
  - Everything else exists, and is reached (RULE 6): the client, the flag, the one text extractor and Vault's two
    ingestion reads.
- **What is not admitted.**
  - **Hosted parsing.** A hosted parsing service (LlamaParse or similar) would send dossier text to a third party.
    It stays rejected.
  - **A second way out.** The reader adds no second path for document text to leave the deployment. When it is off
    or unreachable, ingestion uses the existing extractors and says so.
  - **Hosted production.** Running the reader in the hosted Terraform stack is D1's to decide.
- **Default.** The flag stays off until a deployment turns it on, after showing its reader running.

The work, under `Plan: L1` (row D2): the client speaks the reader's real interface, and Vault ingestion reaches it.
Evidence: `docs/evidence/D2-LAYOUT-READER/2026-11-01/`.

### P-91 — The report-pack register gets its own tables

The founder, 2026-11-01: "And I give you founder approval based on the questions you asked and the suggestion you
offered. Proceed". The reporting session had said that the open `report_bundles` table (coverage review C-3)
"now needs a **founder `approvedAdditions` entry** under RULE 6 before anyone can build it … it isn't a session's
decision". The question and the shape it proposes are in
`docs/evidence/reviews/2026-10-11-reporting-coverage/C3-BUNDLE-REGISTER.md`, "Still open: the table".

- **Why.** A report pack is stored today as one `project_memory_entries` row per covered project, titled
  `bundle:<uuid>`, with its run ids inside a JSON string.
  - The record is duplicated once per project and reconciled in JavaScript (`dedupeByLatest`). Two copies that
    disagree look like one.
  - "List the packs" is `count(distinct title)` over a free-text column, not a count of packs.
  - "Which packs contain this run?" is a scan.
- **What is admitted.** Three tables, listed in `docs/design/one-design-plan.json` `approvedAdditions` under L1:
  - `public.report_bundles`: one row per pack;
  - `public.report_bundle_runs`: the runs a pack contains, one row each;
  - `public.report_bundle_projects`: the projects a pack covers, in place of the row-per-project copies.
- **The terms.**
  - Each table is in `public` with `organization_id INTEGER NOT NULL`, so the tenant sweep gives it a policy.
  - The migration goes into `C2C_MIGRATION_FILES` before the final sweep pair. It is `IF NOT EXISTS`-guarded and
    replays on every deploy (RULE 1).
  - The existing packs are backfilled with `INSERT … ON CONFLICT DO NOTHING`, with a row-count assertion. No DROP:
    the old `project_memory_entries` rows stay where they are.
  - **Replace, not add.** The `project_memory_entries` `bundle:<uuid>` path is moved onto the tables and its code is
    deleted in the same change. No second register is left beside the first.
- **What is not admitted.** No new screen, route file or mount. The register is read and written by the routes and
  the panel that exist.
- **The same answer confirms one design point, which is not a plan change.** In D7-D, "Find a report" is a plain
  search field. It never takes the composer's look, because nothing but the conversation may look like talking to
  AnA (`docs/design/FILING_SPINE.md` §7.2 F6).

The work, under `Plan: L1` (row D2, the launch catalog's Reporting & analytics): the register moves onto its own
tables. Evidence: `docs/evidence/reviews/2026-10-11-reporting-coverage/` (C-3).

### P-92 — A held FDA send can be settled by a signed act, either way

The founder, 2026-11-02, answering the coordinating session's question "An FDA ESG submission is stuck 'held': it was
sent, but no signed MDN (delivery receipt) came back. Today nothing can settle it, because the rollback was removed on
10-17 as it contradicted what FDA held. May a signed act, with re-authentication and the agency's document kept in
Vault, settle it?": **"Allow both."** The question was raised by the D7-record session (`015weq…`,
`docs/evidence/W5/2026-11-01/README.md`, "For the founder" 1, item A5).

- **What is decided.** A held send may be settled by one of two signed acts, each with re-authentication and the
  agency's document retained in Vault and linked to the act:
  - **recorded as received**, on Ack2 or Ack3 evidence from FDA;
  - **released as not received**, only on FDA's written confirmation of non-receipt. The act states the
    duplicate-filing risk to the signer before they sign.
- **What is not decided.** No settlement without the agency document; no settlement by an unsigned action; the
  removed rollback route stays removed.
- **Owner.** RIM (`011e42…`), under F1, in the files it holds (`submission-service.ts`, `fda-esg-receipts.ts`).

### P-93 — FDA sequences over 1 GiB are out of scope for launch

The founder, 2026-11-02, answering "FDA sequences larger than 1 GiB: the only code path is an SFTP transmit, and
nothing in the repository documents FDA accepting SFTP. Are they in scope for launch?": **"Out of scope."** Raised by
the D7-record session (`docs/evidence/W5/2026-11-01/README.md`, "For the founder" 2).

- **What is decided.** A sequence over the size the documented channel takes is refused **before signing**, with a
  plain message, from `sequenceTransmitReadiness`. The undocumented SFTP transmit (`transmitViaSftp`,
  `ssh2-sftp-client`) is retired: removed, its reachable replacement being that refusal, named by path in the
  removing commit (working agreement).
- **Owner.** RIM, under F1.

### P-94 — An onboarding upload is approved before it can be filed

The founder, 2026-11-02, answering "A PDF uploaded during onboarding (`ctd_onboarding_documents`) has no approval
state, so it can be filed without anyone approving it. Must an onboarding upload be approved before it can be
filed?": **"Yes, approve first."** Raised by the D7-record session ("For the founder" 4).

- **What is decided.** An uploaded leaf goes through the same approval as an authored one before it can be placed in
  a sequence. Readiness and transmit both refuse an unapproved upload, as they do an unapproved authored leaf.
- **Owner.** RIM for readiness and transmit (F1); the approval itself uses the existing approval act, nothing new.

### P-95 — Review is mandatory before a regulated document is approved

The founder, 2026-11-02, answering "A Concept2Cure document can be approved with no reviewer assigned, by design, and
no screen assigns reviewers today. Should review be mandatory before approval?": **"Mandatory for regulated docs."**
Raised by the D7-record session ("For the founder" 5; `artifact-approval-act.ts`).

- **What is decided.** A regulated document cannot be approved until at least one assigned reviewer has completed
  review. The existing reviewer-assignment route is reached from the one editor's Review panel (D4, the inspector),
  not from a new screen.
- **Owner.** The server refusal under F1 (the D7-record session, which found it, with the file list cleared by the
  coordinator); the reach under D4 (the coordinator's editor lane).
- **Still to settle, not by a session:** which document types count as regulated is read from the document-type
  catalog's existing classification; where the catalog does not say, the document is treated as regulated (fail
  closed).

*Clarification, 2026-11-09 (the coordinating session, `01JbQU…`, under the founder's delegation of 2026-11-08, P-107).*
The record assumed the one editor could reach the artifact reviewer routes. It cannot, because the editor and the
approval act work on two different records:
- **The editor's document.** The editor opens an authoring document. Its approval is the APPROVER e-signature,
  `POST /api/authoring/docs/:docId/e-sign` in `server/routes/authoring.router.ts`.
- **The conversation artifact.** The approval act and its reviewer routes govern AnA's conversation artifact:
  `server/services/artifact-approval-act.ts`, and `POST …/artifacts/:artifactId/reviewers` in
  `server/routes/c2c/artifacts.ts`.
- **No link.** No editor document holds an artifact id. The projection between the two records was retired on
  2026-10-17 (`server/services/ana/authoring-canonical-bridge.ts`) and stays retired.

Both records file: `server/services/ectd/leaf-source-resolver.ts` admits an approved authoring document and an approved
or locked artifact. So:
- **Every door that makes a document fileable applies P-95, each with its own record's review.** This answers open
  question 3 of `docs/evidence/W5/2026-11-01/p95/README.md`. Neither record is bound to the other to borrow its review.
- **The editor's document.** The APPROVER e-signature is refused with `REVIEW_REQUIRED`, before the credential, unless
  the document's review route is complete over the content being approved. Complete means every named reviewer has
  signed as REVIEWER on the current sections digest (`authoringStanding`,
  `server/services/authoring/authoring-review-route.ts`, RR5).
  - **What does not count:** a review requested before RR5 (`legacy`), a withdrawn or returned route, and a complete
    route over older content. The remedy for each is to send the document for review again.
  - **The reach already exists:** "Send for review" in the editor's Review tasks rail and on the canvas card
    (`editor/SendForReviewDialog.tsx`). D4 makes the refusal and its remedy legible where Approve is offered.
  - **Owner:** the coordinating session, the server refusal under F1 and the reach under D4.
- **The conversation artifact.** The planned refusal (changes 1 to 6 of the evidence) stays held until the artifact's
  own reach exists. Today AnA's signed `update_artifact_status` is the artifact's only approval in the product, so the
  refusal alone would refuse every artifact.
  - **Its reach is the conversation's artifact panel** (`client/src/concept2cure/v2/surfaces/ConversationThread.tsx`),
    which already sends an artifact to review. That send names the reviewers through `POST …/reviewers`, and a named
    reviewer decides there through `POST …/reviews/submit`. It is the canvas beside the conversation
    (`docs/design/ONE_ANA_ONE_CANVAS.md`), not a new screen.
  - **Owners:** the reach, S4's holder of that file (the Anna runtime epic, `01KZK3…`); the refusal, the D7-record
    session as before, landing after the reach.
- **What counts as a review (open question 1).** The reviewer is neither the approving signer nor an author, read as
  P-18 reads authors. An approver who signed as a reviewer on the same route or round cannot approve that version.
  This applies on both doors.
- **How many reviewers (open question 2).** Where the document's contract names `regulated_dual_review`
  (`shared/types/document-contract.ts`), at least two named reviewers must complete review. That is the type raising
  the floor through data, as NEW-4 allows (`docs/design/REVIEW_ROUTING_2026-10-23.md` §4). It lands as its own slice
  after the one-reviewer refusal.
- **Unchanged:** nothing is retroactive, an approval before P-95 stays approved, and no file, route, table, screen or
  tool is added (RULE 6).

### P-96 — An acknowledgement recorded as FDA's before DP-81 is marked in the product

The founder, 2026-11-02, answering "Before the DP-81 fix, some acknowledgement downloads were recorded as coming from
FDA ('agency') without being verified. The records are corrected going forward. Do sponsors who already have such a
record need to be told?": **"Mark it in the product."** Raised by the D7-record session
(`docs/evidence/W5/2026-11-01/README.md`, "For the founder" 3; DP-81 fixed in `8d5bbef3b`).

- **What is decided.** Each acknowledgement recorded as the agency's before the DP-81 fix, and not verified as FDA's,
  gets an audit-trailed correction and a visible note on its submission: this acknowledgement was not verified as
  FDA's. No outbound email or notice.
- **How it reaches a deployed database (RULE 1).** The correction is data, so it lands only through a file in
  `C2C_MIGRATION_FILES`, guarded to run once per row (it marks; it never deletes or rewrites the original record),
  with a row-count assertion and its audit row in the same statement set.
- **Owner.** RIM (`011e42…`), which holds `fda-esg-receipts.ts`, with the D7-record session's DP-81 evidence; under F1.

### P-97 — A project that already filed keeps its filed state when eCTD compile is refused

The founder, 2026-11-02, answering "RIM is about to refuse eCTD compile for document-class and regional device
projects. A project of that kind that already has a dispatched sequence would lose its filed-state view. Nobody here
can query the deployed database to check whether any exist. How should RIM proceed?": **"Keep filed state
regardless."**

- **What is decided.** Filing types' 3b slice 3(c) refuses compile, status and validate for a filing-class or regional
  device project with 422 `ECTD_NOT_APPLICABLE`, **except** that a project with any dispatched sequence keeps its
  filed-state view (read-only). The deployed-row query is no longer a precondition: nothing filed is hidden either way.
- **Owner.** RIM, under F1, with the client's 422 handling in the same change.

### P-98 — Numbered comments inside an FDA response in meeting minutes are not offered as questions

The founder, 2026-11-02, answering "When FDA meeting minutes contain an FDA response with its own numbered comments,
should those comments be offered as questions for the sponsor to answer?": **"Not offered."** Raised by RIM's S10
design (item 4).

- **What is decided.** They are FDA's responses, not open questions. The letter splitter does not offer them, and the
  letter shows a note saying they were not offered as questions.
- **Owner.** RIM, in S10.

### P-99 — An unrecorded sent sequence is re-derived from its bytes, or restored by a signed statement

The founder, 2026-11-02, answering "RIM's slice 1 found that a sequence could be marked sent or acknowledged with no
record of what was transmitted. The next sequence of such a submission is now refused, and the screen names the gap.
How should a sequence like that be put back on record?": **"Re-derive, else signed statement."** Raised by RIM's F1
slice 1 (`090f62af1`, its evidence README, "Owed, not built here").

- **What is decided.** Where the exact sent bytes were kept (sends since `3cab286e1`, 2026-10-29), the transmit record
  is re-derived from them deterministically, with its derivation recorded. For an older send, the record is restored by
  a signed statement of what the sequence carried, with re-authentication and the agency's acknowledgement kept in
  Vault and linked to the act. Neither path invents a leaf the bytes or the statement do not name.
- **What is not decided.** A re-filing is not required. Nothing restores a sequence silently.
- **Owner.** RIM, under F1, after slice 2.

### P-100 — While the coordinator is unavailable, each session records its own progress in the plan

The founder, 2026-11-05: **"The coordinator is out of tokens so you need to be proactive and update the plan with your
work achievements."**

- **What is decided.** A session records what it delivered under its package in the plan's progress log
  (`docs/design/ONE_DESIGN_PLAN.md` §3a), in a `Plan: PLAN` commit carrying `Founder-Decision: P-100`. An entry states
  facts only:
  - the commits, by SHA;
  - the evidence, by path;
  - what was found;
  - what is next.
- **What is not decided.** A progress entry changes no package's scope, paths, status or ownership. It adds no screen,
  mount or table. Closing a package is still the founder's or the lead's act (§3, step 5). Any other change to the plan
  still needs its own founder decision.
- **Owner.** Each session, for its own package.

### P-101 — The statistical analysis plan is written in the one editor; the second SAP system converges into it

The founder, 2026-11-05, answering "the SAP is a document type in the one editor, and a separate SAP system also exists
on the server (biostatPlatform.ts …) with no screen. Which is the SAP?": **"Converge into editor."** The question was
raised by R1 (`docs/evidence/DESIGN/R1/2026-11-05-handoffs-and-decisions/README.md`, Decision A).

- **What is decided.** The SAP is written in the one editor, as every document type is (Rule 4), as
  `statistical_analysis_plan`. The useful engines of `server/routes/biostatPlatform.ts`'s statistics thread are
  reached as that document's functions in the editor:
  - analysis specifications;
  - TLF shells;
  - the CSR-section generator.

  Its own SAP store (section edit, comments and their resolution, amendments, lock, versions) is retired. It is
  migrated and deleted in the same change that reaches its replacement (working agreement: zero duplication; name
  the replacement by path).
- **What is not decided.** The order of the work, and whether any statistics-thread engine is itself retired. That
  is for the owner after a "what already exists" review.
- **Owner.** The one editor's holder (D4), with S3 for the engines' behaviour. It waits for the CSR demo, as D4-3
  does.

### P-102 — Informed consent is one record: the 21 CFR 50.25 checklist becomes the document type's checks in the one editor

The founder, 2026-11-05, answering "should the /api/protocol-consent checklist and approval become the consent
document's checks inside the one editor, as one record?": **"Yes, one record."** The question was raised by R1
(`docs/evidence/DESIGN/R1/2026-11-05-handoffs-and-decisions/README.md`, Decision B).

- **What is decided.** The `informed_consent` document type carries the 21 CFR 50.25 required-element checklist and
  its completeness as the editor's checks for that type. Its approval runs through the editor's one signing. The
  structured record behind `/api/protocol-consent` converges into that one record, not beside it. The protocol
  workspace's Consent tab stays read-only until then.
- **Owner.** The one editor's holder (D4), after the CSR demo. It was handed to them on 2026-11-05
  (`COORDINATION.md`).

### P-103 — The submission-ops package path is retired; the sequence is the one filing path

The founder, 2026-11-05, answering "retire the six /api/submission-ops/packages/* routes? They are a second filing
store that the sequence replaced on 17 Oct (FILING_SPINE F12)": **"Retire them."** The question was raised by R1
(`docs/evidence/DESIGN/R1/2026-11-05-handoffs-and-decisions/README.md`, Decision C).

- **What is decided.** The routes are unmounted, or excluded from the launch scope (`LAUNCH_EXCLUDED_API`, with the
  F12 reason):
  - `GET/POST …/packages/:id/milestones`;
  - `POST …/packages/:id/preflight`;
  - `POST …/packages/:id/publish`;
  - `GET …/packages/:id/readiness-history`;
  - `PUT …/packages/:id/regulatory-identifiers`.

  The replacement is the sequence: Submission Center → sequence → Validation, Dispatch, sign, transmit
  (`SubmissionSeqWorkspaces.tsx`; `POST /api/submissions/sequences/:id/transmit`). No package can be locked for
  export outside it.
- **What is not decided.** Whether other `/api/submission-ops/*` routes that a screen still calls are kept. Each is
  judged on its own.
- **Owner.** RIM, which holds S5.


### P-104 — Extend the existing Anna runtime from the multi-agent architecture specification v0.5

The founder, 2026-11-06, supplied **MULTI-AGENT-ARCHITECTURE-SPEC-20261106-v0.5.pdf** and directed:

> "Study the attached document, align to the current roadmap, and add the attached plan to the current roadmap,
> and you own this end to end. This is your assignment to build all of this in a very sophisticated way, not by
> building new files, but extending what we already have done. Extend and bring to life. Build this out."

- **What is decided.** Add one Anna-runtime epic to the canonical plan (§1d), mapped onto existing open packages
  S1–S12 and D4, then extend the implementation in those existing homes. The supplied §15 plan-only handoff is
  superseded by this explicit build instruction. Native in-product orchestration is the target; workers propose,
  Anna disposes within runtime gates, humans sign/approve consequential actions. Parallel agents use distinct files
  under one lead, on `concept2cure-v2`.
- **Build order and evidence.** Preserve §11 phases 0–8 with the §14.4 spike expanded by §§19/23/26. Each downstream
  phase waits for its fixture gate. §29 shared learning and §32 clean-file feedback follow the isolation/custody/
  routing walls; no local test or code audit is represented as production qualification.
- **Account direction reconciled.** The 2026-10-01 platform-or-client option in
  `server/services/submission-gateways/gateway-accounts.ts` is the existing behavior. The supplied §17.2 now sets
  the target for client filings to client-owned authority accounts with scoped revocable grants, exact-content
  approval and no house-account fallback. Existing account rows and historical sender identities are not rewritten
  by this decision; S5 must implement and prove the transition explicitly. Other authorities remain record-only
  until their transport and verified onboarding are supported.
- **Existing path scope.** S4 also covers the existing AI gateway, connectors, working/session memory and Vault
  classification readers; S10 covers the existing orchestration route and pre-submission verdict. These additions
  to package paths approve completion of current files only.
- **What is not admitted.** No new file, screen, route, mount, service, table, tool, dependency or model. Extend the
  existing code and records; a requirement needing an addition is recorded as a precise unresolved dependency.
  Preserve the one editor, one sequence filing path, current client/jurisdiction/composition scope, independent
  read-only workers, approved-model/PQ controls and human signing. No agency account creation, transmission,
  provider enablement, certification claim or deployment is implied by roadmap status.
- **Owner.** The lead owns end-to-end integration and acceptance; existing package owners keep their file holds.
  The current roadmap is `docs/design/ONE_DESIGN_PLAN.md` and `docs/design/one-design-plan.json`, not the historical
  CER-only or January vision roadmaps. Progress must name actual commits, checks and remaining dependencies.

### P-105 — Spec v0.5 is the current Anna-runtime specification (v0.4 superseded), and one session owns the epic alone

The founder, 2026-11-08, first supplied **MULTI-AGENT-ARCHITECTURE-SPEC-20261105.md** (v0.4, §§1–15) and directed:

> "Stay perfectly aligned to the new roadmap and rules. But you must add the attached plan to the main new roadmap
> and you own all of the attached alone."

Then, the same day, a correction, supplying **MULTI-AGENT-ARCHITECTURE-SPEC-20261106-v0.5.pdf**:

> "Correction — there's a newer version than the one I just sent. v0.5, from November 6 (105 KB, 32 sections),
> supersedes v0.4. … this is the current plan."

- **What is decided.**
  1. **v0.5 is the current specification, and v0.4 is superseded.**
     - v0.5 is the version P-104 placed at `docs/design/ONE_DESIGN_PLAN.md` §1d.
     - Its source of record is now in the repository: `docs/design/MULTI-AGENT-ARCHITECTURE-SPEC-20261106-v0.5.pdf`,
       sha256 `4564aff5d1da81520ed187abf5d5f20be11f74c7d407244bba33d685229b36c4`.
     - Its change note says §§1–15 are unchanged from v0.4. §1d maps every one of its 32 sections onto the epic.
     - v0.4 §15's "consider and plan, do not build yet" stays superseded by P-104's build instruction.
     - It is one epic, not a second backlog.
  2. **The Anna-runtime epic has one owner:** the Claude Code session `session_01KZK3jgtmQBgNepqLjXjS3k`. The epic is
     `architectureEpics` `anna-runtime` in `docs/design/one-design-plan.json`.
     - It replaces the Anna architecture lead (Codex, 2026-11-06) as the epic's lead, for sequencing, integration,
       acceptance and the epic's progress log.
     - No other session takes an epic slice.
- **What is not decided.**
  - Other packages' scope is unchanged, and so are their holders' file holds for their own work (plan §4.6, one
    session per file). When an epic slice needs a file someone else holds, the owner asks for it in
    `.design/claude-convergence/COORDINATION.md`.
  - §14.5's open questions stay open, because P-104 does not decide them:
    1. Is Anna customer-facing first, or internal-only?
    2. What is the model cost and latency budget per document type?
    3. Do Anna's internal dispositions need the same IQ/OQ validation package as user-facing approvals? That is to
       be scoped with the first design partner.
  - No new file, screen, route, mount, service, table, tool, dependency, integration or model is approved (RULE 6).
    §13.2's vendors are suggestions, not admissions. Committing the specification PDF as the source of record is a
    document, not a capability.
  - P-104's account target, its gates and its phase order are unchanged.
- **Owner.** `session_01KZK3jgtmQBgNepqLjXjS3k`.

### P-106 — The ten IND lifecycle routes with no caller are retired; a sequence's verdict is read per project only

The founder, 2026-11-08, confirming in the RIM session (`011e42…`) the decision the coordinating session relayed on
2026-11-02. Its record commit (`9bb710e98`) never reached origin, and the number it carried was used for P-100. P-105 was taken the same day by the Anna-runtime decision above. The
question was raised by the RIM session's caller check against the corrected R1 inventory (`d8f559377`). The answer:
**"Yes, record and retire."**

- **What is decided.** Ten IND lifecycle routes are retired:
  - `POST /api/ind-lifecycle/sequence/:seqId/dispatch-gate`;
  - `POST /api/ind-lifecycle/sequence/:seqId/dispatch-gate/snapshot`;
  - `GET /api/ind-lifecycle/sequence/:seqId/snapshots`;
  - `GET /api/ind-lifecycle/sequence/:seqId/validate`;
  - `POST /api/ind-lifecycle/submission/:id/cockpit`;
  - `POST /api/ind-lifecycle/submission/:id/drift`;
  - `GET /api/ind-lifecycle/portfolio/drift`;
  - `GET /api/ind-lifecycle/portfolio/drift/csv`;
  - `POST /api/ind-lifecycle/submission/:id/dashboard`;
  - `GET /api/ind-lifecycle/submission/:id/overview`.

  Nothing in the client, AnA, MCP or scripts calls them. Each reads the one assessor (`annotatedGatesForSubmission`)
  and writes nothing, except the snapshot route, the only writer of `ind_dispatch_snapshots`.
- **Also decided: no organisation-wide verdict list.** A sequence's verdict is read per project only.
- **The replacement, named by path in the removing commit:** `GET /api/submissions/sequences/:seqId/dispatch-readiness`,
  shown in `client/src/concept2cure/v2/surfaces/SubmissionSeqWorkspaces.tsx` (Validation, Dispatch) and in
  `ProjectMarkets.tsx` / `DispatchReadiness.tsx` (Submit). A Validated stage that no longer holds is shown through
  `validatedStage`.
- **Services.** A service only these routes use is deleted with them. A service another caller still reads is kept,
  each checked by import, not by name.
- **Superseded.** P-33's sentence "The IND routes keep their paths". Its one-assessor rule stands.
- **What is not decided.** Nothing is dropped. `ind_dispatch_snapshots` stays (RULE 1). Its migration,
  `20260610_ind_dispatch_snapshots.sql`, is in the install-fresh baseline only, not in `C2C_MIGRATION_FILES`.
- **Proof the removing commit carries:**
  - the dispatch-readiness route is shown still reached;
  - the R1 inventory is run again, showing the ten are gone and no other route lost its caller;
  - the history search (`git log --all --diff-filter=D`);
  - the plain-text segment searches.
- **Owner.** RIM, under `Plan: R1`, after F1 slice 2, together with P-87's deletion of the IND diff and manifest
  routes.

### P-107 — Decided under the founder's delegation: the rail, Anna's first audience and budgets, Vault parity, and R1's next area

The founder, 2026-11-08. The coordinating session offered to put open questions to the founder: whether Biostatistics
belongs on the rail; Anna's three §14.5 questions; Vault parity's questions; R1's next area and its 171 retirement
candidates; `011Dpx…`'s progress entry; and the unassigned D3-4 and S12. The founder answered: **"No you decide as the
global sme."** The coordinating session decided as follows, as P-28 was decided under the founder's delegation of
2026-10-07. The founder may overrule any item by a later decision.

- **What is decided.**
  1. **Biostatistics stays on the rail.** This confirms `scripts/ci/one-product-baseline.json`
     `founderDecisions["rail:biostatistics"]`, which `5144702d21` wrote from the founder's words of 2026-11-06 without a
     decision number. Its basis: those words name biostatistics among the core modules, and the rail as their
     navigation point. It is a work area over the project's data, not an app. Its documents (the SAP, the TLFs) are
     written in the one editor (P-101). RULE 4's 2026-10-31 list of Core work workspaces to converge is superseded for
     Biostatistics' rail entry only.
  2. **Anna (P-104/P-105 §14.5).**
     - **Internal first.** Today's AnA serves customers under human signing, unchanged.
       - Anna's multi-agent dispositions (workers that propose, a lead that disposes) run internally and for a design
         partner by opt-in.
       - Each disposition reaches customers one capability at a time, after that capability's §11 phase gate passes and
         its model is PQ-passed. Today none of the 16 PQ entries has passed.
       - "Show team" stays off by default.
     - **Cost and latency are budgeted from measurement, per document type.**
       - The §14.4 spike measures each type on its fixtures. The cap is twice the measured p95.
       - At a cap the existing run control stops and asks a person; it never truncates silently, and it never answers
         with a partial result labelled complete.
       - Until a type is measured: an interactive answer has 60 seconds, a background build has 30 minutes, and no run
         starts without a cap.
       - Budgets are recorded beside the approved-models entry, with their measurement.
     - **Internal dispositions are inside the validation package, by risk (GAMP 5 / CSA).**
       - A disposition that can change governed content, a figure, a gate's verdict or a filing gets OQ scripts with
         fixtures in the D4 package.
       - A disposition that only orders, routes or summarises for a person is covered by the risk assessment.
       - Human signing of consequential acts is unchanged.
  3. **Vault parity (`01KnUG…`'s questions; the Vault plan's FD3; MR-08 Stage 6 step 4).**
     - **No cross-sponsor library view for a CRO.** With no project open, the Vault first asks which sponsor; every
       view is inside one sponsor. Search never spans sponsors.
     - **Device coverage follows the eSTAR mapper's per-device slots**, the filing's own structure. The rule pack's
       mandatory flags converge onto the mapper, so one rule remains. The D4 and D6 disagreement is a defect,
       repaired red first.
     - **A seal says when its version has been superseded** ("superseded by version n on date"), read from the version
       chain. What was sealed, and whether it is intact, is unchanged.
     - **Retention is FD3 (c).** No version is destroyed during a tenant's life; retention may only tombstone, and the
       refusal of VR-07 stands. S3 Object Lock in governance mode and noncurrent-version retention go to the D1 lane
       with the AWS account. A destruction policy needs a later decision with a written schedule.
     - **Renditions:** each version gets a PDF rendition through the existing converter (`pdf-converter.ts`), bound to
       the source version's SHA-256 and shown in the viewer. A rendition is never filed in place of its source.
     - **Binders** are views over folders and version links. A project's editors may edit them, each edit is audited,
       and a binder never alters a document.
  4. **R1's next area is CMC / Module 3, then RBM**, the featured work areas (P-79). CMC's approve route not checking
     method validation (plan §3a, D5/S7) shows its reach is not proven.
  5. **The 171 route files with no caller.** A route is retired by the lane that owns it, under R1, when both hold:
     - it has no caller in any history;
     - it duplicates a capability that is reachable.

     The rest of the procedure:
     - The commit names the replacement by path and re-runs the R1 inventory.
     - Retirements go in batches of up to 20.
     - Nothing is dropped from the database (RULE 1).
     - A route whose capability exists nowhere else comes back as a reach proposal, not a retirement.
  6. **`011Dpx…`'s progress entry** may be committed. Recording a session's own progress is what P-100 is for, and it
     is not a plan amendment.
  7. **D3-4 (the step bodies), then S12 (work projects),** go to one project-page session, started by the coordinating
     session. It holds `Project*.tsx` in COORDINATION first.
- **What is not decided.** These stay with the founder:
  - the founder's own actions: rotating the Neon owner passwords and the Hugging Face token; a model key; the Codespace
    image's Debian and PostgreSQL hosts; the AWS account for D1;
  - every other open question in the plan, unless named above.

  No new file, route, table, screen, tool or model is approved (RULE 6). Every item above extends existing code.
- **Owner.** The coordinating session records and routes:
  - item 1: done here;
  - item 2: the Anna-runtime owner `01KZK3…`;
  - item 3: the Vault parity lane `01KnUG…`, or S6's holder;
  - items 4 and 5: R1's session;
  - item 7: the new project-page session.

### P-108 — Held FDA sends, retiring and size, onboarding uploads, and restoring an unrecorded send: RIM's recommendations accepted

The founder, 2026-11-08, answered four questions put in the coordinating session (`01JbQU…`). They were RIM's open
questions from its designs for P-86, P-92, P-93, P-94 and P-99 (`docs/evidence/RIM/2026-11-08-designs/`), each put with
RIM's recommendation. The founder accepted every recommendation.

1. **Held FDA sends (P-92).** Asked: "(a) Once an Ack3 has arrived, 'received' needs the Ack3 to accept; a failed Ack3
   after an Ack2 is recorded as a technical rejection. (b) Where the platform's own record proves nothing left (no
   message formed, refused before the wire), a narrow signed release may cite that proof instead of a letter from FDA,
   since FDA can't confirm a send it never got. (c) If FDA's verified answer later contradicts a signed settlement,
   FDA's answer wins, through a second signed act that re-opens it; both records are kept, and resends are refused
   meanwhile." Answer: **"Accept all three."**
   - **(b) amends P-92:** for a send the platform's own record proves never left, a signed release cites that proof,
     not FDA's written confirmation of non-receipt.
   - (a) means completing `filed-sequence-rejection.ts` for the sequence spine, under F1.
2. **Retiring sequences and the size limit (P-86, P-93).** Asked: "(a) A production attempt that records nothing
   reached FDA (released as not received on FDA's written confirmation, or refused before any connection) is not a
   'bound production send', so the sequence can be retired by P-86's signed act. (b) The 1 GiB limit has no FDA source:
   FDA's documented maximum is 10 GB (Form 5640 v2.0). Build at 1 GiB anyway, since that fails closed, and never call
   1 GiB FDA's limit. (c) Build no settlement path for a legacy hold older than the per-attempt binding of 2026-10-14;
   the runbook escalates if one is ever found (expected zero)." Answer: **"Accept all three."**
3. **Onboarding uploads (P-94).** Asked: "(a) An upload counts as approved when the same bytes, matched by content hash,
   are already approved by the Vault's existing act in the same project, with no new act. The alternative is
   requiring every upload to be replaced by a Vault version. (b) Retire ctd_onboarding_documents as a source of
   placeable leaves; it has no upload caller in any history and no deploy applier. Its replacement is
   VaultPlaceIntoSubmission.tsx." Answer: **"Accept both."** The coordinating session's ruling of the same day reads
   "placed" in P-94 as "filed".
4. **Restoring an unrecorded sent sequence (P-99).** Asked: "(a) If a sequence was sent with no compile and no kept
   bytes, accept the sponsor's own copy of the package when its SHA-256 matches the one recorded for that send;
   otherwise it needs a re-filing. This depends on MR-08's open question about admitting .zip files to Vault. (b) A
   sequence known only from its compiles counts as unrecorded: re-derived from bytes it becomes 'transmit', and a
   statement restores it only as 'statement'. (c) A kept package that can no longer be read is an integrity incident,
   never covered by a statement. (d) A signed statement cannot be superseded for now; a correction is a later
   sequence." Answer: **"Accept all four."**

- **What is not decided.**
  - MR-08's question about admitting `.zip` files to Vault stays open; 4(a) depends on it.
  - Raising the 1 GiB limit stays with the founder, when a larger channel is documented.
  - The coordinating session's rulings on RIM's coordinator questions are coordination, not founder decisions. RIM
    appends them to its designs.
- **Owner.** RIM (`011e42…`), under F1 and S5, in the order recorded in COORDINATION.md.

### P-109 — S12's work projects live inside their filing project; a deliverable is a Vault version family

Decided 2026-11-08 by the coordinating session (`01JbQU…`) under the founder's delegation of that day ("No you decide as
the global sme", P-107). The project-page session (`01FTWcmX…`) asked four questions after inventorying S12
(`docs/evidence/SPINE/S12/2026-11-08-what-already-exists/README.md`).

- **What is decided.**
  1. **A work project is a child of its filing project.** It hangs off the filing project's anchored integer `projects`
     row (`parent_project_id`, depth 2 or 3) and is anchored to the same `regulatory_programs` row. It is reached through
     the existing `server/routes/project-hierarchy.ts`. A work project gets no new `program_type`, and `projects.ts` and
     `project-intake.ts` do not change.
  2. **No cross-project exception.** Because a work project sits inside its filing project's program, its deliverable
     feeding that filing is a citation within one program. `citation-ends.ts`'s isolation rule is unchanged.
     - Reusing a deliverable across different programs, such as an IND's CMC work feeding the NDA, stays refused until
       a later decision.
     - If `citation-ends.ts` checks the integer project id rather than the program, the session reports that before
       changing anything.
  3. **A deliverable is a Vault document's version family**, the governed record.
     - Only an approved version feeds a filing section.
     - `c2c_artifact_section_map` is the link from a Vault family to the section it feeds, with its owner and due date.
       It is not a second deliverable store.
     - Data-room sources stay inputs, with their lineage.
     - Vault changes go through S6's holder.
  4. **S12's ledger paths gain `server/services/c2c/program-project-anchor.ts`**, so the anchor accepts a parent.
     Nothing else is added.
- **What is not decided.** Feeds across programs. Whether a work project may outlive or move between filing projects.
  No new file, route, table, screen or tool is approved (RULE 6).
- **Owner.** The project-page session (`01FTWcmX…`), which holds D3's files for S12.

*Clarification, 2026-11-09 (the coordinating session, under the same delegation).* Item 1's wording, "anchored to the
same `regulatory_programs` row", would break PF-08: `migrations/20261001b_projects_one_anchor_per_program.sql` allows one
anchor row per program, and every anchor reader assumes it. The project-page session found this before writing code.
So:
- **The work project's row.** It has `regulatory_program_id` NULL and `parent_project_id` set to the filing project's
  anchor row (depth 2 or 3), with its path from `recomputePaths`.
- **Its program.** It is the root ancestor's program, read through the existing ancestor query.
- **What stays under the anchor.** Governed artifacts, exports and the Vault stay filed under the program's one anchor
  row.
- **Its kind.** It is `projects.metadata.workKind`, one of `cmc`, `biostatistics`, `rbm`, `data_management`,
  `clin_pharm` or `nonclinical` (P-83). `projects.type` stays `'regulatory'`, and its domain is not widened.
- **The create door.** It is one POST on the existing `server/routes/project-hierarchy.ts` router.
  - It requires the editor role, the same organisation and the program's admission.
  - The parent must be the anchor or one of its descendants.
  - It writes through a new writer in `program-project-anchor.ts`, in a transaction with an audit row. That writer never
    sets `regulatory_program_id`.
  - It is an endpoint in an existing route file, not a new file or mount.

Items 2 to 4 are unchanged. `citation-ends.ts` compares program UUIDs, so a citation from a work project to its filing
project is within one program.

*Second clarification, 2026-11-09 (the coordinating session, under the same delegation).* The first clarification put
the create door on `server/routes/project-hierarchy.ts`. That door, "hierarchy child create", was retired on
2026-10-26 by A2.9, which left canonical intake as the one HTTP creator of projects
(`docs/evidence/D2-CLIENT-JOURNEY/2026-10-26/slice-A2/A2.9/README.md`; `ci:project-creation-owners`). The coordinating
session approved it without that history, and the gate refused the slice. Corrected:
- **The one door.** A work project is created through canonical intake, `POST /api/c2c/projects`, with an optional
  `{ parentProjectId, workKind }`.
  - **The work-project branch** checks the editor role, the admission of the parent's program, a parent within that
    program's anchor tree, and `workKind` from P-83's six. It skips the program, quota, pathway and scaffold steps that
    do not apply.
  - **Without those fields,** intake is unchanged.
- **The one writer.** The child row is written by the anchor file's one existing `projects` writer, extended to take an
  optional parent (`regulatory_program_id` NULL when it has one). `ci:project-creation-owners` keeps `count: 1`, and no
  gate is widened.
- **The retired door stays retired.** The hierarchy `POST` is dropped; the governed children read stays.
- **S12's ledger paths gain `server/routes/c2c/projects.ts`.**

*Third clarification, 2026-11-09 (the coordinating session, under the same delegation).* Item 3 named
`c2c_artifact_section_map` as the link from a Vault family to the section it feeds. It is not one. The project-page
session (`01FTWcmX…`) found this before writing code. The table (`migrations/0002_phase15_submission_ops.sql:41-52`)
links a conversation artifact (`concept2cure_artifacts`) to a Submission Ops package section
(`c2c_package_sections`). It has no key for a Vault document or family, none for an editor section, and no due date.
Using it would have made a second deliverable store, which item 3 forbids. Corrected:
- **The link is the one that exists.** A section is fed by the Vault version it was drafted from. That is
  `document_span_lineage` with provenance `vault_document`, the Vault version's id and content hash:
  - written by `server/services/clinical-regulatory-evidence/span-lineage-vault.ts`;
  - read by `server/services/vault/vault-where-used.ts`;
  - retired by the lineage gate.
  `c2c_artifact_section_map` stays as Submission Ops' own, and no second link is made.
- **"Only an approved version feeds a filing section."** The section is flagged as changed when a live `vault_document`
  span cites version V and a later version in V's family (`vault-version-family.ts`) is at a STEADY stage
  (`vault-lifecycle.ts`). The flag shows in the project's changes list, in Evidence and in the editor rail ("replaced
  since cited"). It is built on S12's existing source-usage reads. A later version that is not yet approved does not flag
  the section, and neither does a retired span.
- **No Vault file is edited.** The Vault's rules are imported read-only, with no new table, route or column. A
  deliverable's owner and due date come from its work project (`projects.owner_id`) and that project's existing tasks.

### P-110 — CMC: suitability is a signed act, and an under-described substance is not composed as a small molecule

Decided 2026-11-09 by the coordinating session (`01JbQU…`) under the founder's delegation of 2026-11-08 ("No you decide
as the global sme", P-107). The CMC session (`01GJidg5…`) raised both questions in `4b9af67aa0`
(`.design/claude-convergence/COORDINATION.md`), with options in its evidence.

1. **An analytical method is recorded as suitable only by a signed act, never by an edit.**
   - **The finding.** The specification approval gate admits a validated or a suitable method (`METHOD_SUITABLE`,
     which `q2Expectation` in `services/cmc/ich-compliance-q2.ts` relies on before phase 3). But no form can record
     suitability, so in practice every limit needs a fully validated method
     (`docs/evidence/S7/2026-11-09-demo-cmc-methods/`).
   - **Decided: option (b), by extending the existing act.** The signed validation act
     (`POST /api/cmc/analytical-methods/:id/validate`, `server/api/cmc/routes.ts`) takes an outcome:
     - `validated`, as today;
     - or suitable for its phase, with the signer's reason and the phase.
     It is the same ceremony, the same audit and the same route; there is no second endpoint. This follows what FDA asks
     at phase 1: procedures that are scientifically sound and fit for their use, with full validation by the
     pivotal phase (21 CFR 312.23(a)(7); ICH Q2(R2) and Q14).
   - **Option (a), the unsigned `qualified` status, is refused, including as an interim.** A word typed into a GxP
     register must not unlock an approval that validation reaches only by signature. Until the act takes its new
     outcome, today's stricter behaviour stands: only a validated method supports an approved limit.
   - **Owner.** The CMC session (S7). Tests are red first, and `METHOD_SUITABLE`'s words are read only from the signed
     outcome.
2. **The composition boundary fails closed when the modality is inferred rather than recorded.**
   - **The finding.** `classifySubstanceModality` (`server/services/cmc/substance-modality.ts`) reads "a recorded
     chemical process, and nothing suggesting biology" as a small molecule. So a terse route admitted a monoclonal
     antibody into small-molecule Module 3 composition (`docs/evidence/S7/2026-11-09-demo-cmc-materials/`, mutation 5).
   - **Decided: option (a).**
     - `compositionRefusal` (`server/services/cmc/composition-scope.ts`) accepts a small molecule only when the
       modality is stated. An inferred verdict is refused as `CMC_MODALITY_NOT_ESTABLISHED`, and the refusal asks for
       the modality to be recorded.
     - §3.2.A.2 keeps its current reading.
     - Existing substance rows are not rewritten. Each is refused at composition until its modality is recorded.
   - **Why.** This narrows P-28's boundary, it does not widen it. A boundary that decides what a filing may say rests
     on a recorded fact, not on the absence of words in a free-text field.
   - **Owner.** The CMC session (S7, or F1 for the boundary). The test includes mutation 5's antibody.
- **Unchanged.** No new file, route, table, screen or tool (RULE 6). The CMC composition scope of P-28 is otherwise as
  decided.

### P-111 — A CMC or Quality work project manages its own smaller tasks, inside its own work area

Decided 2026-11-09 by the founder, in the reporting session (`011HLkYC…`): "the CMC module should have its own child
project management module dedicated to all the smaller CMC related tasks", and "Same with QS QA". Asked where it
lives, the founder chose **inside each work area**, not a separate screen, and asked that it be **routed to S12**.

- **What exists today** (inventoried 2026-11-09, by path):
  - A CMC work project is a child `projects` row (`program-project-anchor.ts` `ensureWorkProjectUnderAnchor`, P-109).
    It carries one owner and one due date: a single `unified_tasks` row, "Deliver: <name>"
    (`ProjectCoreWork.tsx` `ProjectWorkProjects`), filed on the **filing** project.
  - It has no page or task list of its own. Its door opens the CMC area on the program, unbound to the work project
    (`docs/evidence/SPINE/S12/2026-11-09-work-project-opens-its-area/README.md`).
  - CMC's smaller work becomes ordinary `unified_tasks` rows, all filed on the filing project:
    - the per-register "Task" push (`CmcModule.tsx` `cmcTask`);
    - Module 3 contradictions (`services/cmc/contradiction-tasks.ts`).
    Change controls, stability, batches and specifications carry no owner or due date.
  - Quality's tasks are source-linked `unified_tasks` rows (`qms-record-tasks.ts`, `periodic-review-task.ts`,
    `training-task.ts`, and `capa-tasks.ts` with one task per CAPA action item), placed on the program's anchor or the
    organisation. **Quality is not a work-project kind** (`WORK_KINDS`, `program-project-anchor.ts:491`).
  - `unified_tasks` has no parent task. Only the legacy `project_tasks` WBS has `parent_task_id`, and no client calls it.
  - The project's work panel (`unified-work-view.ts`) and Tasks (`TaskBoard.tsx`) match the exact project. Neither
    rolls a child up.
- **What is decided.**
  1. **A work project manages its own smaller tasks.** Opening a CMC or Quality work project opens its existing work
     area **bound to that work project** (THE_PROGRAM §7a: "a work project opens on its work area … bound to it"). The
     area shows the work project's **Tasks**: each with an owner, due date and status, and **one level of subtasks**.
  2. **The tasks are `unified_tasks` rows filed on the work project itself** (`project_id` = the child; task admission,
     `tasking/task-project.ts`, already accepts it).
     - The existing producers file there when they act within a work project: the CMC "Task" push, contradictions,
       Quality's record, CAPA-action, periodic-review and training tasks.
     - Each producer keeps its source identity and reconciliation (QUALITY_CORE_WORKFLOW's contract).
  3. **They roll up.** A work project's tasks show in its filing project's work panel and in each person's Tasks. They
     are never a second list beside them.
  4. **Subtasks live in the canonical store, `unified_tasks`**, never in the legacy `project_tasks` WBS (zero
     duplication). Whether that means a parent column or the existing `linked_tasks`/`dependencies` is S12's design to
     show, with its "What already exists" section first (RULE 3). A column is added by an additive, re-runnable
     migration (RULE 1).
  5. **Quality becomes a work-project kind** (`quality` in `WORK_KINDS`). It gets a door among the project's work areas
     (`ProjectCoreWork.tsx`) that opens the Quality area bound to it.
- **Owner.** S12, the project-page session (`01FTWcmX…`). The CMC session holds the CMC area's screens and the Quality
  lane holds Quality's; S12 coordinates with each through `.design/claude-convergence/COORDINATION.md`. S12's ledger
  paths widen to the Quality and tasking files this needs.
- **Unchanged.**
  - No new screen, rail entry, card, workspace, route file, service or table (RULES 4 and 6). The task list is part of
    the existing CMC and Quality areas.
  - Module 3 remains a document type that converges into the project's document start and the one editor (RULE 4).
    This decision is about the work area's tasks, not the Module 3 document.
  - The CMC composition boundary (P-28, P-110) is unchanged.

### P-112 — The Vault admits a .zip; making zips, compressing PDFs and combining PDFs are the Vault's

Decided 2026-11-09 by the founder, in the market-readiness session (`01Gx2fiw…`), answering MR-08's open question
(`docs/work-orders/MR-08-vault-upload-safety-and-document-control.md`, "NEW: Vault admission limits": "Also decide
whether `.zip` is admitted. The recommendation is no for the pilot"). P-108 4(a) and MR-10 stage 9 waited on it. The
answer, verbatim: "Yes vaul accepts zips and also generates zips and also can compress PDF’s and combine PDF’s".

1. **The Vault admits a `.zip`.** This reverses MR-08's recommendation.
   - **Today it is refused.** `.zip` is `vault: false` in `shared/constants/document-intake-formats.ts`. The Vault's
     list (`VAULT_UPLOAD_EXTENSIONS`), its ingest route (`server/routes/vault-ingest.ts`, 400 `FILE_TYPE_NOT_ALLOWED`),
     its picker and `VaultUploadStaging.tsx` all follow that flag. No test pins the Vault's refusal.
   - **MR-08's rules for an admitted archive stand; the answer does not change them.** The archive is one Vault
     version, stored and hashed as it came, and never expanded into Vault documents (MR-08 Stage 3 step 3). Before it is
     stored it is bounded by the one archive helper, `server/services/archive/safeZip.ts`, through `assertUploadSafe`.
   - **The Data Room is unchanged.** It still opens a zip in the browser and uploads each file inside on its own
     (`client/src/concept2cure/hooks/archive-intake.ts`).
   - **It unblocks:**
     - P-108 4(a): a sponsor's own copy of a sent package, accepted when its SHA-256 matches the send;
     - MR-10 stage 9's entry point: a prior filing's archive held in the Vault and read by
       `server/services/legacy-importer/filed-sequence-reader.ts`.
2. **Making zips exists and is reachable.**
   - `server/services/vault/vault-archive-builder.ts` writes the originals, `manifest.json`, `INDEX.txt` and
     `SHA256SUMS`, checking each file against its recorded hash. It serves two downloads:
     - a folder's export (`GET /api/c2c/project-vault/:id/folders/:folderId/export`, `VaultFolderExport.tsx`);
     - a seal's closing archive (`GET …/seals/:sealId/archive`, `VaultSeals.tsx`).
   - **Missing:** an export of documents a person picks (MR-08 Stage 6 step 3). It uses the same builder.
3. **Compressing PDFs exists, but the Vault cannot reach it.**
   - `server/services/pdf-compression-service.ts` runs Ghostscript `pdfwrite` with settings from `/screen` to
     `/prepress`. It is reached through:
     - `/api/pdf-tasks/compress*` (`server/routes/pdf-task-routes.ts`), which no client calls;
     - five assistant tools in `server/services/tools/index.ts`.
   - It reads files on the server's disk under `PDF_COMPRESSION_ALLOWED_ROOTS`, not Vault versions. The work is to reach
     it from a Vault document, not to write a second compressor.
4. **Combining PDFs does not exist anywhere.**
   - **What was searched.** `copyPages`, `embedPdf`, `embedPage`, `pdfunite`, merge, combine and concat (PDF), and
     Python's `PdfMerger` and `PdfFileMerger`, across the server, client, shared and scripts, and in the Vault's code.
   - **What looks like it but is not.**
     - `renderCombinedPdf` (`server/export/renderers.ts`) renders one PDF from structured content.
     - CSR assembly writes separate eCTD leaves.
   - **What can be used.** `pdf-lib`, already a dependency, can do it.
   - **How it is built.** The answer names combining as a Vault capability. Under RULE 6 it is built inside existing
     files. A new route file, service, table or screen for it needs an `approvedAdditions` entry from the founder.
- **What is not decided.**
  - The largest file the Vault admits (MR-08 recommends 500 MB) stays open.
  - For a compressed or combined PDF:
    - whether the result is a new version of the same document or a new document;
    - who may make one;
    - whether it needs a signature.

    The Vault's owner proposes; the founder decides. A Vault version's bytes are never rewritten either way: the Vault
    is an immutable catalog (RULE 5).
  - MR-10 stage 9's other two questions stay open:
    - where an imported prior filing is recorded;
    - whether the ICH and regional DTDs are vendored.
- **Owner.**
  - **Admission:** the market-readiness session, which needs it for stage 9, with a hold row before its first edit.
  - **The picked-document export, compression and combining:** the Vault parity lane (S6), in the order the
    coordinating session sets in `.design/claude-convergence/COORDINATION.md`.

### P-113 — All of CMC in the CMC module: the record gaps, the AI layer, and the CMC work project's own plan

Decided 2026-11-09 by the founder, in the CMC session (`01GJidg5…`): *"All possible CMC data and tests and studies
and needs and more across all of chemical, manufacturing and controls; must be part of this special module. Using
all types of AI and machine learn and testing and I want you to study what all advanced current market offerings
are doing in this exact space and add that to their roadmap for cmc — study external. And I think there should be a
sub-project management feature dedicated just for cmc but connected to the parent project management module."*

The study this rests on is `docs/evidence/S7/2026-11-09-cmc-scope-market-and-roadmap/`: the inventory of the 57 CMC
services, 19 canonical record kinds and 9 signed registers that exist; the external study of QbDVision, Weave Bio,
DDi, Veeva, the CPV platforms, the Rockwell-led Digital CMC Consortium and the published ML work; and the gap list
below. Its sources are named there, and almost all vendor material is marketing — the two findings that are not
are FDA's PQ/CMC data standards and the ICH M4Q(R2) draft.

**1. The record gaps are approved as work, in three tiers.**

- **Tier A — extend an existing register. No addition, no decision needed beyond this one.** Nitrosamine risk
  assessment, ICH Q3D elemental impurities, ICH Q3C residual solvents, photostability (Q1B), in-use and
  reconstitution stability, post-approval stability commitments, method transfer and co-validation studies,
  extractables and leachables as studies, cleaning and shipping validation as validation kinds, supplier
  qualification on the material-spec register, batch genealogy on the batch register, and the OOS/OOT investigation
  lifecycle on the existing contradiction-lifecycle pattern.
- **Tier B — compose what is already judged.** **3.2.A.1** (facilities and equipment), **3.2.A.2** (adventitious
  agents, from `substance-modality.ts`), **3.2.A.3** (novel excipients, from `materialSpec.novelExcipient`) and
  **3.2.R** (US regional, from `us-ind-regional.ts`). The judgements exist; no section is composed from them.
- **Tier C — three new records, approved here as `approvedAdditions` entries when each is designed.** Each needs
  its own design with a "What already exists" section first (RULE 3) and an additive, re-runnable migration
  (RULE 1):
  1. **Manufacturing sites and equipment.** Every 3.2.S.2.1 and 3.2.P.3.1 names manufacturers and today that is a
     free-text `manufacturingSite`. The record holds the site, its licence, its GMP status and its inspection
     history, and 3.2.A.1 composes from it.
  2. **QTPP, CQA and CPP as records.** `qbd-analyzer.ts` derives `CqaItem` / `CppItem` at read time and QTPP exists
     nowhere. A derived attribute cannot be versioned, owned, risk-assessed or signed, so the control strategy has
     no governed object at its centre. The analyzer reads these records instead of deriving them, and keeps
     deriving where none is recorded.
  3. **Established conditions and the post-approval change management protocol (ICH Q12).** `supac-classifier.ts`
     classifies a change; nothing records what was filed as an established condition, which is what decides
     whether a change is reportable at all.

**2. The AI and machine-learning layer is approved within RULE 2, which is unchanged.** Numbers, verdicts and
governed content come from the deterministic engines; the model narrates, proposes and flags. A tool that asks a
model for a figure stays a defect. Five approved candidates, each named with the engine it defers to:

1. **Document and instrument intake into the registers** — a CoA, an executed batch record, a stability table or a
   validation report read in as *proposed* records a person confirms. The registers' existing refusals decide. This
   is the founder's "data entry points", and the largest practical win.
2. **"What a reviewer will ask"** — a ranking layer over the deterministic contradiction sweep, trained on real
   deficiency letters, that shows its basis and its corpus and never states a verdict.
3. **Early degradation and out-of-trend signal** — advisory beside `stability-trending.ts`, which stays the sole
   authority on shelf life.
4. **Specification-setting proposals** — limits proposed from batch history with the distribution and batch count
   shown; `process-capability.ts` keeps the arithmetic; a proposed limit is never a recorded one.
5. **Narrative drafting** — exists, and stays bound by `module3-narrative-governance-refusal.ts`.

**3. FDA PQ/CMC alignment is approved as the strategic item.** FDA's Phase 1 domains — drug product, drug
substance, quality specification, batch analysis and stability — are this module's five strongest registers, which
already hold that data as records with lineage. The work is a mapping to the HL7 FHIR Implementation Guide, not a
data project. It is **not** an operational requirement yet, so it is built as an export beside the existing
composition rather than in place of it.

**4. ICH M4Q(R2) is designed for and not built against.** It is a January 2026 FDA draft, Level 1, not for
implementation, with sources disagreeing on a 2027 adoption date. Two consequences to design for: a second,
Description–Manufacture–Control–Storage-shaped projection beside the composer's section-per-CTD-node shape, and
QTPP/CQA-as-records becoming a filing requirement rather than an improvement (Tier C item 2 above).

**5. The CMC work project's own plan.** The sub-project management the founder asks for is **P-111**, decided
earlier today and routed to S12: a CMC work project is a child `projects` row, opening it opens the CMC area bound
to it, and the area shows its own tasks with owner, due date, status and one level of subtasks, filed on the work
project and rolling up into the filing project and each person's Tasks. **No new decision is needed for it.** This
decision adds the part P-111 does not cover and §7a of `THE_PROGRAM_2026-11-01.md` asks for: **a CMC deliverable's
owner, due date and dependencies**, which today have nowhere to live, because a CMC deliverable is not a row but
the set of records of one source type in one project
(`docs/evidence/S12/2026-11-09-deliverable-feeds/`). That is approved as a Tier C record under S12, designed with
S12, and it is what makes the critical path to a filing date answerable.

- **Owners.** S7 for the registers, the composed sections, the engines and the AI layer. S12 for the work project's
  plan and its deliverable dates, with the CMC session holding the CMC area's screens, as P-111 already says. The
  two coordinate through `.design/claude-convergence/COORDINATION.md`.
- **Unchanged.** No new screen, rail entry, card, workspace or second editor (RULES 4 and 5): every item lands in
  the existing CMC work area, the one editor, or an existing register. RULE 2's engine/narration line is unchanged.
  The P-28 / P-110 composition boundary is unchanged — none of this widens it to a biologic, a marketing
  application or a non-US clinical-trial application. RULE 6 still applies to each Tier C record: it is built only
  under an `approvedAdditions` entry naming it.
- **Not approved.** Formulation or molecular ML (ZoomLab, Schrödinger, digital twins): outside P-28 and outside the
  spine. Matching the AI-authoring vendors feature for feature: they draft prose into documents, and this module's
  advantage is that Module 3 composes from governed records with lineage, which is the direction FDA's own
  programme is moving.

### P-114 — Decided under the founder's delegation: the device and diagnostics lane's open regulatory questions

The founder, 2026-11-09, answering the MDX journey session's question (whether "nearly ready" may be said while a
required set is only partly present) and its list of questions waiting on the founder: **"you are to be the SME to make
those choices."** The MDX journey session (`01P6GW…`) decided as follows, as P-107 was decided under the delegation of
2026-11-08. The founder may overrule any item by a later decision. The questions are in
`.design/client-journey/MDX_JOURNEY_2026-11-01.md` ("For the founder", M3, M6(a), M7, M13, M16).

- **What is decided.**
  1. **"Nearly ready" is never said while a required item is missing.** That covers an item not started, not
     assessed, or only partly present. Basis:
     - FDA's technical screening of an eSTAR holds a submission whose required content is absent. A Notified Body's
       completeness check does the same for EU technical documentation.
     - The platform's regulatory evaluator (`server/services/regulatory/readinessEvaluator.ts`) answers
       `nearly_ready` only when no gap is critical, and a missing required item is critical there.

     In the device readiness scorecard (`server/services/market-specs/device-readiness-scorecard.ts`), any applicable
     dimension short of ready caps the level at `in_progress`. `ready` is 100 with no gap. The score, the share shown,
     is unchanged. The scorecard has no non-critical gap, so it does not say `nearly_ready`.
  2. **The design and development file holds design records, not filing paperwork** (M16). Under the QMSR (21 CFR
     820, in force 2026-02-02, incorporating ISO 13485:2016 §7.3.10), that file holds design inputs and outputs,
     verification, validation, reviews, transfer, changes and risk records. These are filing content, not design
     records, and Engineering's design-file list does not tag them as such:
     - the cover letter;
     - the FDA forms (3514, 3881, 3654, 3674);
     - the truthful and accurate statement;
     - the financial certification;
     - the 510(k) summary or statement.

     A zero count of open risks with no risk file recorded is said as "no risks recorded", neither red nor green.
     P-60 stands: the panel reads the project's own sections.
  3. **EU technical documentation is assembled per project, not per eCTD sequence** (M3). MDR and IVDR Annex II and
     III documentation is reviewed by a Notified Body; it is not an eCTD sequence. The EU screen's "Assemble technical
     file" reaches the existing assembler (`pathway-engines/mdr-ivdr/assemble-technical-file-from-core.ts`) for the
     project's own governed MDR or IVDR document. A project whose only market is the EU is not offered the FDA eSTAR.
     Any route path the reach needs is checked against `approvedAdditions` before it is built.
  4. **De Novo gets its doors** (M7): a pathway door, and a Submit assembly door to the De Novo eSTAR the 510(k)
     screen already produces.
  5. **An IVD 510(k) gets its own governed outline** (M6(a)), matched section by section to the vendored IVD eSTAR,
     analytical performance included. It is seeded by migration, `INSERT … ON CONFLICT DO NOTHING` with a row-count
     assertion (RULE 1), and checked against the vendored template before it serves a project. This admits the
     outline as content data. It adds no table.
  6. **No CDRH Portal adapter** (M13; study question 3). The CDRH Portal is a web upload, and FDA publishes no
     sponsor-side submission API for it. An adapter would drive a website on the sponsor's behalf, which is not a
     controlled transmission. The platform produces, retains and signs the eSTAR. A person uploads it and records
     FDA's acknowledgement (number and date) on the filing record. Agency letters enter through Respond.
  7. **F-10 is superseded** (study question 2). P-103 retired the submission-ops package path. A device filing's
     official artifact is the eSTAR PDF, and nothing labels an eCTD-style ZIP as an eSTAR.
- **Order.**
  - Item 1 lands on 2026-11-09.
  - Items 2–5 follow under F1 and R1, after the founder's client demo of 2026-11-09, each red first.
  - Items 6 and 7 need no code.
- **Not decided here.**
  - Which design package takes the device screens (study question 1) is a plan matter.
  - The retirement of unreached device capability (question 4) is R1's.

### P-115 — Decided under the founder's delegation: how a model-drafted CSR reaches a filed sequence

The founder, 2026-11-10, after the CSR path was walked with a model provider present for the first time
(`docs/evidence/D2-CSR/2026-11-10-build-provider-refusals/README.md`) and three stops were put to them: **"I want you
to make the most educated, best decision for me getting this product to market and providing the best product I can
to this institutional buyer in a highly regulated market."** The walking session (`01QoxbLZ…`) decided as follows, as
P-107 and P-114 were decided under delegation. The founder may overrule any item by a later decision.

The principle behind every item: the sponsor answers for each word of a submission whoever drafted it, and an
institutional buyer's quality unit audits two things, that the system is validated for its intended use (21 CFR
11.10(a)) and that a named person reviewed and signed the record. So the product files model-drafted text only with
both, and says plainly when it has neither.

- **What is decided.**
  1. **Model-drafted text is released only as qualified text that a named person has adopted. It is never released
     otherwise, and there is no bypass.** Today `assertWorkflowImportRelease`
     (`server/services/authoring/workflow-import-governance.ts`) refuses a CSR whose imported text a model wrote, for
     any model, for ever, until a person rewrites it. That makes drafting worthless for a filing. The ordinary AnA
     draft already has the right rule (`ordinaryMachineGenesisMayRelease`, `governed-machine-claims.ts`): machine text
     is released when retained evidence shows a qualified generation wrote those exact words. The CSR import path
     takes the same rule. Imported text is releasable when all four hold:
     - the build retained which model and pinned version wrote the section, and that model's approved-models entry
       has `pq.status: 'passed'` for document drafting, with its executed record;
     - every figure in it is a claimed cell of the retained engine tables (the build's claim receipts; RULE 2);
     - the assigned reviewer's CSR scientific review and REVIEWER e-signature adopt that exact text;
     - the approver signs under separation of duties.

     Text from a model with no passed PQ stays unreleasable until a person replaces it, as today.
  2. **Performance qualification of the drafting model is the first launch task, ahead of any further CSR feature.**
     Every `pq.status` in `approved-models.ts` is `pending`, so item 1 releases nothing until one passes. PQ-DRAFT-001
     (`server/eval/pq/pq-protocol.json`) is executed on the primary drafting model (`claude-opus-5-5`) with the
     founder's key, and its result is recorded whether it passes or fails. If it fails, the fallback rung is run. If
     none passes by launch, the product is sold as drafting assistance whose text a person rewrites before filing,
     and it says so. A model's status changes only through its executed record; the registry test already refuses a
     pass with nothing to point at.
  3. **One CSR is filed: the signed document in the one editor. The assembly is bound to it** (RULE 4). The filing
     artifact is the assembly (the body with its bookmarks and checked links, §14, the narratives, the §16 files and
     their study-tagging roles). It is rendered from the approved, signed Authoring CSR's exact sections, not from
     the build job's outputs, and it records that document's sections digest. `renderedLeafNotTransmittable`
     (`server/services/ectd/leaf-release-verdicts.ts`) then releases an assembled file only while that digest matches
     an approval signature that stands. Its unconditional refusal stays until the binding lands (P-22;
     `docs/evidence/D5/2026-10-30-assembled-csr-not-released/`).
     **Until then the launch path is the one that exists:** "Place into filing" of the approved, signed CSR at
     5.3.5.1 with its study id and study-tagging role, and each appendix as an approved Vault PDF.
  4. **A CSR goes to an open IND in an amendment sequence**, with Form 1571 and the cover letter, not in sequence
     0000. The gates already admit this (`ind-sequence-validation.ts`); the preparation and demo walks follow it. No
     gate changes.
  5. **Every heading holds text. "Not applicable" is a person's statement with a reason, never a default.** The
     signed record must be complete, so no heading is skipped by a flag. ICH E3 is guidance on structure, and a
     heading that does not apply is said not to apply. The editor offers, on a CSR heading, the "Not applicable
     because …" act the assembly already has for §16 (`CsrAssemblyControl.tsx`, `csr-assembly-body.ts`). It writes
     that sentence with the person's reason as their own text, audited. For §14 and §16 the import writes what the
     engines and the assembly already hold (the table or listing, the supplied appendix, the recorded declaration),
     labelled as engine content. Any route path the reach needs is checked against `approvedAdditions` first.
  6. **Subject-level data never goes to a model, and the study's source keeps its classification.** This is so
     today: the narratives are composed by the engine, and the builder sends aggregate tables screened for
     identifiers. When source-tier propagation reaches the builder's calls, it carries the aggregate evidence as a
     governed derivative under the organization's placement policy. It does not reclassify the CONFIDENTIAL source,
     and it does not stop the build. The provider lane is the buyer's election in its Order Form: first-party
     Anthropic under a zero-retention agreement, or the buyer's private cloud lane. The S4 owner chooses the
     mechanism among the gateway's existing ones.
  7. **"Submitted" means transmitted through the agency's gateway and acknowledged.** The product records
     `ECTD_TRANSMIT_SKIPPED` when it has no gateway credentials and never records a filing it did not send. Before
     the buyer's first filing, a sequence is sent through FDA ESG's test environment with the buyer's credentials.
- **Order.**
  1. The founder's Anthropic key works in the Codespace (the check landed 2026-11-10), and one whole-report build
     is run with it. Its record states how many drafts the figure checks accepted and how long it took. No real
     model request has been made on this path yet.
  2. Item 2, the PQ run.
  3. Item 1 on the import path, red first (S4, L1).
  4. Item 5 (D4, L1).
  5. The walk, as people: review, adoption, approval, Place into filing, the amendment sequence, compile, Shadow
     Review, freeze and dispatch (items 3 and 4's launch path).
  6. Item 3's binding (S5, L1).
  7. Item 7's test transmission, once the founder holds ESG test credentials.
- **Not decided here.**
  - Which provider lane this buyer elects, and its commercial terms.
  - Any widening beyond a US IND (P-28, P-110 stand).
  - Whether a failed build is resumed from the screen; that is a repair (F1), not a decision.

*Clarification, 2026-11-10 (the walking session, `01QoxbLZ…`, under the same delegation): item 2 needs more than a key.*
`npx tsx server/eval/pq/run-pq.ts --preflight` was run on trunk and answers **blocked, not ready to evaluate**, with
seven blockers. The qualification run was put first in the order above as if a working key were its only condition.
It is not.

| Blocker | What it means | Who clears it |
|---|---|---|
| `PROTOCOL_NOT_APPROVED` | `server/eval/pq/pq-protocol.json` is a draft with no approver. A run against unapproved acceptance criteria cannot pass | The founder, as the responsible owner. No session records that approval for them |
| `RAG_SAMPLE_SHORTFALL` | The retrieval test bank holds 18 positive items; the protocol requires 30 | A regulatory reviewer writes 12 more |
| `RAG_GOLD_EVIDENCE_MISSING`, `RAG_GOLD_OPEN_CHECKS` | None of the 18 items names its reviewed source, section and quotation; 5 have open checks against the official text | A regulatory reviewer, against the official texts |
| `SOURCE_REVIEW_INCOMPLETE`, `RAG_KEYS_PROVISIONAL` | 0 of 18 required source versions are verified (version, hash, provenance) | The same reviewer |
| `PUBLISHER_TERMS_UNVERIFIED` | Reuse terms are unverified for 4 of 4 required publishers | The founder or counsel |

The drafting and extraction components are ready: 60 tasks each. Only the retrieval component is short.

- **Decided.** The CSR build retrieves nothing: it drafts from the study's retained tables and the platform's ICH E3
  record. Its qualification is therefore scoped to that use. A model is qualified for evidence-bound CSR drafting
  on the drafting and extraction components plus a run over the CSR builder's own prompts, and that qualification
  releases CSR text only. The retrieval component stays required for every use that retrieves (AnA's answers from
  the knowledge base, a section drafted from selected sources), and nothing in this decision qualifies a model for
  those. The registry already records which uses a record measured (`pq.intendedUses`) and the gateway refuses a
  use it did not (`model-governance.ts`, `use-mismatch`); the S4 owner carries the narrower use through that
  check. Completing the retrieval bank is not waived. It is taken off the CSR's critical path.
- **Not decided, and not done.** The protocol is not approved here. Approving it, with this scoping written into
  it, is the founder's act.
- **The order above changes in one place.** Step 2 becomes: the founder approves the protocol; the CSR drafting
  component is added to it; then the run. Steps 3 to 7 do not wait for it, except that step 5's approval stays
  refused for model-drafted text until a model has passed.

### P-116 — One reviewer is enough, and a one-person organisation may approve its own document, on the record

The founder, 2026-11-10, on learning that a placed artifact needs two independent reviewers: **"Doesn't need two. What
if a client is a single consultant."** Asked how a one-person organisation approves a regulated document, the founder
chose: **self-approve, on record.**

- **One reviewer is enough.** P-95's clarification of 2026-11-09 (Q2, ruled under delegation) raised the floor to two
  for a placed artifact or a dossier section. That is overruled. `reviewFloor` (`server/services/artifact-approval-act.ts`)
  answers one for every artifact. The editor's document door never asked for two.
- **Review stays mandatory (P-95), and stays independent (P-18), wherever a second person exists.** A reviewer is still
  neither the approving signer nor an author, and an approval with no completed review is still refused.
- **A one-person organisation.** When the signer is the organisation's only active member, there is nobody to be
  independent of. That person may then approve, lock or sign their own record without a reviewer.
  - **On the record.** The audit trail records, on that act, that the signer was the organisation's sole member and
    that no independent review took place. The act is never recorded as an independent review or approval.
  - **A setting, by P-117 (below).** As first decided this was not a setting. The founder changed that the same day:
    the organisation's administrator switches it on or off. Whatever the setting says, it applies only while the
    organisation has one member. From the moment a second member exists, independent review is required again, for
    every act from then on. Nothing earlier is reopened.
  - **Scope, door by door.** The rule is one function (`isSoleMember`, `server/services/governance/separation-of-duties.ts`).
    A door admits a sole member only once it also writes the record above, so no door admits one silently.
    - Built: the conversation artifact's approval and lock (`artifact-approval-act.ts`, `artifact-signed-act.ts`), on
      both its doors (the status route and AnA's signed act).
    - Built 2026-11-10 (P-120): the editor's APPROVER signature, by E-sign and by the workflow sign
      (`approverIndependenceRefused`, `server/routes/authoring.router.ts`). Freeze needed nothing: an author already
      freezes their own document with the meaning AUTHOR.
    - Not yet, each its own slice with its own record: QMS documents, Module 3 sections, labeling approvals, the
      document lifecycle, and a sequence's freeze and dispatch. Until then those doors refuse a sole member as before.
  - **Membership is counted strictly.** Every membership row counts, whatever the account's status, so disabling a
    colleague does not make someone the sole member; removing a member is an audited act.
- **Basis.** 21 CFR Part 11 does not require the signer to differ from the author (11.50(a)(3) lists authorship among a
  signature's meanings); the second-person rule is this platform's adopted policy from predicate rules
  (`separation-of-duties.ts`, module note). A sole practitioner's records are theirs to sign. What a sponsor or an
  agency requires of such a record is the sponsor's quality agreement to state, and the audit trail shows them exactly
  what happened.
- **Not decided here.** Whether a GMP batch-record or quality-unit act (21 CFR 211.22, 211.192) may ever be signed by
  a sole member: those acts are outside the launch catalog today. A QMS document's approver designation (D-Q) is
  unchanged.

### P-117 — The review rules are each organisation's own, set by its administrator in the security settings

The founder, 2026-11-10, on P-116's two rules being fixed in code: **"Those rules should be set by the client super
admin in client security user settings."**

- **What the administrator sets.** Two values in the organisation's settings, under `security`:
  - `independentReviewersRequired`: how many independent reviewers must approve a version before it can be approved.
    A whole number from 1 to 5. Unset, it is 1 (P-116).
  - `soleMemberSelfApproval`: whether the organisation's only member may approve, lock or sign their own record with
    no reviewer. On or off. Unset, it is on (P-116: "self-approve, on record").
- **What is not a setting.** Review stays mandatory (P-95): the count cannot be set below 1. A reviewer is still
  neither an author nor the approving signer (P-18). A sole member's act is still recorded as having no independent
  review; no setting removes that record. Self-approval still applies only while the organisation has one member.
- **Who sets them.** The organisation's administrator or owner, in Administration's settings ("Review and approval",
  beside "Session policy"). No other role can.
- **How a change is made.** Through the one governed settings writer (`PATCH /api/organizations/:id/settings`,
  `server/services/tenant/tenant-settings-writer.ts`), with a reason. The audit row carries both values before and
  after. A value outside the bounds is refused, not stored and clamped.
- **When a change applies.** To every approval from then on. The approval act reads the rules on the signing
  transaction (`organizationReviewPolicy`, `server/services/governance/separation-of-duties.ts`). Approvals already
  recorded stand. If the rules cannot be read, the approval is refused.
- **Scope.** The same doors as P-116: the conversation artifact's approval and lock today. Each later door (the
  editor's APPROVER e-signature and Freeze, then the others P-116 lists) reads the same two values when it is built.
- **A consequence to know.** An administrator who is also the organisation's only member sets their own rule. That is
  what a one-person organisation is. The settings change is itself an audited act with a reason.
- **Evidence.** `docs/evidence/W5/2026-11-10-review-rules-settings/`.

### P-118 — The founder approves the qualification protocol; the retrieval test bank is completed without a regulatory reviewer, and says so

The founder, 2026-11-10, answering the three things P-115's clarification left with them (a working key, the
protocol's approval with the CSR scoping written into it, and a regulatory reviewer for the retrieval test bank):
**"I can try to again load a new Anthropic api key tomorrow and yes I approve"**, and on the reviewer:
**"impossible right not to get a human reviewer so figure out alternatives."**

- **What the founder approved.** `server/eval/pq/pq-protocol.json` (PQ-DRAFT-001), with P-115's scoping written into
  it, as **version 1.0.0, approved 2026-11-10** by the founder as system owner. The file records it.
- **What approval does.** It fixes the acceptance criteria before any model has been run against them. P-31: "a PQ
  against acceptance criteria nobody has approved is not a PQ."
- **What approval does not do.** It qualifies no model and changes nothing a model may do. Every `pq.status` in
  `approved-models.ts` is still `pending`, and production still refuses to store model-authored text in a governed
  record. On the approved protocol a run that is perfect on drafting, extraction and retrieval is still INCOMPLETE
  (`pq-verdict-rag.test.ts`, "approval alone qualifies nothing").
- **P-31's sixth condition, a product provider key, is not yet met.** The founder approved ahead of it. A key is a
  condition for running the protocol, not for fixing what it measures, and criteria fixed before the first run are
  the stronger record.
- **How it changes from here.** A change to the approved protocol is a new version and a new approval by the
  founder. A change after a model has passed invalidates that pass (P-31).

**Written into the protocol by the walking session (`01QoxbLZ…`) under P-115's delegation. The founder may overrule
any of it before the first run.**

- **The scope** (the file's `scope` block). A qualification is for a named use, on the components that use needs:
  - evidence-bound CSR drafting: drafting, extraction and the CSR drafting run. It releases CSR text only;
  - every use that retrieves: drafting, extraction and retrieval.
- **A CSR drafting component** (`csrDrafting`): the pinned model drafts every ICH E3 narrative heading of one public
  study through the CSR builder's own request and its own checks. Its criteria:

  | Criterion | Value | Where the value comes from |
  |---|---|---|
  | Figures in accepted text that are not a claimed cell of the retained tables | 0 | RULE 2 and P-115 item 1 |
  | Forbidden or overclaiming phrases | 0 | the drafting component's own criterion |
  | Share of narrative headings the pinned model verifiably drafted | all | as every other component requires of its tasks |
  | Share of headings whose first draft passed every check | at least 85% | **no earlier document.** Set here, at the drafting component's coverage floor |

- **That component is required and cannot be executed yet**: the run is not written (ledger package S4). So no run
  can pass today, for any use. This is stricter than the scope above, on purpose. The test bank holds 510(k), CER,
  IND, Module 2 and Module 3 tasks and no CSR. Without this, a model that passed on that bank would be admitted to
  draft a CSR it was never measured on, the failure P-31's fourth condition names.

**The retrieval test bank without a regulatory reviewer.** Decided under the same delegation.

What the record check asks of the bank is facts, not a credential (`verify-pq-record.ts`, `reviewedSource` and
`reviewedGold`): each source's official URL, version, date and SHA-256, the publisher's reuse terms quoted with
their URL, and for each test item the section and a verbatim quotation that states its answer. The corpus
manifest's own procedure asks "what was done and by whom" (`guidance-corpus-manifest.json`, `verifyProcedure` step
6). So the work is split by kind.

1. **The CSR does not wait for any of this.** The CSR build retrieves nothing (P-115's clarification stands).
2. **Mechanical steps: the founder, from the Codespace.** The official URL, the download, its SHA-256 and size, and
   the title, revision and date on the cover, for the 18 required sources. The publishers' sites are refused from
   the sessions' containers, so a session prepares the commands and the founder runs them. Each entry's
   `verification` names who ran it and when.
3. **Reuse terms: the founder reads each of the four publishers' posted terms.** The operative sentence is quoted
   with its URL and the date read. Recording what a publisher posts needs no counsel. Whether those terms permit
   this product's use is the founder's call as the owner of the business; a session does not make it. A publisher
   whose terms are unclear has its texts left out, and the items that rely on them are replaced.
4. **Judgement steps: replaced by a check anyone can re-run.** The five open checks and the twelve further items
   are worked by a session from the downloaded official text. Every item carries its section and a verbatim
   quotation that states the answer. The quotation is checked, character for character, against the file whose hash
   is pinned, and the check's output is retained. The founder reads each item's quotation beside its answer and
   confirms it. An item whose quotation does not state its answer plainly is dropped, not argued for.
5. **The bank says what it is.** Its record, and every qualification record that uses it, states: *sources verified
   by download and hash, answers verified by verbatim quotation, confirmed by the system owner; no regulatory
   professional reviewed this bank.* Nothing calls it independently reviewed.
6. **Two ways to a reviewer's name later; neither changes a criterion.**
   - The buyer's own regulatory staff review the bank as part of accepting the system. A regulated company
     qualifies a system for its own intended use, on the supplier's protocol and evidence, as a matter of course.
   - A contract regulatory writer, for about a day.
7. **Until the bank is complete,** every use that retrieves stays as it is today: the model assists, and its text
   is not stored in a governed record as the model's.

- **The order in P-115 changes in one place.** Step 2 is now: the CSR drafting run and a verdict that reads the use
  (S4); then the run with the founder's key.
- **Not decided here.**
  - Whether the buyer is offered the review in item 6.
  - Whether any publisher's terms are acceptable (item 3).
  - Any value in the table above, if the founder wants another.
- **Evidence.** `docs/evidence/D4/2026-11-10-pq-protocol-approved/`.

### P-119 — User roles by client type: a standard catalog of job roles, beside the six access levels

The founder, 2026-11-10: **"Add user roles per biotech, pharma, CRO, cmc - and so on to align to the many use cases of
the entire platform."**

- **What a role is here.** A person in an organisation has two things, and they stay two things:
  - an **access level**, which decides what the person may do. There are six, and they do not change: administrator,
    approver, manager, reviewer, member and viewer (`shared/constants/org-roles.ts`, P-18). The signing policy, the
    governed-write gate and the audit readers are built on them, and the validation package tests them;
  - one or more **job roles**, which say what the person's function is: regulatory affairs lead, medical writer, CMC
    lead, QA lead, biostatistician. A job role is the organisation's own record (`qms_job_roles`, P-49). It grants
    nothing by itself.
- **What is added.** A standard catalog of job roles for each client type: biotech, pharma, CRO, medical device,
  diagnostics, academic, regulatory consultancy and medical writing. The roles are grouped by function: regulatory,
  clinical, data and statistics, safety, nonclinical, CMC, quality, device and diagnostics, and program. Each role
  carries one sentence on what it is accountable for, the access level it usually takes, and the work areas it uses.
  The catalog is data (`shared/regulatory/`), as a document type is data (RULE 4).
- **CMC.** CMC is a function group in the catalog (CMC regulatory lead, analytical development, quality control,
  manufacturing, supply chain). It is offered to every drug and biologic client type. A CMC-only organisation, such as
  a contract manufacturer, uses it under the client type it signed up with. Whether such an organisation becomes a
  client type of its own is not decided here.
- **How an organisation takes it.** Its administrator adopts the standard roles for its client type, all or some,
  into the organisation's job roles, and may rename, add or remove any of them. Each change is a governed write with
  a reason, through the existing writer (`server/services/qms/training-assignment.ts`). Nothing is created for an
  organisation until its administrator adopts it.
- **Where it shows.** In Administration, with the members. The member list's "Groups" column, which was always
  empty, becomes the member's job roles. The administrator gives and removes a member's job roles from the member's
  detail. The roles tab lists the organisation's job roles beside the access levels.
- **What a job role suggests.** When the administrator invites a person or changes an access level, the job role's
  usual access level is offered as a suggestion, with its reason. The administrator decides. No job role raises or
  lowers anyone's access.
- **Why not more access levels.** A permission role per function and per client type would be dozens of roles. Each
  would need its own entry in the signing policy and its own validation. An auditor reading the access review (21
  CFR 11.10(d)) would have to learn each one. Six levels, project sharing, the QMS approver designation and job roles
  already express least privilege and separation of duties. A client need that no access level can express returns
  to the founder.
- **One vocabulary.** The program plan's task roles (`services/regulatory/pyramids/`, 24 keys such as `ra_lead` and
  `cmc_lead`) map onto the catalog, so a task's role and a person's job role are the same thing. A test holds the
  mapping complete.
- **What uses it next** (each in its own package, not decided here): the program plan proposes a task's owner from
  the people holding its job role (S11); AnA reads the person's job role in its context (S4); training is assigned by
  job role, as today (P-49).
- **What it does not add.** No screen, route, service, table or AnA tool (RULE 6). It completes the job-role store
  and reaches it from Administration.
- **Design.** `docs/design/CLIENT_TYPE_JOB_ROLES_2026-11-10.md`.

### P-120 — Decided under the founder's delegation: the open questions on a one-person organisation

The founder, 2026-11-10: **"Study this online thoroughly and decide as an SME would across all open questions and
then proceed."** Decided by session `…01QoxbLaF` from the sources below. Each is reversible by the founder.

1. **A sole consultant may dispatch a sequence to FDA alone.** Nothing in the regulations asks for a second person at
   filing.
   - 21 CFR 312.3 defines a sponsor-investigator as an individual who both initiates and conducts an investigation.
   - 21 CFR 312.23(a)(1)(ix) asks for one signature on Form FDA 1571: the sponsor's, or the sponsor's authorized
     representative's.
   - FDA's ESG NextGen registration lets an individual hold an account under an individual letter of non-repudiation,
     and lets a consultant, CRO or US agent file for clients under one account with each client's Letter of
     Authorization.
   - **Conditions.** The same setting governs it (`soleMemberSelfApproval`, P-117). The dispatch is recorded as having
     no independent review. A consultant who files for a client still files under that client's authorization: the
     gateway account setting is unchanged. The dispatch door admits a sole member only when it is built to write that
     record (P-116's rule for every door).
2. **Self-approval stays on by default.** 21 CFR Part 11 does not require the approver to differ from the author:
   11.50(a)(3) lists authorship, review and approval as meanings one person's signature may carry. The second-person
   rule is this platform's policy. A one-person organisation cannot work with it off, the setting has no effect once a
   second member exists, and every such act is recorded. An administrator who wants it off switches it off.
3. **QMS controlled documents follow the same setting**, when that door is built. FDA's guidance "Quality Systems
   Approach to Pharmaceutical CGMP Regulations" (2006) accepts one person in both production and quality functions only
   in very limited circumstances, and recommends a periodic review by another qualified person who is not involved.
   The platform records the act; arranging that periodic review is the organisation's duty, and its quality manual
   says how.
4. **GMP batch disposition is never admitted by this setting** (21 CFR 211.22, 211.192). It is outside the launch
   catalog. If it ever enters, it needs its own founder decision.
5. **A reviewer is still never the approver** (P-95 question 1) and never an author (P-18), in every organisation with
   more than one member.
6. **The reviewer count stays 1 to 5.** No source sets a number; ICH E6(R3) asks for review proportionate to risk.
7. **Order of the remaining doors:** sequence freeze and dispatch, then QMS controlled documents, Module 3 sections,
   labeling approvals and the document lifecycle. Each is its own slice.

Sources read 2026-11-10: 21 CFR 11.50, 312.3 and 312.23 (eCFR); FDA, "Letters of Non-Repudiation Agreement" and
"Steps for CROs, US Agents and Consultants to Create an ESG NextGen Account" (fda.gov); FDA, "Quality Systems Approach
to Pharmaceutical CGMP Regulations" (2006); 21 CFR 211.22; ICH E6(R3). The regulation and guidance texts were read
through search summaries and secondary quotations, not line by line: counsel or QA should confirm item 1 and item 3
against the primary texts before the first real filing by a one-person client.

### P-121 — Decided under the founder's delegation: Vault questions the Vault parity lane met on 2026-11-10

The founder, 2026-11-10: **"Continue you decide as the SME would."** Decided by session `…01KnUGoX3g` (the Vault
parity lane). Each is reversible by the founder.

1. **In a pharma or biotech Vault, a "Risk management plan" is the dossier's.** The name means two documents: in a
   device file, part of the ISO 14971 risk management file; in a medicinal product's dossier, the Risk Management Plan
   (the EU RMP at Module 1.8.2, Japan's at 1.11; FDA's Module 1 has no single heading for it, as the Module 1 record
   states). The Vault's view decides. In a drug project the device rule no longer claims the name and the CTD
   detector proposes it for Module 1 at its region's heading, as it already did for "RMP". A name that also says it
   is the device's (ISO 14971, RMF, DHF, "device", FMEA) stays the device rule's. A device or IVD Vault is unchanged.
   Built: `8e5f7cd0b`, `docs/evidence/SPINE/S6/2026-11-10-rmp-classifier/`.
2. **The server refuses a read that would span clients; "no client" is its own choice.** P-107 item 3 says search
   never spans sponsors. The Vault page asks first, in the browser (`47a306700`). The server now holds the same
   line for every caller: a governed-artifacts listing or a library search with no project is one client's, or it is
   refused with the clients named. Projects that record no client are listed apart from every named client, never
   with one. Built: `6dac0b836`, `cc1af9221`, `docs/evidence/SPINE/S6/2026-11-10-p107-sponsor-first/`.
3. **A 510(k)'s or De Novo's section the eSTAR mapper has no slot for keeps the rule pack's flag.** P-107 item 3 has
   device coverage follow the mapper. Read to the letter that drops "Required" from 510(k) A2 and B3 and De Novo B2,
   C2 and C4, which the mapper says nothing about and the FDA form shows. Asking too much is the safer error for a
   filing, so those keep the pack's mark, and each answer says which of the two decided it. The mapper gaining slots
   for them is the device lane's. Built: `9cff33fe4`,
   `docs/evidence/SPINE/S6/2026-11-10-p107-device-coverage-estar/`.
4. **Open, and not decided here: a second layer for PDF renditions of uploaded Word files.** The converter no longer
   requests what a Word file links to (`4cc352ccf`), which is now the only protection between an upload and a request
   from the server. Refusing every file that names outside content would also refuse ordinary web links. Whether to
   add a second layer, and which, is a security decision for the coordinator and the rendition's owner
   (`docs/evidence/SPINE/S6/2026-11-10-p107-renditions/README.md`).

### P-122 — The UI shows the work: zero capability loss is enforced, and what was hidden comes back

The founder, 2026-11-10, after a demonstration: **"The user interface represents what, 10% of the code base that we
built? … There wasn't one screen that was satisfactory. … You fucked my project management screen up. … My CMC
module is missing 1,000 features and functions that we had. … Rendering a shell or 10% of what we built. Nothing
works."** And: **"Yes to all but I want you to make the most educated 'right calls' on behalf of our potential
customers and what they will want to pay for."** Decided under that delegation by session `…01DiJJAk`. Each call is
reversible by the founder.

**What happened.** P-78 asked for two things: the product looks and works like Claude, and the whole codebase lives in
that UI (`ONE_DESIGN_PLAN.md` §1). The sessions delivered the first by removing, hiding and folding, and did not
deliver the second. §2's "zero capability loss" was asserted in ledgers and not enforced. The inventory is
`docs/evidence/DESIGN/P-122/` (filed with the first restoration). For the shell, Home, Projects and the project page:
- little was deleted, but much was hidden: below a chat box, in closed disclosures, or only in a non-default view;
- project-management engines that exist on the server have no screen, and most are refused in production.

**1. The Claude look stays; it frames the work and never replaces it.** Where §2's minimalism and a customer seeing
their own work conflict, the work wins. A paying regulatory team opens the product to see its projects, its due work
and what is at risk.

**2. Zero capability loss is enforced, not asserted.**
- No session removes, hides, moves below the fold, or puts behind a closed disclosure a metric, workflow, verdict,
  action or record a screen showed, without a founder decision.
- A "fold" of one screen into another is admitted only when a test opens the target and shows it delivers the same
  outcome. The commit names that test.
- `ci:one-design-plan` refuses a commit that deletes a surface file, or removes a `UI_SURFACES` id or `SURFACE_VIEWS`
  entry, unless it carries `Founder-Decision:`.

**3. Restored now, in this order** (each red first, with before-and-after screenshots at 1440 px and 390 px):
1. **Home.** The person's projects and due tasks are visible at 1440×900 without scrolling, beneath a compact
   greeting and the composer.
2. **Projects.** The portfolio figures (active projects, average readiness, filings due within 60 days) and each
   card's readiness, stage, lead and status are shown by default, in grid and list. "Which projects are at risk this
   week?" is one click and is answered by the server's risk engines (Sentinel, submission-ops), never by the browser.
3. **The project page.**
   - The open step says what to do next.
   - Records and Activity are open sections.
   - The Review step lists the approvals and the readiness the server computes.
4. **The top bar.** Search and Help are visible.
5. **Project management that was built and never shown** is reached on Projects and the project page:
   - section owners, deadlines and milestones (`/api/project-sections`);
   - due soon, workload, blockers and approval bottlenecks (`/api/submission-ops`);
   - cross-project deadline risk (Sentinel);
   - the project task list tied to submission milestones;
   - the project hierarchy and its roll-up;
   - restoring an archived project.

   Their routes are admitted to production for those screens, behind the same tenant and access checks as the rest
   of Projects (`Plan: R1`).
6. **CMC / Module 3** next, from its own inventory, then Vault, Submission Center, Quality and Reporting, from theirs.

**4. Not decided here.** Mission Control, the CRO portfolio and the project journey stay outside the launch catalog
until the founder admits them. Their engines may serve the screens above (Rule 3: reach, not rebuild).

### P-123 — Decided under the founder's delegation: the Vault lane's open calls, made for the customer who pays

The founder, 2026-11-10, to the Vault session (`…01QoxbLZMS`), on its list of open items: **"Yes to all but I want
you to make the most educated 'right calls' on behalf of our potential customers and what they will want to pay
for."** Decided by that session. Each is reversible by the founder. The test applied to each: a regulatory affairs
lead pays for a Vault that tells them correctly what their filing owes and that an inspector cannot fault. They do
not pay for a feature that is nearly right.

1. **A device section's requirement is the eSTAR registry's, per device.** (P-107's "D4 and D6 disagreement".) This
   was landed on trunk by another session (`…01KnUGoX3g`, `server/services/pathway-engines/estar/estar-outline-requirements.ts`)
   while this session was building the same thing. This session withdrew its copy unpushed (zero duplication) and
   kept only the decision that slice left open, item 2.
2. **Risk management in a 510(k) follows FDA's template, not habit.** The registry required it of every 510(k). FDA's
   eSTAR shows "Benefits, Risks, and Mitigation Measures" for a Special 510(k), a De Novo and a PMA and hides it for a
   Traditional or Abbreviated 510(k) (the finding recorded in `migrations/20261005c_k510_denovo_estar_outline_v1_1.sql`).
   The product does not record which kind of 510(k) a project is, so the section reads "When applicable" (required
   when the submission is a Special 510(k)) and is reported for a person to confirm. It is no longer scored as missing on a Traditional 510(k),
   where demanding it told a customer their complete filing was incomplete. A De Novo still owes it. **Owed, as a
   later slice by the device lane:** record the kind of 510(k) at intake, so this becomes a yes or a no.
3. **The organisation-wide folder route (`/api/folders`) is retired.** It had no screen, no caller, no audit row, no
   reason for change, and a hard delete. In a Part 11 product that is a finding waiting for an auditor, and nobody
   could reach it to get value from it. Folders are a project's, through its Vault
   (`server/routes/c2c/project-vault.ts`, `server/services/vault/vault-folders.ts`). `public.document_folders` stays.
   If a customer asks for folders shared across projects, that is built on the governed writer, as its own decision.
4. **Renditions stay Word to PDF.** Word is what regulated documents are written in and PDF is what is filed. A
   spreadsheet or a slide deck flattened to PDF is not what anyone files, and a poor rendition next to a "verified"
   label costs trust. Other formats download as their source, verified. Revisit on a customer's request.
5. **Search filters stay one value each.** Several values already arrive through a saved view. A multi-select on
   every filter is weight on a screen that should stay calm (RULE 4), and no customer has asked.
6. **Recommended to the filing lane, not decided here:** accept what the agencies accept for a leaf (PDF 1.4 to 1.7,
   and PDF/A-1 or PDF/A-2 where the agency lists them) and do not require PDF/A of every leaf. Requiring more than
   the agency does refuses files a customer may lawfully file. This sentence is from the session's knowledge of FDA's
   PDF specifications, not from a fresh reading: the filing lane confirms it against the current specification.
7. **Not this session's to decide, and still owed by people:** legal sign-off on each agency DTD before it is
   fetched (`assets/ectd-dtd/README.md`); licences; production secrets and hosting; the model key and the
   qualification approval that lets AnA be walked over folders in a conversation.

Evidence: `docs/evidence/SPINE/S6/2026-11-10/README.md`.

### P-124 — Decided under the founder's delegation: the trial master file in the Vault

The founder, 2026-11-10: **"I don't see the TMF on the vault UI anywhere. The vault UI seems to be lacking in a lot of
ways."** And, the same day: **"Continue you decide as the SME would."** Decided by session `…01KnUGoX3g` (the Vault
parity lane), inside P-74 and P-75 (the eTMF lives inside the Vault and files against the project's study) and under
P-122 (nothing a screen showed is removed without a decision). Each is reversible by the founder. The test applied:
a sponsor or CRO pays for a trial master file an inspector can open and trust, where every "filed" has a document
behind it and every change says who made it and why.

1. **It is called the trial master file, and it is the study's.** The Vault's button read "Inspection readiness" and
   opened a screen where a trial id was typed by hand and bound to nothing. The button reads "Trial master file" and
   opens the trial master file of the open project's study. A filing belongs to a study of the project, and its
   document is a live document of that project's Vault. Rows filed before this name no study and are never served
   as one's. Built: `64e4bcca0a` (the server), `docs/evidence/D2-ETMF/2026-11-10/`.
2. **Filing and removing are governed.** Each needs the person's reason and a role that may write the Vault, and
   writes the chained audit row in the same transaction. A removal stays on the record with who, when and why. The
   inspection package is a recorded download: nothing is sent when its record cannot be written.
3. **Everything the retired screen showed is kept (P-122), with two changes decided here.**
   - Kept: the choice between essential records and all records of the reference model; the figures (zones
     complete, records filed, open gaps); each record's code and zone; upload a document and file it in one step;
     the inspection package shown as a document; asking AnA what an inspector would raise.
   - **Changed: upload-and-file asks for a reason.** It filed with none. A filing with no reason is not one an
     inspector accepts.
   - **Not kept: the report built in the browser when the package could not be downloaded.** It was an export with
     no record of who took it. The package is a recorded download, and when it cannot be recorded the page says so
     and offers to try again.
   - The two tiles that read "Not yet available" (timeliness, QC) become one plain line: neither is assessed,
     because no filing lag and no QC state is recorded for a record. A tile that states an absence is not a figure.
   - "Open in Project management" is the page's way back to the project.
4. **Where it lives until admission.** P-75 puts the trial master file in the Vault's own views, and P-74 admits it
   only with one store, a URS and an OQ. Until then a launch screen may not call its API, so the section is hosted
   by the `etmf` page that the Vault's button opens, and in a release that page stays locked as the old screen was.
   The founder's sentence is fully answered only at admission, when the section sits in the Vault's Required
   documents view (the change is kept ready in `docs/evidence/D2-ETMF/2026-11-10-vault-section/held/`).
5. **What retires with the second, undeployed store (slice E4), and what is carried.** That store's tables are on no
   deploy path, so no deployed database holds a row of it; its screens and tools were refused in a release.
   - **Carried onto the deployed store before admission: "not applicable", with a reason.** A study to which an
     essential record does not apply could otherwise never read complete. The declaration says who, when and why,
     is audited, counts as neither filed nor missing, and the verdict says how many were declared.
   - **A record's status is its document's.** The second store let a person type a status (received, in review,
     final) with no document behind it. A record's state is the lifecycle stage of the Vault document it is filed
     against, shown on the record. No status is typed separately.
   - **Not carried: an artifact outside the reference model's catalog.** A document the catalog does not name is
     kept in the Vault and is not a record of the trial master file.
   - **AnA's tools:** `get_tmf_view` and `classify_tmf_artifact` keep their names and read and file through the
     deployed store, the filing with the person's confirmation and reason. `create_tmf`, `seed_tmf`,
     `update_tmf_artifact_status` and `review_tmf_completeness` retire, each onto what now answers it: a study's
     trial master file exists with the study; its expected records are the reference model's; a record changes by
     filing, removing or declaring it not applicable; completeness is part of the view. No tool is added.
   - The report pack `etmf.completeness_pack` and the trial master file part of AnA's document search read the
     deployed store.
6. **Order to admission:** E4 (one store); "not applicable"; the URS and OQ; then the Vault app gains the `etmf`
   surface as a professional-tier module and the section moves into the Vault.

Evidence: `docs/evidence/D2-ETMF/2026-11-10/`, `docs/evidence/D2-ETMF/2026-11-10-vault-section/`. The steps of E4
are in the plan's §3a.

### P-125 — Decided under the founder's delegation: client administration shows the work (P-122 applied to Administration, Licensing, Onboarding and the account)

The founder, 2026-11-11: **"Continue and focus entirely on getting what we built surfaces correctly on the UI and
working for GA. Stay aligned with our roadmap and rules."** Decided by session `…01T2wooCZu` (client administration)
under the founder's standing delegation ("make the best decisions based on our highly regulated clients and their
needs and the longevity of our product") and inside P-122. Each call is reversible by the founder. The test applied:
a regulated customer's administrator pays for a console that shows their organisation as it is (people, access,
security, licence, data) and that an auditor can read without finding a figure nobody recorded.

**What was found.** The four P-122 inventories left this area out. The fifth is
`docs/evidence/DESIGN/P-122/inventory/administration.md`: 66 capabilities, of which 23 are hidden, 21 were built on
the server and never reached, 15 are shown but were never recorded (invented), 6 were removed and 1 is reached but
refused. Little was deleted. The losses are reach and truth: the Setup fold put twelve settings cards in one column
under a tab that does not open by default (the company card sat 9,193 px down), and the Administration screen shows
single sign-on status, seats and groups the server never recorded.

1. **The fifth inventory is the work list, in its own order.** `administration-restoration-order.json` beside it lists 30
   restorations, highest value and smallest size first. Each reaches or shows what exists. None builds a screen, a
   route file, a service or a table (RULE 6).
2. **Invented is made true, never removed.** Where a screen shows something the server never recorded (seats, the
   single sign-on status, how a member signs in, groups), the screen reads the server. Where the server records
   nothing, the screen says "Not recorded" in that place. Groups becomes job roles (P-119).
3. **Plan cards keep every line.** Each line says what it is: a term of the plan, or a figure that was measured.
   Nothing is shown as usage that no meter recorded. A line is not taken off a plan card without a founder decision.
4. **Settings is reached by name.** It opens with an index of its cards, and a door elsewhere in the product lands
   on the card it names. No setting is reachable only by scrolling a column.
5. **The organisation's data return is reached in production.** `GET /api/tenant-export/full` and the custody
   record are admitted for Audit & compliance reports, for administrators and owners, with a stated reason and an
   audit row, as the route already requires. The subscription agreement promises the customer its data at any time;
   until now no screen could ask for it.
6. **A control nothing enforces says so.** The sign-in policy keys an organisation can store but the sign-in path
   does not enforce (require an authenticator app, password rules, a sign-in address list) stay on screen and read
   "not enforced in this release". They are never shown as on. Enforcing them is finish-what-exists work, after the
   reach items.
7. **Single sign-on and provisioning are read by the client, and changed by Concept2Cure, for now.** A client
   administrator sees what is configured for their organisation, by whom and when, in the Identity console that
   exists. Changing it stays with platform staff until the security review of the write path is filed. Whether a
   client administrator configures their own identity provider is the founder's call (open question 3 of
   2026-11-10).
8. **Legal holds are placed where the record is.** "Place legal hold" belongs on the record in the Vault, for
   everyone the server already allows. The Vault lane holds that file; this is handed to it, not done beside it.

**Not decided here** (the founder's): which number is the contract seat limit; whether credits and tokens are
metered and enforced at GA; the free plan's limits; the module-enforcement default; closing an organisation and
deleting a person's data on request.

Evidence: `docs/evidence/DESIGN/P-122/inventory/administration.md` and `administration-restoration-order.json`; the walk and audit
behind them, `docs/evidence/F1/2026-11-10-client-admin/`. Each restoration files its before and after beside the
inventory, as the other areas do.
